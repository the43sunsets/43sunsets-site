// Signal by 43 Sunsets — 登録/ログイン(見本モード+招待制マジックリンク)の共有部品。
// 設計の正本 = polaris memory/signal-gating-and-magic-link-design.md(2026-09-07 夜 CEO 確定)。
//
// 置き場(KV・BEACON_REQUESTS を共用・SIGNAL_AUTH が束ねられていればそちらを優先):
//   sg:acct:<email>        登録済みアカウント {email, company, name, title, interests, status: active|pending|rejected, created, decided_at, source}
//   sg:tok:<token>         マジックリンクの一回限りトークン(再送 = 15 分・承認後/名簿即送信 = 72 時間) {email, next, ttl}
//   sg:sess:<sid>          ログイン状態(30 日) {email, company, created}
//   sg:allow:dom:<domain>  名簿(Mautic 144 社)のドメイン → 即リンク
//   sg:allow:eml:<email>   名簿のアドレス → 即リンク
//   sg:reg:<ts>:<id>       登録の履歴(Mautic へ写す・365 日)
//   sg:rl:<email>          再送の間隔制限(60 秒)
//   sg:dec:<id>            承認待ち → 承認/却下のワンクリック用(7 日)
//
// 環境変数(Pages → Settings → Variables and Secrets): SIGNAL_SECRET(必須・HMAC 鍵)・SMTP_USER/SMTP_PASS(hello@ のアプリパスワード)
//   ・MAIL_FROM(既定 hello@43sunsets.com)・ADMIN_EMAIL(既定 kent.800@gmail.com)・SITE_ORIGIN(既定 https://43sunsets.com)
//   ・MAIL_DEV=1 のときは送信せずリンクを応答に返す(ローカル検証専用・本番には置かない)。
// 設定が無いときは「開いている」側に倒さない(鍵なし = 全員未ログイン・登録は 503)。

export const COOKIE = "sg_s";
export const SESSION_DAYS = 30;
export const TOKEN_SECONDS = 15 * 60;
const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "yahoo.co.jp", "hotmail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "mail.com", "gmx.com", "docomo.ne.jp", "ezweb.ne.jp", "softbank.ne.jp"]);

export function store(env) { return env.SIGNAL_AUTH || env.BEACON_REQUESTS || null; }
export function origin(env, request) { return (env.SITE_ORIGIN || (request ? new URL(request.url).origin : "https://43sunsets.com")).replace(/\/$/, ""); }

// ── 乱数・HMAC ──
export function rid(bytes = 16) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, "0")).join(""); }
export async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
function safeEq(a, b) { if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

// ── 入力の正規化 ──
export function normEmail(s) { const e = String(s || "").trim().toLowerCase().slice(0, 200); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ""; }
export function domainOf(email) { return email.split("@")[1] || ""; }
export function isFreeMail(email) { return FREE_MAIL.has(domainOf(email)); }
export function clean(s, n) { return String(s ?? "").replace(/[\r\n\t]/g, " ").trim().slice(0, n); }
export function safeNext(s) { const n = String(s || ""); return /^\/signal\/[a-z0-9\/_\-]*\/?(\?[a-z0-9=&_\-]*)?$/i.test(n) ? n : "/signal/"; }

// ── Cookie ──
export function parseCookies(request) {
  const out = {}; const h = request.headers.get("cookie") || "";
  for (const part of h.split(";")) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export function sessionCookie(value, maxAge) { return `${COOKIE}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }

// ── ログイン状態 ──
// 戻り値: {email, company, sid} または null。鍵か置き場が無ければ常に null(開いている側に倒さない)。
export async function currentSession(request, env) {
  const kv = store(env); const secret = env.SIGNAL_SECRET; if (!kv || !secret) return null;
  const raw = parseCookies(request)[COOKIE]; if (!raw) return null;
  const [sid, sig] = raw.split("."); if (!sid || !sig || !/^[a-f0-9]{32}$/.test(sid)) return null;
  if (!safeEq(sig, await hmac(secret, "sess:" + sid))) return null;
  const s = await kv.get("sg:sess:" + sid, "json"); if (!s || !s.email) return null;
  return { ...s, sid };
}
export async function createSession(env, acct) {
  const kv = store(env); const sid = rid(16);
  await kv.put("sg:sess:" + sid, JSON.stringify({ email: acct.email, company: acct.company || "", created: new Date().toISOString() }), { expirationTtl: SESSION_DAYS * 86400 });
  return sessionCookie(sid + "." + await hmac(env.SIGNAL_SECRET, "sess:" + sid), SESSION_DAYS * 86400);
}

// ── マジックリンク ──
export const APPROVED_TOKEN_SECONDS = 72 * 3600;   // 承認後・登録直後に送るリンクは 72 時間(CEO 9/8 承認)。本人が画面の前で再送するリンクは 15 分のまま
export async function issueToken(env, email, next, ttl = TOKEN_SECONDS) {
  const kv = store(env); const tok = rid(24);
  await kv.put("sg:tok:" + tok, JSON.stringify({ email, next: safeNext(next), created: new Date().toISOString(), ttl }), { expirationTtl: ttl });
  return tok;
}
export function ttlLabel(ttl) { return ttl >= 3600 ? Math.round(ttl / 3600) + " 時間" : Math.round(ttl / 60) + " 分"; }
export async function consumeToken(env, tok) {
  const kv = store(env); if (!/^[a-f0-9]{48}$/.test(tok || "")) return null;
  const v = await kv.get("sg:tok:" + tok, "json"); if (!v) return null;
  await kv.delete("sg:tok:" + tok);   // 一回限り
  return v;
}
export async function rateLimited(env, email) {
  const kv = store(env); const k = "sg:rl:" + email; if (await kv.get(k)) return true;
  await kv.put(k, "1", { expirationTtl: 60 }); return false;
}
export async function isRosterAddress(env, email) {
  const kv = store(env);
  if (await kv.get("sg:allow:eml:" + email)) return true;
  if (!isFreeMail(email) && await kv.get("sg:allow:dom:" + domainOf(email))) return true;
  return false;
}
export async function decisionSig(env, id) { return hmac(env.SIGNAL_SECRET, "decide:" + id); }
export async function checkDecisionSig(env, id, sig) { return safeEq(String(sig || ""), await decisionSig(env, id)); }
export function bearerOk(request, env) { const a = request.headers.get("authorization") || ""; return !!env.SIGNAL_SECRET && safeEq(a, "Bearer " + env.SIGNAL_SECRET); }

// ── メール本文 ──
const SIGN = ["43 Sunsets / Signal", "hello@43sunsets.com", "https://43sunsets.com/signal/"].join("\n");
export function loginMail(link, name, ttl = TOKEN_SECONDS) {
  const lim = ttlLabel(ttl);
  return {
    subject: `Signal ログインのご案内(${lim}有効)`,
    text: [`${name ? name + " 様" : "こんにちは"}`, "", "Signal by 43 Sunsets のログイン用リンクをお送りします。下のリンクを開き、「ログインする」ボタンを押してください。", "", link, "",
      `・このリンクは ${lim}・1 回だけ有効です。`, "・期限が切れた場合は、ログイン画面でメールアドレスを入力すると新しいリンクが届きます。", "・お心当たりのない場合は、このメールを破棄してください。", "", SIGN].join("\n") };
}
export function pendingMail(name) {
  return { subject: "Signal 登録を受け付けました(ご案内まで少しお待ちください)",
    text: [`${name ? name + " 様" : "こんにちは"}`, "", "Signal by 43 Sunsets への登録を受け付けました。ベータ版は米国の日系製造業の方に限定して無料でご提供しているため、内容を確認のうえ、ログイン用のリンクを別のメールでお送りします(通常 1 営業日以内)。", "", SIGN].join("\n") };
}
export function adminMail(reg, decideUrl) {
  return { subject: `[Signal 登録] ${reg.company} / ${reg.name} <${reg.email}>${reg.roster ? "(名簿・自動承認)" : "(名簿外・承認待ち)"}`,
    text: [`Signal の登録が届きました(${reg.ts})。`, "", `会社: ${reg.company}`, `氏名: ${reg.name}`, `役職: ${reg.title || "-"}`, `メール: ${reg.email}`, `関心: ${reg.interests || "-"}`, `判定: ${reg.roster ? "名簿のアドレス/ドメイン → ログインリンクを自動送信済み" : "名簿外 → 承認待ち"}`, "",
      reg.roster ? "" : `承認/却下(ボタンのある画面が開きます・7 日有効):\n${decideUrl}`, "", `id: ${reg.id}`].join("\n") };
}

// ── 送信: Gmail(Workspace)の SMTP へ TLS 直結(cloudflare:sockets)。人数課金の部品を使わない ──
// 失敗は例外で返す(呼び手が 502 にする・成功を装わない)。MAIL_DEV=1 なら送らずリンクを返す。
export async function sendMail(env, to, { subject, text }) {
  if (env.MAIL_DEV === "1") { console.log("[MAIL_DEV] to=" + to + " subject=" + subject + "\n" + text); return { dev: true }; }
  const user = env.SMTP_USER, pass = env.SMTP_PASS; if (!user || !pass) throw new Error("mail not configured");
  const from = env.MAIL_FROM || "hello@43sunsets.com"; const host = env.SMTP_HOST || "smtp.gmail.com"; const port = Number(env.SMTP_PORT || 465);
  const { connect } = await import("cloudflare:sockets");
  const sock = connect({ hostname: host, port }, { secureTransport: "on", allowHalfOpen: false });
  const w = sock.writable.getWriter(); const r = sock.readable.getReader(); const dec = new TextDecoder(); const enc = new TextEncoder();
  let buf = "";
  async function reply() {   // 複数行応答(250-xxx)の最終行(250 xxx)まで読む
    for (;;) {
      const lines = buf.split("\r\n"); buf = lines.pop();
      const last = lines.filter(l => /^\d{3} /.test(l)).pop();
      if (last) { const rest = lines.slice(lines.indexOf(last) + 1); buf = (rest.length ? rest.join("\r\n") + "\r\n" : "") + buf; return last; }
      const { value, done } = await r.read(); if (done) throw new Error("smtp closed"); buf += dec.decode(value, { stream: true });
    }
  }
  async function cmd(line, okCodes) { await w.write(enc.encode(line + "\r\n")); const res = await reply(); if (!okCodes.some(c => res.startsWith(String(c)))) throw new Error("smtp " + (line.startsWith("AUTH") ? "AUTH" : line.split(" ")[0]) + ": " + res); return res; }
  try {
    await reply();   // 220
    await cmd("EHLO 43sunsets.com", [250]);
    await cmd("AUTH PLAIN " + btoa("\0" + user + "\0" + pass), [235]);
    await cmd(`MAIL FROM:<${from}>`, [250]);
    await cmd(`RCPT TO:<${to}>`, [250, 251]);
    await cmd("DATA", [354]);
    const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const body = b64(text).replace(/(.{76})/g, "$1\r\n");
    const msg = [`From: Signal by 43 Sunsets <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${rid(12)}@43sunsets.com>`,
      "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "Auto-Submitted: auto-generated", "", body].join("\r\n");
    await cmd(msg.replace(/\r\n\./g, "\r\n..") + "\r\n.", [250]);
    await w.write(enc.encode("QUIT\r\n"));
  } finally { try { await sock.close(); } catch {} }
  return { sent: true };
}

// ── 応答の型 ──
export function json(obj, status = 200, headers = {}) { return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }); }
export function redirect(to, headers = {}) { return new Response(null, { status: 303, headers: { location: to, "cache-control": "no-store", ...headers } }); }
export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
// 小さな HTML 応答(承認画面・エラー)— サイトの意匠に合わせた最小の一枚
export function page(title, bodyHtml, status = 200) {
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} | Signal by 43 Sunsets</title>
<link rel="stylesheet" href="/signal/assets/cockpit.css?v=20260908a"><style>html{color-scheme:light}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Zen Kaku Gothic New",-apple-system,"Hiragino Kaku Gothic ProN",Meiryo,sans-serif}.wrap{max-width:560px;margin:60px auto;padding:0 24px}h1{font-family:"Shippori Mincho",serif;font-size:22px;margin:0 0 16px}p{line-height:1.8}.btn{display:inline-block;background:var(--ink);color:#fff;border:0;border-radius:6px;padding:10px 20px;font-size:15px;cursor:pointer;font-family:inherit}.btn.alt{background:transparent;color:var(--ink);border:1px solid var(--line)}.muted{color:var(--sub);font-size:13px}form{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}</style></head>
<body><div class="wrap"><div class="muted" style="letter-spacing:.18em;font-family:'IBM Plex Mono',monospace;font-size:11px">SIGNAL by 43 SUNSETS</div><h1>${esc(title)}</h1>${bodyHtml}</div></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
