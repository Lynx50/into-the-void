import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import { apiFetch, initializeAnonymousSession } from "@/lib/api";
import { useUser } from "./use-user";

export { useUser };

const LOCAL_ORBIT_THOUGHTS_KEY = "void_local_orbit_thoughts_v4";
const RECEIVE_COUNT_CACHE_KEY = "void_receive_count_cache_v1";
const SEEN_RECEIVED_THOUGHT_IDS_KEY = "void_seen_received_thought_ids_v1";
const ORBIT_APPEAR_DELAY_MS = 5000;
const MAX_SEEN_THOUGHT_IDS = 500;
const MAX_PRELOADED_RECEIVE_THOUGHTS = 3;
const RECEIVE_REQUEST_TIMEOUT_MS = 5000;

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

const preloadedReceiveThoughtsByUser = new Map<string, ReceiveThoughtCandidate[]>();
const preloadingReceivePromiseByUser = new Map<string, Promise<void>>();

function getLocalOrbitThoughts(): LocalOrbitThought[] {
  try {
    const raw = localStorage.getItem(LOCAL_ORBIT_THOUGHTS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

function getPreloadedReceiveThoughts(userId: string): ReceiveThoughtCandidate[] {
  return preloadedReceiveThoughtsByUser.get(userId) ?? [];
}

function setPreloadedReceiveThoughts(
  userId: string,
  thoughts: ReceiveThoughtCandidate[],
): void {
  preloadedReceiveThoughtsByUser.set(
    userId,
    thoughts.slice(0, MAX_PRELOADED_RECEIVE_THOUGHTS),
  );
}

function getSeenReceivedThoughtIds(userId: string): number[] {
  try {
    const raw = localStorage.getItem(getSeenThoughtStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(-MAX_SEEN_THOUGHT_IDS);
  } catch {
    return [];
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

  const alreadyExists = existing.some(
    (entry) =>
      entry.content === thought.content &&
      (entry.mood ?? null) === (thought.mood ?? null),
  );

  if (alreadyExists) {
    return;
  }

  const newThought: LocalOrbitThought = {
    ...thought,
    availableAt: Date.now() + ORBIT_APPEAR_DELAY_MS,
  };

  localStorage.setItem(
    LOCAL_ORBIT_THOUGHTS_KEY,
    JSON.stringify([newThought, ...existing]),
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

function sameThought(
  a: { content?: string; mood?: string | null },
  b: { content?: string; mood?: string | null },
) {
  return (
    (a.content ?? "").trim() === (b.content ?? "").trim() &&
    (a.mood ?? null) === (b.mood ?? null)
  );
}

function filterOutPendingServerThoughts(
  serverThoughts: any[],
  pendingLocalThoughts: LocalOrbitThought[],
) {
  return serverThoughts.filter((serverThought: any) => {
    return !pendingLocalThoughts.some((pendingThought) =>
      sameThought(serverThought, pendingThought),
    );
  });
}

function mergeThoughts(serverThoughts: any[], localThoughts: LocalOrbitThought[]) {
  const combined = [...serverThoughts];

  for (const localThought of localThoughts) {
    const exists = combined.some((serverThought: any) =>
      sameThought(serverThought, localThought),
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
    apiFetch<any[]>(`/thoughts/my?userId=${encodeURIComponent(activeUserId)}`),
  ]);

  return activeUserId;
}
