const PROFILE_ALL = '';

function nowIso() {
  return new Date().toISOString();
}

function key(profileKey) {
  return String(profileKey || PROFILE_ALL);
}

function errorText(error) {
  return String(error?.message || error || 'sync_failed').slice(0, 600);
}

function metadataText(metadata) {
  try { return JSON.stringify(metadata || {}).slice(0, 4000); }
  catch (_) { return '{}'; }
}

async function writeOutcome(env, provider, profileKey, status, { error = '', points = 0, metadata = {} } = {}) {
  const now = nowIso();
  const successAt = status === 'ok' ? now : null;
  await env.DB.prepare(`
    INSERT INTO channel_sync_status(
      provider, profile_key, last_status, last_attempt_at, last_success_at,
      last_error, last_points, metadata_json, updated_at
    )
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, profile_key) DO UPDATE SET
      last_status=excluded.last_status,
      last_attempt_at=excluded.last_attempt_at,
      last_success_at=CASE
        WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at
        ELSE channel_sync_status.last_success_at
      END,
      last_error=excluded.last_error,
      last_points=excluded.last_points,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(
    provider,
    key(profileKey),
    status,
    now,
    successAt,
    error ? errorText(error) : '',
    Math.max(0, Number(points) || 0),
    metadataText(metadata),
    now,
  ).run();
}

export async function recordSyncOutcome(env, provider, profileKey = PROFILE_ALL, outcome = {}) {
  const status = ['ok', 'partial', 'error'].includes(outcome.status) ? outcome.status : 'error';
  try {
    await writeOutcome(env, provider, profileKey, status, outcome);
  } catch (error) {
    if (!String(error?.message || error).includes('no such table')) throw error;
  }
}

export async function listSyncHealth(env) {
  try {
    const rows = await env.DB.prepare(`
      SELECT provider, profile_key, last_status, last_attempt_at, last_success_at,
             last_error, last_points, metadata_json, updated_at
      FROM channel_sync_status
      ORDER BY provider, profile_key
    `).all();
    return rows.results || [];
  } catch (error) {
    if (String(error?.message || error).includes('no such table')) return [];
    throw error;
  }
}

export function syncErrorText(error) {
  return errorText(error);
}
