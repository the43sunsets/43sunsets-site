import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../signal/freshness/index.html", import.meta.url), "utf8");

test("T-1: all six definition paragraphs avoid hardcoded 45 days and exactly two spans show the threshold", () => {
  const paragraphs = [...html.matchAll(/<div class="def">[\s\S]*?<p>([\s\S]*?)<\/p><\/div>/g)];
  assert.equal(paragraphs.length, 6);
  for (const [, paragraph] of paragraphs) {
    assert.ok(!paragraph.includes("45 日"));
  }
  assert.equal([...html.matchAll(/<span data-stale-days>/g)].length, 2);
});

test("T-2: JavaScript updates the threshold spans from stale_days", () => {
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(([, script]) => script).join("\n");
  assert.ok(scripts.includes('querySelectorAll("[data-stale-days]")'));
  assert.ok([...scripts.matchAll(/\bstale_days\b/g)].length >= 2);
});

test("T-3: the map projection keeps parallels([40, 45]) exactly once", () => {
  assert.equal([...html.matchAll(/parallels\(\[40, 45\]\)/g)].length, 1);
});

test("T-4: both threshold spans default to 60", () => {
  const defaults = [...html.matchAll(/<span data-stale-days>([^<]*)<\/span>/g)]
    .map(([, value]) => value);
  assert.deepEqual(defaults, ["60", "60"]);
});
