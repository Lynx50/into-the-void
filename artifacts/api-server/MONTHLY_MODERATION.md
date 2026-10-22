# Monthly Thought Moderation

This workflow deliberately separates read-only review from production mutation. Never schedule the quarantine command.

## Classification rules

- `KEEP`: genuine content with no high-confidence junk or review signal. Sentiment, grammar, spelling, mood, and short length never cause quarantine. `I miss you.` is explicitly preserved.
- `AUTO_QUARANTINE_CANDIDATE`: blank/punctuation-only content, exact test words, obvious numbered test variants, repeated-character/pattern nonsense, `__seed__` rows, or configured development-user rows.
- `MANUAL_REVIEW`: possible personal information, unsafe/abusive content, reported content, and exact duplicates. PII previews are redacted.

Every result is only a recommendation. Nothing changes during audit.

## Stage 1: read-only monthly audit

1. Supply `DATABASE_URL` only through the process environment. Never place it in arguments or files.
2. Run `pnpm audit:thoughts:monthly`. Use `pnpm audit:thoughts:monthly --full` only for a complete review.
3. The command starts `BEGIN ... READ ONLY`, performs only `SELECT` statements, and explicitly executes `ROLLBACK`.
4. Review `artifacts/api-server/.local-audits/monthly/<audit-id>/`:
   - `monthly-summary.json`
   - `manual-review.csv`
   - `auto-quarantine-candidates.csv`
5. Stop and obtain explicit approval for exact IDs. Do not infer approval from the report.

Example summary shape:

```json
{
  "auditId": "audit-2026-10-22T12-00-00-000Z-<uuid>",
  "completed": true,
  "readOnly": true,
  "databaseMutationPerformed": false,
  "dateRange": { "fromExclusive": null, "toInclusive": "...", "full": true },
  "ruleVersion": "monthly-moderation-v1",
  "candidateIdChecksum": "<sha256>",
  "counts": {
    "recordsInDateRange": 0,
    "activeCandidatesReviewed": 0,
    "excludedAlreadyModerated": 0,
    "alreadyQuarantinedTotal": 0,
    "keep": 0,
    "autoQuarantineCandidate": 0,
    "manualReview": 0
  },
  "candidates": [
    {
      "id": 123,
      "classification": "MANUAL_REVIEW",
      "reasons": ["possible-personal-information"],
      "preview": "[REDACTED: possible personal information]",
      "changedAt": "...",
      "fingerprint": "<sha256>"
    }
  ]
}
```

## Stage 2: explicitly approved quarantine

Prerequisites: verified production backup from the last 24 hours, migration `0003`, deployed compatible API, audit ID, exact approved IDs, and health URL.

```text
pnpm quarantine:thoughts --ids 9,10 --audit-id <audit-id> --backup-ack <ISO-UTC-backup-time> --health-url <health-url> --confirm
```

The command displays IDs and 80-character/redacted previews, verifies report checksum and live row fingerprints, locks rows, changes status only, verifies Receive and Thought of the Day exclusion, checks API health, and commits atomically. Missing, stale, or ineligible rows roll back the whole operation. Repeating the same operation is an idempotent no-op for rows already quarantined by that audit.

## Audit-scoped rollback

After another current backup:

```text
pnpm rollback:thoughts --audit-id <audit-id> --backup-ack <ISO-UTC-backup-time> --confirm
```

Only rows whose `moderation_audit_id` matches are restored to `active`. No command deletes thoughts.

## Scheduling

The read-only audit may be scheduled monthly with `DATABASE_URL` injected securely. Quarantine and rollback must remain manual and require explicit human approval, exact arguments, a recent-backup acknowledgement, and `--confirm`.
