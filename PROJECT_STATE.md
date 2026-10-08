# Текущо състояние — 01.10.2026
## Последни промени
- PR #125 е слят: 42b9c4d8d6ab4b21bb9f5be60a90c411603d1d4c. Само receipts.html: гъвкав район, договор по избор, EUR, дата за ръчна корекция, подписи, предишни плащания и дълги PDF.
- PR #126 е слят в main. Merge commit: 6dfbf26f5049860d92a7f3afec234fe13e636d35. Той добавя Монтана, свободен район, отделен избор на сайт и подобрено пренасяне в PDF.
- PR #127 е слят в main. Merge commit: a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer корекцията е публикувана.
- В цветния PDF районът е премахнат от основния информационен блок. В официалния PDF е премахнат редът „Район на работа“ под датата и е прибрано празното отстояние.
- В двата PDF районът вече се изписва долу вдясно като стойност без заглавие, непосредствено над избрания сайт. Готовите райони са с дискретен регистър („Лом и региона“), свободният район запазва въведения текст, а при липсващ район редът се пропуска.
- След Owner визуален преглед footer-ът е доизпипан: разделителната линия е вдигната, районът е 8 pt и по-тъмен, сайтът е 7.5 pt и по-четим. Това е общо за Аванс, Средства за материали, Завършен етап и Допълнителна работа.
- Footer-ът резервира динамично място за дълъг район и се прилага на всяка страница.
- Ново Owner решение след телефонния тест: премахва се отделният избор на сайт. Branch: fix/receipts-auto-site-by-area. Реализирано: София → основния сайт; Лом → /lom/; Монтана → /montana/; свободен район → основния сайт. English/Deutsch отпадат от формата за нов избор. `websiteKey` се изчислява автоматично при Save. Старите записи пазят историческия сайт при view/PDF; при edit+save се нормализират по района с видимо предупреждение при mismatch. PDF дизайнът не е променян.

## Проверки на footer корекцията
- Новите проверки са отделни от предишните 20 PDF проверки, които важат за версията преди преместването на района.
- JavaScript app script parse: PASS.
- След визуалната корекция: 72/72 проверки PASS с реална jsPDF 2.5.1 и вградените Noto шрифтове за четирите вида × двата PDF варианта. Проверени са правилният район и сайт във footer-а на всяка страница, 8 pt район, 7.5 pt сайт, EUR-only текст и липса на стария label.
- Аванс, Средства за материали и Завършен етап: по 1 страница във всеки PDF. Дълъг стрес тест за Допълнителна работа: 3 страници във всеки PDF; дългият свободен район остава над /de/lom/ на всяка страница.
- Използвани са само примерни данни в паметта. Firebase/auth и реални записи не са използвани.
- Footer корекцията е проверена и на реален телефон с разписка за материали; двата PDF изглеждат правилно.

## Проверки на автоматичния сайт
- App JavaScript parse: PASS.
- Direct resolver: София→sofia, Лом→lom, Монтана→montana, Друго→sofia.
- Preview: точен URL за четирите района; custom field се показва само при „Друго“.
- Изолиран collectFormData: Save записва правилния automatic websiteKey + EUR; липсващ район и празен custom район се блокират.
- Legacy compatibility: стар de/en websiteKey остава при view/PDF; legacy mismatch warning показва стария и автоматичния нов сайт.
- 5-те radio избора, siteManuallyChosen и chooseWebsite() са премахнати.
- Цялата PDF секция от DIGITAL PDF нататък е byte-identical с main след #127; PDF дизайнът и pagination кодът не са пипани.
- Новият автоматичен flow още не е тестван на физически телефон и не е правил Firebase запис.

## NEXT — кратки задачи една по една
1. Draft PR → Owner преглед на новия интерфейс и логика.
2. Само при отделно Owner разрешение: merge.
3. След merge: кратък реален телефонен тест на район → автоматичен сайт → Save → Edit → двата PDF.
4. После отделната EUR задача за avansov-otchet.html.
5. Отложено UX предложение: при смяна на типа бележка може да се загубят непазени данни; не го смесвай с текущата автоматизация.

## Обхват
Авансовият отчет и Бележки имат отделни колекции. Бележката не добавя автоматично плащане в отчета. Тази интеграция не е одобрена за реализация.
Публичните сайтове, Cloudflare, analytics, Firebase правила и реалните записи не са променени в текущата работа.

## Firebase gate
`serviceArea`, `customArea` и `websiteKey` се записват в съществуващите документи на колекцията `receipts`; в репото няма отделна схема/миграция. При новия flow websiteKey остава съществуващото поле, но се изчислява автоматично от serviceArea. Firebase не се пипа профилактично. След финално Owner одобрение и merge се прави една контролирана реална проба от телефон: създаване → редактиране → двата PDF. Ако записът и редактирането работят, Firebase остава без промяна. Само ако реалният тест покаже проблем с permissions/rules/съвместимост, първо се прави конкретен анализ и предложение, после се чака отделно Owner разрешение преди промяна на Firebase правила или данни.


## Analytics side task — 08.10.2026
- Read-only production audit confirmed public analytics ingest/D1/cron are active.
- Facebook OAuth and two page profiles are connected. Production D1 contains Facebook daily data through 08.10.2026, but currently only the ENGAGEMENTS metric is present; missing Meta metrics must not be rendered as numeric zero.
- Branch `fix/analytics-facebook-visible-metrics-20261008`: Facebook cards now render a number only for metrics actually returned by Meta; unavailable metrics render `—`. The Facebook Lom/Sofia comparison is populated only when the metric exists for both pages. The first metric label is aligned with the stored IMPRESSIONS metric and the module cache key is bumped.
- Isolated QA: JavaScript parse PASS for `analytics/facebook-live.js` and `analytics/navigation.js`; representative rows with ENGAGEMENTS-only render `— / real engagement count / — / —`.
- Google Business OAuth exists, but production D1 has zero google_business profiles and zero google_business daily rows. Do not keep waiting silently; next backend diagnostic must expose the exact discovery/sync error.
- Search Console profiles remain marked connected but their latest production daily rows are 02.09.2026; this is a separate sync failure to diagnose.
- Draft PR #124 contains useful sync-health work, but as of 08.10 it has diverged from main (18 commits ahead / 32 behind). Do not merge it directly. Rebuild the approved diagnostic subset cleanly on current main after the Facebook UI task.
- No production, D1 schema/data, Cloudflare bindings/secrets/cron, public tracker or public site was changed in this side task.

## Analytics NEXT
1. Draft PR for the Facebook visibility-only fix → Owner visual review → separate merge permission.
2. Then create a fresh current-main sync-health branch using the reviewed concepts from #124, not a direct merge of #124.
3. With sync-health available, identify exact Google Business discovery error and Search Console sync error before proposing any production/API change.


## Analytics sync-health branch — 08.10.2026
- Branch: `fix/analytics-sync-health-20261008`, based on main after merged PR #129.
- Reimplemented the useful sync-health subset from old PR #124 on current main instead of merging the diverged PR.
- Added additive `channel_sync_status` schema/migration and owner-only status exposure.
- Provider/profile sync results now preserve last attempt, last success, last error and points.
- Daily channel sync now retries profile discovery before syncing Google Business, Search Console and Facebook.
- Important root cause found for Google Business: production cron previously synced only already-discovered profiles. With OAuth token present but zero google_business profiles, later API approval could never be picked up automatically without a new OAuth flow. The new branch retries discovery during scheduled/manual sync.
- Google Business discovery continues to use the documented `accounts/-/locations` Business Information API path.
- Dashboard channel views expose sync error/partial state instead of only "connected".
- Facebook visible-metrics behavior from merged PR #129 is preserved and augmented with sync-health text.
- No D1 migration, Worker deployment, manual sync, production data change, binding/secret/cron change has been performed yet.
- Static JS parse PASS for sync-health.js, sync.js, facebook.js, google.js and all modified analytics modules; service-worker parse PASS. Migration SQL validated in isolated SQLite.
- `index.js` is module syntax and was inspected separately; no production execution has been attempted.

## Analytics sync-health NEXT
1. Draft PR and final branch diff review.
2. Owner approval required before any production migration/deploy.
3. If approved: apply only additive D1 migration → deploy Worker/dashboard → verify /health/status → run one owner-only sync.
4. Read exact Google Business discovery error and Search Console sync error from sync health; only then decide any Google/API remediation.


## Analytics channel correctness repair — 08.10.2026
- Branch: `fix/analytics-channel-correctness-20261008`, based on main after PR #130.
- Scope: Facebook + Google Business correctness, plus shared channel status/cache consistency only.
- Fixed detailed Google/Meta API error preservation instead of status-code-only errors.
- Added Google Business and Facebook discovery pagination.
- Added protection against empty discovery wiping/staling all known profiles.
- Missing profiles now require two consecutive discovery misses before being marked stale.
- Discovery failure no longer prevents syncing already-known connected profiles.
- Google Business discovery now requests/stores serviceArea and resolves known cities from storefront locality, title, website URI or service-area data using boundary-safe matching.
- Google Business missing-profile UI now shows provider sync-health/error details.
- Summary channel cards now use sync-health and count only connected profiles, not stale ones.
- Facebook refreshed metric ranges delete/rebuild the refreshed days so stale values are not presented as newly confirmed data.
- Google Business refreshed range is replaced atomically after a successful Performance API response.
- Channel frontend modules now share one channel-api module version/cache key.
- Static parse QA PASS for all modified JavaScript files.
- Facebook metric names are intentionally NOT guessed/changed yet. Production currently proves only ENGAGEMENTS is stored; exact replacement metrics must be decided from a live Meta response with the new detailed error text.
- No production/deploy/database mutation was performed in this repair branch.

## Analytics channel correctness NEXT
1. Draft PR review/Owner approval.
2. If approved, deploy this repair.
3. Run one normal channel sync and inspect exact Facebook metric errors + Google Business discovery result.
4. Only then change Facebook metric names if Meta confirms deprecation/unavailability; re-run QA before final merge/deploy completion.
