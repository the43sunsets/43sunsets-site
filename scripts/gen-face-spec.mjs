import { readFileSync, writeFileSync } from "node:fs";
const spec = JSON.parse(readFileSync(new URL("./face_spec.json", import.meta.url), "utf8"));
const note = "// 生成物 — scripts/gen-face-spec.mjs(元 = scripts/face_spec.json・cockpit faces/contract.py)。手で直さない。\n";
for (const [path, prefix] of [["../functions/signal/api/_face_spec.js", "export const FACE_SPEC"], ["../signal/assets/face-spec.js", "globalThis.FACE_SPEC"]]) {
  writeFileSync(new URL(path, import.meta.url), `${note}${prefix} = ${JSON.stringify(spec)};\n`);
}
