// POST /signal/admin/allow — 名簿(Mautic 144 社)のドメイン/アドレスを KV に投入する(Bearer SIGNAL_SECRET)。
// body: {"domains":["example.com",…], "emails":["a@example.com",…], "remove":false}
// GET は Bearer 付きで一覧(件数は KV の list = 結果整合・約 60 秒)。名簿の正本は Mautic・ここは写し。
import { store, bearerOk, json, isFreeMail } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  if (!bearerOk(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const domains = [...new Set((b.domains || []).map(d => String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter(d => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))];
  const emails = [...new Set((b.emails || []).map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
  const skipped = domains.filter(d => isFreeMail("x@" + d));   // フリーメールのドメインは名簿扱いにしない(アドレス単位で入れる)
  const ops = [];
  for (const d of domains.filter(d => !skipped.includes(d))) ops.push(b.remove ? kv.delete("sg:allow:dom:" + d) : kv.put("sg:allow:dom:" + d, "1"));
  for (const e of emails) ops.push(b.remove ? kv.delete("sg:allow:eml:" + e) : kv.put("sg:allow:eml:" + e, "1"));
  await Promise.all(ops);
  return json({ ok: true, domains: domains.length - skipped.length, emails: emails.length, skippedFreeMail: skipped, removed: !!b.remove });
}
export async function onRequestGet({ request, env }) {
  if (!bearerOk(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const out = { domains: [], emails: [] }; let cursor;
  do { const p = await kv.list({ prefix: "sg:allow:", cursor, limit: 1000 }); for (const k of p.keys) { const [, , kind, v] = k.name.split(":"); (kind === "dom" ? out.domains : out.emails).push(v); } cursor = p.list_complete ? undefined : p.cursor; } while (cursor);
  return json({ ok: true, ...out, n: out.domains.length + out.emails.length });
}
