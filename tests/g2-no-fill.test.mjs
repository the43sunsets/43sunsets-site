import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../signal/", import.meta.url);
function indexFiles(dir, prefix = "signal/") {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = prefix + entry.name;
    if (entry.isDirectory()) return indexFiles(new URL(entry.name + "/", dir), path + "/");
    return entry.isFile() && entry.name === "index.html" ? [path] : [];
  });
}
const files = [...indexFiles(root), ...readdirSync(new URL("assets/", root))
  .filter(name => name.endsWith(".js")).map(name => "signal/assets/" + name)].sort();
// Both checks use this match list so the acceptance-test regex mutation disables detection.
const matches = files.flatMap(path => {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  return [...source.matchAll(/Math\.max\(\s*1\s*,/g)].map(match => {
    const start = match.index;
    const lineStart = source.lastIndexOf("\n", start) + 1;
    const lineEnd = source.indexOf("\n", start);
    return {
      path,
      location: `${path}:${source.slice(0, start).split("\n").length}:${start - lineStart + 1}`,
      after: source.slice(start + match[0].length, start + match[0].length + 40),
      line: source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd),
    };
  });
});

test("G-2: every Math.max floor of 1 is pagination", () => {
  const invalid = matches.filter(({ after }) =>
    !["Math.ceil(", "page-1", "page - 1"].some(text => after.includes(text)));
  assert.deepEqual(invalid.map(({ location }) => location), [], "Non-pagination floor of 1");
});

test("G-2: UCC has no reduce and Math.max(1 on the same line", () => {
  const invalid = matches.filter(({ path, line }) => path === "signal/ucc/index.html"
    && line.includes("reduce(") && line.includes("Math.max(1"));
  assert.deepEqual(invalid.map(({ location }) => location), [], "UCC aggregation fills missing counts");
});
