import path from "node:path";
import process from "node:process";
import {
  MONTHLY_RULE_VERSION,
  limitedModerationPreview,
  parseCliArguments,
  validateBackupAcknowledgement,
} from "./monthly-moderation-lib.mjs";
import {
  createProductionPool,
  inspectModerationSchema,
  moderationTotals,
} from "./monthly-moderation-db.mjs";
import {
  readAuditSummary,
  writeImmutable,
} from "./monthly-moderation-reports.mjs";

async function main() {
  const args = parseCliArguments(process.argv.slice(2));
  if (!args.flags.has("--confirm"))
    throw new Error("Refusing rollback without --confirm.");
  const auditId = args.values.get("--audit-id");
  const backupAck = args.values.get("--backup-ack");
  if (!auditId) throw new Error("--audit-id is required.");
  if (!validateBackupAcknowledgement(backupAck)) {
    throw new Error(
      "--backup-ack must be a valid ISO timestamp from the last 24 hours.",
    );
  }
  const { directory } = await readAuditSummary(auditId);
  const pool = createProductionPool();
  const client = await pool.connect();
  let transactionOpen = false;
  let ids = [];
  let before;
  let after;

  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `monthly-moderation:${auditId}`,
    ]);
    const schema = await inspectModerationSchema(client);
    if (!schema.moderationAuditId || !schema.moderationRuleVersion) {
      throw new Error(
        "Required moderation workflow migration is not installed.",
      );
    }
    const rows = await client.query(
      `SELECT id, content FROM thoughts
       WHERE moderation_audit_id = $1 AND moderation_status = 'quarantined'
       ORDER BY id FOR UPDATE`,
      [auditId],
    );
    ids = rows.rows.map((row) => Number(row.id));
    if (ids.length === 0)
      throw new Error("No quarantined rows belong to this audit ID.");
    console.log("Rollback set:");
    for (const row of rows.rows)
      console.log(`${row.id}: ${limitedModerationPreview(row.content)}`);
    before = await moderationTotals(client);
    const update = await client.query(
      `UPDATE thoughts
       SET moderation_status = 'active', moderation_reason = NULL,
           moderation_updated_at = now(), moderation_rule_version = $1,
           moderation_audit_id = NULL
       WHERE moderation_audit_id = $2 AND moderation_status = 'quarantined'
       RETURNING id`,
      [MONTHLY_RULE_VERSION, auditId],
    );
    if (update.rowCount !== ids.length)
      throw new Error("Rollback row-count mismatch.");
    after = await moderationTotals(client);
    await client.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK");
    transactionOpen = false;
    throw error;
  } finally {
    if (transactionOpen) await client.query("ROLLBACK");
    client.release();
    await pool.end();
    delete process.env.DATABASE_URL;
  }

  const report = {
    auditId,
    rolledBackAt: new Date().toISOString(),
    ids,
    before,
    after,
    rowsDeleted: 0,
  };
  await writeImmutable(
    path.join(directory, `rollback-${Date.now()}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  delete process.env.DATABASE_URL;
  console.error(
    `Rollback refused or rolled back: ${error instanceof Error ? error.message : "unknown error"}`,
  );
  process.exitCode = 1;
});
