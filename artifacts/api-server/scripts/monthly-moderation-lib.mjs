import { createHash } from "node:crypto";

export const MONTHLY_RULE_VERSION = "monthly-moderation-v1";
export const KEEP = "KEEP";
export const AUTO_QUARANTINE_CANDIDATE = "AUTO_QUARANTINE_CANDIDATE";
export const MANUAL_REVIEW = "MANUAL_REVIEW";
export const SEED_USER_ID = "__seed__";

const EXACT_TEST_PATTERN =
  /^(?:test|testing|sample|placeholder|asdf|qwerty|zxcv|lorem ipsum)$/iu;
const TEST_VARIANT_PATTERN =
  /^(?:test(?:ing)?|sample|placeholder|hello[\s_-]*test)[\s_-]*(?:\d+|[a-z])?$/iu;
const PII_PATTERN =
  /(?:\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:https?:\/\/|www\.)\S+|(?:^|\s)@[A-Z0-9_]{2,30}\b|\+?\d[\d\s().-]{7,}\d)/iu;
const UNSAFE_OR_ABUSIVE_PATTERN =
  /\b(?:kill myself|end my life|want to die|hurt myself|harm myself|kill you|rape|molest|nigger|nigga|faggot|chink|spic|kike|tranny)\b/iu;

export function normalizeModerationContent(content) {
  return String(content ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function isRepeatedCharacterNonsense(content) {
  const compact = normalizeModerationContent(content).replace(/\s/gu, "");
  if (!compact) return false;
  return /^(.)\1{4,}$/u.test(compact) || /^(..{0,2})\1{3,}$/u.test(compact);
}

export function containsPossiblePersonalInformation(content) {
  return PII_PATTERN.test(String(content ?? ""));
}

export function limitedModerationPreview(content, containsPii = false) {
  if (containsPii) return "[REDACTED: possible personal information]";
  const compact = String(content ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

export function classifyMonthlyThought(record, options = {}) {
  const raw = String(record.content ?? "");
  const normalized = normalizeModerationContent(raw);
  const reasons = [];
  const isSeed = record.userId === SEED_USER_ID;
  const isDevelopment = options.developmentUserIds?.has(record.userId) ?? false;
  const possiblePii = containsPossiblePersonalInformation(raw);

  if (isSeed || isDevelopment) {
    reasons.push(isSeed ? "known-seed-record" : "known-development-record");
    return { classification: AUTO_QUARANTINE_CANDIDATE, reasons, possiblePii };
  }
  if (!raw.trim() || !normalized) {
    return {
      classification: AUTO_QUARANTINE_CANDIDATE,
      reasons: ["blank"],
      possiblePii,
    };
  }
  if (EXACT_TEST_PATTERN.test(normalized)) {
    return {
      classification: AUTO_QUARANTINE_CANDIDATE,
      reasons: ["exact-test-word"],
      possiblePii,
    };
  }
  if (TEST_VARIANT_PATTERN.test(normalized)) {
    return {
      classification: AUTO_QUARANTINE_CANDIDATE,
      reasons: ["obvious-test-variant"],
      possiblePii,
    };
  }
  if (isRepeatedCharacterNonsense(raw)) {
    return {
      classification: AUTO_QUARANTINE_CANDIDATE,
      reasons: ["repeated-character-nonsense"],
      possiblePii,
    };
  }
  if (possiblePii) reasons.push("possible-personal-information");
  if (UNSAFE_OR_ABUSIVE_PATTERN.test(raw))
    reasons.push("unsafe-or-abusive-review");
  if (Number(record.reportCount ?? 0) > 0)
    reasons.push("reported-content-review");
  if (Number(record.exactDuplicateCount ?? 0) > 1)
    reasons.push("exact-duplicate-review");

  return {
    classification: reasons.length > 0 ? MANUAL_REVIEW : KEEP,
    reasons,
    possiblePii,
  };
}

export function checksumCandidateIds(ids) {
  const canonical = [...new Set(ids.map(Number))]
    .sort((a, b) => a - b)
    .join(",");
  return createHash("sha256").update(canonical).digest("hex");
}

export function fingerprintThought(record) {
  const canonical = JSON.stringify({
    id: Number(record.id),
    userId: String(record.userId),
    content: String(record.content ?? ""),
    createdAt: new Date(record.createdAt).toISOString(),
    changedAt: new Date(record.changedAt ?? record.createdAt).toISOString(),
    moderationStatus: String(record.moderationStatus ?? "active"),
    reportCount: Number(record.reportCount ?? 0),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function validateBackupAcknowledgement(value, now = new Date()) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return false;
  const age = now.getTime() - timestamp;
  return age >= -5 * 60_000 && age <= 24 * 60 * 60 * 1000;
}

export function validateAuditCandidateChecksum(report) {
  const ids = Array.isArray(report?.candidates)
    ? report.candidates.map((record) => Number(record.id))
    : [];
  return checksumCandidateIds(ids) === report?.candidateIdChecksum;
}

export function planQuarantine(ids, auditedRecords, currentRecords, auditId) {
  const audited = new Map(
    auditedRecords.map((record) => [Number(record.id), record]),
  );
  const current = new Map(
    currentRecords.map((record) => [Number(record.id), record]),
  );
  const changedIds = [];
  const alreadyAppliedIds = [];

  for (const id of ids) {
    const auditedRecord = audited.get(id);
    const currentRecord = current.get(id);
    if (!auditedRecord)
      throw new Error(`Thought ${id} is not an audited candidate.`);
    if (!currentRecord) throw new Error(`Thought ${id} is missing.`);
    if (
      currentRecord.moderationStatus === "quarantined" &&
      currentRecord.moderationAuditId === auditId
    ) {
      alreadyAppliedIds.push(id);
      continue;
    }
    if (currentRecord.moderationStatus !== "active") {
      throw new Error(`Thought ${id} is no longer eligible.`);
    }
    if (currentRecord.fingerprint !== auditedRecord.fingerprint) {
      throw new Error(`Thought ${id} changed after the audit.`);
    }
    changedIds.push(id);
  }

  return { changedIds, alreadyAppliedIds };
}

export function parseCliArguments(argv) {
  const result = { flags: new Set(), values: new Map() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) result.flags.add(argument);
    else {
      result.values.set(argument, next);
      index += 1;
    }
  }
  return result;
}

export function csv(records) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    ["id", "classification", "reasons", "preview", "changed_at"]
      .map(escape)
      .join(","),
    ...records.map((record) =>
      [
        record.id,
        record.classification,
        record.reasons.join("|"),
        record.preview,
        record.changedAt,
      ]
        .map(escape)
        .join(","),
    ),
  ].join("\n");
}
