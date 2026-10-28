import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {gzipSync} from "node:zlib";
import vm from "node:vm";
const face = "subsidies", path = "signal/subsidies/index.html", html = readFileSync(path,"utf8");
const old = execFileSync("git", ["show", "431e19d:" + path], {encoding:"utf8"});
const ctx = vm.createContext({URLSearchParams, Intl, Date, Set});
for (const asset of ["face-spec","face-api","facecount","face-ui",`card-${face}`]) vm.runInContext(readFileSync(`signal/assets/${asset}.js`,"utf8"),ctx);
const model = vm.runInContext(html.match(/\/\* page-model:start \*\/([\s\S]*?)\/\* page-model:end \*\//)[1] + "; ({FACE_CONFIG,pageSelection,pageCounts,csvDestination})",ctx);
const config = model.FACE_CONFIG, defaults = () => ctx.faceUi.defaults(config), plain = x => JSON.parse(JSON.stringify(x));
test("G1 acceptance 5/6: only query API supplies rows; no fallback, local aggregation or CSV generation",()=>{
  assert.doesNotMatch(html, /\/cockpit\/data\/(?:permits|subsidies|ucc(?:-wi)?|hiring|news)(?:-more[^"']*)?\.json/);
  assert.doesNotMatch(html, /\b(?:countBy|refreshPeriod|visibleBase|filtered|loadMore|ensureMore|SIGNALS|CSV_HEAD|crmRows)\b/);
  assert.doesNotMatch(html, /\["all",\s*"すべて"/);
  for(const asset of ["face-spec","face-api","facecount","face-ui",`card-${face}`]) assert.match(html,new RegExp(`/signal/assets/${asset}\\.js\\?v=`));
  assert.match(html,new RegExp(`faceCards\\.${face}\\(`)); assert.match(html,/faceUi\.mount\(/);
  assert.match(html,/faceApi\.unavailable\(\)/);
});
test("G1 acceptance 9: gzip budgets and every inline script parses",()=>{
  const js=[...html.matchAll(/<script\s+src="(\/signal\/assets\/[^"?]+\.js)[^"]*"/g)].map(x=>x[1].slice(1));
  const htmlSize=gzipSync(html,{level:9}).length, jsSize=js.reduce((n,p)=>n+gzipSync(readFileSync(p),{level:9}).length,0);
  assert.ok(htmlSize<=51200,`HTML ${htmlSize}`); assert.ok(jsSize<=122880,`JS ${jsSize}`);
  for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
});
test("G1 acceptance 2/3/14: three periods, sort choices and new-only flow into API arguments",()=>{
  assert.deepEqual(plain(config.periods.map(x=>x[0])),["90d","182d","365d"]);
  assert.deepEqual(plain(config.sorts.map(x=>x[0])),["new","old","amount_desc","amount_asc"]);
  assert.deepEqual(plain(config.demoDisable),["period","sort","new"]);
  const vocab={category:["操業の変化","保全","工事でない記録"]};
  const hiddenCounts=model.pageCounts({f_meta:{meta:{}},f_count:[]},{...defaults(),new:true},vocab); assert.equal(hiddenCounts.total,null); assert.ok(Object.values(hiddenCounts.periods).every(n=>n===null));
  for(const [period] of config.periods) for(const [sort] of config.sorts) {
    const state={...defaults(),period,sort,new:true}; const selected=model.pageSelection(state,vocab);
    const params=ctx.faceApi.params(face,selected);
    assert.equal(params.get("period"),period); assert.equal(params.get("new"),"1");
    assert.equal(params.get("sort"),sort===ctx.FACE_SPEC.faces[face].default_sort?null:sort);
    assert.equal(ctx.faceApi.params(face,{...selected,new:false}).has("new"),false);
  }
});
test("G1 acceptance 10: frozen assets, shared version strings and old CSS are untouched",()=>{
  const versions = source => [...source.matchAll(/<script src="\/signal\/assets\/(nav|favi|health)\.js\?v=[^"]+"/g)].map(x=>x[0]);
  assert.deepEqual(versions(html),versions(old));
  assert.deepEqual([...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[1]),[...old.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(x=>x[1]));
});

test("G1 acceptance 3: CSV uses current selection, CRM layout and anonymous login destination",()=>{
  const state={...defaults(),new:true,period:"182d"}, vocab={category:["保全"]};
  const url=new URL(model.csvDestination(state,vocab,true,"/here"),"https://example.test");
  assert.equal(url.pathname,`/signal/api/face/${face}.csv`);assert.equal(url.searchParams.get("new"),"1");assert.equal(url.searchParams.get("period"),"182d");
  if(["permits","ucc"].includes(face)) assert.equal(new URL(model.csvDestination(state,vocab,true,"/here","crm"),"https://example.test").searchParams.get("layout"),"crm");
  assert.equal(model.csvDestination(state,vocab,false,"/here?x=1"),"/signal/login/?next=%2Fhere%3Fx%3D1");
  assert.match(html,/csvDestination\(ui\.state, vocab, loggedIn/);
});
test("G1 acceptance 3: initial view, reset and cursor history use faceApi.pager without extra views",async()=>{
  const urls=[];ctx.fetch=async url=>{urls.push(url);return {ok:true,headers:{get:()=>"full"},json:async()=>({rows:[],next_cursor:urls.length===1?"next-token":null})};};
  const selected=model.pageSelection(defaults(),{category:["保全"]}), pager=ctx.faceApi.pager(face,selected);
  await pager.load();await pager.next();await pager.previous();await pager.reset({...selected,new:true});
  assert.deepEqual(urls.map(url=>new URL(url,"https://example.test").searchParams.get("view")),["1",null,null,null]);
  assert.equal(new URL(urls[1],"https://example.test").searchParams.get("cursor"),"next-token");
  assert.match(html,new RegExp(`faceApi\\.pager\\("${face}"`));assert.match(html,/pager\.reset\(pageSelection\(ui\.state, vocab\)\)/);
  assert.match(html,/ui\.state\.new \? `\$\{state.page\} ページ目`/);
});

test("G1 S-3 and layer selection: grant amount label, three default layers, optional extra layers and layer counts",()=>{
  assert.equal(config.sorts.find(x=>x[0]==="amount_desc")[1],"金額の大きい順(交付額)");
  const base=["state_incentive","local_abatement","federal_capex"], s=defaults();
  assert.deepEqual(plain(s.layer),base);assert.deepEqual(plain(model.pageSelection({...s,layer:[]},{}).layer),base);
  assert.deepEqual(plain(model.pageSelection({...s,otherlayers:true},{}).layer),[...base,"rnd","training_other"]);
  const counts=model.pageCounts({f_meta:{meta:{}},f_count:[...base,"rnd","training_other"].map((layer,i)=>({key:["IL",layer,"製造","金属","不明",0,0],period:"90d",n:i+1}))},{...s,otherlayers:true},{});
  assert.equal(counts.total,15); assert.deepEqual(plain(counts.facets.layer.map(x=>x.n)).sort(),[1,2,3,4,5]);
  assert.ok(!html.includes("Ohio Tax Credit Authority"));assert.ok(html.includes("OH・MI の州の層は手作業の経路で準備中"));
  assert.ok(html.includes("資本投資の決定"));for(const retired of ["capexonly","g-kind","subsidy-kind","capexcnt"])assert.ok(!html.includes(retired));
});

test("G1 D2: metaline uses meta totals and extra layer chips follow the toggle",()=>{
  const metadata={f_meta:{generated_at:"2026-08-10T12:00:00Z",meta:{n:123,n_capex:45}}};
  const output={};
  const assignMeta=html.match(/^    META = .*;$/m)[0];
  const metaline=html.match(/^    \$\("metaline"\)\.textContent = .*;$/m)[0];
  vm.runInNewContext(`let META; ${assignMeta}\n${metaline}`,{
    metaResult:metadata, $:id=>output[id] ||= {}, faceApi:{edition:value=>value}
  });
  assert.equal(output.metaline.textContent,"保存 123 件・資本投資の決定 45 件・2026-08-10T12:00:00Z");
  const base=["state_incentive","local_abatement","federal_capex"], extra=["rnd","training_other"];
  const meta={f_meta:{meta:{}},f_count:[...base,...extra].map((layer,i)=>({key:["IL",layer,"製造","金属","不明",0,0],period:"90d",n:i+1}))};
  for(const otherlayers of [false,true,false]) {
    const state={...defaults(),otherlayers}, counts=model.pageCounts(meta,state,{});
    const controls=ctx.faceUi.controls(config,state,counts);
    assert.deepEqual(plain(counts.facets.layer.map(x=>x.value)).sort(),[...base,...(otherlayers?extra:[])].sort());
    for(const value of extra) assert.equal(controls.includes(`data-facet="layer" value="${value}"`),otherlayers);
    assert.deepEqual(plain(model.pageSelection(state,{}).layer),[...base,...(otherlayers?extra:[])]);
  }
});
