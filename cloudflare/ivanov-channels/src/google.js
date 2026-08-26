import { encryptText, decryptText } from './crypto.js';

const PROVIDERS = {
  google_business: {
    scope: 'https://www.googleapis.com/auth/business.manage',
  },
  search_console: {
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
  },
};

function providerConfig(provider) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error('unsupported_google_provider');
  return config;
}

function callbackUrl(env, provider) {
  return `${env.PUBLIC_BASE_URL}/oauth/callback/${provider}`;
}

export function googleAuthorizationUrl(env, provider, state) {
  const config = providerConfig(provider);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', callbackUrl(env, provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(params) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`google_token_${response.status}_${body.error || 'unknown'}`);
  return body;
}

export async function exchangeGoogleCode(env, provider, code) {
  return tokenRequest({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: callbackUrl(env, provider),
    grant_type: 'authorization_code',
  });
}

export async function storeGoogleRefreshToken(env, provider, tokenResponse) {
  if (!tokenResponse.refresh_token) throw new Error('google_refresh_token_missing');
  const encrypted = await encryptText(tokenResponse.refresh_token, env.TOKEN_ENCRYPTION_KEY);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO oauth_tokens(provider, encrypted_refresh_token, iv, granted_scopes, updated_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      encrypted_refresh_token=excluded.encrypted_refresh_token,
      iv=excluded.iv,
      granted_scopes=excluded.granted_scopes,
      updated_at=excluded.updated_at
  `).bind(provider, encrypted.ciphertext, encrypted.iv, tokenResponse.scope || '', now).run();
}

async function storedRefreshToken(env, provider) {
  const row = await env.DB.prepare('SELECT encrypted_refresh_token, iv FROM oauth_tokens WHERE provider=?')
    .bind(provider).first();
  if (!row) throw new Error('provider_not_connected');
  return decryptText(row.encrypted_refresh_token, row.iv, env.TOKEN_ENCRYPTION_KEY);
}

export async function googleAccessToken(env, provider) {
  const refreshToken = await storedRefreshToken(env, provider);
  const token = await tokenRequest({
    refresh_token: refreshToken,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  return token.access_token;
}

async function googleJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`google_api_${response.status}`);
  return body;
}

function cityFromLocation(location) {
  return location?.storefrontAddress?.locality || null;
}

async function upsertProfile(env, provider, profile) {
  await env.DB.prepare(`
    INSERT INTO channel_profiles(provider, profile_key, external_id, label, city, status, metadata_json, updated_at)
    VALUES(?, ?, ?, ?, ?, 'connected', ?, ?)
    ON CONFLICT(provider, profile_key) DO UPDATE SET
      external_id=excluded.external_id,
      label=excluded.label,
      city=excluded.city,
      status='connected',
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(
    provider,
    profile.profileKey,
    profile.externalId,
    profile.label,
    profile.city,
    JSON.stringify(profile.metadata || {}),
    new Date().toISOString(),
  ).run();
}

export async function discoverGoogleBusinessProfiles(env) {
  const accessToken = await googleAccessToken(env, 'google_business');
  const locations = await googleJson(
    'https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations?readMask=name,title,storefrontAddress,websiteUri,metadata',
    accessToken,
  );
  const found = [];
  for (const location of locations.locations || []) {
    const externalId = location.name;
    const id = String(externalId || '').split('/').pop();
    if (!id) continue;
    const city = cityFromLocation(location);
    const profile = {
      profileKey: `gbp:${id}`,
      externalId,
      label: location.title || externalId,
      city,
      metadata: {
        websiteUri: location.websiteUri || null,
        placeId: location.metadata?.placeId || null,
      },
    };
    await upsertProfile(env, 'google_business', profile);
    found.push(profile);
  }
  return found;
}

export async function discoverSearchConsoleProfiles(env) {
  const accessToken = await googleAccessToken(env, 'search_console');
  const response = await googleJson('https://www.googleapis.com/webmasters/v3/sites', accessToken);
  const found = [];
  for (const site of response.siteEntry || []) {
    if (!site.siteUrl) continue;
    const profile = {
      profileKey: `sc:${site.siteUrl}`,
      externalId: site.siteUrl,
      label: site.siteUrl,
      city: null,
      metadata: { permissionLevel: site.permissionLevel || null },
    };
    await upsertProfile(env, 'search_console', profile);
    found.push(profile);
  }
  return found;
}

export async function discoverGoogleProfiles(env, provider) {
  if (provider === 'google_business') return discoverGoogleBusinessProfiles(env);
  if (provider === 'search_console') return discoverSearchConsoleProfiles(env);
  throw new Error('unsupported_google_provider');
}

export async function searchConsoleQuery(env, siteUrl, startDate, endDate, dimensions = []) {
  const accessToken = await googleAccessToken(env, 'search_console');
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  return googleJson(url, accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 25000 }),
  });
}
