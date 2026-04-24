// ═══════════════════════════════════════════
// Ivanov Remonti — Общи услуги и цени
// Промяна тук → важи за оферта и калкулатор
// Цени в EUR | 1 EUR = 1.95583 лв
// ═══════════════════════════════════════════

const EUR_BGN = 1.95583;

const SERVICES = [

  // ── ШПАКЛОВКА ──────────────────────────
  { id:'s1',  name:'Основна укрепваща шпакловка', eur:8.18,  unit:'м²', calc_key:'putty_osnovna_m2',  group:'Шпакловка' },
  { id:'s2',  name:'Гипсова шпакловка',           eur:6.14,  unit:'м²', calc_key:'putty_gipsova_m2', group:'Шпакловка' },
  { id:'s3',  name:'Фина шпакловка',              eur:5.50,  unit:'м²', calc_key:'putty_fina_m2',    group:'Шпакловка' },
  { id:'s4',  name:'Шпакловка на фуги',           eur:4.09,  unit:'м²', calc_key:'putty_fugi_m2',    group:'Шпакловка' },

  // ── БОЯДИСВАНЕ ─────────────────────────
  { id:'s5',  name:'Боядисване – Бяло',           eur:4.20,  unit:'м²', calc_key:null, group:'Боядисване' },
  { id:'s6',  name:'Боядисване – Стени и тавани', eur:4.80,  unit:'м²', calc_key:null, group:'Боядисване' },
  { id:'s7',  name:'Боядисване – Премиум',        eur:6.80,  unit:'м²', calc_key:null, group:'Боядисване' },
  { id:'s8',  name:'Боядисване с корекции',       eur:7.82,  unit:'м²', calc_key:null, group:'Боядисване' },
  { id:'s9',  name:'Грунд (полагане)',             eur:1.02,  unit:'м²', calc_key:null, group:'Боядисване' },
  { id:'s10', name:'Шлайфане',                    eur:2.05,  unit:'м²', calc_key:null, group:'Боядисване' },

  // ── ГИПСОКАРТОН ────────────────────────
  { id:'s11', name:'Гипсокартон – Прав таван',         eur:15.00, unit:'м²',   calc_key:'gk_ceil_m2',  group:'Гипсокартон' },
  { id:'s12', name:'Гипсокартон – LED ниша',           eur:26.00, unit:'л.м.', calc_key:null,          group:'Гипсокартон' },
  { id:'s13', name:'Гипсокартон – Предстенна обшивка', eur:14.00, unit:'м²',   calc_key:'gk_wall_m2',  group:'Гипсокартон' },
  { id:'s14', name:'Гипсокартон – Преградна стена',    eur:25.00, unit:'м²',   calc_key:'gk_part_m2',  group:'Гипсокартон' },

  // ── ПРОЗОРЦИ ───────────────────────────
  { id:'s15', name:'Обръщане на прозорци',        eur:7.67,  unit:'л.м.', calc_key:null, group:'Прозорци' },

  // ── ВиК ────────────────────────────────
  { id:'s16', name:'ВиК – Смяна на смесител',     eur:18.00, unit:'бр.',   calc_key:null, group:'ВиК' },
  { id:'s17', name:'ВиК – Тоалетна чиния',        eur:50.00, unit:'бр.',   calc_key:null, group:'ВиК' },
  { id:'s18', name:'ВиК – Сифон/гъвкава връзка',  eur:15.00, unit:'бр.',   calc_key:null, group:'ВиК' },
  { id:'s19', name:'ВиК – Смяна на тръби',        eur:15.00, unit:'точка', calc_key:null, group:'ВиК' },

];

// Помощни функции
function svcEur(s)  { return s.eur; }
function svcLv(s)   { return Math.round(s.eur * EUR_BGN * 100) / 100; }
function eurToLv(e) { return Math.round(e * EUR_BGN * 100) / 100; }
function lvToEur(l) { return Math.round(l / EUR_BGN * 100) / 100; }
