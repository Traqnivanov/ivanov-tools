import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';
import { loadChannelStatus, syncHealthFor, syncHealthSummary } from './channel-api.js?v=20261008-correct1';

let renderToken = 0;
let loadSequence = 0;

function user() {
  const app = getApps()[0];
  return app ? getAuth(app).currentUser : null;
}

async function ownerFetch(path) {
  const current = user();
  if (!current) throw new Error('Няма активен вход.');
  const token = await current.getIdToken();
  const response = await fetch(`${CHANNEL_WORKER_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function range() {
  const value = window.IvanovPeriods.rangeFromControls();
  return { from: value.from, to: value.to };
}

function cardCity(card) {
  const text = card.querySelector('h2')?.textContent || '';
  if (text.includes('Лом')) return 'Лом';
  if (text.includes('София')) return 'София';
  return '';
}

function fmt(value) {
  return new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
}

function totals(rows) {
  const sums = new Map();
  const present = new Set();
  for (const row of rows || []) {
    present.add(row.metric);
    sums.set(row.metric, (sums.get(row.metric) || 0) + Number(row.value || 0));
  }
  return {
    impressions: sums.get('IMPRESSIONS') || 0,
    engagements: sums.get('ENGAGEMENTS') || 0,
    fanAdds: sums.get('FAN_ADDS') || 0,
    present,
  };
}

function setCardState(card, text, connected = true) {
  const state = card.querySelector('.channel-state');
  if (!state) return;
  state.textContent = text;
  state.classList.toggle('pending', !connected);
  state.classList.toggle('connected', connected);
}

function setCardMetrics(card, values, hasData) {
  const nodes = card.querySelectorAll('.business-kpis .channel-metric strong');
  const metric = (key, value) => hasData && values.present?.has(key) ? fmt(value) : '—';
  const output = [
    metric('IMPRESSIONS', values.impressions),
    metric('ENGAGEMENTS', values.engagements),
    metric('FAN_ADDS', values.fanAdds),
    '—',
  ];
  output.forEach((value, index) => { if (nodes[index]) nodes[index].textContent = value; });
}

function setCardNote(card, text) {
  let note = card.querySelector('.fb-live-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'channel-status fb-live-note';
    card.appendChild(note);
  }
  note.textContent = text;
}

function facebookDataNote(values, period, hasData) {
  if (!hasData) return `Връзката е активна, но за ${period.from} – ${period.to} още няма синхронизирани Facebook дневни данни.`;
  const available = [];
  if (values.present?.has('IMPRESSIONS')) available.push(`показвания ${fmt(values.impressions)}`);
  if (values.present?.has('ENGAGEMENTS')) available.push(`взаимодействия ${fmt(values.engagements)}`);
  if (values.present?.has('FAN_ADDS')) available.push(`нови последователи ${fmt(values.fanAdds)}`);
  const missing = [];
  if (!values.present?.has('IMPRESSIONS')) missing.push('показвания');
  if (!values.present?.has('ENGAGEMENTS')) missing.push('взаимодействия');
  if (!values.present?.has('FAN_ADDS')) missing.push('нови последователи');
  const availableText = available.length ? `Налични: ${available.join(' · ')}.` : 'Има редове от Meta, но няма разпознат показател.';
  const missingText = missing.length ? ` Meta не е върнал: ${missing.join(', ')}.` : '';
  return `Facebook данни за ${period.from} – ${period.to}. ${availableText}${missingText} „Кликове към сайта" все още не е свързан показател.`;
}

function compareValue(cityValues, key, metricName) {
  const lom = cityValues.get('Лом');
  const sofia = cityValues.get('София');
  if (!lom?.values?.present?.has(metricName) || !sofia?.values?.present?.has(metricName)) return '—';
  const a = Number(lom.values[key] || 0);
  const b = Number(sofia.values[key] || 0);
  if (a === b) return `Равни · ${fmt(a)}`;
  return a > b ? `Лом · ${fmt(a)}` : `София · ${fmt(b)}`;
}

function updateFacebookComparison(shell, cityValues) {
  const compare = shell.querySelector('.business-compare');
  if (!compare) return;
  const values = compare.querySelectorAll('.business-compare-grid strong');
  const output = [
    compareValue(cityValues, 'impressions', 'IMPRESSIONS'),
    compareValue(cityValues, 'engagements', 'ENGAGEMENTS'),
    '—',
  ];
  output.forEach((value, index) => { if (values[index]) values[index].textContent = value; });
  const note = compare.querySelector('.card-note');
  if (note) note.textContent = 'Сравняват се само показатели, които Meta реално е върнал и за двете страници.';
}

async function loadFacebook(shell) {
  const token = ++renderToken;
  const status = await loadChannelStatus();
  if (token !== renderToken || !document.contains(shell)) return;

  const connected = (status.connections || []).some(item => item.provider === 'facebook');
  const providerHealth = syncHealthFor(status, 'facebook');
  const profiles = (status.profiles || []).filter(item => item.provider === 'facebook' && item.status === 'connected');
  const cards = [...shell.querySelectorAll('.facebook-page-card')];

  if (!connected) {
    cards.forEach(card => {
      setCardState(card, 'Не е свързано', false);
      setCardMetrics(card, {}, false);
    });
    return;
  }

  const period = range();
  const cityValues = new Map();

  for (const card of cards) {
    const city = cardCity(card);
    const profile = profiles.find(item => item.city === city);
    if (!profile) {
      setCardState(card, 'Няма страница', false);
      setCardMetrics(card, {}, false);
      setCardNote(card, `Няма открита свързана Facebook страница за ${city || 'този град'}.`);
      cityValues.set(city, { hasData: false, values: { present: new Set() } });
      continue;
    }

    const key = encodeURIComponent(profile.profile_key);
    const response = await ownerFetch(`/api/data?provider=facebook&profileKey=${key}&from=${period.from}&to=${period.to}`);
    if (token !== renderToken || !document.contains(shell)) return;
    const rows = response.data || [];
    const values = totals(rows);
    const hasData = rows.length > 0;

    const health = syncHealthFor(status, 'facebook', profile.profile_key) || providerHealth;
    const syncProblem = ['error', 'partial'].includes(health?.last_status);
    const healthText = syncHealthSummary(health);
    setCardState(
      card,
      syncProblem ? (health.last_status === 'partial' ? 'Частичен sync' : 'Sync проблем') : 'Свързано',
      !syncProblem,
    );
    setCardMetrics(card, values, hasData);
    setCardNote(card, facebookDataNote(values, period, hasData) + (healthText ? ` ${healthText}.` : ''));
    cityValues.set(city, { hasData, values });
  }

  updateFacebookComparison(shell, cityValues);
}

function decorate() {
  document.querySelectorAll('[data-external-shell="facebook"]').forEach(shell => {
    if (shell.dataset.fbLiveLoading === '1') return;
    const run = String(++loadSequence);
    shell.dataset.fbLiveLoading = '1';
    shell.dataset.fbLiveRun = run;
    loadFacebook(shell)
      .catch(error => {
        if (!document.contains(shell) || shell.dataset.fbLiveRun !== run) return;
        shell.querySelectorAll('.facebook-page-card').forEach(card => {
          setCardState(card, 'Грешка', false);
          setCardMetrics(card, {}, false);
          setCardNote(card, `Не мога да заредя Facebook: ${error.message}`);
        });
      })
      .finally(() => {
        if (document.contains(shell) && shell.dataset.fbLiveRun === run) shell.dataset.fbLiveLoading = '0';
      });
  });
}

function forceDecorate(delay = 100) {
  renderToken++;
  setTimeout(() => {
    document.querySelectorAll('[data-external-shell="facebook"]').forEach(shell => { shell.dataset.fbLiveLoading = '0'; });
    decorate();
  }, delay);
}

new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('change', event => {
  if (['siteFilter', 'periodFilter', 'dateFrom', 'dateTo'].includes(event.target?.id)) forceDecorate(160);
});
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('#refreshBtn,[data-external-view="facebook"],[data-channel="facebook"]')) forceDecorate(160);
});
window.addEventListener('focus', () => forceDecorate(80));
decorate();
