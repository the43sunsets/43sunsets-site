import { endpoint, checkNames, single, batch, fail, decodeCursor, encodeCursor } from "../_q.js";
import { FACE_SPEC } from "../_face_spec.js";
import { GATE, companyCondition, companyLocked, companyHeader } from "../_gate.js";
import { logFaceDay, logCompanyView } from "../../_lib.js";

export const onRequestGet = endpoint(async ({ env, db, session, params, paramsQuery }) => {
  const id = params.id;
  if (!/^C-\d+$/.test(id) || id.trim() !== id) fail(400, "bad company");
  checkNames(paramsQuery, ["face", "cursor"]);
  const face = single(paramsQuery, "face"), cursor = single(paramsQuery, "cursor");
  if (face !== null && !FACE_SPEC.c_item.faces.includes(face)) fail(400, "bad face");
  if (face && companyLocked(face, session)) fail(403, "login required");
  let ord = null;
  if (cursor !== null) {
    if (!face) fail(400, "bad cursor");
    [ord] = decodeCursor(cursor, face, 1);
    if (!Number.isSafeInteger(ord)) fail(400, "bad cursor");
  }
  const gate = companyCondition(session), pageSize = FACE_SPEC.page_size;
  const where = `company_id=? AND ${gate.sql}${face ? " AND face=?" : ""}`;
  const args = [id, ...gate.args, ...(face ? [face] : [])];
  // Counts include the whole gated section, even when the supplied cursor exhausts it.
  const query = `WITH eligible AS (SELECT face, ord, item FROM c_item WHERE ${where}),
    totals AS (SELECT face, COUNT(*) AS cnt FROM eligible GROUP BY face),
    numbered AS (SELECT face, ord, item, ROW_NUMBER() OVER (PARTITION BY face ORDER BY ord) AS rn FROM eligible${ord === null ? "" : " WHERE ord > ?"}),
    page AS (SELECT face, ord, item FROM numbered WHERE rn <= ?)
    SELECT totals.face, page.ord, page.item, totals.cnt FROM totals LEFT JOIN page ON page.face=totals.face ORDER BY totals.face, page.ord`;
  const timeline = GATE.company.demo.timeline;
  const [companies, found] = await batch(db, [
    [session ? "SELECT header FROM company WHERE id=?" : "SELECT header, (SELECT COUNT(*) FROM c_item WHERE company_id=? AND face=? AND src_face=?) AS timeline_n FROM company WHERE id=?", session ? [id] : [id, timeline.face, timeline.src_face, id]],
    [query, [...args, ...(ord === null ? [] : [ord]), pageSize + 1]],
  ]);
  if (!companies.length) fail(404, "unknown company");
  const header = companyHeader(JSON.parse(companies[0].header), session, companies[0].timeline_n);
  const faces = {};
  for (const name of face ? [face] : FACE_SPEC.c_item.faces) {
    if (companyLocked(name, session)) { faces[name] = header.faces[name]; continue; }
    const section = found.filter(row => row.face === name), all = section.filter(row => row.item !== null), rows = all.slice(0, pageSize), more = all.length > pageSize;
    const n = section[0]?.cnt ?? 0;
    faces[name] = { rows: rows.map(row => JSON.parse(row.item)), next_cursor: more ? encodeCursor([name, rows.at(-1).ord]) : null, n };
  }
  if (session && face === null && cursor === null) { await logFaceDay(env, session.email, "company"); await logCompanyView(env, session.email, id); }
  return { header, faces };
});
