import { useQueryClient } from "@tanstack/react-query";
import {
  useSubmitThought as useGeneratedSubmitThought,
  useReceiveThought as useGeneratedReceiveThought,
  useGetMyThoughts as useGeneratedGetMyThoughts,
  useGetReceiveCount as useGeneratedGetReceiveCount,
  useReactToThought as useGeneratedReactToThought,
  getGetMyThoughtsQueryKey,
  getGetReceiveCountQueryKey,
} from "@workspace/api-client-react";
import { useUser } from "./use-user";

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
