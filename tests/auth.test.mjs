import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { D1, schema } from "./_d1.mjs";
import { KV } from "./_kv.mjs";
import { authStore } from "../functions/signal/_store.js";
import { cookieKeys, configured, signCookie, verifyCookie, hmac } from "../functions/signal/_keys.js";
import { currentSession, decisionSig, checkDecisionSig, isRosterAddress } from "../functions/signal/_lib.js";
import * as register from "../functions/signal/register.js";
import * as decide from "../functions/signal/admin/decide.js";
import * as resend from "../functions/signal/resend.js";
import * as session from "../functions/signal/session.js";
import * as me from "../functions/signal/me.js";
import * as logout from "../functions/signal/logout.js";
import * as foia from "../functions/signal/admin/foia.js";
import * as registrations from "../functions/signal/admin/registrations.js";
import * as sessions from "../functions/signal/admin/sessions.js";
import * as events from "../functions/signal/admin/events.js";
import * as allow from "../functions/signal/admin/allow.js";
import * as copy from "../functions/signal/copy-request.js";
import * as copies from "../functions/signal/admin/copy-requests.js";
import * as data from "../functions/cockpit/data/[[path]].js";
const email = "reader@example.com", sid = "a".repeat(32), id = "b".repeat(16);
const iso = () => new Date().toISOString();
const acct = () => ({ email, company: "Example", name: "Reader", status: "active", created: iso() });
function envFor(kind) { return { ...(kind === "d1" ? { SIGNAL_DB: new D1() } : {}), BEACON_REQUESTS: new KV(), SIGNAL_COOKIE_KEYS: "v2:cookie-b;v1:cookie-a", SIGNAL_ADMIN_KEY: "admin-a", SIGNAL_INGEST_KEY: "ingest-i", MAIL_DEV: "1" }; }
function request(path = "/signal/me", { form, json, bearer, cookie, method } = {}) {
  const headers = {}; if (bearer) headers.authorization = "Bearer " + bearer; if (cookie) headers.cookie = cookie;
  if (json !== undefined) headers["content-type"] = "application/json";
  return new Request("https://example.test" + path, { method: method || (form || json !== undefined ? "POST" : "GET"), headers, body: form ? new URLSearchParams(form) : json !== undefined ? JSON.stringify(json) : undefined });
}
const call = (handler, env, opts, path) => handler({ env, request: request(path, opts) });

test("schema is valid and idempotent", () => {
  const d = new D1(), before = d.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all();
  d.db.exec(schema); assert.deepEqual(d.db.prepare("SELECT * FROM sqlite_schema ORDER BY name").all(), before);
  assert.ok(d.db.prepare("PRAGMA table_info(copy_request)").all().some(c => c.name === "debtor"));
  d.db.close();
});

test("D1 stores only SHA-256 and consumes once, including five concurrent attempts and expiry", async () => {
  const env = envFor("d1"), s = authStore(env);
  const tok = await s.issueToken(email, "/signal/ucc/", 900);
  assert.match(tok, /^[a-f0-9]{48}$/);
  const row = await env.SIGNAL_DB.prepare("SELECT * FROM magic_token").first();
  assert.equal(row.token_hash, createHash("sha256").update(tok).digest("hex"));
  assert.ok(!JSON.stringify(row).includes(tok));
  assert.deepEqual(await s.consumeToken(tok), { email, next: "/signal/ucc/", ttl: 900 });
  assert.equal(await s.consumeToken(tok), null);
  const concurrent = await s.issueToken(email, "/signal/", 900);
  const results = await Promise.all(Array.from({ length: 5 }, () => s.consumeToken(concurrent)));
  assert.equal(results.filter(Boolean).length, 1);
  const expired = await s.issueToken(email, "/signal/", 1);
  const expiry = await env.SIGNAL_DB.prepare("SELECT expires_at FROM magic_token WHERE token_hash=?").bind(createHash("sha256").update(expired).digest("hex")).first("expires_at");
  assert.equal(await s.consumeToken(expired, expiry), null);
  assert.equal(await s.consumeToken("malformed"), null);
});

test("concurrent session endpoint issues exactly one cookie and one session", async () => {
  const env = envFor("d1"), s = authStore(env); await s.putAccount(acct());
  const tok = await s.issueToken(email, "/signal/", 900);
  const results = await Promise.all(Array.from({ length: 5 }, () => call(session.onRequestPost, env, { form: { t: tok } })));
  assert.equal(results.filter(r => r.status === 303 && r.headers.has("set-cookie")).length, 1);
  assert.equal(results.filter(r => r.status === 410).length, 4);
  assert.equal((await s.listSessions()).length, 1);
  assert.equal((await s.listEvents()).filter(e => e.type === "login").length, 1);
  assert.equal(await env.SIGNAL_DB.prepare("SELECT key_id FROM session").first("key_id"), "v2");
});

test("KV fallback retains existing account/token/session JSON and bindings", async () => {
  const kv = new KV(), env = { BEACON_REQUESTS: kv }, s = authStore(env), a = acct();
  assert.equal(s.kind, "kv"); assert.equal(authStore({}), null);
  await s.putAccount(a); assert.deepEqual(await kv.get("sg:acct:" + email, "json"), a);
  const tok = await s.issueToken(email, "/signal/", 900), value = await kv.get("sg:tok:" + tok, "json");
  assert.deepEqual(Object.keys(value).sort(), ["created", "email", "next", "ttl"]);
  assert.equal(kv.options.get("sg:tok:" + tok).expirationTtl, 900);
  assert.deepEqual(await s.consumeToken(tok), value); assert.equal(await s.consumeToken(tok), null);
  await s.createSession(sid, email, "Example", 30, "v2");
  assert.deepEqual(Object.keys(await kv.get("sg:sess:" + sid, "json")).sort(), ["company", "created", "email"]);
  assert.equal(kv.options.get("sg:sess:" + sid).expirationTtl, 30 * 86400);
  assert.deepEqual(await s.getSession(sid), await kv.get("sg:sess:" + sid, "json"));
  const preferred = new KV(); await authStore({ ...env, SIGNAL_AUTH: preferred }).putAccount(a);
  assert.deepEqual(await preferred.get("sg:acct:" + email, "json"), a);
  const d1env = { ...env, SIGNAL_DB: new D1() }; assert.equal(authStore(d1env).kind, "d1");
  assert.deepEqual(await authStore(env).getAccount(email), a); // removing D1 restores untouched KV.
});

test("cookie rotation exercise, legacy cookies, tampering and fail-closed configuration", async () => {
  const env = { SIGNAL_COOKIE_KEYS: "v2:b;v1:a", SIGNAL_SECRET: "legacy", BEACON_REQUESTS: new KV() };
  const old = await signCookie({ SIGNAL_COOKIE_KEYS: "v1:a" }, sid);
  const fresh = await signCookie(env, sid); assert.match(fresh, /^[a-f0-9]{32}\.v2\./);
  assert.equal(await verifyCookie(env, old), sid); assert.equal(await verifyCookie(env, fresh), sid);
  assert.equal(await verifyCookie({ ...env, SIGNAL_COOKIE_KEYS: "v2:b" }, old), null);
  assert.equal(await verifyCookie(env, fresh.replace(".v2.", ".v9.")), null);
  assert.equal(await verifyCookie(env, fresh.slice(0, -1) + "x"), null);
  assert.equal(await verifyCookie(env, fresh + ".extra"), null);
  const legacy = sid + "." + await hmac("legacy", "sess:" + sid);
  assert.equal(await verifyCookie(env, legacy), sid);
  assert.equal(await verifyCookie({ SIGNAL_COOKIE_KEYS: "v2:b" }, legacy), null);
  assert.deepEqual(cookieKeys({ SIGNAL_SECRET: "legacy" }), [{ id: "v0", secret: "legacy" }]);
  assert.deepEqual(cookieKeys({}), []); assert.equal(configured({ BEACON_REQUESTS: env.BEACON_REQUESTS }), false);
  assert.equal(configured({ SIGNAL_SECRET: "s" }), false);
  assert.equal(await currentSession(request(undefined, { cookie: "sg_s=" + fresh }), { BEACON_REQUESTS: env.BEACON_REQUESTS }), null);
  assert.equal(await currentSession(request(undefined, { cookie: "sg_s=%invalid" }), env), null);
});

for (const kind of ["d1", "kv"]) {
  test(`${kind}: admin/ingest separation, legacy fallback and decision signatures`, async () => {
    const env = envFor(kind), s = authStore(env); await s.putAccount(acct());
    for (const [key, allowed] of [["ingest-i", true], ["admin-a", false], ["cookie-b", false]]) {
      assert.equal((await call(foia.onRequestPost, env, { bearer: key, json: { rows: [] } })).status, allowed ? 200 : 401);
      assert.equal((await call(allow.onRequestPost, env, { bearer: key, json: { domains: ["example.com"] } })).status, allowed ? 200 : 401);
      assert.equal((await call(registrations.onRequestPost, env, { bearer: key, json: { email, status: "active", send: false } })).status, allowed ? 200 : 401);
    }
    for (const handler of [registrations.onRequestGet, sessions.onRequestGet, events.onRequestGet, copies.onRequestGet, foia.onRequestGet, allow.onRequestGet]) {
      assert.equal((await call(handler, env, { bearer: "ingest-i" })).status, 401);
      assert.equal((await call(handler, env, { bearer: "admin-a" })).status, 200);
    }
    assert.ok(await env.BEACON_REQUESTS.get("sg:admin:foia", "json"));
    assert.equal(await decisionSig(env, id), await hmac("admin-a", "decide:" + id));
    assert.equal(await checkDecisionSig(env, id, await hmac("ingest-i", "decide:" + id)), false);
    const fallback = { ...env, SIGNAL_COOKIE_KEYS: undefined, SIGNAL_ADMIN_KEY: undefined, SIGNAL_INGEST_KEY: undefined, SIGNAL_SECRET: "s" };
    assert.equal((await call(foia.onRequestPost, fallback, { bearer: "s", json: { rows: [] } })).status, 200);
    assert.equal((await call(registrations.onRequestGet, fallback, { bearer: "s" })).status, 200);
  });

  test(`${kind}: register -> decide -> resend -> session -> me -> full data -> logout`, async t => {
    const env = envFor(kind), s = authStore(env), messages = [];
    t.mock.method(console, "log", (...args) => messages.push(args.join(" ")));
    const registered = await call(register.onRequestPost, env, { form: { email, company: "Example", name: "Reader", next: "/signal/ucc/" } });
    assert.equal(registered.status, 303); assert.equal(registered.headers.get("location"), "/signal/join/?state=pending");
    const a = await s.getAccount(email); assert.equal(a.status, "pending");
    assert.ok(messages.some(m => m.includes("[MAIL_DEV]") && m.includes("登録を受け付けました")));
    assert.ok(await s.getDecision(a.id)); if (kind === "d1") assert.equal(await env.SIGNAL_DB.prepare("SELECT count(*) AS n FROM decision_link").first("n"), 1);
    const url = `/signal/admin/decide?id=${a.id}&sig=${await decisionSig(env, a.id)}`;
    assert.equal((await call(decide.onRequestGet, env, {}, url)).status, 200);
    assert.equal((await call(decide.onRequestPost, env, { form: { action: "approve" } }, url)).status, 200);
    assert.equal((await s.getAccount(email)).status, "active"); assert.equal(await s.getDecision(a.id), null);
    // Simulate the original 60-second resend window having elapsed; KV model intentionally ignores TTL.
    if (kind === "d1") env.SIGNAL_DB.db.exec("DELETE FROM rate_limit"); else await env.BEACON_REQUESTS.delete("sg:rl:" + email);
    messages.length = 0;
    assert.equal((await call(resend.onRequestPost, env, { form: { email, next: "/signal/ucc/" } })).headers.get("location"), "/signal/login/?state=sent");
    const tok = messages.join("\n").match(/\/signal\/login\/\?t=([a-f0-9]{48})/)[1];
    const logged = await call(session.onRequestPost, env, { form: { t: tok } });
    assert.equal(logged.status, 303); assert.equal(logged.headers.get("location"), "/signal/login/?done=1&next=%2Fsignal%2Fucc%2F");
    const cookie = logged.headers.get("set-cookie").split(";")[0];
    assert.deepEqual(await (await call(me.onRequestGet, env, { cookie })).json(), { ok: true, loggedIn: true, email, company: "Example", configured: true });
    assert.equal((await s.listEvents()).filter(e => e.type === "login").length, 1);
    const cache = new Map();
    const oldCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
    t.after(() => { if (oldCaches) Object.defineProperty(globalThis, "caches", oldCaches); else delete globalThis.caches; });
    globalThis.caches = { default: {
      async match(req) { const r = cache.get(req.url); return r?.clone(); }, async put(req, r) { cache.set(req.url, r.clone()); },
    } };
    const body = { signals: [{ id: "full" }] };
    const full = await data.onRequestGet({ env, request: request("/cockpit/data/ucc.json", { cookie }), params: { path: ["ucc.json"] }, next: async () => Response.json(body) });
    assert.equal(full.headers.get("x-signal-mode"), "full"); assert.deepEqual(await full.json(), body);
    assert.equal((await s.listFaceDays())[0].n, 1); assert.equal((await s.listDl())[0].n, 1);
    const rec = await currentSession(request(undefined, { cookie }), env);
    assert.equal((await call(logout.onRequestPost, env, { cookie, method: "POST" })).headers.get("location"), "/signal/");
    assert.deepEqual(await (await call(me.onRequestGet, env, { cookie })).json(), { ok: true, loggedIn: false, configured: true });
    if (kind === "d1") assert.ok(await env.SIGNAL_DB.prepare("SELECT revoked_at FROM session WHERE sid=?").bind(rec.sid).first("revoked_at"));
    else assert.equal(await env.BEACON_REQUESTS.get("sg:sess:" + rec.sid), null);
  });

  test(`${kind}: copy request debtor/update, duplicate index, counters, roster and admin session`, async t => {
    const env = envFor(kind), s = authStore(env); t.mock.method(console, "log", () => {});
    await s.createSession(sid, email, "Example", 30, "v2"); const cookie = "sg_s=" + await signCookie(env, sid);
    const json = { fs_number: "20260902377278-7", state: "WI", debtor: "Debtor O'Neil" };
    const result = await call(copy.onRequestPost, env, { cookie, json });
    assert.deepEqual(await result.json(), { ok: true, status: "requested", used: 1, cap: 10 });
    assert.equal((await (await call(copy.onRequestPost, env, { cookie, json })).json()).duplicate, true);
    const list = await (await call(copies.onRequestGet, env, { bearer: "admin-a" })).json();
    assert.equal(list.requests[0].debtor, json.debtor);
    const updated = await (await call(copies.onRequestPost, env, { bearer: "admin-a", json: { key: list.requests[0].key, status: "done" } })).json();
    assert.equal(updated.request.status, "done"); assert.ok(updated.request.updated); assert.equal(updated.request.debtor, json.debtor); assert.ok(!("key" in updated.request));
    assert.deepEqual(await (await call(copy.onRequestGet, env, { cookie })).json(), { ok: true, loggedIn: true, requests: { [json.fs_number]: "done" }, used: 1, cap: 10 });
    await s.allow("dom", ["example.com", "gmail.com"]); await s.allow("eml", ["someone@gmail.com"]);
    assert.equal(await isRosterAddress(env, email), true); assert.equal(await isRosterAddress(env, "other@gmail.com"), false); assert.equal(await isRosterAddress(env, "someone@gmail.com"), true);
    await s.allow("dom", ["example.com"], true); assert.equal(await s.isAllowed("dom", "example.com"), false);
    env.ADMIN_EMAILS = email;
    assert.equal((await call(registrations.onRequestGet, env, { cookie })).status, 200);
    assert.equal((await call(foia.onRequestPost, env, { cookie, json: { rows: [] } })).status, 401);
    assert.equal(await s.bumpDl(iso().slice(0, 10), sid), 1); assert.equal(await s.bumpDl(iso().slice(0, 10), sid), 2);
  });
}

test("D1 session/decision/index expiry and atomic rate/counter updates", async () => {
  const env = envFor("d1"), s = authStore(env), now = iso();
  await s.createSession(sid, email, "Example", 30, "v2");
  const exp = await env.SIGNAL_DB.prepare("SELECT expires_at FROM session").first("expires_at"); assert.equal(await s.getSession(sid, exp), null);
  await s.putDecision(id, { email, next: "/signal/", ts: now }, 60);
  const dexp = await env.SIGNAL_DB.prepare("SELECT expires_at FROM decision_link").first("expires_at"); assert.equal(await s.getDecision(id, dexp), null);
  await s.copyIndex("fs", email, now, -1); assert.equal(await s.copyIndex("fs", email), null);
  const limits = await Promise.all(Array.from({ length: 5 }, () => s.rateLimited(email, now, 60))); assert.equal(limits.filter(x => !x).length, 1);
  assert.equal(await s.rateLimited(email, new Date(Date.parse(now) + 60000).toISOString(), 60), false);
  await Promise.all(Array.from({ length: 5 }, () => s.copyCount(email, "2026-09", true))); assert.equal(await s.copyCount(email, "2026-09"), 5);
});

test("offline migration preserves all record families, debtor, old sessions and idempotency", async () => {
  const ts = iso(), day = ts.slice(0, 10), month = ts.slice(0, 7), a = { ...acct(), created: ts }, fs = "20260902377278-7";
  const entries = [
    ["sg:acct:" + email, a], ["sg:sess:" + sid, { email, company: "Example", created: ts }],
    ["sg:allow:dom:example.com", 1], ["sg:allow:eml:" + email, 1],
    [`sg:reg:${ts}:${id}`, { ...a, id, ts, roster: false, updated: ts, source: "self", next: "/signal/" }],
    ["sg:dec:" + id, { email, ts, next: "/signal/" }],
    [`sg:ev:${ts}:1234abcd`, { type: "contact", email, ts, company: "Example", name: "O'Neil", page: "/contact/" }],
    [`sg:evd:${day}:${email}:ucc`, 2], [`sg:dl:${day}:${sid}`, 3],
    [`sg:creq:${ts}:abcdef123456`, { id: "abcdef123456", ts, email, company: "Example", fs_number: fs, state: "WI", status: "done", debtor: "O'Neil", updated: ts }],
    [`sg:creqi:${fs}:${email}`, ts], [`sg:cr:cnt:${email}:${month}`, 1],
    ["sg:tok:" + "a".repeat(48), { email, next: "/signal/", ttl: 900, created: ts }], ["sg:rl:" + email, 1],
    ["sg:admin:foia", { rows: [] }], ["hit:x", 1], ["contact:x", { text: "private" }], ["req:x", { text: "private" }],
  ].map(([name, value]) => ({ name, value: name.startsWith("sg:creqi:") ? value : JSON.stringify(value) }));
  entries.push({ name: "sg:acct:broken@example.com", value: "bad JSON" }, { name: "sg:sess:broken", value: "{}" });
  const input = JSON.stringify(entries), dir = mkdtempSync(join(tmpdir(), "signal-migrate-"));
  try {
    const file = join(dir, "export.json"); writeFileSync(file, input);
    const result = spawnSync(process.execPath, ["scripts/kv-to-d1.mjs", file], { encoding: "utf8" });
    assert.equal(result.status, 0); assert.match(result.stderr, /skipped/); assert.ok(!result.stdout.includes("bad JSON"));
    const stdin = spawnSync(process.execPath, ["scripts/kv-to-d1.mjs"], { input, encoding: "utf8" }); assert.equal(stdin.stdout, result.stdout);
    const db = new D1(); db.db.exec(result.stdout); db.db.exec(result.stdout);
    for (const [table, n] of Object.entries({ account: 1, session: 1, allow_entry: 2, registration: 1, decision_link: 1, event: 1, face_day: 1, dl_count: 1, copy_request: 1, copy_request_index: 1, copy_count: 1, magic_token: 0, rate_limit: 0 })) {
      assert.equal(await db.prepare(`SELECT count(*) AS n FROM ${table}`).first("n"), n, table);
    }
    assert.equal(await db.prepare("SELECT expires_at FROM session").first("expires_at"), new Date(Date.parse(ts) + 30 * 864e5).toISOString());
    assert.equal(await db.prepare("SELECT debtor FROM copy_request").first("debtor"), "O'Neil");
    assert.equal(await db.prepare("SELECT updated FROM copy_request").first("updated"), ts);
    assert.equal(await db.prepare("SELECT name FROM event").first("name"), "O'Neil");
    const env = { SIGNAL_DB: db, SIGNAL_SECRET: "old" }, cookie = `sg_s=${sid}.${await hmac("old", "sess:" + sid)}`;
    assert.equal((await currentSession(request(undefined, { cookie }), env)).email, email);
    assert.deepEqual((await authStore(env).listEvents())[0], { key: `sg:ev:${ts}:1234abcd`, type: "contact", email, ts, company: "Example", name: "O'Neil", page: "/contact/" });
    db.db.exec(result.stdout); assert.equal((await currentSession(request(undefined, { cookie }), env)).email, email);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("static: storage key literals stay in backend/FOIA and protected files are unchanged", () => {
  function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]); }
  for (const file of [...walk("functions/signal"), ...walk("functions/cockpit")]) {
    if (["functions/signal/_store.js", "functions/signal/admin/foia.js"].includes(file)) continue;
    assert.ok(!readFileSync(file, "utf8").includes("sg:"), file);
  }
  const changes = execFileSync("git", ["diff", "--name-only"], { encoding: "utf8" }).trim().split("\n");
  assert.ok(!changes.some(f => /^(functions\/(signal\/(hit|stats)\.js|services\/|contact\/|_turnstile\.js)|legal\/|assets\/|signal\/|cockpit\/data\/|_redirects$)/.test(f)));
  const old = execFileSync("git", ["show", "HEAD:functions/signal/_lib.js"], { encoding: "utf8" }), current = readFileSync("functions/signal/_lib.js", "utf8");
  assert.equal(current.slice(current.indexOf('// ── メール本文')), old.slice(old.indexOf('// ── メール本文')));
});
