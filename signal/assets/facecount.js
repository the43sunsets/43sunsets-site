// f_count keys contain scalar filters followed by sorted arrays of tag values.
(function (g) {
  function values(value) { return value == null ? [] : value instanceof Set ? [...value] : Array.isArray(value) ? value : [value]; }
  function dimensions(spec) { return [...spec.filter_order, ...spec.tag_order]; }
  function decoded(row) { return typeof row.key === "string" ? JSON.parse(row.key) : row.key; }
  function count(spec, rows, selection = {}, options = {}) {
    if (values(selection.new).some(x => String(x) === "1" || x === true)) return null;
    const periods = spec.periods, period = options.period ?? selection.period ?? spec.default_period;
    const end = periods.indexOf(period), dims = dimensions(spec);
    return rows.reduce((total, row) => {
      if (!options.includeArchived && (periods.indexOf(row.period) < 0 || periods.indexOf(row.period) > end)) return total;
      const key = decoded(row);
      const matches = dims.every((dim, i) => {
        if (dim === options.ignore) return true;
        const chosen = values(selection[dim]).map(String);
        return !chosen.length || values(key[i]).some(value => chosen.includes(String(value)));
      });
      return total + (matches ? row.n : 0);
    }, 0);
  }
  function vocabulary(spec, rows, dim, vocab = []) {
    const index = dimensions(spec).indexOf(dim);
    if (index < 0) return [];
    const totals = new Map();
    for (const row of rows) for (const value of new Set(values(decoded(row)[index]))) {
      if (value !== null && value !== "") totals.set(value, (totals.get(value) || 0) + row.n);
    }
    return [...totals.keys()].sort((a, b) => {
      const ai = vocab.indexOf(a), bi = vocab.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
      return totals.get(b) - totals.get(a) || String(a).localeCompare(String(b));
    });
  }
  function facets(spec, rows, selection, dim, vocab) {
    return vocabulary(spec, rows, dim, vocab).map(value => ({ value, n: count(spec, rows, { ...selection, [dim]: [value] }) }));
  }
  function periods(spec, rows, selection = {}) { return spec.periods.map(period => ({ period, n: count(spec, rows, selection, { period }) })); }
  function toggle(spec, rows, selection, dim, value, options = {}) { return count(spec, rows, { ...selection, [dim]: value }, options); }
  g.faceCount = { count, facets, periods, toggle, vocabulary };
})(globalThis);
