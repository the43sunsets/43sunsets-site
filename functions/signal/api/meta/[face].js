import { endpoint, faceSpec, checkNames, batch } from "../_q.js";
import { metaResult } from "../_gate.js";
export const onRequestGet = endpoint(async ({ db, session, params, paramsQuery }) => {
  faceSpec(params.face); checkNames(paramsQuery, []);
  const [meta, counts] = await batch(db, [
    ["SELECT face, generated_at, synced_at, n_total, meta FROM f_meta WHERE face=?", [params.face]],
    ["SELECT key, period, n FROM f_count WHERE face=? ORDER BY key, period", [params.face]],
  ]);
  return metaResult({ f_meta: meta[0] ? { ...meta[0], meta: JSON.parse(meta[0].meta) } : null, f_count: counts.map(row => ({ ...row, key: JSON.parse(row.key) })) }, session);
});
