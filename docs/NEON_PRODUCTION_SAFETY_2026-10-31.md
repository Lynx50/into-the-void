# Neon production database safety — 31 October 2026

This branch is **not deployed**. The API currently performs schema repair and thought seeding on every production startup; this change moves production bootstrap to read-only schema inspection. Development bootstrap retains the prior behavior.

## Production acceptance checklist

1. Connect Neon through an authorized project-scoped integration or open the Neon console. Identify the actual production project, branch, region, plan, spending limits and restore window. Do not infer current settings from the 4 May 2026 onboarding email.
2. Confirm a recent independently recoverable backup/snapshot, retention period, and successful non-production restore test. A retention configuration alone is **not** a validated backup.
3. Compare the live database schema against the columns checked by `assertProductionSchemaReady`. The inspection checks required columns only; it does not prove constraints, indexes, triggers, permissions or full migration consistency.
4. Inspect the existing `0001`–`0003` migration states through the **inspect-only** mode of `artifacts/api-server/scripts/apply-production-migrations.mjs`, with `DATABASE_URL` supplied solely via protected environment variables. Do **not** use `--apply` until backup and schema evidence are independently verified.
5. Test the proposed startup on a disposable Neon database branch with representative schema and data. Validate healthy boot, API health, seed count unchanged, no DDL/DML during restart, and a clear failure on missing schema. Capture logs without connection strings or user thoughts.
6. Verify production service is not relying on startup to add missing schema objects. Coordinate any migration before merging or deploying. With the code as written, a missing column will make startup fail closed.
7. Run local build and tests and deploy to isolated staging first. Verify rollback of the application release, then monitor production health after controlled release.

## Cost and access

Avoid increasing compute minimum, disabling scale-to-zero, creating paid replicas or raising restore retention until actual usage, plan and charges are verified. Give coding agents least-privilege development-only access initially, and do not expose the production `DATABASE_URL`.

## Outstanding operational checks

- Confirm Railway's October 21 incident credential-rotation inventory and deployment/service health. Changing database secrets without updating applications could cause an outage.
- Review Google account security activity for the blocked password sign-in reported October 23; verify current password and 2FA, without handing credentials to an agent.
- Check latest Google Play policies against each Android app's actual manifest before asserting any remediation.
- Car insurance auto-renewal is November 13; compare quote conditions, not premium alone.

The safe startup change deliberately does **not** repair live Neon settings or run migrations.