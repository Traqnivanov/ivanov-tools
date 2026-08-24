# Ivanov Geo Worker

Small Cloudflare Worker used by Ivanov Analytics to obtain approximate city and country once per browser session.

## Privacy
- Returns only `city` and two-letter `country`.
- Does not return or store IP address.
- Does not return latitude/longitude, postal code, ISP, region or fingerprint data.
- No KV, D1, R2 or other persistence.
- CORS is limited to the Ivanov Remonti production origins and the GitHub Pages origin.
- Responses are `no-store`.

## Deploy
From this folder with Wrangler authenticated to the target Cloudflare account:

```bash
npx wrangler@latest deploy
```

Cloudflare supplies the geolocation fields on incoming Worker requests through `request.cf`.
