# Започни оттук — Ivanov Tools
Repo: Traqnivanov/ivanov-tools. Този проект е личният набор инструменти на Owner за ремонтната работа; не е rodeni-v-lom и не е ivanov-remonti-3d.

Прочети последователно PROJECT_STATE.md, WORK_CONTROLLER_HANDOFF.md, PROJECT_RULES_00_READ_FIRST.md, PRODUCT_MASTER_VISION_AUDIT.md и docs/RECEIPTS_REVIEW.md. Не започвай отначало и не прави нов общ одит.

Потвърдено: PR #127 е слят в main с merge commit a9bd2f75b0ad399ed2ee526a6c0a1714be35bc6e. Footer-ът на двата PDF е публикуван.

CURRENT TASK: branch fix/receipts-annul-numbering, based on main after merged PR #134. Целта е издадена/съществуваща бележка да не се изтрива физически и номерът ѝ да не може да бъде използван повторно. Вместо „Изтрий“ се използва „Анулирай“: записът остава в историята със същия номер и се маркира като анулиран.

Обхватът е само receipts.html + документация. PDF layout/rendering кодът, Firebase rules, автоматичният сайт по район и останалите инструменти не се променят. Реален Firestore запис не се прави по време на QA. След QA → draft PR → Owner преглед → отделно merge разрешение.
