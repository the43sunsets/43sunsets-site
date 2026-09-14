#!/usr/bin/env node
// Offline only: node scripts/kv-to-d1.mjs export.json > migrate.sql (or JSON on stdin).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { accountColumns, registrationColumns, copyColumns, eventColumns } from "../functions/signal/_store.js";
const quote = value => value == null ? "NULL" : typeof value === "number" ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
const insert = (table, record) => `INSERT OR IGNORE INTO ${table} (${Object.keys(record).join(",")}) VALUES (${Object.values(record).map(quote).join(",")});`;
const timestamp = value => { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("invalid timestamp"); return new Date(value).toISOString(); };
const expires = (ts, days) => new Date(Date.parse(timestamp(ts)) + days * 864e5).toISOString();
const emailOK = email => typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const count = v => { const n = Number(v); if (!Number.isSafeInteger(n) || n < 0) throw new Error("invalid count"); return n; };
function object(value) { const v = typeof value === "string" ? JSON.parse(value) : value; if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("JSON object required"); return v; }
function fields(v, columns) {
  const unknown = Object.keys(v).filter(k => !columns.includes(k));
  if (unknown.length) throw new Error("unresolved schema columns: " + unknown.join(","));
  return { ...v };
}
function convert({ name, value }) {
  if (typeof name !== "string") throw new Error("invalid key");
  if (/^(sg:tok:|sg:rl:|sg:admin:foia$|req:|contact:|hit:)/.test(name)) return null;
  let m, v;
  if ((m = /^sg:acct:(.+)$/.exec(name))) {
    v = fields(object(value), accountColumns);
    if (!emailOK(m[1]) || v.email !== m[1] || !["active", "pending", "rejected"].includes(v.status)) throw new Error("invalid account");
    timestamp(v.created); return insert("account", v);
  }
  if ((m = /^sg:sess:([a-f0-9]{32})$/.exec(name))) {
    v = fields(object(value), ["email", "company", "created"]);
    if (!emailOK(v.email)) throw new Error("invalid session email");
    return insert("session", { sid: m[1], email: v.email, company: v.company, created_at: timestamp(v.created), expires_at: expires(v.created, 30), key_id: "v0" });
  }
  if ((m = /^sg:allow:(dom|eml):([^:]+)$/.exec(name))) {
    if (!(m[1] === "eml" ? emailOK(m[2]) : /^[a-z0-9.-]+\.[a-z]{2,}$/.test(m[2]))) throw new Error("invalid allow entry");
    if (String(value) !== "1") throw new Error("invalid allow value");
    return insert("allow_entry", { kind: m[1], value: m[2] });
  }
  if ((m = /^sg:reg:(.+):([a-f0-9]{16})$/.exec(name))) {
    v = fields(object(value), registrationColumns);
    if (v.id !== m[2] || v.ts !== m[1] || !emailOK(v.email)) throw new Error("invalid registration");
    timestamp(v.ts); return insert("registration", { ...v, roster: v.roster ? 1 : 0 });
  }
  if ((m = /^sg:dec:([a-f0-9]{16})$/.exec(name))) {
    v = fields(object(value), ["email", "next", "ts"]);
    if (!emailOK(v.email)) throw new Error("invalid decision email");
    return insert("decision_link", { id: m[1], ...v, expires_at: expires(v.ts, 7) });
  }
  if ((m = /^sg:ev:(.+):([a-f0-9]{8})$/.exec(name))) {
    v = object(value); timestamp(v.ts);
    if (v.ts !== m[1] || typeof v.type !== "string" || !v.type || !emailOK(v.email)) throw new Error("invalid event");
    const { ts, type, email, ...extra } = v;
    // Negative deterministic IDs keep repeated imports idempotent without advancing live row IDs.
    const id = -parseInt(createHash("sha256").update(name).digest("hex").slice(0, 13), 16);
    return insert("event", { id, ts, type, email, extra: JSON.stringify({ key: name, ...extra }), ...Object.fromEntries(eventColumns.filter(c => c in extra).map(c => [c, extra[c]])) });
  }
  if ((m = /^sg:evd:(\d{4}-\d{2}-\d{2}):([^:]+):(.+)$/.exec(name))) {
    timestamp(m[1]); if (!emailOK(m[2])) throw new Error("invalid face email");
    return insert("face_day", { day: m[1], email: m[2], face: m[3], n: count(value) });
  }
  if ((m = /^sg:dl:(\d{4}-\d{2}-\d{2}):([a-f0-9]{32})$/.exec(name))) {
    timestamp(m[1]); return insert("dl_count", { day: m[1], sid: m[2], n: count(value) });
  }
  if ((m = /^sg:creq:(.+):([a-f0-9]{12})$/.exec(name))) {
    v = fields(object(value), copyColumns.filter(k => k !== "key")); timestamp(v.ts);
    if (v.ts !== m[1] || v.id !== m[2] || !emailOK(v.email) || !["requested", "purchased", "done", "declined"].includes(v.status)) throw new Error("invalid copy request");
    return insert("copy_request", { key: name, ...v });
  }
  if ((m = /^sg:creqi:([0-9]{14}-[0-9]):(.+)$/.exec(name))) {
    if (!emailOK(m[2])) throw new Error("invalid copy index email");
    // This legacy KV value is a raw ISO string, not a JSON object.
    const ts = timestamp(typeof value === "string" && value.startsWith('"') ? JSON.parse(value) : value);
    return insert("copy_request_index", { fs: m[1], email: m[2], ts, expires_at: expires(ts, 90) });
  }
  if ((m = /^sg:cr:cnt:(.+):(\d{4}-\d{2})$/.exec(name))) {
    if (!emailOK(m[1])) throw new Error("invalid copy count email"); timestamp(m[2] + "-01");
    return insert("copy_count", { email: m[1], month: m[2], n: count(value) });
  }
  throw new Error("unrecognized or malformed key");
}
try {
  const entries = JSON.parse(readFileSync(process.argv[2] || 0, "utf8"));
  if (!Array.isArray(entries)) throw new Error("export must be [{name,value}]");
  const sql = [];
  for (const entry of entries) {
    try { const line = convert(entry); if (line) sql.push(line); }
    catch (err) { console.error(`${JSON.stringify(entry?.name ?? null)}: ${err.message}; skipped`); }
  }
  process.stdout.write(sql.join("\n") + "\n");
} catch (err) { console.error(err.message); process.exitCode = 1; }
