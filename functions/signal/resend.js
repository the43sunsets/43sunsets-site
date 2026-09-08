// POST /signal/resend — Cookie が消えた/期限切れの人が、登録済みアドレスを入れて新しいリンクを受け取る(再登録不要)。
// 応答は常に同じ画面へ(アドレスの登録有無を外に漏らさない)。未登録なら登録案内を、承認待ちなら受付済みの旨を本人にだけメールする。
import { store, normEmail, safeNext, issueToken, rateLimited, sendMail, loginMail, pendingMail, origin, redirect, json } from "./_lib.js";

export async function onRequestPost({ request, env }) {
  const kv = store(env);
  if (!kv || !env.SIGNAL_SECRET) return json({ ok: false, error: "login desk not connected" }, 503);
  let form; try { form = await request.formData(); } catch { return json({ ok: false, error: "bad form" }, 400); }
  if ((form.get("website") || "").trim() !== "") return redirect("/signal/login/?state=sent");
  const email = normEmail(form.get("email")); const next = safeNext(form.get("next"));
  if (!email) return redirect("/signal/login/?state=invalid");
  if (await rateLimited(env, email)) return redirect("/signal/login/?state=sent");
  const acct = await kv.get("sg:acct:" + email, "json");
  try {
    if (acct && acct.status === "active") {
      const tok = await issueToken(env, email, next);
      await sendMail(env, email, loginMail(`${origin(env, request)}/signal/login/?t=${tok}`, acct.name));
    } else if (acct && acct.status === "pending") {
      await sendMail(env, email, pendingMail(acct.name));
    } else {
      await sendMail(env, email, { subject: "Signal ログインのご案内", text: ["こんにちは", "", "このメールアドレスは Signal by 43 Sunsets にまだ登録されていません。次の画面から登録してください(会社名・氏名・役職・会社のメールアドレス)。", "", `${origin(env, request)}/signal/join/`, "", "お心当たりのない場合は、このメールを破棄してください。", "", "43 Sunsets / Signal", "hello@43sunsets.com"].join("\n") });
    }
  } catch (e) { return json({ ok: false, error: "mail failed: " + (e && e.message ? e.message : String(e)) }, 502); }
  return redirect("/signal/login/?state=sent");
}
export async function onRequestGet() { return redirect("/signal/login/"); }
