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
  for (const row of rows || []) {
    sums.set(row.metric, (sums.get(row.metric) || 0) + Number(row.value || 0));
  }
  return {
    impressions: sums.get('IMPRESSIONS') || 0,
    engagements: sums.get('ENGAGEMENTS') || 0,
    fanAdds: sums.get('FAN_ADDS') || 0,
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
    ? [values.impressions, values.engagements, values.fanAdds, '—'].map(value => (value === '—' ? value : fmt(value)))
    : ['—', '—', '—', '—'];
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

async function loadFacebook(shell) {
  const token = ++renderToken;
  const status = await loadChannelStatus();
  if (token !== renderToken || !document.contains(shell)) return;

  const connected = (status.connections || []).some(item => item.provider === 'facebook');
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

  for (const card of cards) {
    const city = cardCity(card);
    const profile = profiles.find(item => item.city === city);
    if (!profile) {
      setCardState(card, 'Няма страница', false);
      setCardMetrics(card, {}, false);
      setCardNote(card, `Няма открита свързана Facebook страница за ${city || 'този град'}.`);
      continue;
    }

    const key = encodeURIComponent(profile.profile_key);
    const response = await ownerFetch(`/api/data?provider=facebook&profileKey=${key}&from=${period.from}&to=${period.to}`);
    if (token !== renderToken || !document.contains(shell)) return;
    const rows = response.data || [];
    const values = totals(rows);
    const hasData = rows.length > 0;

    setCardState(card, 'Свързано', true);
    setCardMetrics(card, values, hasData);
    setCardNote(
      card,
      hasData
        ? `Facebook данни за ${period.from} – ${period.to}. „Кликове към сайта" все още не е свързан показател.`
        : `Връзката е активна, но за ${period.from} – ${period.to} още няма синхронизирани Facebook дневни данни.`,
    );
  }
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
