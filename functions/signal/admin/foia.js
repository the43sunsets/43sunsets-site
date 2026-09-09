// /signal/admin/foia — FOIA 管理台帳(2026-09-09・設計 = polaris plan/designs/2026-09-08-foia-ledger-design.md 段取り 3)。
//   POST(Bearer SIGNAL_SECRET・VPS の foia/export_foia.py --push が毎晩)= 台帳の全列を KV `sg:admin:foia` に置く(公開ファイルには置かない)。
//   GET(Bearer か、管理者(ADMIN_EMAILS)としてログイン中のセッション)= KV の台帳を返す。無ければ {ledger:null}(画面は公開版 foia-status.json に落ちる)。
// 個人名は台帳に含めない(CEO 9/8 裁定・VPS 側で役職だけに落として送る)。
import { store, adminOk, bearerOk, json } from "../_lib.js";

const KEY = "sg:admin:foia";
const MAX_BYTES = 8 * 1024 * 1024;   // KV の値は 25 MiB まで・台帳は 200 自治体で ≈ 150 KB

export async function onRequestPost({ request, env }) {
  if (!bearerOk(request, env)) return json({ ok: false, error: "unauthorized" }, 401);
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ ok: false, error: "too large" }, 413);
  let d; try { d = JSON.parse(text); } catch { return json({ ok: false, error: "bad json" }, 400); }
  if (!d || !Array.isArray(d.rows)) return json({ ok: false, error: "rows[] required" }, 400);
  const stored = { ...d, received_at: new Date().toISOString() };
  await kv.put(KEY, JSON.stringify(stored));
  return json({ ok: true, n: d.rows.length, received_at: stored.received_at });
}

export async function onRequestGet({ request, env }) {
  const who = await adminOk(request, env);
  if (!who) return json({ ok: false, error: "admin only" }, who === null ? 401 : 403, { vary: "cookie" });
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const d = await kv.get(KEY, "json");
  return json({ ok: true, admin: who === true ? "bearer" : who, ledger: d || null }, 200, { vary: "cookie" });
}
