import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import {
  apiFetch,
  initializeAnonymousSession,
  warmBackendConnection,
} from "@/lib/api";
import { useUser } from "./use-user";

export { useUser };

const LOCAL_ORBIT_THOUGHTS_KEY = "void_local_orbit_thoughts_v5";
const LEGACY_LOCAL_ORBIT_THOUGHTS_KEYS = [
  "void_local_orbit_thoughts_v4",
  "void_local_orbit_thoughts_v3",
  "void_local_orbit_thoughts_v2",
  "void_local_orbit_thoughts_v1",
  "void_local_orbit_thoughts",
] as const;
const RECEIVE_COUNT_CACHE_KEY = "void_receive_count_cache_v1";
const SEEN_RECEIVED_THOUGHT_IDS_KEY = "void_seen_received_thought_ids";
const GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEY =
  "void_seen_received_thought_ids_global";
const LEGACY_SEEN_RECEIVED_THOUGHT_IDS_KEYS = [
  "void_seen_received_thought_ids_v1",
] as const;
const LEGACY_GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEYS = [
  "void_seen_received_thought_ids_global_v1",
] as const;
const PRELOADED_RECEIVE_THOUGHTS_CACHE_KEY = "void_preloaded_receive_thoughts_v1";
const ORBIT_APPEAR_DELAY_MS = 5000;
const MAX_SEEN_THOUGHT_IDS = 500;
const MAX_PRELOADED_RECEIVE_THOUGHTS = 3;
const RECEIVE_REQUEST_TIMEOUT_MS = 7000;
const PRELOADED_RECEIVE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

type ReceiveCount = {
  count: number;
  limit: number;
  remaining: number;
};

type LocalOrbitThought = {
  id: number | string;
  content: string;
  mood?: string | null;
  feltThisCount: number;
  madeThinkCount: number;
  availableAt: number;
  createdAt?: string | null;
  localCreatedAt?: number;
};

export type OrbitThoughtSnapshot = Omit<LocalOrbitThought, "availableAt">;

type UseMyThoughtsOptions = {
  refetchInterval?: number | false;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  staleTime?: number;
};

type SubmitThoughtPayload = {
  data: {
    userId?: string;
    content: string;
    mood?: string | null;
  };
};

type ReceiveThoughtPayload = {
  data: {
    userId: string;
    excludeThoughtIds?: number[];
  };
};

type ReactToThoughtPayload = {
  id: number | string;
  data: {
    userId: string;
    reactionType?: string;
    type?: string;
  };
};

type ClaimReceivedThoughtPayload = {
  data: {
    userId: string;
    thoughtId: number;
  };
};

export type ReceiveCountData = ReceiveCount;
export type ReceiveThoughtCandidate = {
  id: number;
  content: string;
  mood: string | null;
  feltThisCount: number;
  madeThinkCount: number;
};

type PersistedReceiveCache = {
  updatedAt: number;
  thoughts: ReceiveThoughtCandidate[];
};

const preloadedReceiveThoughtsByUser = new Map<string, ReceiveThoughtCandidate[]>();
const preloadingReceivePromiseByUser = new Map<string, Promise<void>>();

function sanitizeOrbitThought(input: any): LocalOrbitThought | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const content =
    typeof input.content === "string" ? input.content.trim() : "";

  if (!content) {
    return null;
  }

  const id =
    typeof input.id === "number" || typeof input.id === "string"
      ? input.id
      : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const availableAt =
    typeof input.availableAt === "number" && Number.isFinite(input.availableAt)
      ? input.availableAt
      : Date.now();

  const createdAtTimestamp =
    typeof input.createdAt === "string" && input.createdAt
      ? new Date(input.createdAt).getTime()
      : NaN;

  const localCreatedAt =
    typeof input.localCreatedAt === "number" && Number.isFinite(input.localCreatedAt)
      ? input.localCreatedAt
      : Number.isFinite(createdAtTimestamp)
        ? createdAtTimestamp
        : typeof input.availableAt === "number" && Number.isFinite(input.availableAt)
          ? input.availableAt
          : 0;

  return {
    id,
    content,
    mood: typeof input.mood === "string" ? input.mood : input.mood ?? null,
    feltThisCount:
      typeof input.feltThisCount === "number" ? input.feltThisCount : 0,
    madeThinkCount:
      typeof input.madeThinkCount === "number" ? input.madeThinkCount : 0,
    availableAt,
    createdAt: typeof input.createdAt === "string" ? input.createdAt : null,
    localCreatedAt,
  };
}

function dedupeOrbitThoughts(thoughts: LocalOrbitThought[]): LocalOrbitThought[] {
  const merged = new Map<string, LocalOrbitThought>();

  for (const thought of thoughts) {
    const sanitized = sanitizeOrbitThought(thought);
    if (!sanitized) {
      continue;
    }

    const stableTimestamp =
      typeof sanitized.createdAt === "string" && sanitized.createdAt
        ? sanitized.createdAt
        : String(sanitized.localCreatedAt ?? 0);
    const key = `${String(sanitized.id)}::${stableTimestamp}`;
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, sanitized);
      continue;
    }

    merged.set(key, {
      ...existing,
      ...sanitized,
      availableAt: Math.min(existing.availableAt, sanitized.availableAt),
      localCreatedAt: Math.min(
        existing.localCreatedAt ?? Date.now(),
        sanitized.localCreatedAt ?? Date.now(),
      ),
    });
  }

  return [...merged.values()].sort((a, b) => {
    const aTime = a.localCreatedAt ?? 0;
    const bTime = b.localCreatedAt ?? 0;
    return bTime - aTime;
  });
}

function writeLocalOrbitThoughts(thoughts: LocalOrbitThought[]): void {
  try {
    localStorage.setItem(
      LOCAL_ORBIT_THOUGHTS_KEY,
      JSON.stringify(dedupeOrbitThoughts(thoughts)),
    );
  } catch {
    // Local orbit persistence should never crash the app.
  }
}

function getLocalOrbitThoughts(): LocalOrbitThought[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORBIT_THOUGHTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return dedupeOrbitThoughts(Array.isArray(parsed) ? parsed : []);
    }

    for (const legacyKey of LEGACY_LOCAL_ORBIT_THOUGHTS_KEYS) {
      const legacyRaw = localStorage.getItem(legacyKey);
      if (!legacyRaw) {
        continue;
      }

      const parsed = JSON.parse(legacyRaw);
      const migrated = dedupeOrbitThoughts(Array.isArray(parsed) ? parsed : []);
      if (migrated.length > 0) {
        writeLocalOrbitThoughts(migrated);
        return migrated;
      }
    }

    return [];
  } catch {
    return [];
  }
}

export function getImmediateLocalOrbitThoughts(): OrbitThoughtSnapshot[] {
  return getLocalOrbitThoughts().map(({ availableAt: _availableAt, ...thought }) => ({
    ...thought,
  }));
}

function getUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getReceiveCountCacheKey(userId: string): string {
  return `${RECEIVE_COUNT_CACHE_KEY}:${userId}`;
}

function readCachedReceiveCount(userId: string): ReceiveCount | undefined {
  try {
    const raw = localStorage.getItem(getReceiveCountCacheKey(userId));
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw);
    if (
      parsed?.date !== getUtcDateKey() ||
      typeof parsed?.count !== "number" ||
      typeof parsed?.limit !== "number" ||
      typeof parsed?.remaining !== "number"
    ) {
      return undefined;
    }

    return {
      count: parsed.count,
      limit: parsed.limit,
      remaining: parsed.remaining,
    };
  } catch {
    return undefined;
  }
}

function writeCachedReceiveCount(userId: string, data: ReceiveCount): void {
  try {
    localStorage.setItem(
      getReceiveCountCacheKey(userId),
      JSON.stringify({ date: getUtcDateKey(), ...data }),
    );
  } catch {
    // Local persistence is a convenience; server state remains the source of truth.
  }
}

function getSeenThoughtStorageKey(userId: string): string {
  return `${SEEN_RECEIVED_THOUGHT_IDS_KEY}:${userId}`;
}

function getPreloadedReceiveStorageKey(userId: string): string {
  return `${PRELOADED_RECEIVE_THOUGHTS_CACHE_KEY}:${userId}`;
}

function getGlobalSeenReceivedThoughtIds(): number[] {
  try {
    const sources = [
      localStorage.getItem(GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEY),
      ...LEGACY_GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEYS.map((key) =>
        localStorage.getItem(key),
      ),
    ];

    const merged = sources.flatMap((raw) => {
      if (!raw) {
        return [];
      }

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
      } catch {
        return [];
      }
    });

    const stable = [...new Set(merged)].slice(-MAX_SEEN_THOUGHT_IDS);

    if (stable.length > 0) {
      localStorage.setItem(
        GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEY,
        JSON.stringify(stable),
      );
    }

    return stable;
  } catch {
    return [];
  }
}

function getPreloadedReceiveThoughts(userId: string): ReceiveThoughtCandidate[] {
  const existing = preloadedReceiveThoughtsByUser.get(userId);
  if (existing) {
    return existing;
  }

  try {
    const raw = localStorage.getItem(getPreloadedReceiveStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as PersistedReceiveCache;
    if (
      !parsed ||
      typeof parsed.updatedAt !== "number" ||
      !Array.isArray(parsed.thoughts) ||
      Date.now() - parsed.updatedAt > PRELOADED_RECEIVE_CACHE_TTL_MS
    ) {
      localStorage.removeItem(getPreloadedReceiveStorageKey(userId));
      return [];
    }

    const seenIds = new Set(getSeenReceivedThoughtIds(userId));
    const sanitized = parsed.thoughts
      .filter((thought) => thought && Number.isInteger(Number(thought.id)))
      .map((thought) => ({
        id: Number(thought.id),
        content: typeof thought.content === "string" ? thought.content : "",
        mood: thought.mood ?? null,
        feltThisCount:
          typeof thought.feltThisCount === "number" ? thought.feltThisCount : 0,
        madeThinkCount:
          typeof thought.madeThinkCount === "number" ? thought.madeThinkCount : 0,
      }))
      .filter((thought) => thought.content.trim().length > 0 && !seenIds.has(thought.id))
      .slice(0, MAX_PRELOADED_RECEIVE_THOUGHTS);

    preloadedReceiveThoughtsByUser.set(userId, sanitized);
    return sanitized;
  } catch {
    return [];
  }
}

function setPreloadedReceiveThoughts(
  userId: string,
  thoughts: ReceiveThoughtCandidate[],
): void {
  const deduped = thoughts
    .filter((thought, index, all) => all.findIndex((entry) => entry.id === thought.id) === index)
    .slice(0, MAX_PRELOADED_RECEIVE_THOUGHTS);

  preloadedReceiveThoughtsByUser.set(userId, deduped);

  try {
    const payload: PersistedReceiveCache = {
      updatedAt: Date.now(),
      thoughts: deduped,
    };
    localStorage.setItem(getPreloadedReceiveStorageKey(userId), JSON.stringify(payload));
  } catch {
    // Preload persistence is best-effort only.
  }
}

function getSeenReceivedThoughtIds(userId: string): number[] {
  try {
    const userStorageKey = getSeenThoughtStorageKey(userId);
    const sources = [
      localStorage.getItem(userStorageKey),
      ...LEGACY_SEEN_RECEIVED_THOUGHT_IDS_KEYS.map((key) =>
        localStorage.getItem(`${key}:${userId}`),
      ),
    ];

    const userSeen = sources.flatMap((raw) => {
      if (!raw) {
        return [];
      }

      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
      } catch {
        return [];
      }
    });

    const stable = [
      ...new Set([...getGlobalSeenReceivedThoughtIds(), ...userSeen]),
    ].slice(-MAX_SEEN_THOUGHT_IDS);

    if (stable.length > 0) {
      localStorage.setItem(userStorageKey, JSON.stringify(stable));
    }

    return stable;
  } catch {
    return getGlobalSeenReceivedThoughtIds();
  }
}

function markThoughtAsSeen(userId: string, thoughtId: unknown): void {
  const id = Number(thoughtId);
  if (!Number.isInteger(id) || id <= 0) {
    return;
  }

  const existing = getSeenReceivedThoughtIds(userId).filter(
    (seenId) => seenId !== id,
  );
  const next = [...existing, id].slice(-MAX_SEEN_THOUGHT_IDS);

  try {
    localStorage.setItem(getSeenThoughtStorageKey(userId), JSON.stringify(next));
    localStorage.setItem(
      GLOBAL_SEEN_RECEIVED_THOUGHT_IDS_KEY,
      JSON.stringify(next),
    );
  } catch {
    // If storage is full/unavailable, backend receive history still protects users.
  }
}

export function markReceivedThoughtAsShown(
  userId: string,
  thoughtId: unknown,
): void {
  markThoughtAsSeen(userId, thoughtId);

  const numericThoughtId = Number(thoughtId);
  if (!Number.isInteger(numericThoughtId) || numericThoughtId <= 0) {
    return;
  }

  const remainingCached = getPreloadedReceiveThoughts(userId).filter(
    (thought) => thought.id !== numericThoughtId,
  );
  setPreloadedReceiveThoughts(userId, remainingCached);
}

export function popPreloadedReceiveThought(
  userId: string,
): ReceiveThoughtCandidate | null {
  const existing = getPreloadedReceiveThoughts(userId);
  if (existing.length === 0) {
    return null;
  }

  const [nextThought, ...remainingThoughts] = existing;
  setPreloadedReceiveThoughts(userId, remainingThoughts);
  return nextThought;
}

export function restorePreloadedReceiveThought(
  userId: string,
  thought: ReceiveThoughtCandidate,
): void {
  const existing = getPreloadedReceiveThoughts(userId).filter(
    (entry) => entry.id !== thought.id,
  );
  setPreloadedReceiveThoughts(userId, [thought, ...existing]);
}

function buildReceiveExclusionIds(
  userId: string,
  extraThoughtIds: number[] = [],
): number[] {
  return [
    ...new Set([
      ...getSeenReceivedThoughtIds(userId),
      ...getPreloadedReceiveThoughts(userId).map((thought) => thought.id),
      ...extraThoughtIds,
    ]),
  ];
}

async function fetchReceivePreview(
  userId: string,
  excludeThoughtIds: number[],
): Promise<ReceiveThoughtCandidate> {
  return apiFetch<ReceiveThoughtCandidate>(
    "/thoughts/receive-preview",
    {
      method: "POST",
      body: JSON.stringify({ userId, excludeThoughtIds }),
    },
    { timeoutMs: RECEIVE_REQUEST_TIMEOUT_MS },
  );
}

export async function preloadReceiveThoughts(
  userId?: string,
  targetSize = MAX_PRELOADED_RECEIVE_THOUGHTS,
): Promise<string> {
  const activeUserId = userId || (await initializeAnonymousSession(false)).userId;
  const existingPromise = preloadingReceivePromiseByUser.get(activeUserId);

  if (existingPromise) {
    await existingPromise;
    return activeUserId;
  }

  const preloadPromise = (async () => {
    const currentCache = getPreloadedReceiveThoughts(activeUserId);

    if (currentCache.length >= targetSize) {
      return;
    }

    const workingCache = [...currentCache];
    let attempts = 0;

    while (
      workingCache.length < targetSize &&
      attempts < targetSize + 2
    ) {
      attempts += 1;

      try {
        const thought = await fetchReceivePreview(
          activeUserId,
          buildReceiveExclusionIds(
            activeUserId,
            workingCache.map((entry) => entry.id),
          ),
        );

        const duplicate = workingCache.some((entry) => entry.id === thought.id);
        if (!duplicate) {
          workingCache.push(thought);
        }
      } catch (error: any) {
        if (
          error?.status === 404 ||
          error?.status === 403 ||
          error?.status === 429 ||
          error?.status === 401 ||
          error?.status === 0 ||
          error?.status === 408
        ) {
          break;
        }

        break;
      }
    }

    setPreloadedReceiveThoughts(activeUserId, workingCache);
  })().finally(() => {
    preloadingReceivePromiseByUser.delete(activeUserId);
  });

  preloadingReceivePromiseByUser.set(activeUserId, preloadPromise);
  await preloadPromise;
  return activeUserId;
}

export function saveThoughtToOrbitAfterRelease(
  thought: Omit<LocalOrbitThought, "availableAt">,
): void {
  const existing = getLocalOrbitThoughts();

  const newThought: LocalOrbitThought = {
    ...thought,
    availableAt: Date.now() + ORBIT_APPEAR_DELAY_MS,
    localCreatedAt: thought.localCreatedAt ?? Date.now(),
    createdAt: thought.createdAt ?? null,
  };

  writeLocalOrbitThoughts([newThought, ...existing]);
}

export function reconcileOrbitThoughtAfterRelease(
  optimisticId: number | string,
  thought: Partial<Omit<LocalOrbitThought, "availableAt">>,
): void {
  const existing = getLocalOrbitThoughts();
  const nextThoughts = existing.map((entry) => {
    if (String(entry.id) !== String(optimisticId)) {
      return entry;
    }

    return {
      ...entry,
      ...thought,
      id: thought.id ?? entry.id,
      content: thought.content ?? entry.content,
      mood: thought.mood ?? entry.mood ?? null,
      feltThisCount: thought.feltThisCount ?? entry.feltThisCount,
      madeThinkCount: thought.madeThinkCount ?? entry.madeThinkCount,
      createdAt: thought.createdAt ?? entry.createdAt ?? null,
      localCreatedAt: entry.localCreatedAt ?? Date.now(),
    };
  });

  writeLocalOrbitThoughts(nextThoughts);
}

export function removeLocalOrbitThought(thoughtId: number | string): void {
  const existing = getLocalOrbitThoughts();
  writeLocalOrbitThoughts(
    existing.filter((entry) => String(entry.id) !== String(thoughtId)),
  );
}

function getVisibleLocalOrbitThoughts(): LocalOrbitThought[] {
  const now = Date.now();
  return getLocalOrbitThoughts().filter(
    (thought) => thought.availableAt <= now,
  );
}

function getPendingLocalOrbitThoughts(): LocalOrbitThought[] {
  const now = Date.now();
  return getLocalOrbitThoughts().filter(
    (thought) => thought.availableAt > now,
  );
}

export function getOrbitLocalDebugCounts(): {
  rawCount: number;
  visibleCount: number;
  pendingCount: number;
} {
  const rawThoughts = getLocalOrbitThoughts();
  const now = Date.now();

  return {
    rawCount: rawThoughts.length,
    visibleCount: rawThoughts.filter((thought) => thought.availableAt <= now).length,
    pendingCount: rawThoughts.filter((thought) => thought.availableAt > now).length,
  };
}

function getThoughtTimestamp(
  thought: { createdAt?: string | null; localCreatedAt?: number },
): number | null {
  if (typeof thought.localCreatedAt === "number" && Number.isFinite(thought.localCreatedAt)) {
    return thought.localCreatedAt;
  }

  if (typeof thought.createdAt === "string" && thought.createdAt) {
    const timestamp = new Date(thought.createdAt).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  return null;
}

function sameThoughtIdentity(
  a: {
    id?: number | string;
    content?: string;
    mood?: string | null;
    createdAt?: string | null;
    localCreatedAt?: number;
  },
  b: {
    id?: number | string;
    content?: string;
    mood?: string | null;
    createdAt?: string | null;
    localCreatedAt?: number;
  },
) {
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) {
    return true;
  }

  if (
    (a.content ?? "").trim() !== (b.content ?? "").trim() ||
    (a.mood ?? null) !== (b.mood ?? null)
  ) {
    return false;
  }

  const aTimestamp = getThoughtTimestamp(a);
  const bTimestamp = getThoughtTimestamp(b);

  if (aTimestamp == null || bTimestamp == null) {
    return false;
  }

  return Math.abs(aTimestamp - bTimestamp) <= 2 * 60 * 1000;
}

function filterOutPendingServerThoughts(
  serverThoughts: any[],
  pendingLocalThoughts: LocalOrbitThought[],
) {
  return serverThoughts.filter((serverThought: any) => {
    return !pendingLocalThoughts.some((pendingThought) =>
      sameThoughtIdentity(serverThought, pendingThought),
    );
  });
}

function mergeThoughts(serverThoughts: any[], localThoughts: LocalOrbitThought[]) {
  const combined = [...serverThoughts];

  for (const localThought of localThoughts) {
    const exists = combined.some((serverThought: any) =>
      sameThoughtIdentity(serverThought, localThought),
    );

    if (!exists) {
      combined.push(localThought);
    }
  }

  return combined;
}

export function useMyThoughts(options?: UseMyThoughtsOptions) {
  const { userId, isReady } = useUser();

  const query = useQuery({
    queryKey: ["my-thoughts", userId],
    enabled: isReady && Boolean(userId),
    staleTime: options?.staleTime ?? 0,
    refetchOnMount: options?.refetchOnMount ?? true,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
    refetchOnReconnect: options?.refetchOnReconnect ?? true,
    refetchInterval: options?.refetchInterval ?? 2000,
    queryFn: async () => {
      if (!userId) {
        return [];
      }

      return apiFetch<any[]>(`/thoughts/my?userId=${encodeURIComponent(userId)}`);
    },
  });

  const rawServerThoughts = Array.isArray(query.data) ? query.data : [];
  const pendingLocalThoughts = getPendingLocalOrbitThoughts();
  const visibleLocalThoughts = getVisibleLocalOrbitThoughts();

  const filteredServerThoughts = filterOutPendingServerThoughts(
    rawServerThoughts,
    pendingLocalThoughts,
  );

  const mergedThoughts = mergeThoughts(
    filteredServerThoughts,
    visibleLocalThoughts,
  );

  return {
    ...query,
    data: mergedThoughts,
  };
}

export function useReceiveCount() {
  const { userId, isReady } = useUser();

  return useQuery({
    queryKey: ["receive-count", userId],
    enabled: isReady && Boolean(userId),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    initialData: () => (userId ? readCachedReceiveCount(userId) : undefined),
    queryFn: async () => {
      if (!userId) {
        return { count: 0, limit: 3, remaining: 3 };
      }

      const data = await apiFetch<ReceiveCount>(
        `/thoughts/receive-count?userId=${encodeURIComponent(userId)}`,
      );

      writeCachedReceiveCount(userId, data);
      return data;
    },
  });
}

export function useSubmitThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();

  return useMutation({
    mutationFn: async ({ data }: SubmitThoughtPayload) => {
      const resolvedUserId =
        data.userId || (await initializeAnonymousSession(false)).userId;

      return apiFetch<any>("/thoughts", {
        method: "POST",
        body: JSON.stringify({ ...data, userId: resolvedUserId }),
      });
    },
    onSuccess: async (_data, variables) => {
      await trackEvent("thought_released", {
        has_mood: Boolean(variables?.data?.mood),
      });

      await queryClient.invalidateQueries({
        queryKey: ["my-thoughts", userId],
      });

      await queryClient.invalidateQueries({
        queryKey: ["receive-count", userId],
      });

      await queryClient.refetchQueries({
        queryKey: ["my-thoughts", userId],
      });
    },
  });
}

export function useReceiveThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();

  return useMutation({
    mutationFn: async ({ data }: ReceiveThoughtPayload) => {
      const excludeThoughtIds = [
        ...new Set([
          ...(data.excludeThoughtIds ?? []),
          ...getSeenReceivedThoughtIds(data.userId),
        ]),
      ];

      return apiFetch<any>("/thoughts/receive", {
        method: "POST",
        body: JSON.stringify({ ...data, excludeThoughtIds }),
      }, {
        timeoutMs: RECEIVE_REQUEST_TIMEOUT_MS,
      });
    },
    onSuccess: async (thought, variables) => {
      const currentUserId = variables.data.userId || userId;

      if (currentUserId) {
        markThoughtAsSeen(currentUserId, thought.id);

        queryClient.setQueryData<ReceiveCount>(
          ["receive-count", currentUserId],
          (current) => {
            const previous =
              current ?? readCachedReceiveCount(currentUserId) ?? {
                count: 0,
                limit: 3,
                remaining: 3,
              };
            const next = {
              ...previous,
              count: Math.min(previous.limit, previous.count + 1),
              remaining: Math.max(0, previous.remaining - 1),
            };

            writeCachedReceiveCount(currentUserId, next);
            return next;
          },
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ["receive-count", currentUserId],
      });

      await trackEvent("thought_received", {
        source: typeof thought.id === "number" ? "server" : "unknown",
        has_mood: Boolean(thought.mood),
      });
    },
  });
}

export function useClaimReceivedThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();

  return useMutation({
    mutationFn: async ({ data }: ClaimReceivedThoughtPayload) => {
      return apiFetch<ReceiveThoughtCandidate>(
        "/thoughts/receive-claim",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
        {
          timeoutMs: RECEIVE_REQUEST_TIMEOUT_MS,
        },
      );
    },
    onSuccess: async (thought, variables) => {
      const currentUserId = variables.data.userId || userId;

      if (currentUserId) {
        markThoughtAsSeen(currentUserId, thought.id);

        queryClient.setQueryData<ReceiveCount>(
          ["receive-count", currentUserId],
          (current) => {
            const previous =
              current ?? readCachedReceiveCount(currentUserId) ?? {
                count: 0,
                limit: 3,
                remaining: 3,
              };
            const next = {
              ...previous,
              count: Math.min(previous.limit, previous.count + 1),
              remaining: Math.max(0, previous.remaining - 1),
            };

            writeCachedReceiveCount(currentUserId, next);
            return next;
          },
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ["receive-count", currentUserId],
      });

      await trackEvent("thought_received", {
        source: "preloaded",
        has_mood: Boolean(thought.mood),
      });
    },
  });
}

export function useReactToThought() {
  return useMutation({
    mutationFn: async ({ id, data }: ReactToThoughtPayload) => {
      return apiFetch<any>(`/thoughts/${id}/react`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: async (_data, variables) => {
      const reactionType =
        variables?.data?.reactionType ?? variables?.data?.type ?? "unknown";

      await trackEvent("thought_reaction", {
        type: String(reactionType),
      });
    },
  });
}

export async function prewarmReceiveExperience(userId?: string): Promise<string> {
  const activeUserId = userId || (await initializeAnonymousSession(false)).userId;

  await Promise.allSettled([
    warmBackendConnection(),
    apiFetch<ReceiveCountData>(
      `/thoughts/receive-count?userId=${encodeURIComponent(activeUserId)}`,
    ),
    apiFetch<any[]>(`/thoughts/my?userId=${encodeURIComponent(activeUserId)}`),
    preloadReceiveThoughts(activeUserId),
  ]);

  return activeUserId;
}

export async function prewarmOrbitExperience(userId?: string): Promise<string> {
  const activeUserId = userId || (await initializeAnonymousSession(false)).userId;

  await Promise.allSettled([
    warmBackendConnection(),
    apiFetch<any[]>(`/thoughts/my?userId=${encodeURIComponent(activeUserId)}`),
  ]);

  return activeUserId;
}
