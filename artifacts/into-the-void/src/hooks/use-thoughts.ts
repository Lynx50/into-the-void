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
          // Try the local seed fallback, honouring the same "never repeat" rule
          // via a localStorage set of already-shown seed IDs.
          // All other errors (403, 429, network) re-throw so the UI handles them.
          if ((err as { status?: number })?.status === 404) {
            const SEEN_KEY = "void_seen_seed_ids";
            const raw = localStorage.getItem(SEEN_KEY);
            const seenIds: number[] = raw ? (JSON.parse(raw) as number[]) : [];

            const unseen = seedThoughts.filter((t) => !seenIds.includes(t.id));
            if (unseen.length === 0) {
              // All seed thoughts exhausted — surface the 404 so the UI shows
              // the graceful "no new thoughts" message.
              throw err;
            }

            const pick = unseen[Math.floor(Math.random() * unseen.length)];
            localStorage.setItem(SEEN_KEY, JSON.stringify([...seenIds, pick.id]));
            return pick;
          }
          throw err;
        }
      },
      onSuccess: () => {
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
