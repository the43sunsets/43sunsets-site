import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { setup, cookieFor, get } from "./_faces.mjs";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/faces/${name}.json`,import.meta.url),"utf8"));
// largest-50-subsidies: git show 18e4347:cockpit/data/subsidies.json, signals sorted by JSON.stringify(row).length descending, first 50.
// company-C-2462-first: git show 18e4347:cockpit/data/companies/C-2462.json, header removes timeline/items and adds n_items/n_timeline; first 50 items per section.
// largest-50-company-items: git ls-tree + git cat-file --batch at 18e4347 for all companies/C-*.json, all faces.grants.items sorted by JSON.stringify(item).length descending, first 50.
for(const kind of ["d1","kv"]){
  test(`A17 ${kind}: three real-data responses fit gzip 153600 bytes`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("subsidies");
    fixture("largest-50-subsidies").forEach((original,ord)=>{const card={...original};for(const col of FACE_SPEC.faces.subsidies.card_exclude)delete card[col];f.row("subsidies",{id:String(original.id),ord,card});});
    const company=fixture("company-C-2462-first");f.company("C-2462",company.faces);f.db.prepare("UPDATE company SET header=? WHERE id=?").run(JSON.stringify(company.header),"C-2462");
    f.company("C-1",{grants:fixture("largest-50-company-items")});
    for(const path of ["face/subsidies?period=365d&limit=50","company/C-2462","company/C-1?face=grants"]){const r=await get(env,path,cookie);assert.equal(r.status,200);const bytes=gzipSync(await r.text()).length;t.diagnostic(`${path}: gzip ${bytes} bytes`);assert.ok(bytes<=153600);}
  });
}
test("A17: record 44090 permit amount_desc and unc default sort page latency",async t=>{
  const env=setup(t),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("permits");
  f.db.exec("BEGIN");for(let i=0;i<44090;i++)f.row("permits",{id:`P-${i}`,ord:i,amount:i%13===0?null:i*100,unc:i%2,new_date:`2026-09-${String(i%27+1).padStart(2,"0")}`});f.db.exec("COMMIT");
  for(const path of ["face/permits?sort=amount_desc&period=365d","face/permits?unc=1&period=365d"]){const start=performance.now(),r=await get(env,path,cookie);const json=await r.json(),elapsed=performance.now()-start;assert.equal(r.status,200);assert.equal(json.rows.length,8);t.diagnostic(`${path}: ${elapsed.toFixed(3)} ms (node:sqlite, 44090 rows)`);}
});
