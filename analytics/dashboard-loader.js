import { fetchAnalyticsEvents } from './event-source.js?v=20260829-stage5m';

window.__ivanovFetchAnalyticsEvents = fetchAnalyticsEvents;

async function loadDashboard() {
  const sourceUrl = './dashboard.js?v=20260827-stage1e';
  try {
    const response = await fetch(sourceUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`dashboard_source_${response.status}`);
    let source = await response.text();
    const firebaseConfigUrl = new URL('./firebase-config.js?v=20260818-5', location.href).href;
    const sitesUrl = new URL('./sites.js?v=20260818-5', location.href).href;
    source = source
      .replace('./firebase-config.js?v=20260818-5', firebaseConfigUrl)
      .replace('./sites.js?v=20260818-5', sitesUrl);
    const before = source;
    source = source.replace(
      /async function fetchEvents\(timeRange\)\{[\s\S]*?\n\}\n\nasync function load/,
      "async function fetchEvents(timeRange){return normalizeAttribution(await window.__ivanovFetchAnalyticsEvents(timeRange));}\n\nasync function load",
    );
    if (source === before || !source.includes('window.__ivanovFetchAnalyticsEvents(timeRange)')) {
      throw new Error('dashboard_event_source_patch_not_applied');
    }
    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.warn('Stage 3 dashboard loader fallback.', error);
    await import('./dashboard.js?v=20260827-stage1e');
  }
}

loadDashboard();
