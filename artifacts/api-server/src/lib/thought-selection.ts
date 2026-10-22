export const RECENT_THOUGHT_WINDOW_DAYS = 90;
export const RECENT_POOL_WEIGHT = 0.6;
export const SEED_USER_ID = "__seed__";

export type ThoughtSource = "user" | "seed";
export type ThoughtModerationStatus =
  | "active"
  | "quarantined"
  | "rejected"
  | "deleted";

export type SelectionCandidate = {
  id: number;
  userId: string;
  content: string;
  createdAt: Date;
  moderationStatus: ThoughtModerationStatus;
  reported?: boolean;
};

const NON_CONTENT_PATTERN =
  /^(?:test(?:ing)?(?:[\s_-]*\d+)?|hello(?:[\s_-]*test)?|hi|sample|asdf+|qwerty+|zxcv+)$/i;

export function isSelectionContentEligible(content: string): boolean {
  const normalized = content.trim();
  return normalized.length > 0 && !NON_CONTENT_PATTERN.test(normalized);
}

export function classifyThoughtSource(userId: string): ThoughtSource {
  return userId === SEED_USER_ID ? "seed" : "user";
}

export function isSelectionCandidateEligible(
  candidate: SelectionCandidate,
  userId: string,
  seenThoughtIds: ReadonlySet<number>,
): boolean {
  return (
    candidate.moderationStatus === "active" &&
    candidate.userId !== userId &&
    candidate.userId !== SEED_USER_ID &&
    !candidate.reported &&
    isSelectionContentEligible(candidate.content) &&
    !seenThoughtIds.has(candidate.id)
  );
}

export function isFallbackSeedEligible(
  candidate: SelectionCandidate,
  seenThoughtIds: ReadonlySet<number>,
): boolean {
  return (
    candidate.moderationStatus === "active" &&
    candidate.userId === SEED_USER_ID &&
    !candidate.reported &&
    isSelectionContentEligible(candidate.content) &&
    !seenThoughtIds.has(candidate.id)
  );
}

export function selectWeightedCandidate<T>(
  recent: readonly T[],
  established: readonly T[],
  random: () => number = Math.random,
): T | undefined {
  if (recent.length === 0 && established.length === 0) return undefined;
  if (recent.length === 0) {
    return established[Math.floor(random() * established.length)];
  }
  if (established.length === 0) {
    return recent[Math.floor(random() * recent.length)];
  }

  const pool = random() < RECENT_POOL_WEIGHT ? recent : established;
  return pool[Math.floor(random() * pool.length)];
}

export function selectReceiveCandidate<T>(
  recentUserThoughts: readonly T[],
  establishedUserThoughts: readonly T[],
  fallbackSeeds: readonly T[],
  random: () => number = Math.random,
): { candidate: T; source: ThoughtSource } | undefined {
  const userThought = selectWeightedCandidate(
    recentUserThoughts,
    establishedUserThoughts,
    random,
  );
  if (userThought !== undefined) {
    return { candidate: userThought, source: "user" };
  }

  if (fallbackSeeds.length === 0) return undefined;
  return {
    candidate: fallbackSeeds[Math.floor(random() * fallbackSeeds.length)],
    source: "seed",
  };
}

export function recentCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - RECENT_THOUGHT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
}
