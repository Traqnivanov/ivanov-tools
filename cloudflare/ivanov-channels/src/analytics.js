const EVENT_TYPES = new Set([
  'page_view',
  'session_geo',
  'engagement',
  'scroll',
  'phone_click',
  'viber_click',
  'form_submit',
  'form_success',
  'gallery_open',
  'video_play',
  'faq_open',
  'price_open',
  'contact_open',
  'session_end',
]);

const SITES = new Set(['sofia', 'lom', 'montana', 'lom-en', 'lom-de']);
const DEVICES = new Set(['desktop', 'mobile', 'tablet']);
const SCROLL_DEPTHS = new Set([25, 50, 75, 90]);
const EVENT_TIME_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const EVENT_TIME_MAX_FUTURE_MS = 5 * 60 * 1000;
const ALLOWED_KEYS = new Set([
  'eventType',
  'site',
  'pagePath',
  'pageTitle',
  'sessionId',
  'trackerVersion',
  'source',
  'medium',
  'campaign',
  'content',
  'term',
  'referrerDomain',
  'device',
  'browser',
  'os',
  'country',
  'city',
  'activeSeconds',
  'totalSeconds',
  'scrollDepth',
  'formId',
  'eventTime',
]);

function stringValue(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function optionalNumber(value, max) {
  return value === undefined || (Number.isFinite(value) && value >= 0 && value <= max);
}

function validEventTime(value) {
  if (value === undefined) return true;
  if (typeof value !== 'string' || value.length > 40) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  const now = Date.now();
  return parsed >= now - EVENT_TIME_MAX_AGE_MS && parsed <= now + EVENT_TIME_MAX_FUTURE_MS;
}

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return 'invalid_event';
  if (Object.keys(event).some(key => !ALLOWED_KEYS.has(key))) return 'unexpected_field';
  if (!EVENT_TYPES.has(event.eventType)) return 'invalid_event_type';
  if (!SITES.has(event.site)) return 'invalid_site';
  if (!stringValue(event.pagePath, 240) || !event.pagePath.startsWith('/')) return 'invalid_page_path';
  if (!stringValue(event.pageTitle, 180)) return 'invalid_page_title';
  if (!stringValue(event.sessionId, 80) || !event.sessionId) return 'invalid_session_id';
  if (!stringValue(event.trackerVersion, 20)) return 'invalid_tracker_version';
  if (!stringValue(event.source, 180)) return 'invalid_source';
  if (!stringValue(event.medium, 100)) return 'invalid_medium';
  if (!stringValue(event.campaign, 180)) return 'invalid_campaign';
  if (!stringValue(event.content, 180)) return 'invalid_content';
  if (!stringValue(event.term, 180)) return 'invalid_term';
  if (!stringValue(event.referrerDomain, 180)) return 'invalid_referrer';
  if (!DEVICES.has(event.device)) return 'invalid_device';
  if (!stringValue(event.browser, 60)) return 'invalid_browser';
  if (!stringValue(event.os, 60)) return 'invalid_os';
  if (!stringValue(event.country, 30)) return 'invalid_country';
  if (event.city !== undefined && !stringValue(event.city, 120)) return 'invalid_city';
  if (!optionalNumber(event.activeSeconds, 86400)) return 'invalid_active_seconds';
  if (!optionalNumber(event.totalSeconds, 86400)) return 'invalid_total_seconds';
  if (event.scrollDepth !== undefined && !SCROLL_DEPTHS.has(event.scrollDepth)) return 'invalid_scroll_depth';
  if (event.formId !== undefined && !stringValue(event.formId, 100)) return 'invalid_form_id';
  if (!validEventTime(event.eventTime)) return 'invalid_event_time';
  return null;
}

export async function parseAnalyticsEvent(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > 8192) return { error: 'payload_too_large', status: 413 };
  const text = await request.text();
  if (!text || text.length > 8192) return { error: text ? 'payload_too_large' : 'empty_payload', status: text ? 413 : 400 };
  let event;
  try {
    event = JSON.parse(text);
  } catch {
    return { error: 'invalid_json', status: 400 };
  }
  const validationError = validateEvent(event);
  if (validationError) return { error: validationError, status: 400 };
  return { event };
}

export async function enforceAnalyticsRateLimit(request, env) {
  if (!env.ANALYTICS_RATE_LIMITER?.limit) return { ok: false, status: 503, error: 'rate_limiter_unconfigured' };
  const key = request.headers.get('CF-Connecting-IP') || 'unknown';
  const result = await env.ANALYTICS_RATE_LIMITER.limit({ key });
  return result?.success
    ? { ok: true }
    : { ok: false, status: 429, error: 'rate_limited' };
}

export async function storeAnalyticsEvent(env, event) {
  const id = crypto.randomUUID();
  const receivedAt = event.eventTime ? new Date(event.eventTime).toISOString() : new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO analytics_events(
      id, event_type, site, page_path, page_title, session_id, received_at,
      tracker_version, source, medium, campaign, content, term, referrer_domain,
      device, browser, os, country, city, active_seconds, total_seconds,
      scroll_depth, form_id
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    event.eventType,
    event.site,
    event.pagePath,
    event.pageTitle,
    event.sessionId,
    receivedAt,
    event.trackerVersion,
    event.source,
    event.medium,
    event.campaign,
    event.content,
    event.term,
    event.referrerDomain,
    event.device,
    event.browser,
    event.os,
    event.country,
    event.city ?? null,
    event.activeSeconds ?? null,
    event.totalSeconds ?? null,
    event.scrollDepth ?? null,
    event.formId ?? null,
  ).run();
  return { id, receivedAt };
}

function validIso(value) {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function mapAnalyticsRow(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    site: row.site,
    pagePath: row.page_path,
    pageTitle: row.page_title,
    sessionId: row.session_id,
    timestamp: row.received_at,
    trackerVersion: row.tracker_version,
    source: row.source,
    medium: row.medium,
    campaign: row.campaign,
    content: row.content,
    term: row.term,
    referrerDomain: row.referrer_domain,
    device: row.device,
    browser: row.browser,
    os: row.os,
    country: row.country,
    ...(row.city == null ? {} : { city: row.city }),
    ...(row.active_seconds == null ? {} : { activeSeconds: Number(row.active_seconds) }),
    ...(row.total_seconds == null ? {} : { totalSeconds: Number(row.total_seconds) }),
    ...(row.scroll_depth == null ? {} : { scrollDepth: Number(row.scroll_depth) }),
    ...(row.form_id == null ? {} : { formId: row.form_id }),
  };
}

export async function listAnalyticsEvents(env, url) {
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const requestedLimit = Number(url.searchParams.get('limit') || 10000);
  if (!validIso(from) || !validIso(to)) return { error: 'valid_from_to_required', status: 400 };
  if (Date.parse(from) > Date.parse(to)) return { error: 'invalid_range', status: 400 };
  const rowLimit = Number.isInteger(requestedLimit) ? Math.min(10000, Math.max(1, requestedLimit)) : 10000;
  const rows = await env.DB.prepare(`
    SELECT id, event_type, site, page_path, page_title, session_id, received_at,
      tracker_version, source, medium, campaign, content, term, referrer_domain,
      device, browser, os, country, city, active_seconds, total_seconds,
      scroll_depth, form_id
    FROM analytics_events
    WHERE received_at >= ? AND received_at <= ?
    ORDER BY received_at DESC
    LIMIT ?
  `).bind(from, to, rowLimit).all();
  return { data: (rows.results || []).map(mapAnalyticsRow), status: 200 };
}