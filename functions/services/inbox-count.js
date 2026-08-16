// GET /services/inbox-count — public, PII-free counter for the daily instrument.
// Returns how many requests are waiting in KV (BEACON_REQUESTS), by area, and the newest timestamp.
// Reading the contents (email, job text) is done by a person in the Cloudflare dashboard (KV → beacon-requests).
export async function onRequestGet({ env }) {
  if (!env.BEACON_REQUESTS) return json({ ok: false, error: "no store bound" }, 503);
  const byArea = {}; let total = 0, latest = null, cursor;
  do {
    const page = await env.BEACON_REQUESTS.list({ prefix: "req:", cursor, limit: 1000 });
    for (const k of page.keys) {
      total++;
      const parts = k.name.split(":"); // req:<iso>:<id> — iso contains ':' so rebuild
      const ts = parts.slice(1, -1).join(":");
      if (!latest || ts > latest) latest = ts;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  // area breakdown needs values; cap the read to the newest 200 keys to stay cheap
  const recent = await env.BEACON_REQUESTS.list({ prefix: "req:", limit: 200 });
  for (const k of recent.keys) {
    try { const v = JSON.parse(await env.BEACON_REQUESTS.get(k.name)); if (v && v.area) byArea[v.area] = (byArea[v.area] || 0) + 1; } catch {}
  }
  return json({ ok: true, total, byArea, latest, sampled: recent.keys.length, retentionDays: 30 });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
