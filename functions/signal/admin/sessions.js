// GET /signal/admin/sessions?email=… — 登録者のログイン(セッション)と日ごとのデータ取得回数(Bearer SIGNAL_SECRET・2026-09-08 CEO「Midori が何をしたかをトラック」)。
// sg:sess:<sid> = {email, company, created}(30 日)/ sg:dl:<day>:<sid> = その日のデータ取得回数(取り込み鍵が数える・30 日)。
import { store, bearerOk, adminOk, json, normEmail } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);   // 9/9: Bearer か管理者セッション(GET のみ)
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const email = normEmail(new URL(request.url).searchParams.get("email"));
  const listAll = async (prefix) => { const out = []; let cursor; do { const p = await kv.list({ prefix, cursor, limit: 1000 }); out.push(...p.keys.map(k => k.name)); cursor = p.list_complete ? undefined : p.cursor; } while (cursor); return out; };
  const sessions = [];
  for (const k of await listAll("sg:sess:")) { const v = await kv.get(k, "json"); if (v && (!email || v.email === email)) sessions.push({ sid: k.slice(8), email: v.email, company: v.company, created: v.created }); }
  const sids = new Set(sessions.map(s => s.sid));
  const loads = [];
  for (const k of await listAll("sg:dl:")) { const parts = k.split(":"); const day = parts[2], sid = parts[3]; if (!sids.has(sid)) continue; loads.push({ day, sid, n: parseInt((await kv.get(k)) || "0", 10) }); }
  sessions.sort((a, b) => (a.created || "").localeCompare(b.created || ""));
  return json({ ok: true, email: email || null, sessions, loads });
}
