# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: `fix/receipts-date-amount-validation`, based on main after merged PR #136. Owner approved required date and 0 EUR only in drafts. Save validates the calendar date and nonnegative finite amount; finalization requires a valid stored date and positive amount. Four receipt types share the checks. PDF rendering/layout remains unchanged. See latest State/Handoff section for QA and NEXT: draft PR review → separate Owner merge approval → phone check.
