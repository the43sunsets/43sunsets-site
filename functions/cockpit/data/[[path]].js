// /cockpit/data/* のゲート(2026-09-07 夜 CEO 裁定「ぼかしは見た目だけにしない」)。
// 静的 JSON(bot = VPS → Actions が毎日書く)の前に立ち、ログイン Cookie のない読者には
//   UCC・補助金・採用 = 見本(古い実例 数枚+件数)/企業カルテ = 建設許可の節だけ
// を返す。建設許可・鮮度・景気・health・top・sources はそのまま通す(ログイン前フルアクセスの面)。
// ログイン済みは静的ファイルをそのまま返す(next() = Pages の静的配信)。
import { currentSession, json } from "../../signal/_lib.js";

const GATED = new Set(["ucc.json", "subsidies.json", "hiring.json", "news.json", "macro.json"]);   // 9/8 CEO: 景気の状況(ニュース 2 軸と AI の読み ②③)も見本モード
const SAMPLE_N = 4;                    // 見本の枚数
const SAMPLE_MIN_AGE_DAYS = 45;        // 見本は 45 日以上前の実例だけ(鮮度は登録の対価)
const MINOR_SUBSIDY = new Set(["訓練・インフラ・その他", "未分類"]);   // signal/index.html と同じ主要件数の規則

export async function onRequestGet(context) {
  const { request, env, next } = context;
  const path = (context.params.path || []).join("/");
  const isCompany = /^companies\/C-\d+\.json$/.test(path);
  if (!GATED.has(path) && !isCompany) return next();
  const sess = await currentSession(request, env);
  if (sess) {
    // 9/8 CEO 甲: ログイン済みでも 1 セッション 1 分 60 回まで(全件を機械で吸う動きを止める)+日次の取得回数を控える(管理者が流出元を追える)
    if (await sessionLimited(env, sess.sid)) return json({ ok: false, error: "too many requests — 1 分ほど待ってから再読み込みしてください" }, 429, { "retry-after": "60" });
    const r = await next(); return withHeaders(r, "full", sess.sid);
  }
  const r = await next(); if (!r.ok) return r;
  let d; try { d = await r.json(); } catch { return json({ ok: false, error: "bad data" }, 502); }
  const cutoff = new Date(Date.now() - SAMPLE_MIN_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  const out = isCompany ? demoCompany(d) : (path === "news.json" ? demoNews(d) : (path === "macro.json" ? demoMacro(d) : demoFace(path, d, cutoff)));
  return json(out, 200, { "x-signal-mode": "demo", "vary": "cookie" });
}

function withHeaders(r, mode, sid) { const h = new Headers(r.headers); h.set("x-signal-mode", mode); h.set("cache-control", "no-store"); h.set("vary", "cookie"); if (sid) h.set("x-signal-mark", sid.slice(0, 8)); return new Response(r.body, { status: r.status, headers: h }); }
const SESSION_PER_MINUTE = 60;
// 9/8 実測: KV は結果整合(数十秒遅れ)で 70 連打が全部 200 だった → 分あたりの数え上げは同一拠点内で即時反映される Cache API に替える。
// 拠点をまたぐ分散取得までは止められない = 本命の歯止めは Cloudflare のレート制限ルール(CEO 操作)。KV は日次の取得回数の控え(管理者向け)だけに使う。
async function sessionLimited(env, sid) {
  const minute = Math.floor(Date.now() / 60000);
  let n = 1;
  try {
    const cache = caches.default; const key = new Request(`https://signal-rl.invalid/rlq/${sid}/${minute}`);
    const hit = await cache.match(key); if (hit) n = (parseInt(await hit.text(), 10) || 0) + 1;
    await cache.put(key, new Response(String(n), { headers: { "cache-control": "max-age=120", "content-type": "text/plain" } }));
  } catch (e) { n = 1; }
  try {
    const kv = env.SIGNAL_AUTH || env.BEACON_REQUESTS;
    if (kv && (n === 1 || n % 10 === 0)) { const day = new Date().toISOString().slice(0, 10); const dk = `sg:dl:${day}:${sid}`; const dn = parseInt((await kv.get(dk)) || "0", 10); await kv.put(dk, String(Math.max(dn, 0) + (n === 1 ? 1 : 10)), { expirationTtl: 30 * 86400 }); }
  } catch (e) { /* 控えは best effort */ }
  return n > SESSION_PER_MINUTE;
}
