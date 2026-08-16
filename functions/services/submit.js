// Cloudflare Pages Function — receives the "Can you do this?" form (POST /services/submit).
// Stores the request in KV (binding: BEACON_REQUESTS). Optionally forwards it by email if an email
// binding REQUEST_MAIL exists (2026-08-16: not available on Pages Free — Email Sending needs Workers Paid;
// so today the record of truth is KV, counted by /services/inbox-count and read in the dashboard).
// Then redirects to /services/request/thanks/.
//
// Setup (Cloudflare dashboard → Pages project → Settings → Functions):
//   KV namespace binding   : BEACON_REQUESTS
//   Email binding          : REQUEST_MAIL  (optional; not offered for Pages Functions as of 2026-08-16)
// Nothing here is secret. No third-party service. Nothing is written until the honeypot and size checks pass.
//
// Privacy: we keep only what the form sends (area, job, url, email, lang, job_ref) + a timestamp.
// Retention: KV entries expire after 30 days (expirationTtl) — matches /legal/; the email copy lives in hello@ per /legal/.

const MAX = { job: 4000, url: 500, email: 200 };
const ALLOWED_AREA = new Set(["marketing", "sales", "research", "other"]);

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  let form;
  try { form = await request.formData(); } catch { return bad("Malformed form"); }

  // Honeypot: the hidden "company" field must stay empty (bots fill everything).
  if ((form.get("company") || "").trim() !== "") return redirect(url, "/services/request/thanks/");

  const area = String(form.get("area") || "other").slice(0, 32);
  const job = String(form.get("job") || "").trim().slice(0, MAX.job);
  const site = String(form.get("url") || "").trim().slice(0, MAX.url);
  const email = String(form.get("email") || "").trim().slice(0, MAX.email);
  const lang = String(form.get("lang") || "en").slice(0, 5);
  const jobRefRaw = String(form.get("job_ref") || "").slice(0, 64);
  const jobRef = /^[a-z0-9-]{0,64}$/.test(jobRefRaw) ? jobRefRaw : "";

  if (!jobRef && job.length < 20) return bad("Please describe the job in a few sentences.");
  if (jobRef === "ai-visibility-audit" && !site) return bad("Please enter your website address.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Please give a valid email address.");
  if (!ALLOWED_AREA.has(area)) return bad("Unknown area.");

  // Fail loudly if nothing can record the request (misconfigured deployment) — never pretend success.
  if (!env.BEACON_REQUESTS && !env.REQUEST_MAIL) {
    return new Response("Sorry — the request desk is not connected yet. Please email hello@43sunsets.com and we will reply the same way.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "retry-after": "3600" } });
  }
  const id = cryptoId();
  const record = { id, ts: new Date().toISOString(), area, job, site, email, lang, jobRef };

  // 1) KV — the record of truth for the weekly instrument (count per area).
  if (env.BEACON_REQUESTS) {
    await env.BEACON_REQUESTS.put(`req:${record.ts}:${id}`, JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 });
  }

  // 2) Email copy to hello@ so the existing daily inbox check sees it (sender = services@43sunsets.com).
  if (env.REQUEST_MAIL) {
    try {
      const { EmailMessage } = await import("cloudflare:email");
      const safeEmail = email.replace(/[\r\n]/g, "");
      const subject = `[Services request] ${area}${jobRef ? " - " + jobRef : ""} - ${safeEmail}`;
      const body = [
        `New request via 43sunsets.com/services/request/ (${record.ts})`, "",
        `Area: ${area}`, `Job ref: ${jobRef || "-"}`, `Reply to: ${email}`, `Site/example: ${site || "-"}`, `Language: ${lang}`, "",
        "Job:", job, "", `id: ${id}`
      ].join("\n");
      const raw = [
        `From: 43 Sunsets Services <services@43sunsets.com>`,
        `To: hello@43sunsets.com`,
        `Reply-To: ${safeEmail}`,
        `Date: ${new Date().toUTCString()}`,
        `MIME-Version: 1.0`,
        `Subject: ${subject}`,
        `Message-ID: <${id}@43sunsets.com>`,
        `Content-Type: text/plain; charset=utf-8`, "", body
      ].join("\r\n");
      await env.REQUEST_MAIL.send(new EmailMessage("services@43sunsets.com", "hello@43sunsets.com", raw));
    } catch (e) {
      // Do not fail the visitor because email failed; the KV record still exists.
    }
  }

  return redirect(url, jobRef ? `/services/request/thanks/?job=${encodeURIComponent(jobRef)}` : "/services/request/thanks/");
}

function redirect(url, path) {
  return new Response(null, { status: 303, headers: { Location: new URL(path, url.origin).toString() } });
}
function bad(msg) {
  return new Response(msg, { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
}
function cryptoId() {
  const b = new Uint8Array(12); crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
}
