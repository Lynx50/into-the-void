import path from "node:path";
import process from "node:process";
import {
  MONTHLY_RULE_VERSION,
  limitedModerationPreview,
  parseCliArguments,
  planQuarantine,
  validateAuditCandidateChecksum,
  validateBackupAcknowledgement,
} from "./monthly-moderation-lib.mjs";
import {
  createProductionPool,
  inspectModerationSchema,
  moderationTotals,
  runTransactional,
  selectThoughtsByIds,
} from "./monthly-moderation-db.mjs";
import {
  readAuditSummary,
  writeImmutable,
} from "./monthly-moderation-reports.mjs";

function requiredValue(args, name) {
  const value = args.values.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parseIds(value) {
  const raw = String(value)
    .split(",")
    .map((item) => item.trim());
  const ids = raw.map(Number);
  if (
    ids.length === 0 ||
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error(
      "--ids must be a non-empty, duplicate-free comma-separated integer list.",
    );
  }
  return ids.sort((a, b) => a - b);
}

function healthUrl(args) {
  const explicit =
    args.values.get("--health-url") ?? process.env.API_HEALTH_URL;
  if (explicit) return explicit;
  const base = process.env.API_BASE_URL?.replace(/\/+$/u, "");
  return base ? `${base}/healthz` : null;
}

async function checkHealth(url) {
  if (!url) throw new Error("--health-url or API_HEALTH_URL is required.");
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok)
    throw new Error(`Health check returned HTTP ${response.status}.`);
}

async function smokeTestExclusion(client, ids) {
  const receive = await client.query(
    `SELECT COUNT(*)::integer AS count FROM thoughts
     WHERE id = ANY($1::integer[]) AND moderation_status = 'active'`,
    [ids],
  );
  if (Number(receive.rows[0]?.count ?? 0) !== 0) {
    throw new Error("Receive exclusion verification failed.");
  }

  const table = await client.query(`
    SELECT to_regclass('public.daily_thought_selections') IS NOT NULL AS present
  `);
  if (table.rows[0]?.present) {
    const daily = await client.query(
      `SELECT COUNT(*)::integer AS count
       FROM daily_thought_selections d
       JOIN thoughts t ON t.id = d.thought_id
       WHERE t.id = ANY($1::integer[]) AND t.moderation_status = 'active'`,
      [ids],
    );
    if (Number(daily.rows[0]?.count ?? 0) !== 0) {
      throw new Error("Thought of the Day exclusion verification failed.");
    }
  }
}

async function main() {
  const args = parseCliArguments(process.argv.slice(2));
  if (!args.flags.has("--confirm")) {
    throw new Error("Refusing mutation without --confirm.");
  }
  const ids = parseIds(requiredValue(args, "--ids"));
  const auditId = requiredValue(args, "--audit-id");
  const backupAck = requiredValue(args, "--backup-ack");
  if (!validateBackupAcknowledgement(backupAck)) {
    throw new Error(
      "--backup-ack must be a valid ISO timestamp from the last 24 hours.",
    );
  }

  const { report, directory } = await readAuditSummary(auditId);
  if (!validateAuditCandidateChecksum(report)) {
    throw new Error("Audit candidate checksum mismatch.");
  }
  const audited = new Map(
    report.candidates.map((record) => [Number(record.id), record]),
  );
  if (ids.some((id) => !audited.has(id))) {
    throw new Error(
      "Every requested ID must be present in the matching audit candidate list.",
    );
  }

  console.log("Approved quarantine set:");
  for (const id of ids) {
    const record = audited.get(id);
    console.log(`${id}: ${limitedModerationPreview(record.preview)}`);
  }

  const pool = createProductionPool();
  const client = await pool.connect();
  let before;
  let after;
  let changedIds = [];
  let alreadyAppliedIds = [];

  try {
    const result = await runTransactional(client, async () => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `monthly-moderation:${auditId}`,
      ]);
      const schema = await inspectModerationSchema(client);
      const requiredColumns = [
        "moderationStatus",
        "moderationReason",
        "moderationUpdatedAt",
        "moderationRuleVersion",
        "moderationAuditId",
        "updatedAt",
      ];
      if (requiredColumns.some((column) => !schema[column])) {
        throw new Error(
          "Required moderation workflow migration is not installed.",
        );
      }
      const current = await selectThoughtsByIds(client, ids, schema);
      if (current.length !== ids.length)
        throw new Error("One or more requested IDs are missing.");
      const plan = planQuarantine(ids, report.candidates, current, auditId);
      const totalsBefore = await moderationTotals(client);
      if (plan.changedIds.length > 0) {
        const update = await client.query(
          `UPDATE thoughts
         SET moderation_status = 'quarantined',
             moderation_reason = 'monthly_content_audit',
             moderation_updated_at = now(),
             moderation_rule_version = $1,
             moderation_audit_id = $2
         WHERE id = ANY($3::integer[]) AND moderation_status = 'active'
         RETURNING id`,
          [MONTHLY_RULE_VERSION, auditId, plan.changedIds],
        );
        if (update.rowCount !== plan.changedIds.length) {
          throw new Error("Transactional quarantine row-count mismatch.");
        }
      }
      await smokeTestExclusion(client, ids);
      await checkHealth(healthUrl(args));
      const totalsAfter = await moderationTotals(client);
      return { ...plan, before: totalsBefore, after: totalsAfter };
    });
    ({ changedIds, alreadyAppliedIds, before, after } = result);
  } finally {
    client.release();
    await pool.end();
    delete process.env.DATABASE_URL;
  }

  const operation = {
    auditId,
    ruleVersion: MONTHLY_RULE_VERSION,
    completedAt: new Date().toISOString(),
    backupAcknowledgedAt: new Date(backupAck).toISOString(),
    requestedIds: ids,
    changedIds,
    alreadyAppliedIds,
    before,
    after,
    rowsDeleted: 0,
    receiveExclusionVerified: true,
    thoughtOfDayExclusionVerified: true,
    healthCheckPassed: true,
    rollbackCommand: `pnpm rollback:thoughts --audit-id ${auditId} --backup-ack <ISO_TIMESTAMP> --confirm`,
  };
  await writeImmutable(
    path.join(directory, `quarantine-${Date.now()}.json`),
    `${JSON.stringify(operation, null, 2)}\n`,
  );
  console.log(JSON.stringify(operation, null, 2));
}

main().catch((error) => {
  delete process.env.DATABASE_URL;
  console.error(
    `Quarantine refused or rolled back: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
