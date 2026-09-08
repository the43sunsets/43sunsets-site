// Turnstile の検証(2026-09-08)。TURNSTILE_SECRET が未設定なら検証を省略して通す(鍵を入れた瞬間から効く = 段階導入)。
export async function verifyTurnstile(env, form, request) {
  const secret = env.TURNSTILE_SECRET; if (!secret) return { ok: true, skipped: true };
  const token = String(form.get("cf-turnstile-response") || "").slice(0, 4096);
  if (!token) return { ok: false, reason: "missing" };
  const body = new URLSearchParams({ secret, response: token });
  const ip = request.headers.get("cf-connecting-ip") || ""; if (ip) body.set("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const d = await r.json();
    return d && d.success ? { ok: true } : { ok: false, reason: ((d && d["error-codes"]) || []).join(",") || "failed" };
  } catch (e) { return { ok: false, reason: "verify_error" }; }
}
