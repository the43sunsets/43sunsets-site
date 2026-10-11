// POST /signal/logout — Cookie を消し、KV のセッションも消す。
import { currentSession, store, sessionCookie, redirect, safeNext } from "./_lib.js";
export async function onRequestPost({ request, env }) {
  const form = await request.formData().catch(() => null); const next = safeNext(form && form.get("next"));
  const s = await currentSession(request, env);
  if (s) { try { await store(env).deleteSession(s.sid); } catch {} }
  return redirect(next, { "set-cookie": sessionCookie("", 0) });
}
export async function onRequestGet() { return redirect("/signal/"); }
