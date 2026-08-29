# Ivanov Analytics

Production dashboard:
`https://traqnivanov.github.io/ivanov-tools/analytics/`

## Current architecture

- Public tracker sends analytics events to Cloudflare Worker `ivanov-channels`.
- Worker validates and rate-limits public ingest and stores new analytics events in D1.
- Firestore is owner-only and remains the historical source for older analytics data.
- Dashboard merges historical Firestore data with newer D1 events.
- Owner-only Worker APIs expose protected channel, event and summary data.
- Google/Search integrations are synchronized by backend cron, not by frontend manual sync.
- Production cron is `17 3 * * *`.

## What is tracked

- page views and sessions;
- sessions expire after 30 minutes without visitor activity; returning after that starts a new session even if the browser tab was left open;
- engagement thresholds and scroll depth;
- phone, Viber and successful form actions;
- initial source for the session, UTM and Google Ads attribution;
- device, browser and operating system;
- approximate city and country through `ivanov-geo`.

The analytics event store does not record name, phone number, form text, full IP address or persistent fingerprint. IP is used only transiently by the Worker rate limiter and is not stored in analytics data.

## Geo and forms

Geo is requested once per session and stored as a separate `session_geo` event containing only approximate city and country.

`form_submit` records a submit attempt. `form_success` is recorded only after the site confirms a successful form result.

## Dashboard

Main areas include:

- `Обобщение` — business-focused overview;
- `Всички страници` — tracked pages including pages with zero visits;
- per-page statistics;
- `Резултати` and `Източници`;
- external channel views for Google Business, Search Console and Google Ads tracker attribution;
- `Система и настройки` — technical and storage status.

## Daily and monthly summaries

Stage 5 daily/monthly summary infrastructure is active in production D1:

- `analytics_daily_summaries`
- `analytics_monthly_summaries`

The Worker refreshes summaries from the scheduled cron. Summary calculations use `Europe/Sofia` day boundaries and are aligned with dashboard engagement semantics before they are used for long-range business reporting.

The dashboard has a protected live status check for the summary system. Until the first scheduled summary rows exist, it reports that the system is active and waiting for the first cron-generated summary rather than pretending data already exists.

## Retention

Automatic 90-day event deletion is **not enabled**.

No retention cleanup should be activated without a separate explicit production decision and verification that required long-term reporting is safely covered by summaries.

## External channels

- Search Console: connected and cron-driven.
- Google Business: OAuth authorization exists, but Business Profile API location access is currently waiting on Google API approval/quota.
- Google Ads: dashboard attribution is based on tracker/UTM data; it is not presented as a direct Google Ads API integration.
- Facebook/Meta: future work; no production Meta API integration is active.

## App installation

Open:
`https://traqnivanov.github.io/ivanov-tools/analytics/`

The dashboard can be installed as a PWA from supported browsers/devices. Analytics data continues to be read from the protected production sources described above.
