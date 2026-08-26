# Ivanov Channels Worker

Backend foundation for connecting external analytics sources to Ivanov Analytics without exposing OAuth tokens in the browser.

## Why this is separate from `ivanov-geo`

`ivanov-geo` stays small and single-purpose. This Worker handles authenticated owner-only analytics integrations, encrypted OAuth refresh tokens, profile discovery and scheduled data synchronization.

## Current foundation

Implemented:
- owner-only API protection using the existing Firebase Authentication ID token;
- exact Firebase claim checks (`alg`, `kid`, signature, `exp`, `iat`, `auth_time`, `aud`, `iss`, owner `sub`);
- Google Business OAuth start/callback flow;
- Search Console OAuth start/callback flow;
- separate Google scopes for Business Profile and Search Console;
- offline access for scheduled synchronization;
- AES-GCM encryption before refresh tokens are stored in D1;
- discovery of accessible Google Business locations;
- discovery of accessible Search Console properties;
- owner-only `/api/status` and `/api/data` endpoints;
- D1 schema for profiles, daily aggregates and ranked query/page results;
- Cron handler foundation.

Not implemented/deployed yet:
- production D1 database/binding;
- production Worker secrets;
- Google OAuth client credentials and redirect URI;
- actual Business Profile daily metric synchronization;
- actual Search Console scheduled synchronization;
- Meta/Facebook OAuth and synchronization;
- dashboard calls to this Worker.

The repository intentionally contains only `wrangler.example.jsonc`. There is no deploy-ready `wrangler.jsonc` until real Cloudflare resources and secrets exist, preventing accidental deployment with placeholder IDs.

## Required secrets

Never commit these values:
- `OWNER_UID`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` — base64 of exactly 32 random bytes

The OAuth refresh token is encrypted with AES-GCM before it is stored in D1. The encryption key remains a Worker secret.

## Google scopes

Business Profile and Search Console are authorized separately:
- Google Business: `https://www.googleapis.com/auth/business.manage`
- Search Console: `https://www.googleapis.com/auth/webmasters.readonly`

This avoids requesting unrelated Google access in one large consent screen.

## D1 setup when Cloudflare access is available

1. Create a D1 database named `ivanov-channels`.
2. Apply `schema.sql`.
3. Copy `wrangler.example.jsonc` to `wrangler.jsonc` and insert the real D1 database ID and Worker/dashboard URLs.
4. Set the required Worker secrets using Cloudflare/Wrangler prompts. Do not use plaintext values in the repo or shell history.
5. Enable the required Google APIs and create a Web application OAuth client whose HTTPS redirect URIs exactly match:
   - `<PUBLIC_BASE_URL>/oauth/callback/google_business`
   - `<PUBLIC_BASE_URL>/oauth/callback/search_console`
6. Deploy the Worker.
7. Only after deployment, add owner-only Connect buttons to Ivanov Analytics.

## API outline

- `GET /health` — non-sensitive service health.
- `POST /oauth/start/google_business` — owner token required; returns Google authorization URL.
- `POST /oauth/start/search_console` — owner token required; returns Google authorization URL.
- `GET /oauth/callback/:provider` — state-bound OAuth callback.
- `GET /api/status` — owner token required; connection/profile status.
- `GET /api/data?provider=...&from=YYYY-MM-DD&to=YYYY-MM-DD&profileKey=...` — owner token required; aggregated channel data.

## Security rules

- Never put Google/Meta client secrets or refresh tokens in frontend JavaScript.
- Never trust CORS as authentication; every sensitive API endpoint verifies a Firebase ID token and the owner UID.
- OAuth state is random, expires after 10 minutes and is single-use.
- Refresh tokens are encrypted at rest.
- External API synchronization belongs in the Worker/Cron layer, not on public websites.
- Public Ivanov Remonti pages do not load this Worker and receive no extra JS/network work from these integrations.
