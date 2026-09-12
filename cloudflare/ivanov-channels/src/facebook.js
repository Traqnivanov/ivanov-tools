import { encryptText, decryptText } from './crypto.js';

const GRAPH_VERSION = 'v21.0';
const SCOPE = 'pages_show_list,pages_read_engagement,read_insights,business_management';
const PAGE_METRICS = ['page_impressions', 'page_post_engagements', 'page_fan_adds'];

function callbackUrl(env) {
  return `${env.PUBLIC_BASE_URL}/oauth/callback/facebook`;
}

export function facebookAuthorizationUrl(env, state) {
  const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', env.FACEBOOK_APP_ID);
  url.searchParams.set('redirect_uri', callbackUrl(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('state', state);
  return url.toString();
}

async function graphJson(url) {
  const response = await fetch(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) throw new Error(`facebook_api_${body.error?.code || response.status}`);
  return body;
}

export async function exchangeFacebookCode(env, code) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', env.FACEBOOK_APP_ID);
  url.searchParams.set('client_secret', env.FACEBOOK_APP_SECRET);
  url.searchParams.set('redirect_uri', callbackUrl(env));
  url.searchParams.set('code', code);
  const shortLived = await graphJson(url.toString());

  const exchangeUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token');
  exchangeUrl.searchParams.set('client_id', env.FACEBOOK_APP_ID);
  exchangeUrl.searchParams.set('client_secret', env.FACEBOOK_APP_SECRET);
  exchangeUrl.searchParams.set('fb_exchange_token', shortLived.access_token);
  return graphJson(exchangeUrl.toString());
}

export async function storeFacebookUserToken(env, longLivedToken) {
  const encrypted = await encryptText(longLivedToken.access_token, env.TOKEN_ENCRYPTION_KEY);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO oauth_tokens(provider, encrypted_refresh_token, iv, granted_scopes, updated_at)
    VALUES('facebook', ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      encrypted_refresh_token=excluded.encrypted_refresh_token,
      iv=excluded.iv,
      granted_scopes=excluded.granted_scopes,
      updated_at=excluded.updated_at
  `).bind(encrypted.ciphertext, encrypted.iv, SCOPE, now).run();
}

async function storedUserToken(env) {
  const row = await env.DB.prepare("SELECT encrypted_refresh_token, iv FROM oauth_tokens WHERE provider='facebook'").first();
  if (!row) throw new Error('facebook_not_connected');
  return decryptText(row.encrypted_refresh_token, row.iv, env.TOKEN_ENCRYPTION_KEY);
}

function cityFromPageName(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('лом') || value.includes('lom')) return 'Лом';
  if (value.includes('софия') || value.includes('sofia')) return 'София';
  return null;
}

async function upsertFacebookPage(env, page) {
  const profileKey = `fb:${page.id}`;
  const encryptedPageToken = await encryptText(page.access_token, env.TOKEN_ENCRYPTION_KEY);
  const metadata = {
    category: page.category || null,
    pageToken: encryptedPageToken,
  };
  await env.DB.prepare(`
    INSERT INTO channel_profiles(provider, profile_key, external_id, label, city, status, metadata_json, updated_at)
    VALUES('facebook', ?, ?, ?, ?, 'connected', ?, ?)
    ON CONFLICT(provider, profile_key) DO UPDATE SET
      external_id=excluded.external_id,
      label=excluded.label,
      city=excluded.city,
      status='connected',
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(profileKey, page.id, page.name || page.id, cityFromPageName(page.name), JSON.stringify(metadata), new Date().toISOString()).run();
  return profileKey;
}

export async function discoverFacebookPages(env) {
  const userToken = await storedUserToken(env);
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  url.searchParams.set('fields', 'id,name,access_token,category');
  url.searchParams.set('access_token', userToken);
  const body = await graphJson(url.toString());
  const pages = body.data || [];
  const found = [];
  for (const page of pages) {
    found.push(await upsertFacebookPage(env, page));
  }
  return found;
}

async function connectedFacebookPages(env) {
  const rows = await env.DB.prepare(
    "SELECT provider, profile_key, external_id, label, city, metadata_json FROM channel_profiles WHERE provider='facebook' AND status='connected' ORDER BY label",
  ).all();
  return rows.results || [];
}

function dailyUpsertStatement(env, profileKey, day, metric, value) {
  return env.DB.prepare(`
    INSERT INTO channel_daily(provider, profile_key, day, metric, value, metadata_json, updated_at)
    VALUES('facebook', ?, ?, ?, ?, '{}', ?)
    ON CONFLICT(provider, profile_key, day, metric) DO UPDATE SET
      value=excluded.value,
      updated_at=excluded.updated_at
  `).bind(profileKey, day, metric, Number(value) || 0, new Date().toISOString());
}

function metricKey(name) {
  if (name === 'page_impressions') return 'IMPRESSIONS';
  if (name === 'page_post_engagements') return 'ENGAGEMENTS';
  if (name === 'page_fan_adds') return 'FAN_ADDS';
  return name.toUpperCase();
}

async function fetchPageMetric(pageId, metric, pageToken, since, until) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/insights`);
  url.searchParams.set('metric', metric);
  url.searchParams.set('period', 'day');
  url.searchParams.set('since', String(since));
  url.searchParams.set('until', String(until));
  url.searchParams.set('access_token', pageToken);
  return graphJson(url.toString());
}

export async function syncFacebookPages(env, days = 7) {
  const pages = await connectedFacebookPages(env);
  if (!pages.length) return { provider: 'facebook', profiles: 0, points: 0 };

  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  let points = 0;
  const metricErrors = {};

  for (const page of pages) {
    const metadata = JSON.parse(page.metadata_json || '{}');
    if (!metadata.pageToken) continue;
    const pageToken = await decryptText(metadata.pageToken.ciphertext, metadata.pageToken.iv, env.TOKEN_ENCRYPTION_KEY);

    const statements = [];
    for (const metric of PAGE_METRICS) {
      let body;
      try {
        body = await fetchPageMetric(page.external_id, metric, pageToken, since, until);
      } catch (error) {
        metricErrors[metric] = String(error?.message || error);
        continue;
      }
      for (const series of body.data || []) {
        for (const point of series.values || []) {
          const day = String(point.end_time || '').slice(0, 10);
          if (!day) continue;
          statements.push(dailyUpsertStatement(env, page.profile_key, day, metricKey(series.name), point.value));
          points++;
        }
      }
    }
    if (statements.length) await env.DB.batch(statements);
  }

  const result = { provider: 'facebook', profiles: pages.length, points };
  if (Object.keys(metricErrors).length) result.metricErrors = metricErrors;
  return result;
}
