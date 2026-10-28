import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setup, body } from "./_faces.mjs";
import { onRequestGet as legacy } from "../functions/cockpit/data/[[path]].js";
const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures/sample-golden/${name}.json`,import.meta.url),"utf8"));
const expected=fixture("expected"),ids=rows=>rows.map(x=>x.id);
for(const face of ["ucc","subsidies","hiring","news"])test(`A18/A7/A8: ${face} golden anchors current JS selection and anonymous API`,async t=>{
  const env=setup(t),f=env.FACES_DB,input=fixture(face);
  const result=await legacy({env,request:new Request(`https://example.test/cockpit/data/${face}.json`),params:{path:[`${face}.json`]},next:async()=>Response.json(input)});assert.equal(result.status,200);const demo=await result.json();
  if(face==="news"){
    const axes={us:input.us,...input.states},picked={us:demo.us,...demo.states};assert.deepEqual(Object.fromEntries(Object.entries(picked).map(([axis,rows])=>[axis,ids(rows)])),expected.news);
    const unique=new Map(Object.values(axes).flat().map(row=>[row.id,row]));let ord=0;
    for(const [id,card]of unique)f.row(face,{id:String(id),ord:ord++,card,period_date:"2026-03-01"});
    for(const [axis,rows]of Object.entries(axes))for(const row of rows){f.tag(face,"axis",axis,row.id);if(expected.news[axis].includes(row.id))f.tag(face,"sample_axis",axis,row.id);}
    f.meta(face,{meta:JSON.stringify({demo:{total:demo.meta_demo.total,sample:demo.meta_demo.sample}})});
    for(const axis of Object.keys(axes))assert.deepEqual(new Set(ids((await body(env,`face/news?axis=${axis}&period=90d`)).rows)),new Set(expected.news[axis]));
    assert.ok(!ids((await body(env,"face/news?axis=OH")).rows).includes(1950));assert.ok(ids((await body(env,"face/news?axis=IL")).rows).includes(2106));
  }else{
    assert.deepEqual(ids(demo.signals),expected[face]);f.meta(face,{meta:JSON.stringify({demo:demo.meta.demo})});
    input.signals.forEach((card,ord)=>f.row(face,{id:card.id,ord,card,period_date:face==="hiring"?null:card.date??null,new_date:card.date??null,is_sample:expected[face].includes(card.id)?1:0}));
    for(const q of ["","?period=90d","?period=1y"]){const response=await body(env,`face/${face}${q}`);assert.deepEqual(new Set(ids(response.rows)),new Set(expected[face]));assert.equal(response.next_cursor,null);}
    assert.deepEqual((await body(env,`meta/${face}`)).demo,demo.meta.demo);
  }
});
