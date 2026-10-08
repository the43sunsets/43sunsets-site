import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../signal/ucc/index.html", import.meta.url), "utf8");
const src = html.match(/\/\* crmRows:begin \*\/([\s\S]*?)\/\* crmRows:end \*\//)?.[1];
assert.ok(src, "crmRows must be enclosed by its extraction markers");
const crmRows = runInNewContext(src + "; crmRows");
// Convert VM arrays to this realm so strict deep equality compares their values.
const rowsFor = (list, origin = "https://43sunsets.com") => Array.from(crmRows(list, origin), row => Array.from(row));
const head = ["会社名","市","州","出来事","日付","失効日","担保権者","記録の参照","記録のURL","情報源","企業ページ","要約(AI付与)","Signalの登記ID"];
const wiSource = "ウィスコンシン州 DFI UCC 登記(wims.dfi.wi.gov・公開検索)";
const ohSource = "オハイオ州務長官 UCC 登記(ucc.ohiosos.gov・公開検索)";
const a = {id:"U-1", state:"WI", company:"STEIGER STEEL & FABRICATING, INC.", city:"La Crosse, WI", kind:"設備投資", date:"2026-08-07", lapse:"2031-08-07", secured_party:"MAZAK CORPORATION", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"FS 20260807364744-3 UCC1 Initial Financing Statement"}, karte:"C-100", summary:"要約 A", copy:{status:"free", price_usd:0}, equipment:[{}]};
const b = {id:"U-1", state:"WI", company:"STEIGER STEEL & FABRICATING, INC.", city:"LA CROSSE", kind:"未分類", date:"2026-08-07", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"IFS 20260807364744-3"}, summary:"担保物(逐語): A purchase money security interest", copy:{status:"purchased"}, equipment:[]};
const c = {id:"U-2", state:"WI", company:"GD DAIRY LLC", city:"", kind:"雑音", date:"2026-08-10", fact:{src:"WI DFI UCC(wims.dfi.wi.gov)", ref:"IFS 20260810365572-6"}, copy:{status:"free"}, equipment:[]};
const d = {id:"U-3", state:"OH", company:'ACME, "THE" CO', city:"Dayton, OH", kind:"与信枠の新設", date:"2026-07-01", lapse:"", secured_party:"BANK ONE", fact:{src:"オハイオ州務長官 UCC 登記(ucc.ohiosos.gov・公開検索)", ref:"FS 20260701000001-1 UCC1 Initial Financing Statement"}, karte:"C-200", summary:"要約, D", copy:{status:"free"}, equipment:[]};
const e = {id:"U-4", state:"IL", company:"NO URL INC", city:"Peoria, IL", kind:"設備投資", date:"2026-06-01", fact:{src:"IL", ref:"X-1"}, copy:{status:"free"}, equipment:[]};
const f = {id:"U-5", state:"WI", company:"NULLS LLC", date:"2026-05-01"};

test("F1: six fixtures yield the 13-column header and five filings in first-seen order", () => {
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

test("F1: karte wins over purchased status regardless of duplicate order", () => {
  assert.deepEqual(rowsFor([a, b]), rowsFor([b, a]));
});

test("F1: duplicate ties retain the first row", () => {
  const later = {...b, company:"LATER INDEX"};
  assert.deepEqual(rowsFor([b, later]), rowsFor([b]));
  assert.deepEqual(rowsFor([later, b]), rowsFor([later]));
  assert.deepEqual(rowsFor([a, {...a, company:"LATER READ"}]), rowsFor([a]));
});

test("F1: empty input returns only the header", () => {
  assert.deepEqual(rowsFor([], "x"), [head]);
});

// The complete original 12 lines, including whitespace and literal escapes.
const legacyExport = [
  'function csvEscape(v){ v = String(v==null?"":v); return /[",\\n]/.test(v) ? \'"\'+v.replace(/"/g,\'""\')+\'"\' : v; }',
  'document.getElementById("export").addEventListener("click", ()=>{',
  '  const list = filtered();',
  '  const head = ["登記id","州","会社","市","業種(マスター)","業種の根拠","作っている物","自社サイト","日系(名簿/人の確認=1・AI候補=?)","担保権者","貸し手の種類","担保の範囲","提出日","失効日","領域","工程","機種","メーカー(判定)","メーカー(逐語)","型式","製番","台数","自動化","出典URL","調べた日","確信度","人の確認","要約","推論","出典","登記番号"];',
  '  const rows = [];',
  '  for(const s of list){ const eq = (s.equipment && s.equipment.length) ? s.equipment : [{}];',
  '    for(const e of eq){ rows.push([s.id,s.state,s.company,s.city,s.industry,s.industry_basis==="master"?"自社サイト":"登記の読み",s.made??"",s.website??"",s.jp?"1":(s.jp_candidate?"?":""),s.secured_party??"",s.lender_label??"",s.scope??"",s.date,s.lapse??"",',
  '      e.domain??"",e.process??"",e.type??"",e.maker??"",e.maker_raw??"",e.model??"",e.serial??"",e.qty??"",e.automation?"1":"",e.source_url??"",e.checked_at??"",e.confidence??"",e.verified?"済":"未",s.summary??"",s.infer??"",s.fact.src,s.fact.ref]); } }',
  '  const csv = "\\ufeff" + [head, ...rows].map(r=>r.map(csvEscape).join(",")).join("\\r\\n");',
  '  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"}); const a = document.createElement("a"); a.href = URL.createObjectURL(blob);',
  '  a.download = `43sunsets-cockpit-ucc-machines-${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);',
  '});',
].join("\n");
const count = needle => html.split(needle).length - 1;

test("F2: original machine export occurs once as 12 consecutive verbatim lines", () => {
  assert.equal(legacyExport.split("\n").length, 12);
  assert.equal(count("\n" + legacyExport + "\n"), 1);
});

test("F2: buttons, extraction markers, CRM function and filtered call each occur once", () => {
  for (const needle of ['id="export"', 'id="export-crm"', "crmRows:begin", "crmRows:end", "function crmRows(list, origin)", "crmRows(filtered(), location.origin)"]) {
    assert.equal(count(needle), 1, needle);
  }
});

test("F2: exports wrapper rule and both download filename prefixes each occur once", () => {
  assert.equal(count(".exportbtn + .exportbtn{margin-left:8px;}"), 0);
  for (const needle of [".exports{margin-left:auto; display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:8px;} .exports .exportbtn{margin-left:0;}", "43sunsets-cockpit-ucc-machines-", "43sunsets-signal-ucc-crm-"]) {
    assert.equal(count(needle), 1, needle);
  }
});

test("F2: both export buttons are adjacent inside one exports wrapper", () => {
  assert.equal((html.match(/<span class="exports">\n\s*<button class="exportbtn" id="export"[^\n]*\n\s*<button class="exportbtn" id="export-crm"[^\n]*\n\s*<\/span>/g) || []).length, 1);
});
