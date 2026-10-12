import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { D1 } from "./_d1.mjs";
import { KV } from "./_kv.mjs";
import { authStore } from "../functions/signal/_store.js";
import { createSession, page } from "../functions/signal/_lib.js";
import * as session from "../functions/signal/session.js";

const email = "reader@example.com";
const acct = () => ({ email, company: "Example", name: "Reader", status: "active", created: new Date().toISOString() });
function envFor(kind) {
  return { ...(kind === "d1" ? { SIGNAL_DB: new D1() } : {}), BEACON_REQUESTS: new KV(), SIGNAL_COOKIE_KEYS: "v2:cookie-b;v1:cookie-a", SIGNAL_ADMIN_KEY: "admin-a", SIGNAL_INGEST_KEY: "ingest-i", MAIL_DEV: "1" };
}
function request(path = "/signal/session", { form, cookie, method } = {}) {
  const headers = {}; if (cookie) headers.cookie = cookie;
  return new Request("https://example.test" + path, {
    method: method || (form ? "POST" : "GET"), headers, body: form ? new URLSearchParams(form) : undefined
  });
}
const call = (handler, env, opts, path) => handler({ env, request: request(path, opts) });

for (const kind of ["d1", "kv"]) {
  for (const [label, tokenNext, formNext, expected] of [
    ["a: actual login form preserves UCC", "/signal/ucc/", "/signal/", "%2Fsignal%2Fucc%2F"],
    ["b: token default wins over form destination", "/signal/", "/signal/permits/", "%2Fsignal%2F"],
    ["c: absent form destination remains compatible", "/signal/ucc/", undefined, "%2Fsignal%2Fucc%2F"]
  ]) {
    test(`T-1 ${kind}: ${label}`, async t => {
      const env = envFor(kind), s = authStore(env);
      t.after(() => env.SIGNAL_DB?.db.close());
      await s.putAccount(acct());
      const tok = await s.issueToken(email, tokenNext, 900);
      const form = { t: tok, ...(formNext === undefined ? {} : { next: formNext }) };
      const response = await call(session.onRequestPost, env, { form });
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), "/signal/login/?done=1&next=" + expected);
    });
  }

  test(`T-2 ${kind}: a: expired link without cookie keeps the original page`, async t => {
    const env = envFor(kind);
    t.after(() => env.SIGNAL_DB?.db.close());
    const response = await call(session.onRequestPost, env, { form: { t: "0".repeat(48) } });
    assert.equal(response.status, 410);
    const body = await response.text();
    assert.doesNotMatch(body, /すでにログイン中です/);
    assert.match(body, /新しいリンクを受け取る/);
    const original = page("リンクの期限が切れています", `<p>このログイン用リンクは期限切れか、すでに使われています。</p><p><a class="btn" href="/signal/login/">新しいリンクを受け取る</a></p>`, 410);
    assert.equal(body, await original.text());
  });

  test(`T-2 ${kind}: b: expired link with valid cookie offers Signal`, async t => {
    const env = envFor(kind);
    t.after(() => env.SIGNAL_DB?.db.close());
    for (const [company, expected] of [["<b>Example</b>", "&lt;b&gt;Example&lt;/b&gt;"], ["", email]]) {
      const cookie = (await createSession(env, { ...acct(), company })).split(";")[0];
      const response = await call(session.onRequestPost, env, { form: { t: "0".repeat(48) }, cookie });
      assert.equal(response.status, 410);
      const body = await response.text();
      assert.ok(body.includes(`すでにログイン中です(${expected})。`));
      assert.match(body, /<a class="btn alt" href="\/signal\/">Signal へ進む<\/a>/);
      assert.match(body, /新しいリンクを受け取る/);
      assert.doesNotMatch(body, /<b>Example<\/b>/);
    }
  });
}

test("T-3: logged-in registration hides notes directly under main", () => {
  const source = readFileSync(new URL("../signal/assets/join.js", import.meta.url), "utf8");
  const loggedIn = source.slice(source.indexOf('root.fetch("/signal/me"'), source.indexOf('}).catch(() => {});'));
  assert.match(loggedIn, /if \(succeeded \|\| !m \|\| !m\.loggedIn\) return;\s*form\.hidden = true;\s*root\.document\.querySelectorAll\("main > p\.note"\)\.forEach\(n => \{ n\.hidden = true; \}\);/);
});
