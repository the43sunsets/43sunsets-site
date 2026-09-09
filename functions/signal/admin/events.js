// GET /signal/admin/events?since=YYYY-MM-DD — 点数付け用の出来事(Bearer SIGNAL_SECRET・2026-09-08)。
// registrations = sg:reg:*(登録)/ events = sg:ev:*(login・contact)/ faces = sg:evd:<day>:<email>:<face> の回数。mautic-1 の signal_points.py が毎晩読む。
import { store, bearerOk, adminOk, json } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);   // 9/9: Bearer か管理者セッション(GET のみ)
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const since = String(new URL(request.url).searchParams.get("since") || "").slice(0, 10) || new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const listAll = async (prefix) => { const out = []; let cursor; do { const p = await kv.list({ prefix, cursor, limit: 1000 }); out.push(...p.keys.map(k => k.name)); cursor = p.list_complete ? undefined : p.cursor; } while (cursor); return out; };
  const registrations = [], events = [], faces = [];
  for (const k of await listAll("sg:reg:")) { const ts = k.slice(7, 17); if (ts < since) continue; const v = await kv.get(k, "json"); if (v) registrations.push({ email: v.email, company: v.company, name: v.name, ts: v.ts, roster: !!v.roster, status: v.status, id: v.id }); }
  for (const k of await listAll("sg:ev:")) { const ts = k.slice(6, 16); if (ts < since) continue; const v = await kv.get(k, "json"); if (v) events.push({ key: k, ...v }); }
  for (const k of await listAll("sg:evd:")) { const parts = k.split(":"); const day = parts[2]; if (!day || day < since) continue; const email = parts[3]; const face = parts.slice(4).join(":"); const n = parseInt((await kv.get(k)) || "0", 10); faces.push({ day, email, face, n }); }
  return json({ ok: true, since, registrations, events, faces });
}
