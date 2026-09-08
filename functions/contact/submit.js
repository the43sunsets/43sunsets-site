// POST /contact/submit — トップの「まず 30 分、話しませんか」フォーム(2026-09-08 CEO 裁定 甲)。
// 型は /services/submit と同じ: honeypot → Turnstile → KV(BEACON_REQUESTS・30 日で消える控え)→ beacon-notify Worker で hello@ へ通知 → /?contact=sent#contact へ戻す。
// 記録は返信のためだけ(/legal/ のメール条項)。第三者サービスは Turnstile(Cloudflare)以外に無い。
import { verifyTurnstile } from "../_turnstile.js";
import { logEvent } from "../signal/_lib.js";

const MAX = { company: 120, name: 80, email: 200, message: 4000, ref: 300 };

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let form; try { form = await request.formData(); } catch { return text("Malformed form", 400); }
  if ((form.get("fax") || "").trim() !== "") return redirect(url, "/?contact=sent#contact");   // honeypot: 記録せず成功に見せる
  const ts = await verifyTurnstile(env, form, request);
  if (!ts.ok) return redirect(url, "/?contact=bot#contact");
  const company = clean(form.get("company"), MAX.company), name = clean(form.get("name"), MAX.name);
  const email = String(form.get("email") || "").trim().slice(0, MAX.email);
  const message = String(form.get("message") || "").replace(/\r/g, "").trim().slice(0, MAX.message);
  const ref = clean(form.get("ref"), MAX.ref), page = clean(form.get("page"), 120);
  if (!company || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect(url, "/?contact=invalid#contact");
  if (!env.BEACON_REQUESTS && !env.BEACON_NOTIFY) return text("Sorry — the contact desk is not connected yet. Please email hello@43sunsets.com.", 503);
  const id = cryptoId(); const now = new Date().toISOString();
  const record = { id, ts: now, area: "contact", jobRef: "consult-30min", email, lang: "ja",
                   job: `【30 分の相談】\n会社名: ${company}\nお名前: ${name}\n\n${message || "(本文なし)"}\n\n参照元: ${ref || "-"} / ページ: ${page || "/"}`, site: "" };
  if (env.BEACON_REQUESTS) await env.BEACON_REQUESTS.put(`contact:${now}:${id}`, JSON.stringify({ ...record, company, name, message, ref, page }), { expirationTtl: 60 * 60 * 24 * 30 });
  if (env.BEACON_NOTIFY) {
    try { await env.BEACON_NOTIFY.fetch("https://beacon-notify/", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(record) }); } catch (e) { /* KV が控え */ }
  }
  await logEvent(env, "contact", email.toLowerCase(), { company, name });   // 9/8: 点数付けの出来事(Mautic へ)
  return redirect(url, "/?contact=sent#contact");
}
export async function onRequestGet({ request }) { return redirect(new URL(request.url), "/#contact"); }
function clean(s, n) { return String(s ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, n); }
function redirect(url, path) { return new Response(null, { status: 303, headers: { Location: new URL(path, url.origin).toString() } }); }
function text(s, status) { return new Response(s, { status, headers: { "content-type": "text/plain; charset=utf-8" } }); }
function cryptoId() { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, "0")).join(""); }
