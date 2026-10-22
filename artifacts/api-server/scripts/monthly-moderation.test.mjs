import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runTransactional } from "./monthly-moderation-db.mjs";
import {
  AUTO_QUARANTINE_CANDIDATE,
  KEEP,
  MANUAL_REVIEW,
  checksumCandidateIds,
  classifyMonthlyThought,
  limitedModerationPreview,
  planQuarantine,
  validateAuditCandidateChecksum,
} from "./monthly-moderation-lib.mjs";

const base = {
  id: 1,
  userId: "anonymous-user",
  content: "I miss you.",
  moderationStatus: "active",
  reportCount: 0,
  exactDuplicateCount: 1,
};

test("meaningful short and distressing emotional thoughts are preserved", () => {
  assert.equal(classifyMonthlyThought(base).classification, KEEP);
  assert.equal(
    classifyMonthlyThought({
      ...base,
      content: "I feel alone and I do not know what comes next.",
    }).classification,
    KEEP,
  );
});

test("only high-confidence test, blank, repeated and known seed rows auto-qualify", () => {
  for (const patch of [
    { content: "" },
    { content: "test 123" },
    { content: "aaaaaaaa" },
    { userId: "__seed__", content: "A polished seed thought." },
  ]) {
    assert.equal(
      classifyMonthlyThought({ ...base, ...patch }).classification,
      AUTO_QUARANTINE_CANDIDATE,
    );
  }
});

test("PII, unsafe and reported content requires human review and redacts previews", () => {
  const pii = classifyMonthlyThought({
    ...base,
    content: "Email me at person@example.com",
  });
  assert.equal(pii.classification, MANUAL_REVIEW);
  assert.equal(
    limitedModerationPreview("Email me at person@example.com", pii.possiblePii),
    "[REDACTED: possible personal information]",
  );
  assert.equal(
    classifyMonthlyThought({ ...base, content: "I want to kill you" })
      .classification,
    MANUAL_REVIEW,
  );
  assert.equal(
    classifyMonthlyThought({ ...base, reportCount: 1 }).classification,
    MANUAL_REVIEW,
  );
});

test("candidate checksum detects a modified immutable audit", () => {
  const report = {
    candidates: [{ id: 2 }, { id: 1 }],
    candidateIdChecksum: checksumCandidateIds([1, 2]),
  };
  assert.equal(validateAuditCandidateChecksum(report), true);
  report.candidates.push({ id: 3 });
  assert.equal(validateAuditCandidateChecksum(report), false);
});

test("quarantine planning rejects stale records", () => {
  assert.throws(
    () =>
      planQuarantine(
        [1],
        [{ id: 1, fingerprint: "audited" }],
        [{ id: 1, fingerprint: "changed", moderationStatus: "active" }],
        "audit-one",
      ),
    /changed after the audit/,
  );
});

test("quarantine planning is idempotent for the same audit", () => {
  assert.deepEqual(
    planQuarantine(
      [1],
      [{ id: 1, fingerprint: "audited" }],
      [
        {
          id: 1,
          fingerprint: "changed-by-update",
          moderationStatus: "quarantined",
          moderationAuditId: "audit-one",
        },
      ],
      "audit-one",
    ),
    { changedIds: [], alreadyAppliedIds: [1] },
  );
});

test("transaction helper rolls back completely when work fails", async () => {
  const calls = [];
  const client = { query: async (sql) => calls.push(sql) };
  await assert.rejects(
    runTransactional(client, async () => {
      throw new Error("injected failure");
    }),
    /injected failure/,
  );
  assert.deepEqual(calls, ["BEGIN", "ROLLBACK"]);
});

test("rollback implementation is scoped to one audit ID and never deletes", async () => {
  const source = await readFile(
    new URL("./rollback-thought-quarantine.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /WHERE moderation_audit_id = \$2 AND moderation_status = 'quarantined'/u,
  );
  assert.doesNotMatch(source, /DELETE\s+FROM\s+thoughts/iu);
});

test("monthly audit uses an explicit read-only transaction and rollback", async () => {
  const source = await readFile(
    new URL("./audit-thoughts-monthly.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u,
  );
  assert.match(source, /client\.query\("ROLLBACK"\)/u);
  assert.doesNotMatch(source, /UPDATE\s+thoughts|DELETE\s+FROM\s+thoughts/iu);
});

test("workflow migration adds audit fields without deleting thought rows", async () => {
  const migration = await readFile(
    new URL(
      "../../../lib/db/migrations/0003_add_monthly_moderation_audit_fields.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /moderation_rule_version/u);
  assert.match(migration, /moderation_audit_id/u);
  assert.match(migration, /updated_at/u);
  assert.doesNotMatch(migration, /DELETE\s+FROM\s+thoughts/iu);
});

test("production migration gate inspects read-only and applies migrations in order", async () => {
  const source = await readFile(
    new URL("./apply-production-migrations.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/u,
  );
  assert.match(source, /await client\.query\("ROLLBACK"\)/u);
  assert.ok(source.indexOf('id: "0001"') < source.indexOf('id: "0002"'));
  assert.ok(source.indexOf('id: "0002"') < source.indexOf('id: "0003"'));
  assert.doesNotMatch(source, /DELETE\s+FROM\s+thoughts/iu);
  assert.doesNotMatch(source, /UPDATE\s+thoughts/iu);
});
