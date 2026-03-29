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
import { getRandomSeedThought } from "@/data/seedThoughts";

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
          // 404 means the server has no eligible thoughts — serve a local fallback.
          // All other errors (403 no submission yet, 429 daily limit, etc.) re-throw
          // so existing error handling in the UI continues to work normally.
          if ((err as { status?: number })?.status === 404) {
            return getRandomSeedThought();
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
