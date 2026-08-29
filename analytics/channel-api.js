import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';

const STATUS_CACHE_MS = 5000;
let statusCache = null;
let statusCachedAt = 0;
let statusUid = '';
let statusPromise = null;
let statusPromiseUid = '';

export function channelAuthUser() {
  const app = getApps()[0];
  return app ? getAuth(app).currentUser : null;
}

export async function channelOwnerFetch(path, options = {}) {
  const user = channelAuthUser();
  if (!user) throw new Error('Няма активен вход в Ivanov Analytics.');
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${CHANNEL_WORKER_BASE}${path}`, {
    ...options,
    headers,
    cache: options.cache || 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

function publishStatus(data) {
  window.dispatchEvent(new CustomEvent('ivanov:channel-status', { detail: data }));
}

export function invalidateChannelStatus() {
  statusCache = null;
  statusCachedAt = 0;
  statusUid = '';
  statusPromise = null;
  statusPromiseUid = '';
}

export async function loadChannelStatus({ force = false } = {}) {
  const user = channelAuthUser();
  if (!user) {
    invalidateChannelStatus();
    throw new Error('Няма активен вход в Ivanov Analytics.');
  }
  const uid = user.uid;
  const now = Date.now();
  if (statusPromise && statusPromiseUid === uid) return statusPromise;
  if (!force && statusCache && statusUid === uid && now - statusCachedAt < STATUS_CACHE_MS) return statusCache;

  const request = channelOwnerFetch('/api/status')
    .then(data => {
      if (channelAuthUser()?.uid !== uid) throw new Error('Auth сесията е променена.');
      statusCache = data;
      statusCachedAt = Date.now();
      statusUid = uid;
      publishStatus(data);
      return data;
    })
    .finally(() => {
      if (statusPromise === request) {
        statusPromise = null;
        statusPromiseUid = '';
      }
    });
  statusPromise = request;
  statusPromiseUid = uid;
  return request;
}
