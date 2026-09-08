// POST /signal/register — 登録画面(/signal/join/)のフォーム。
// 名簿のアドレス/ドメイン → アカウント active+ログインリンクを即送信 → /signal/join/?state=sent
// 名簿外 → pending+受付メール → CEO へ承認/却下リンク → /signal/join/?state=pending
// 登録済み(active)→ リンクを再送(再登録不要)。rejected → pending と同じ見え方(理由は開示しない)。
import { store, normEmail, clean, safeNext, isRosterAddress, issueToken, rateLimited, sendMail, loginMail, pendingMail, adminMail, decisionSig, origin, rid, redirect, json, APPROVED_TOKEN_SECONDS } from "./_lib.js";
import { verifyTurnstile } from "../_turnstile.js";

export async function onRequestPost({ request, env }) {
  const kv = store(env);
  if (!kv || !env.SIGNAL_SECRET) return json({ ok: false, error: "registration desk not connected" }, 503);
  let form; try { form = await request.formData(); } catch { return json({ ok: false, error: "bad form" }, 400); }
  if ((form.get("website") || "").trim() !== "") return redirect("/signal/join/?state=sent");   // honeypot: 記録せず成功に見せる
  if (!(await verifyTurnstile(env, form, request)).ok) return redirect("/signal/join/?state=invalid");   // Turnstile(9/8): 失敗は入力エラーと同じ画面
  const email = normEmail(form.get("email"));
  const company = clean(form.get("company"), 120), name = clean(form.get("name"), 80), title = clean(form.get("title"), 80);
  const interests = [...form.getAll("interest")].map(x => clean(x, 24)).filter(Boolean).slice(0, 8).join("・");
  const next = safeNext(form.get("next"));
  if (!email || !company || !name) return redirect("/signal/join/?state=invalid" + (next !== "/signal/" ? "&next=" + encodeURIComponent(next) : ""));
  if (await rateLimited(env, email)) return redirect("/signal/join/?state=sent");

  const base = origin(env, request);
  const existing = await kv.get("sg:acct:" + email, "json");
  const ts = new Date().toISOString(); const id = rid(8);
  const roster = await isRosterAddress(env, email);
  const status = existing ? existing.status : (roster ? "active" : "pending");
  const acct = { email, company, name, title, interests, status, created: existing ? existing.created : ts, updated: ts, source: existing ? existing.source : (roster ? "roster" : "self"), id: existing ? existing.id : id };
  await kv.put("sg:acct:" + email, JSON.stringify(acct));
  await kv.put(`sg:reg:${ts}:${id}`, JSON.stringify({ ...acct, id, ts, roster, next }), { expirationTtl: 365 * 86400 });

  try {
    if (acct.status === "active") {
      const tok = await issueToken(env, email, next, APPROVED_TOKEN_SECONDS);
      await sendMail(env, email, loginMail(`${base}/signal/login/?t=${tok}`, name, APPROVED_TOKEN_SECONDS));
    } else if (acct.status === "pending") {
      await kv.put("sg:dec:" + id, JSON.stringify({ email, next, ts }), { expirationTtl: 7 * 86400 });
      await sendMail(env, email, pendingMail(name));
    }
    // CEO への通知(名簿 = 記録のみ・名簿外 = 承認画面のリンク)
    const decideUrl = `${base}/signal/admin/decide?id=${id}&sig=${await decisionSig(env, id)}`;
    await sendMail(env, env.ADMIN_EMAIL || "kent.800@gmail.com", adminMail({ ...acct, id, ts, roster: acct.status === "active" }, decideUrl));
  } catch (e) {
    return json({ ok: false, error: "mail failed: " + (e && e.message ? e.message : String(e)) }, 502);
  }
  return redirect("/signal/join/?state=" + (acct.status === "active" ? "sent" : "pending"));
}
export async function onRequestGet() { return redirect("/signal/join/"); }
