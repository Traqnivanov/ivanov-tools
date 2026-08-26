# Ivanov Channels Worker

Backend foundation for connecting external analytics sources to Ivanov Analytics without exposing OAuth tokens in the browser.

## Why this is separate from `ivanov-geo`

`ivanov-geo` stays small and single-purpose. This Worker handles authenticated owner-only analytics integrations, encrypted OAuth refresh tokens, profile discovery and scheduled data synchronization.

## Implemented in the foundation

- owner-only API protection using the existing Firebase Authentication ID token;
- Firebase claim/signature checks before any sensitive API response;
- separate Google Business and Search Console OAuth flows;
- offline Google access for scheduled synchronization;
- AES-GCM encryption before refresh tokens are stored in D1;
- automatic discovery of accessible Google Business locations;
- automatic discovery of accessible Search Console properties;
- Google Business daily sync for Search/Maps impressions, call clicks, website clicks and direction requests;
- Search Console daily sync for clicks, impressions, CTR and average position;
- Search Console top query/page snapshots for drill-down views;
- owner-only `/api/status`, `/api/data`, `/api/rankings` and manual `/api/sync` endpoints;
- D1 schema for profiles, daily aggregates and ranked query/page results;
- Cron-triggered Google synchronization.

## Intentionally not deployed/configured yet

- production D1 database/binding;
- production Worker secrets;
- Google OAuth client credentials and redirect URIs;
- Meta/Facebook OAuth and synchronization;
- dashboard calls to this Worker.

The repository intentionally contains only `wrangler.example.jsonc`. There is no deploy-ready `wrangler.jsonc` until real Cloudflare resources and secrets exist, preventing accidental deployment with placeholder IDs.

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

## Production setup when Cloudflare access is available

1. Create a D1 database named `ivanov-channels`.
2. Apply `schema.sql`.
3. Copy `wrangler.example.jsonc` to `wrangler.jsonc` and insert the real D1 database ID and Worker/dashboard URLs.
4. Set required Worker secrets via Cloudflare/Wrangler secure prompts. Never put secret values in GitHub or command history.
5. Enable the required Google Business Profile APIs and Search Console API.
6. Create a Google Web application OAuth client with HTTPS redirect URIs exactly matching:
   - `<PUBLIC_BASE_URL>/oauth/callback/google_business`
   - `<PUBLIC_BASE_URL>/oauth/callback/search_console`
7. Deploy the Worker and apply the Cron Trigger.
8. Add owner-only Connect buttons to Ivanov Analytics.
9. Authorize Google Business and Search Console separately.

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
