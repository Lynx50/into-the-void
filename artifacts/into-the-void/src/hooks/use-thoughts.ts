import { useQueryClient } from "@tanstack/react-query";
import {
  useSubmitThought as useGeneratedSubmitThought,
  useReceiveThought as useGeneratedReceiveThought,
  useGetMyThoughts as useGeneratedGetMyThoughts,
  useGetReceiveCount as useGeneratedGetReceiveCount,
  useReactToThought as useGeneratedReactToThought,
  receiveThought,
  getGetMyThoughtsQueryKey,
  getGetReceiveCountQueryKey,
} from "@workspace/api-client-react";
import { useUser } from "./use-user";
import { seedThoughts } from "@/data/seedThoughts";

export { useUser };

export function useMyThoughts() {
  const { userId, isReady } = useUser();
  return useGeneratedGetMyThoughts(
    { userId },
    { query: { enabled: isReady, staleTime: 1000 * 60 } }
  );
}

export function useReceiveCount() {
  const { userId, isReady } = useUser();
  return useGeneratedGetReceiveCount(
    { userId },
    { query: { enabled: isReady } }
  );
}

export function useSubmitThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();
  
  return useGeneratedSubmitThought({
    mutation: {
      onSuccess: () => {
        if (userId) {
          queryClient.invalidateQueries({ queryKey: getGetMyThoughtsQueryKey({ userId }) });
        }
      },
    }
  });
}

const SEEN_THOUGHT_IDS_KEY = "void_seen_thought_ids";

function getSeenIds(): number[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_THOUGHT_IDS_KEY) ?? "[]") as number[];
  } catch {
    return [];
  }
}

function recordSeenId(id: number): void {
  const seen = getSeenIds();
  if (!seen.includes(id)) {
    localStorage.setItem(SEEN_THOUGHT_IDS_KEY, JSON.stringify([...seen, id]));
  }
}

export function useReceiveThought() {
  const queryClient = useQueryClient();
  const { userId } = useUser();

  return useGeneratedReceiveThought({
    mutation: {
      mutationFn: async ({ data }: { data: { userId: string } }) => {
        try {
          return await receiveThought(data);
        } catch (err) {
          // 404 means the server has no unseen DB thoughts for this user.
          // Try unseen local seed thoughts as a fallback.
          // All other errors (403, 429, network) re-throw so the UI handles them.
          if ((err as { status?: number })?.status === 404) {
            const seenIds = getSeenIds();
            const unseen = seedThoughts.filter((t) => !seenIds.includes(t.id));
            if (unseen.length === 0) {
              // Every seed thought has also been seen — show the graceful message.
              throw err;
            }
            return unseen[Math.floor(Math.random() * unseen.length)];
          }
          throw err;
        }
      },
      onSuccess: (thought) => {
        // Record the delivered thought ID immediately so it is never shown again.
        recordSeenId(thought.id);
        if (userId) {
          queryClient.invalidateQueries({ queryKey: getGetReceiveCountQueryKey({ userId }) });
        }
      },
    }
  });
}

export function useReactToThought() {
  // We don't necessarily need to invalidate a specific list here if the reaction 
  // is just shown optimistically or updated on the received bubble, but we can 
  // invalidate my thoughts just in case they reacted to their own somehow (unlikely).
  return useGeneratedReactToThought();
}
