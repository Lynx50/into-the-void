import { useEffect, useState } from "react";
import {
  getStoredAnonymousSession,
  initializeAnonymousSession,
} from "@/lib/api";

type SessionStatus = "loading" | "ready" | "error";

type UseUserState = {
  userId: string;
  isReady: boolean;
  isLoading: boolean;
  sessionError: string | null;
  refreshSession: (force?: boolean) => Promise<void>;
};

let sessionInitializationPromise: Promise<{ userId: string }> | null = null;

function ensureAnonymousSession(force = false) {
  if (!sessionInitializationPromise || force) {
    sessionInitializationPromise = initializeAnonymousSession(force)
      .then((session) => ({ userId: session.userId }))
      .finally(() => {
        sessionInitializationPromise = null;
      });
  }

  return sessionInitializationPromise;
}

export function useUser(): UseUserState {
  const storedSession = getStoredAnonymousSession();
  const [userId, setUserId] = useState<string>(storedSession?.userId ?? "");
  const [status, setStatus] = useState<SessionStatus>(
    storedSession?.userId ? "ready" : "loading",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refreshSession = async (force = false) => {
    setStatus("loading");
    setSessionError(null);

    try {
      const session = await ensureAnonymousSession(force);
      setUserId(session.userId);
      setStatus("ready");
      setSessionError(null);
    } catch (error: any) {
      const fallbackUserId = getStoredAnonymousSession()?.userId ?? "";
      setUserId(fallbackUserId);
      setStatus(fallbackUserId ? "ready" : "error");
      setSessionError(
        error?.message || "Couldn't initialize your anonymous session.",
      );
    }
  };

  useEffect(() => {
    let cancelled = false;

    const startSession = async () => {
      try {
        const session = await ensureAnonymousSession();
        if (cancelled) {
          return;
        }

        setUserId(session.userId);
        setStatus("ready");
        setSessionError(null);
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        const fallbackUserId = getStoredAnonymousSession()?.userId ?? "";
        setUserId(fallbackUserId);
        setStatus(fallbackUserId ? "ready" : "error");
        setSessionError(
          error?.message || "Couldn't initialize your anonymous session.",
        );
      }
    };

    void startSession();

    const handleOnline = () => {
      if (cancelled) {
        return;
      }

      void refreshSession();
    };

    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  return {
    userId,
    isReady: status === "ready" && Boolean(userId),
    isLoading: status === "loading",
    sessionError,
    refreshSession,
  };
}
