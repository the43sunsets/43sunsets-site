// Keys are hit:<UTC day>:<vid>, listed in chronological order by KV.
// First-touch attribution uses only the visitor's first key within the since window.
import test from "node:test";
import assert from "node:assert/strict";
import { KV } from "./_kv.mjs";
import * as stats from "../functions/signal/stats.js";

async function fixture() {
  const kv = new KV();
  for (const [day, vid, src] of [
    ["2026-09-01", "aaaaaaaa", "w1"],
    ["2026-10-02", "bbbbbbbb", "direct"],
    ["2026-10-03", "bbbbbbbb", "w1"],
    ["2026-10-02", "cccccccc", "w1"],
    ["2026-10-05", "cccccccc", "w1"],
    ["2026-10-04", "dddddddd", "ref"],
  ]) {
    await kv.put(`hit:${day}:${vid}`, JSON.stringify({ src, path: "/signal/", ts: `${day}T00:00:00.000Z` }));
  }
  await kv.put("hit:2026-10-06:eeeeeeee", "oops");
  const reads = [];
  const get = kv.get.bind(kv);
  kv.get = async (key, type) => { reads.push([key, type]); return get(key, type); };
  return { kv, reads };
}

function call(env, query = "?since=2026-10-01") {
  return stats.onRequestGet({ request: new Request(`https://example.test/signal/stats${query}`), env });
}

test("T-1: stats attributes every in-window visitor to first-touch source", async () => {
  const { kv, reads } = await fixture();
  const res = await call({ BEACON_REQUESTS: kv });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    ok: true, since: "2026-10-01", U: 4, R: 2, D: 6,
    list: { U: 1, R: 1 },
    bySrc: { direct: { U: 1, R: 1 }, w1: { U: 1, R: 1 }, ref: { U: 1, R: 0 }, unknown: { U: 1, R: 0 } },
    byDay: { "2026-10-02": 2, "2026-10-03": 1, "2026-10-04": 1, "2026-10-05": 1, "2026-10-06": 1 },
    sampledForSrc: 4, srcComplete: true, retentionDays: 90,
  });
  assert.deepEqual(reads, [
    ["hit:2026-10-02:bbbbbbbb", "json"],
    ["hit:2026-10-02:cccccccc", "json"],
    ["hit:2026-10-04:dddddddd", "json"],
    ["hit:2026-10-06:eeeeeeee", "json"],
  ]);
});

test("T-2: source read cap preserves visitor and day totals", async () => {
  const { kv, reads } = await fixture();
  const result = await (await call({ BEACON_REQUESTS: kv, STATS_SRC_READ_CAP: "2" })).json();
  assert.equal(result.sampledForSrc, 2);
  assert.equal(result.srcComplete, false);
  assert.deepEqual({ U: result.U, R: result.R, D: result.D }, { U: 4, R: 2, D: 6 });
  assert.deepEqual(result.byDay, { "2026-10-02": 2, "2026-10-03": 1, "2026-10-04": 1, "2026-10-05": 1, "2026-10-06": 1 });
  assert.deepEqual(result.bySrc, { direct: { U: 1, R: 1 }, w1: { U: 1, R: 1 }, unknown: { U: 2, R: 0 } });
  assert.deepEqual(result.list, { U: 1, R: 1 });
  assert.deepEqual(reads, [["hit:2026-10-02:bbbbbbbb", "json"], ["hit:2026-10-02:cccccccc", "json"]]);
});

test("T-3: omitted since defaults to 90 days ago", async (t) => {
  const now = Date.now();
  t.mock.method(Date, "now", () => now);
  const dayAgo = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const kv = new KV();
  for (const [n, vid] of [[100, "aaaaaaaa"], [5, "bbbbbbbb"]]) {
    await kv.put(`hit:${dayAgo(n)}:${vid}`, JSON.stringify({ src: "direct", path: "/signal/", ts: `${dayAgo(n)}T00:00:00.000Z` }));
  }
  const result = await (await call({ BEACON_REQUESTS: kv }, "")).json();
  assert.equal(result.U, 1);
  assert.equal(result.since, dayAgo(90));
});

test("T-4: missing KV binding returns 503", async () => {
  const res = await call({});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
});

test("T-5: stats follows cursors across all seven fixture keys", async () => {
  const { kv } = await fixture();
  const first = await kv.list({ prefix: "hit:", limit: 1000 });
  assert.equal(kv.data.size, 7);
  assert.equal(first.keys.length, 2);
  assert.equal(first.list_complete, false);
  const result = await (await call({ BEACON_REQUESTS: kv })).json();
  assert.equal(result.D, 6);
});
