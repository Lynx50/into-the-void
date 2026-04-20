const API_TIMEOUT_MS = 10000;
const USER_ID_KEY = "void_user_id";
const SESSION_TOKEN_KEY = "void_session_token";
const SESSION_HEADER = "x-void-session";

function normalizeApiBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function getDefaultApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https" : "http";
    const hostname = window.location.hostname || "localhost";
    return `${protocol}://${hostname}:3001/api`;
  }

  return "http://localhost:3001/api";
}

export const API_BASE_URL =
  normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL) ??
  getDefaultApiBaseUrl();

export type AnonymousSession = {
  userId: string;
  sessionToken: string;
};

let sessionInitializationPromise: Promise<AnonymousSession> | null = null;

function getStoredUserId(): string | null {
  try {
    const userId = localStorage.getItem(USER_ID_KEY);
    return userId && userId.trim() ? userId.trim() : null;
  } catch {
    return null;
  }
}

export function getStoredAnonymousSession(): AnonymousSession | null {
  try {
    const userId = getStoredUserId();
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY);

    if (!userId || !sessionToken) {
      return null;
    }

    return { userId, sessionToken };
  } catch {
    return null;
  }
}

export function storeAnonymousSession(session: AnonymousSession): void {
  localStorage.setItem(USER_ID_KEY, session.userId);
  localStorage.setItem(SESSION_TOKEN_KEY, session.sessionToken);
}

export function clearAnonymousSession(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(SESSION_TOKEN_KEY);
}

function buildTimeoutError(): {
  status: number;
  message: string;
  body: { error: string };
} {
  return {
    status: 408,
    message: "The request took too long. Check that the API server is running.",
    body: {
      error: "The request took too long. Check that the API server is running.",
    },
  };
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { skipSession?: boolean },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const headers = new Headers(init?.headers ?? {});
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (!options?.skipSession) {
      const session = getStoredAnonymousSession();
      if (session?.sessionToken && !headers.has(SESSION_HEADER)) {
        headers.set(SESSION_HEADER, session.sessionToken);
      }
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    let body: any = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      if (response.status === 401 && !options?.skipSession) {
        clearAnonymousSession();
      }

      throw {
        status: response.status,
        message:
          body?.message ||
          body?.error ||
          `Request failed with status ${response.status}`,
        body,
      };
    }

    return body as T;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw buildTimeoutError();
    }

    if (error?.status) {
      throw error;
    }

    throw {
      status: 0,
      message:
        "Unable to reach the API server. Check your phone, Wi-Fi, and backend.",
      body: {
        error:
          "Unable to reach the API server. Check your phone, Wi-Fi, and backend.",
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function requestAnonymousSession(): Promise<AnonymousSession> {
  const storedUserId = getStoredUserId();
  const body = storedUserId ? { userId: storedUserId } : {};

  const session = await apiFetch<AnonymousSession>(
    "/session",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    { skipSession: true },
  );

  storeAnonymousSession(session);
  return session;
}

export async function initializeAnonymousSession(
  force = false,
): Promise<AnonymousSession> {
  if (force) {
    clearAnonymousSession();
  } else {
    const existingSession = getStoredAnonymousSession();
    if (existingSession) {
      return existingSession;
    }
  }

  if (!sessionInitializationPromise || force) {
    sessionInitializationPromise = requestAnonymousSession().finally(() => {
      sessionInitializationPromise = null;
    });
  }

  return sessionInitializationPromise;
}
