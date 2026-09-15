import test from "node:test";
import assert from "node:assert/strict";
import { signCookie, verifyCookie } from "../functions/signal/_keys.js";

const sid = "a".repeat(32);

test("v0 cookies issued before key rotation remain valid with SIGNAL_SECRET", async () => {
  const cookie = await signCookie({ SIGNAL_SECRET: "legacy" }, sid);
  assert.match(cookie, /^[a-f0-9]{32}\.v0\.[a-f0-9]{40}$/);
  assert.equal(await verifyCookie({ SIGNAL_COOKIE_KEYS: "v1:a", SIGNAL_SECRET: "legacy" }, cookie), sid);
});

test("unlisted v0 cookies fail without SIGNAL_SECRET", async () => {
  const cookie = await signCookie({ SIGNAL_SECRET: "legacy" }, sid);
  assert.equal(await verifyCookie({ SIGNAL_COOKIE_KEYS: "v1:a" }, cookie), null);
});

test("v0 fallback rejects tampered signatures and rewritten key IDs", async () => {
  const env = { SIGNAL_COOKIE_KEYS: "v1:a", SIGNAL_SECRET: "legacy" };
  const cookie = await signCookie({ SIGNAL_SECRET: "legacy" }, sid);
  const tampered = cookie.slice(0, -1) + (cookie.endsWith("0") ? "1" : "0");
  assert.equal(await verifyCookie(env, tampered), null);
  assert.equal(await verifyCookie(env, cookie.replace(".v0.", ".v1.")), null);
  assert.equal(await verifyCookie(env, cookie.replace(".v0.", ".v9.")), null);
});

test("removed v1 cookies stay invalid even with SIGNAL_SECRET", async () => {
  const cookie = await signCookie({ SIGNAL_COOKIE_KEYS: "v1:a" }, sid);
  assert.equal(await verifyCookie({ SIGNAL_COOKIE_KEYS: "v2:b", SIGNAL_SECRET: "legacy" }, cookie), null);
});

test("explicitly listed v0 key takes precedence over SIGNAL_SECRET", async () => {
  const env = { SIGNAL_COOKIE_KEYS: "v1:a;v0:listed", SIGNAL_SECRET: "legacy" };
  const listed = await signCookie({ SIGNAL_COOKIE_KEYS: "v0:listed" }, sid);
  const legacy = await signCookie({ SIGNAL_SECRET: "legacy" }, sid);
  assert.equal(await verifyCookie(env, listed), sid);
  assert.equal(await verifyCookie(env, legacy), null);
});
