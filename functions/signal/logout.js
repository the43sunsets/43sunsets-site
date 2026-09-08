// POST /signal/logout — Cookie を消し、KV のセッションも消す。
import { currentSession, store, sessionCookie, redirect } from "./_lib.js";
export async function onRequestPost({ request, env }) {
  const s = await currentSession(request, env);
  if (s) { try { await store(env).delete("sg:sess:" + s.sid); } catch {} }
  return redirect("/signal/", { "set-cookie": sessionCookie("", 0) });
}
export async function onRequestGet() { return redirect("/signal/"); }
