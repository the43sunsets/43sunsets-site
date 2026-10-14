import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../signal/permits/index.html", import.meta.url), "utf8");
const facetVocab = html.match(/^function facetVocab\(meta, key, fallback\)\{.*\}/m)?.[0];
const constants = html.match(/^const DEFAULT_(?:INDUSTRIES_ON|CATEGORIES_OFF) = .*;$/gm);
const block = html.match(/\/\* default-facets:start \*\/([\s\S]*?)\/\* default-facets:end \*\//)?.[1];
assert.ok(facetVocab, "facetVocab must be a named, single-line function");
assert.equal(constants?.length, 2);
assert.ok(block, "default facet helpers must be inside the marked block");
const { defaultSelection, sameSet } = runInNewContext(
  [facetVocab, ...constants, block, "({ defaultSelection, sameSet })"].join("\n")
);

const vocabTest = readFileSync(new URL("./permits-facet-vocab.test.mjs", import.meta.url), "utf8");
const vocabLines = vocabTest.match(/^  const (?:category|industry) = \[.*\];$/gm);
assert.equal(vocabLines?.length, 2);
const { category, industry } = runInNewContext(vocabLines.join("\n") + "\n({ category, industry })");
const meta = { vocab: { category, industry } };

test("T-1: complete vocabulary applies the default industry and category sets", () => {
  const selected = defaultSelection(meta);
  assert.equal(selected.applied, true);
  assert.deepEqual(new Set(selected.industry), new Set(industry.slice(0, 13)));
  assert.deepEqual(new Set(selected.category), new Set(["操業の変化", "保全", "事務所・その他", "内容不明", "未分類"]));
  assert.equal(selected.category.has("工事でない記録"), false);
});

test("T-2: missing or incomplete vocabulary leaves both selections empty", () => {
  for (const value of [null, {}, { vocab: {} },
    { vocab: { industry: industry.slice(0, 12), category } },
    { vocab: { industry, category: category.filter(c => c !== "工事でない記録") } }]) {
    const selected = defaultSelection(value);
    assert.equal(selected.applied, false);
    assert.equal(selected.industry.size, 0);
    assert.equal(selected.category.size, 0);
  }
});

test("T-3: loading, filter status, reset and notice use the defaults", () => {
  assert.equal((html.match(/defaultSelection\(META\)/g) || []).length, 3);
  const status = html.match(/^.*const anyFilter = .*$/m)?.[0];
  assert.ok(status);
  assert.ok(status.includes("sameSet(sel.category"));
  assert.ok(status.includes("sameSet(sel.industry"));
  const reset = html.match(/document\.getElementById\("clear"\)\.addEventListener\("click", \(\)=>\{([\s\S]*?)\n\}\);/)?.[1];
  assert.ok(reset);
  assert.ok(!reset.includes("querySelectorAll('.fitem input').forEach(cb=>cb.checked=false)"));
  assert.ok(reset.includes("renderFilters();"));
  assert.ok(reset.includes('getElementById("jponly").checked = false'));
  assert.ok(reset.includes('getElementById("showunc").checked = false'));
  assert.ok(reset.includes("defaultSelection(META)"));
  assert.equal((html.match(/id="deffacets"/g) || []).length, 1);
  assert.match(html, /<div\b[^>]*id="deffacets"[^>]*\bhidden[^>]*>/);
});

test("T-4: sameSet compares membership and size independently of order", () => {
  assert.equal(sameSet(new Set(["a", "b"]), new Set(["b", "a"])), true);
  assert.equal(sameSet(new Set(["a", "b"]), new Set(["a", "c"])), false);
  assert.equal(sameSet(new Set(["a", "b"]), new Set(["a"])), false);
});
