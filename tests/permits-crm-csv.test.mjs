import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../signal/permits/index.html", import.meta.url), "utf8");
const src = html.match(/\/\* crmRows:begin \*\/([\s\S]*?)\/\* crmRows:end \*\//)?.[1];
assert.ok(src, "crmRows must be enclosed by its extraction markers");
const crmRows = runInNewContext(src + "; crmRows");
// Convert VM arrays to this realm so strict deep equality compares their values.
const rowsFor = (list, origin = "https://43sunsets.com") => Array.from(crmRows(list, origin), row => Array.from(row));
const head = ["会社名","市","州","住所","出来事","日付","申請日","評価額USD","記録の参照","情報源","企業ページ","要約(AI付与)","Signalの許可ID"];
const a = {id:"S-74223", state:"OH", city:"Clermont County・2565 OLD SR 32 BATAVIA OH", company:"COOPER STEEL OF OHIO LLC", investor:{name:"COOPER STEEL OF OHIO LLC", basis:"owner_occupier", label:"自社所有"}, category:"製造能力の増強", date:"2026-10-05", applied:"2026-06-12", fact:{src:"Clermont County 建築許可(公開記録)", ref:"許可 B-075373-2026 Commercial Alteration Permit", value:16000000}, company_id:"C-15484", summary:"Cooper Steel of Ohio の工場の改修工事 $16M。"};
const b = {id:"S-2", state:"IL", city:"Chicago・123 N STATE ST, Chicago, IL, 60602", investor:{name:'ACME, "THE" CO', basis:"operator", label:"操業事業者"}, category:"物流・倉庫の新設", date:"2026-09-30", applied:null, fact:{src:"シカゴ市 建築許可(公開記録)", ref:"許可 100999 NEW CONSTRUCTION", value:null}, company_id:null, summary:"要約, B"};
const c = {id:"S-3", state:"IL", city:"Evanston", investor:{name:null, basis:"unknown", label:"未特定"}, category:"未分類", date:"", applied:"2026-01-02", fact:{src:"Evanston 建築許可(公開記録)", ref:"", value:null}, company_id:"C-abc", summary:""};
const d = {id:"S-4", state:"IL", city:"Peoria・1 MAIN ST", company:"所有者・申請者の記載なし", category:"医療施設", date:"2026-03-03", fact:{src:"Peoria 建築許可(公開記録)", ref:"許可 P-1"}};
const e = {id:"S-5", state:"WI", city:"Madison・2 OAK AVE", investor:{name:"MADISON METRO SCHOOL DIST", basis:"public", label:"公共"}, category:"研究・ラボ施設", date:"2026-02-02", applied:"2026-01-01", fact:{src:"Madison 建築許可(公開記録)", ref:"許可 W-5 ALTERATION", value:250000.5}, company_id:"C-7", summary:"要約 E"};
const f = {id:"S-6", state:"WI"};

test("F1: six fixtures yield the 13-column header and six permits in input order", () => {
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

test("F1: duplicate permits remain separate rows", () => {
  const row = rowsFor([a], "x")[1];
  assert.deepEqual(rowsFor([a, a], "x"), [head, row, row]);
});

test("F1: empty input returns only the header", () => {
  assert.deepEqual(rowsFor([], "x"), [head]);
});

test("F1: company page uses the supplied origin", () => {
  assert.equal(rowsFor([a], "https://example.test")[1][10], "https://example.test/signal/company/?id=C-15484");
});

// The complete original 14 lines; the single BOM escape becomes the HTML's literal BOM.
const legacyExport = [
  'function csvEscape(v){ v = String(v==null?"":v); return /[",\\n]/.test(v) ? \'"\'+v.replace(/"/g,\'""\')+\'"\' : v; }',
  'document.getElementById("export").addEventListener("click", ()=>{',
  '  const list = filtered();',
  '  const head = ["id","州","市・所在","投資主体","投資主体の根拠","登記名義","登記名義の出所","名義は箱会社","申請者","施工者","名義の種別(AI)","業種","設備投資の種類","確信度","日付","申請日","評価額USD","日系","サマリー(AI付与)","注記(AI付与)","事実_出典","事実_参照","事実_逐語","推論(AI付与)"];',
  '  const rows = list.map(s=>{ const inv=s.investor||{}, p=s.parties||{}; return [s.id,s.state,s.city,inv.name??"",inv.label??"",p.owner_of_record??"",p.owner_kind??"",p.owner_is_spe?"1":"",p.applicant??"",p.gc??"",s.entity_type??"",s.industry,s.category,s.confidence??"",s.date,s.applied??"",s.fact.value??"",s.jp?"1":"",s.summary,s.note??"",s.fact.src,s.fact.ref,s.fact.verbatim,s.infer??""]; });',
  '  const csv = "\ufeff" + [head, ...rows].map(r=>r.map(csvEscape).join(",")).join("\\r\\n");',
  '  const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});',
  '  const a = document.createElement("a");',
  '  a.href = URL.createObjectURL(blob);',
  '  a.download = `43sunsets-cockpit-permits-${new Date().toISOString().slice(0,10)}.csv`;',
  '  document.body.appendChild(a);',
  '  a.click();',
  '  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);',
  '});',
].join("\n");
const count = needle => html.split(needle).length - 1;

test("F2: original permit export occurs once as 14 consecutive verbatim lines", () => {
  assert.equal(legacyExport.split("\n").length, 14);
  assert.equal(count("\n" + legacyExport + "\n"), 1);
});

test("F2: buttons, extraction markers, CRM function and filtered call each occur once", () => {
  for (const needle of ['id="export"', 'id="export-crm"', "crmRows:begin", "crmRows:end", "function crmRows(list, origin)", "crmRows(filtered(), location.origin)"]) {
    assert.equal(count(needle), 1, needle);
  }
});

test("F2: exports wrapper rule and both download filename prefixes each occur once", () => {
  assert.equal(count(".exportbtn + .exportbtn"), 0);
  for (const needle of [".exports{margin-left:auto; display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:8px;} .exports .exportbtn{margin-left:0;}", '<span class="exports">', "43sunsets-cockpit-permits-", "43sunsets-signal-permits-crm-"]) {
    assert.equal(count(needle), 1, needle);
  }
});

test("F2: both export buttons are adjacent inside one exports wrapper", () => {
  assert.equal((html.match(/<span class="exports">\n\s*<button class="exportbtn" id="export"[^\n]*\n\s*<button class="exportbtn" id="export-crm"[^\n]*\n\s*<\/span>/g) || []).length, 1);
});
