# Preserve a replacement session after a stale 401

An authenticated background request can start with an expired token, then finish after the user's reconnect request has successfully installed a new token. Previously every non-session 401 cleared storage unconditionally. The stale response therefore erased the replacement session and the next thought action sent no session header. A request started before a session existed had the same effect.

The API module now invalidates a token only when the rejected request actually sent that same token and it is still the currently stored session token. Current-token rejection still clears the token, while preserving the anonymous user ID. Force-refresh still deliberately clears and replaces the current token. No automatic replay, retry, new identity, thought content or telemetry is introduced.

The regression loads the actual API module; only the Vite environment lookup, storage and HTTP responses are controlled. Nine cases cover late expired-token rejection, an old request without credentials, explicit old headers, current-token failure, session-endpoint failure, the following action's header, force-refresh, a complete reconnect before background rejection, and offline no-dispatch behaviour. Four cases reproduced failures before correction; all nine pass after correction. The complete reconnect case also verifies that no extra session request is dispatched.

Validation command (Node24):

    node --experimental-strip-types artifacts/into-the-void/tests/session-recovery.test.mjs

Source baseline: 2afe94412535d6714837d1008f5adcd8e403b7c0, from the isolated available checkout. API file is independent of PR3's analytics changes. This is a reproduced source-level race, not a claim of an observed live incident. Parent release process must reconcile the current release baseline, assign a visible Settings/Info version, and run the application build and real-device reconnect test before release. No production deployment, real credentials, customer records or paid API calls were used during local validation. This draft PR contains only the recovery fix, its test and this record.

## Combined candidate validation

Locally combined the existing PR3 analytics hook/test with the recovery fix in an isolated worktree without changing version files. Frozen dependency installation completed without tracked manifest or lockfile changes. The combined candidate passes:

- Production-mode Vite web build (2,198 modules; tooltip sourcemap and >500KB chunk warnings remain).
- Root `pnpm run typecheck`, including shared libraries, API, frontend, mockup and scripts.
- Existing API test suite: 45/45 passed, no skipped cases.
- Analytics mutation regression: four callbacks with hanging/rejected telemetry plus native-success/web controls.
- Session recovery regression: nine cases.
- `git diff --check`.

The web build is compilation validation only: no production VITE_API_BASE_URL was supplied, and this build must not be deployed. Parent independently verified Play production versionCode67/versionName7.4, whereas this checkout is versionCode16/versionName2.5. Therefore current-source provenance remains a release blocker. A historical deployment-guide breadcrumb points to `C:\Users\willi\Downloads\Void-Thoughts (1)\Void-Thoughts\artifacts\into-the-void`, but this is not proof that it contains version7.4. No signing, Android build, device reconnect test or deployment was performed. The combined validation above includes PR3 changes that are intentionally excluded from this recovery-only PR; it is not standalone build evidence for this branch.
