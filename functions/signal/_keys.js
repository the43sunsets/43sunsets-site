import { authStore } from "./_store.js";

export function cookieKeys(env) {
  if (!env.SIGNAL_COOKIE_KEYS) return env.SIGNAL_SECRET ? [{ id: "v0", secret: env.SIGNAL_SECRET }] : [];
  const keys = [];
  for (const entry of env.SIGNAL_COOKIE_KEYS.split(";")) {
    const colon = entry.indexOf(":");
    const id = entry.slice(0, colon).trim(), secret = entry.slice(colon + 1);
    if (colon < 1 || !/^[a-zA-Z0-9_-]+$/.test(id) || !secret || keys.some(k => k.id === id)) return [];
    keys.push({ id, secret });
  }
  return keys;
}
export function adminKey(env) { return env.SIGNAL_ADMIN_KEY || env.SIGNAL_SECRET; }
export function ingestKey(env) { return env.SIGNAL_INGEST_KEY || env.SIGNAL_SECRET; }
export function configured(env) { return cookieKeys(env).length > 0 && !!authStore(env); }
export function safeEq(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
export async function signCookie(env, sid) {
  const key = cookieKeys(env)[0];
  if (!key) throw new Error("cookie key not configured");
  return `${sid}.${key.id}.${await hmac(key.secret, "sess:" + sid)}`;
}
export async function verifyCookie(env, raw) {
  if (typeof raw !== "string") return null;
  const parts = raw.split("."), sid = parts[0];
  if (!/^[a-f0-9]{32}$/.test(sid)) return null;
  let secret, sig;
  if (parts.length === 2) { secret = env.SIGNAL_SECRET; sig = parts[1]; }
  else if (parts.length === 3) { secret = cookieKeys(env).find(k => k.id === parts[1])?.secret; sig = parts[2]; }
  else return null;
  return secret && safeEq(sig, await hmac(secret, "sess:" + sid)) ? sid : null;
}
export function bearerIs(request, secret) { return !!secret && safeEq(request.headers.get("authorization") || "", "Bearer " + secret); }
