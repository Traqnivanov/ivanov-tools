import { getApps } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, collection, getDocs, query, where, orderBy, limit, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { CHANNEL_WORKER_BASE } from './channel-config.js?v=20260827-stage1f';
import { normalizePath } from './sites.js?v=20260818-5';

const CACHE_MS = 3000;
const cache = new Map();
// Stage 3 switched analytics storage on 29.08.2026. Keep the whole Sofia day as a safe overlap.
const CUTOVER_DAY_START_UTC = Date.parse('2026-08-28T21:00:00.000Z');
const POST_CUTOVER_DAY_START_UTC = Date.parse('2026-08-29T21:00:00.000Z');

function app() {
  return getApps()[0] || null;
}

function rangeKey(range) {
  return `${range.start.getTime()}:${range.end.getTime()}`;
}

function publishSourceHealth(range, firestoreResult, d1Result) {
  const key = rangeKey(range);
  const detail = {
    rangeKey: key,
    firestore: firestoreResult.status === 'fulfilled',
    d1: d1Result.status === 'fulfilled',
    partial: firestoreResult.status !== d1Result.status,
    unavailable: firestoreResult.status === 'rejected' && d1Result.status === 'rejected',
    firestoreError: firestoreResult.status === 'rejected' ? String(firestoreResult.reason?.message || 'firestore_unavailable') : '',
    d1Error: d1Result.status === 'rejected' ? String(d1Result.reason?.message || 'd1_unavailable') : '',
    checkedAt: new Date().toISOString(),
  };
  const statuses = window.__ivanovAnalyticsSourceStatuses || {};
  statuses[key] = detail;
  window.__ivanovAnalyticsSourceStatuses = statuses;
  window.dispatchEvent(new CustomEvent('ivanov:analytics-source-status', { detail }));
}

function firestoreEvent(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    pagePath: normalizePath(data.pagePath || '/'),
    date: data.timestamp?.toDate?.() || new Date(),
  };
}

function d1Event(data) {
  return {
    ...data,
    pagePath: normalizePath(data.pagePath || '/'),
    date: new Date(data.timestamp),
  };
}

async function fetchFirestoreEvents(range) {
  const currentApp = app();
  if (!currentApp) throw new Error('firebase_app_not_ready');
  const db = getFirestore(currentApp);
  const eventQuery = query(
    collection(db, 'analytics_events'),
    where('timestamp', '>=', Timestamp.fromDate(range.start)),
    where('timestamp', '<=', Timestamp.fromDate(range.end)),
    orderBy('timestamp', 'desc'),
    limit(10000),
  );
  const snapshot = await getDocs(eventQuery);
  return snapshot.docs.map(firestoreEvent);
}

async function fetchD1Events(range) {
  const currentApp = app();
  if (!currentApp) throw new Error('firebase_app_not_ready');
  const user = getAuth(currentApp).currentUser;
  if (!user) throw new Error('owner_not_authenticated');
  const token = await user.getIdToken();
  const params = new URLSearchParams({
    from: range.start.toISOString(),
    to: range.end.toISOString(),
    limit: '10000',
  });
  const response = await fetch(`${CHANNEL_WORKER_BASE}/api/analytics/events?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `analytics_d1_${response.status}`);
  return (body.data || []).map(d1Event).filter(event => Number.isFinite(event.date.getTime()));
}

function mergeEvents(firestore, d1) {
  return [...firestore, ...d1].sort((a, b) => b.date - a.date);
}

function needsFirestore(range) {
  return range.start.getTime() < POST_CUTOVER_DAY_START_UTC;
}

function needsD1(range) {
  return range.end.getTime() >= CUTOVER_DAY_START_UTC;
}

async function loadRange(range) {
  const firestoreTask = needsFirestore(range) ? fetchFirestoreEvents(range) : Promise.resolve([]);
  const d1Task = needsD1(range) ? fetchD1Events(range) : Promise.resolve([]);
  const [firestoreResult, d1Result] = await Promise.allSettled([firestoreTask, d1Task]);
  publishSourceHealth(range, firestoreResult, d1Result);
  const firestore = firestoreResult.status === 'fulfilled' ? firestoreResult.value : [];
  const d1 = d1Result.status === 'fulfilled' ? d1Result.value : [];
  if (!firestore.length && !d1.length && firestoreResult.status === 'rejected' && d1Result.status === 'rejected') {
    throw new Error(`analytics_sources_unavailable: ${firestoreResult.reason?.message || 'firestore'}; ${d1Result.reason?.message || 'd1'}`);
  }
  return mergeEvents(firestore, d1);
}

export function fetchAnalyticsEvents(range, { force = false } = {}) {
  const key = rangeKey(range);
  const now = Date.now();
  const cached = cache.get(key);
  if (!force && cached && now - cached.createdAt < CACHE_MS) return cached.promise;
  const promise = loadRange(range).catch(error => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw error;
  });
  cache.set(key, { createdAt: now, promise });
  return promise;
}

export function clearAnalyticsEventCache() {
  cache.clear();
}
