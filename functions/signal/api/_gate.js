import { FACE_SPEC } from "./_face_spec.js";

// §3.5: 経路 × ログインの有無の正本。見本の選択そのものは同期側が行う。
export const GATE = {
  face: { full: "all", demo: { open: "all", sample: "is_sample", sample_axis: "sample_axis" } },
  meta: { full: "all", demo: "with_demo" },
  company: { full: "all", demo: { open: ["permits"], timeline: { face: "timeline", src_face: "permits" }, locked: "count_only" } },
  search: { full: "all", demo: "all" },
  csv: { full: "all", demo: "deny" },
};
export function gateKind(spec) {
  return spec.sample.rule === "none" ? "open" : spec.sample.rule === "axis" ? "sample_axis" : "sample";
}
export function facePolicy(spec, session) {
  return session ? GATE.face.full : GATE.face.demo[gateKind(spec)];
}
export function sampleCondition(policy, face, params) {
  if (policy === "is_sample") return { sql: "f.is_sample = ?", args: [1] };
  if (policy === "sample_axis") {
    const axis = params.getAll("axis");
    return { sql: `EXISTS (SELECT 1 FROM f_tag t WHERE t.face=? AND t.dim=? AND t.id=f.id${axis.length ? ` AND t.value IN (${axis.map(() => "?").join(",")})` : ""})`, args: [face, policy, ...axis] };
  }
  return { sql: "1", args: [] };
}
export function companyCondition(session) {
  if (session) return { sql: "1", args: [] };
  const { open, timeline } = GATE.company.demo;
  return { sql: `(face IN (${open.map(() => "?").join(",")}) OR (face = ? AND src_face = ?))`, args: [...open, timeline.face, timeline.src_face] };
}
export function companyLocked(face, session) {
  const { open, timeline } = GATE.company.demo;
  return !session && !open.includes(face) && face !== timeline.face;
}
export function companyHeader(header, session, timelineCount) {
  if (session) return header;
  const faces = {};
  for (const face of FACE_SPEC.c_item.faces) {
    if (face === GATE.company.demo.timeline.face) continue;
    faces[face] = companyLocked(face, session) ? { count: header.faces?.[face]?.count || 0, locked: true } : header.faces?.[face] || { count: 0, items: [] };
  }
  return { ...header, demo: true, faces, n_timeline: timelineCount };
}
export function metaResult(body, session) {
  return !session && GATE.meta.demo === "with_demo" ? { ...body, demo: body.f_meta?.meta?.demo ?? null } : body;
}
export function csvAllowed(session) { return GATE.csv[session ? "full" : "demo"] !== "deny"; }
