import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../../../lib/db/migrations/0002_add_daily_thought_selections.sql",
  import.meta.url,
);
const rollbackUrl = new URL(
  "../../../../lib/db/migrations/0002_add_daily_thought_selections.rollback.sql",
  import.meta.url,
);
const serviceUrl = new URL("./daily-thought-service.ts", import.meta.url);

test("daily-selection migration enforces one date and no repeated thought", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /date_utc date PRIMARY KEY/i);
  assert.match(migration, /thought_id integer NOT NULL UNIQUE/i);
  assert.match(migration, /ON DELETE RESTRICT/i);
});

test("daily selection is serialized before the persisted row is read", async () => {
  const service = await readFile(serviceUrl, "utf8");
  const begin = service.indexOf('client.query("BEGIN")');
  const lock = service.indexOf("pg_advisory_xact_lock");
  const read = service.indexOf("FROM daily_thought_selections d");
  assert.ok(begin >= 0 && lock > begin && read > lock);
});

test("rollback removes only daily-selection metadata", async () => {
  const rollback = await readFile(rollbackUrl, "utf8");
  assert.match(rollback, /DROP TABLE IF EXISTS daily_thought_selections/i);
  assert.doesNotMatch(rollback, /DROP TABLE IF EXISTS thoughts/i);
  assert.doesNotMatch(rollback, /DELETE FROM thoughts/i);
});
