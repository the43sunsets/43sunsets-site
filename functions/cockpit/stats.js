// GET /cockpit/stats — daily instrument for the 10/6 buyer gate (v5 §7/§11): U (unique visitors), R (visitors seen on 2+ days), D (visitor-days), per source; "list" = list-attributed (utm_source=list|w1|w2…).
// Aggregates "hit:<day>:<vid>" keys written by /cockpit/hit. PII-free. Optional ?since=YYYY-MM-DD (default: 90 days back).
export async function onRequestGet({ request, env }) {
  if (!env.BEACON_REQUESTS) return json({ ok: false, error: "no store bound" }, 503);
  const url = new URL(request.url);
  const since = (url.searchParams.get("since") || "").slice(0, 10) || new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const days = {}; const byVid = {}; const bySrc = {}; let cursor, keys = 0;
  do {
    const page = await env.BEACON_REQUESTS.list({ prefix: "hit:", cursor, limit: 1000 });
    for (const k of page.keys) {
      const [, day, vid] = k.name.split(":");
      if (!day || !vid || day < since) continue;
      keys++;
      days[day] = (days[day] || 0) + 1;
      (byVid[vid] ||= new Set()).add(day);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  // source needs values; cap to newest 500 keys to stay within free-tier reads
  const recent = await env.BEACON_REQUESTS.list({ prefix: "hit:", limit: 500 });
  const srcOfVid = {};
  for (const k of recent.keys) {
    const [, day, vid] = k.name.split(":");
    if (day < since) continue;
    try { const v = JSON.parse(await env.BEACON_REQUESTS.get(k.name)); if (v && v.src && !srcOfVid[vid]) srcOfVid[vid] = v.src; } catch {}
  }
  // per-source U (unique visitors) and R (visitors seen on 2+ distinct days) — "list" = wave 1/2 recipients (utm_source), v5 §7 U/R
  for (const vid of Object.keys(byVid)) {
    const s = srcOfVid[vid] || "unknown";
    (bySrc[s] ||= { U: 0, R: 0 }).U += 1;
    if (byVid[vid].size >= 2) bySrc[s].R += 1;
  }
  const U = Object.keys(byVid).length;
  const R = Object.values(byVid).filter(s => s.size >= 2).length;
  const list = Object.entries(bySrc).filter(([k]) => /^(list|w\d+)/.test(k)).reduce((a, [, v]) => ({ U: a.U + v.U, R: a.R + v.R }), { U: 0, R: 0 });
  return json({ ok: true, since, U, R, D: keys, list, bySrc, byDay: days, sampledForSrc: recent.keys.length, retentionDays: 90 });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
