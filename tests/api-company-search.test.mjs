import test from "node:test";
import assert from "node:assert/strict";
import { setup, cookieFor, get, body } from "./_faces.mjs";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
import { encodeCursor } from "../functions/signal/api/_q.js";
function sections(){return {permits:Array.from({length:3},(_,i)=>({id:`public-${i}`,title:`Public ${i}`})),ucc:[{id:"secret-ucc",title:"Secret UCC"}],grants:Array.from({length:120},(_,i)=>({id:`secret-grant-${i}`,title:`Secret grant ${i}`,amount:i})),hiring:Array.from({length:120},(_,i)=>({title:`Secret job ${i}`,source:"jobs"})),news:[{id:"secret-news",title:"Secret news"}],timeline:Array.from({length:120},(_,i)=>({face:i%2?"permits":"grants",ref:`${i%2?"public":"secret"}-timeline-${i}`,title:`Timeline ${i}`}))};}
function noFaceTables(f){assert.equal(f.batches.length,1);assert.deepEqual(f.batches,[2]);assert.equal(f.sql.length,2);assert.ok(f.sql.some(x=>x.includes("c_item")));for(const spec of Object.values(FACE_SPEC.faces))assert.ok(f.sql.every(x=>!x.includes(spec.table)),spec.table);}
for(const kind of ["d1","kv"]){
  test(`A7/A10/A12/A21 ${kind}: company gate locks summaries and filters timeline on every continuation`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env),items=sections();f.company("C-12103",items);f.row("subsidies",{id:"FACE-ONLY-SECRET",company_id:"C-12103"});
    f.reset();const full=await body(env,"company/C-12103",cookie);noFaceTables(f);
    f.reset();const demo=await body(env,"company/C-12103");noFaceTables(f);
    assert.deepEqual(demo.faces.permits,full.faces.permits);assert.deepEqual(demo.header.faces.permits,full.header.faces.permits);assert.equal(demo.header.demo,true);assert.ok(!Object.hasOwn(full.header,"demo"));
    for(const name of ["ucc","grants","hiring","news"]){const locked={count:full.header.faces[name].count,locked:true};assert.deepEqual(demo.faces[name],locked);assert.deepEqual(demo.header.faces[name],locked);}
    assert.equal(demo.faces.timeline.n,60);assert.equal(demo.header.n_timeline,60);assert.ok(demo.faces.timeline.rows.every(x=>x.face==="permits"));
    for(const word of ["secret","Secret","FACE-ONLY"])assert.ok(!JSON.stringify(demo).includes(word));
    for(const c of [full.faces.timeline.next_cursor,encodeCursor(["timeline",-1]),encodeCursor(["timeline",0])]){
      f.reset();const result=await body(env,`company/C-12103?face=timeline&cursor=${c}`);noFaceTables(f);assert.deepEqual(Object.keys(result.faces),["timeline"]);assert.equal(result.faces.timeline.n,60);assert.equal(result.header.n_timeline,60);assert.ok(result.faces.timeline.rows.every(x=>x.face==="permits"));assert.ok(!JSON.stringify(result).includes("secret"));
      const after=JSON.parse(Buffer.from(c,"base64url"))[1];assert.deepEqual(result.faces.timeline.rows,items.timeline.filter((x,i)=>i>after&&x.face==="permits").slice(0,50));
    }
    f.reset();await body(env,`company/C-12103?face=timeline&cursor=${full.faces.timeline.next_cursor}`,cookie);noFaceTables(f);
    assert.equal((await get(env,`company/C-12103?face=grants&cursor=${full.faces.timeline.next_cursor}`)).status,403);
    // The smaller mixed-source example fixes exact public counts as well as no leaks.
    f.company("C-2",{timeline:[...Array.from({length:3},()=>({face:"permits",ref:"public"})),...Array.from({length:3},()=>({face:"grants",ref:"secret"})),...Array.from({length:2},()=>({face:"ucc",ref:"secret"})),{face:"news",ref:"secret"},{face:"hiring",ref:"secret"}]});
    const small=await body(env,"company/C-2");assert.equal(small.faces.timeline.n,3);assert.equal(small.header.n_timeline,3);assert.equal(small.faces.timeline.rows.length,3);assert.ok(!JSON.stringify(small).includes("secret"));
  });
  test(`A11/A12/A21 ${kind}: company items preserve JSON and ord, 50/50/20 pages including id-less jobs`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env),items=sections(),header=f.company("C-12103",items);f.company("C-2");f.row("subsidies",{id:"FACE-ONLY-SECRET",company_id:"C-12103"});
    const first=await body(env,"company/C-12103",cookie);assert.deepEqual(first.header,header);assert.deepEqual(Object.keys(first.faces),FACE_SPEC.c_item.faces);
    for(const face of FACE_SPEC.c_item.faces){assert.deepEqual(first.faces[face].rows,items[face].slice(0,50));assert.equal(first.faces[face].n,f.db.prepare("SELECT COUNT(*) n FROM c_item WHERE company_id=? AND face=?").get("C-12103",face).n);}
    for(const face of ["grants","hiring","timeline"]){let cursor=null;const rows=[],sizes=[];do{f.reset();const result=await body(env,`company/C-12103?face=${face}${cursor?`&cursor=${cursor}`:""}`,cookie);noFaceTables(f);assert.deepEqual(result.header,header);const section=result.faces[face];assert.equal(section.n,120);rows.push(...section.rows);sizes.push(section.rows.length);cursor=section.next_cursor;}while(cursor);assert.deepEqual(sizes,[50,50,20]);assert.deepEqual(rows,items[face]);assert.equal(new Set(rows.map(x=>JSON.stringify(x))).size,120);}
    const empty=await body(env,"company/C-2",cookie);for(const face of FACE_SPEC.c_item.faces)assert.deepEqual(empty.faces[face],{rows:[],next_cursor:null,n:0});
    assert.deepEqual((await body(env,`company/C-12103?face=grants&cursor=${encodeCursor(["grants",9999])}`,cookie)).faces.grants,{rows:[],next_cursor:null,n:120});
    for(const [path,status]of [["C-abc",400],["12103",400],["C-999999",404],["C-12103?face=subsidies",400],["C-12103?limit=10",400],[`C-12103?face=ucc&cursor=${encodeCursor(["grants",1])}`,400],["C-12103?cursor=bad",400],["C-12103?face=timeline&cursor=bad",400],[`C-12103?face=timeline&cursor=${encodeCursor(["timeline","1"])}`,400]])assert.equal((await get(env,`company/${path}`,cookie)).status,status,path);
  });
  test(`A13 ${kind}: literal trigram search, limits and syntax characters`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);["Toyota Motor","Toyota Tsusho","Aisin"].forEach((name,i)=>f.company(`C-${i}`,{},{name}));
    assert.deepEqual(new Set((await body(env,"search?q=yot",cookie)).rows.map(x=>x.name)),new Set(["Toyota Motor","Toyota Tsusho"]));
    for(const q of ["yo"," yo ",""])assert.equal((await get(env,`search?q=${encodeURIComponent(q)}`,cookie)).status,400);
    for(const q of ['a"b','ab*','OR toy','NEAR(foo)'])assert.equal((await get(env,`search?q=${encodeURIComponent(q)}`,cookie)).status,200);
    for(let i=3;i<24;i++)f.company(`C-${i}`,{},{name:`Factory ${i}`});assert.equal((await body(env,"search?q=Factory",cookie)).rows.length,20);
    assert.equal((await get(env,"search?q=Toyota&unknown=x",cookie)).status,400);
  });
}
for(const kind of ["d1","kv"])test(`A12 ${kind}: every route uses one batch with at most five statements`,async t=>{
  const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("permits");f.company();
  for(const c of [undefined,cookie])for(const path of ["face/permits","meta/permits","company/C-12103","company/C-12103?face=permits","search?q=Toyota",...(c?["face/permits.csv"]:[])]){
    f.reset();assert.equal((await get(env,path,c)).status,200);assert.equal(f.batches.length,1);assert.ok(f.sql.length<=5);assert.equal(f.sql.length,f.batches[0]);if(path.startsWith("meta/")||path.startsWith("company/"))assert.equal(f.batches[0],2);
  }
});
