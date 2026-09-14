// GET /signal/admin/events?since=YYYY-MM-DD — 点数付け用の出来事(Bearer SIGNAL_SECRET・2026-09-08)。
import { store, adminOk, json } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);   // 9/9: Bearer か管理者セッション(GET のみ)
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const since = String(new URL(request.url).searchParams.get("since") || "").slice(0, 10) || new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const registrations = (await kv.listRegistrations(since)).map(v => ({ email: v.email, company: v.company, name: v.name, ts: v.ts, roster: !!v.roster, status: v.status, id: v.id }));
  const events = await kv.listEvents(since);
  const faces = await kv.listFaceDays(since);
  return json({ ok: true, since, registrations, events, faces });
}
