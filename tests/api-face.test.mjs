import test from "node:test";
import assert from "node:assert/strict";
import { setup, cookieFor, get, body, walk } from "./_faces.mjs";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
import { encodeCursor } from "../functions/signal/api/_q.js";
const ids = rows => rows.map(x => x.id);
for (const kind of ["d1", "kv"]) {
  test(`A2/A12 ${kind}: generated date boundary and tied keyset pages cover exactly 20 rows`, async t => {
    const env = setup(t, kind, "2026-09-28T12:00:00Z"), f = env.FACES_DB, cookie = await cookieFor(env); f.meta("permits");
    for (let i=0;i<20;i++) f.row("permits", { id: `P${i}`, ord: i, amount: Math.floor(i/3), period_date: i<12 ? "2026-06-29" : i<18 ? "2026-06-28" : null, new_date: i<18 ? "2026-09-01" : null });
    const first = await body(env,"face/permits",cookie), second = await body(env,`face/permits?cursor=${first.next_cursor}`,cookie);
    assert.equal(first.rows.length,8); assert.equal(second.rows.length,4); assert.equal(second.next_cursor,null);
    assert.deepEqual(ids([...first.rows,...second.rows]), [9,10,11,6,7,8,3,4,5,0,1,2].map(i=>`P${i}`));
    const rows = await walk(env,"face/permits?period=all",cookie); assert.equal(rows.length,20); assert.equal(new Set(ids(rows)).size,20); assert.deepEqual(new Set(ids(rows)),new Set(Array.from({length:20},(_,i)=>`P${i}`)));
    assert.ok(f.batches.every(n=>n===2)); assert.equal(f.sql.length,f.batches.length*2); assert.ok(f.sql.every(sql=>! /\bOFFSET\b/i.test(sql)));
  });
  test(`A2/A5 ${kind}: all multi-column sorts cover ties and NULLs without overlap`, async t => {
    const env=setup(t,kind), f=env.FACES_DB, cookie=await cookieFor(env);
    for (const face of ["permits","subsidies","news"]) {
      f.meta(face); const spec=FACE_SPEC.faces[face], inputs=[];
      for(let i=0;i<20;i++) { const row={ id:`R${String(i).padStart(2,"0")}`, ord:i, period_date:i%4===0?null:`2026-09-${20+Math.floor(i/5)}`, new_date:i%4===0?null:"2026-09-20", ...(face==="news"?{relevance:i%3}:{amount:i>=17?null:Math.floor(i/3)}) }; inputs.push(row); f.row(face,row); }
      for(const [sort,terms] of Object.entries(spec.sorts)) {
        const expected=[...inputs].sort((a,b)=>{for(const [col,dir,last] of terms){ const av=a[col],bv=b[col]; if(av===bv)continue; if(av==null)return last==="last"||dir==="desc"?1:-1; if(bv==null)return last==="last"||dir==="desc"?-1:1; return (av<bv?-1:1)*(dir==="asc"?1:-1);} return 0;});
        const result=await walk(env,`face/${face}?period=all&sort=${sort}&limit=${face==="permits"?8:2}`,cookie);
        assert.deepEqual(ids(result),ids(expected),`${face}/${sort}`); assert.equal(new Set(ids(result)).size,20);
        if(sort.startsWith("amount"))assert.deepEqual(new Set(ids(result.slice(-3))),new Set(["R17","R18","R19"]));
        // Use distinct sessions to keep this pagination test separate from the rate-limit test.
        globalThis.caches.default.match=async()=>undefined;
      }
    }
  });
  test(`A3/A4/A5 ${kind}: filter OR/AND, tag OR, validation, hiring ignores period`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env); f.meta("ucc"); f.meta("hiring");
    for(let i=0;i<5;i++){f.row("ucc",{id:`U${i}`,ord:i,state:i%2?"OH":"IL",industry:i<3?"auto":"food",jp:i%2});f.tag("ucc","maker",i%2?"A":"B",`U${i}`);f.tag("ucc","domain","D",`U${i}`);f.row("hiring",{id:`H${i}`,ord:4-i,period_date:null});}
    assert.deepEqual(new Set(ids((await body(env,"face/ucc?state=OH&state=IL&industry=auto",cookie)).rows)),new Set(["U0","U1","U2"]));
    assert.deepEqual(new Set(ids((await body(env,"face/ucc?maker=A&maker=B&domain=D&state=OH",cookie)).rows)),new Set(["U1","U3"]));
    assert.equal((await body(env,"face/ucc?state=unknown",cookie)).rows.length,0);
    for(const q of ["unknown=1","state="+"x".repeat(201),"jp=no","sample_axis=us","limit=51","limit=0","limit=1.2","period=3y","period=older","period=none","view=2","sort=amount","limit=2&limit=3"]) assert.equal((await get(env,`face/ucc?${q}`,cookie)).status,400,q);
    assert.equal((await get(env,"face/ucc?limit=50",cookie)).status,200);assert.equal((await get(env,"face/missing",cookie)).status,404);
    for(const period of ["","&period=90d","&period=all","&period=bogus"]) assert.deepEqual(ids((await body(env,`face/hiring?limit=50${period}`,cookie)).rows),["H4","H3","H2","H1","H0"]);
    const next=(await body(env,"face/ucc?limit=2",cookie)).next_cursor;
    for(const cursor of ["%",Buffer.from("not json").toString("base64url"),encodeCursor(["new",1]),encodeCursor(["old",null,1,"U1"]),encodeCursor(["new",{},1,"U1"])]) assert.equal((await get(env,`face/ucc?cursor=${encodeURIComponent(cursor)}`,cookie)).status,400);
    assert.equal((await get(env,`face/ucc?sort=old&cursor=${next}`,cookie)).status,400);
  });
  test(`A6 ${kind}: new flags use today and inclusive 14/90 day boundaries`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);
    for(const [face,dates] of [["permits",["2026-09-13","2026-09-12",null]],["ucc",["2026-06-29","2026-06-28",null]],["subsidies",[null]]]){
      f.meta(face);dates.forEach((new_date,i)=>f.row(face,{id:`N${i}`,ord:i,new_date}));
      const rows=(await body(env,`face/${face}?period=all`,cookie)).rows;
      if(face==="subsidies")assert.ok(!Object.hasOwn(rows[0],"new")); else assert.deepEqual(Object.fromEntries(rows.map(r=>[r.id,r.new])),{N0:true,N1:false,N2:false});
    }
  });
}
