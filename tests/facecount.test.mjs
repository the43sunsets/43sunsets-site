import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
const g={};vm.runInNewContext(readFileSync("signal/assets/facecount.js","utf8"),g);
const api=g.faceCount;
for(const days of [[90,182,365],[14,30,90]])test(`1・2: 300 rows × 200 selections, cumulative ${days.join("/")} counts match independent row scan`,()=>{
 let seed=314159;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 const periods=days.map(d=>d+"d"),spec={filter_order:["state","category","industry","active"],tag_order:["kind","role"],periods,default_period:periods[0]};
 const records=Array.from({length:300},(_,id)=>({id,state:["OH","IL","WI"][random(3)],category:["A","B","C"][random(3)],industry:["auto","food","metal"][random(3)],active:random(2),kind:["x","y","z"].filter(()=>random(3)>0),role:["a","b","c"].filter(()=>random(2)),age:random(6)===0?null:random(days.at(-1)+50)}));
 const buckets=new Map();
 // Independent equivalent of cockpit build_counts: first matching period, sorted tag arrays.
 for(const r of records){const key=JSON.stringify([...spec.filter_order.map(k=>r[k]),...spec.tag_order.map(k=>[...r[k]].sort())]);const period=r.age==null?"none":periods.find((p,i)=>r.age<=days[i])||"older";const composite=JSON.stringify([key,period]);buckets.set(composite,(buckets.get(composite)||0)+1);}
 const rows=[...buckets].map(([k,n],i)=>{let [key,period]=JSON.parse(k);return {key:i%2?JSON.parse(key):key,period,n};});
 const dims=[...spec.filter_order,...spec.tag_order];
 const direct=(sel,period,ignore)=>records.filter(r=>r.age!=null&&r.age<=days[periods.indexOf(period)]&&dims.every(k=>k===ignore||!sel[k]?.length||sel[k].some(v=>Array.isArray(r[k])?r[k].includes(v):r[k]===v))).length;
 for(let j=0;j<200;j++){
  const sel={period:periods[random(3)],active:[j%2]};
  for(const key of dims.filter(x=>x!=="active")){const vals=[...new Set(records.flatMap(r=>r[key]))];sel[key]=vals.filter(()=>random(4)===0);}
  assert.equal(api.count(spec,rows,sel),direct(sel,sel.period));
  for(const dim of dims){
   for(const item of api.facets(spec,rows,sel,dim))assert.equal(item.n,direct({...sel,[dim]:[item.value]},sel.period),`${dim}/${item.value}`);
   assert.equal(api.count(spec,rows,sel,{ignore:dim}),direct(sel,sel.period,dim));
  }
  const counts=api.periods(spec,rows,sel);counts.forEach((x,i)=>{assert.equal(x.n,direct(sel,periods[i]));if(i)assert.ok(counts[i-1].n<=x.n);});
  assert.equal(api.toggle(spec,rows,sel,"active",0),direct({...sel,active:[0]},sel.period));
 }
 assert.equal(api.count(spec,rows,{}, {includeArchived:true}),300);
 assert.equal(api.count(spec,rows,{new:true}),null);
 assert.ok(api.facets(spec,rows,{new:true},"state").every(x=>x.n===null));
 assert.deepEqual(Array.from(api.vocabulary(spec,rows,"state",["WI","OH","IL"])),["WI","OH","IL"]);
});
