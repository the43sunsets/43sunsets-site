// POST /signal/session — マジックリンクの確定(「ログインする」ボタン)。トークンを一回限りで消費し、30 日の Cookie を置く。
// 開いただけでは何も起きない(会社のメールスキャナ対策)。確定後は /signal/login/?done=1&next=… へ(そこで Cookie が置けたかを確かめる)。
import { store, consumeToken, createSession, safeNext, redirect, page, esc, logEvent } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const kv = store(env);
  if (!kv || !env.SIGNAL_SECRET) return page("ログインできません", "<p>ログインの仕組みがまだ接続されていません。hello@43sunsets.com までご連絡ください。</p>", 503);
  let form; try { form = await request.formData(); } catch { return page("不正な要求", "<p>フォームを読めませんでした。</p>", 400); }
  const tok = String(form.get("t") || "");
  const v = await consumeToken(env, tok);
  if (!v) return page("リンクの期限が切れています", `<p>このログイン用リンクは期限切れか、すでに使われています。</p><p><a class="btn" href="/signal/login/">新しいリンクを受け取る</a></p>`, 410);
  const acct = await kv.get("sg:acct:" + v.email, "json");
  if (!acct || acct.status !== "active") return page("ログインできません", `<p>このアドレス(${esc(v.email)})はまだ有効になっていません。</p><p><a class="btn alt" href="/signal/join/">登録画面へ</a></p>`, 403);
  const cookie = await createSession(env, acct);
  await logEvent(env, "login", v.email, { company: acct.company || "" });   // 9/8: 点数付けの出来事
  const next = safeNext(form.get("next") || v.next);
  return redirect("/signal/login/?done=1&next=" + encodeURIComponent(next), { "set-cookie": cookie });
}
export async function onRequestGet() { return redirect("/signal/login/"); }
