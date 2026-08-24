const ALLOWED_ORIGINS = new Set([
  'https://ivanov-remonti.com',
  'https://www.ivanov-remonti.com',
  'https://traqnivanov.github.io',
]);

function corsHeaders(origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin',
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }
  return headers;
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

export default {
  fetch(request) {
    const origin = request.headers.get('Origin');

    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'forbidden' }, 403, null);
    }

    if (request.method === 'OPTIONS') {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return new Response(null, { status: 403 });
      }
      const headers = corsHeaders(origin);
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type');
      headers.set('Access-Control-Max-Age', '86400');
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'GET') {
      const headers = corsHeaders(origin);
      headers.set('Allow', 'GET, OPTIONS');
      return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
        status: 405,
        headers,
      });
    }

    const cf = request.cf || {};
    return json({
      city: typeof cf.city === 'string' && cf.city ? cf.city.slice(0, 120) : 'unknown',
      country: typeof cf.country === 'string' && cf.country ? cf.country.slice(0, 2).toUpperCase() : 'unknown',
    }, 200, origin);
  },
};
