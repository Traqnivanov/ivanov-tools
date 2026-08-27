# Ivanov Channels Worker

Backend for connecting external analytics sources to Ivanov Analytics without exposing OAuth tokens in the browser.

## Why this is separate from `ivanov-geo`

`ivanov-geo` stays small and single-purpose. This Worker handles authenticated owner-only analytics integrations, encrypted OAuth refresh tokens, profile discovery and scheduled data synchronization.

## Production status

The `ivanov-channels` Worker is deployed in production and is connected to the Ivanov Analytics dashboard. The production D1 database/binding and required Worker secrets are configured in Cloudflare. Google Search Console authorization and synchronization are active. Google Business support exists in the Worker, while Meta/Facebook remains future work.

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
- owner-only `/api/status`, `/api/data`, `/api/rankings` and manual `/api/sync` endpoints;
- D1 schema for profiles, daily aggregates and ranked query/page results;
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

## API outline

- `GET /health` — non-sensitive service health.
- `POST /oauth/start/google_business` — owner token required.
- `POST /oauth/start/search_console` — owner token required.
- `GET /oauth/callback/:provider` — single-use state-bound OAuth callback.
- `GET /api/status` — owner token required.
- `GET /api/data?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD&profileKey=...` — owner token required.
- `GET /api/rankings?provider=search_console&profileKey=...&dimension=query|page` — owner token required.
- `POST /api/sync` — owner-only manual Google sync.

## Data interpretation

Google Business stores the official raw daily metrics separately. The dashboard may sum the four Search/Maps impression metrics for the user-facing “Показвания” number while preserving the original breakdown for detail views.

Search Console daily rows are official Search Console metrics. Query/page ranking snapshots are top-result datasets returned by Search Console and must not be described as an exhaustive list of every search query.

## Security rules

- Never put Google/Meta client secrets or refresh tokens in frontend JavaScript.
- Never trust CORS as authentication; every sensitive API endpoint verifies a Firebase ID token and owner UID.
- OAuth state is random, expires after 10 minutes and is single-use.
- Refresh tokens are encrypted at rest.
- External API synchronization belongs in Worker/Cron, not on public websites.
- Public Ivanov Remonti pages do not load this Worker and receive no extra JS/network work from these integrations.
