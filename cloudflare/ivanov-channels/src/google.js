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
  if (!response.ok) {
    const detail = String(body.error_description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    throw new Error(
      [`google_token_${response.status}_${body.error || 'unknown'}`, detail].filter(Boolean).join(' | ')
    );
  }
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

function compactApiDetail(value, max = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
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
  if (!response.ok) {
    const googleError = body?.error || {};
    const status = compactApiDetail(googleError.status);
    const message = compactApiDetail(googleError.message);
    const details = compactApiDetail(JSON.stringify(googleError.details || []), 300);
    throw new Error(
      [`google_api_${response.status}`, status, message, details].filter(Boolean).join(' | ')
    );
  }
  return body;
}

function normalizeKnownCity(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return null;
  if (/(^|[^a-zа-я])(?:лом|lom)(?=$|[^a-zа-я])/iu.test(text)) return 'Лом';
  if (/(^|[^a-zа-я])(?:софия|sofia)(?=$|[^a-zа-я])/iu.test(text)) return 'София';
  if (/(^|[^a-zа-я])(?:монтана|montana)(?=$|[^a-zа-я])/iu.test(text)) return 'Монтана';
  return null;
}

function cityFromLocation(location) {
  return normalizeKnownCity(location?.storefrontAddress?.locality)
    || normalizeKnownCity(location?.title)
    || normalizeKnownCity(location?.websiteUri)
    || normalizeKnownCity(JSON.stringify(location?.serviceArea || {}))
    || null;
}

async function connectedProfileCount(env, provider) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM channel_profiles WHERE provider=? AND status='connected'",
  ).bind(provider).first();
  return Number(row?.count || 0);
}

async function listGoogleBusinessLocations(accessToken) {
  const found = [];
  let pageToken = '';
  do {
    const url = new URL('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/-/locations');
    url.searchParams.set('readMask', 'name,title,storefrontAddress,serviceArea,websiteUri,metadata');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const body = await googleJson(url.toString(), accessToken);
    found.push(...(body.locations || []));
    pageToken = String(body.nextPageToken || '');
  } while (pageToken);
  return found;
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

async function markMissingProfilesStale(env, provider, profileKeys, { keepDerived = false } = {}) {
  const filters = ["provider=?", "status='connected'"];
  const bindings = [provider];
  if (keepDerived) filters.push("profile_key NOT LIKE 'sc-city:%'");
  if (profileKeys.length) {
    filters.push(`profile_key NOT IN (${profileKeys.map(() => '?').join(',')})`);
    bindings.push(...profileKeys);
  }

  const missing = await env.DB.prepare(
    `SELECT profile_key, metadata_json FROM channel_profiles WHERE ${filters.join(' AND ')}`,
  ).bind(...bindings).all();

  const now = new Date().toISOString();
  for (const row of missing.results || []) {
    let metadata = {};
    try { metadata = JSON.parse(row.metadata_json || '{}'); } catch (_) {}
    const misses = Number(metadata.discoveryMisses || 0) + 1;
    metadata.discoveryMisses = misses;
    metadata.lastDiscoveryMissAt = now;

    if (misses >= 2) {
      await env.DB.prepare(
        "UPDATE channel_profiles SET status='stale', metadata_json=?, updated_at=? WHERE provider=? AND profile_key=?",
      ).bind(JSON.stringify(metadata), now, provider, row.profile_key).run();
    } else {
      await env.DB.prepare(
        "UPDATE channel_profiles SET metadata_json=?, updated_at=? WHERE provider=? AND profile_key=?",
      ).bind(JSON.stringify(metadata), now, provider, row.profile_key).run();
    }
  }
}

export async function discoverGoogleBusinessProfiles(env) {
  const provider = 'google_business';
  const accessToken = await googleAccessToken(env, provider);
  const existingConnected = await connectedProfileCount(env, provider);
  const locations = await listGoogleBusinessLocations(accessToken);
  const found = [];
  for (const location of locations) {
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
        serviceArea: location.serviceArea || null,
        citySource: normalizeKnownCity(location?.storefrontAddress?.locality)
          ? 'storefrontAddress.locality'
          : normalizeKnownCity(location?.title)
            ? 'title'
            : normalizeKnownCity(location?.websiteUri)
              ? 'websiteUri'
              : normalizeKnownCity(JSON.stringify(location?.serviceArea || {}))
                ? 'serviceArea'
                : 'unresolved',
      },
    };
    await upsertProfile(env, 'google_business', profile);
    found.push(profile);
  }
  if (!found.length && existingConnected > 0) {
    throw new Error(`google_business_empty_discovery_existing_${existingConnected}`);
  }
  if (found.length) {
    await markMissingProfilesStale(env, provider, found.map(profile => profile.profileKey));
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
  await markMissingProfilesStale(env, 'search_console', found.map(profile => profile.profileKey), { keepDerived: true });
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
