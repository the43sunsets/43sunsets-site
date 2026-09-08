// GET /signal/admin/registrations — 登録アカウントの一覧(Bearer SIGNAL_SECRET)。Mautic への転記・承認待ちの棚卸しに使う。
// POST {"email":"…","status":"active|rejected"} で手動の承認/却下(承認リンクが 7 日で消えた後の救済)。承認時はリンクを送る。
import { store, bearerOk, json, normEmail, issueToken, sendMail, loginMail, origin } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!bearerOk(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const accounts = []; let cursor;
  do { const p = await kv.list({ prefix: "sg:acct:", cursor, limit: 1000 }); for (const k of p.keys) { const v = await kv.get(k.name, "json"); if (v) accounts.push(v); } cursor = p.list_complete ? undefined : p.cursor; } while (cursor);
  accounts.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  const by = {}; for (const a of accounts) by[a.status] = (by[a.status] || 0) + 1;
  return json({ ok: true, n: accounts.length, byStatus: by, accounts });
}
export async function onRequestPost({ request, env }) {
  if (!bearerOk(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const email = normEmail(b.email); const status = b.status === "active" ? "active" : (b.status === "rejected" ? "rejected" : "");
  if (!email || !status) return json({ ok: false, error: "email/status" }, 400);
  const acct = await kv.get("sg:acct:" + email, "json"); if (!acct) return json({ ok: false, error: "not found" }, 404);
  acct.status = status; acct.decided_at = new Date().toISOString(); if (status === "active") acct.source = "approved";
  await kv.put("sg:acct:" + email, JSON.stringify(acct));
  let mail = null;
  if (status === "active" && b.send !== false) { const tok = await issueToken(env, email, "/signal/"); mail = await sendMail(env, email, loginMail(`${origin(env, request)}/signal/login/?t=${tok}`, acct.name)); }
  return json({ ok: true, account: acct, mail });
}
