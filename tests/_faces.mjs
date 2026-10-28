import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1 } from "./_d1.mjs";
import { KV } from "./_kv.mjs";
import { createSession } from "../functions/signal/_lib.js";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
import { onRequestGet as face } from "../functions/signal/api/face/[face].js";
import { onRequestGet as meta } from "../functions/signal/api/meta/[face].js";
import { onRequestGet as company } from "../functions/signal/api/company/[id].js";
import { onRequestGet as search } from "../functions/signal/api/search.js";
export const schema = readFileSync(new URL("../scripts/faces-schema.sql", import.meta.url), "utf8");
export const day = "2026-09-27", email = "reader@example.test";
export class Faces {
  constructor() { this.db = new DatabaseSync(":memory:"); this.db.exec(schema); this.reset(); }
  reset() { this.sql = []; this.batches = []; }
  prepare(sql) {
    this.sql.push(sql); const query = this.db.prepare(sql); let args = [];
    return {
      bind(...values) { args = values; return this; },
      async all() { return { success: true, meta: { changes: 0 }, results: query.all(...args).map(row => ({ ...row })) }; },
      async run() { const r = query.run(...args); return { success: true, meta: { changes: Number(r.changes) }, results: [] }; },
    };
  }
  async batch(stmts) {
    this.batches.push(stmts.length); this.db.exec("BEGIN");
    try { const result = []; for (const stmt of stmts) result.push(await stmt.all()); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  insert(table, row) {
    const keys = Object.keys(row);
    this.db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).run(...Object.values(row));
  }
  meta(face, extra = {}) { this.insert("f_meta", { face, generated_at: `${day}T06:00:00Z`, synced_at: `${day}T07:00:00Z`, n_total: 100, meta: JSON.stringify({ demo: { total: 100, sample: 2, note: "同期の見本", cutoff: "2026-08-13" } }), ...extra }); }
  row(face, extra = {}) {
    const row = { id: "row", ord: 0, period_date: day, new_date: day, is_sample: 0, ...extra };
    row.card = typeof row.card === "string" ? row.card : JSON.stringify(row.card ?? { id: row.id, fact: {}, types: [] });
    this.insert(FACE_SPEC.faces[face].table, row);
  }
  tag(face, dim, value, id) { this.insert("f_tag", { face, dim, value, id: String(id) }); }
  company(id = "C-12103", sections = {}, extra = {}) {
    const header = { id, name: "Toyota Motor", faces: {}, n_timeline: sections.timeline?.length || 0, ...extra };
    for (const face of FACE_SPEC.c_item.faces) {
      const rows = sections[face] || [];
      if (face !== "timeline") header.faces[face] = { count: face === "hiring" ? 999 : rows.length, n_items: rows.length, amount_total: 42, by_role: { manufacturing: 7 }, status: "ok" };
      rows.forEach((item, ord) => this.insert("c_item", { company_id: id, face, ord, id: item.id ?? item.ref ?? null, src_face: face === "timeline" ? item.face : null, item: JSON.stringify(item) }));
    }
    this.insert("company", { id, name: header.name, state: "OH", city: "Columbus", header: JSON.stringify(header) });
    this.insert("company_fts", { id, name: header.name }); return header;
  }
}
export function setup(t, kind = "kv", now = `${day}T12:00:00Z`) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  const env = { SIGNAL_SECRET: "test-secret", BEACON_REQUESTS: new KV(), FACES_DB: new Faces() };
  t.after(() => env.FACES_DB?.db?.close());
  if (kind === "d1") { env.SIGNAL_DB = new D1(); t.after(() => env.SIGNAL_DB.db.close()); }
  const cache = new Map(), oldCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  t.after(() => { if (oldCaches) Object.defineProperty(globalThis, "caches", oldCaches); else delete globalThis.caches; });
  globalThis.caches = { default: { async match(req) { return cache.get(req.url)?.clone(); }, async put(req, response) { cache.set(req.url, response.clone()); } } };
  return env;
}
export const cookieFor = async env => (await createSession(env, { email, company: "Example" })).split(";")[0];
export function get(env, path, cookie) {
  const [pathname] = path.split("?"), [route, value] = pathname.split("/");
  return ({ face, meta, company, search })[route]({ env, request: new Request(`https://example.test/signal/api/${path}`, { headers: cookie ? { cookie } : {} }), params: route === "company" ? { id: value } : { face: value } });
}
export async function body(env, path, cookie) {
  const response = await get(env, path, cookie);
  if (response.status !== 200) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}
export async function walk(env, path, cookie) {
  const rows = []; let cursor = null, pages = 0;
  do { const result = await body(env, path + (cursor ? `&cursor=${cursor}` : ""), cookie); rows.push(...result.rows); cursor = result.next_cursor; if (++pages > 30) throw new Error("pagination loop"); } while (cursor);
  return rows;
}
