(function (g) {
  const base = "/signal/api/";
  const specFor = face => { const spec = g.FACE_SPEC.faces[face]; if (!spec) throw new Error("unknown face"); return spec; };
  function params(face, selection = {}) {
    const spec = specFor(face), out = new URLSearchParams();
    const period = selection.period ?? spec.default_period;
    if (!spec.periods.includes(period)) throw new Error("bad period");
    out.set("period", period);
    for (const key of new Set([...Object.keys(spec.filters), ...Object.keys(spec.tags).filter(k => k !== "sample_axis")])) {
      const value = selection[key];
      if (key === "new") { if (value === true || value === 1 || value === "1") out.set("new", "1"); continue; }
      const values = value instanceof Set ? [...value] : Array.isArray(value) ? value : value == null ? [] : [value];
      for (const v of values) out.append(key, String(v));
    }
    if (selection.sort && selection.sort !== spec.default_sort) {
      if (!Object.hasOwn(spec.sorts, selection.sort)) throw new Error("bad sort");
      out.set("sort", selection.sort);
    }
    return out;
  }
  function url(face, selection, options = {}) {
    const query = params(face, selection);
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.limit) query.set("limit", options.limit);
    if (options.view && !options.csv) query.set("view", "1");
    if (options.layout) { if (!options.csv || options.layout !== "crm" || !["permits", "ucc"].includes(face)) throw new Error("bad layout"); query.set("layout", "crm"); }
    return `${base}face/${face}${options.csv ? ".csv" : ""}?${query}`;
  }
  function time(now = new Date()) { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now); }
  function unavailable(now) { return `一時的に読み込めません(${time(now)} CT に確認)`; }
  async function read(path, options = {}) {
    try {
      const response = await g.fetch(path, { cache: "no-store", credentials: "same-origin", ...options });
      if (!response.ok) { const error = new Error(unavailable()); error.status = response.status; throw error; }
      return { data: await response.json(), mode: response.headers.get("x-signal-mode"), mark: response.headers.get("x-signal-mark") };
    } catch (error) { if (error.status) throw error; throw new Error(unavailable()); }
  }
  function edition(generatedAt, now = new Date()) {
    if (!generatedAt) return "更新 —";
    const date = new Date(generatedAt);
    if (!Number.isFinite(date.getTime())) return "更新 —";
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "numeric", day: "numeric" }).formatToParts(date).map(p => [p.type, p.value]));
    return now - date > 30 * 3600000 ? `${parts.month}月${parts.day}日の版` : `更新 ${parts.month}/${parts.day} ${time(date)} CT`;
  }
  function pager(face, initial = {}) {
    let selection = { ...initial }, cursors = [null], index = 0, next = null, firstView = true, revision = 0;
    async function load() {
      const requestRevision = ++revision, requestIndex = index;
      const path = url(face, selection, { cursor: cursors[index], view: firstView }); firstView = false;
      const result = await read(path);
      if (requestRevision !== revision) return { ...result, stale: true };
      next = result.data.next_cursor;
      return { ...result, page: requestIndex + 1 };
    }
    return {
      load,
      reset(value = {}) { selection = { ...value }; cursors = [null]; index = 0; next = null; return load(); },
      next() { if (!next) return Promise.resolve(null); cursors[++index] = next; return load(); },
      previous() { if (!index) return Promise.resolve(null); --index; return load(); },
      first() { index = 0; return load(); },
      get state() { return { page: index + 1, hasPrevious: index > 0, hasNext: !!next }; }
    };
  }
  const companyUrl = (id, options = {}) => { const q = new URLSearchParams(); if (options.face) q.set("face", options.face); if (options.cursor) q.set("cursor", options.cursor); return `${base}company/${encodeURIComponent(id)}${q.size ? "?" + q : ""}`; };
  const detailUrl = id => `${base}detail/${encodeURIComponent(id)}`;
  g.faceApi = { params, url, pager, read, unavailable, edition, companyUrl, detailUrl,
    meta: face => read(`${base}meta/${face}`),
    company: (id, options) => read(companyUrl(id, options)),
    detail: id => read(detailUrl(id)),
    csvUrl: (face, selection, layout) => url(face, selection, { csv: true, layout }),
    interest: (face, id) => read(`${base}interest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ face, id }) })
  };
})(globalThis);
