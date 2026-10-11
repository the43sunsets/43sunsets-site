import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { runInNewContext } from "node:vm";
import { D1 } from "./_d1.mjs";
import * as register from "../functions/signal/register.js";
import * as logout from "../functions/signal/logout.js";
await import("../signal/assets/join.js");
const api = globalThis.sgJoin;
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
function envFor() {
  return { SIGNAL_DB: new D1(), SIGNAL_COOKIE_KEYS: "v2:cookie-b;v1:cookie-a", SIGNAL_ADMIN_KEY: "admin-a", SIGNAL_INGEST_KEY: "ingest-i", MAIL_DEV: "1" };
}
function request(path, { form, method } = {}) {
  return new Request("https://example.test" + path, {
    method: method || (form ? "POST" : "GET"), body: form ? new URLSearchParams(form) : undefined
  });
}
const call = (handler, env, opts, path) => handler({ env, request: request(path, opts) });
const valid = { company: "Example", name: "Reader", email: "reader@example.com" };
function redirectIs(response, expected) {
  assert.equal(response.status, 303);
  const location = response.headers.get("location");
  assert.doesNotMatch(decodeURIComponent(location), /Example|Reader|@|not-an-email/);
  assert.equal(location, expected);
}
for (const [label, fields, expected] of [
  ["company", { company: "" }, "company"],
  ["all fields in order", { company: "", name: "", email: "" }, "company,name,email"],
  ["invalid email", { email: "not-an-email" }, "email"],
  ["preserved next", { company: "", next: "/signal/ucc/" }, "company&next=%2Fsignal%2Fucc%2F"]
]) {
  test("T-1 fields: " + label, async t => {
    const env = envFor(); t.after(() => env.SIGNAL_DB.db.close());
    redirectIs(await call(register.onRequestPost, env, { form: { ...valid, ...fields } }, "/signal/register"),
      "/signal/join/?state=invalid&why=fields&missing=" + expected);
  });
}
test("T-1 Turnstile rejection identifies verification and preserves next without values", async t => {
  const env = { ...envFor(), TURNSTILE_SECRET: "test-secret" };
  t.after(() => env.SIGNAL_DB.db.close());
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls++;
    assert.equal(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
    assert.equal(options.body.get("response"), "x");
    return Response.json({ success: false });
  });
  for (const next of [undefined, "/signal/ucc/"]) {
    const form = { ...valid, "cf-turnstile-response": "x", ...(next ? { next } : {}) };
    redirectIs(await call(register.onRequestPost, env, { form }, "/signal/register"),
      "/signal/join/?state=invalid&why=turnstile" + (next ? "&next=%2Fsignal%2Fucc%2F" : ""));
  }
  assert.equal(calls, 2);
});
for (const [label, next, expected] of [
  ["join", "/signal/join/", "/signal/join/"],
  ["external", "https://evil.example/", "/signal/"],
  ["absent", undefined, "/signal/"]
]) {
  test("T-1 logout: " + label, async t => {
    const env = envFor(); t.after(() => env.SIGNAL_DB.db.close());
    const response = await call(logout.onRequestPost, env,
      next ? { form: { next } } : { method: "POST" }, "/signal/logout");
    redirectIs(response, expected);
    assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  });
}
const storageStub = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};
test("T-2 draft round trip retains all five fields across repeated failures and clears", () => {
  const storage = storageStub(), draft = { ...valid, title: "President", interest: ["IL", "UCC"] };
  api.draftSave(storage, draft);
  assert.deepEqual(api.draftRestore(storage), draft);
  assert.deepEqual(api.draftRestore(storage), draft);
  api.draftClear(storage);
  assert.equal(api.draftRestore(storage), null);
  storage.setItem("sg-join-draft", "{");
  assert.equal(api.draftRestore(storage), null);
  storage.setItem("sg-join-draft", "{}");
  assert.equal(api.draftRestore(storage), null);
});
test("T-2 unavailable storage never blocks registration", () => {
  const fail = () => { throw new Error("unavailable"); };
  for (const storage of [null, { getItem: fail, setItem: fail, removeItem: fail }]) {
    assert.doesNotThrow(() => api.draftSave(storage, valid));
    assert.equal(api.draftRestore(storage), null);
    assert.doesNotThrow(() => api.draftClear(storage));
  }
});
test("T-2 invalid messages identify fields, verification and actual restoration", () => {
  assert.match(api.invalidMessage("fields", ["email"]), /会社のメールアドレス/);
  assert.doesNotMatch(api.invalidMessage("fields", ["email"]), /会社名/);
  for (const word of ["会社名", "氏名", "会社のメールアドレス"]) assert.ok(api.invalidMessage("fields", []).includes(word));
  assert.match(api.invalidMessage("turnstile", []), /確認/);
  assert.equal(api.invalidMessage(undefined, []), "会社名・氏名・会社のメールアドレスは必須です。もう一度ご入力ください。");
  for (const why of ["fields", "turnstile"]) {
    assert.doesNotMatch(api.invalidMessage(why, ["email"], false), /残っています/);
    assert.match(api.invalidMessage(why, ["email"], true), /残っています/);
  }
});
test("T-2 unknown field names are excluded and fall back to all labels", () => {
  const unknown = api.invalidMessage("fields", ["zzz"], true);
  for (const word of ["会社名", "氏名", "会社のメールアドレス"]) assert.ok(unknown.includes(word));
  assert.doesNotMatch(unknown, /undefined/);
  const mixed = api.invalidMessage("fields", ["email", "zzz"], false);
  assert.match(mixed, /会社のメールアドレス/);
  assert.doesNotMatch(mixed, /会社名|氏名|undefined|残っています/);
});
test("T-2 invalid fields get aria-invalid, red border class and first focus only", () => {
  const inputs = Object.fromEntries(["company", "name", "email"].map(name => [name, {
    attrs: {}, classes: new Set(), focused: 0,
    setAttribute(key, value) { this.attrs[key] = value; },
    get classList() { return this.classes; },
    focus() { this.focused++; }
  }]));
  const form = { querySelector: selector => inputs[selector.match(/name="([^"]+)"/)[1]] };
  api.markInvalid(form, ["company", "email"]);
  for (const name of ["company", "email"]) {
    assert.equal(inputs[name].attrs["aria-invalid"], "true");
    assert.ok(inputs[name].classes.has("bad"));
  }
  assert.equal(inputs.company.focused, 1); assert.equal(inputs.email.focused, 0);
  assert.deepEqual(inputs.name.attrs, {});
});
test("T-3 join loads helpers, preserves hidden styles and checks login state", () => {
  const page = read("signal/join/index.html"), js = read("signal/assets/join.js");
  assert.match(page, /<script src="\/signal\/assets\/join\.js" defer><\/script>/);
  assert.ok(!page.includes("sessionStorage")); assert.ok(js.includes("sessionStorage"));
  assert.match(js, /fetch\("\/signal\/me", \{cache:"no-store", credentials:"same-origin"\}\)/);
  assert.match(js, /!m\.loggedIn/);
  const style = page.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(style.includes("[hidden]{display:none!important}"));
  assert.ok(style.indexOf("label.f input.bad{border-color:var(--warn)}") > style.indexOf("label.f input:focus"));
});
test("T-3 login success offers benefits without automatic navigation; error branches unchanged", () => {
  const page = read("signal/login/index.html");
  const done = page.slice(page.indexOf("if (done) {"), page.indexOf("} else if (t) {"));
  assert.ok(!done.includes("location.replace"));
  for (const word of ["全件と当日分", "絞り込み", "企業カルテの全節", "見ていたページに戻る", "建設許可"]) assert.ok(done.includes(word));
  const old = execFileSync("git", ["show", "ab4b1303024:signal/login/index.html"], { encoding: "utf8" });
  for (const marker of ["else { body.innerHTML", "}).catch(() => { body.innerHTML"]) {
    const line = old.split("\n").find(line => line.trim().startsWith(marker));
    assert.ok(line); assert.ok(page.split("\n").includes(line));
  }
});
test("T-3 login success links stay distinct for default, UCC and permits destinations", async () => {
  const page = read("signal/login/index.html");
  const script = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(source => source.includes("if (done)"));
  for (const [next, expected] of [["/signal/", ["/signal/permits/", "/signal/"]], ["/signal/ucc/", ["/signal/ucc/", "/signal/permits/"]], ["/signal/permits/", ["/signal/permits/", "/signal/"]]]) {
    const body = { innerHTML: "" };
    runInNewContext(script, {
      URLSearchParams, location: { search: "?done=1&next=" + encodeURIComponent(next) },
      document: { getElementById: () => body },
      fetch: async () => ({ json: async () => ({ loggedIn: true, company: "<b>X</b> Co" }) })
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual([...body.innerHTML.matchAll(/href="([^"]+)"/g)].map(match => match[1]), expected);
    assert.ok(body.innerHTML.includes("&lt;b&gt;X&lt;/b&gt; Co"));
  }
});
test("T-4 G-5 script enumeration includes join.js", () => {
  const files = readdirSync(new URL("../signal/assets/", import.meta.url))
    .filter(name => name.endsWith(".js")).map(name => "signal/assets/" + name);
  assert.ok(files.includes("signal/assets/join.js"));
});

async function joinPage(search, fetch) {
  const element = () => ({
    innerHTML: "", hidden: false, value: "", checked: false,
    attrs: {}, classList: new Set(), listeners: {},
    setAttribute(key, value) { this.attrs[key] = value; },
    focus() { this.focused = true; },
    addEventListener(type, listener) { this.listeners[type] = listener; }
  });
  const inputs = Object.fromEntries(["company", "name", "title", "email"].map(name => [name, element()]));
  const interests = ["IL", "UCC"].map(value => Object.assign(element(), { value }));
  const form = element(), box = element(), next = element();
  form.querySelector = selector => inputs[selector.match(/name="([^"]+)"/)[1]] || null;
  form.querySelectorAll = selector => selector.endsWith(":checked") ? interests.filter(input => input.checked) : interests;
  const document = Object.assign(element(), {
    getElementById: id => ({ regform: form, state: box, next })[id] || null,
    querySelector: form.querySelector,
    querySelectorAll: form.querySelectorAll
  });
  const storage = storageStub();
  api.draftSave(storage, { ...valid, title: "President", interest: ["UCC"] });
  runInNewContext(read("signal/assets/join.js"), {
    document, location: { search }, sessionStorage: storage, fetch, URLSearchParams
  });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { form, box, storage };
}
test("T-5 sent clears the saved draft and hides the registration form", async () => {
  const { form, storage } = await joinPage("?state=sent", async () => ({ json: async () => ({ loggedIn: false }) }));
  assert.equal(storage.getItem("sg-join-draft"), null);
  assert.equal(form.hidden, true);
});
test("T-5 logged-in company is escaped in the registration page", async () => {
  const { form, box } = await joinPage("?state=invalid&why=fields&missing=email",
    async () => ({ json: async () => ({ loggedIn: true, company: "<b>X</b>" }) }));
  assert.equal(form.hidden, true);
  assert.ok(box.innerHTML.includes("&lt;b&gt;X&lt;/b&gt;"));
  assert.ok(!box.innerHTML.includes("<b>X</b>"));
});
test("T-5 failed login-state fetch keeps the form and field error visible", async () => {
  const { form, box } = await joinPage("?state=invalid&why=fields&missing=email",
    async () => { throw new Error("unavailable"); });
  assert.notEqual(form.hidden, true);
  assert.match(box.innerHTML, /会社のメールアドレス/);
});
