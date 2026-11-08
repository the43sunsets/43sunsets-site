import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { setup, cookieFor, get, body, day, email } from "./_faces.mjs";
import { store } from "../functions/signal/_lib.js";
import { onRequestGet as legacy } from "../functions/cockpit/data/[[path]].js";
import { encodeCursor } from "../functions/signal/api/_q.js";
const oldGet=(env,cookie)=>legacy({env,request:new Request("https://example.test/cockpit/data/ucc.json",{headers:cookie?{cookie}:{}}),params:{path:["ucc.json"]},next:async()=>Response.json({signals:[]})});
const textCSV=async r=>new TextDecoder("utf-8",{ignoreBOM:true}).decode(await r.arrayBuffer());
const sample={open_total:500,truncated:true,kinds:["更新"],amount:{total:1200},contractors_n:2,layer:"federal_capex",investment:5000,purpose_ja:"工場",tier:"fact",lender_class:"dealer",id:"ROW",state:"OH",city:'A,"B"\nC',fact:{value:0,src:"Source",ref:"ref",verbatim:"exact"},types:["expansion"],equipment:[{model:"M1",qty:0,verified:true},{model:"M2"}],jp:true,parties:{owner_is_spe:true},by_role:{engineer:1},titles:[{t:"Job"}]};
for(const kind of ["d1","kv"]){
  test(`A12/A14 ${kind}: CSV mappings equal anchored UI, BOM/CRLF, machines and bounded count`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);
    for(const face of ["permits","subsidies","hiring","ucc"]){
      f.meta(face);f.row(face,{id:"ROW",card:sample});f.row(face,{id:"EMPTY",ord:1,card:{id:"EMPTY",fact:{},types:[]}});
      // Anchor the original normal CSV handler in 18e4347, independently of _csv.js.
      let html=execFileSync("git",["show",`18e4347:signal/${face}/index.html`],{encoding:"utf8"});html=html.slice(html.indexOf('document.getElementById("export").addEventListener'));const start=html.indexOf("const head"),end=html.indexOf("const csv");
      if(face==="hiring") html=html.replace("s.open_all","s.open_total");
      const expected=vm.runInNewContext(`(()=>{const list=inputRows;${html.slice(start,end)}return [head,...rows];})()`,{inputRows:[sample,{id:"EMPTY",fact:{},types:[]}]});
      const additions={permits:["工事の種類","合計USD","施工者数"],subsidies:["層","予定投資額USD","何を・どこに(AI付与)"],ucc:["段","担保権者の種類"],hiring:["上限"]};
      expected[0].push(...additions[face]);
      const extras={permits:["更新",1200,2],subsidies:["federal_capex",5000,"工場"],ucc:["fact","dealer"],hiring:["1"]};
      expected.slice(1).forEach((r,i)=>r.push(...(i < (face==="ucc"?2:1) ? extras[face] : additions[face].map(()=>""))));
      const escape=v=>{v=String(v==null?"":v);return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};const exact="\ufeff"+Array.from(expected,r=>Array.from(r,escape).join(",")).join("\r\n");
      f.reset();const response=await get(env,`face/${face}.csv?period=365d&cursor=bad&limit=bad&view=bad`,cookie);assert.equal(response.status,200);assert.equal(response.headers.get("content-type"),"text/csv; charset=utf-8");assert.match(response.headers.get("content-disposition"),new RegExp(`43sunsets-cockpit-${face==="ucc"?"ucc-machines":face}-${day}.csv`));assert.deepEqual(f.batches,[2]);assert.ok(f.sql.length<=5);assert.equal(await textCSV(response),exact);
      if(face==="ucc")assert.equal(expected.length,4);assert.equal(expected[0].length,({permits:27,subsidies:28,hiring:17,ucc:33})[face]);
    }
    f.meta("news");assert.equal((await get(env,"face/news.csv",cookie)).status,404);
    for(let i=2;i<5001;i++)f.row("permits",{id:`bulk-${i}`,ord:i,card:{id:`bulk-${i}`,fact:{},state:"IL"}});
    f.reset();const tooMany=await get(env,"face/permits.csv?period=365d",cookie);assert.equal(tooMany.status,422);assert.deepEqual(await tooMany.json(),{ok:false,error:"条件を絞ってください",count:5001});assert.equal(tooMany.headers.get("content-type"),"application/json; charset=utf-8");assert.deepEqual(f.batches,[2]);
    assert.equal((await get(env,"face/permits.csv?period=365d&state=OH",cookie)).status,200);
    f.db.prepare("DELETE FROM f_permits WHERE id=?").run("bulk-5000");assert.equal((await get(env,"face/permits.csv?period=365d",cookie)).status,200);
  });
  for(const mixed of [false,true])test(`A15 ${kind}: ${mixed?"legacy + all API routes":"API"} share sixty requests and download checkpoints`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("permits");f.company();
    const paths=["face/permits","meta/permits","company/C-12103","search?q=Toyota","face/permits.csv"];
    for(let i=1;i<=60;i++){
      const response=mixed&&i%2===0?await oldGet(env,cookie):await get(env,paths[(i-1)%paths.length],cookie);assert.equal(response.status,200,`request ${i}`);
      assert.equal((await store(env).listDl())[0].n,1+10*Math.floor(i/10));
    }
    for(const path of paths){const r=await get(env,path,cookie);assert.equal(r.status,429);assert.equal(r.headers.get("retry-after"),"60");assert.equal(r.headers.get("x-signal-mode"),"full");}
    for(let i=0;i<61;i++)assert.equal((await get(env,"face/permits")).status,200);
    t.mock.timers.tick(60000);assert.equal((await get(env,"face/permits",cookie)).status,200);
  });
  test(`A16 ${kind}: view=1 only, open faces excluded, company starts only and anonymous never logs`,async t=>{
    const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env),s=store(env);f.meta("ucc");f.meta("permits");for(let i=0;i<10;i++)f.row("ucc",{id:`U${i}`,ord:i});f.company("C-12103",{grants:Array.from({length:60},(_,i)=>({id:`g${i}`}))});
    const first=await body(env,"face/ucc?view=1",cookie);const one=[{day,email,face:"ucc",n:1}];assert.deepEqual(await s.listFaceDays(),one);
    await body(env,"face/ucc",cookie);assert.deepEqual(await s.listFaceDays(),one);await body(env,`face/ucc?cursor=${first.next_cursor}`,cookie);assert.deepEqual(await s.listFaceDays(),one);
    await body(env,"face/ucc?view=1",cookie);assert.deepEqual(await s.listFaceDays(),[{day,email,face:"ucc",n:2}]);await body(env,"face/permits?view=1",cookie);assert.deepEqual(await s.listFaceDays(),[{day,email,face:"ucc",n:2}]);
    const company=await body(env,"company/C-12103",cookie);assert.deepEqual(await s.listCompanyViews(),[{day,company_id:"C-12103",viewers:1,n:1}]);assert.deepEqual(await s.listFaceDays(),[{day,email,face:"company",n:1},{day,email,face:"ucc",n:2}]);
    const before=await s.listFaceDays(),views=await s.listCompanyViews();
    for(const path of ["company/C-12103?face=grants",`company/C-12103?face=grants&cursor=${company.faces.grants.next_cursor}`,"meta/ucc","search?q=Toyota","face/ucc.csv"]){assert.equal((await get(env,path,cookie)).status,200);assert.deepEqual(await s.listFaceDays(),before);assert.deepEqual(await s.listCompanyViews(),views);}
    for(const path of ["face/ucc?view=1","face/permits?view=1","company/C-12103","company/C-12103?face=timeline","meta/ucc","search?q=Toyota"]){assert.equal((await get(env,path)).status,200);assert.deepEqual(await s.listFaceDays(),before);assert.deepEqual(await s.listCompanyViews(),views);}
  });
  test(`A19 ${kind}: missing binding, prepare and batch failures yield 503 on all five routes`,async t=>{
    const env=setup(t,kind),saved=env.FACES_DB,cookie=await cookieFor(env);t.after(()=>{env.FACES_DB=saved;});const warnings=[];t.mock.method(console,"warn",x=>warnings.push(x));
    for(const broken of [undefined,{prepare(){throw new Error("PRIVATE DETAIL");}},{prepare(){return {bind(){return this;}};},async batch(){throw new Error("PRIVATE DETAIL");}},{prepare(){return {bind(){return this;}};},async batch(){return [{success:false}];}}]){
      env.FACES_DB=broken;
      for(const path of ["face/permits","meta/permits","company/C-12103","search?q=Toyota","face/permits.csv"]){const r=await get(env,path,cookie);assert.equal(r.status,503);assert.deepEqual(await r.json(),{ok:false,error:"faces unavailable"});}
    }
    assert.equal(warnings.length,20);assert.ok(warnings.every(x=>x==="faces unavailable"));env.FACES_DB=saved;
  });
}
