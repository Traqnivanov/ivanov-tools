# Ivanov Channels Worker

Backend for Ivanov Analytics external channels and protected analytics storage. `ivanov-geo` remains separate and must not be reused or modified by this Worker.

## Production status

`ivanov-channels` is active in production.

Current production responsibilities:

- public analytics ingest through `POST /ingest`;
- strict event validation, body-size limits, public-origin allowlist and Cloudflare native rate limiting;
- storage of new analytics events in D1;
- owner-only analytics reads through Firebase Authentication;
- Google Search Console authorization, profile partitioning and scheduled synchronization;
- Google Business authorization and Worker support; location access is currently blocked externally by Google Business Profile API approval/quota;
- resilient daily/monthly D1 analytics summaries refreshed by cron;
- protected channel/status/data/ranking APIs used by the owner dashboard.

Production cron is exactly:

`17 3 * * *`

Google/Search synchronization and analytics summary refresh are backend cron work. The frontend does not trigger manual Google synchronization during normal dashboard use.

## Production analytics architecture

- Public tracker sends events to `ivanov-channels`.
- Worker validates and stores approved fields in D1.
- Firestore is owner-only and remains the historical source for events collected before the D1 cutover.
- Dashboard combines historical Firestore data with D1 data around the cutover and avoids irrelevant store reads outside that transition window.
- Public analytics event storage does not include full visitor IP addresses, names, phone numbers, form text or persistent fingerprints.
- Visitor IP is used only transiently as the Cloudflare rate-limit key and is not written into analytics data.
- Event timestamps use Worker/server receipt time rather than trusting the browser clock.

## Stage 5 summaries

Production D1 contains:

- `analytics_daily_summaries`
- `analytics_monthly_summaries`

The Worker recalculates the last 3 completed `Europe/Sofia` days on every cron run. This gives automatic recovery from a missed daily cron without requiring a manual scheduled-handler trigger.

The current monthly summary is refreshed on every cron run. During the first 3 Sofia days of a new month, the Worker also recalculates the just-closed previous month so events recorded after the last cron on the final calendar day are not permanently omitted.

Summary day boundaries use `Europe/Sofia`.

Summary engagement semantics match the dashboard: a session is engaged when it has at least 30 seconds of active time or at least 50% scroll depth.

The protected endpoint is:

`GET /api/analytics/summaries?period=daily|monthly&from=...&to=...&site=...`

Daily/monthly summary rows are period snapshots. Do not blindly sum unique-session counts across multiple summary buckets: one browser session can cross a day or month boundary. Long-range dashboard consumption must preserve exact session semantics before replacing detailed-event KPIs.

No automatic raw-event retention/deletion is enabled. Retention must not be activated without a separate explicit production decision and verification that long-term reporting is safely covered.

## External channels

### Search Console

Search Console is connected and cron-driven. The Worker maintains five derived dashboard profiles:

- `sc-city:sofia`
- `sc-city:lom`
- `sc-city:montana`
- `sc-city:lom-en`
- `sc-city:lom-de`

`/narachnik/...` routes are intentionally excluded from those derived profiles.

Daily rows store clicks, impressions, CTR and average position. Query/page rankings are snapshots of top Search Console results and must not be described as a complete list of every query.

### Google Business

OAuth support, profile discovery and daily metric synchronization are implemented for:

- Search/Maps impressions;
- call clicks;
- website clicks;
- direction requests.

The current production blocker is external: Google Business Profile API location access/quota approval. Do not burn repeated API calls or change the endpoint merely to work around the quota state.

### Facebook / Meta

No production Meta/Facebook API integration is active. Do not fabricate Facebook metrics.

## Owner-only API outline

- `GET /health` — public non-sensitive health check.
- `POST /ingest` — public analytics ingest constrained by origin, validation and rate limiting.
- `POST /oauth/start/google_business` — owner token required.
- `POST /oauth/start/search_console` — owner token required.
- `GET /oauth/callback/:provider` — state-bound OAuth callback.
- `GET /api/status` — owner token required.
- `GET /api/data?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD&profileKey=...` — owner token required.
- `GET /api/rankings?provider=search_console&profileKey=...&dimension=query|page` — owner token required.
- `GET /api/analytics/events?from=<ISO>&to=<ISO>&limit=10000` — owner token required.
- `GET /api/analytics/summaries?...` — owner token required.
- `POST /api/sync` — owner-only backend/manual endpoint; normal frontend operation does not call it.

## Required production configuration

Preserve all existing bindings, variables, secrets and cron unless a specific change explicitly requires otherwise.

Important values include:

- D1 binding `DB`;
- `PUBLIC_ANALYTICS_ORIGINS`;
- `ALLOWED_ORIGINS`;
- `ANALYTICS_RATE_LIMITER`;
- `FIREBASE_PROJECT_ID`;
- `OWNER_UID`;
- Google OAuth client configuration;
- `TOKEN_ENCRYPTION_KEY`.

Never commit secret values. Google refresh tokens are encrypted with AES-GCM before D1 storage.

## Production maintenance rules

1. Never modify `ivanov-geo` as part of `ivanov-channels` work.
2. Preserve existing bindings, secrets and cron unless the requested change explicitly requires otherwise.
3. Apply D1 schema changes through explicit migrations; prefer additive/non-destructive changes.
4. Do not enable retention/deletion implicitly.
5. Keep external API synchronization in Worker/Cron, not on public Ivanov Remonti pages.
6. After a Worker deploy, verify `/health`, owner authentication, affected protected endpoints, Worker modules/bindings and the exact cron schedule.
7. Do not claim a GitHub Worker change is live until the Cloudflare production deployment is separately verified.

## Security rules

- Never put Google/Meta client secrets or refresh tokens in frontend JavaScript.
- Never treat CORS as authentication; sensitive endpoints verify Firebase ID token + owner UID.
- Public ingest remains intentionally unauthenticated but constrained by origin allowlisting, validation, size limits and rate limiting.
- OAuth state is random, short-lived and single-use.
- Refresh tokens are encrypted at rest.
- Analytics ingest stores only approved analytics fields and does not persist full visitor IP addresses or form contents.
