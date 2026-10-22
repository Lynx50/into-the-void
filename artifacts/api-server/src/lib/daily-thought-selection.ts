import { isBlockedContent } from "./content-safety.ts";

export const DAILY_THOUGHT_ALGORITHM_VERSION = "user-quality-v1";
export const DAILY_THOUGHT_AUTHOR_COOLDOWN_DAYS = 30;
export const DAILY_THOUGHT_SHORTLIST_LIMIT = 30;
export const DAILY_THOUGHT_MIN_AGE_MS = 24 * 60 * 60 * 1000;

export type DailyThoughtCandidate = {
  id: number;
  userId: string;
  content: string;
  moderationStatus: string;
  createdAt: Date;
  feltThisCount: number;
  madeThinkCount: number;
  reportCount: number;
  previouslySelected: boolean;
  authorLastSelectedAt: Date | null;
};

export type DailyThoughtSelectionResult = {
  candidate: DailyThoughtCandidate;
  candidateCount: number;
  shortlistCount: number;
  selectionMode: "standard" | "cooldown_relaxed";
  requesterExcluded: boolean;
};

export type PublicDailyThoughtResponse =
  | { available: true; dateUtc: string; text: string }
  | { available: false; dateUtc: string };

export function buildPublicDailyThoughtResponse(
  selection: { dateUtc: string; text: string; authorUserId: string } | null,
  requestingUserId: string,
  dateUtc: string,
): PublicDailyThoughtResponse {
  if (!selection || selection.authorUserId === requestingUserId) {
    return { available: false, dateUtc };
  }

  return { available: true, dateUtc: selection.dateUtc, text: selection.text };
}

const SEED_USER_ID = "__seed__";
const OBVIOUS_TEST_PATTERN =
  /^(?:test(?:ing)?(?:[\s_-]*\d+)?|hello(?:[\s_-]*test)?|hi|sample|asdf+|qwerty+|zxcv+)$/iu;
const PERSONAL_INFORMATION_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:https?:\/\/|www\.)\S+|(?:^|\s)@[A-Z0-9_]{2,30}\b|\+?\d[\d\s().-]{7,}\d)/iu;

function normalizeForQuality(content: string): string {
  return content
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isDailyThoughtContentEligible(content: string): boolean {
  const trimmed = content.trim();
  const normalized = normalizeForQuality(trimmed);
  const meaningfulCharacters = [...normalized].length;
  const words = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];

  if (meaningfulCharacters < 20 || meaningfulCharacters > 500) return false;
  if (words.length < 3) return false;
  if (OBVIOUS_TEST_PATTERN.test(normalized)) return false;
  if (PERSONAL_INFORMATION_PATTERN.test(trimmed)) return false;
  if (isBlockedContent(trimmed)) return false;
  if (/(.)\1{5,}/u.test(normalized.replace(/\s/gu, ""))) return false;
  if (/(.{2,4})\1{3,}/u.test(normalized.replace(/\s/gu, ""))) return false;
  return true;
}

export function isDailyThoughtCandidateEligible(
  candidate: DailyThoughtCandidate,
  now: Date,
): boolean {
  return (
    candidate.userId !== SEED_USER_ID &&
    candidate.moderationStatus === "active" &&
    candidate.reportCount === 0 &&
    !candidate.previouslySelected &&
    now.getTime() - candidate.createdAt.getTime() >= DAILY_THOUGHT_MIN_AGE_MS &&
    isDailyThoughtContentEligible(candidate.content)
  );
}

export function scoreDailyThoughtCandidate(
  candidate: DailyThoughtCandidate,
  now: Date,
): number {
  const totalReactions = Math.max(
    0,
    candidate.feltThisCount + candidate.madeThinkCount,
  );
  const length = [...normalizeForQuality(candidate.content)].length;
  const ageDays = Math.max(
    1,
    Math.floor(
      (now.getTime() - candidate.createdAt.getTime()) / (24 * 60 * 60 * 1000),
    ),
  );

  const reactionScore = Math.min(totalReactions, 10) * 3;
  const lengthScore = length >= 40 && length <= 240 ? 12 : 5;
  const recencyScore = ageDays <= 30 ? 8 : ageDays <= 180 ? 5 : 3;
  return reactionScore + lengthScore + recencyScore;
}

function authorIsCoolingDown(
  candidate: DailyThoughtCandidate,
  now: Date,
): boolean {
  if (!candidate.authorLastSelectedAt) return false;
  return (
    now.getTime() - candidate.authorLastSelectedAt.getTime() <
    DAILY_THOUGHT_AUTHOR_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
  );
}

export function selectDailyThoughtCandidate(
  candidates: DailyThoughtCandidate[],
  options: {
    now: Date;
    requestingUserId?: string | null;
    random?: () => number;
  },
): DailyThoughtSelectionResult | null {
  const eligible = candidates.filter((candidate) =>
    isDailyThoughtCandidateEligible(candidate, options.now),
  );
  if (eligible.length === 0) return null;

  const alternatives = options.requestingUserId
    ? eligible.filter(
        (candidate) => candidate.userId !== options.requestingUserId,
      )
    : eligible;
  const requesterExcluded = Boolean(
    options.requestingUserId && alternatives.length > 0,
  );
  const requesterSafePool = requesterExcluded ? alternatives : eligible;
  const cooldownPool = requesterSafePool.filter(
    (candidate) => !authorIsCoolingDown(candidate, options.now),
  );
  const selectionMode =
    cooldownPool.length > 0 ? "standard" : "cooldown_relaxed";
  const candidatePool =
    cooldownPool.length > 0 ? cooldownPool : requesterSafePool;

  const shortlist = [...candidatePool]
    .sort(
      (left, right) =>
        scoreDailyThoughtCandidate(right, options.now) -
          scoreDailyThoughtCandidate(left, options.now) || left.id - right.id,
    )
    .slice(0, DAILY_THOUGHT_SHORTLIST_LIMIT);
  const random = options.random ?? Math.random;
  const randomValue = Math.min(0.999999999, Math.max(0, random()));
  const candidate = shortlist[Math.floor(randomValue * shortlist.length)];

  return {
    candidate,
    candidateCount: candidatePool.length,
    shortlistCount: shortlist.length,
    selectionMode,
    requesterExcluded,
  };
}

export function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
