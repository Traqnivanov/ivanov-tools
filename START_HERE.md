# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: branch fix/receipts-required-date-amount, based on main after merged PR #136. Целта е да няма финализирани бележки без дата или с невалидна нулева сума.

Правила: дата е задължителна за всички типове; РЕ/ДР изискват сума > 0; АВ/РМ могат да останат без въведена сума само за ръчно попълване в PDF, но изрично въведено 0 не е валидна сума. При АВ автоматичен остатък се използва само когато има реално въведена сума; предишни плащания не могат да стоят без обща стойност. PDF rendering/layout кодът не се променя. След QA → draft PR → Owner преглед → отделно merge разрешение.
