# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: branch fix/receipts-lock-type-on-edit, based on main after merged PR #133. При редакция на вече съществуваща бележка типът ѝ трябва да остане неизменен (АВ/РМ/РЕ/ДР), за да няма документ с номер от един тип и съдържание от друг.

Обхватът е само receipts.html + документация. PDF кодът, Firebase rules/schema/реални данни, автоматичният сайт по район и останалите инструменти не се пипат. След QA → draft PR → Owner преглед → отделно merge разрешение.
