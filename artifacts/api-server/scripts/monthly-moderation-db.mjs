import pg from "pg";
import { fingerprintThought } from "./monthly-moderation-lib.mjs";

const { Pool } = pg;

export function createProductionPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be supplied through the process environment.",
    );
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export async function runTransactional(client, work) {
  await client.query("BEGIN");
  try {
    const result = await work();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function inspectModerationSchema(client) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'thoughts'
  `);
  const columns = new Set(result.rows.map((row) => row.column_name));
  return {
    moderationStatus: columns.has("moderation_status"),
    moderationReason: columns.has("moderation_reason"),
    moderationUpdatedAt: columns.has("moderation_updated_at"),
    moderationRuleVersion: columns.has("moderation_rule_version"),
    moderationAuditId: columns.has("moderation_audit_id"),
    updatedAt: columns.has("updated_at"),
  };
}

export function changedAtExpression(schema) {
  const values = ["t.created_at"];
  if (schema.updatedAt) values.push("t.updated_at");
  if (schema.moderationUpdatedAt) values.push("t.moderation_updated_at");
  return `GREATEST(${values.map((value) => `COALESCE(${value}, t.created_at)`).join(", ")})`;
}

export async function selectThoughtsForAudit(
  client,
  { since, until, full, schema },
) {
  const status = schema.moderationStatus
    ? "COALESCE(t.moderation_status, 'active')"
    : "'active'::text";
  const changedAt = changedAtExpression(schema);
  const result = await client.query(
    `SELECT t.id, t.user_id, t.content, t.created_at,
            ${changedAt} AS changed_at,
            ${status} AS moderation_status,
            (SELECT COUNT(*)::integer FROM reactions r
             WHERE r.thought_id = t.id AND r.reaction_type LIKE 'report%') AS report_count,
            (SELECT COUNT(*)::integer FROM thoughts duplicate
             WHERE LOWER(BTRIM(duplicate.content)) = LOWER(BTRIM(t.content))) AS exact_duplicate_count
     FROM thoughts t
     WHERE ($1::boolean OR ${changedAt} > $2::timestamptz)
       AND ${changedAt} <= $3::timestamptz
     ORDER BY t.id`,
    [full, since.toISOString(), until.toISOString()],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    userId: row.user_id,
    content: row.content,
    createdAt: row.created_at,
    changedAt: row.changed_at,
    moderationStatus: row.moderation_status,
    reportCount: Number(row.report_count),
    exactDuplicateCount: Number(row.exact_duplicate_count),
  }));
}

export async function selectThoughtsByIds(client, ids, schema) {
  const status = schema.moderationStatus
    ? "COALESCE(t.moderation_status, 'active')"
    : "'active'::text";
  const changedAt = changedAtExpression(schema);
  const result = await client.query(
    `SELECT t.id, t.user_id, t.content, t.created_at,
            ${changedAt} AS changed_at,
            ${status} AS moderation_status,
            ${schema.moderationAuditId ? "t.moderation_audit_id" : "NULL::text"} AS moderation_audit_id,
            (SELECT COUNT(*)::integer FROM reactions r
             WHERE r.thought_id = t.id AND r.reaction_type LIKE 'report%') AS report_count
     FROM thoughts t WHERE t.id = ANY($1::integer[]) ORDER BY t.id FOR UPDATE`,
    [ids],
  );
  return result.rows.map((row) => {
    const record = {
      id: Number(row.id),
      userId: row.user_id,
      content: row.content,
      createdAt: row.created_at,
      changedAt: row.changed_at,
      moderationStatus: row.moderation_status,
      moderationAuditId: row.moderation_audit_id,
      reportCount: Number(row.report_count),
    };
    return { ...record, fingerprint: fingerprintThought(record) };
  });
}

export async function moderationTotals(client) {
  const result = await client.query(`
    SELECT COUNT(*)::integer AS total,
           COUNT(*) FILTER (WHERE moderation_status = 'active')::integer AS active,
           COUNT(*) FILTER (WHERE moderation_status = 'quarantined')::integer AS quarantined,
           COUNT(*) FILTER (WHERE moderation_status = 'rejected')::integer AS rejected,
           COUNT(*) FILTER (WHERE moderation_status = 'deleted')::integer AS deleted
    FROM thoughts
  `);
  return result.rows[0];
}
