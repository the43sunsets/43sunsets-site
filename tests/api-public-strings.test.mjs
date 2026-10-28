import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const words=JSON.parse(readFileSync(new URL("../cockpit/data/g5-words.json",import.meta.url),"utf8"));
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
test("A22: all API/rate source (including every literal) has zero prohibited words or ID patterns",()=>{
  assert.ok(words.words_ja.length>=1);
  // Full-source checking is stronger than literal-only checking; the verbatim rate comments also pass.
  for(const path of [...files("functions/signal/api"),"functions/signal/_rate.js"]){const text=readFileSync(path,"utf8");for(const word of words.words_ja)assert.ok(!text.includes(word),`${path}: ${word}`);for(const pattern of words.id_patterns)assert.ok(!new RegExp(pattern).test(text),`${path}: ${pattern}`);}
});
