# Ivanov Analytics — production operations notes

## Public analytics ingest

Production public tracking depends on the `ivanov-channels` Worker ingest endpoint:

`https://ivanov-channels.traqnivanov1.workers.dev/ingest`

Verified in Cloudflare production on 2026-08-29:

- `PUBLIC_ANALYTICS_ORIGINS` = `https://ivanov-remonti.com,https://www.ivanov-remonti.com,https://traqnivanov.github.io`
- `ANALYTICS_RATE_LIMITER` = connected Rate Limiter binding, namespace `2026082701`

The Worker intentionally returns `503 rate_limiter_unconfigured` when the rate limiter binding is missing. An origin not present in `PUBLIC_ANALYTICS_ORIGINS` is rejected before analytics storage.

Stage 5AZ adds a dashboard monitor that probes `/ingest` from the real `https://ivanov-remonti.com` origin. It sends an intentionally invalid event and treats only `400 invalid_event_type` as healthy. This proves the Worker route, production origin allowlist and rate limiter are working without inserting a fake analytics row. After three consecutive failures the dashboard shows `Проследяването е спряло от …`.

Tracker 2.1.13 also keeps a bounded local retry queue for network/CORS/429/5xx failures. The queue is capped at 80 events and 48 hours and retries on a later load, `online`, or visibility return.

## Worker origin / fallback

`analytics/channel-config.js` and the tracker use the `workers.dev` hostname directly. There is currently **no second production endpoint or custom Worker domain**, so there is no real automatic fallback to switch to.

If the `workers.dev` hostname becomes unavailable:

- public ingest requests fail and eligible failed events are queued locally by tracker 2.1.13;
- the Stage 5AZ ingest monitor raises a visible dashboard warning after three failed checks;
- dashboard channel API requests can fail until the Worker hostname is reachable again;
- no code should silently substitute another endpoint unless that endpoint has actually been provisioned and verified with equivalent bindings, secrets, CORS/origin rules and deployment state.

A future fallback should only be added after a second real Worker route/custom domain exists and is production-tested.

## Dashboard loaders

`dashboard.js` is **not dead code**. `dashboard-loader.js` fetches and patches it at runtime and also imports it directly as a fallback. Do not delete `dashboard.js` unless the loader architecture is replaced first.

`summary-final.js` is also live. `summary-loader.js` currently applies runtime source patches before importing it. This is known architectural debt: a future cleanup should move those patched behaviors into `summary-final.js` natively and simplify the loader. It is not an ingest emergency and should be changed as a separate, fully regression-tested stage.

## Bot filtering

The tracker currently filters obvious bots by user-agent. This is intentionally only a lightweight client-side filter. A sophisticated browser that executes JavaScript can spoof a normal UA, and adding aggressive client-side heuristics would risk excluding legitimate visitors.

Do not claim the current filter is authoritative bot detection. Stronger filtering should be implemented server-side only when a reliable Cloudflare bot signal is available for the account/plan and can be tested for false positives. The existing ingest rate limiter remains an independent abuse-control layer.
