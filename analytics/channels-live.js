import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const WORKER_BASE = 'https://ivanov-channels.traqnivanov1.workers.dev';
let statusCache = null;
let statusPromise = null;

function authUser() {
  const app = getApps()[0];
  return app ? getAuth(app).currentUser : null;
}

async function ownerFetch(path, options = {}) {
  const user = authUser();
  if (!user) throw new Error('Няма активен вход в Ivanov Analytics.');
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${WORKER_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function loadStatus(force = false) {
  if (!force && statusCache) return statusCache;
  if (!force && statusPromise) return statusPromise;
  statusPromise = ownerFetch('/api/status')
    .then(data => {
      statusCache = data;
      return data;
    })
    .finally(() => { statusPromise = null; });
  return statusPromise;
}

function providerInfo(status, provider) {
  const connection = (status?.connections || []).find(item => item.provider === provider) || null;
  const profiles = (status?.profiles || []).filter(item => item.provider === provider);
  return { connection, profiles };
}

async function startOAuth(provider, button) {
  const popup = window.open('about:blank', `ivanov-${provider}-oauth`);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Отварям Google…';
  try {
    const data = await ownerFetch(`/oauth/start/${provider}`, { method: 'POST' });
    if (!data.authorizationUrl) throw new Error('Google authorization URL липсва.');
    if (popup) popup.location.href = data.authorizationUrl;
    else window.location.href = data.authorizationUrl;
  } catch (error) {
    if (popup) popup.close();
    button.disabled = false;
    button.textContent = original;
    showMessage(button.closest('.channel-live-panel'), `Грешка: ${error.message}`, true);
  }
}

async function syncChannels(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Обновявам…';
  try {
    const data = await ownerFetch('/api/sync', { method: 'POST' });
    statusCache = null;
    const errors = (data.results || []).filter(item => item?.error).map(item => item.error);
    showMessage(button.closest('.channel-live-panel'), errors.length ? `Обновяването завърши с: ${errors.join(', ')}` : 'Данните са обновени.', Boolean(errors.length));
  } catch (error) {
    showMessage(button.closest('.channel-live-panel'), `Грешка: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showMessage(panel, text, isError = false) {
  if (!panel) return;
  let node = panel.querySelector('.channel-live-message');
  if (!node) {
    node = document.createElement('div');
    node.className = 'channel-live-message';
    panel.appendChild(node);
  }
  node.classList.toggle('error', isError);
  node.textContent = text;
}

function statusText(type, info) {
  if (!info.connection) return type === 'business' ? 'Google Business още не е свързан.' : 'Search Console още не е свързан.';
  if (info.profiles.length) return `Свързано: ${info.profiles.length} профил${info.profiles.length === 1 ? '' : 'а'}.`;
  if (type === 'business') return 'Google разрешението е записано. Чака се достъпът до Business Profile API, за да бъдат открити профилите.';
  return 'Google разрешението е записано, но още няма открити Search Console сайтове.';
}

function buildPanel(type, info) {
  const provider = type === 'business' ? 'google_business' : 'search_console';
  const connected = Boolean(info.connection);
  const panel = document.createElement('section');
  panel.className = 'card channel-live-panel';
  panel.dataset.channelLive = type;

  const title = type === 'business' ? 'Google Business връзка' : 'Search Console връзка';
  const action = type === 'business' ? 'Свържи Google Business' : 'Свържи Search Console';
  const reconnect = type === 'business' ? 'Разреши Google Business отново' : 'Разреши Search Console отново';

  panel.innerHTML = `
    <div class="channel-live-head">
      <div><span class="channel-eyebrow">Връзка</span><h2>${title}</h2></div>
      <span class="channel-state ${connected ? 'connected' : 'pending'}">${connected ? 'Разрешено' : 'Не е свързано'}</span>
    </div>
    <p class="channel-live-status"></p>
    <div class="channel-live-actions">
      <button type="button" class="channel-live-primary" data-connect-provider="${provider}">${connected ? reconnect : action}</button>
      ${connected ? '<button type="button" class="channel-live-secondary" data-sync-channels>Обнови данните</button>' : ''}
    </div>`;

  panel.querySelector('.channel-live-status').textContent = statusText(type, info);
  panel.querySelector('[data-connect-provider]').addEventListener('click', event => startOAuth(provider, event.currentTarget));
  panel.querySelector('[data-sync-channels]')?.addEventListener('click', event => syncChannels(event.currentTarget));
  return panel;
}

async function decorateShell(shell) {
  const type = shell.dataset.externalShell;
  if (type !== 'business' && type !== 'search') return;
  if (shell.querySelector('[data-channel-live]')) return;

  const placeholder = document.createElement('section');
  placeholder.className = 'card channel-live-panel channel-live-loading';
  placeholder.dataset.channelLive = type;
  placeholder.textContent = 'Проверявам връзката…';
  shell.querySelector('.channel-shell')?.prepend(placeholder);

  try {
    const status = await loadStatus();
    const provider = type === 'business' ? 'google_business' : 'search_console';
    placeholder.replaceWith(buildPanel(type, providerInfo(status, provider)));
  } catch (error) {
    placeholder.classList.remove('channel-live-loading');
    placeholder.textContent = `Не мога да проверя връзката: ${error.message}`;
  }
}

function decorateVisibleShells() {
  document.querySelectorAll('[data-external-shell]').forEach(decorateShell);
}

const observer = new MutationObserver(decorateVisibleShells);
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', event => {
  if (event.target.closest('[data-external-view]') || event.target.closest('[data-channel]')) {
    setTimeout(decorateVisibleShells, 0);
  }
});

window.addEventListener('focus', async () => {
  if (!authUser()) return;
  statusCache = null;
  try { await loadStatus(true); } catch (_) {}
  document.querySelectorAll('[data-channel-live]').forEach(node => node.remove());
  decorateVisibleShells();
});

const app = getApps()[0];
if (app) {
  onAuthStateChanged(getAuth(app), user => {
    statusCache = null;
    if (user) decorateVisibleShells();
  });
}

decorateVisibleShells();
