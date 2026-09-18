import { googleAccessToken, searchConsoleQuery } from './google.js';
import { syncFacebookPages } from './facebook.js';
import { recordSyncOutcome, syncErrorText } from './sync-health.js';

const BUSINESS_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
];

const SEARCH_SITE_PROFILES = [
  {
    slug: 'sofia',
    label: 'София',
    city: 'София',
    pageFilters: [
      { dimension: 'page', operator: 'notContains', expression: '/lom' },
      { dimension: 'page', operator: 'notContains', expression: '/montana' },
      { dimension: 'page', operator: 'notContains', expression: '/en/' },
      { dimension: 'page', operator: 'notContains', expression: '/de/' },
      { dimension: 'page', operator: 'notContains', expression: '/narachnik' },
    ],
  },
  {
    slug: 'lom',
    label: 'Лом',
    city: 'Лом',
    pageFilters: [
      { dimension: 'page', operator: 'contains', expression: '/lom' },
      { dimension: 'page', operator: 'notContains', expression: '/en/' },
      { dimension: 'page', operator: 'notContains', expression: '/de/' },
    ],
  },
  {
    slug: 'montana',
    label: 'Монтана',
    city: 'Монтана',
    pageFilters: [
      { dimension: 'page', operator: 'contains', expression: '/montana' },
    ],
  },
  {
    slug: 'lom-en',
    label: 'Лом EN',
    city: 'Лом',
    pageFilters: [
      { dimension: 'page', operator: 'contains', expression: '/en/' },
    ],
  },
  {
    slug: 'lom-de',
    label: 'Лом DE',
    city: 'Лом',
    pageFilters: [
      { dimension: 'page', operator: 'contains', expression: '/de/' },
    ],
  },
];

const SOFIA_DAY_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Sofia',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function sofiaDay(date = new Date()) {
  return SOFIA_DAY_FORMATTER.format(date);
}

function shiftDay(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function dateParts(value) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function backfillRange(days) {
  const end = shiftDay(sofiaDay(), -1);
  const start = shiftDay(end, -(days - 1));
  return { start, end };
}

async function connectedProfiles(env, provider) {
  const rows = await env.DB.prepare(
    "SELECT provider, profile_key, external_id, label, city, metadata_json FROM channel_profiles WHERE provider=? AND status='connected' ORDER BY label",
  ).bind(provider).all();
  return rows.results || [];
}

function dailyUpsertStatement(env, provider, profileKey, day, metric, value, metadata = {}) {
  return env.DB.prepare(`
    INSERT INTO channel_daily(provider, profile_key, day, metric, value, metadata_json, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, profile_key, day, metric) DO UPDATE SET
      value=excluded.value,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(provider, profileKey, day, metric, Number(value) || 0, JSON.stringify(metadata), new Date().toISOString());
}

async function upsertDaily(env, provider, profileKey, day, metric, value, metadata = {}) {
  await dailyUpsertStatement(env, provider, profileKey, day, metric, value, metadata).run();
}

async function batchDailyRows(env, provider, profileKey, rows, metadata = {}) {
  const statements = [];
  let points = 0;
  for (const row of rows || []) {
    const day = row.keys?.[0];
    if (!day) continue;
    statements.push(
      dailyUpsertStatement(env, provider, profileKey, day, 'CLICKS', row.clicks || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'IMPRESSIONS', row.impressions || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'CTR', row.ctr || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'POSITION', row.position || 0, metadata),
    );
    points += 4;
  }
  if (statements.length) await env.DB.batch(statements);
  return points;
}

async function replaceDailyRows(env, provider, profileKey, start, end, rows, metadata = {}) {
  const statements = [
    env.DB.prepare(
      'DELETE FROM channel_daily WHERE provider=? AND profile_key=? AND day>=? AND day<=?',
    ).bind(provider, profileKey, start, end),
  ];
  let points = 0;
  for (const row of rows || []) {
    const day = row.keys?.[0];
    if (!day) continue;
    statements.push(
      dailyUpsertStatement(env, provider, profileKey, day, 'CLICKS', row.clicks || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'IMPRESSIONS', row.impressions || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'CTR', row.ctr || 0, metadata),
      dailyUpsertStatement(env, provider, profileKey, day, 'POSITION', row.position || 0, metadata),
    );
    points += 4;
  }
  await env.DB.batch(statements);
  return points;
}

function businessPerformanceUrl(locationName, start, end) {
  const locationId = String(locationName || '').split('/').pop();
  if (!locationId) throw new Error('invalid_business_location');
  const startParts = dateParts(start);
  const endParts = dateParts(end);
  const url = new URL(`https://businessprofileperformance.googleapis.com/v1/locations/${encodeURIComponent(locationId)}:fetchMultiDailyMetricsTimeSeries`);
  BUSINESS_METRICS.forEach(metric => url.searchParams.append('dailyMetrics', metric));
  url.searchParams.set('dailyRange.start_date.year', startParts.year);
  url.searchParams.set('dailyRange.start_date.month', startParts.month);
  url.searchParams.set('dailyRange.start_date.day', startParts.day);
  url.searchParams.set('dailyRange.end_date.year', endParts.year);
  url.searchParams.set('dailyRange.end_date.month', endParts.month);
  url.searchParams.set('dailyRange.end_date.day', endParts.day);
  return url.toString();
}

function googleDate(value) {
  if (!value?.year || !value?.month || !value?.day) return null;
  return `${String(value.year).padStart(4, '0')}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
}

export async function syncGoogleBusiness(env, days = 7) {
  const provider = 'google_business';
  const profiles = await connectedProfiles(env, provider);
  if (!profiles.length) return { provider, profiles: 0, successfulProfiles: 0, points: 0, errors: [] };
  const accessToken = await googleAccessToken(env, provider);
  const range = backfillRange(days);
  let points = 0;
  let successfulProfiles = 0;
  const errors = [];

  for (const profile of profiles) {
    let profilePoints = 0;
    try {
      const response = await fetch(businessPerformanceUrl(profile.external_id, range.start, range.end), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) throw new Error(`business_performance_${response.status}`);
      const body = await response.json();
      for (const multi of body.multiDailyMetricTimeSeries || []) {
        for (const series of multi.dailyMetricTimeSeries || []) {
          for (const point of series.timeSeries?.datedValues || []) {
            const day = googleDate(point.date);
            if (!day) continue;
            await upsertDaily(env, provider, profile.profile_key, day, series.dailyMetric, Number(point.value || 0));
            profilePoints++;
            points++;
          }
        }
      }
      successfulProfiles++;
      await recordSyncOutcome(env, provider, profile.profile_key, {
        status: 'ok',
        points: profilePoints,
        metadata: { range },
      });
    } catch (error) {
      const message = syncErrorText(error);
      errors.push({ profileKey: profile.profile_key, error: message });
      await recordSyncOutcome(env, provider, profile.profile_key, {
        status: 'error',
        error: message,
        points: profilePoints,
        metadata: { range },
      });
    }
  }

  return { provider, profiles: profiles.length, successfulProfiles, points, errors };
}

async function replaceRankings(env, profileKey, start, end, dimension, rows) {
  const deleteStatement = env.DB.prepare(
    'DELETE FROM channel_rankings WHERE provider=? AND profile_key=? AND period_start=? AND period_end=? AND dimension=?',
  ).bind('search_console', profileKey, start, end, dimension);

  const now = new Date().toISOString();
  const insertTemplate = env.DB.prepare(`
    INSERT INTO channel_rankings(provider, profile_key, period_start, period_end, dimension, dimension_value, clicks, impressions, ctr, position, metadata_json, updated_at)
    VALUES('search_console', ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
  `);

  const statements = [deleteStatement];
  for (const row of (rows || []).slice(0, 250)) {
    const value = row.keys?.[0];
    if (!value) continue;
    statements.push(insertTemplate.bind(
      profileKey,
      start,
      end,
      dimension,
      value,
      Number(row.clicks || 0),
      Number(row.impressions || 0),
      Number(row.ctr || 0),
      Number(row.position || 0),
      now,
    ));
  }
  await env.DB.batch(statements);
}

async function upsertDerivedSearchProfile(env, profileKey, externalId, label, city, sourceProfileKey, site) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO channel_profiles(provider, profile_key, external_id, label, city, status, metadata_json, updated_at)
    VALUES('search_console', ?, ?, ?, ?, 'connected', ?, ?)
    ON CONFLICT(provider, profile_key) DO UPDATE SET
      external_id=excluded.external_id,
      label=excluded.label,
      city=excluded.city,
      status='connected',
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(profileKey, externalId, label, city, JSON.stringify({ derived: true, sourceProfileKey, site }), now).run();
}

async function searchConsoleFilteredQuery(accessToken, siteUrl, startDate, endDate, dimensions = [], pageFilters = [], rowLimit = 250) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const body = { startDate, endDate, dimensions, rowLimit };
  if (pageFilters.length) {
    body.dimensionFilterGroups = [{
      groupType: 'and',
      filters: pageFilters,
    }];
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`search_console_${response.status}`);
  return result;
}

function rootIvanovProfile(profiles) {
  const candidates = profiles.filter(profile => {
    if (String(profile.profile_key || '').startsWith('sc-city:')) return false;
    const id = String(profile.external_id || '').toLowerCase();
    return id.includes('ivanov-remonti.com') && !id.includes('/lom/');
  });
  return candidates.find(profile => String(profile.external_id || '').startsWith('sc-domain:'))
    || candidates.find(profile => /^https?:\/\/ivanov-remonti\.com\/?$/i.test(String(profile.external_id || '')))
    || candidates[0]
    || null;
}

async function syncDerivedSiteProfile(env, accessToken, sourceProfile, config, dailyRange, rankingRange) {
  const profileKey = `sc-city:${config.slug}`;
  const metadata = { city: config.city, site: config.slug, derived: true };
  await upsertDerivedSearchProfile(
    env,
    profileKey,
    sourceProfile.external_id,
    `Ivanov Remonti ${config.label}`,
    config.city,
    sourceProfile.profile_key,
    config.slug,
  );

  const daily = await searchConsoleFilteredQuery(
    accessToken,
    sourceProfile.external_id,
    dailyRange.start,
    dailyRange.end,
    ['date'],
    config.pageFilters,
    100,
  );
  const points = await replaceDailyRows(
    env,
    'search_console',
    profileKey,
    dailyRange.start,
    dailyRange.end,
    daily.rows || [],
    metadata,
  );

  const [queries, pages] = await Promise.all([
    searchConsoleFilteredQuery(accessToken, sourceProfile.external_id, rankingRange.start, rankingRange.end, ['query'], config.pageFilters, 250),
    searchConsoleFilteredQuery(accessToken, sourceProfile.external_id, rankingRange.start, rankingRange.end, ['page'], config.pageFilters, 250),
  ]);
  await Promise.all([
    replaceRankings(env, profileKey, rankingRange.start, rankingRange.end, 'query', queries.rows || []),
    replaceRankings(env, profileKey, rankingRange.start, rankingRange.end, 'page', pages.rows || []),
  ]);
  return points;
}

export async function syncSearchConsole(env, days = 10) {
  const provider = 'search_console';
  const profiles = await connectedProfiles(env, provider);
  const sourceProfiles = profiles.filter(profile => !String(profile.profile_key || '').startsWith('sc-city:'));
  if (!sourceProfiles.length) return { provider, profiles: 0, successfulProfiles: 0, derivedProfiles: 0, points: 0, errors: [] };
  const dailyRange = backfillRange(days);
  const rankingRange = backfillRange(28);
  let points = 0;
  let successfulProfiles = 0;
  let successfulDerivedProfiles = 0;
  const errors = [];

  for (const profile of sourceProfiles) {
    let profilePoints = 0;
    try {
      const daily = await searchConsoleQuery(env, profile.external_id, dailyRange.start, dailyRange.end, ['date']);
      profilePoints += await batchDailyRows(env, provider, profile.profile_key, daily.rows || []);

      const [queries, pages] = await Promise.all([
        searchConsoleQuery(env, profile.external_id, rankingRange.start, rankingRange.end, ['query']),
        searchConsoleQuery(env, profile.external_id, rankingRange.start, rankingRange.end, ['page']),
      ]);
      await Promise.all([
        replaceRankings(env, profile.profile_key, rankingRange.start, rankingRange.end, 'query', queries.rows || []),
        replaceRankings(env, profile.profile_key, rankingRange.start, rankingRange.end, 'page', pages.rows || []),
      ]);
      points += profilePoints;
      successfulProfiles++;
      await recordSyncOutcome(env, provider, profile.profile_key, {
        status: 'ok',
        points: profilePoints,
        metadata: { dailyRange, rankingRange, derived: false },
      });
    } catch (error) {
      const message = syncErrorText(error);
      errors.push({ profileKey: profile.profile_key, error: message });
      await recordSyncOutcome(env, provider, profile.profile_key, {
        status: 'error',
        error: message,
        points: profilePoints,
        metadata: { dailyRange, rankingRange, derived: false },
      });
    }
  }

  const root = rootIvanovProfile(sourceProfiles);
  if (root) {
    try {
      const accessToken = await googleAccessToken(env, provider);
      for (const config of SEARCH_SITE_PROFILES) {
        const profileKey = `sc-city:${config.slug}`;
        try {
          const derivedPoints = await syncDerivedSiteProfile(env, accessToken, root, config, dailyRange, rankingRange);
          points += derivedPoints;
          successfulDerivedProfiles++;
          await recordSyncOutcome(env, provider, profileKey, {
            status: 'ok',
            points: derivedPoints,
            metadata: { dailyRange, rankingRange, derived: true, sourceProfileKey: root.profile_key },
          });
        } catch (error) {
          const message = syncErrorText(error);
          errors.push({ profileKey, error: message });
          await recordSyncOutcome(env, provider, profileKey, {
            status: 'error',
            error: message,
            metadata: { dailyRange, rankingRange, derived: true, sourceProfileKey: root.profile_key },
          });
        }
      }
    } catch (error) {
      const message = syncErrorText(error);
      errors.push({ profileKey: 'derived_profiles', error: message });
      for (const config of SEARCH_SITE_PROFILES) {
        await recordSyncOutcome(env, provider, `sc-city:${config.slug}`, {
          status: 'error',
          error: message,
          metadata: { dailyRange, rankingRange, derived: true, sourceProfileKey: root.profile_key },
        });
      }
    }
  }

  return {
    provider,
    profiles: sourceProfiles.length,
    successfulProfiles,
    derivedProfiles: root ? SEARCH_SITE_PROFILES.length : 0,
    successfulDerivedProfiles,
    points,
    errors,
  };
}

export async function syncConnectedChannels(env) {
  const tasks = [
    ['google_business', syncGoogleBusiness],
    ['search_console', syncSearchConsole],
    ['facebook', syncFacebookPages],
  ];
  const results = [];

  for (const [provider, task] of tasks) {
    try {
      const result = await task(env);
      const errors = Array.isArray(result.errors) ? result.errors : [];
      const successfulProfiles =
        Number(result.successfulProfiles || 0) +
        Number(result.successfulDerivedProfiles || 0);
      const status = errors.length
        ? (successfulProfiles > 0 ? 'partial' : 'error')
        : 'ok';
      const error = errors.map(item => `${item.profileKey || 'provider'}: ${item.error}`).join(' | ');
      await recordSyncOutcome(env, provider, '', {
        status,
        error,
        points: result.points || 0,
        metadata: {
          profiles: result.profiles || 0,
          successfulProfiles: result.successfulProfiles || 0,
          derivedProfiles: result.derivedProfiles || 0,
          successfulDerivedProfiles: result.successfulDerivedProfiles || 0,
          errorCount: errors.length,
        },
      });
      results.push(result);
    } catch (error) {
      const message = syncErrorText(error);
      console.error('channel sync failed', provider, error);
      await recordSyncOutcome(env, provider, '', { status: 'error', error: message });
      results.push({ provider, error: message, errors: [{ profileKey: 'provider', error: message }] });
    }
  }
  return results;
}
