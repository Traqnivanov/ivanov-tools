const SOFIA_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Sofia',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

const BUSINESS_EVENTS = new Set(['phone_click', 'viber_click', 'form_success']);
const INTEREST_EVENTS = new Set(['gallery_open', 'video_play', 'faq_open', 'price_open', 'contact_open']);
const ACTION_EVENTS = new Set([
  'phone_click', 'viber_click', 'form_submit', 'form_success',
  'gallery_open', 'video_play', 'faq_open', 'price_open', 'contact_open',
]);

function parts(value) {
  const out = {};
  for (const part of SOFIA_PARTS.formatToParts(new Date(value))) {
    if (part.type !== 'literal') out[part.type] = part.value;
  }
  return out;
}

function sofiaDay(value) {
  const p = parts(value);
  return `${p.year}-${p.month}-${p.day}`;
}

function sofiaHour(value) {
  return Number(parts(value).hour || 0);
}

function shiftIsoDay(day, offset) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

function todaySofia() {
  return sofiaDay(new Date().toISOString());
}

function currentMonthSofia() {
  return todaySofia().slice(0, 7);
}

function increment(object, key, amount = 1) {
  const normalized = String(key || 'unknown');
  object[normalized] = (object[normalized] || 0) + amount;
}

function keyedBucket(object, key, defaults) {
  const normalized = String(key || 'unknown');
  if (!object[normalized]) object[normalized] = structuredClone(defaults);
  return object[normalized];
}

function emptySummary() {
  return {
    totals: {
      sessions: 0,
      engagedSessions: 0,
      interestedSessions: 0,
      clientSessions: 0,
      pageViews: 0,
    },
    actions: {},
    pages: {},
    sources: {},
    devices: {},
    browsers: {},
    operatingSystems: {},
    geo: {},
    hours: {},
    campaigns: {},
  };
}

function normalizeRow(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    site: row.site,
    pagePath: row.page_path || '/',
    pageTitle: row.page_title || '',
    sessionId: row.session_id,
    receivedAt: row.received_at,
    source: row.source || 'direct',
    medium: row.medium || '',
    campaign: row.campaign || '',
    content: row.content || '',
    term: row.term || '',
    device: row.device || 'unknown',
    browser: row.browser || 'unknown',
    os: row.os || 'unknown',
    country: row.country || 'unknown',
    city: row.city || 'unknown',
    activeSeconds: Number(row.active_seconds || 0),
  };
}

function aggregate(events) {
  const summary = emptySummary();
  const sessions = new Map();

  for (const event of events) {
    const sid = event.sessionId || event.id;
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push(event);
    if (event.eventType === 'page_view') summary.totals.pageViews++;
    if (ACTION_EVENTS.has(event.eventType)) increment(summary.actions, event.eventType);
  }

  for (const sessionEvents of sessions.values()) {
    const ordered = [...sessionEvents].sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
    const firstPage = ordered.find(event => event.eventType === 'page_view') || ordered[0];
    const end = ordered.findLast?.(event => event.eventType === 'session_end')
      || [...ordered].reverse().find(event => event.eventType === 'session_end');
    const engaged = ordered.some(event => event.eventType === 'engagement' && event.activeSeconds >= 15)
      || Number(end?.activeSeconds || 0) >= 15;
    const interested = ordered.some(event => INTEREST_EVENTS.has(event.eventType));
    const client = ordered.some(event => BUSINESS_EVENTS.has(event.eventType));

    summary.totals.sessions++;
    if (engaged) summary.totals.engagedSessions++;
    if (interested) summary.totals.interestedSessions++;
    if (client) summary.totals.clientSessions++;

    increment(summary.sources, firstPage?.source || 'direct');
    increment(summary.devices, firstPage?.device || 'unknown');
    increment(summary.browsers, firstPage?.browser || 'unknown');
    increment(summary.operatingSystems, firstPage?.os || 'unknown');
    increment(summary.hours, String(sofiaHour(firstPage?.receivedAt || ordered[0]?.receivedAt)).padStart(2, '0'));

    const geoEvent = [...ordered].reverse().find(event => event.eventType === 'session_geo')
      || ordered.find(event => event.city && event.city !== 'unknown');
    increment(summary.geo, `${geoEvent?.city || 'unknown'}|${geoEvent?.country || 'unknown'}`);

    const seenPages = new Set();
    for (const event of ordered) {
      if (event.eventType !== 'page_view') continue;
      const page = keyedBucket(summary.pages, event.pagePath, {
        title: event.pageTitle || '',
        sessions: 0,
        pageViews: 0,
        interestedSessions: 0,
        clientSessions: 0,
      });
      page.pageViews++;
      if (!seenPages.has(event.pagePath)) {
        page.sessions++;
        if (interested) page.interestedSessions++;
        if (client) page.clientSessions++;
        seenPages.add(event.pagePath);
      }
    }

    if (String(firstPage?.source || '').toLowerCase() === 'google'
      && String(firstPage?.medium || '').toLowerCase() === 'cpc') {
      const key = [firstPage.campaign || '', firstPage.term || '', firstPage.content || ''].join('|');
      const campaign = keyedBucket(summary.campaigns, key, {
        campaign: firstPage.campaign || '',
        term: firstPage.term || '',
        content: firstPage.content || '',
        sessions: 0,
        clientSessions: 0,
      });
      campaign.sessions++;
      if (client) campaign.clientSessions++;
    }
  }

  return summary;
}

async function tableExists(env, name) {
  const row = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(name).first();
  return Boolean(row?.name);
}

export async function summarySchemaReady(env) {
  return (await tableExists(env, 'analytics_daily_summaries'))
    && (await tableExists(env, 'analytics_monthly_summaries'));
}

function broadUtcRange(fromDay, toDayExclusive) {
  return {
    from: `${shiftIsoDay(fromDay, -1)}T00:00:00.000Z`,
    to: `${shiftIsoDay(toDayExclusive, 1)}T00:00:00.000Z`,
  };
}

async function eventsForSofiaRange(env, fromDay, toDayExclusive) {
  const broad = broadUtcRange(fromDay, toDayExclusive);
  const rows = await env.DB.prepare(`
    SELECT id, event_type, site, page_path, page_title, session_id, received_at,
           source, medium, campaign, content, term, device, browser, os,
           country, city, active_seconds
    FROM analytics_events
    WHERE received_at>=? AND received_at<?
    ORDER BY received_at ASC
  `).bind(broad.from, broad.to).all();

  return (rows.results || [])
    .map(normalizeRow)
    .filter(event => {
      const day = sofiaDay(event.receivedAt);
      return day >= fromDay && day < toDayExclusive;
    });
}

async function writeSummary(env, table, periodKey, site, summary) {
  const keyColumn = table === 'analytics_daily_summaries' ? 'day' : 'month';
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO ${table}(${keyColumn}, site, summary_json, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(${keyColumn}, site) DO UPDATE SET
      summary_json=excluded.summary_json,
      updated_at=excluded.updated_at
  `).bind(periodKey, site, JSON.stringify(summary), now).run();
}

async function summarizeRange(env, table, periodKey, fromDay, toDayExclusive) {
  const events = await eventsForSofiaRange(env, fromDay, toDayExclusive);
  const sites = new Set(events.map(event => event.site).filter(Boolean));

  await writeSummary(env, table, periodKey, 'all', aggregate(events));
  for (const site of sites) {
    await writeSummary(env, table, periodKey, site, aggregate(events.filter(event => event.site === site)));
  }
  return { events: events.length, sites: sites.size };
}

export async function refreshAnalyticsSummaries(env) {
  if (!await summarySchemaReady(env)) return { skipped: 'summary_schema_missing' };

  const today = todaySofia();
  const yesterday = shiftIsoDay(today, -1);
  const daily = await summarizeRange(env, 'analytics_daily_summaries', yesterday, yesterday, today);

  const month = currentMonthSofia();
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonthStart = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
  const monthly = await summarizeRange(env, 'analytics_monthly_summaries', month, monthStart, nextMonthStart);

  return {
    daily: { day: yesterday, ...daily },
    monthly: { month, ...monthly },
  };
}

function validPeriodValue(period, value) {
  if (period === 'daily') return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  return /^\d{4}-\d{2}$/.test(value || '');
}

export async function listAnalyticsSummaries(env, url) {
  if (!await summarySchemaReady(env)) return { data: [], configured: false, status: 200 };

  const period = url.searchParams.get('period') || 'daily';
  if (!['daily', 'monthly'].includes(period)) return { error: 'invalid_period', status: 400 };

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to') || from;
  const site = url.searchParams.get('site') || 'all';
  if (!validPeriodValue(period, from) || !validPeriodValue(period, to) || from > to) {
    return { error: 'invalid_range', status: 400 };
  }

  const table = period === 'daily' ? 'analytics_daily_summaries' : 'analytics_monthly_summaries';
  const keyColumn = period === 'daily' ? 'day' : 'month';
  const rows = await env.DB.prepare(`
    SELECT ${keyColumn} AS period_key, site, summary_json, updated_at
    FROM ${table}
    WHERE ${keyColumn}>=? AND ${keyColumn}<=? AND site=?
    ORDER BY ${keyColumn} ASC
  `).bind(from, to, site).all();

  return {
    configured: true,
    data: (rows.results || []).map(row => ({
      period: row.period_key,
      site: row.site,
      summary: JSON.parse(row.summary_json || '{}'),
      updatedAt: row.updated_at,
    })),
    status: 200,
  };
}
