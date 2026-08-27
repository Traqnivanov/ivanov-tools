# Ivanov Channels Worker

Backend for connecting external analytics sources to Ivanov Analytics and for the protected D1 analytics ingest path, without exposing OAuth tokens in the browser.

## Why this is separate from `ivanov-geo`

`ivanov-geo` stays small and single-purpose. This Worker handles authenticated owner-only analytics integrations, encrypted OAuth refresh tokens, profile discovery, scheduled data synchronization and the Stage 3 D1 analytics ingest endpoint.

## Production status

The existing `ivanov-channels` Worker is deployed in production and is connected to the Ivanov Analytics dashboard. The production D1 database/binding and required Worker secrets are configured in Cloudflare. Google Search Console authorization and synchronization are active. Google Business support exists in the Worker, while Meta/Facebook remains future work.

The D1 public analytics ingest code is a staged change and must not be considered production-active until its schema, public-origin variable and rate-limit binding are applied and the Worker is redeployed and smoke-tested.

Do not modify or reuse `ivanov-geo` for these integrations.

## Implemented

- owner-only API protection using the existing Firebase Authentication ID token;
- Firebase claim/signature checks before any sensitive API response;
- separate Google Business and Search Console OAuth flows;
- offline Google access for scheduled synchronization;
- AES-GCM encryption before refresh tokens are stored in D1;
- automatic discovery of accessible Google Business locations;
- automatic discovery of accessible Search Console properties;
- Google Business daily sync support for Search/Maps impressions, call clicks, website clicks and direction requests;
- Search Console daily sync for clicks, impressions, CTR and average position;
- Search Console top query/page snapshots for drill-down views;
- owner-only `/api/status`, `/api/data`, `/api/rankings`, `/api/analytics/events` and manual `/api/sync` endpoints;
- D1 schema for profiles, daily aggregates, ranked query/page results and analytics events;
- staged public `POST /ingest` route with strict field validation, body-size protection, public-origin allowlist and Cloudflare native rate limiting;
- Cron-triggered Google synchronization;
- dashboard integration with the production Worker.

## Current Search Console partitioning

The Worker maintains five derived Search Console profiles for the dashboard:

- `sc-city:sofia`
- `sc-city:lom`
- `sc-city:montana`
- `sc-city:lom-en`
- `sc-city:lom-de`

The `/narachnik/...` routes are intentionally excluded from those five derived profiles.

## Required secrets

Never commit these values:
- `OWNER_UID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` — base64 of exactly 32 random bytes

Refresh tokens are encrypted with AES-GCM before storage in D1. The encryption key remains a Worker secret.

The public analytics ingest path does not require a Firebase service-account key and does not store visitor IP addresses in D1.

## Required Stage 3 bindings / variables

Before enabling `POST /ingest` in production, preserve all existing bindings and add:

- `PUBLIC_ANALYTICS_ORIGINS` — comma-separated public origins allowed to send analytics events; production values include `https://ivanov-remonti.com`, `https://www.ivanov-remonti.com` and the controlled GitHub Pages origin used for site previews;
- `ANALYTICS_RATE_LIMITER` — Cloudflare Rate Limiting binding. The example configuration uses 60 allowed calls per 60 seconds per Cloudflare source-IP key.

The source IP is used only as the key passed to Cloudflare's managed rate-limit counter. The Worker does not write that IP into D1 or analytics payloads.

## Google scopes

Business Profile and Search Console are authorized separately:
- Google Business: `https://www.googleapis.com/auth/business.manage`
- Search Console: `https://www.googleapis.com/auth/webmasters.readonly`

This avoids requesting unrelated Google access in one large consent screen.

## Production maintenance

When changing the Worker:

1. Preserve all existing bindings and secrets unless the change explicitly requires otherwise.
2. Never modify `ivanov-geo` as part of `ivanov-channels` work.
3. Apply any D1 schema change only with an explicit migration and rollback plan.
4. Keep external synchronization in Worker/Cron, not on the public Ivanov Remonti pages.
5. After deploy, verify owner authentication plus `/api/status`, the affected data endpoint and the dashboard view that consumes it.

## Stage 3 safe rollout order

1. Apply only the additive `analytics_events` D1 table and indexes from `schema.sql`.
2. Add `PUBLIC_ANALYTICS_ORIGINS` while preserving the existing `ALLOWED_ORIGINS` value used by the owner dashboard.
3. Add the `ANALYTICS_RATE_LIMITER` binding while preserving D1, secrets, cron and all existing Worker settings.
4. Deploy the Worker and verify `/health`, owner `/api/status`, owner `/api/analytics/events` and one valid `POST /ingest` request from an allowed public origin.
5. Only after the Worker is confirmed healthy, deploy the tracker version that sends new events to `/ingest` and uses `sendBeacon` for `session_end`.
6. During the transition, the owner dashboard combines historical Firestore events with new D1 events so history is not lost.
7. After the new tracker is confirmed on the real public site, close unauthenticated Firestore `analytics_events` create access. Keep owner read access until the historical Firestore data is no longer needed.

Rollback before step 5 is simply redeploying the previous Worker. Rollback after step 5 is reverting the tracker to the previous Firestore-writing version while Firestore public create is still temporarily available.

## API outline

- `GET /health` — non-sensitive service health.
- `POST /ingest` — staged public analytics event ingest; strict validation + origin allowlist + rate limit; no owner token.
- `POST /oauth/start/google_business` — owner token required.
- `POST /oauth/start/search_console` — owner token required.
- `GET /oauth/callback/:provider` — single-use state-bound OAuth callback.
- `GET /api/status` — owner token required.
- `GET /api/data?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD&profileKey=...` — owner token required.
- `GET /api/rankings?provider=search_console&profileKey=...&dimension=query|page` — owner token required.
- `GET /api/analytics/events?from=<ISO>&to=<ISO>&limit=10000` — owner token required.
- `POST /api/sync` — owner-only manual Google sync.

## Data interpretation

Google Business stores the official raw daily metrics separately. The dashboard may sum the four Search/Maps impression metrics for the user-facing “Показвания” number while preserving the original breakdown for detail views.

Search Console daily rows are official Search Console metrics. Query/page ranking snapshots are top-result datasets returned by Search Console and must not be described as an exhaustive list of every search query.

D1 analytics event timestamps are server receipt times generated by the Worker, matching the old Firestore `serverTimestamp()` model rather than trusting a browser-supplied clock.

## Security rules

- Never put Google/Meta client secrets or refresh tokens in frontend JavaScript.
- Never trust CORS as authentication; every sensitive API endpoint verifies a Firebase ID token and owner UID.
- The public ingest endpoint is intentionally unauthenticated but is separately constrained by public-origin allowlisting, body-size limits, event/schema validation and Cloudflare rate limiting.
- OAuth state is random, expires after 10 minutes and is single-use.
- Refresh tokens are encrypted at rest.
- External API synchronization belongs in Worker/Cron, not on public websites.
- Analytics ingest stores only the approved analytics fields; it does not persist full visitor IP addresses or form contents.
