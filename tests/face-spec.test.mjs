import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { FACE_SPEC } from "../functions/signal/api/_face_spec.js";
import { Faces } from "./_faces.mjs";
test("A1: Python JSON, server and browser contracts are equal and regeneration is byte stable", () => {
  const spec = JSON.parse(readFileSync("scripts/face_spec.json", "utf8")); assert.deepEqual(FACE_SPEC, spec);
  const files = ["functions/signal/api/_face_spec.js", "signal/assets/face-spec.js"], before = files.map(x => readFileSync(x));
  const context = {}; vm.runInNewContext(before[1].toString(), context); assert.deepEqual(JSON.parse(JSON.stringify(context.FACE_SPEC)), spec);
  execFileSync(process.execPath, ["scripts/gen-face-spec.mjs"]); files.forEach((x, i) => assert.deepEqual(readFileSync(x), before[i]));
  for (const file of ["face_spec.json", "faces-schema.sql"]) assert.deepEqual(readFileSync(`scripts/${file}`), execFileSync("git", ["show", `:scripts/${file}`]));
});
test("A1: schema exposes every contract column, sort/filter and c_item composite primary key", () => {
  const f = new Faces();
  try {
    for (const spec of Object.values(FACE_SPEC.faces)) {
      const columns = f.db.prepare(`PRAGMA table_info(${spec.table})`).all().map(x => x.name);
      for (const col of [...Object.keys(spec.columns), ...Object.keys(spec.filters).filter(k => !spec.filters[k]?.place), ...Object.values(spec.sorts).flat().map(x => x[0])]) assert.ok(columns.includes(col));
    }
    const cols = f.db.prepare("PRAGMA table_info(c_item)").all(); assert.deepEqual(cols.filter(x => x.pk).sort((a,b) => a.pk-b.pk).map(x => x.name), ["company_id", "face", "ord"]);
    assert.deepEqual(cols.map(x => x.name), ["company_id", "face", "ord", "id", "src_face", "item"]);
  } finally { f.db.close(); }
});
test("A20: rate extraction is verbatim and all other legacy gate bytes are unchanged", () => {
  const old = execFileSync("git", ["show", "0ca191d:functions/cockpit/data/[[path]].js"], { encoding: "utf8" }).split(/(?<=\n)/);
  const expected = old.slice(0,6).join("") + 'import { sessionLimited } from "../../signal/_rate.js";\n' + old.slice(6,35).join("") + old[37] + old.slice(55).join("");
  assert.equal(readFileSync("functions/cockpit/data/[[path]].js", "utf8"), expected);
  assert.equal(readFileSync("functions/signal/_rate.js", "utf8"), 'import { store } from "./_lib.js";\n\n' + old.slice(35,37).join("") + old.slice(38,55).join("").replace("async function sessionLimited", "export async function sessionLimited"));
});

test("B-7: face sort vocabularies match v1.2", () => {
  for (const [face, names] of Object.entries({permits:["new","old","amount_asc","amount_desc","meaning"],subsidies:["new","old","amount_asc","amount_desc"],ucc:["new","old","admin"],hiring:["new","mfg","types"],news:["new","relevance"]})) assert.deepEqual(Object.keys(FACE_SPEC.faces[face].sorts).sort(), names.sort());
});
