import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../signal/permits/index.html", import.meta.url), "utf8");
const src = html.match(/^function facetVocab\(meta, key, fallback\)\{.*\}/m)?.[0];
assert.ok(src, "facetVocab must be a named, single-line function");
const facetVocab = runInNewContext(src + "; facetVocab");
const categoryLine = 'const CATEGORIES = ["製造能力の増強","物流・倉庫の新設","データセンター建設","医療施設","研究・ラボ施設"];';
const industryLine = 'const INDUSTRIES = ["半導体・電子","医薬・ライフサイエンス","航空宇宙","軍事・防衛","自動車部品","機械・金属","食品・素材加工","物流・EC","データセンター","その他製造","未分類"];';

test("F1: missing or invalid vocabulary returns the same fallback reference", () => {
  const fallback = ["fallback"];
  for (const key of ["category", "industry"]) {
    for (const meta of [null, {}, { vocab: {} }, { vocab: { [key]: [] } },
      { vocab: { [key]: "x" } }, { vocab: { [key]: [1] } }]) {
      assert.equal(facetVocab(meta, key, fallback), fallback);
    }
  }
});

test("F1: pipeline vocabulary supplies all 5 categories and 23 industries in order", () => {
  const category = ["操業の変化", "保全", "事務所・その他", "内容不明", "工事でない記録"];
  const industry = ["物流・卸", "機械・電機", "化学・日用品", "食品・飲料", "金属・素材", "電子・計測", "自動車・輸送機器", "医薬・医療機器", "航空宇宙・防衛", "エネルギー・公益", "データセンター", "通信・交通インフラ", "その他製造", "小売・飲食", "医療", "教育", "宿泊", "行政・公共", "宗教・非営利", "不動産", "金融・保険", "個人向けサービス", "その他の事業体"];
  const meta = { vocab: { category, industry } };
  assert.deepEqual(facetVocab(meta, "category", []), category);
  assert.deepEqual(facetVocab(meta, "industry", []), industry);
});

test("F2: legacy constant declarations match e64bc27 verbatim", () => {
  assert.deepEqual(html.match(/^const CATEGORIES = .*$/gm), [categoryLine]);
  assert.deepEqual(html.match(/^const INDUSTRIES = .*$/gm), [industryLine]);
});

test("F2: the single defs line uses both vocabularies and preserves STATES", () => {
  const defs = html.match(/^\s*const defs = .*$/gm) || [];
  assert.equal(defs.length, 1);
  assert.equal(defs[0], '  const defs = [["f-state","state",STATES],["f-category","category",facetVocab(META,"category",CATEGORIES)],["f-industry","industry",facetVocab(META,"industry",INDUSTRIES)]];');
});

test("F2: each legacy constant occurs only in its declaration and defs", () => {
  for (const name of ["CATEGORIES", "INDUSTRIES"]) {
    assert.equal((html.match(new RegExp(`\\b${name}\\b`, "g")) || []).length, 2);
  }
});

test("F2: legacy meta with all nine keys retains both constant arrays by reference", () => {
  // Shape of legacy meta; no cockpit repository or public data is read.
  const meta = {
    generated_at: "2026-10-04T00:00:00+00:00",
    beta_states: ["IL", "IN", "MI", "OH", "WI"],
    policy: {},
    new_rule: "",
    funnel: {},
    sources: [],
    reader: "",
    more_files: {},
    unclassified_by_state: {},
  };
  const declarations = html.match(/^const (?:CATEGORIES|INDUSTRIES) = .*$/gm).join("\n");
  const { CATEGORIES, INDUSTRIES } = runInNewContext(declarations + "; ({ CATEGORIES, INDUSTRIES })");
  assert.equal(facetVocab(meta, "category", CATEGORIES), CATEGORIES);
  assert.equal(facetVocab(meta, "industry", INDUSTRIES), INDUSTRIES);
});
