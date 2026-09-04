// POST /cockpit/hit — PII-free visit beacon for the free cockpit pages (v5 §4 T3: U = unique visitors by source, R = revisits).
// Body: {vid, src, path}. vid = random id the browser keeps in localStorage (no cookie, no IP, no UA stored).
// Stored in KV BEACON_REQUESTS under "hit:<day>:<vid>" (one key per visitor-day; TTL 90 days). Never read by the page.
export async function onRequestPost({ request, env }) {
  if (!env.BEACON_REQUESTS) return new Response("no store", { status: 503 });
  let b; try { b = await request.json(); } catch { return new Response("bad", { status: 400 }); }
  const vid = String(b.vid || "").replace(/[^a-z0-9]/gi, "").slice(0, 32);
  const src = String(b.src || "direct").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "direct";
  const path = String(b.path || "/").replace(/[^a-z0-9/_-]/gi, "").slice(0, 64);
  if (vid.length < 8) return new Response("bad", { status: 400 });
  const day = new Date().toISOString().slice(0, 10);
  const key = `hit:${day}:${vid}`;
  const prev = await env.BEACON_REQUESTS.get(key);
  if (!prev) await env.BEACON_REQUESTS.put(key, JSON.stringify({ src, path, ts: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
export async function onRequestGet() { return new Response("POST only", { status: 405 }); }
