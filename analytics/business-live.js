import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';
import { loadChannelStatus } from './channel-api.js?v=20260829-stage5e';

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

function normalizeCity(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'лом' || text === 'lom' || text.includes(' лом')) return 'Лом';
  if (text === 'софия' || text === 'sofia' || text.includes(' софия') || text.includes(' sofia')) return 'София';
  return '';
}

function cityForProfile(profile) {
  return normalizeCity(profile.city) || normalizeCity(profile.label) || normalizeCity(profile.profile_key);
}

function fmt(value) {
  return new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 }).format(Math.round(Number(value || 0)));
}

function totals(rows) {
  const sums = new Map();
  for (const row of rows || []) {
    sums.set(row.metric, (sums.get(row.metric) || 0) + Number(row.value || 0));
  }
  const impressions =
    (sums.get('BUSINESS_IMPRESSIONS_DESKTOP_MAPS') || 0) +
    (sums.get('BUSINESS_IMPRESSIONS_MOBILE_MAPS') || 0) +
    (sums.get('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') || 0) +
    (sums.get('BUSINESS_IMPRESSIONS_MOBILE_SEARCH') || 0);
  return {
    impressions,
    calls: sums.get('CALL_CLICKS') || 0,
    website: sums.get('WEBSITE_CLICKS') || 0,
    directions: sums.get('BUSINESS_DIRECTION_REQUESTS') || 0,
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
  const output = hasData
    ? [values.impressions, values.calls, values.website, values.directions].map(fmt)
    : ['—', '—', '—', '—'];
  output.forEach((value, index) => { if (nodes[index]) nodes[index].textContent = value; });
}

function setCardNote(card, text) {
  let note = card.querySelector('.gb-live-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'channel-status gb-live-note';
    card.appendChild(note);
  }
  note.textContent = text;
}

function compareLabel(cityValues, key) {
  const lom = cityValues.get('Лом');
  const sofia = cityValues.get('София');
  if (!lom?.hasData || !sofia?.hasData) return '—';
  const a = Number(lom.values[key] || 0);
  const b = Number(sofia.values[key] || 0);
  if (a === b) return `Равни · ${fmt(a)}`;
  return a > b ? `Лом · ${fmt(a)}` : `София · ${fmt(b)}`;
}

function updateComparison(shell, cityValues) {
  const compare = shell.querySelector('.business-compare');
  if (!compare) return;
  const values = compare.querySelectorAll('.business-compare-grid strong');
  const output = [
    compareLabel(cityValues, 'calls'),
    compareLabel(cityValues, 'website'),
    compareLabel(cityValues, 'directions'),
  ];
  output.forEach((value, index) => { if (values[index]) values[index].textContent = value; });
  const note = compare.querySelector('.card-note');
  if (note) note.textContent = 'Сравнението използва само реалните Google Business действия за избрания период.';
}

function clearComparison(shell, noteText = 'Сравнението временно не е достъпно.') {
  const compare = shell.querySelector('.business-compare');
  if (!compare) return;
  compare.querySelectorAll('.business-compare-grid strong').forEach(node => { node.textContent = '—'; });
  const note = compare.querySelector('.card-note');
  if (note) note.textContent = noteText;
}

async function loadBusiness(shell) {
  const token = ++renderToken;
  const status = await loadChannelStatus();
  if (token !== renderToken || !document.contains(shell)) return;

  const connected = (status.connections || []).some(item => item.provider === 'google_business');
  const profiles = (status.profiles || []).filter(item => item.provider === 'google_business' && item.status === 'connected');
  const cards = [...shell.querySelectorAll('.business-profile-card')];

  if (!connected) {
    cards.forEach(card => {
      setCardState(card, 'Не е свързано', false);
      setCardMetrics(card, {}, false);
    });
    clearComparison(shell, 'Сравнение ще има след свързване на Google Business профилите.');
    return;
  }

  const period = range();
  const cityValues = new Map();

  for (const card of cards) {
    const city = card.querySelector('h2')?.textContent?.trim() || '';
    const profile = profiles.find(item => cityForProfile(item) === city);
    if (!profile) {
      setCardState(card, 'Няма профил', false);
      setCardMetrics(card, {}, false);
      setCardNote(card, `Няма открит свързан Google Business профил за ${city}.`);
      cityValues.set(city, { hasData: false, values: {} });
      continue;
    }

    const key = encodeURIComponent(profile.profile_key);
    const response = await ownerFetch(`/api/data?provider=google_business&profileKey=${key}&from=${period.from}&to=${period.to}`);
    if (token !== renderToken || !document.contains(shell)) return;
    const rows = response.data || [];
    const values = totals(rows);
    const hasData = rows.length > 0;

    setCardState(card, 'Свързано', true);
    setCardMetrics(card, values, hasData);
    setCardNote(
      card,
      hasData
        ? `Google Business данни за ${period.from} – ${period.to}. Последният ден се появява след дневния backend sync.`
        : `Връзката е активна, но за ${period.from} – ${period.to} още няма синхронизирани Google Business дневни данни.`,
    );
    cityValues.set(city, { hasData, values });
  }

  updateComparison(shell, cityValues);
}

function decorate() {
  document.querySelectorAll('[data-external-shell="business"]').forEach(shell => {
    if (shell.dataset.gbLiveLoading === '1') return;
    const run = String(++loadSequence);
    shell.dataset.gbLiveLoading = '1';
    shell.dataset.gbLiveRun = run;
    loadBusiness(shell)
      .catch(error => {
        if (!document.contains(shell) || shell.dataset.gbLiveRun !== run) return;
        shell.querySelectorAll('.business-profile-card').forEach(card => {
          setCardState(card, 'Грешка', false);
          setCardMetrics(card, {}, false);
          setCardNote(card, `Не мога да заредя Google Business: ${error.message}`);
        });
        clearComparison(shell);
      })
      .finally(() => {
        if (document.contains(shell) && shell.dataset.gbLiveRun === run) shell.dataset.gbLiveLoading = '0';
      });
  });
}

function forceDecorate(delay = 100) {
  renderToken++;
  setTimeout(() => {
    document.querySelectorAll('[data-external-shell="business"]').forEach(shell => { shell.dataset.gbLiveLoading = '0'; });
    decorate();
  }, delay);
}

new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('change', event => {
  if (['siteFilter', 'periodFilter', 'dateFrom', 'dateTo'].includes(event.target?.id)) forceDecorate(160);
});
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('#refreshBtn,[data-external-view="business"],[data-channel="business"]')) forceDecorate(160);
});
window.addEventListener('focus', () => forceDecorate(80));
decorate();
