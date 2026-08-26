import { requireOwner } from './firebase-auth.js';
import {
  googleAuthorizationUrl,
  exchangeGoogleCode,
  storeGoogleRefreshToken,
  discoverGoogleProfiles,
} from './google.js';
import { syncConnectedGoogleChannels } from './sync.js';

const GOOGLE_PROVIDERS = new Set(['google_business', 'search_console']);

function allowedOrigins(env) {
  return new Set(String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
}

function responseHeaders(env, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
  });
  if (origin && allowedOrigins(env).has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  return headers;
}

function json(env, body, status = 200, origin = null) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(env, origin) });
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function saveState(env, provider, state) {
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000);
  await env.DB.prepare('INSERT INTO oauth_states(state, provider, created_at, expires_at) VALUES(?, ?, ?, ?)')
    .bind(state, provider, now.toISOString(), expires.toISOString()).run();
}

async function consumeState(env, provider, state) {
  if (!state) return false;
  const row = await env.DB.prepare('SELECT provider, expires_at FROM oauth_states WHERE state=?').bind(state).first();
  await env.DB.prepare('DELETE FROM oauth_states WHERE state=?').bind(state).run();
  return Boolean(row && row.provider === provider && Date.parse(row.expires_at) > Date.now());
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function callbackHtml(env, ok, message) {
  const safeMessage = escapeHtml(message);
  const safeUrl = escapeHtml(env.DASHBOARD_URL || '');
  const status = ok ? 'Свързването е успешно.' : 'Свързването не завърши.';
  return new Response(`<!doctype html><html lang="bg"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Ivanov Analytics</title><body style="font-family:system-ui;padding:32px;max-width:620px;margin:auto"><h1>${status}</h1><p>${safeMessage}</p>${safeUrl ? `<p><a href="${safeUrl}">Назад към Ivanov Analytics</a></p>` : ''}</body></html>`, {
    status: ok ? 200 : 400,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

async function ownerOrResponse(request, env, origin) {
  const owner = await requireOwner(request, env);
  if (!owner.ok) return { response: json(env, { error: owner.error }, owner.status, origin) };
  return { owner };
}

async function startOAuth(request, env, provider, origin) {
  if (!GOOGLE_PROVIDERS.has(provider)) return json(env, { error: 'provider_not_supported_yet' }, 400, origin);
  const auth = await ownerOrResponse(request, env, origin);
  if (auth.response) return auth.response;
  const state = randomState();
  await saveState(env, provider, state);
  return json(env, { authorizationUrl: googleAuthorizationUrl(env, provider, state) }, 200, origin);
}

async function finishGoogleOAuth(request, env, provider) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const oauthError = url.searchParams.get('error');
  if (!await consumeState(env, provider, state)) return callbackHtml(env, false, 'Невалидна или изтекла OAuth заявка.');
  if (oauthError) return callbackHtml(env, false, `Google отказа разрешението: ${oauthError}`);
  if (!code) return callbackHtml(env, false, 'Google не върна authorization code.');
  try {
    const token = await exchangeGoogleCode(env, provider, code);
    await storeGoogleRefreshToken(env, provider, token);
    const profiles = await discoverGoogleProfiles(env, provider);
    return callbackHtml(env, true, `Намерени профили/сайтове: ${profiles.length}. Данните ще се синхронизират автоматично.`);
  } catch (error) {
    console.error('OAuth callback failed', provider, error);
    return callbackHtml(env, false, 'Разрешението е получено, но backend подготовката не успя.');
  }
}

async function connectionStatus(env) {
  const tokens = await env.DB.prepare('SELECT provider, updated_at, granted_scopes FROM oauth_tokens ORDER BY provider').all();
  const profiles = await env.DB.prepare('SELECT provider, profile_key, label, city, status, updated_at FROM channel_profiles ORDER BY provider, label').all();
  return { connections: tokens.results || [], profiles: profiles.results || [] };
}

async function channelData(env, url) {
  const provider = url.searchParams.get('provider');
  const profileKey = url.searchParams.get('profileKey');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!provider || !from || !to) return { error: 'provider_from_to_required', status: 400 };
  const bindings = [provider, from, to];
  let sql = 'SELECT provider, profile_key, day, metric, value, metadata_json, updated_at FROM channel_daily WHERE provider=? AND day>=? AND day<=?';
  if (profileKey) { sql += ' AND profile_key=?'; bindings.push(profileKey); }
  sql += ' ORDER BY day ASC, metric ASC';
  const rows = await env.DB.prepare(sql).bind(...bindings).all();
  return { data: rows.results || [], status: 200 };
}

async function rankingData(env, url) {
  const provider = url.searchParams.get('provider');
  const profileKey = url.searchParams.get('profileKey');
  const dimension = url.searchParams.get('dimension');
  if (!provider || !profileKey || !dimension) return { error: 'provider_profileKey_dimension_required', status: 400 };
  const rows = await env.DB.prepare(`
    SELECT provider, profile_key, period_start, period_end, dimension, dimension_value, clicks, impressions, ctr, position, metadata_json, updated_at
    FROM channel_rankings
    WHERE provider=? AND profile_key=? AND dimension=?
    ORDER BY period_end DESC, clicks DESC
    LIMIT 250
  `).bind(provider, profileKey, dimension).all();
  return { data: rows.results || [], status: 200 };
}

async function handleFetch(request, env) {
  const origin = request.headers.get('Origin');
  const origins = allowedOrigins(env);
  if (origin && !origins.has(origin)) return json(env, { error: 'forbidden_origin' }, 403, null);

  if (request.method === 'OPTIONS') {
    if (!origin || !origins.has(origin)) return new Response(null, { status: 403 });
    const headers = responseHeaders(env, origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    headers.set('Access-Control-Max-Age', '3600');
    return new Response(null, { status: 204, headers });
  }

  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') return json(env, { ok: true, service: 'ivanov-channels' }, 200, origin);

  const callbackMatch = url.pathname.match(/^\/oauth\/callback\/(google_business|search_console)$/);
  if (request.method === 'GET' && callbackMatch) return finishGoogleOAuth(request, env, callbackMatch[1]);

  const startMatch = url.pathname.match(/^\/oauth\/start\/(google_business|search_console)$/);
  if (request.method === 'POST' && startMatch) return startOAuth(request, env, startMatch[1], origin);

  if (request.method === 'GET' && url.pathname === '/api/status') {
    const auth = await ownerOrResponse(request, env, origin);
    if (auth.response) return auth.response;
    return json(env, await connectionStatus(env), 200, origin);
  }

  if (request.method === 'GET' && url.pathname === '/api/data') {
    const auth = await ownerOrResponse(request, env, origin);
    if (auth.response) return auth.response;
    const result = await channelData(env, url);
    return result.error ? json(env, { error: result.error }, result.status, origin) : json(env, { data: result.data }, 200, origin);
  }

  if (request.method === 'GET' && url.pathname === '/api/rankings') {
    const auth = await ownerOrResponse(request, env, origin);
    if (auth.response) return auth.response;
    const result = await rankingData(env, url);
    return result.error ? json(env, { error: result.error }, result.status, origin) : json(env, { data: result.data }, 200, origin);
  }

  if (request.method === 'POST' && url.pathname === '/api/sync') {
    const auth = await ownerOrResponse(request, env, origin);
    if (auth.response) return auth.response;
    return json(env, { results: await syncConnectedGoogleChannels(env) }, 200, origin);
  }

  return json(env, { error: 'not_found' }, 404, origin);
}

async function cleanup(env) {
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at < ?').bind(new Date().toISOString()).run();
}

export default {
  fetch(request, env) {
    return handleFetch(request, env).catch(error => {
      console.error('ivanov-channels request failed', error);
      const origin = request.headers.get('Origin');
      return json(env, { error: 'internal_error' }, 500, origin && allowedOrigins(env).has(origin) ? origin : null);
    });
  },
  async scheduled(controller, env) {
    await cleanup(env);
    const results = await syncConnectedGoogleChannels(env);
    console.log('ivanov-channels scheduled sync', controller.cron, results);
  },
};
