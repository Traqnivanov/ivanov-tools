const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certCache = { expiresAt: 0, certs: null };

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

function jsonPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
}

function pemToDer(pem) {
  const body = pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s/g, '');
  return Uint8Array.from(atob(body), char => char.charCodeAt(0));
}

async function publicCerts() {
  const now = Date.now();
  if (certCache.certs && certCache.expiresAt > now) return certCache.certs;
  const response = await fetch(CERTS_URL, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error(`firebase_certs_${response.status}`);
  const cacheControl = response.headers.get('Cache-Control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] || 3600);
  const certs = await response.json();
  certCache = { certs, expiresAt: now + Math.max(300, maxAge - 60) * 1000 };
  return certs;
}

async function verifySignature(token, header) {
  const certs = await publicCerts();
  const pem = certs[header.kid];
  if (!pem) return false;
  const key = await crypto.subtle.importKey(
    'spki',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const parts = token.split('.');
  return crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
}

export async function requireOwner(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return { ok: false, status: 401, error: 'missing_bearer_token' };
  const token = auth.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, status: 401, error: 'invalid_token' };
  try {
    const header = jsonPart(parts[0]);
    const payload = jsonPart(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) throw new Error('invalid_header');
    if (!await verifySignature(token, header)) throw new Error('invalid_signature');
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now || payload.iat > now + 300) throw new Error('expired_or_future_token');
    if (payload.aud !== env.FIREBASE_PROJECT_ID) throw new Error('wrong_audience');
    if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) throw new Error('wrong_issuer');
    if (payload.sub !== env.OWNER_UID) return { ok: false, status: 403, error: 'owner_only' };
    return { ok: true, uid: payload.sub, payload };
  } catch (error) {
    return { ok: false, status: 401, error: 'invalid_token' };
  }
}
