import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const words = JSON.parse(read("cockpit/data/g5-words.json"));
const blank = text => text.replace(/[^\r\n]/g, " ");
function withoutComments(source) {
  return source
    .replace(/^[\t ]*\/\/[^\r\n]*/gm, blank)
    .replace(/([;}\{),][\t ]{2,})\/\/[^\r\n]*/g, (match, prefix) => prefix + blank(match.slice(prefix.length)))
    .replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, blank);
}
function indexFiles(path) {
  return readdirSync(new URL("../" + path, import.meta.url), { withFileTypes: true }).flatMap(entry => {
    const child = path + entry.name;
    if (child === "signal/admin") return [];
    if (entry.isDirectory()) return indexFiles(child + "/");
    return entry.isFile() && entry.name === "index.html" ? [child] : [];
  });
}
const files = [...indexFiles("signal/"),
  ...readdirSync(new URL("../signal/assets/", import.meta.url))
    .filter(name => name.endsWith(".js")).map(name => "signal/assets/" + name),
  "functions/cockpit/data/[[path]].js",
].sort();

test("G-5 (1): the copied word list has a version", () => {
  assert.ok(words.version.startsWith("g5-words-v"));
});

test("G-5 (2): public pages and scripts contain no prohibited IDs or words outside comments", () => {
  const violations = [];
  for (const path of files) {
    const source = withoutComments(read(path));
    const page = "/" + path.replace(/index\.html$/, "");
    const patterns = words.allow.pages_ids_ok.includes(page) ? [] : words.id_patterns;
    for (const pattern of patterns) {
      for (const match of source.matchAll(new RegExp(pattern, "g"))) {
        violations.push(`${path}:${source.slice(0, match.index).split("\n").length}: ${match[0]}`);
      }
    }
    source.split("\n").forEach((line, index) => {
      for (const word of words.words_ja) {
        if (line.includes(word)) violations.push(`${path}:${index + 1}: ${word}`);
      }
    });
  }
  assert.deepEqual(violations, [], violations.join("\n"));
});

test("G-5 (3): the primary hero button opens permits", () => {
  const hero = read("signal/index.html").match(/<p class="hero-cta">([\s\S]*?)<\/p>/)?.[1];
  assert.ok(hero, "hero-cta must exist");
  const buttons = [...hero.matchAll(/<a\b[^>]*class="btn primary"[^>]*>/g)];
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0][0].match(/href="([^"]+)"/)?.[1], "/signal/permits/");
});

test("G-5 (4): pick tags match WHY and titles need no stripping", () => {
  const source = read("signal/index.html");
  const why = source.match(/const WHY = (\{[^\n]+\});/)?.[1];
  assert.ok(why, "WHY must exist");
  assert.deepEqual(Object.keys(JSON.parse(why)).sort(), ["日系", "大型", "連続投資", "交差", "自動化"].sort());
  assert.ok(!source.includes("stripJp"));
});

test("G-5 (5): sample cards and news are readable and company locks have no fake rows", () => {
  const demo = read("signal/assets/nav.js").match(/window\.sgDemo = function\(info\)\{([\s\S]*?)\n  \};/)?.[1];
  assert.ok(demo, "sgDemo must exist");
  assert.ok(!demo.includes("sg-blur"));
  assert.ok(demo.includes("sg-sample"));
  const newsDemo = read("signal/macro/index.html").match(/if\(n\.demo\)\{([\s\S]*?)\n    \}/)?.[1];
  assert.ok(newsDemo, "n.demo block must exist");
  assert.ok(!newsDemo.includes("sg-blur"));
  assert.ok(!read("signal/company/index.html").includes("20XX-XX-XX"));
});

test("G-5 (6): company locks have no blurred body rule", () => {
  assert.ok(!read("signal/assets/cockpit.css").includes(".sg-lock-body"));
});

test("G-5 (7): company reference expressions do not render internal IDs", () => {
  const references = read("signal/company/index.html").split("\n")
    .filter(line => line.includes('<div class="kref">'));
  assert.equal(references.length, 3);
  for (const line of references) {
    for (const field of ["i.source_id", "i.id]", "u.id]", "g.id]"]) {
      assert.ok(!line.includes(field), `company kref must not contain ${field}`);
    }
  }
});
