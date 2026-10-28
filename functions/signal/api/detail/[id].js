import { endpoint, batch, fail, checkNames } from "../_q.js";
import { gateKind } from "../_gate.js";
import { FACE_SPEC } from "../_face_spec.js";

export const onRequestGet = endpoint(async ({ db, session, params, paramsQuery }) => {
  const id = params.id;
  if (typeof id !== "string" || !id.length || id.length > 200 || /[\x00-\x1f\x7f]/.test(id)) fail(400, "bad id");
  checkNames(paramsQuery, []);
  if (!session && gateKind(FACE_SPEC.faces.permits) !== "open") fail(401, "login required");
  const [found] = await batch(db, [["SELECT * FROM f_permits_detail WHERE parent_id=? ORDER BY record_date ASC, id ASC LIMIT 501", [id]]]);
  const rows = found.slice(0, 500);
  return { rows, n: rows.length, ...(found.length > 500 ? { truncated: true } : {}) };
});
