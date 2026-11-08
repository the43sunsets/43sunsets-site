import { currentSession, json } from "../_lib.js";
import { sessionLimited } from "../_rate.js";
import { FACE_SPEC } from "./_face_spec.js";
import { sampleCondition } from "./_gate.js";

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
export function fail(status, message, extra) { throw new HttpError(status, message, extra); }
export function headers(session) {
  return { "cache-control": "no-store", vary: "cookie", "x-signal-mode": session ? "full" : "demo", ...(session ? { "x-signal-mark": session.sid.slice(0, 8) } : {}) };
}
export function endpoint(handler) {
  return async context => {
    let session = null;
    try {
      session = await currentSession(context.request, context.env);
      if (session && await sessionLimited(context.env, session.sid)) return json({ ok: false, error: "too many requests — 1 分ほど待ってから再読み込みしてください" }, 429, { ...headers(session), "retry-after": "60" });
      if (!context.env.FACES_DB) throw new Error("missing binding");
      const result = await handler({ ...context, session, db: context.env.FACES_DB, paramsQuery: new URL(context.request.url).searchParams });
      return result instanceof Response ? result : json(result, 200, headers(session));
    } catch (error) {
      if (error instanceof HttpError) return json({ ok: false, error: error.message, ...error.extra }, error.status, headers(session));
      console.warn("faces unavailable");
      return json({ ok: false, error: "faces unavailable" }, 503, headers(session));
    }
  };
}
export function faceSpec(face) {
  if (!Object.hasOwn(FACE_SPEC.faces, face)) fail(404, "unknown face");
  return FACE_SPEC.faces[face];
}
export function checkNames(params, names) {
  for (const key of params.keys()) if (!names.includes(key)) fail(400, "unknown argument");
}
export function single(params, name) {
  if (params.getAll(name).length > 1) fail(400, "bad argument");
  return params.get(name);
}
export function encodeCursor(values) {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  return btoa(Array.from(bytes, x => String.fromCharCode(x)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeCursor(text, name, length) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error();
    const decoded = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), x => x.charCodeAt(0))));
    if (!Array.isArray(decoded) || decoded.length !== length + 1 || decoded[0] !== name || encodeCursor(decoded) !== text || decoded.slice(1).some(v => v !== null && typeof v !== "string" && (typeof v !== "number" || !Number.isFinite(v)))) throw new Error();
    return decoded.slice(1);
  } catch { fail(400, "bad cursor"); }
}
export function orderBy(terms) {
  return terms.flatMap(([col, dir, nulls]) => nulls === "last" && dir === "asc" ? [`f.${col} IS NULL`, `f.${col} ASC`] : [`f.${col} ${dir.toUpperCase()}`]).join(", ");
}
export function afterCursor(terms, values) {
  const alternatives = [], args = [];
  for (let k = 0; k < terms.length; k++) {
    const [col, dir, nulls] = terms[k], value = values[k], c = `f.${col}`;
    let after;
    const tail = [];
    if (value === null) after = dir === "asc" && nulls !== "last" ? `${c} IS NOT NULL` : "0";
    else { after = dir === "desc" ? `(${c} < ? OR ${c} IS NULL)` : nulls === "last" ? `(${c} > ? OR ${c} IS NULL)` : `${c} > ?`; tail.push(value); }
    const equal = terms.slice(0, k).map(([name], i) => { args.push(values[i]); return `f.${name} IS ?`; });
    args.push(...tail); alternatives.push(`(${[...equal, after].join(" AND ")})`);
  }
  return { sql: `(${alternatives.join(" OR ")})`, args };
}
export function faceQuery(face, spec, params, policy, csv = false) {
  const tagNames = new Map(Object.keys(spec.tags).filter(x => x !== "sample_axis").map(x => [x, x]));
  for (const [key, value] of Object.entries(spec.filters)) if (value?.place === "tag") tagNames.set(key, value.dim);
  const tags = [...tagNames.keys()];
  checkNames(params, [...Object.keys(spec.filters), ...tags, "period", "sort", "cursor", "limit", "view", ...(csv ? ["layout"] : [])]);
  if (csv && params.has("layout") && (single(params, "layout") !== "crm" || !["permits", "ucc"].includes(face))) fail(400, "bad value");
  // Unknown names and invalid filter types remain errors even when a sample ignores their values.
  for (const key of [...Object.keys(spec.filters), ...tags]) for (const value of params.getAll(key)) {
    if (value.length > 200 || (/^(INTEGER|REAL)\b/.test(spec.columns[key] || "") && !/^-?\d+(\.\d+)?$/.test(value))) fail(400, "bad value");
  }
  if (!csv && params.has("view") && single(params, "view") !== "1") fail(400, "bad value");
  const sample = policy !== "all";
  if (sample) return { ...sampleCondition(policy, face, params), sort: spec.default_sort, terms: spec.sorts[spec.default_sort], limit: null, sample: true };
  const sort = single(params, "sort") ?? spec.default_sort;
  if (!Object.hasOwn(spec.sorts, sort)) fail(400, "bad sort");
  const terms = spec.sorts[sort], parts = [], args = [];
  for (const col of Object.keys(spec.filters)) {
    if (spec.filters[col]?.place) continue;
    const values = params.getAll(col); if (!values.length) continue;
    parts.push(`f.${col} IN (${values.map(() => "?").join(",")})`); args.push(...values);
  }
  for (const dim of tags) {
    const values = params.getAll(dim); if (!values.length) continue;
    parts.push(`EXISTS (SELECT 1 FROM f_tag t WHERE t.face=? AND t.dim=? AND t.id=f.id AND t.value IN (${values.map(() => "?").join(",")}))`); args.push(face, tagNames.get(dim), ...values);
  }
  if (params.has("new")) {
    if (single(params, "new") !== "1") fail(400, "bad value");
    parts.push("f.first_published_at IS NOT NULL AND f.first_published_at >= (SELECT date(substr(generated_at, 1, 10), '-7 days') FROM f_meta WHERE face=?)"); args.push(face);
  }
  const period = single(params, "period") ?? spec.default_period;
  const periods = spec.periods ?? FACE_SPEC.periods, days = spec.period_days ?? FACE_SPEC.period_days;
  if (!periods.includes(period) || !Object.hasOwn(days, period) || !Number.isFinite(days[period])) fail(400, "bad period");
  parts.push("f.period_date >= (SELECT date(substr(generated_at, 1, 10), ?) FROM f_meta WHERE face=?)"); args.push(`-${days[period]} days`, face);
  let limit = 8;
  if (!csv) {
    const raw = single(params, "limit");
    if (raw !== null && (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 50)) fail(400, "bad limit");
    limit = raw === null ? 8 : Number(raw);
    const cursor = single(params, "cursor");
    if (cursor !== null) { const after = afterCursor(terms, decodeCursor(cursor, sort, terms.length)); parts.push(after.sql); args.push(...after.args); }
  }
  return { sql: parts.length ? parts.join(" AND ") : "1", args, terms, sort, limit, sample: false };
}
export async function batch(db, queries) {
  if (queries.length > 5) throw new Error("query budget");
  const out = await db.batch(queries.map(([sql, args = []]) => db.prepare(sql).bind(...args)));
  if (out.some(x => x.success === false || !Array.isArray(x.results))) throw new Error("query failed");
  return out.map(x => x.results);
}
export function card(row, spec, generatedAt) {
  const result = JSON.parse(row.card);
  const date = Date.parse(String(generatedAt).slice(0, 10));
  result.new = row.first_published_at != null && Number.isFinite(date) && row.first_published_at >= new Date(date - spec.NEW_DAYS * 864e5).toISOString().slice(0, 10);
  result.first_published_at = row.first_published_at ?? null;
  return result;
}
