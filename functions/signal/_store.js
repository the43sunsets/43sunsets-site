// Authentication records use D1 when bound; KV remains the deployment/rollback fallback.
const nowISO = () => new Date().toISOString();
const later = (now, seconds) => new Date(Date.parse(now) + seconds * 1000).toISOString();
const randomHex = bytes => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
const copyKey = rec => rec.key || `sg:creq:${rec.ts}:${rec.id}`;
export function validCopyRequestKey(key) { return /^sg:creq:[0-9T:.\-Z]+:[a-f0-9]{12}$/.test(key); }
export async function tokenHash(token) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function authStore(env) {
  return env.SIGNAL_DB ? d1Store(env.SIGNAL_DB) : (env.SIGNAL_AUTH || env.BEACON_REQUESTS ? kvStore(env.SIGNAL_AUTH || env.BEACON_REQUESTS) : null);
}
async function keys(kv, prefix) {
  const out = []; let cursor;
  do { const p = await kv.list({ prefix, cursor, limit: 1000 }); out.push(...p.keys.map(k => k.name)); cursor = p.list_complete ? undefined : p.cursor; } while (cursor);
  return out;
}
export function kvStore(kv) {
  const put = (key, value, ttl) => kv.put(key, JSON.stringify(value), ttl ? { expirationTtl: ttl } : undefined);
  const records = async (prefix, withKey = false) => {
    const out = [];
    for (const key of await keys(kv, prefix)) { const v = await kv.get(key, "json"); if (v) out.push(withKey ? { key, ...v } : v); }
    return out;
  };
  const bump = async (key, ttl) => { const n = Math.max(parseInt(await kv.get(key) || "0", 10), 0) + 1; await kv.put(key, String(n), { expirationTtl: ttl }); return n; };
  return {
    kind: "kv",
    async sweep() { return {}; },
    async getAccount(email) { return kv.get("sg:acct:" + email, "json"); },
    async putAccount(acct) { await put("sg:acct:" + acct.email, acct); },
    async listAccounts() { return records("sg:acct:"); },
    async issueToken(email, next, ttl = 900) {
      const token = randomHex(24); await put("sg:tok:" + token, { email, next, created: nowISO(), ttl }, ttl); return token;
    },
    async consumeToken(token, now = nowISO()) {
      if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
      const v = await kv.get("sg:tok:" + token, "json"); if (!v) return null;
      await kv.delete("sg:tok:" + token); return v;
    },
    async createSession(sid, email, company, days, keyId) { await put("sg:sess:" + sid, { email, company, created: nowISO() }, days * 86400); },
    async getSession(sid, now = nowISO()) { return kv.get("sg:sess:" + sid, "json"); },
    async deleteSession(sid) { await kv.delete("sg:sess:" + sid); },
    async listSessions() {
      const out = []; for (const key of await keys(kv, "sg:sess:")) { const v = await kv.get(key, "json"); if (v) out.push({ sid: key.slice(8), email: v.email, company: v.company, created: v.created }); } return out;
    },
    async allow(kind, values, remove = false) { for (const value of values) { const key = `sg:allow:${kind}:${value}`; if (remove) await kv.delete(key); else await kv.put(key, "1"); } },
    async listAllow() {
      const out = { domains: [], emails: [] }; for (const key of await keys(kv, "sg:allow:")) { const [, , kind, value] = key.split(":"); (kind === "dom" ? out.domains : out.emails).push(value); } return out;
    },
    async isAllowed(kind, value) { return !!await kv.get(`sg:allow:${kind}:${value}`); },
    async putRegistration(rec) { await put(`sg:reg:${rec.ts}:${rec.id}`, rec, 365 * 86400); },
    async listRegistrations(since = "") { return (await records("sg:reg:")).filter(v => v.ts.slice(0, 10) >= since); },
    async putDecision(id, rec, ttl) { await put("sg:dec:" + id, rec, ttl); },
    async getDecision(id, now = nowISO()) { return kv.get("sg:dec:" + id, "json"); },
    async deleteDecision(id) { await kv.delete("sg:dec:" + id); },
    async logEvent(type, email, extra = {}) { const ts = nowISO(); await put(`sg:ev:${ts}:${randomHex(4)}`, { type, email, ts, ...extra }, 60 * 86400); },
    async listEvents(since = "") { return (await records("sg:ev:", true)).filter(v => v.ts.slice(0, 10) >= since); },
    async bumpFaceDay(day, email, face) { return bump(`sg:evd:${day}:${email}:${face}`, 45 * 86400); },
    async listFaceDays(since = "") {
      const out = []; for (const key of await keys(kv, "sg:evd:")) { const [, , day, email, ...face] = key.split(":"); if (day >= since) out.push({ day, email, face: face.join(":"), n: parseInt(await kv.get(key) || "0", 10) }); } return out;
    },
    async rateLimited(email, now = nowISO(), secs = 60) { const key = "sg:rl:" + email; if (await kv.get(key)) return true; await kv.put(key, "1", { expirationTtl: secs }); return false; },
    async bumpDl(day, sid) { return bump(`sg:dl:${day}:${sid}`, 30 * 86400); },
    async listDl() {
      const out = []; for (const key of await keys(kv, "sg:dl:")) { const [, , day, sid] = key.split(":"); out.push({ day, sid, n: parseInt(await kv.get(key) || "0", 10) }); } return out;
    },
    async putCopyRequest(rec) { const { key, ...value } = rec; await put(copyKey(rec), value); },
    async listCopyRequests() { return records("sg:creq:", true); },
    async getCopyRequest(key) { return kv.get(key, "json"); },
    // With no ts this reads the duplicate index; with ts it writes it.
    async copyIndex(fs, email, ts, ttl = 90 * 86400) { const key = `sg:creqi:${fs}:${email}`; if (ts === undefined) return kv.get(key); await kv.put(key, ts, { expirationTtl: ttl }); },
    async copyCount(email, month, increment = false) { const key = `sg:cr:cnt:${email}:${month}`; return increment ? bump(key, 40 * 86400) : parseInt(await kv.get(key) || "0", 10); },
  };
}

// These optional columns retain fields written by the existing KV callers.
export const accountColumns = ["email", "company", "name", "title", "interests", "status", "source", "id", "created", "updated", "decided_at", "decided_by"];
export const registrationColumns = ["id", "ts", "email", "company", "name", "title", "interests", "roster", "next", "status", "created", "updated", "source", "decided_at", "decided_by"];
export const eventColumns = ["company", "name", "page", "fs_number", "state"];
export const copyColumns = ["key", "ts", "id", "email", "company", "fs_number", "state", "debtor", "status", "updated_at", "note", "updated"];
const compact = row => row ? Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null)) : null;
export function d1Store(db) {
  const stmt = (sql, args) => db.prepare(sql).bind(...args);
  const run = (sql, ...args) => stmt(sql, args).run();
  const first = (sql, ...args) => stmt(sql, args).first();
  const all = async (sql, ...args) => (await stmt(sql, args).all()).results;
  const upsert = (table, columns, rec, pk) => run(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT(${pk}) DO UPDATE SET ${columns.filter(c => c !== pk).map(c => `${c}=excluded.${c}`).join(",")}`, ...columns.map(c => rec[c] ?? null));
  const sessionValue = row => row ? compact({ email: row.email, company: row.company, created: row.created_at }) : null;
  return {
    kind: "d1",
    async sweep(now = nowISO()) {
      try {
        const cutoff = later(now, -60 * 86400), grace = later(now, -7 * 86400);
        const deletes = [
          ["event", "ts", cutoff],
          ["face_day", "day", cutoff.slice(0, 10)],
          ["dl_count", "day", cutoff.slice(0, 10)],
          ["magic_token", "expires_at", grace],
          ["session", "expires_at", grace],
          ["decision_link", "expires_at", grace],
          ["rate_limit", "until", now],
          ["copy_request_index", "expires_at", grace],
        ];
        const results = await db.batch(deletes.map(([table, column, limit]) => stmt(`DELETE FROM ${table} WHERE ${column} < ?`, [limit])));
        return Object.fromEntries(deletes.map(([table], i) => [table, results[i].meta.changes]));
      } catch (e) {
        const error = String(e?.message ?? e);
        console.warn(`[signal sweep] ${error.replace(/[\r\n]+/g, " ")}`);
        return { error };
      }
    },
    async getAccount(email) { return compact(await first("SELECT * FROM account WHERE email=?", email)); },
    async putAccount(acct) { await upsert("account", accountColumns, acct, "email"); },
    async listAccounts() { return (await all("SELECT * FROM account ORDER BY email")).map(compact); },
    async issueToken(email, next, ttl = 900) {
      const token = randomHex(24), now = nowISO();
      await run("INSERT INTO magic_token (token_hash,email,next,ttl,created_at,expires_at) VALUES (?,?,?,?,?,?)", await tokenHash(token), email, next, ttl, now, later(now, ttl));
      return token;
    },
    async consumeToken(token, now = nowISO()) {
      if (!/^[a-f0-9]{48}$/.test(token || "")) return null;
      const hash = await tokenHash(token);
      const result = await run("UPDATE magic_token SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at > ?", now, hash, now);
      if (result.meta.changes !== 1) return null;
      return first("SELECT email,next,ttl FROM magic_token WHERE token_hash=?", hash);
    },
    async createSession(sid, email, company, days, keyId) {
      const now = nowISO(); await run("INSERT INTO session (sid,email,company,created_at,expires_at,key_id) VALUES (?,?,?,?,?,?)", sid, email, company, now, later(now, days * 86400), keyId);
    },
    async getSession(sid, now = nowISO()) { return sessionValue(await first("SELECT * FROM session WHERE sid=? AND revoked_at IS NULL AND expires_at > ?", sid, now)); },
    async deleteSession(sid) { await run("UPDATE session SET revoked_at=? WHERE sid=? AND revoked_at IS NULL", nowISO(), sid); },
    async listSessions() { return (await all("SELECT * FROM session WHERE revoked_at IS NULL AND expires_at > ? ORDER BY sid", nowISO())).map(row => ({ sid: row.sid, ...sessionValue(row) })); },
    async allow(kind, values, remove = false) {
      for (const value of values) { if (remove) await run("DELETE FROM allow_entry WHERE kind=? AND value=?", kind, value); else await run("INSERT OR IGNORE INTO allow_entry (kind,value,added_at) VALUES (?,?,?)", kind, value, nowISO()); }
    },
    async listAllow() { const out = { domains: [], emails: [] }; for (const row of await all("SELECT kind,value FROM allow_entry ORDER BY kind,value")) (row.kind === "dom" ? out.domains : out.emails).push(row.value); return out; },
    async isAllowed(kind, value) { return !!await first("SELECT value FROM allow_entry WHERE kind=? AND value=?", kind, value); },
    async putRegistration(rec) { await upsert("registration", registrationColumns, { ...rec, roster: rec.roster ? 1 : 0 }, "id"); },
    async listRegistrations(since = "") { return (await all("SELECT * FROM registration WHERE ts >= ? ORDER BY ts,id", since)).map(row => ({ ...compact(row), roster: !!row.roster })); },
    async putDecision(id, rec, ttl) { await upsert("decision_link", ["id", "email", "next", "ts", "expires_at", "used_at"], { id, ...rec, expires_at: later(nowISO(), ttl) }, "id"); },
    async getDecision(id, now = nowISO()) { return compact(await first("SELECT email,next,ts FROM decision_link WHERE id=? AND used_at IS NULL AND expires_at > ?", id, now)); },
    async deleteDecision(id) { await run("UPDATE decision_link SET used_at=? WHERE id=? AND used_at IS NULL", nowISO(), id); },
    async logEvent(type, email, extra = {}) {
      const ts = nowISO(), key = `sg:ev:${ts}:${randomHex(4)}`;
      await run("INSERT INTO event (ts,type,email,extra,company,name,page,fs_number,state) VALUES (?,?,?,?,?,?,?,?,?)", ts, type, email, JSON.stringify({ key, ...extra }), ...eventColumns.map(c => extra[c] ?? null));
    },
    async listEvents(since = "") { return (await all("SELECT * FROM event WHERE ts >= ? ORDER BY ts,id", since)).map(row => ({ type: row.type, email: row.email, ts: row.ts, ...JSON.parse(row.extra || "{}") })); },
    async bumpFaceDay(day, email, face) { return (await first("INSERT INTO face_day (day,email,face,n) VALUES (?,?,?,1) ON CONFLICT(day,email,face) DO UPDATE SET n=n+1 RETURNING n", day, email, face)).n; },
    async listFaceDays(since = "") { return all("SELECT day,email,face,n FROM face_day WHERE day >= ? ORDER BY day,email,face", since); },
    async rateLimited(email, now = nowISO(), secs = 60) {
      const r = await run("INSERT INTO rate_limit (email,until) VALUES (?,?) ON CONFLICT(email) DO UPDATE SET until=excluded.until WHERE rate_limit.until <= ?", email, later(now, secs), now);
      return r.meta.changes !== 1;
    },
    async bumpDl(day, sid) { return (await first("INSERT INTO dl_count (day,sid,n) VALUES (?,?,1) ON CONFLICT(day,sid) DO UPDATE SET n=n+1 RETURNING n", day, sid)).n; },
    async listDl() { return all("SELECT day,sid,n FROM dl_count ORDER BY day,sid"); },
    async putCopyRequest(rec) { await upsert("copy_request", copyColumns, { ...rec, key: copyKey(rec) }, "key"); },
    async listCopyRequests() { return (await all("SELECT * FROM copy_request ORDER BY key")).map(compact); },
    async getCopyRequest(key) { const row = compact(await first("SELECT * FROM copy_request WHERE key=?", key)); if (!row) return null; delete row.key; return row; },
    async copyIndex(fs, email, ts, ttl = 90 * 86400) {
      if (ts === undefined) return (await first("SELECT ts FROM copy_request_index WHERE fs=? AND email=? AND expires_at > ?", fs, email, nowISO()))?.ts ?? null;
      await run("INSERT INTO copy_request_index (fs,email,ts,expires_at) VALUES (?,?,?,?) ON CONFLICT(fs,email) DO UPDATE SET ts=excluded.ts,expires_at=excluded.expires_at", fs, email, ts, later(nowISO(), ttl));
    },
    async copyCount(email, month, increment = false) {
      if (!increment) return (await first("SELECT n FROM copy_count WHERE email=? AND month=?", email, month))?.n ?? 0;
      return (await first("INSERT INTO copy_count (email,month,n) VALUES (?,?,1) ON CONFLICT(email,month) DO UPDATE SET n=n+1 RETURNING n", email, month)).n;
    },
  };
}
