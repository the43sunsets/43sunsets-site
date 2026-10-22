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
function marked(name) {
  const block = html.match(new RegExp(`/\\* ${name}:start \\*/([\\s\\S]*?)/\\* ${name}:end \\*/`))?.[1];
  assert.ok(block, `${name} marked block must exist`); return block;
}
const issuers = html.match(/^const ISSUERS = .*$/m)?.[0];
assert.ok(issuers);
const { topSplit, issuerOptions, programOptions, programLabel, passKind } = runInNewContext(
  [issuers, marked("subsidy-kind"), "({ topSplit, issuerOptions, programOptions, programLabel, passKind })"].join("\n")
);
const federal = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "NIH"];
const programs = ["93.310", "93.859", "93.003", "93.004", "93.005", "93.006", "93.007", "93.008", "93.009"];
const vocab = { issuer: { "連邦": federal.map((name, i) => [name, 9 - i, name === "NIH" ? 5 : 0]), "州": [["Indiana IEDC", 2, 1]] }, program: { NIH: programs.map((id, i) => [id, i ? null : "Trans-NIH", i === 8 ? 10 : 9 - i, 9 - i]) } };
const plain = value => JSON.parse(JSON.stringify(value));
test("SS-5: topSplit keeps eight entries and handles absent lists", () => {
  const nine = topSplit(federal, 8);
  assert.deepEqual(plain(nine.top), federal.slice(0, 8)); assert.deepEqual(plain(nine.rest), [federal[8]]);
  const eight = federal.slice(0, 8), result = topSplit(eight, 8);
  assert.deepEqual(plain(result), { top: eight, rest: [] });
  assert.deepEqual(plain(topSplit(undefined, 8)), { top: [], rest: [] });
});
test("SS-6: issuerOptions groups fixed top entries in issuer-level order", () => {
  const options = issuerOptions(vocab, new Set(), true);
  assert.deepEqual(plain(options.map(o => o.level)), ["連邦", "州"]);
  assert.deepEqual(plain(options[0].top), ["NIH", ...federal.slice(0, 7)]); assert.deepEqual([...options[0].rest], ["A8"]);
  assert.deepEqual(plain(options[1].top), ["Indiana IEDC"]); assert.equal(options[1].rest.size, 0);
  const all = issuerOptions(vocab, new Set(), false);
  assert.deepEqual(plain(all[0].top), federal.slice(0, 8)); assert.deepEqual([...all[0].rest], ["NIH"]);
  assert.deepEqual(plain(issuerOptions(vocab, new Set(["州"]), true).map(o => o.level)), ["州"]);
  const legacy = { issuer: { "連邦": [["X", 3], ["Y", 2]] } };
  for (const capexOnly of [true, false]) assert.deepEqual(plain(issuerOptions(legacy, null, capexOnly)[0].top), ["X", "Y"]);
});
test("SS-7: programLabel uses the name, number or missing-number label", () => {
  assert.equal(programLabel({ program: "93.310", name: "Trans-NIH" }), "Trans-NIH(93.310)");
  assert.equal(programLabel({ program: "93.859", name: null }), "CFDA 93.859");
  assert.equal(programLabel({ program: "", name: null }), "制度番号なし");
});
test("SS-8: kind filtering distinguishes issuers, levels, programs and other buckets", () => {
  const row = (issuer, program = "93.310", issuer_level = "連邦") => ({ issuer, program, issuer_level });
  const pass = (s, issuers = [], programs = [], v = vocab, capexOnly = true) => passKind(s, new Set(issuers), new Set(programs), v, capexOnly);
  assert.equal(pass(row("NIH"), ["NIH"]), true); assert.equal(pass(row("A1"), ["NIH"]), false);
  assert.equal(pass(row("A8"), ["連邦\u0000__other__"]), true);
  assert.equal(pass(row("NIH"), ["連邦\u0000__other__"]), false);
  assert.equal(pass(row("NIH"), ["連邦\u0000__other__"], [], vocab, false), true);
  assert.equal(pass(row("A8"), ["連邦\u0000__other__"], [], vocab, false), false);
  assert.equal(pass(row("A8", "", "州"), ["連邦\u0000__other__"]), false);
  // A state-level remainder must not match a federal-only selection either.
  const stateVocab = { ...vocab, issuer: { ...vocab.issuer, "州": Array.from({ length: 9 }, (_, i) => [`State ${i}`, 9 - i, 9 - i]) } };
  assert.equal(pass(row("State 8", "", "州"), ["連邦\u0000__other__"], [], stateVocab), false);
  assert.equal(pass(row("NIH"), [], ["NIH\u000093.310"]), true);
  assert.equal(pass(row("NIH", "93.859"), [], ["NIH\u000093.310"]), false);
  assert.equal(pass(row("A1"), [], ["NIH\u000093.310"]), false);
  assert.equal(pass(row("NIH", programs[8]), [], ["NIH\u0000__other__"]), true);
  assert.equal(pass(row("NIH", programs[0]), [], ["NIH\u0000__other__"]), false);
  assert.equal(pass(row("NIH", programs[8]), [], ["NIH\u0000__other__"], vocab, false), false);
  assert.equal(pass(row("NIH", programs[7]), [], ["NIH\u0000__other__"], vocab, false), true);
  assert.equal(pass({}), true);
  assert.deepEqual(plain(programOptions(vocab, "NIH", true).top[0]), { program: "93.310", name: "Trans-NIH" });
  assert.equal(programOptions(vocab, "NIH", false).top[0].program, programs[8]);
});

const card = html.match(/function cardHtml\(s\)\{[\s\S]*?\/\* card:end \*\/\s*\}/)?.[0];
const esc = html.match(/^function esc\(t\).*$/m)?.[0], fmtUsd = html.match(/^function fmtUsd\(v\).*$/m)?.[0];
assert.ok(card); assert.ok(esc); assert.ok(fmtUsd);
const cardHtml = runInNewContext([esc, fmtUsd, card, "cardHtml"].join("\n"), { window: {} });
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

function moreHarness(fetch, meta = { more_files: { IL: ["subsidies-more-IL-1.json", "subsidies-more-IL-2.json"], WI: "subsidies-more-WI-1.json" } }) {
  const nodes = { morefail: { textContent: "" }, capexonly: { checked: true, disabled: false } };
  const context = { META: meta, SIGNALS: [], sel: { state: new Set(["IL"]) }, fetch, document: { getElementById: id => nodes[id] } };
  const api = runInNewContext(marked("subsidies-more") + "\n({ loadMore, ensureMore, MORE_LOADED })", context);
  return { ...api, context, nodes };
}
test("SS-11: split loading is lazy, state-specific, ordered and cached with legacy support", async () => {
  const urls = [];
  const h = moreHarness(async (url, options) => { urls.push(url); assert.equal(options.cache, "no-store"); return { ok: true, json: async () => ({ signals: [{ id: url }] }) }; });
  await h.ensureMore(); assert.deepEqual(urls, []);
  await h.loadMore(["IL"]);
  assert.deepEqual(urls, ["/cockpit/data/subsidies-more-IL-1.json", "/cockpit/data/subsidies-more-IL-2.json"]);
  assert.equal(h.context.SIGNALS.length, 2);
  await h.loadMore(["IL"]); assert.equal(urls.length, 2);
  await h.loadMore([]); assert.equal(urls.length, 3); assert.equal(urls[2], "/cockpit/data/subsidies-more-WI-1.json");
  assert.equal(h.context.SIGNALS.length, 3);
  const old = moreHarness(async () => assert.fail("legacy metadata must not fetch"), {});
  old.nodes.capexonly.checked = false;
  await old.ensureMore(); assert.equal(old.nodes.capexonly.disabled, false);
});
test("SS-12: failed split loads show the state and remain retryable", async () => {
  let calls = 0;
  const h = moreHarness(async () => { calls++; return { ok: false, status: 500 }; });
  await h.loadMore(["IL"]);
  assert.equal(h.context.SIGNALS.length, 0);
  assert.equal(h.nodes.morefail.textContent, "残りの案件を読み込めませんでした: IL");
  assert.equal(h.MORE_LOADED.has("IL"), false);
  await h.loadMore(["IL"]); assert.equal(calls, 2);
});
test("SS-13: counts, labels, markers and every existing gate helper remain present", () => {
  const top = readFileSync(new URL("../signal/index.html", import.meta.url), "utf8");
  assert.ok(top.includes("n_capex"));
  assert.ok(top.includes("設備投資案件 ${capex.toLocaleString()} 件・連邦+州 3(IN・WI・IL)・市郡は順次"));
  assert.ok(!top.includes("連邦(州・市郡は順次)")); assert.ok(!top.includes("設備投資に関わる案件 ${major}"));
  for (const text of ["META.n_capex != null", "/* subsidies-more:start */", "/* card:start */", "/* subsidy-kind:start */", 'id="g-kind" hidden']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes("d.demo && META.n_major"));
  const gate = readFileSync(new URL("../functions/cockpit/data/[[path]].js", import.meta.url), "utf8");
  assert.ok(gate.includes("GATED_PREFIXES")); assert.ok(gate.includes("function demoMore("));
  for (const name of ["demoMacro", "demoNews", "demoCompany", "sessionLimited", "withHeaders"]) assert.equal((gate.match(new RegExp(`\\bfunction ${name}\\(`, "g")) || []).length, 1, name);
});
