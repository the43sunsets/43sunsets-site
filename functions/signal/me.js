// GET /signal/me — ログイン状態(ページのヘッダーと見本モードの判定に使う)。個人情報は会社名とメールだけ・本人にしか返らない。
import { currentSession, json } from "./_lib.js";
export async function onRequestGet({ request, env }) {
  const s = await currentSession(request, env);
  const configured = !!(env.SIGNAL_SECRET && (env.SIGNAL_AUTH || env.BEACON_REQUESTS));
  return s ? json({ ok: true, loggedIn: true, email: s.email, company: s.company || "", configured }, 200, { vary: "cookie" })
           : json({ ok: true, loggedIn: false, configured }, 200, { vary: "cookie" });
}
