import { fetchAnalyticsEvents, clearAnalyticsEventCache } from './event-source.js?v=20260829-stage5m';

window.__ivanovFetchAnalyticsEvents = fetchAnalyticsEvents;

document.querySelector('#refreshBtn')?.addEventListener('click', clearAnalyticsEventCache, { capture: true });

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
    const beforeEventSource = source;
    source = source.replace(
      /async function fetchEvents\(timeRange\)\{[\s\S]*?\n\}\n\nasync function load/,
      "async function fetchEvents(timeRange){return normalizeAttribution(await window.__ivanovFetchAnalyticsEvents(timeRange));}\n\nasync function load",
    );
    if (source === beforeEventSource || !source.includes('window.__ivanovFetchAnalyticsEvents(timeRange)')) {
      throw new Error('dashboard_event_source_patch_not_applied');
    }

    const beforeAverage = source;
    source = source.replace(
      "  const endings=by(items,'session_end').map(event=>+event.activeSeconds||0).filter(value=>value>=0);\n  const average=endings.length?endings.reduce((sum,value)=>sum+value,0)/endings.length:0;",
      "  const activeBySession=new Map();\n  by(items,'session_end').forEach(event=>{\n    const key=event.sessionId||event.id;\n    if(!key)return;\n    activeBySession.set(key,(activeBySession.get(key)||0)+Math.max(0,+event.activeSeconds||0));\n  });\n  const sessionActive=[...activeBySession.values()];\n  const average=sessionActive.length?sessionActive.reduce((sum,value)=>sum+value,0)/sessionActive.length:0;",
    );
    if (source === beforeAverage || !source.includes('const activeBySession=new Map();')) {
      throw new Error('dashboard_session_average_patch_not_applied');
    }

    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      await import(blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.warn('Stage 3 dashboard loader fallback.', error);
    window.__ivanovDashboardLegacyFallback = {
      active: true,
      message: String(error?.message || 'dashboard_loader_failed'),
      at: new Date().toISOString(),
    };
    window.dispatchEvent(new CustomEvent('ivanov:analytics-loader-fallback', { detail: window.__ivanovDashboardLegacyFallback }));
    await import('./dashboard.js?v=20260827-stage1e');
  }
}

loadDashboard();
