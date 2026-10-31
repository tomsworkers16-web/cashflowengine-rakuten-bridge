const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
// Prefer the current Supabase secret-key name, but keep compatibility with the
// environment variable already configured on Render.
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

export function getSupabaseStatus() {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY),
    urlConfigured: Boolean(SUPABASE_URL),
    secretConfigured: Boolean(SUPABASE_SECRET_KEY)
  };
}

export async function writeSystemEvent({
  component,
  eventType,
  severity = 'info',
  message = null,
  resolved = false,
  resolution = null,
  metadata = {}
}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error('supabase_not_configured');
  }

  if (!component || !eventType) {
    throw new Error('system_event_component_and_event_type_required');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/system_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SECRET_KEY,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      component,
      event_type: eventType,
      severity,
      message,
      resolved,
      resolution,
      metadata
    })
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text || null;
  }

  if (!response.ok) {
    const detail = typeof data === 'string' ? data : JSON.stringify(data);
    throw new Error(`supabase_insert_failed:${response.status}:${detail}`);
  }

  return Array.isArray(data) ? data[0] : data;
}
