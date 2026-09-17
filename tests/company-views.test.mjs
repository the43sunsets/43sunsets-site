import test from "node:test";
import assert from "node:assert/strict";
import { D1 } from "./_d1.mjs";
import { KV } from "./_kv.mjs";
import { store, createSession, logCompanyView } from "../functions/signal/_lib.js";
import { onRequestGet as data } from "../functions/cockpit/data/[[path]].js";
import { onRequestGet as companyViews } from "../functions/signal/admin/company-views.js";

const day = "2026-09-16", email = "reader@example.test";
const body = {
  id: "C-12103", faces: { permits: { count: 1, items: [{ id: "permit" }] }, ucc: { count: 1, items: [{ id: "private" }] } },
  timeline: [{ face: "permits" }, { face: "ucc" }],
};
function setup(t, kind) {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(`${day}T12:00:00Z`) });
  const env = { SIGNAL_SECRET: "test-secret", BEACON_REQUESTS: new KV() };
  if (kind === "d1") { env.SIGNAL_DB = new D1(); t.after(() => env.SIGNAL_DB.db.close()); }
  const cache = new Map(), oldCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
  t.after(() => { if (oldCaches) Object.defineProperty(globalThis, "caches", oldCaches); else delete globalThis.caches; });
  globalThis.caches = { default: {
    async match(req) { return cache.get(req.url)?.clone(); },
    async put(req, response) { cache.set(req.url, response.clone()); },
  } };
  return env;
}
const cookieFor = async (env, address = email) => (await createSession(env, { email: address, company: "Example" })).split(";")[0];
function getData(env, cookie, path = "companies/C-12103.json") {
  return data({ env, request: new Request(`https://example.test/cockpit/data/${path}`, { headers: cookie ? { cookie } : {} }),
    params: { path: path.split("/") }, next: async () => Response.json(body) });
}
function getViews(env, { since, bearer = "test-secret", cookie } = {}) {
  const headers = {}; if (bearer) headers.authorization = `Bearer ${bearer}`; if (cookie) headers.cookie = cookie;
  return companyViews({ env, request: new Request(`https://example.test/signal/admin/company-views${since ? `?since=${since}` : ""}`, { headers }) });
}
const twoCompanies = () => ["C-12103", "C-555"].map(company_id => ({ day, company_id, viewers: 1, n: 1 }));

for (const kind of ["d1", "kv"]) {
  test(`${kind}: company GET records the exact public ID and preserves face count and full response`, async t => {
    const env = setup(t, kind), cookie = await cookieFor(env), response = await getData(env, cookie);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-signal-mode"), "full");
    assert.equal(response.headers.get("x-signal-mark"), (await store(env).listSessions())[0].sid.slice(0, 8));
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("vary"), "cookie");
    assert.deepEqual(await response.json(), body);
    assert.deepEqual(await store(env).listFaceDays(), [{ day, email, face: "company", n: 1 }]);
    assert.deepEqual(await store(env).listCompanyViews(), [{ day, company_id: "C-12103", viewers: 1, n: 1 }]);
    if (kind === "d1") {
      assert.deepEqual((await env.SIGNAL_DB.prepare("SELECT * FROM company_view").all()).results, [{ day, email, company_id: "C-12103", n: 1 }]);
    } else {
      const key = `sg:cvd:${day}:${email}:C-12103`;
      assert.equal(await env.BEACON_REQUESTS.get(key), "1");
      assert.equal(env.BEACON_REQUESTS.options.get(key).expirationTtl, 45 * 86400);
    }
  });

  test(`${kind}: repeat visits and distinct viewers aggregate independently`, async t => {
    const env = setup(t, kind), cookie = await cookieFor(env);
    await getData(env, cookie); await getData(env, cookie);
    assert.deepEqual(await store(env).listCompanyViews(), [{ day, company_id: "C-12103", viewers: 1, n: 2 }]);
    await getData(env, await cookieFor(env, "another:reader@example.test"));
    assert.deepEqual(await store(env).listCompanyViews(), [{ day, company_id: "C-12103", viewers: 2, n: 3 }]);
  });

  test(`${kind}: two company GETs retain both IDs without substitution`, async t => {
    const env = setup(t, kind), cookie = await cookieFor(env);
    await getData(env, cookie, "companies/C-555.json"); await getData(env, cookie);
    assert.deepEqual(await store(env).listCompanyViews(), twoCompanies());
    assert.deepEqual(await store(env).listFaceDays(), [{ day, email, face: "company", n: 2 }]);
  });

  test(`${kind}: anonymous company GET stays demo and does not record views`, async t => {
    const env = setup(t, kind), response = await getData(env);
    assert.equal(response.status, 200); assert.equal(response.headers.get("x-signal-mode"), "demo");
    assert.equal(response.headers.get("x-signal-mark"), null); assert.equal(response.headers.get("vary"), "cookie");
    assert.deepEqual(await response.json(), { ...body, demo: true,
      faces: { permits: body.faces.permits, ucc: { count: 1, locked: true }, hiring: { count: 0, locked: true }, grants: { count: 0, locked: true }, news: { count: 0, locked: true } },
      timeline: [{ face: "permits" }],
    });
    assert.deepEqual(await store(env).listCompanyViews(), []); assert.deepEqual(await store(env).listFaceDays(), []);
    if (kind === "d1") assert.equal(await env.SIGNAL_DB.prepare("SELECT COUNT(*) AS n FROM company_view").first("n"), 0);
  });

  test(`${kind}: admin API returns two companies without email and requires authorization`, async t => {
    const env = setup(t, kind), cookie = await cookieFor(env);
    await getData(env, cookie); await getData(env, cookie, "companies/C-555.json");
    const response = await getViews(env), result = await response.json();
    assert.equal(response.status, 200);
    assert.ok(result.views.every(row => !Object.hasOwn(row, "email")));
    assert.deepEqual(result, { ok: true, since: "2026-09-13", views: twoCompanies() });
    assert.deepEqual(result.views, await store(env).listCompanyViews());
    for (const options of [{ bearer: "" }, { bearer: "wrong" }, { bearer: "", cookie }]) {
      const denied = await getViews(env, options);
      assert.equal(denied.status, 401); assert.deepEqual(await denied.json(), { ok: false, error: "unauthorized" });
    }
    env.ADMIN_EMAILS = email;
    assert.deepEqual(await (await getViews(env, { bearer: "", cookie })).json(), result);
  });

  test(`${kind}: daily aggregates sort by day and company and since is inclusive`, async t => {
    const env = setup(t, kind), s = store(env);
    await s.bumpCompanyView(day, email, "C-555");
    await s.bumpCompanyView("2026-09-12", email, "C-555");
    await s.bumpCompanyView(day, email, "C-12103");
    await s.bumpCompanyView("2026-09-13", email, "C-555");
    const all = [{ day: "2026-09-12", company_id: "C-555", viewers: 1, n: 1 },
      { day: "2026-09-13", company_id: "C-555", viewers: 1, n: 1 }, ...twoCompanies()];
    assert.deepEqual(await s.listCompanyViews(), all);
    assert.deepEqual((await (await getViews(env)).json()).views, all.slice(1));
    assert.deepEqual(await (await getViews(env, { since: day })).json(), { ok: true, since: day, views: twoCompanies() });
    assert.deepEqual(await s.listCompanyViews("2026-09-17"), []);
  });

  test(`${kind}: logCompanyView rejects invalid IDs and missing email; other faces do not log companies`, async t => {
    const env = setup(t, kind);
    for (const id of ["companies/C-12103.json", "12103", "c-12103", "C-", "C-12x", " C-12103", "C-12103\n", "C-12103/", null, undefined]) {
      await logCompanyView(env, email, id);
    }
    await logCompanyView(env, "", "C-12103");
    await getData(env, await cookieFor(env), "ucc.json");
    assert.deepEqual(await store(env).listCompanyViews(), []);
    await logCompanyView(env, email, "C-12103");
    assert.deepEqual(await store(env).listCompanyViews(), [{ day, company_id: "C-12103", viewers: 1, n: 1 }]);
  });
}

test("company views: missing store returns 503; logging is best effort", async () => {
  const response = await getViews({ SIGNAL_SECRET: "test-secret" });
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { ok: false, error: "no store" });
  assert.equal(await logCompanyView({}, email, "C-12103"), undefined);
  const env = { SIGNAL_DB: { prepare() { throw new Error("unavailable"); } } };
  assert.equal(await logCompanyView(env, email, "C-12103"), undefined);
});
