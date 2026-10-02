# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: branch fix/receipts-auto-site-by-area. Owner отмени отделния избор на сайт в „Бележки“. За нов/редактиран запис районът автоматично определя сайта; English/Deutsch не се предлагат за нов избор. Старите записи запазват историческия websiteKey при view/PDF, но при edit+save се нормализират по района с предупреждение при mismatch.

PDF дизайнът от #127 не се променя. Firebase rules/schema/реални данни не се пипат в тази задача. След QA → draft PR → Owner преглед → отделно merge разрешение → реален телефонен тест на новия автоматичен flow. После отделната EUR задача за avansov-otchet.html.
