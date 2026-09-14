import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
export const schema = readFileSync(new URL("../scripts/d1-schema.sql", import.meta.url), "utf8");
export class D1 {
  constructor() { this.db = new DatabaseSync(":memory:"); this.db.exec(schema); }
  prepare(sql) {
    const query = this.db.prepare(sql); let args = [];
    return {
      bind(...values) { args = values; return this; },
      async run() { const r = query.run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      async first(col) { const row = query.get(...args); return row ? (col ? row[col] : { ...row }) : null; },
      async all() { return { results: query.all(...args).map(row => ({ ...row })) }; },
    };
  }
  async batch(stmts) {
    this.db.exec("BEGIN");
    try { const out = []; for (const s of stmts) out.push(await s.run()); this.db.exec("COMMIT"); return out; }
    catch (err) { this.db.exec("ROLLBACK"); throw err; }
  }
}
