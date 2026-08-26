import { googleAccessToken, searchConsoleQuery } from './google.js';

const BUSINESS_METRICS = [
  'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
  'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
  'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
  'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
  'CALL_CLICKS',
  'WEBSITE_CLICKS',
  'BUSINESS_DIRECTION_REQUESTS',
];

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function dateParts(value) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

function backfillRange(days) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: isoDay(start), end: isoDay(end) };
}

async function connectedProfiles(env, provider) {
  const rows = await env.DB.prepare(
    "SELECT provider, profile_key, external_id, label, city, metadata_json FROM channel_profiles WHERE provider=? AND status='connected' ORDER BY label",
  ).bind(provider).all();
  return rows.results || [];
}

async function upsertDaily(env, provider, profileKey, day, metric, value, metadata = {}) {
  await env.DB.prepare(`
    INSERT INTO channel_daily(provider, profile_key, day, metric, value, metadata_json, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, profile_key, day, metric) DO UPDATE SET
      value=excluded.value,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(provider, profileKey, day, metric, Number(value) || 0, JSON.stringify(metadata), new Date().toISOString()).run();
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
  const profiles = await connectedProfiles(env, 'google_business');
  if (!profiles.length) return { provider: 'google_business', profiles: 0, points: 0 };
  const accessToken = await googleAccessToken(env, 'google_business');
  const range = backfillRange(days);
  let points = 0;
  for (const profile of profiles) {
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
          await upsertDaily(env, 'google_business', profile.profile_key, day, series.dailyMetric, Number(point.value || 0));
          points++;
        }
      }
    }
  }
  return { provider: 'google_business', profiles: profiles.length, points };
}

async function replaceRankings(env, profileKey, start, end, dimension, rows) {
  await env.DB.prepare(
    'DELETE FROM channel_rankings WHERE provider=? AND profile_key=? AND period_start=? AND period_end=? AND dimension=?',
  ).bind('search_console', profileKey, start, end, dimension).run();
  const now = new Date().toISOString();
  for (const row of rows.slice(0, 250)) {
    const value = row.keys?.[0];
    if (!value) continue;
    await env.DB.prepare(`
      INSERT INTO channel_rankings(provider, profile_key, period_start, period_end, dimension, dimension_value, clicks, impressions, ctr, position, metadata_json, updated_at)
      VALUES('search_console', ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
    `).bind(profileKey, start, end, dimension, value, Number(row.clicks || 0), Number(row.impressions || 0), Number(row.ctr || 0), Number(row.position || 0), now).run();
  }
}

export async function syncSearchConsole(env, days = 10) {
  const profiles = await connectedProfiles(env, 'search_console');
  if (!profiles.length) return { provider: 'search_console', profiles: 0, points: 0 };
  const dailyRange = backfillRange(days);
  const rankingRange = backfillRange(28);
  let points = 0;
  for (const profile of profiles) {
    const daily = await searchConsoleQuery(env, profile.external_id, dailyRange.start, dailyRange.end, ['date']);
    for (const row of daily.rows || []) {
      const day = row.keys?.[0];
      if (!day) continue;
      await upsertDaily(env, 'search_console', profile.profile_key, day, 'CLICKS', row.clicks || 0);
      await upsertDaily(env, 'search_console', profile.profile_key, day, 'IMPRESSIONS', row.impressions || 0);
      await upsertDaily(env, 'search_console', profile.profile_key, day, 'CTR', row.ctr || 0);
      await upsertDaily(env, 'search_console', profile.profile_key, day, 'POSITION', row.position || 0);
      points += 4;
    }
    const queries = await searchConsoleQuery(env, profile.external_id, rankingRange.start, rankingRange.end, ['query']);
    const pages = await searchConsoleQuery(env, profile.external_id, rankingRange.start, rankingRange.end, ['page']);
    await replaceRankings(env, profile.profile_key, rankingRange.start, rankingRange.end, 'query', queries.rows || []);
    await replaceRankings(env, profile.profile_key, rankingRange.start, rankingRange.end, 'page', pages.rows || []);
  }
  return { provider: 'search_console', profiles: profiles.length, points };
}

export async function syncConnectedGoogleChannels(env) {
  const results = [];
  for (const task of [syncGoogleBusiness, syncSearchConsole]) {
    try {
      results.push(await task(env));
    } catch (error) {
      console.error('channel sync failed', error);
      results.push({ error: String(error?.message || error) });
    }
  }
  return results;
}
