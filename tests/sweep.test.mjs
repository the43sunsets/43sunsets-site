import test from "node:test";
import assert from "node:assert/strict";
import { D1 } from "./_d1.mjs";
import { KV } from "./_kv.mjs";
import { d1Store, kvStore } from "../functions/signal/_store.js";
import { logEvent } from "../functions/signal/_lib.js";
import { onRequestPost } from "../functions/signal/admin/foia.js";

const now = "2026-09-14T12:34:56.789Z";
const ago = (days, base = now) => new Date(Date.parse(base) - days * 864e5).toISOString();
const tables = ["event", "face_day", "company_view", "dl_count", "magic_token", "session", "decision_link", "rate_limit", "copy_request_index"];
const counts = n => Object.fromEntries(tables.map(table => [table, n]));
const insert = (db, table, row) => db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`).bind(...Object.values(row)).run();
const count = (db, table) => db.prepare(`SELECT count(*) AS n FROM ${table}`).first("n");
function database(t, Type = D1) { const db = new Type(); t.after(() => db.db.close()); return db; }
function post(env) {
  return onRequestPost({ env, request: new Request("https://example.test/signal/admin/foia", {
    method: "POST", headers: { authorization: "Bearer ingest-test", "content-type": "application/json" }, body: JSON.stringify({ rows: [] }),
  }) });
}

test("D1 sweep deletes only old rows in all nine tables, uses one batch and is idempotent", async t => {
  const db = database(t), store = d1Store(db);
  const batch = t.mock.method(db, "batch");
  for (const [label, days, graceDays, minutes] of [["old", 61, 8, 1], ["new", 59, 6, -1], ["boundary", 60, 7, 0]]) {
    const ts = ago(days), day = ts.slice(0, 10), expires_at = ago(graceDays), email = `${label}@example.test`;
    await insert(db, "event", { ts, type: "login", email });
    await insert(db, "face_day", { day, email, face: "ucc", n: 1 });
    await insert(db, "company_view", { day, email, company_id: label, n: 1 });
    await insert(db, "dl_count", { day, sid: label, n: 1 });
    await insert(db, "magic_token", { token_hash: label, email, ttl: 900, created_at: ago(90), expires_at });
    await insert(db, "session", { sid: label, email, created_at: ago(90), expires_at });
    await insert(db, "decision_link", { id: label, email, ts: ago(90), expires_at });
    await insert(db, "rate_limit", { email, until: new Date(Date.parse(now) - minutes * 60000).toISOString() });
    await insert(db, "copy_request_index", { fs: label, email, ts: ago(90), expires_at });
  }
  await insert(db, "session", { sid: "old-revoked", email: "old@example.test", created_at: ago(90), expires_at: ago(8), revoked_at: ago(9) });
  assert.deepEqual(await store.sweep(now), { ...counts(1), session: 2 });
  assert.equal(batch.mock.callCount(), 1);
  assert.equal(batch.mock.calls[0].arguments[0].length, 9);
  for (const table of tables) {
    assert.equal(await count(db, table), 2, table);
    const rows = (await db.prepare(`SELECT * FROM ${table}`).all()).results;
    assert.ok(rows.every(row => table === "dl_count" ? ["new", "boundary"].includes(row.sid) : ["new@example.test", "boundary@example.test"].includes(row.email)), table);
  }
  assert.deepEqual(await store.sweep(now), counts(0));
  for (const table of tables) assert.equal(await count(db, table), 2, table);
});

test("D1 sweep preserves old account, allow_entry, registration, copy_request and copy_count rows", async t => {
  const db = database(t), old = ago(365), email = "old@example.test";
  const rows = {
    account: { email, status: "active", created: old },
    allow_entry: { kind: "eml", value: email, added_at: old },
    registration: { id: "old", ts: old, email },
    copy_request: { key: "old", ts: old, email, status: "requested" },
    copy_count: { email, month: old.slice(0, 7), n: 7 },
  };
  for (const [table, row] of Object.entries(rows)) await insert(db, table, row);
  const before = {};
  for (const table of Object.keys(rows)) before[table] = (await db.prepare(`SELECT * FROM ${table}`).all()).results;
  assert.deepEqual(await d1Store(db).sweep(now), counts(0));
  for (const table of Object.keys(rows)) {
    assert.equal(await count(db, table), 1, table);
    assert.deepEqual((await db.prepare(`SELECT * FROM ${table}`).all()).results, before[table], table);
  }
});

test("KV sweep is a no-op and leaves TTL and records intact", async () => {
  const kv = new KV(), store = kvStore(kv);
  await store.logEvent("login", "a@b.co");
  const records = [...kv.data], options = [...kv.options];
  assert.equal(options[0][1].expirationTtl, 60 * 86400);
  assert.deepEqual(await store.sweep(), {});
  assert.deepEqual([...kv.data], records);
  assert.deepEqual([...kv.options], options);
});

for (const kind of ["d1", "kv"]) {
  test(`${kind}: FOIA POST keeps response and stored ledger intact and sweeps after put`, async t => {
    const kv = new KV(), env = { BEACON_REQUESTS: kv, SIGNAL_INGEST_KEY: "ingest-test" };
    if (kind === "d1") {
      env.SIGNAL_DB = database(t);
      await insert(env.SIGNAL_DB, "event", { ts: ago(61, new Date().toISOString()), type: "login" });
      const original = env.SIGNAL_DB.batch.bind(env.SIGNAL_DB);
      t.mock.method(env.SIGNAL_DB, "batch", async statements => {
        assert.ok(await kv.get("sg:admin:foia", "json"));
        return original(statements);
      });
    }
    const response = await post(env), body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, n: 0, received_at: body.received_at });
    assert.equal(new Date(body.received_at).toISOString(), body.received_at);
    assert.deepEqual(await kv.get("sg:admin:foia", "json"), { rows: [], received_at: body.received_at });
    if (kind === "d1") assert.equal(await count(env.SIGNAL_DB, "event"), 0);
  });
}

test("logEvent writes the event before sweeping old face_day rows", async t => {
  const db = database(t);
  await insert(db, "face_day", { day: ago(61, new Date().toISOString()).slice(0, 10), email: "a@b.co", face: "ucc", n: 1 });
  const original = db.batch.bind(db);
  const batch = t.mock.method(db, "batch", async statements => {
    assert.equal(await count(db, "event"), 1);
    return original(statements);
  });
  assert.equal(await logEvent({ SIGNAL_DB: db }, "login", "a@b.co"), undefined);
  assert.equal(batch.mock.callCount(), 1);
  assert.equal(await count(db, "event"), 1);
  assert.equal(await count(db, "face_day"), 0);
  const event = await db.prepare("SELECT type,email FROM event").first();
  assert.deepEqual(event, { type: "login", email: "a@b.co" });
});

test("batch failure returns error, warns once per sweep and does not break either caller", async t => {
  class FailingD1 extends D1 { async batch() { throw new Error("batch failed\noffline"); } }
  const db = database(t, FailingD1), warn = t.mock.method(console, "warn", () => {});
  assert.deepEqual(await d1Store(db).sweep(now), { error: "batch failed\noffline" });
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(await logEvent({ SIGNAL_DB: db }, "login", "a@b.co"), undefined);
  assert.equal(await count(db, "event"), 1);
  assert.equal(warn.mock.callCount(), 2);
  const response = await post({ SIGNAL_DB: db, BEACON_REQUESTS: new KV(), SIGNAL_INGEST_KEY: "ingest-test" });
  assert.equal(response.status, 200);
  assert.equal(warn.mock.callCount(), 3);
  for (const call of warn.mock.calls) {
    assert.equal(call.arguments.length, 1);
    assert.match(call.arguments[0], /batch failed offline/);
    assert.doesNotMatch(call.arguments[0], /[\r\n]/);
  }
});
