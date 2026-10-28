import { currentSession, store, json } from "../_lib.js";
import { sessionLimited } from "../_rate.js";
import { headers } from "./_q.js";
import { FACE_SPEC } from "./_face_spec.js";

export async function onRequest({ request, env }) {
  let session = null;
  try {
    if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405, { ...headers(null), allow: "POST" });
    session = await currentSession(request, env);
    if (!session) return json({ ok: false, error: "login required" }, 401, headers(session));
    if (await sessionLimited(env, session.sid)) return json({ ok: false, error: "too many requests" }, 429, { ...headers(session), "retry-after": "60" });
    let value;
    try { value = await request.json(); } catch { return json({ ok: false, error: "bad value" }, 400, headers(session)); }
    if (!value || Array.isArray(value) || Object.keys(value).some(k => !["face", "id"].includes(k)) || !Object.hasOwn(FACE_SPEC.faces, value.face) || typeof value.id !== "string" || !value.id.length || value.id.length > 200 || /[\x00-\x1f\x7f]/.test(value.id)) return json({ ok: false, error: "bad value" }, 400, headers(session));
    await store(env).bumpInterest(new Date().toISOString().slice(0, 10), value.face, value.id);
    return json({ ok: true }, 200, headers(session));
  } catch { return json({ ok: false, error: "temporarily unavailable" }, 503, headers(session)); }
}
