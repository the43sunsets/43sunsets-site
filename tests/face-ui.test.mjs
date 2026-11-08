import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
const text=readFileSync("signal/assets/terms.json","utf8");
const expected=`{"version": "terms-v1-2026-10-26", "permits.category": {
 "操業の変化": "生産・物流・研究・用途が変わる工事(増築・新築、生産設備、倉庫・搬送、新拠点・用途転換、ラボ、縮小・撤去)を含む許可。",
 "保全": "既存の建物・設備を保つ工事だけ(更新・修繕、ユーティリティ、警備、危険物の更新)の許可。",
 "事務所・その他": "事務所の内装・看板・駐車場など、生産や物流に直接関わらない工事だけの許可。",
 "内容不明": "記述から工事の中身が読めない許可(種類が「内容不明」か、記述が短い)。",
 "工事でない記録": "工事を伴わない記録(占用・仮設・看板の許可更新など)。既定では一覧に入れていません。"
}}
`;
function setup(extra={}){const g={FACE_SPEC,...extra};vm.runInNewContext(readFileSync("signal/assets/face-ui.js","utf8"),g);return g.faceUi;}
const config=face=>({face,periods:FACE_SPEC.faces[face].periods.map((x,i)=>[x,face==="news"?["直近 14 日","直近 30 日","直近 90 日"][i]:["直近 90 日","直近 6 か月","直近 1 年"][i]]),sorts:Object.keys(FACE_SPEC.faces[face].sorts).map(x=>[x,x]),filters:[],demoDisable:["new","period","sort"]});
test("15: terms are verbatim, and the five categories equal the anchored public vocabulary",()=>{
 assert.equal(text,expected);assert.deepEqual(JSON.parse(text),JSON.parse(expected));
 const old=JSON.parse(execFileSync("git",["show","origin/main:cockpit/data/permits.json"],{encoding:"utf8",maxBuffer:20*1024*1024}));assert.deepEqual(Object.keys(JSON.parse(text)["permits.category"]).sort(),old.meta.vocab.category.slice().sort());
});
test("2・14: all faces have three period buttons, defaults, sorts, demo disabling and hidden new-only counts",()=>{
 const ui=setup();
 for(const face of Object.keys(FACE_SPEC.faces)){
  const c=config(face),state=ui.defaults(c),counts={periods:Object.fromEntries(c.periods.map(([p],i)=>[p,i+1]))};
  const live=ui.controls(c,state,counts,false),demo=ui.controls(c,state,counts,true);
  assert.equal((live.match(/data-period=/g)||[]).length,3);assert.doesNotMatch(live,/すべて| disabled/);assert.equal((demo.match(/ disabled/g)||[]).length,5);
  for(const [p,label] of c.periods){assert.ok(live.includes(`data-period="${p}"`));assert.ok(live.includes(label));}
  for(const [value] of c.sorts)assert.ok(live.includes(`value="${value}"`));
  assert.equal(state.new,false);assert.equal(state.period,FACE_SPEC.faces[face].default_period);
  const fresh=ui.controls(c,{...state,new:true},counts);assert.equal((fresh.match(/<span>—<\/span>/g)||[]).length,3);
 }
});
test("14・15: NEW, exact bands, records tooltip, and accessible five-term tooltips",()=>{
 const ui=setup(),meta={new_today:5,new_7d:18};
 assert.equal(ui.newChip({new:false,first_published_at:"2026-09-27"}),"");
 assert.equal(ui.newChip({new:true,first_published_at:"2026-09-27"}),'<span class="chip newchip" title="面に加わった日 9/27">NEW</span>');
 assert.match(ui.newChip({new:true,first_published_at:"2026-09-27T00:00:00Z"}),/面に加わった日 9\/26/);
 assert.match(ui.band(meta,{records:42}),/今日 面に加わったカード \+5/);assert.match(ui.band(meta,{records:42}),/title="記録 \+42 行"/);
 const demo=ui.band(meta,{demo:true,newOnly:true});assert.match(demo,/全体で今日 \+5 枚\(登録すると全部\)/);assert.match(demo,/新着\(7 日\)全体 18 件/);
 const c={...config("permits"),filters:[{key:"category",label:"設備投資の種類",kind:"facet"}]};
 const html=ui.controls(c,ui.defaults(c),{facets:{category:Object.keys(JSON.parse(text)["permits.category"]).map(value=>({value,n:4}))}},false,JSON.parse(text));
 assert.equal((html.match(/aria-describedby=/g)||[]).length,5);assert.equal((html.match(/ title=/g)||[]).length,5);assert.doesNotMatch(html,/ checked/);
});
test("14: terms fetched once with version; configured mount resets state and preserves demo band",async()=>{
 const calls=[],styles=[],listeners={};const root={innerHTML:"",addEventListener:(k,fn)=>listeners[k]=fn};const bandRoot={},hitRoot={};
 const ui=setup({fetch:async path=>{calls.push(path);return {ok:true,json:async()=>JSON.parse(text)};},document:{createElement:()=>({}),head:{appendChild:x=>styles.push(x)}}});
 const changes=[],c={...config("permits"),root,bandRoot,hitRoot,onChange:(v)=>changes.push(v)};
 const mount=ui.mount(c);await mount.ready;await ui.terms();assert.deepEqual(calls,["/signal/assets/terms.json?v=20261028"]);assert.equal(styles.length,1);
 listeners.change({target:{disabled:false,hasAttribute:()=>false,dataset:{toggle:"new"},checked:true}});
 mount.update({demo:true,meta:{new_today:3,new_7d:9},counts:{total:30}});assert.equal(hitRoot.textContent,"—");assert.match(bandRoot.innerHTML,/全体で今日 \+3 枚/);assert.match(bandRoot.innerHTML,/新着\(7 日\)全体 9 件/);
 mount.reset();assert.equal(mount.state.new,false);assert.equal(changes.at(-1).period,"90d");
});
test("G0 health: mapped meta count, collection tooltip, fallback and other checks",async()=>{
 const source=readFileSync("signal/assets/health.js","utf8");
 for(const [key,metaOk,n] of [["permits_update_vps",true,7],["permits_update_vps",false,99],["other",true,99]]){
  const el={dataset:{check:key},classList:{contains:()=>false}},calls=[];
  const g={document:{querySelectorAll:()=>[]},fetch:async(path,options)=>{calls.push([path,options]);return path.endsWith("health.json")?{ok:true,json:async()=>({generated_at:"2026-09-27",checks:{[key]:{new_records:99,state:"OK",last_run_at:new Date().toISOString()}}})}:{ok:metaOk,json:async()=>({f_meta:{meta:{new_today:7}}})};}};
  vm.createContext(g);vm.runInContext(source,g);g.run(el);await new Promise(resolve=>setImmediate(resolve));
  assert.ok(el.innerHTML.includes(`>+${n}</span>`));assert.match(el.innerHTML,/当日の収集 済/);
  if(key!=="other"){assert.match(el.title,/記録 \+99 行/);assert.equal(calls[1][0],"/signal/api/meta/permits");assert.equal(calls[1][1].credentials,"same-origin");}else assert.equal(calls.length,1);
 }
});
