import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..", "..", "..");
const receiptDirectory = path.resolve(
  scriptDirectory,
  "..",
  ".local-audits",
  "migration-receipts",
);
const migrations = [
  {
    id: "0001",
    file: "0001_add_thought_moderation_status.sql",
  },
  {
    id: "0002",
    file: "0002_add_daily_thought_selections.sql",
  },
  {
    id: "0003",
    file: "0003_add_monthly_moderation_audit_fields.sql",
  },
].map((migration) => ({
  ...migration,
  path: path.join(repositoryRoot, "lib", "db", "migrations", migration.file),
}));

function parseArguments(argv) {
  const flags = new Set(argv.filter((argument) => argument.startsWith("--")));
  return { apply: flags.has("--apply") };
}

async function migrationMetadata() {
  return Promise.all(
    migrations.map(async (migration) => {
      const sql = await fs.readFile(migration.path, "utf8");
      return {
        ...migration,
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}

async function inspect(client) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const result = await client.query(`
      SELECT json_build_object(
        'moderationStatus', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='moderation_status'
        ),
        'moderationReason', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='moderation_reason'
        ),
        'moderationUpdatedAt', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='moderation_updated_at'
        ),
        'moderationConstraint', EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid='public.thoughts'::regclass AND conname='thoughts_moderation_status_check'
        ),
        'dailyTable', to_regclass('public.daily_thought_selections') IS NOT NULL,
        'dailyPrimaryKey', EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid=to_regclass('public.daily_thought_selections') AND contype='p'
        ),
        'dailyThoughtUnique', EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid=to_regclass('public.daily_thought_selections') AND contype='u'
        ),
        'dailyThoughtForeignKey', EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conrelid=to_regclass('public.daily_thought_selections') AND contype='f'
        ),
        'moderationRuleVersion', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='moderation_rule_version'
        ),
        'moderationAuditId', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='moderation_audit_id'
        ),
        'updatedAt', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='thoughts' AND column_name='updated_at'
        ),
        'updatedAtTrigger', EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid='public.thoughts'::regclass AND tgname='thoughts_set_updated_at' AND NOT tgisinternal
        )
      ) AS state
    `);
    await client.query("ROLLBACK");
    return result.rows[0].state;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

function evaluate(state) {
  const status = {
    "0001":
      state.moderationStatus &&
      state.moderationReason &&
      state.moderationUpdatedAt &&
      state.moderationConstraint
        ? "applied"
        : "pending",
    "0002":
      state.dailyTable &&
      state.dailyPrimaryKey &&
      state.dailyThoughtUnique &&
      state.dailyThoughtForeignKey
        ? "applied"
        : state.dailyTable
          ? "inconsistent"
          : "pending",
    "0003":
      state.moderationRuleVersion &&
      state.moderationAuditId &&
      state.updatedAt &&
      state.updatedAtTrigger
        ? "applied"
        : "pending",
  };
  return status;
}

async function applyMigration(client, migration) {
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in the temporary child environment.");
  }
  const args = parseArguments(process.argv.slice(2));
  const metadata = await migrationMetadata();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const beforeState = await inspect(client);
    const before = evaluate(beforeState);
    if (Object.values(before).includes("inconsistent")) {
      throw new Error("Production schema is inconsistent; no migration was applied.");
    }
    const required = metadata.map(({ id, file, sha256 }) => ({
      id,
      file,
      sha256,
      status: before[id],
    }));

    if (!args.apply) {
      console.log(JSON.stringify({ mode: "inspect", snapshotVerified: true, required }, null, 2));
      return;
    }

    const applied = [];
    for (const migration of metadata) {
      if (before[migration.id] === "applied") continue;
      await applyMigration(client, migration);
      applied.push(migration.id);
    }

    const afterState = await inspect(client);
    const after = evaluate(afterState);
    if (Object.values(after).some((value) => value !== "applied")) {
      throw new Error("Post-migration verification failed.");
    }
    const totals = await client.query(`
      SELECT COUNT(*)::integer AS total,
             COUNT(*) FILTER (WHERE moderation_status='active')::integer AS active,
             COUNT(*) FILTER (WHERE moderation_status<>'active')::integer AS non_active
      FROM thoughts
    `);
    const receipt = {
      completedAtUtc: new Date().toISOString(),
      snapshot: {
        sourceBranch: "production",
        createdAtUtc: "2026-10-22T09:53:17.000Z",
        type: "manual",
        expiry: "never",
      },
      migrations: required,
      applied,
      finalStatus: after,
      totals: totals.rows[0],
      rowsDeleted: 0,
      thoughtsQuarantined: 0,
    };
    await fs.mkdir(receiptDirectory, { recursive: true });
    const receiptPath = path.join(
      receiptDirectory,
      `migration-${receipt.completedAtUtc.replace(/[:.]/gu, "-")}.json`,
    );
    await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    console.log(JSON.stringify({ ...receipt, receiptPath }, null, 2));
  } finally {
    client.release();
    await pool.end();
    delete process.env.DATABASE_URL;
  }
}

main().catch((error) => {
  delete process.env.DATABASE_URL;
  const safeMessage =
    error instanceof Error &&
    /^(Production schema is inconsistent|Post-migration verification failed)/u.test(
      error.message,
    )
      ? error.message
      : "Database authentication, connectivity, or migration execution failed.";
  console.error(`Migration gate stopped safely: ${safeMessage}`);
  process.exitCode = 1;
});
