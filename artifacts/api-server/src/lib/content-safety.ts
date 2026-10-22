const BLOCKED_PHRASES = [
  "kill myself",
  "killing myself",
  "end my life",
  "end it all",
  "take my life",
  "want to die",
  "wanna die",
  "going to die",
  "gonna die",
  "ready to die",
  "hurt myself",
  "harm myself",
  "cut myself",
  "cutting myself",
  "overdose",
  "overdosing",
  "don't want to be here anymore",
  "can't go on",
  "cannot go on",
  "no point living",
  "no reason to live",
  "better off dead",
  "better off without me",
  "kill you",
  "kill her",
  "kill him",
  "kill them",
  "gonna hurt",
  "going to hurt",
  "i will hurt",
  "i'll hurt",
  "bomb",
  "shooting",
  "massacre",
  "attack",
  "nigger",
  "nigga",
  "faggot",
  " fag ",
  "chink",
  "spic",
  "kike",
  "wetback",
  "tranny",
  "raghead",
  "sandnigger",
  "gook",
  "zipperhead",
  "rape",
  "molest",
  "child porn",
  "pedophile",
] as const;

export function isBlockedContent(text: string): boolean {
  const normalized = ` ${text.toLocaleLowerCase("und")} `;
  return BLOCKED_PHRASES.some((phrase) => normalized.includes(phrase));
}

const OBVIOUS_SUBMISSION_TEST_PATTERN =
  /^(?:test(?:ing)?(?:[\s_-]*\d+)?|sample|placeholder|hello[\s_-]*test|asdf+|qwerty+|zxcv+)$/iu;

export function isObviousSubmissionJunk(text: string): boolean {
  const normalized = text.normalize("NFKC").trim().toLocaleLowerCase("und");
  if (!normalized) return true;
  const compact = normalized.replace(/[^\p{L}\p{N}]/gu, "");
  return (
    OBVIOUS_SUBMISSION_TEST_PATTERN.test(normalized) ||
    /^(.)\1{5,}$/u.test(compact) ||
    /^(.{2,3})\1{3,}$/u.test(compact)
  );
}
