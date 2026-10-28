import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
// Fixtures: origin/main public JSON, including ucc-wi; newly added keys removed, hiring open_total copied from open_all.
// Golden HTML: git show 0ca191d:signal/<face>/index.html, card functions evaluated in VM; UCC copyBox replaced with empty string.
const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const context={faviSlot:(id,name,website)=>`<span class="favi-slot" data-karte="${esc(id||'')}" data-name="${esc(name||'')}" data-website="${esc(website||'')}"></span>`};
vm.createContext(context);vm.runInContext(readFileSync("signal/assets/face-ui.js","utf8"),context);
const fixture=(face,suffix="")=>JSON.parse(readFileSync(`tests/fixtures/cards/${face}${suffix}.json`,"utf8"));
const ctx={meta:{new_rule:"旧ルール"}};
for(const face of ["permits","subsidies","ucc","hiring","news"]){
 vm.runInContext(readFileSync(`signal/assets/card-${face}.js`,"utf8"),context);
 test(`4① ${face}: anchored cards are byte identical except website attribute`,()=>{
  const rows=fixture(face);assert.ok(rows.length>=3);
  assert.equal(rows.map(r=>context.faceCards[face](r,ctx).replace(/ data-website="[^"]*"/g,"")).join("\n<!-- card -->\n"),readFileSync(`tests/fixtures/cards/${face}.html`,"utf8"));
  const old=fixture(face,"-v12").at(-1);assert.equal(context.faceCards[face](old,ctx),context.faceCards[face](rows[0],ctx));
 });
 test(`4② ${face}: v1.2 fields and absent-field fallback`,()=>{
  const rows=fixture(face,"-v12"),render=(r,extra={})=>context.faceCards[face](r,{...ctx,generated_at:"2026-09-27T06:00:00Z",...extra});
  const html=rows.slice(0,3).map(r=>render(r)).join("\n");assert.match(html,/面に加わった日 9\/27/);
  if(face!=="news")assert.match(html,/data-website="https:\/\/example.test"/);
  if(face==="permits"){
   for(const word of ["合計","$34,000","最大 $5,000","記載 11/11","施工者 3 社","他 1","構成 11 件","生産設備の更新"])assert.ok(html.includes(word),word);
   assert.match(render(rows[1]),/記載額なし/);assert.doesNotMatch(render(rows[1]),/\$0/);
  }
  if(face==="subsidies")for(const word of ["投資 $8.0M","交付 $250k","融資 $1.2M","+30 人",'class="purpose"',"州の誘致インセンティブ","市・郡の減免","連邦の製造支援・設備融資","制度の名前"])assert.ok(html.includes(word),word);
  if(face==="ucc"){
   for(const word of ["推定: 設備担保のおそれ","メーカー系金融","機械商社","設備リース専業","登録すると気になる登記を印せます"])assert.ok(html.includes(word),word);
   assert.doesNotMatch(html,/class="kinterest"/);assert.match(render(rows[0],{loggedIn:true}),/class="kinterest" data-id=/);
   assert.match(render({...rows[0],tier:"inference",first_published_at:null,lender_class:null}),/推定: 設備担保のおそれ/);
   assert.doesNotMatch(html,/板金|切削/);assert.match(render({...rows[0],lender_class:"unknown"}),/= unknown/);
  }
  if(face==="hiring"){
   for(const word of ["全 500+","—(観測 6 日)","グループ計","掲載 7 日以内"])assert.ok(html.includes(word),word);
   assert.equal((render(rows[0]).match(/掲載 7 日以内/g)||[]).length,1);
   assert.equal(render({...rows[0],open_all:9999}),render(rows[0]));
  }
  if(face==="news"){
   for(const word of ["他 1 媒体","媒体名","他紙","続報",'src="/photo.jpg"','src="/logo.svg"','src="/old.jpg"','class="credit">提供者'])assert.ok(html.includes(word),word);
   assert.doesNotMatch(render(rows[1]),/class="credit"/);assert.match(render({...rows[0],thumb:null}),/aria-hidden="true">媒体/);
  }
 });
}
