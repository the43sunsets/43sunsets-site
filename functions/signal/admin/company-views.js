// GET /signal/admin/company-views?since=YYYY-MM-DD — 日 × 公開会社 ID の閲覧集計。
import { store, adminOk, json } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  if (!(await adminOk(request, env))) return json({ ok: false, error: "unauthorized" }, 401);
  const s = store(env); if (!s) return json({ ok: false, error: "no store" }, 503);
  const since = String(new URL(request.url).searchParams.get("since") || "").slice(0, 10) || new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
  const views = await s.listCompanyViews(since);
  return json({ ok: true, since, views });
}
