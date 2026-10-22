import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import {
  AUTO_QUARANTINE,
  KEEP,
  MANUAL_REVIEW,
  classifyContent,
} from "./audit-classifier.mjs";

const { Pool } = pg;
const OUTPUT_DIRECTORY = path.resolve(".local-audits");
const SEED_USER_ID = "__seed__";

function bigrams(value) {
  const result = new Map();
  for (let index = 0; index < value.length - 1; index += 1) {
    const pair = value.slice(index, index + 2);
    result.set(pair, (result.get(pair) ?? 0) + 1);
  }
  return result;
}

function diceSimilarity(left, right) {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = bigrams(left);
  const rightPairs = bigrams(right);
  let overlap = 0;
  for (const [pair, count] of leftPairs) {
    overlap += Math.min(count, rightPairs.get(pair) ?? 0);
  }
  return (2 * overlap) / (left.length - 1 + right.length - 1);
}

function timestampForFile(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function increment(summary, key) {
  summary[key] = (summary[key] ?? 0) + 1;
}

function limitedPreview(content) {
  const compact = String(content ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length <= 80 ? compact : `${compact.slice(0, 77)}...`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for the read-only thought audit.",
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const generatedAt = new Date();
  let transactionStarted = false;

  try {
    await pool.query("BEGIN READ ONLY");
    transactionStarted = true;
    const statusColumnResult = await pool.query(`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'thoughts'
          AND column_name = 'moderation_status'
      ) AS present
    `);
    const hasModerationStatus = Boolean(statusColumnResult.rows[0]?.present);
    const statusExpression = hasModerationStatus
      ? "t.moderation_status"
      : "'active'::text";
    const result = await pool.query(`
      SELECT
        t.id,
        t.user_id,
        t.content,
        t.created_at,
        ${statusExpression} AS moderation_status,
        (
          SELECT COUNT(*)::integer
          FROM reactions r
          WHERE r.thought_id = t.id
            AND r.reaction_type LIKE 'report%'
        ) AS report_count
      FROM thoughts t
      ORDER BY t.id ASC
    `);
    await pool.query("ROLLBACK");
    transactionStarted = false;

    const records = result.rows.map((row) => ({
      id: Number(row.id),
      userId: row.user_id,
      content: String(row.content ?? ""),
      normalized: "",
      createdAt: row.created_at,
      moderationStatus: row.moderation_status ?? "active",
      reportCount: Number(row.report_count ?? 0),
      classification: KEEP,
      reasons: [],
    }));

    for (const record of records) {
      const contentReview = classifyContent(record.content);
      record.normalized = contentReview.normalized;
      record.classification = contentReview.classification;
      record.reasons.push(...contentReview.reasons);
    }

    const exactGroups = new Map();
    for (const record of records) {
      if (!record.normalized) continue;
      const group = exactGroups.get(record.normalized) ?? [];
      group.push(record.id);
      exactGroups.set(record.normalized, group);
    }

    for (const record of records) {
      const duplicateIds = exactGroups.get(record.normalized) ?? [];
      if (duplicateIds.length > 1) {
        record.reasons.push("exact-duplicate");
        if (record.classification === KEEP)
          record.classification = MANUAL_REVIEW;
      }

      if (record.moderationStatus !== "active" || record.reportCount >= 3) {
        record.reasons.push("already-hidden-or-rejected");
        if (record.classification === KEEP)
          record.classification = MANUAL_REVIEW;
      }
    }

    const comparable = records
      .filter((record) => record.normalized.length >= 12)
      .sort((left, right) => left.normalized.length - right.normalized.length)
      .slice(0, 5000);
    const nearDuplicatePairs = [];
    for (let leftIndex = 0; leftIndex < comparable.length; leftIndex += 1) {
      const left = comparable[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < comparable.length;
        rightIndex += 1
      ) {
        const right = comparable[rightIndex];
        if (right.normalized.length > left.normalized.length * 1.18) break;
        if (left.normalized === right.normalized) continue;
        if (diceSimilarity(left.normalized, right.normalized) < 0.92) continue;
        nearDuplicatePairs.push([left.id, right.id]);
        for (const record of [left, right]) {
          record.reasons.push("possible-near-duplicate");
          if (record.classification === KEEP)
            record.classification = MANUAL_REVIEW;
        }
        if (nearDuplicatePairs.length >= 1000) break;
      }
      if (nearDuplicatePairs.length >= 1000) break;
    }

    const summary = {
      total: records.length,
      genuineUserThoughts: records.filter(
        (record) => record.userId !== SEED_USER_ID,
      ).length,
      seedFallbackThoughts: records.filter(
        (record) => record.userId === SEED_USER_ID,
      ).length,
      eligibleUserThoughts: 0,
      eligibleSeedFallbackThoughts: 0,
      blank: 0,
      obviousTestVariants: 0,
      emojiOnly: 0,
      likelyGibberish: 0,
      exactDuplicateRecords: 0,
      exactDuplicateGroups: [...exactGroups.values()].filter(
        (ids) => ids.length > 1,
      ).length,
      nearDuplicatePairs: nearDuplicatePairs.length,
      extremelyShortUnclear: 0,
      likelyPersonalInformation: 0,
      rejectedReportedOrInactive: 0,
      keep: 0,
      autoQuarantine: 0,
      manualReview: 0,
    };

    for (const record of records) {
      if (record.reasons.includes("blank")) increment(summary, "blank");
      if (record.reasons.includes("obvious-test-placeholder"))
        increment(summary, "obviousTestVariants");
      if (record.reasons.includes("emoji-only"))
        increment(summary, "emojiOnly");
      if (record.reasons.includes("high-confidence-gibberish"))
        increment(summary, "likelyGibberish");
      if (record.reasons.includes("exact-duplicate"))
        increment(summary, "exactDuplicateRecords");
      if (record.reasons.includes("extremely-short-unclear"))
        increment(summary, "extremelyShortUnclear");
      if (record.reasons.includes("possible-personal-information"))
        increment(summary, "likelyPersonalInformation");
      if (record.reasons.includes("already-hidden-or-rejected"))
        increment(summary, "rejectedReportedOrInactive");
      if (record.classification === KEEP) increment(summary, "keep");
      if (record.classification === AUTO_QUARANTINE)
        increment(summary, "autoQuarantine");
      if (record.classification === MANUAL_REVIEW)
        increment(summary, "manualReview");

      const candidateEligible =
        record.moderationStatus === "active" &&
        record.reportCount < 3 &&
        !record.reasons.includes("blank") &&
        !record.reasons.includes("obvious-test-placeholder");
      if (candidateEligible && record.userId === SEED_USER_ID) {
        increment(summary, "eligibleSeedFallbackThoughts");
      } else if (candidateEligible) {
        increment(summary, "eligibleUserThoughts");
      }
    }

    const reviewList = records
      .filter((record) => record.classification !== KEEP)
      .map((record) => ({
        id: record.id,
        source: record.userId === SEED_USER_ID ? "seed" : "user",
        category: record.classification,
        reasons: record.reasons,
        preview: limitedPreview(record.content),
      }));

    await fs.mkdir(OUTPUT_DIRECTORY, { recursive: true });
    const outputPath = path.join(
      OUTPUT_DIRECTORY,
      `thought-audit-${timestampForFile(generatedAt)}.json`,
    );
    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          generatedAt: generatedAt.toISOString(),
          readOnly: true,
          databaseMutationPerformed: false,
          moderationStatusColumnPresent: hasModerationStatus,
          summary,
          nearDuplicatePairs,
          reviewList,
          records: records.map((record) => ({
            id: record.id,
            source: record.userId === SEED_USER_ID ? "seed" : "user",
            createdAt: record.createdAt,
            moderationStatus: record.moderationStatus,
            reportCount: record.reportCount,
            classification: record.classification,
            reasons: record.reasons,
            preview: limitedPreview(record.content),
          })),
        },
        null,
        2,
      ),
      "utf8",
    );

    console.log(JSON.stringify({ outputPath, summary }, null, 2));
  } finally {
    if (transactionStarted) {
      await pool.query("ROLLBACK");
    }
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    `Thought audit failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
