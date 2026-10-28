import test from "node:test";
import assert from "node:assert/strict";
import { setup, cookieFor, get, body } from "./_faces.mjs";
import { encodeCursor } from "../functions/signal/api/_q.js";
import { onRequestPost as logout } from "../functions/signal/logout.js";
const ids=rows=>new Set(rows.map(r=>r.id));
function seeds(f) {
  for(const face of ["permits","ucc","subsidies","hiring","news"]){
    f.meta(face);
    for(let i=0;i<5;i++)f.row(face,{id:`${face}-${i}`,ord:i,is_sample:i<2?1:0,period_date:i<2?"2026-03-11":"2026-09-20"});
    f.insert("f_count",{face,key:JSON.stringify(["OH",["A","B"]]),period:"older",n:42});
  }
}
for(const kind of ["d1","kv"]){
  test(`A7/A10 ${kind}: gate table face/meta/search/CSV rows and untrusted sample parameters`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);seeds(f);
    assert.deepEqual(await body(env,"face/permits"),await body(env,"face/permits",cookie));
    const response=await get(env,"face/permits");assert.equal(response.headers.get("x-signal-mode"),"demo");
    for(const face of ["ucc","subsidies","hiring"]){
      const live=await body(env,`face/${face}?period=365d&limit=2`,cookie);
      for(const q of ["","?period=90d","?period=1y",`?cursor=${live.next_cursor}`,`?cursor=${live.next_cursor}&period=365d&limit=50`, `?cursor=${encodeCursor(["amount",9e15,"9999-12-31","ZZZ"])}`,"?state=XX&sort=bogus&limit=0&period=3y"]){
        const result=await body(env,`face/${face}${q}`);assert.deepEqual(ids(result.rows),new Set([`${face}-0`,`${face}-1`]));assert.equal(result.next_cursor,null);
        for(let i=2;i<5;i++)assert.ok(!JSON.stringify(result).includes(`${face}-${i}`));
      }
      if(face!=="hiring") { const result=await body(env,`face/${face}?period=90d`,cookie); assert.ok(result.rows.every(row=>![`${face}-0`,`${face}-1`].includes(row.id))); }
    }
    for(const face of ["permits","ucc","subsidies","hiring","news"]){
      const full=await body(env,`meta/${face}`,cookie),demo=await body(env,`meta/${face}`);assert.deepEqual(demo,{...full,demo:full.f_meta.meta.demo});assert.ok(!Object.hasOwn(full,"demo"));assert.deepEqual(full.f_count[0].key,["OH",["A","B"]]);
    }
    f.db.exec("UPDATE f_meta SET meta='{}' WHERE face='permits'");assert.equal((await body(env,"meta/permits")).demo,null);
    f.db.exec(`UPDATE f_meta SET meta='{"demo":{"total":10,"sample":4}}' WHERE face='news'`);assert.deepEqual((await body(env,"meta/news")).demo,{total:10,sample:4});
    f.company();assert.deepEqual(await body(env,"search?q=Toyota"),await body(env,"search?q=Toyota",cookie));
    assert.deepEqual(Object.keys((await body(env,"search?q=Toyota")).rows[0]).sort(),["city","id","name","state"]);
    assert.equal((await get(env,"face/ucc.csv")).status,401);
    for(const path of ["face/permits","meta/permits","company/C-12103","search?q=Toyota","face/permits?unknown=1"]){
      for(const c of [undefined,cookie]){const r=await get(env,path,c); assert.equal(r.headers.get("vary"),"cookie");assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("content-type"),"application/json; charset=utf-8");assert.equal(r.headers.get("x-signal-mode"),c?"full":"demo");assert.equal(r.headers.get("x-signal-mark")?.length??0,c?8:0);}
    }
  });
  test(`A7 ${kind}: old samples survive default/explicit periods while authenticated rows do not`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);
    for(const face of ["ucc","subsidies","hiring"]){f.meta(face);f.row(face,{id:"old-sample",is_sample:1,period_date:"2026-03-11"});for(const q of ["","?period=90d","?period=1y"]){assert.equal((await body(env,`face/${face}${q}`)).rows.length,1);}assert.equal((await body(env,`face/${face}?period=90d`,cookie)).rows.length,0);}
  });
  test(`A8 ${kind}: news sample membership is per axis and ignores article is_sample`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("news");
    for(const [id,axes,samples] of [[1950,["us","OH"],["us"]],[2106,["us","IL"],["us","IL"]],[9999,["us","OH","IL"],[]]]){
      f.row("news",{id:String(id),ord:id,is_sample:1,card:{id}}); for(const axis of axes)f.tag("news","axis",axis,id);for(const axis of samples)f.tag("news","sample_axis",axis,id);
    }
    for(const [q,expected] of [["",[1950,2106]],["?axis=us",[1950,2106]],["?axis=OH",[]],["?axis=IL",[2106]],["?axis=OH&axis=IL",[2106]]])assert.deepEqual(ids((await body(env,`face/news${q}`)).rows),new Set(expected));
    assert.deepEqual(ids((await body(env,"face/news?axis=OH",cookie)).rows),new Set([1950,9999]));
    assert.equal((await get(env,"face/news?sample_axis=us")).status,400);
  });
  test(`A9 ${kind}: logout revokes the same cookie across face/CSV/company sections`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);seeds(f);f.company("C-12103",{ucc:[{id:"SECRET"}],timeline:[{face:"ucc",ref:"SECRET"},{face:"permits",ref:"PUBLIC"}]});
    assert.equal((await body(env,"face/ucc?period=365d",cookie)).rows.length,5);
    const out=await logout({env,request:new Request("https://example.test/signal/logout",{method:"POST",headers:{cookie}})});assert.ok(out.status<400);
    const r=await get(env,"face/ucc?period=365d",cookie);assert.equal(r.headers.get("x-signal-mode"),"demo");assert.equal((await r.json()).rows.length,2);
    assert.equal((await get(env,"face/ucc.csv",cookie)).status,401);assert.equal((await get(env,`company/C-12103?face=ucc&cursor=${encodeCursor(["ucc",0])}`,cookie)).status,403);
    const timeline=await body(env,"company/C-12103?face=timeline",cookie);assert.deepEqual(timeline.faces.timeline.rows,[{face:"permits",ref:"PUBLIC"}]);assert.equal(timeline.header.demo,true);assert.deepEqual(timeline.header.faces.ucc,{count:1,locked:true});assert.ok(!JSON.stringify(timeline).includes("SECRET"));
  });
}
