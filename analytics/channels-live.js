import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  channelAuthUser,
  channelOwnerFetch,
  invalidateChannelStatus,
  loadChannelStatus,
  syncHealthFor,
  syncHealthSummary,
} from './channel-api.js?v=20260918-sync1';

function providerForType(type) {
  if (type === 'business') return 'google_business';
  if (type === 'facebook') return 'facebook';
  return 'search_console';
}

function providerInfo(status, provider) {
  const connection = (status?.connections || []).find(item => item.provider === provider) || null;
  let profiles = (status?.profiles || []).filter(item => item.provider === provider && item.status === 'connected');
  if (provider === 'search_console') {
    const siteProfiles = profiles.filter(item => String(item.profile_key || '').startsWith('sc-city:'));
    if (siteProfiles.length >= 5) profiles = siteProfiles;
  }
  return { connection, profiles, health: syncHealthFor(status, provider) };
}

async function startOAuth(provider, button) {
  const popup = window.open('about:blank', `ivanov-${provider}-oauth`);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Отварям…';
  try {
    const data = await channelOwnerFetch(`/oauth/start/${provider}`, { method: 'POST' });
    if (!data.authorizationUrl) throw new Error('Authorization URL липсва.');
    if (popup) popup.location.href = data.authorizationUrl;
    else window.location.href = data.authorizationUrl;
  } catch (error) {
    if (popup) popup.close();
    button.disabled = false;
    button.textContent = original;
    showMessage(button.closest('.channel-live-panel'), `Грешка: ${error.message}`, true);
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
  if (!info.connection) {
    if (type === 'business') return 'Google Business още не е свързан.';
    if (type === 'facebook') return 'Facebook още не е свързан.';
    return 'Search Console още не е свързан.';
  }
  const health = syncHealthSummary(info.health);
  let base;
  if (info.profiles.length) {
    base = `Свързано: ${info.profiles.length} профил${info.profiles.length === 1 ? '' : 'а'}. Данните се обновяват автоматично от дневния backend cron.`;
  } else if (type === 'business') {
    base = 'Google разрешението е записано. Чака се достъпът до Business Profile API; след одобрение профилите и данните ще се открият от автоматичния backend cron.';
  } else if (type === 'facebook') {
    base = 'Facebook разрешението е записано, но още няма открити активни страници. Данните се обновяват автоматично от backend cron.';
  } else {
    base = 'Google разрешението е записано, но още няма открити активни Search Console сайтове. Данните се обновяват автоматично от backend cron.';
  }
  return health ? `${base} ${health}.` : base;
}

function buildPanel(type, info) {
  const provider = providerForType(type);
  const connected = Boolean(info.connection);
  const syncProblem = connected && ['error', 'partial'].includes(info.health?.last_status);
  const panel = document.createElement('section');
  panel.className = 'card channel-live-panel';
  panel.dataset.channelLive = type;

  const titles = { business: 'Google Business връзка', facebook: 'Facebook връзка', search: 'Search Console връзка' };
  const actions = { business: 'Свържи Google Business', facebook: 'Свържи Facebook', search: 'Свържи Search Console' };
  const reconnects = { business: 'Разреши Google Business отново', facebook: 'Разреши Facebook отново', search: 'Разреши Search Console отново' };
  const title = titles[type];
  const action = actions[type];
  const reconnect = reconnects[type];

  panel.innerHTML = `
    <div class="channel-live-head">
      <div><span class="channel-eyebrow">Връзка</span><h2>${title}</h2></div>
      <span class="channel-state ${connected && !syncProblem ? 'connected' : 'pending'}">${!connected ? 'Не е свързано' : syncProblem ? (info.health?.last_status === 'partial' ? 'Частичен sync' : 'Sync проблем') : 'Разрешено'}</span>
    </div>
    <p class="channel-live-status"></p>
    <div class="channel-live-actions">
      <button type="button" class="channel-live-primary" data-connect-provider="${provider}">${connected ? reconnect : action}</button>
    </div>`;

  panel.querySelector('.channel-live-status').textContent = statusText(type, info);
  panel.querySelector('[data-connect-provider]').addEventListener('click', event => startOAuth(provider, event.currentTarget));
  return panel;
}

async function decorateShell(shell) {
  const type = shell.dataset.externalShell;
  if (type !== 'business' && type !== 'search' && type !== 'facebook') return;
  if (shell.querySelector('[data-channel-live]')) return;

  const placeholder = document.createElement('section');
  placeholder.className = 'card channel-live-panel channel-live-loading';
  placeholder.dataset.channelLive = type;
  placeholder.textContent = 'Проверявам връзката…';
  shell.querySelector('.channel-shell')?.prepend(placeholder);

  try {
    const status = await loadChannelStatus();
    placeholder.replaceWith(buildPanel(type, providerInfo(status, providerForType(type))));
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
  if (!channelAuthUser()) return;
  invalidateChannelStatus();
  try { await loadChannelStatus({ force: true }); } catch (_) {}
  document.querySelectorAll('[data-channel-live]').forEach(node => node.remove());
  decorateVisibleShells();
});

const app = getApps()[0];
if (app) {
  onAuthStateChanged(getAuth(app), async user => {
    invalidateChannelStatus();
    if (user) {
      try { await loadChannelStatus({ force: true }); } catch (_) {}
      decorateVisibleShells();
    }
  });
}

decorateVisibleShells();
