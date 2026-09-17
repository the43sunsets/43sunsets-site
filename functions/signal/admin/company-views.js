// GET /signal/admin/company-views?since=YYYY-MM-DD — 日 × 公開会社 ID の閲覧集計。
import { store, adminOk, ingestOk, json } from "../_lib.js";

// D-21 甲(2026-09-16 CEO): VPS の producer(bin/company_views_fetch.py)は ingest 鍵(VPS ↔ site の機械鍵)で読む。応答は日 × 会社の集計だけ(email なし)。
export async function onRequestGet({ request, env }) {
  if (!(ingestOk(request, env) || await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);
  const s = store(env); if (!s) return json({ ok: false, error: "no store" }, 503);
  const since = String(new URL(request.url).searchParams.get("since") || "").slice(0, 10) || new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const views = await s.listCompanyViews(since);
  return json({ ok: true, since, views });
}
