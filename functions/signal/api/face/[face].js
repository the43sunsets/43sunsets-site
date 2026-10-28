import { endpoint, faceSpec, faceQuery, batch, orderBy, card, encodeCursor, headers, fail, single } from "../_q.js";
import { facePolicy, gateKind, csvAllowed } from "../_gate.js";
import { CSV, csvText } from "../_csv.js";
import { logFaceDay } from "../../_lib.js";

export const onRequestGet = endpoint(async ({ env, db, session, params, paramsQuery, request }) => {
  const csv = params.face.endsWith(".csv"), face = csv ? params.face.slice(0, -4) : params.face;
  const spec = faceSpec(face);
  if (csv && !csvAllowed(session)) fail(401, "login required");
  if (csv && paramsQuery.has("layout") && (single(paramsQuery, "layout") !== "crm" || !["permits", "ucc"].includes(face))) fail(400, "bad value");
  if (csv && !Object.hasOwn(CSV, face)) fail(404, "unknown face");
  const q = faceQuery(face, spec, paramsQuery, facePolicy(spec, session), csv);
  const from = `FROM ${spec.table} f WHERE ${q.sql}`;
  if (csv) {
    // Count and guarded rows share one snapshot. No partial export or read of an oversized set.
    const [counts, rows] = await batch(db, [
      [`SELECT COUNT(*) AS n ${from}`, q.args],
      [`SELECT f.* ${from} AND (SELECT COUNT(*) ${from}) <= ? ORDER BY ${orderBy(q.terms)} LIMIT ?`, [...q.args, ...q.args, 5000, 5000]],
    ]);
    if (counts[0].n > 5000) fail(422, "条件を絞ってください", { count: counts[0].n });
    return new Response(csvText(face, rows.map(row => JSON.parse(row.card)), paramsQuery.get("layout"), new URL(request.url).origin), { headers: { ...headers(session), "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${paramsQuery.get("layout") === "crm" ? `43sunsets-signal-${face}-crm` : `43sunsets-cockpit-${CSV[face].name}`}-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  const [meta, found] = await batch(db, [
    ["SELECT generated_at FROM f_meta WHERE face=?", [face]],
    [`SELECT f.* ${from} ORDER BY ${orderBy(q.terms)}${q.sample ? "" : " LIMIT ?"}`, [...q.args, ...(q.sample ? [] : [q.limit + 1])]],
  ]);
  const more = !q.sample && found.length > q.limit, rows = more ? found.slice(0, q.limit) : found;
  if (session && paramsQuery.get("view") === "1" && gateKind(spec) !== "open") await logFaceDay(env, session.email, face);
  return { rows: rows.map(row => card(row, spec, meta[0]?.generated_at)), next_cursor: more ? encodeCursor([q.sort, ...q.terms.map(([col]) => rows.at(-1)[col])]) : null, generated_at: meta[0]?.generated_at ?? null };
});
