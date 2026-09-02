// Cloudflare Pages Function — receives the "Can you do this?" form (POST /services/submit).
// Stores the request in KV (binding: BEACON_REQUESTS) and forwards a copy by email through the
// beacon-notify Worker (Service binding BEACON_NOTIFY; 2026-09-02 — Pages Functions have no send_email
// binding, but a Worker can send to the account's verified destination address for free).
// KV stays the record of truth, counted by /services/inbox-count.
// Then redirects to /services/request/thanks/.
//
// Setup (Cloudflare dashboard → Pages project → Settings → Functions):
//   KV namespace binding   : BEACON_REQUESTS
//   Service binding        : BEACON_NOTIFY -> Worker "beacon-notify" (products/wip/beacon-notify in polaris)
// Nothing here is secret. No third-party service. Nothing is written until the honeypot and size checks pass.
//
// Privacy: we keep only what the form sends (area, job, url, email, lang, job_ref) + a timestamp.
// Retention: KV entries expire after 30 days (expirationTtl) — matches /legal/; the email copy lives in hello@ per /legal/.

const MAX = { job: 4000, url: 500, email: 200 };
const ALLOWED_AREA = new Set(["operations", "marketing", "sales", "research", "other"]);

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let form;
  try { form = await request.formData(); } catch { return bad("Malformed form"); }

  // Honeypot: the hidden "company" field must stay empty (bots fill everything).
  if ((form.get("company") || "").trim() !== "") return redirect(url, "/services/request/thanks/");

  const area = String(form.get("area") || "other").slice(0, 32);
  const job = String(form.get("job") || "").trim().slice(0, MAX.job);
  const siteRaw = String(form.get("url") || "").trim().slice(0, MAX.url);
  const email = String(form.get("email") || "").trim().slice(0, MAX.email);
  const lang = String(form.get("lang") || "en").slice(0, 5) === "ja" ? "ja" : "en";
  const jobRefRaw = String(form.get("job_ref") || "").slice(0, 64);
  const jobRef = /^[a-z0-9-]{0,64}$/.test(jobRefRaw) ? jobRefRaw : "";

  if (!jobRef && job.length < 20) return bad(lang, "job");
  // Website address: required and must be a real http(s) host for the audit (normalised, e.g. "example.com" → "https://example.com/");
  // optional free text on the general form ("a website or example").
  const normalized = normalizeSite(siteRaw);
  if (jobRef === "ai-visibility-audit" && !normalized) return bad(lang, "url");
  const site = normalized || siteRaw;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(lang, "email");
  if (!ALLOWED_AREA.has(area)) return bad(lang, "area");

  // Fail loudly if nothing can record the request (misconfigured deployment) — never pretend success.
  if (!env.BEACON_REQUESTS && !env.BEACON_NOTIFY) {
    return new Response("Sorry — the request desk is not connected yet. Please email hello@43sunsets.com and we will reply the same way.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "3600" } });
  }
  const id = cryptoId();
  const record = { id, ts: new Date().toISOString(), area, job, site, email, lang, jobRef };

  // 1) KV — the record of truth for the weekly instrument (count per area).
  if (env.BEACON_REQUESTS) {
    await env.BEACON_REQUESTS.put(`req:${record.ts}:${id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 });
  }

  // 2) Email copy via the beacon-notify Worker (Service binding BEACON_NOTIFY, 2026-09-02).
  //    The Worker sends to the verified destination address (free on all plans); Reply-To = visitor.
  //    Never fail the visitor because email failed; the KV record still exists.
  if (env.BEACON_NOTIFY) {
    try {
      await env.BEACON_NOTIFY.fetch("https://beacon-notify/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(record),
      });
    } catch (e) {
      // KV is the record of truth; /services/inbox-count still counts it.
    }
  }

  return redirect(url, jobRef ? `/services/request/thanks/?job=${encodeURIComponent(jobRef)}` : "/services/request/thanks/");
}

function redirect(url, path) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, url.origin).toString() } });
}
// Accepts "example.com", "www.example.com/page", "https://example.com"; rejects anything without a dotted hostname
// or with a non-http(s) scheme. Returns the normalised URL string, or "" if unusable.
function normalizeSite(raw) {
  if (!raw) return "";
  let s = raw.replace(/\s+/g, "");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try { u = new URL(s); } catch { return ""; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "";
  if (u.username || u.password) return "";
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host === "localhost") return "";
  return u.toString();
}

const MSG = {
  en: {
    title: "Something is missing",
    job: "Please describe the job in a few sentences (at least 20 characters).",
    url: "Please enter your website address, e.g. example.com.",
    email: "Please give a valid email address so we can reply.",
    area: "Please choose one of the listed areas.",
    back: "← Go back and fix it",
    mail: "If the form keeps failing, email hello@43sunsets.com instead."
  },
  ja: {
    title: "入力内容をご確認ください",
    job: "仕事の内容を数文で(20文字以上)ご記入ください。",
    url: "サイトのアドレスをご記入ください(例: example.com)。",
    email: "返信先のメールアドレスの形式をご確認ください。",
    area: "一覧にある分野からお選びください。",
    back: "← 戻って修正する",
    mail: "うまく送れない場合は hello@43sunsets.com へ直接メールをお送りください。"
  }
};
function bad(lang, key) {
  const m = MSG[lang] || MSG.en;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${m.title} — 43 Sunsets</title>
<style>html{background:#fbfaf7;color:#1c1c24;color-scheme:light}body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:36rem;margin:12vh auto;padding:0 1.25rem;line-height:1.6}h1{font-size:1.35rem}a{color:#0b5fff}p.small{color:#555;font-size:.9rem}</style></head>
<body><h1>${m.title}</h1><p>${m[key] || m.job}</p><p><a href="javascript:history.back()">${m.back}</a></p><p class="small">${m.mail}</p></body></html>`;
  return new Response(html, { status: 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
function cryptoId() {
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}
