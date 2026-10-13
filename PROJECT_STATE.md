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


## Analytics Facebook current metrics validation — 08.10.2026
- Fundamental channel correctness repair PR #131 is merged; stable production Worker version remains 112 after diagnostics.
- One-shot live diagnostic proved Google Business is working: 2 connected profiles (Лом + София), both sync `ok`, 98 points total for 01–07.10.2026, no provider/profile errors.
- Exact Facebook root cause confirmed from Meta: legacy `page_impressions` and `page_fan_adds` both return `(#100) The value must be a valid insights metric` on both Pages.
- Branch `fix/facebook-current-metrics-20261008` replaces those legacy metrics with:
  - `page_media_view` → `MEDIA_VIEWS`
  - `page_post_engagements` → `ENGAGEMENTS`
  - `page_daily_follows` → `DAILY_FOLLOWS`
  - `page_views_total` → `PAGE_VIEWS`
- Live one-shot validation with the exact new metric set succeeded for both Facebook Pages: provider `ok`, 2/2 successful profiles, 56 points, zero metric errors.
- Validation totals for 01–07.10.2026:
  - Лом: MEDIA_VIEWS 11,387; ENGAGEMENTS 987; DAILY_FOLLOWS 4; PAGE_VIEWS 141.
  - София: MEDIA_VIEWS 14; ENGAGEMENTS 0; DAILY_FOLLOWS 0; PAGE_VIEWS 1.
- Additional date bug confirmed and fixed: Meta daily `end_time` represents the end boundary of the day, so storing its calendar date directly created future/off-by-one rows. Sync now stores `end_time - 1 day`, uses completed Europe/Sofia days only, and validated latest day is 07.10.2026 (no 08/09.10 future rows).
- Legacy `IMPRESSIONS` / `FAN_ADDS` rows are removed by the refreshed Facebook sync; current metric rows are now in D1 from the validation run.
- Dashboard labels/logic are aligned to the current metric keys: Преглеждания, Взаимодействия, Нови последователи, Посещения на страницата. Facebook comparison uses Media Views / Engagements / Daily Follows.
- Temporary diagnostic route was removed from the branch after validation. Production Worker was restored to stable version 112 after the one-shot test.
- Search Console returned separate 403 permission errors during the diagnostic; that is outside this Facebook + Google Business repair scope and must be handled separately.

## Analytics current metrics NEXT
1. Final diff/parse review of `fix/facebook-current-metrics-20261008`.
2. Draft PR for Owner review.
3. Do not merge/deploy until Owner approval.
4. After approved merge/deploy, run one normal sync and verify dashboard values match D1 current metrics.


## Analytics Facebook current metrics validation — 08.10.2026
- Branch: `fix/facebook-current-metrics-20261008`, based on main after PR #131.
- Live one-shot validation completed against production bindings/D1.
- Facebook now uses current working daily metrics: `page_media_view`, `page_post_engagements`, `page_daily_follows`, `page_views_total`.
- Storage keys/UI: MEDIA_VIEWS, ENGAGEMENTS, DAILY_FOLLOWS, PAGE_VIEWS.
- Facebook day alignment was corrected to completed Sofia days; stored latest day is 07.10 when validation ran on 08.10.
- Validation result: both Facebook pages status OK, 28 points each / 56 total, no metric errors.
- Lom 01–07.10: MEDIA_VIEWS 11387, ENGAGEMENTS included, DAILY_FOLLOWS 4, PAGE_VIEWS 141. Sofia: MEDIA_VIEWS 14, DAILY_FOLLOWS 0, PAGE_VIEWS 1; engagement remains 0.
- Legacy IMPRESSIONS/FAN_ADDS rows are removed by the new refresh path; future refreshes rebuild the selected completed-day range.
- Google Business also validated successfully in the same one-shot sync: 2 profiles discovered, 2 synced, 98 points, provider status OK.
- Search Console is a separate issue: Google returns 403 insufficient permission for both discovered properties; do not mix that fix into Facebook/Business completion.
- Static JS parse PASS for all modified Facebook/frontend files.
- Temporary diagnostic endpoint/version must not remain in final production. Final branch has normal /health and no diagnostic route.

## Analytics Facebook/Business NEXT
1. Merge the current-metrics branch.
2. Promote the clean non-diagnostic Worker build.
3. Verify production /health, cron 17 3 * * *, Facebook/GBP sync health and dashboard values.
4. Treat Search Console 403 as a separate follow-up.


## Digital PDF print-header fix — 13.10.2026
- Owner reported from a real physical print that the small text in the dark header of the colored Digital PDF is too low-contrast to read reliably on paper.
- Branch: `fix/receipts-digital-print-header`, based exactly on main `f01b4271531a9caefbb653f2b1269b27c5091c4a`.
- Scope is intentionally minimal and only in `receipts.html` → shared `generateDigitalPDF()` header used by all four receipt types.
- Changed only the small header typography: left subtitle 7 pt → 8 pt; right contact/site lines 7.5 pt → 8.5 pt; both from `MUTED #6b85a0` to light `#e2e8f0`.
- Header coordinates, dark background, logo, type bar, content, footer, pagination, receipt data logic, automatic site logic, Official PDF and Firebase are unchanged.
- Diff check against main: `receipts.html` only, 2 additions / 2 deletions. Branch is 1 commit ahead and 0 behind before documentation-only follow-up.
- Static safety checks PASS: one shared Digital PDF generator, all four receipt types use it, Official PDF code is outside the changed lines, no positions or data fields changed.
- Limitation: physical printer output cannot be validated inside the repository tooling. A real print remains the final acceptance test for the print-specific defect.
- NEXT: documentation commit → final branch diff review → draft PR for Owner review. No merge/live change without separate Owner approval.


### Owner validation / merge authorization — 13.10.2026
- Owner printed the isolated test PDF on the real printer and confirmed the adjusted Digital PDF header is readable: “Ок е така”.
- Owner explicitly authorized merge of PR #133.
- Physical-print acceptance: PASS for the corrected small header text.
- No further PDF layout changes are included.
- NEXT after merge: verify PR #133 is merged into main and stop; no additional production changes.


## Receipts type-lock task — 13.10.2026
- Branch: `fix/receipts-lock-type-on-edit`, based exactly on main `55bdc9cb4cd878e73a66b64650dc01516c104881`.
- Owner approved the first post-audit repair: an existing receipt must keep its original type during Edit.
- Implemented in `receipts.html`: all type buttons are disabled while editing, the UI shows that the type is locked, `switchType()` refuses a type change when `selectedId` exists, and `collectFormData()` rejects any mismatched existing type as a second safety gate.
- New receipt creation still allows normal type switching.
- PDF section from `// ── DIGITAL PDF ──` onward is byte-identical to main. Firebase/data/site logic is unchanged.
- QA PASS: app inline JavaScript parses; new-form switch changes АВ→РМ and rerenders once; edit-mode switch attempt leaves type unchanged and does not rerender; disabled binding + lock note present; save invariant blocks mismatched type; branch is based on current main.
- No main/live merge yet.

### NEXT
1. Final diff review.
2. Draft PR for Owner review.
3. Merge only after separate Owner approval.
4. After this task, next audit item is numbering / annulment logic; do not combine it into this PR.


## Receipts annulment / numbering task — 13.10.2026
- Branch: `fix/receipts-annul-numbering`, based exactly on main `7fd9f24839085c3360cc078d616f09038d2f90fc` after merged PR #134.
- Owner approved the next audit repair: preserve numbering by replacing permanent delete with annulment.
- Implemented in `receipts.html`:
  - permanent delete path removed from the UI and application logic;
  - active receipt action is now „Анулирай“ with explicit confirmation;
  - annulment keeps the same Firestore document/id, number and content and adds `status:'annulled'` + `annulledAt`;
  - annulled records remain in `allReceipts`, so `nextNumber()` continues above them and does not reuse their number;
  - list/view clearly mark annulled receipts;
  - annulled receipt cannot be edited and active PDF buttons are not exposed for it;
  - save-time guard also rejects editing an annulled record.
- Legacy records without `status` are treated as active.
- Digital and Official PDF generator function bodies are byte-identical to main; no PDF layout/rendering change.
- Firestore rules/schema/migration are unchanged. No real Firebase write/delete was used during QA.
- QA PASS:
  - app JS parse;
  - isolated annulment keeps record count unchanged and preserves number/id/content;
  - existing annulled number remains counted by `nextNumber()`;
  - edit and save guards block annulled record;
  - active receipt flow remains separate.
- Historical caveat: a number from a record that was physically deleted before this change cannot be reconstructed from the current collection. From this change forward, annulled records preserve the sequence.
- Residual concurrency caveat: numbering is still derived client-side from the loaded receipt list. Two simultaneous new receipts from separate tabs/devices could theoretically choose the same next number; solving that requires a separate atomic-counter/transaction design and is NOT included in this task.

### NEXT
1. Final diff review.
2. Draft PR for Owner review.
3. Merge only after separate Owner approval.
4. Then handle the separate „issued/finalized receipt“ audit item; do not mix it into this PR.
