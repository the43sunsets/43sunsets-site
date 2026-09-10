// /signal/copy-request — UCC 登記の写し(担保物の逐語)の依頼(2026-09-09 CEO 承認: WI は索引を全行表示・写しは依頼で取得)。
//   POST {"fs_number":"20260902377278-7","state":"WI"} … ログイン必須。ベータ期間は無料・1 アカウント 月 10 件まで。
//     KV: sg:creq:<ts>:<id> = {id, ts, email, company, fs_number, state, status: requested|purchased|done|declined}
//         sg:creqi:<fs>:<email> = ts(重複防止・90 日)/ sg:cr:cnt:<email>:<YYYY-MM> = 件数(40 日)
//     出来事 sg:ev(copy_request)→ Mautic の点数。CEO へ通知メール(週 1 回まとめて UCC-11 で購入 → 取り込み → 行が事実段へ)。
//   GET … ログイン中のアカウントの依頼一覧 {requests: {fs_number: status}, used, cap}。
import { currentSession, store, json, logEvent, sendMail, rid } from "./_lib.js";

export const CAP_PER_MONTH = 10;
const FS_RE = /^[0-9]{14}-[0-9]$/;

async function listAll(kv, prefix) { const out = []; let cursor; do { const p = await kv.list({ prefix, cursor, limit: 1000 }); out.push(...p.keys.map(k => k.name)); cursor = p.list_complete ? undefined : p.cursor; } while (cursor); return out; }

export async function onRequestPost({ request, env }) {
  const s = await currentSession(request, env); if (!s) return json({ ok: false, error: "login required" }, 401, { vary: "cookie" });
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const fs = String(b.fs_number || "").trim(); if (!FS_RE.test(fs)) return json({ ok: false, error: "fs_number" }, 400);
  const state = b.state === "WI" ? "WI" : ""; if (!state) return json({ ok: false, error: "state" }, 400);   // 今は WI のみ(IFS 番号で UCC-11 が出せる州)
  const dupKey = `sg:creqi:${fs}:${s.email}`;
  if (await kv.get(dupKey)) return json({ ok: true, status: "requested", duplicate: true }, 200, { vary: "cookie" });
  const month = new Date().toISOString().slice(0, 7); const ck = `sg:cr:cnt:${s.email}:${month}`;
  const used = parseInt((await kv.get(ck)) || "0", 10);
  if (used >= CAP_PER_MONTH) return json({ ok: false, error: "cap", cap: CAP_PER_MONTH, used }, 429, { vary: "cookie" });
  const ts = new Date().toISOString(); const id = rid(6);
  const rec = { id, ts, email: s.email, company: s.company || "", fs_number: fs, state, status: "requested", debtor: String(b.debtor || "").slice(0, 120) };
  await kv.put(`sg:creq:${ts}:${id}`, JSON.stringify(rec));
  await kv.put(dupKey, ts, { expirationTtl: 90 * 86400 });
  await kv.put(ck, String(used + 1), { expirationTtl: 40 * 86400 });
  await logEvent(env, "copy_request", s.email, { fs_number: fs, state, company: s.company || "" });
  try {
    await sendMail(env, env.ADMIN_EMAIL || "kent.800@gmail.com", { subject: `[Signal 写し依頼] ${state} ${fs} / ${rec.company} <${s.email}>`,
      text: [`UCC 登記の写しの依頼が届きました(${ts})。`, "", `州: ${state}`, `登記番号: ${fs}`, `債務者: ${rec.debtor || "-"}`, `依頼者: ${rec.company} / ${s.email}`, `今月の依頼数: ${used + 1}/${CAP_PER_MONTH}`, "",
             "購入: wims.dfi.wi.gov → Filings → UCC → UCC-11 Information Request → Record Number(1 請求 6 番号まで・$4/件)。一覧は /signal/admin/ の「写しの依頼」。", `id: ${id}`].join("\n") });
  } catch (e) { /* 通知の失敗で依頼を落とさない(KV が正本・管理者ページに出る) */ }
  return json({ ok: true, status: "requested", used: used + 1, cap: CAP_PER_MONTH }, 200, { vary: "cookie" });
}

export async function onRequestGet({ request, env }) {
  const s = await currentSession(request, env); if (!s) return json({ ok: true, loggedIn: false, requests: {}, cap: CAP_PER_MONTH }, 200, { vary: "cookie" });
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const month = new Date().toISOString().slice(0, 7); const used = parseInt((await kv.get(`sg:cr:cnt:${s.email}:${month}`)) || "0", 10);
  const requests = {};
  for (const k of await listAll(kv, "sg:creq:")) { const v = await kv.get(k, "json"); if (v && v.email === s.email) requests[v.fs_number] = v.status; }
  return json({ ok: true, loggedIn: true, requests, used, cap: CAP_PER_MONTH }, 200, { vary: "cookie" });
}
