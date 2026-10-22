import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  AUTO_QUARANTINE_CANDIDATE,
  KEEP,
  MANUAL_REVIEW,
  MONTHLY_RULE_VERSION,
  checksumCandidateIds,
  classifyMonthlyThought,
  csv,
  fingerprintThought,
  limitedModerationPreview,
  parseCliArguments,
} from "./monthly-moderation-lib.mjs";
import {
  createProductionPool,
  inspectModerationSchema,
  selectThoughtsForAudit,
} from "./monthly-moderation-db.mjs";
import {
  AUDIT_ROOT,
  latestCompletedAudit,
  writeImmutable,
} from "./monthly-moderation-reports.mjs";

function auditIdFor(date) {
  const timestamp = date.toISOString().replace(/[:.]/gu, "-");
  return `audit-${timestamp}-${randomUUID()}`;
}

async function main() {
  const args = parseCliArguments(process.argv.slice(2));
  const full = args.flags.has("--full");
  const previous = full ? null : await latestCompletedAudit();
  const startedAt = new Date();
  const since = previous?.dateRange?.toInclusive
    ? new Date(previous.dateRange.toInclusive)
    : new Date(0);
  const auditId = auditIdFor(startedAt);
  const developmentUserIds = new Set(
    String(process.env.MODERATION_DEVELOPMENT_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  const pool = createProductionPool();
  const client = await pool.connect();
  let transactionOpen = false;
  let rows;
  let schema;
  let quarantinedExistingTotal = 0;

  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
    );
    transactionOpen = true;
    schema = await inspectModerationSchema(client);
    rows = await selectThoughtsForAudit(client, {
      since,
      until: startedAt,
      full,
      schema,
    });
    if (schema.moderationStatus) {
      const result = await client.query(
        "SELECT COUNT(*)::integer AS count FROM thoughts WHERE moderation_status = 'quarantined'",
      );
      quarantinedExistingTotal = Number(result.rows[0]?.count ?? 0);
    }
    await client.query("ROLLBACK");
    transactionOpen = false;
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
    await pool.end();
    delete process.env.DATABASE_URL;
  }

  const activeRows = rows.filter((row) => row.moderationStatus === "active");
  const excludedAlreadyModerated = rows.length - activeRows.length;
  const classified = activeRows.map((row) => {
    const decision = classifyMonthlyThought(row, { developmentUserIds });
    return {
      id: row.id,
      classification: decision.classification,
      reasons: decision.reasons,
      preview: limitedModerationPreview(row.content, decision.possiblePii),
      changedAt: new Date(row.changedAt).toISOString(),
      fingerprint: fingerprintThought(row),
    };
  });
  const auto = classified.filter(
    (record) => record.classification === AUTO_QUARANTINE_CANDIDATE,
  );
  const manual = classified.filter(
    (record) => record.classification === MANUAL_REVIEW,
  );
  const keep = classified.filter((record) => record.classification === KEEP);
  const candidates = [...auto, ...manual].sort((a, b) => a.id - b.id);
  const candidateIdChecksum = checksumCandidateIds(
    candidates.map((record) => record.id),
  );
  const report = {
    auditId,
    completed: true,
    readOnly: true,
    databaseMutationPerformed: false,
    generatedAt: new Date().toISOString(),
    dateRange: {
      fromExclusive: full ? null : since.toISOString(),
      toInclusive: startedAt.toISOString(),
      full,
    },
    ruleVersion: MONTHLY_RULE_VERSION,
    previousAuditId: previous?.auditId ?? null,
    candidateIdChecksum,
    counts: {
      recordsInDateRange: rows.length,
      activeCandidatesReviewed: activeRows.length,
      excludedAlreadyModerated,
      alreadyQuarantinedTotal: quarantinedExistingTotal,
      keep: keep.length,
      autoQuarantineCandidate: auto.length,
      manualReview: manual.length,
    },
    candidates,
  };

  const outputDirectory = path.join(AUDIT_ROOT, auditId);
  await fs.mkdir(outputDirectory, { recursive: false });
  await writeImmutable(
    path.join(outputDirectory, "monthly-summary.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeImmutable(
    path.join(outputDirectory, "manual-review.csv"),
    `${csv(manual)}\n`,
  );
  await writeImmutable(
    path.join(outputDirectory, "auto-quarantine-candidates.csv"),
    `${csv(auto)}\n`,
  );

  console.log(
    JSON.stringify(
      {
        auditId,
        readOnly: true,
        dateRange: report.dateRange,
        counts: report.counts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  delete process.env.DATABASE_URL;
  console.error(
    `Monthly audit failed safely: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
