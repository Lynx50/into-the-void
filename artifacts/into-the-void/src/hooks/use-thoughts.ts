import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { trackEvent } from "@/lib/analytics";
import { apiFetch } from "@/lib/api";
import { useUser } from "./use-user";

export { useUser };

const LOCAL_ORBIT_THOUGHTS_KEY = "void_local_orbit_thoughts_v4";
const ORBIT_APPEAR_DELAY_MS = 5000;

type LocalOrbitThought = {
  id: number | string;
  content: string;
  mood?: string | null;
  feltThisCount: number;
  madeThinkCount: number;
  availableAt: number;
};

type UseMyThoughtsOptions = {
  refetchInterval?: number | false;
  refetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  refetchOnReconnect?: boolean;
  staleTime?: number;
};

type SubmitThoughtPayload = {
  data: {
    userId: string;
    content: string;
    mood?: string | null;
  };
};

type ReceiveThoughtPayload = {
  data: {
    userId: string;
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
    staleTime: 30000,
    queryFn: async () => {
      if (!userId) {
        return { count: 0, limit: 3, remaining: 3 };
      }

      return apiFetch<{ count: number; limit: number; remaining: number }>(
        `/thoughts/receive-count?userId=${encodeURIComponent(userId)}`,
      );
    },
  });
}

export function useSubmitThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();

  return useMutation({
    mutationFn: async ({ data }: SubmitThoughtPayload) => {
      return apiFetch<any>("/thoughts", {
        method: "POST",
        body: JSON.stringify(data),
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
      return apiFetch<any>("/thoughts/receive", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: async (thought) => {
      await queryClient.invalidateQueries({
        queryKey: ["receive-count", userId],
      });

      await trackEvent("thought_received", {
        source: typeof thought.id === "number" ? "server" : "unknown",
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
