// /signal/admin/copy-requests — 写しの依頼の一覧と状態更新(管理者セッション or Bearer・2026-09-09)。
//   GET  … 全依頼 {requests:[{id, ts, email, company, fs_number, state, status, debtor}], byStatus}
//   POST {"key":"sg:creq:<ts>:<id>","status":"purchased|done|declined"} … 状態を更新(週 1 回の購入後に「購入済み」→ 取り込み後に「反映済み」)
import { store, adminOk, json } from "../_lib.js";

const STATUSES = new Set(["requested", "purchased", "done", "declined"]);
async function listAll(kv, prefix) { const out = []; let cursor; do { const p = await kv.list({ prefix, cursor, limit: 1000 }); out.push(...p.keys.map(k => k.name)); cursor = p.list_complete ? undefined : p.cursor; } while (cursor); return out; }

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401, { vary: "cookie" });
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  const requests = [];
  for (const k of await listAll(kv, "sg:creq:")) { const v = await kv.get(k, "json"); if (v) requests.push({ key: k, ...v }); }
  requests.sort((a, b) => (b.ts || "").localeCompare(a.ts || ""));
  const byStatus = {}; for (const r of requests) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  return json({ ok: true, n: requests.length, byStatus, requests }, 200, { vary: "cookie" });
}

export async function onRequestPost({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401, { vary: "cookie" });
  const kv = store(env); if (!kv) return json({ ok: false, error: "no store" }, 503);
  let b; try { b = await request.json(); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const key = String(b.key || ""); if (!/^sg:creq:[0-9T:.\-Z]+:[a-f0-9]{12}$/.test(key)) return json({ ok: false, error: "key" }, 400);
  if (!STATUSES.has(b.status)) return json({ ok: false, error: "status" }, 400);
  const v = await kv.get(key, "json"); if (!v) return json({ ok: false, error: "not found" }, 404);
  v.status = b.status; v.updated = new Date().toISOString();
  await kv.put(key, JSON.stringify(v));
  return json({ ok: true, request: v });
}
