import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm, { runInNewContext } from "node:vm";
import { setup, cookieFor, get, body, day, email } from "./_faces.mjs";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
import { card } from "../functions/signal/api/_q.js";
import { store } from "../functions/signal/_lib.js";
import { CSV, csvText } from "../functions/signal/api/_csv.js";
import { onRequest as interest } from "../functions/signal/api/interest.js";
import { onRequestGet as detail } from "../functions/signal/api/detail/[id].js";
import { onRequest as noTests } from "../functions/tests/[[path]].js";
const ids=rows=>rows.map(r=>r.id).sort();
test("D-1: UCC normal CSV tier uses contract names and preserves unmapped or missing values",()=>{
 const list=[{tier:"infer"},{tier:"inference"},{tier:"fact"},{}].map((row,i)=>({id:`tier-${i}`,fact:{},...row}));
 const [head,...rows]=csvText("ucc",list).slice(1).split("\r\n").map(line=>line.split(","));
 const column=head.indexOf("段");assert.notEqual(column,-1);
 assert.deepEqual(rows.map(row=>row[column]),["inference","inference","fact",""]);
});
for(const kind of ["kv","d1"]){
 test(`B-12② / S-1 ${kind}: face periods, rejected legacy vocabulary, defaults and hiring`,async t=>{
  const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);
  for(const [face,spec] of Object.entries(FACE_SPEC.faces)){
   globalThis.caches.default.match=async()=>undefined;f.meta(face);
   f.row(face,{id:"recent",period_date:"2026-09-14"});f.row(face,{id:"twenty",period_date:"2026-09-07"});f.row(face,{id:"hundred",period_date:"2026-06-19"});
   for(const period of spec.periods)assert.equal((await get(env,`face/${face}?period=${period}`,cookie)).status,200,`${face}/${period}`);
   for(const period of ["all","older","none","1y","2y","bogus",...(face==="news"?["182d"]:[])])assert.equal((await get(env,`face/${face}?period=${period}`,cookie)).status,400,`${face}/${period}`);
   assert.deepEqual(ids((await body(env,`face/${face}`,cookie)).rows),face==="news"?["recent"]:["recent","twenty"]);
   assert.deepEqual(await body(env,`face/${face}`,cookie),await body(env,`face/${face}?period=${spec.default_period}`,cookie));
  }
 });
 test(`B-12③④ ${kind}: new filter and flags use generated_at, inclusive 7 days and NULL`,async t=>{
  const env=setup(t,kind,"2027-02-01T12:00:00Z"),f=env.FACES_DB,cookie=await cookieFor(env);
  for(const face of Object.keys(FACE_SPEC.faces)){
   f.meta(face);[day,"2026-09-21","2026-09-20","2026-09-19",null].forEach((first_published_at,i)=>f.row(face,{id:`N${i}`,ord:i,first_published_at,new_date:i>2?day:"2025-01-01"}));
   assert.deepEqual(ids((await body(env,`face/${face}?new=1`,cookie)).rows),["N0","N1","N2"]);
   for(const value of ["0","2","1&new=1"])assert.equal((await get(env,`face/${face}?new=${value}`,cookie)).status,400);
   const rows=(await body(env,`face/${face}`,cookie)).rows;
   for(const row of rows){assert.equal(row.new,["N0","N1","N2"].includes(row.id));assert.equal(row.first_published_at,[day,"2026-09-21","2026-09-20","2026-09-19",null][Number(row.id.slice(1))]);}
  }
  const csv=await get(env,"face/permits.csv?new=1",cookie);assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes("N2"));assert.ok(!text.includes("N3"));
 });
 test(`S-2 ${kind}: kind uses f_tag once and combines with scalar filters`,async t=>{
  const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env);f.meta("permits");
  for(const [id,state,kinds] of [["a","OH",["増築","改修"]],["b","IL",["改修"]],["c","OH",[]]]){f.row("permits",{id,state});for(const value of kinds)f.tag("permits","kind",value,id);}
  assert.equal((await body(env,"face/permits",cookie)).rows.length,3);f.reset();
  const r=await get(env,"face/permits?kind=増築",cookie);assert.equal(r.status,200);assert.deepEqual(ids((await r.json()).rows),["a"]);assert.equal((f.sql.join("\n").match(/EXISTS/g)||[]).length,1);assert.doesNotMatch(f.sql.join("\n"),/f\.kind IN/);
  assert.deepEqual(ids((await body(env,"face/permits?kind=増築&kind=改修&state=IL",cookie)).rows),["b"]);
 });
 test(`B-12⑥ ${kind}: interest requires login, anonymous counter only, no faces writes, method/body/rate limits`,async t=>{
  const env=setup(t,kind),f=env.FACES_DB,cookie=await cookieFor(env),writes=[];
  if(kind==="d1"){const orig=env.SIGNAL_DB.prepare.bind(env.SIGNAL_DB);env.SIGNAL_DB.prepare=sql=>{const stmt=orig(sql),bind=stmt.bind;stmt.bind=function(...values){if(sql.includes("interest_day"))writes.push([sql,values]);return bind.apply(this,values);};return stmt;};}
  else {const orig=env.BEACON_REQUESTS.put.bind(env.BEACON_REQUESTS);env.BEACON_REQUESTS.put=async(key,value,...rest)=>{if(key.startsWith("interest:"))writes.push([key,value]);return orig(key,value,...rest);};}
  const call=(method="POST",c=cookie,value={face:"ucc",id:"row"})=>interest({env,request:new Request("https://example.test/signal/api/interest",{method,headers:{...(c?{cookie:c}:{}),"content-type":"application/json"},...(method==="GET"?{}:{body:JSON.stringify(value)})})});
  f.reset();assert.equal((await call("GET")).status,405);assert.equal((await call("POST",null)).status,401);
  for(const value of [{face:"ucc",id:"row",email},{face:"missing",id:"row"},{face:"ucc",id:""},{face:"ucc",id:"x".repeat(201)},{face:"ucc",id:"a\nb"},[]])assert.equal((await call("POST",cookie,value)).status,400);
  for(let i=0;i<2;i++){const r=await call();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("x-signal-mode"),"full");}
  const n=kind==="d1"?env.SIGNAL_DB.db.prepare("SELECT n FROM interest_day").get().n:Number(await env.BEACON_REQUESTS.get(`interest:ucc:row:${day}`));assert.equal(n,2);
  assert.equal(writes.length,2);assert.ok(!JSON.stringify(writes).includes(email));const sid=cookie.split("=")[1].split(".")[0];assert.ok(!JSON.stringify(writes).includes(sid));assert.equal(f.sql.length,0);
  const saved=env.FACES_DB;delete env.FACES_DB;assert.equal((await call()).status,200);env.FACES_DB=saved;
  for(let i=0;i<51;i++)assert.equal((await call()).status,200);assert.equal((await call()).status,429);
 });
 test(`B-12⑧ ${kind}: open detail, ordered three rows, missing/invalid IDs and 500-row cap`,async t=>{
  const env=setup(t,kind),f=env.FACES_DB;
  const call=id=>detail({env,request:new Request("https://example.test/signal/api/detail/x"),params:{id}});
  for(const [id,date] of [["c","2026-09-03"],["b","2026-09-01"],["a","2026-09-01"]])f.insert("f_permits_detail",{parent_id:"parent",id,record_date:date,permit_no:"N",permit_type:"改修",applied_date:"2026-08-01",value_usd:100,gc_name:"Builder",applicant_name:"Applicant",description:"verbatim",source_id:"source"});
  f.reset();const r=await call("parent");assert.equal(r.status,200);const result=await r.json();assert.equal(result.n,3);assert.deepEqual(result.rows.map(x=>x.id),["a","b","c"]);assert.equal(result.rows[0].description,"verbatim");assert.deepEqual(f.batches,[1]);assert.equal(f.sql.length,1);
  assert.deepEqual(await (await call("missing")).json(),{rows:[],n:0});for(const id of ["","a".repeat(201),"a\nb"])assert.equal((await call(id)).status,400);
  for(let i=0;i<501;i++)f.insert("f_permits_detail",{parent_id:"many",id:String(i),record_date:"2026-09-01"});const many=await (await call("many")).json();assert.equal(many.n,500);assert.equal(many.rows.length,500);assert.equal(many.truncated,true);
  assert.deepEqual(await store(env).listFaceDays(),[]);
 });
 test(`B-12⑨ ${kind}: unknown meta keys pass through unchanged`,async t=>{
  const env=setup(t,kind);const unknown={new_today:5,new_7d:20,future:{any:[1,"x"]}};env.FACES_DB.meta("permits",{meta:JSON.stringify(unknown)});assert.deepEqual((await body(env,"meta/permits")).f_meta.meta,unknown);
 });
}
test("B-12⑦: /tests returns 404 and no-store for every method",()=>{
 for(const method of ["GET","HEAD","POST","PUT","PATCH","DELETE","OPTIONS"]){const r=noTests({request:new Request("https://example.test/tests/_d1.mjs",{method})});assert.equal(r.status,404);assert.equal(r.headers.get("cache-control"),"no-store");}
});
for(const face of ["permits","ucc"]){
 test(`B-12⑤ ${face}: anchored CRM bytes, BOM/CRLF, filename and only CSV permits layout`,async t=>{
  const env=setup(t),f=env.FACES_DB,cookie=await cookieFor(env);f.meta(face);
  const testSource=readFileSync(`tests/${face}-crm-csv.test.mjs`,"utf8");const fixtures=vm.runInNewContext(testSource.slice(testSource.indexOf("const a ="),testSource.indexOf('\ntest("F1:'))+";[a,b,c,d,e,f]");
  const html=execFileSync("git",["show",`0ca191d:signal/${face}/index.html`],{encoding:"utf8"}),source=html.match(/\/\* crmRows:begin \*\/([\s\S]*?)\/\* crmRows:end \*\//)[1];const render=vm.runInNewContext(source+";crmRows");
  const escape=v=>{v=String(v??"");return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  fixtures.forEach((r,i)=>f.row(face,{id:`db${i}`,ord:i,card:r}));const ordered=(await body(env,`face/${face}?limit=50`,cookie)).rows;
  const expected="\ufeff"+Array.from(render(ordered,"https://example.test"),r=>Array.from(r,escape).join(",")).join("\r\n");
  const r=await get(env,`face/${face}.csv?layout=crm`,cookie);assert.equal(r.status,200);assert.equal(new TextDecoder("utf-8",{ignoreBOM:true}).decode(await r.arrayBuffer()),expected);assert.equal(r.headers.get("content-disposition"),`attachment; filename="43sunsets-signal-${face}-crm-${day}.csv"`);
  assert.equal((await get(env,`face/${face}?layout=crm`,cookie)).status,400);assert.equal((await get(env,`face/${face}.csv?layout=bad`,cookie)).status,400);
  for(const other of ["subsidies","hiring","news"])assert.equal((await get(env,`face/${other}.csv?layout=crm`,cookie)).status,400);
 });
}

// Original G5/G2 F1 fixtures and expectations, now exercised against the API CRM mapper.
{
const rowsFor = (list, origin = "https://43sunsets.com") => CSV.permits.crm(list, origin);
const head = ["会社名","市","州","住所","出来事","日付","申請日","評価額USD","記録の参照","情報源","企業ページ","要約(AI付与)","Signalの許可ID"];
const a = {id:"S-74223", state:"OH", city:"Clermont County・2565 OLD SR 32 BATAVIA OH", company:"COOPER STEEL OF OHIO LLC", investor:{name:"COOPER STEEL OF OHIO LLC", basis:"owner_occupier", label:"自社所有"}, category:"製造能力の増強", date:"2026-10-05", applied:"2026-06-12", fact:{src:"Clermont County 建築許可(公開記録)", ref:"許可 B-075373-2026 Commercial Alteration Permit", value:16000000}, company_id:"C-15484", summary:"Cooper Steel of Ohio の工場の改修工事 $16M。"};
const b = {id:"S-2", state:"IL", city:"Chicago・123 N STATE ST, Chicago, IL, 60602", investor:{name:'ACME, "THE" CO', basis:"operator", label:"操業事業者"}, category:"物流・倉庫の新設", date:"2026-09-30", applied:null, fact:{src:"シカゴ市 建築許可(公開記録)", ref:"許可 100999 NEW CONSTRUCTION", value:null}, company_id:null, summary:"要約, B"};
const c = {id:"S-3", state:"IL", city:"Evanston", investor:{name:null, basis:"unknown", label:"未特定"}, category:"未分類", date:"", applied:"2026-01-02", fact:{src:"Evanston 建築許可(公開記録)", ref:"", value:null}, company_id:"C-abc", summary:""};
const d = {id:"S-4", state:"IL", city:"Peoria・1 MAIN ST", company:"所有者・申請者の記載なし", category:"医療施設", date:"2026-03-03", fact:{src:"Peoria 建築許可(公開記録)", ref:"許可 P-1"}};
const e = {id:"S-5", state:"WI", city:"Madison・2 OAK AVE", investor:{name:"MADISON METRO SCHOOL DIST", basis:"public", label:"公共"}, category:"研究・ラボ施設", date:"2026-02-02", applied:"2026-01-01", fact:{src:"Madison 建築許可(公開記録)", ref:"許可 W-5 ALTERATION", value:250000.5}, company_id:"C-7", summary:"要約 E"};
const f = {id:"S-6", state:"WI"};

test("B-12⑤ permits F1: six fixtures yield the 13-column header and six permits in input order", () => {
  const rows = rowsFor([a, b, c, d, e, f]);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], head);
  assert.ok(rows.every(row => row.length === 13));
  assert.deepEqual(rows.slice(1).map(row => row[12]), ["S-74223", "S-2", "S-3", "S-4", "S-5", "S-6"]);
  assert.deepEqual(rows[1], ["COOPER STEEL OF OHIO LLC","Clermont County","OH","2565 OLD SR 32 BATAVIA OH","建設許可(製造能力の増強)","2026-10-05","2026-06-12",16000000,"許可 B-075373-2026 Commercial Alteration Permit","Clermont County 建築許可(公開記録)","https://43sunsets.com/signal/company/?id=C-15484","Cooper Steel of Ohio の工場の改修工事 $16M。","S-74223"]);
  assert.deepEqual(rows[2], ['ACME, "THE" CO',"Chicago","IL","123 N STATE ST, Chicago, IL, 60602","建設許可(物流・倉庫の新設)","2026-09-30","","","許可 100999 NEW CONSTRUCTION","シカゴ市 建築許可(公開記録)","","要約, B","S-2"]);
  assert.deepEqual(rows[3], ["","Evanston","IL","","建設許可(未分類)","","2026-01-02","","","Evanston 建築許可(公開記録)","","","S-3"]);
  assert.deepEqual(rows[4], ["所有者・申請者の記載なし","Peoria","IL","1 MAIN ST","建設許可(医療施設)","2026-03-03","","","許可 P-1","Peoria 建築許可(公開記録)","","","S-4"]);
  assert.deepEqual(rows[5], ["MADISON METRO SCHOOL DIST","Madison","WI","2 OAK AVE","建設許可(研究・ラボ施設)","2026-02-02","2026-01-01",250000.5,"許可 W-5 ALTERATION","Madison 建築許可(公開記録)","https://43sunsets.com/signal/company/?id=C-7","要約 E","S-5"]);
  assert.deepEqual(rows[6], ["","","WI","","建設許可(未分類)","","","","","","","","S-6"]);
});

test("B-12⑤ permits F1: duplicate permits remain separate rows", () => {
  const row = rowsFor([a], "x")[1];
  assert.deepEqual(rowsFor([a, a], "x"), [head, row, row]);
});

test("B-12⑤ permits F1: empty input returns only the header", () => {
  assert.deepEqual(rowsFor([], "x"), [head]);
});

test("B-12⑤ permits F1: company page uses the supplied origin", () => {
  assert.equal(rowsFor([a], "https://example.test")[1][10], "https://example.test/signal/company/?id=C-15484");
});

}

// Original G5/G2 F1 fixtures and expectations, now exercised against the API CRM mapper.
{
const rowsFor = (list, origin = "https://43sunsets.com") => CSV.ucc.crm(list, origin);
const head = ["会社名","市","州","出来事","日付","失効日","担保権者","記録の参照","記録のURL","情報源","企業ページ","要約(AI付与)","Signalの登記ID"];
const wiSource = "ウィスコンシン州 DFI UCC 登記(wims.dfi.wi.gov・公開検索)";
const ohSource = "オハイオ州務長官 UCC 登記(ucc.ohiosos.gov・公開検索)";
const a = {id:"U-1", state:"WI", company:"STEIGER STEEL & FABRICATING, INC.", city:"La Crosse, WI", kind:"設備投資", date:"2026-08-07", lapse:"2031-08-07", secured_party:"MAZAK CORPORATION", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"FS 20260807364744-3 UCC1 Initial Financing Statement"}, karte:"C-100", summary:"要約 A", copy:{status:"free", price_usd:0}, equipment:[{}]};
const b = {id:"U-1", state:"WI", company:"STEIGER STEEL & FABRICATING, INC.", city:"LA CROSSE", kind:"未分類", date:"2026-08-07", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"IFS 20260807364744-3"}, summary:"担保物(逐語): A purchase money security interest", copy:{status:"purchased"}, equipment:[]};
const c = {id:"U-2", state:"WI", company:"GD DAIRY LLC", city:"", kind:"雑音", date:"2026-08-10", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"IFS 20260810365572-6"}, copy:{status:"free"}, equipment:[]};
const d = {id:"U-3", state:"OH", company:'ACME, "THE" CO', city:"Dayton, OH", kind:"与信枠の新設", date:"2026-07-01", lapse:"", secured_party:"BANK ONE", fact:{src:"オハイオ州務長官 UCC 登記(ucc.ohiosos.gov・公開検索)", ref:"FS 20260701000001-1 UCC1 Initial Financing Statement"}, karte:"C-200", summary:"要約, D", copy:{status:"free"}, equipment:[]};
const e = {id:"U-4", state:"IL", company:"NO URL INC", city:"Peoria, IL", kind:"設備投資", date:"2026-06-01", fact:{src:"IL", ref:"X-1"}, copy:{status:"free"}, equipment:[]};
const f = {id:"U-5", state:"WI", company:"NULLS LLC", date:"2026-05-01"};

test("B-12⑤ ucc F1: six fixtures yield the 13-column header and five filings in first-seen order", () => {
  const rows = rowsFor([b, a, c, d, e, f]);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0], head);
  assert.ok(rows.every(row => row.length === 13));
  assert.deepEqual(rows.slice(1).map(row => row[12]), ["U-1", "U-2", "U-3", "U-4", "U-5"]);
  assert.deepEqual(rows[1], ["STEIGER STEEL & FABRICATING, INC.","La Crosse","WI","UCC 登記(設備投資)","2026-08-07","2031-08-07","MAZAK CORPORATION","FS 20260807364744-3 UCC1 Initial Financing Statement","https://wims.dfi.wi.gov/uccsearch",wiSource,"https://43sunsets.com/signal/company/?id=C-100","要約 A","U-1"]);
  assert.deepEqual(rows[2], ["GD DAIRY LLC","","WI","UCC 登記(雑音)","2026-08-10","","","IFS 20260810365572-6","https://wims.dfi.wi.gov/uccsearch",wiSource,"","","U-2"]);
  assert.deepEqual(rows[3], ['ACME, "THE" CO',"Dayton","OH","UCC 登記(与信枠の新設)","2026-07-01","","BANK ONE","FS 20260701000001-1 UCC1 Initial Financing Statement","https://ucc.ohiosos.gov/search",ohSource,"https://43sunsets.com/signal/company/?id=C-200","要約, D","U-3"]);
  assert.deepEqual(rows[4], ["NO URL INC","Peoria","IL","UCC 登記(設備投資)","2026-06-01","","","X-1","","IL","","","U-4"]);
  assert.deepEqual(rows[5], ["NULLS LLC","","WI","UCC 登記(未分類)","2026-05-01","","","","https://wims.dfi.wi.gov/uccsearch",wiSource,"","","U-5"]);
});

test("B-12⑤ ucc F1: karte wins over purchased status regardless of duplicate order", () => {
  assert.deepEqual(rowsFor([a, b]), rowsFor([b, a]));
});

test("B-12⑤ ucc F1: duplicate ties retain the first row", () => {
  const later = {...b, company:"LATER INDEX"};
  assert.deepEqual(rowsFor([b, later]), rowsFor([b]));
  assert.deepEqual(rowsFor([later, b]), rowsFor([later]));
  assert.deepEqual(rowsFor([a, {...a, company:"LATER READ"}]), rowsFor([a]));
});

test("B-12⑤ ucc F1: empty input returns only the header", () => {
  assert.deepEqual(rowsFor([], "x"), [head]);
});

}
