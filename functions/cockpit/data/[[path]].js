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
  if (await currentSession(request, env)) { const r = await next(); return withHeaders(r, "full"); }
  const r = await next(); if (!r.ok) return r;
  let d; try { d = await r.json(); } catch { return json({ ok: false, error: "bad data" }, 502); }
  const cutoff = new Date(Date.now() - SAMPLE_MIN_AGE_DAYS * 864e5).toISOString().slice(0, 10);
  const out = isCompany ? demoCompany(d) : (path === "news.json" ? demoNews(d) : (path === "macro.json" ? demoMacro(d) : demoFace(path, d, cutoff)));
  return json(out, 200, { "x-signal-mode": "demo", "vary": "cookie" });
}

function withHeaders(r, mode) { const h = new Headers(r.headers); h.set("x-signal-mode", mode); h.set("cache-control", "no-store"); h.set("vary", "cookie"); return new Response(r.body, { status: r.status, headers: h }); }

function demoFace(path, d, cutoff) {
  const meta = { ...(d.meta || {}) };
  const all = d.signals || [];
  let pick;
  if (path === "hiring.json") {
    // 採用は日付を持たない(観測値)→ 製造職の多い順に 2 枚。数字は伏せずに古い観測を装わない。
    pick = [...all].sort((a, b) => (b.open_mfg || 0) - (a.open_mfg || 0)).slice(0, 2);
  } else {
    const old = all.filter(s => (s.date || "") && s.date <= cutoff);
    const pool = path === "ucc.json" ? old.filter(s => (s.equipment || []).length).concat(old.filter(s => !(s.equipment || []).length)) : old.filter(s => s.recipient && !s.masked).concat(old.filter(s => !(s.recipient && !s.masked)));
    pick = pool.slice(0, SAMPLE_N);
  }
  meta.demo = { note: `全 ${all.length} 件のうち ${pick.length} 件(${path === "hiring.json" ? "観測値" : cutoff + " 以前の実例"})を表示。登録すると全件・当日分・絞り込み・企業カルテが使えます。`, total: all.length, cutoff, sample: pick.length };
  if (path === "subsidies.json") meta.n_major = all.filter(x => !(MINOR_SUBSIDY.has(x.category) && x.issuer_level === "連邦")).length;
  const out = { demo: true, meta, signals: pick };
  if (d.companies) { const ids = new Set(pick.map(s => s.company_id).filter(Boolean)); out.companies = d.companies.filter(c => ids.has(c.id)); }
  return out;
}

// 景気の状況(9/8): 指標 10 と ① 指標の読みは公開(FRED の公開データの予告編)。② ③ のニュースの読みは施錠、ニュースは米 3 本・州 各 2 本の見本
// 9/8 CEO「10 の指標もぼやかして」: タイルは名前と出典だけ残し、値・推移・前期比を伏せる。① の読みも施錠
function demoMacro(m) {
  const tiles = (m.tiles || []).map(t => ({ id: t.id, name: t.name, group: t.group, unit: t.unit, source: t.source, frequency: t.frequency, locked: true }));
  return { ...m, demo: true, tiles, ai_read: m.ai_read ? { locked: true, generated_at: m.ai_read.generated_at } : null,
           ai_news: m.ai_news ? { locked: true, generated_at: m.ai_news.generated_at, news_updated_ct: m.ai_news.news_updated_ct } : null };
}
function demoNews(n) {
  const states = {}; for (const [k, v] of Object.entries(n.states || {})) states[k] = (v || []).slice(0, 2);
  const total = (n.us || []).length + Object.values(n.states || {}).reduce((a, v) => a + (v || []).length, 0);
  return { ...n, demo: true, us: (n.us || []).slice(0, 3), states, meta_demo: { total, sample: 3 + Object.values(states).reduce((a, v) => a + v.length, 0), note: `見本モード: 直近のニュース ${total} 本のうち一部を表示。登録すると全件と AI の読み(② ③)、会社名からの企業カルテが使えます。` } };
}
function demoCompany(c) {
  const f = c.faces || {};
  const lock = face => face ? { count: face.count || 0, locked: true } : { count: 0, locked: true };
  return { ...c, demo: true,
    faces: { permits: f.permits || { count: 0, items: [] }, ucc: lock(f.ucc), hiring: lock(f.hiring), grants: lock(f.grants), news: lock(f.news) },
    timeline: (c.timeline || []).filter(t => t.face === "permits") };
}
