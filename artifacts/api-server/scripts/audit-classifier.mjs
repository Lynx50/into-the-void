export const AUTO_QUARANTINE = "AUTO-QUARANTINE";
export const MANUAL_REVIEW = "MANUAL REVIEW";
export const KEEP = "KEEP";

const PLACEHOLDER_PATTERN =
  /^(?:test(?:ing)?(?:[\s_-]*\d+)?|hello(?:[\s_-]*test)?|hi|sample|asdf+|qwerty+|zxcv+)$/iu;
const PII_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:https?:\/\/|www\.)\S+|(?:^|\s)@[A-Z0-9_]{2,30}\b|\+?\d[\d\s().-]{7,}\d)/iu;
const SHORT_MEANINGFUL_WORDS = new Set([
  "sad",
  "mad",
  "lost",
  "tired",
  "alone",
  "help",
  "love",
  "hope",
  "empty",
  "scared",
]);

export function normalizeContent(content) {
  return String(content ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isEmojiOnly(content) {
  const value = String(content ?? "").trim();
  return (
    value.length > 0 &&
    /\p{Extended_Pictographic}/u.test(value) &&
    !/[\p{L}\p{N}]/u.test(value)
  );
}

export function looksLikeGibberish(normalized) {
  if (!normalized || normalized.length < 5) return false;
  const compact = normalized.replace(/\s/gu, "");
  if (/^(.)\1{4,}$/u.test(compact)) return true;
  if (
    /^[a-z]+$/iu.test(compact) &&
    !/[aeiouy]/iu.test(compact) &&
    compact.length >= 7
  ) {
    return true;
  }
  return /(?:asdf|qwer|zxcv|hjkl){2,}/iu.test(compact);
}

export function isUnclearShortThought(normalized) {
  if (!normalized) return false;
  const words = normalized.split(" ");
  if (words.length > 1 || [...normalized].length > 4) return false;
  return !SHORT_MEANINGFUL_WORDS.has(normalized);
}

export function classifyContent(content) {
  const normalized = normalizeContent(content);
  const reasons = [];
  let classification = KEEP;

  if (isEmojiOnly(content)) {
    classification = MANUAL_REVIEW;
    reasons.push("emoji-only");
  } else if (!normalized) {
    classification = AUTO_QUARANTINE;
    reasons.push("blank");
  } else if (PLACEHOLDER_PATTERN.test(normalized)) {
    classification = AUTO_QUARANTINE;
    reasons.push("obvious-test-placeholder");
  } else if (looksLikeGibberish(normalized)) {
    classification = AUTO_QUARANTINE;
    reasons.push("high-confidence-gibberish");
  }

  if (isUnclearShortThought(normalized)) {
    reasons.push("extremely-short-unclear");
    if (classification === KEEP) classification = MANUAL_REVIEW;
  }

  if (PII_PATTERN.test(String(content ?? ""))) {
    reasons.push("possible-personal-information");
    if (classification === KEEP) classification = MANUAL_REVIEW;
  }

  return { classification, normalized, reasons };
}
