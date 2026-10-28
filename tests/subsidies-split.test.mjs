import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { KV } from "./_kv.mjs";
import { store, createSession } from "../functions/signal/_lib.js";
import { onRequestGet as data } from "../functions/cockpit/data/[[path]].js";

const day = "2026-10-20", email = "reader@example.test";
function setup(t) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${day}T12:00:00Z`) });
  const env = { SIGNAL_SECRET: "test-secret", BEACON_REQUESTS: new KV() };
  const cache = new Map(), oldCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  t.after(() => { if (oldCaches) Object.defineProperty(globalThis, "caches", oldCaches); else delete globalThis.caches; });
  globalThis.caches = { default: {
    async match(req) { return cache.get(req.url)?.clone(); },
    async put(req, response) { cache.set(req.url, response.clone()); },
  } };
  return env;
}
const cookieFor = async env => (await createSession(env, { email, company: "Example" })).split(";")[0];
function getData(env, cookie, path, body, status = 200) {
  return data({ env, request: new Request(`https://example.test/cockpit/data/${path}`, { headers: cookie ? { cookie } : {} }),
    params: { path: path.split("/") }, next: async () => Response.json(body, { status }) });
}
const moreBody = {
  generated_at: "2026-10-20T08:00:00+00:00", state: "IL", part: 1, parts: 2,
  signals: [{ id: "S-1", date: "2026-01-01", recipient: "Old LLC", masked: false, category: "未分類", issuer_level: "連邦" }],
};
test("SS-1: anonymous split files return an empty sample even for old rows", async t => {
  const response = await getData(setup(t), null, "subsidies-more-IL-1.json", moreBody);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-signal-mode"), "demo");
  assert.deepEqual(await response.json(), { demo: true, generated_at: moreBody.generated_at, state: "IL", part: 1, parts: 2, signals: [] });
});
test("SS-2: registered split files preserve data and log the subsidies face", async t => {
  const env = setup(t), response = await getData(env, await cookieFor(env), "subsidies-more-IL-1.json", moreBody);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-signal-mode"), "full");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), moreBody);
  assert.deepEqual(await store(env).listFaceDays(), [{ day, email, face: "subsidies", n: 1 }]);
});
test("SS-3: missing files preserve 404 and the prefix requires its trailing hyphen", async t => {
  const env = setup(t);
  const missing = await getData(env, null, "subsidies-more-IL-1.json", { error: "missing" }, 404);
  assert.equal(missing.status, 404);
  const response = await getData(env, null, "subsidies-more.json", moreBody);
  assert.equal(response.headers.get("x-signal-mode"), null);
  assert.deepEqual(await response.json(), moreBody);
});
test("SS-4: exported counts win and legacy major and capex counts differ", async t => {
  const env = setup(t);
  const signals = [["製造能力の増強", "連邦"], ["未分類", "連邦"], ["未分類", "州"]].map(([category, issuer_level], i) => ({ id: `S-${i}`, date: "2026-01-01", recipient: `Company ${i}`, masked: false, category, issuer_level }));
  for (const [meta, major, capex] of [[{ n: 9, n_major: 7, n_capex: 3 }, 7, 3], [{ n: 9 }, 2, 1]]) {
    const body = await (await getData(env, null, "subsidies.json", { meta, signals })).json();
    assert.equal(body.meta.n_major, major); assert.equal(body.meta.n_capex, capex);
    assert.equal(body.signals.length, 3);
  }
});

const html = readFileSync(new URL("../signal/subsidies/index.html", import.meta.url), "utf8");
test("SS-5–SS-8: the retired issuer/program controls are absent", () => {
  for (const text of ["subsidy-kind", "ISSUERS", "g-kind"]) assert.ok(!html.includes(text), text);
});
const cardSource = readFileSync(new URL("../signal/assets/card-subsidies.js", import.meta.url), "utf8");
const cardHtml = runInNewContext(cardSource + "; faceCards.subsidies", {});
const cardRow = { state: "IL", city: "Skokie", recipient: "Acme LLC", company_id: "C-1", kind: "grant", kind_label: "助成", issuer_level: "連邦", issuer: "NIH", program: "93.310", program_name: "Trans-NIH", amount: 1500000, stage: "承認", date: "2026-09-01", start_date: "2026-10-01", end_date: "2027-09-30", category: "製造能力の増強", industry: "医薬・ライフサイエンス", url: "https://example.test/r", description: "VERBATIM-TEXT", description_ja: "逐語の和訳", infer: "推論の本文", jobs_retained: 12 };
test("SS-9: card first tier contains public fields and details contain narrative", () => {
  const [front, detail] = cardHtml(cardRow).split('<details class="detail"');
  assert.ok(detail);
  for (const text of ["Acme LLC", "$1.5M", "2026-09-01", "連邦・NIH", "Trans-NIH(93.310)", "Skokie", "承認"]) assert.ok(front.includes(text), text);
  for (const text of ["逐語の和訳", "VERBATIM-TEXT", "badge-infer", "履行期間 <span", "雇用の維持 <span", "記録 ↗"]) assert.ok(!front.includes(text), text);
  for (const text of ["逐語の和訳", "VERBATIM-TEXT", "推論の本文", "履行期間", "2027-09-30", "雇用の維持", "12", "記録 ↗", "$1,500,000"]) assert.ok(detail.includes(text), text);
});
test("SS-10: sparse cards retain facts and omit absent detail fields", () => {
  const row = { ...cardRow };
  for (const key of ["description", "description_ja", "infer", "summary", "url", "start_date", "jobs_retained", "program_name"]) delete row[key];
  const result = cardHtml(row);
  assert.ok(result.includes('<details class="detail"'));
  assert.ok(result.split('<details class="detail"')[0].includes("CFDA 93.310"));
  assert.ok(result.includes('<summary>詳細(記録の本文・履行期間・記録へのリンク・推論)</summary>'));
  for (const text of ["badge-infer", "履行期間 <span", "雇用の維持 <span", "↗", 'class="verbatim"']) assert.ok(!result.includes(text), text);
});

test("SS-11: split-file loading has been removed", () => {
  assert.ok(!html.includes("loadMore")); assert.ok(!html.includes("subsidies-more"));
});
test("SS-12: failures have no split-file fallback", () => {
  assert.ok(!html.includes("ensureMore")); assert.ok(!html.includes("morefail"));
  assert.ok(html.includes("faceApi.unavailable()"));
});
test("SS-13: counts, labels, markers and every existing gate helper remain present", () => {
  for (const text of ["META.n_capex != null", "/* subsidies-more:start */", "/* subsidy-kind:start */", 'id="g-kind" hidden']) assert.ok(!html.includes(text), text);
  assert.ok(cardSource.includes("/* card:start */"));
  assert.ok(!html.includes("d.demo && META.n_major"));
  const gate = readFileSync(new URL("../functions/cockpit/data/[[path]].js", import.meta.url), "utf8");
  assert.ok(gate.includes("GATED_PREFIXES")); assert.ok(gate.includes("function demoMore("));
  for (const name of ["demoMacro", "demoNews", "demoCompany", "withHeaders"]) assert.equal((gate.match(new RegExp(`\\bfunction ${name}\\(`, "g")) || []).length, 1, name);
  assert.equal((readFileSync(new URL("../functions/signal/_rate.js", import.meta.url), "utf8").match(/export async function sessionLimited\(/g) || []).length, 1, "sessionLimited in _rate.js");
});
