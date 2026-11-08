import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
function setup(fetch){const g={fetch,FACE_SPEC,URLSearchParams,Intl,Date};vm.runInNewContext(readFileSync("signal/assets/face-api.js","utf8"),g);return g.faceApi;}
const response=(data={},mode="full",status=200)=>new Response(JSON.stringify(data),{status,headers:{"x-signal-mode":mode}});
test("3: every face always sends its period, defaults omit sort, all sort choices/new/CSV URLs",()=>{
 const api=setup(()=>{});
 for(const [face,spec] of Object.entries(FACE_SPEC.faces)){
  for(const period of spec.periods){const url=new URL(api.url(face,{period}),"https://example.test");assert.equal(url.searchParams.get("period"),period);assert.equal(url.searchParams.has("sort"),false);}
  assert.equal(api.params(face).get("period"),spec.default_period);
  for(const period of ["all","1y","2y"])assert.throws(()=>api.params(face,{period}));
  for(const sort of Object.keys(spec.sorts))assert.equal(api.params(face,{sort}).get("sort"),sort===spec.default_sort?null:sort);
  assert.equal(api.params(face,{new:true}).get("new"),"1");assert.equal(api.params(face,{new:false}).has("new"),false);
 }
 assert.match(api.url("permits",{state:["OH","IL"],unc:0}),/state=OH&state=IL/);
 assert.match(api.csvUrl("permits",{new:true},"crm"),/^\/signal\/api\/face\/permits.csv\?.*new=1.*layout=crm/);
 assert.doesNotMatch(api.csvUrl("ucc",{}),/view=|layout=/);
 assert.throws(()=>api.csvUrl("hiring",{},"crm"));
});
test("3: view=1 only on the first face load, cursor next/previous/first/reset, meta/demo and request options",async()=>{
 const calls=[];let cursor=0;const api=setup(async(path,opts)=>{calls.push([path,opts]);return response({rows:[cursor++],next_cursor:"opaque"},"demo");});
 const pager=api.pager("hiring");const initial=await pager.load();assert.equal(initial.mode,"demo");assert.equal(initial.page,1);
 assert.equal((await pager.next()).page,2);assert.equal(pager.state.hasPrevious,true);await pager.previous();await pager.next();await pager.first();await pager.reset({new:true});await api.meta("hiring");await api.company("C-1",{face:"grants",cursor:"a/b"});await api.detail("parent/a");await api.interest("ucc","row");
 assert.equal(calls.filter(([path])=>path.includes("view=1")).length,1);assert.match(calls[0][0],/view=1/);assert.match(calls[1][0],/cursor=opaque/);assert.doesNotMatch(calls[5][0],/cursor=/);
 assert.equal(calls[6][0],"/signal/api/meta/hiring");assert.equal(calls[7][0],"/signal/api/company/C-1?face=grants&cursor=a%2Fb");assert.equal(calls[8][0],"/signal/api/detail/parent%2Fa");assert.equal(calls[9][0],"/signal/api/interest");assert.equal(calls[9][1].body,'{"face":"ucc","id":"row"}');assert.equal(calls[9][1].method,"POST");
 for(const [,options] of calls){assert.equal(options.cache,"no-store");assert.equal(options.credentials,"same-origin");}
});
test("3: HTTP 503 and network TypeError have CT time, no fallback; stale edition uses 30 hours",async()=>{
 for(const fetch of [async()=>response({},"demo",503),async()=>{throw new TypeError("offline");}]){
  let calls=0;const api=setup(async(...args)=>{calls++;return fetch(...args);});await assert.rejects(api.meta("ucc"),/一時的に読み込めません\(\d\d:\d\d CT に確認\)/);assert.equal(calls,1);
 }
 const api=setup(()=>{});assert.equal(api.edition("2026-09-27T12:00:00Z",new Date("2026-09-28T18:00:01Z")),"9月27日の版");assert.match(api.edition("2026-09-27T12:00:00Z",new Date("2026-09-28T18:00:00Z")),/^更新 /);
 assert.doesNotMatch(readFileSync("signal/assets/face-api.js","utf8"),/cockpit\/data|\.json["\x27`]/);
});
test("3: racing filter changes cannot overwrite the current cursor",async()=>{
 const pending=[];const api=setup(()=>new Promise(resolve=>pending.push(resolve))),p=api.pager("ucc");const a=p.load(),b=p.reset({state:"OH"});pending[1](response({rows:[],next_cursor:null}));await b;pending[0](response({rows:[],next_cursor:"old"}));assert.equal((await a).stale,true);assert.equal(p.state.hasNext,false);
});
