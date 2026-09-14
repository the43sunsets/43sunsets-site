// GET /signal/admin/sessions?email=… — 登録者のログイン(セッション)と日ごとのデータ取得回数(Bearer SIGNAL_SECRET・2026-09-08 CEO「Midori が何をしたかをトラック」)。
import { store, adminOk, json, normEmail } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);   // 9/9: Bearer か管理者セッション(GET のみ)
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const email = normEmail(new URL(request.url).searchParams.get("email"));
  const sessions = (await kv.listSessions()).filter(v => !email || v.email === email);
  const sids = new Set(sessions.map(s => s.sid));
  const loads = (await kv.listDl()).filter(v => sids.has(v.sid));
  sessions.sort((a, b) => (a.created || "").localeCompare(b.created || ""));
  return json({ ok: true, email: email || null, sessions, loads });
}
