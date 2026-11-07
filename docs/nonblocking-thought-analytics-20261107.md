# Keep thought actions independent of telemetry

When a native Firebase logEvent promise remains pending, four successful mutation callbacks also remain pending. The release callback waits before invalidating/refetching thought queries; receive and claim have already updated their caches but cannot finish. This is a reproduced source-level failure mode, not an observed production incident.

Dispatch best-effort trackEvent calls without awaiting them in release, receive, claim and reaction success callbacks. The existing analytics wrapper catches rejected bridge calls. Preserve API request handling, cache changes, event names and parameters; no thought content or identity is added to telemetry. No retries or timeout-generated duplicate events are introduced.

The regression uses the actual use-thoughts callbacks and actual analytics wrapper, with isolated query-client and native-bridge doubles. On the original source all four callbacks fail the pending-telemetry assertion. On the candidate all pass. Late native rejections are handled; native success and web/no-native controls pass. Release invalidation/refetch and receive/claim cache updates are verified.

Run with Node 24 or newer:

    node --experimental-strip-types artifacts/into-the-void/tests/analytics-mutation.test.mjs

Prepared app version 2.5.1 (Android code17) remains visible through existing Info/App controls version display. Reconcile release numbers against any concurrent release before packaging. Source base2afe94412535d6714837d1008f5adcd8e403b7c0. No production deployment, Android build/device test or full workspace build is claimed.
