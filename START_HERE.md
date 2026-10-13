# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: branch fix/receipts-issued-finalized, based on main after merged PR #135. Целта е клиентски документ да не може да бъде тихо променян със същия номер след издаване. Нов/редактиран запис се пази като чернова; при „Финализирай“ става издаден и съдържанието се заключва. Клиентски PDF се генерира само от финализиран запис.

Обхватът е receipts.html + документация. PDF rendering/layout функциите остават byte-identical с main; няма Firebase rules/migration промяна и няма реални Firestore QA записи. Старите записи без status не се мигрират автоматично и остават редактирани до изрично финализиране. След QA → draft PR → Owner преглед → отделно merge разрешение.
