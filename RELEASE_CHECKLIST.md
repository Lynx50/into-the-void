# Into the Void Release Checklist

## Current Stage

- Core Android app flow works locally end-to-end.
- Backend now bootstraps missing tables and columns for development recovery.
- App and API can submit, receive, react, and report thoughts.
- Anonymous sessions are now signed by the server instead of trusting a client-made ID alone.
- This project is close to closed beta readiness.
- This project is not yet ready for a broad public launch.

## Must Finish Before Public Release

### 1. Production Hosting

- Host the API on a stable HTTPS domain.
- Move off LAN IPs and local cleartext traffic.
- Point `artifacts/into-the-void/.env` at the hosted API URL for production builds.
- Set real `CORS_ORIGINS` and `SESSION_SECRET` in the API environment.

### 2. Database and Operations

- Replace startup schema mutation in `artifacts/api-server/src/index.ts` with proper Drizzle migrations.
- Keep bootstrap limited to startup validation, not table creation for production.
- Add backups and a rollback plan for the production Postgres database.
- Add uptime monitoring and basic request/error alerting.

### 3. Abuse and Moderation

- Replace the current blocked-phrase list with stronger moderation.
- Move from in-memory rate limits to a shared store such as Redis before multi-instance production deploys.
- Add server-side abuse logging and review tooling.
- Add a moderation workflow for reported thoughts.
- Decide how to handle self-harm content safely and consistently.

### 4. Identity and Trust

- Keep using signed anonymous sessions and remove any remaining server trust in unsigned identifiers.
- Decide whether sessions should expire and rotate.
- Make receive quotas and reaction/report actions harder to evade across reinstalls and device resets.

### 5. Android Release Hardening

- Keep cleartext-only development networking out of the release build.
- Turn on release shrinking and obfuscation after verifying the app still runs.
- Create a signed release build and archive the signing setup securely.
- Review Play Store target SDK, privacy form, and release notes.

### 6. Product Consistency

- Keep mood handling consistent across submit, orbit, and receive.
- Verify receive count behavior only uses the server as the source of truth.
- Review empty-state, offline-state, and timeout copy across the app.
- Verify analytics events match the final privacy disclosure.

### 7. Legal and Support

- Move the privacy policy off the temporary Notion page to a stable owned URL.
- Confirm support email is monitored.
- Prepare store listing assets, contact details, and content rating answers.

## Good Next Milestones

### Closed Beta

- Hosted HTTPS backend
- Production database
- Signed anonymous sessions verified on-device
- Basic rate limiting
- Basic crash and error monitoring
- 20 to 100 testers on internal or closed testing

### Public Launch

- Migration-based schema management
- Moderation workflow
- Shared rate limiting
- Release build hardening
- Privacy and analytics review complete

## Changes Landed In This Pass

- Client now uses the server for receive counts instead of local bookkeeping.
- Client no longer falls back to fake seed thoughts when the network fails.
- Thought submit now persists mood on the backend.
- API CORS can now be configured with `CORS_ORIGINS`.
- API now has lightweight in-memory rate limiting on submit, receive, react, and report endpoints.
- API startup logging now avoids printing the raw database URL.
- API request body size is now capped to reduce low-effort abuse.
- Android release manifest now defaults to HTTPS-only while debug builds keep cleartext enabled for local testing.
- The hardcoded LAN-only Android network security file was removed from the release path.
- Environment example files were added for app and API.
- `.env` files are now ignored by git while `.env.example` files stay tracked.
- The app now boots a signed anonymous session and sends it on API requests.
- Report calls now go through the same configured API base URL and session header as the rest of the app.
- The API now refuses to start in production without `SESSION_SECRET` and `CORS_ORIGINS`.
