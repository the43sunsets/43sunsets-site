// /signal/admin/decide?id=…&sig=… — 名簿外の登録を CEO がワンクリックで承認/却下する画面。
// GET = ボタンのある画面(メールのリンクを開いただけでは何も起きない)/ POST = 確定。
// 署名 = HMAC(SIGNAL_SECRET, "decide:"+id)。KV sg:dec:<id> は 7 日で消える(消えた後は登録一覧から手で承認)。
import { store, checkDecisionSig, issueToken, sendMail, loginMail, origin, page, esc, APPROVED_TOKEN_SECONDS } from "../_lib.js";

async function load(request, env) {
  const kv = store(env); if (!kv || !env.SIGNAL_SECRET) return { err: page("接続なし", "<p>承認の仕組みが接続されていません。</p>", 503) };
  const u = new URL(request.url); const id = String(u.searchParams.get("id") || "").slice(0, 32); const sig = u.searchParams.get("sig");
  if (!/^[a-f0-9]{16}$/.test(id) || !(await checkDecisionSig(env, id, sig))) return { err: page("無効なリンク", "<p>このリンクは無効です。</p>", 403) };
  const dec = await kv.get("sg:dec:" + id, "json");
  if (!dec) return { err: page("期限切れ", "<p>この承認リンクは期限切れ(7 日)か、すでに処理済みです。</p>", 410) };
  const acct = await kv.get("sg:acct:" + dec.email, "json");
  return { kv, id, sig, dec, acct };
}

export async function onRequestGet({ request, env }) {
  const x = await load(request, env); if (x.err) return x.err;
  const a = x.acct || {};
  return page("Signal 登録の承認", `
    <p><strong>${esc(a.company || "-")}</strong> / ${esc(a.name || "-")}(${esc(a.title || "-")})<br><span class="muted">${esc(x.dec.email)} · 関心: ${esc(a.interests || "-")} · 受付 ${esc(x.dec.ts)} · 状態: ${esc(a.status || "-")}</span></p>
    <form method="post" action="/signal/admin/decide?id=${x.id}&sig=${esc(x.sig)}"><button class="btn" name="action" value="approve" type="submit">承認してログインリンクを送る</button><button class="btn alt" name="action" value="reject" type="submit">却下(本人には通知しない)</button></form>
    <p class="muted" style="margin-top:20px">承認すると 72 時間有効のログインリンクが本人に届きます。名簿(Mautic)への転記は別途。</p>`);
}

export async function onRequestPost({ request, env }) {
  const x = await load(request, env); if (x.err) return x.err;
  let form; try { form = await request.formData(); } catch { return page("不正な要求", "<p>フォームを読めませんでした。</p>", 400); }
  const action = form.get("action") === "approve" ? "approve" : "reject";
  const acct = x.acct || { email: x.dec.email, status: "pending" };
  acct.status = action === "approve" ? "active" : "rejected"; acct.decided_at = new Date().toISOString(); acct.source = action === "approve" ? "approved" : acct.source;
  await x.kv.put("sg:acct:" + acct.email, JSON.stringify(acct));
  await x.kv.delete("sg:dec:" + x.id);
  if (action === "approve") {
    try {
      const tok = await issueToken(env, acct.email, x.dec.next, APPROVED_TOKEN_SECONDS);
      await sendMail(env, acct.email, loginMail(`${origin(env, request)}/signal/login/?t=${tok}`, acct.name, APPROVED_TOKEN_SECONDS));
    } catch (e) { return page("承認は記録しましたが送信に失敗", `<p>${esc(e && e.message ? e.message : String(e))}</p><p>本人はログイン画面でアドレスを入力すればリンクを受け取れます。</p>`, 502); }
    return page("承認しました", `<p>${esc(acct.email)} にログインリンクを送りました。</p>`);
  }
  return page("却下しました", `<p>${esc(acct.email)} は却下として記録しました(本人への通知なし)。</p>`);
}
