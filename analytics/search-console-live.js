import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';
import { loadChannelStatus } from './channel-api.js?v=20260829-stage5e';

const RANKING_CACHE_MS = 60000;
const rankingCache = new Map();
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

function clearRankingCache() {
  rankingCache.clear();
}

function rankingRows(profileKey, dimension) {
  const cacheKey = `${profileKey}|${dimension}`;
  const now = Date.now();
  const cached = rankingCache.get(cacheKey);
  if (cached && now - cached.createdAt < RANKING_CACHE_MS) return cached.promise;
  const key = encodeURIComponent(profileKey);
  const promise = ownerFetch(`/api/rankings?provider=search_console&profileKey=${key}&dimension=${dimension}`)
    .then(body => body.data || [])
    .catch(error => {
      if (rankingCache.get(cacheKey)?.promise === promise) rankingCache.delete(cacheKey);
      throw error;
    });
  rankingCache.set(cacheKey, { createdAt: now, promise });
  return promise;
}

function range() {
  const value = window.IvanovPeriods.rangeFromControls();
  return { from: value.from, to: value.to };
}

function classify(profile) {
  const city = String(profile.city || '').toLowerCase();
  const key = String(profile.profile_key || '').toLowerCase();
  const value = `${key} ${profile.label || ''}`.toLowerCase();
  if (key === 'sc-city:lom' || city === 'лом' || city === 'lom' || value.includes('/lom/') || value.endsWith('/lom') || value.includes(' lom')) return 'lom';
  if (key === 'sc-city:sofia' || city === 'софия' || city === 'sofia' || value.includes('/sofia/') || value.endsWith('/sofia') || value.includes(' sofia')) return 'sofia';
  if (value.includes('sc-domain:')) return 'global';
  try {
    const raw = (profile.profile_key || '').replace(/^sc:/, '');
    if (/^https?:/i.test(raw)) {
      const url = new URL(raw);
      if (url.pathname === '/' || url.pathname === '') return 'root';
    }
  } catch (_) {}
  return 'other';
}

function selectedProfiles(profiles) {
  const selected = document.querySelector('#siteFilter')?.value || 'all';
  const derivedKey = {
    sofia: 'sc-city:sofia',
    lom: 'sc-city:lom',
    montana: 'sc-city:montana',
    'lom-en': 'sc-city:lom-en',
    'lom-de': 'sc-city:lom-de',
  }[selected];
  if (derivedKey) {
    const derived = profiles.filter(profile => profile.profile_key === derivedKey);
    if (derived.length) return derived;
    if (selected === 'lom') return profiles.filter(profile => classify(profile) === 'lom');
    return [];
  }
  if (selected === 'all') {
    const global = profiles.filter(profile => classify(profile) === 'global');
    if (global.length) return [global[0]];
    const root = profiles.filter(profile => classify(profile) === 'root');
    if (root.length) return [root[0]];
    return profiles.length ? [profiles[0]] : [];
  }
  return profiles;
}

function fmtInt(value) {
  return new Intl.NumberFormat('bg-BG', { maximumFractionDigits: 0 }).format(Math.round(value || 0));
}
function fmtPct(value) {
  return `${(Number(value || 0) * 100).toLocaleString('bg-BG', { maximumFractionDigits: 1 })}%`;
}
function fmtPos(value) {
  return Number(value || 0).toLocaleString('bg-BG', { maximumFractionDigits: 1 });
}

function aggregate(rows) {
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.profile_key}|${row.day}`;
    if (!grouped.has(key)) grouped.set(key, { clicks: 0, impressions: 0, position: null });
    const item = grouped.get(key);
    if (row.metric === 'CLICKS') item.clicks = Number(row.value || 0);
    if (row.metric === 'IMPRESSIONS') item.impressions = Number(row.value || 0);
    if (row.metric === 'POSITION') item.position = Number(row.value || 0);
  }
  let clicks = 0;
  let impressions = 0;
  let weightedPos = 0;
  let posWeight = 0;
  for (const item of grouped.values()) {
    clicks += item.clicks;
    impressions += item.impressions;
    if (Number.isFinite(item.position)) {
      const weight = item.impressions || 1;
      weightedPos += item.position * weight;
      posWeight += weight;
    }
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: posWeight ? weightedPos / posWeight : 0,
  };
}

function latestRankingSnapshot(rows) {
  if (!rows.length) return { rows: [], start: '', end: '' };
  const end = rows.reduce((max, row) => !max || row.period_end > max ? row.period_end : max, '');
  const latest = rows.filter(row => row.period_end === end);
  const start = latest.reduce((min, row) => !min || row.period_start < min ? row.period_start : min, '');
  return { rows: latest.slice(0, 10), start, end };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function setMetric(shell, index, value) {
  const node = shell.querySelectorAll('.search-overview .channel-metric strong')[index];
  if (node) node.textContent = value;
}

function clearMetrics(shell) {
  ['—', '—', '—', '—'].forEach((value, index) => setMetric(shell, index, value));
}

function setState(shell, text, connected = true) {
  const node = shell.querySelector('.search-overview .channel-state');
  if (!node) return;
  node.textContent = text;
  node.classList.toggle('pending', !connected);
  node.classList.toggle('connected', connected);
}

function note(shell, text) {
  let node = shell.querySelector('.sc-live-note');
  if (!node) {
    node = document.createElement('div');
    node.className = 'channel-status sc-live-note';
    shell.querySelector('.search-overview')?.appendChild(node);
  }
  node.textContent = text;
}

function renderList(card, snapshot, type) {
  const status = card.querySelector('.channel-status');
  if (!status) return;
  const heading = card.querySelector('h2');
  if (heading) heading.textContent = type === 'query' ? 'Последен наличен snapshot — заявки' : 'Последен наличен snapshot — страници';
  const rows = snapshot.rows;
  if (!rows.length) {
    status.textContent = type === 'query' ? 'Още няма записан snapshot за заявки.' : 'Още няма записан snapshot за страници.';
    return;
  }
  const period = snapshot.start && snapshot.end ? `Snapshot период: ${esc(snapshot.start)} – ${esc(snapshot.end)}` : 'Последен наличен snapshot';
  status.className = 'sc-live-table';
  status.innerHTML = `<div class="sc-snapshot-meta">${period}</div>` + rows.map(row => {
    const label = esc(row.dimension_value);
    if (type === 'query') return `<div class="sc-live-row"><span title="${label}">${label}</span><strong>${fmtInt(row.clicks)}</strong><small>${fmtInt(row.impressions)} показв.</small></div>`;
    return `<div class="sc-live-row"><span title="${label}">${label}</span><strong>${fmtInt(row.clicks)}</strong><small>поз. ${fmtPos(row.position)}</small></div>`;
  }).join('');
}

async function loadSearch(shell) {
  const token = ++renderToken;
  const status = await loadChannelStatus();
  if (token !== renderToken || !document.contains(shell)) return;

  if (!(status.connections || []).some(item => item.provider === 'search_console')) {
    setState(shell, 'Не е свързано', false);
    clearMetrics(shell);
    return;
  }

  const all = (status.profiles || []).filter(item => item.provider === 'search_console');
  const profiles = selectedProfiles(all);
  if (!profiles.length) {
    setState(shell, 'Свързано', true);
    clearMetrics(shell);
    note(shell, 'Връзката е активна, но този сайт още няма backend snapshot. Данните ще се появят след автоматичния дневен sync.');
    return;
  }

  const period = range();
  const data = [];
  const queryRows = [];
  const pageRows = [];

  for (const profile of profiles) {
    const key = encodeURIComponent(profile.profile_key);
    const [daily, queries, pages] = await Promise.all([
      ownerFetch(`/api/data?provider=search_console&profileKey=${key}&from=${period.from}&to=${period.to}`),
      rankingRows(profile.profile_key, 'query'),
      rankingRows(profile.profile_key, 'page'),
    ]);
    data.push(...(daily.data || []));
    queryRows.push(...queries);
    pageRows.push(...pages);
  }

  if (token !== renderToken || !document.contains(shell)) return;

  if (data.length) {
    const values = aggregate(data);
    setMetric(shell, 0, fmtInt(values.clicks));
    setMetric(shell, 1, fmtInt(values.impressions));
    setMetric(shell, 2, fmtPct(values.ctr));
    setMetric(shell, 3, fmtPos(values.position));
  } else {
    clearMetrics(shell);
  }

  setState(shell, 'Свързано', true);
  const cards = shell.querySelectorAll('.channel-grid .channel-card');
  const querySnapshot = latestRankingSnapshot(queryRows);
  const pageSnapshot = latestRankingSnapshot(pageRows);
  if (cards[0]) renderList(cards[0], { ...querySnapshot, rows: querySnapshot.rows.sort((a, b) => Number(b.clicks || 0) - Number(a.clicks || 0)).slice(0, 10) }, 'query');
  if (cards[1]) renderList(cards[1], { ...pageSnapshot, rows: pageSnapshot.rows.sort((a, b) => Number(b.clicks || 0) - Number(a.clicks || 0)).slice(0, 10) }, 'page');

  note(
    shell,
    data.length
      ? `KPI са от записаните Search Console данни за ${period.from} – ${period.to}. Таблиците са последният наличен 28-дневен snapshot. Обновяването е автоматично от backend cron.`
      : `За ${period.from} – ${period.to} още няма синхронизирани дневни KPI. Таблиците са последният наличен snapshot; frontend-ът не стартира ръчен Google sync.`,
  );
}

function decorate() {
  document.querySelectorAll('[data-external-shell="search"]').forEach(shell => {
    if (shell.dataset.scLiveLoading === '1') return;
    const run = String(++loadSequence);
    shell.dataset.scLiveLoading = '1';
    shell.dataset.scLiveRun = run;
    loadSearch(shell)
      .catch(error => {
        if (document.contains(shell) && shell.dataset.scLiveRun === run) {
          setState(shell, 'Грешка', false);
          clearMetrics(shell);
          note(shell, `Не мога да заредя Search Console: ${error.message}`);
        }
      })
      .finally(() => {
        if (document.contains(shell) && shell.dataset.scLiveRun === run) shell.dataset.scLiveLoading = '0';
      });
  });
}

function forceDecorate(delay = 120) {
  renderToken++;
  setTimeout(() => {
    document.querySelectorAll('[data-external-shell="search"]').forEach(shell => { shell.dataset.scLiveLoading = '0'; });
    decorate();
  }, delay);
}

new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true });
document.addEventListener('change', event => {
  if (['siteFilter', 'periodFilter', 'dateFrom', 'dateTo'].includes(event.target?.id)) forceDecorate(180);
});
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('#refreshBtn')) {
    clearRankingCache();
    forceDecorate(180);
    return;
  }
  if (target?.closest('[data-external-view="search"],[data-channel="search"]')) forceDecorate(180);
});
window.addEventListener('focus', () => {
  clearRankingCache();
  forceDecorate(80);
});
decorate();
