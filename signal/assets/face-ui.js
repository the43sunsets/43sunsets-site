(function (g) {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let termsPromise, styled = false;
  function terms() { return termsPromise ||= g.fetch("/signal/assets/terms.json?v=20261028", { cache: "no-store", credentials: "same-origin" }).then(r => { if (!r.ok) throw new Error("terms unavailable"); return r.json(); }); }
  function newChip(row, fallback = "") {
    if (row.new !== true) return "";
    const date = row.first_published_at;
    // Date-only publication values are calendar dates, not midnight UTC instants.
    let day = date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}` : "";
    if (date?.includes("T") && Number.isFinite(Date.parse(date))) day = new Intl.DateTimeFormat("en-US", {timeZone:"America/Chicago",month:"numeric",day:"numeric"}).format(new Date(date));
    const title = date ? `面に加わった日 ${day}` : fallback;
    return `<span class="chip newchip" title="${esc(title)}">NEW</span>`;
  }
  const number = n => n == null ? "—" : String(n);
  function band(meta, { demo = false, records = null, newOnly = false } = {}) {
    return `<span class="face-band" title="${records == null ? "" : `記録 +${esc(records)} 行`}">${demo ? `全体で今日 +${number(meta.new_today)} 枚(登録すると全部)` : `今日 面に加わったカード +${number(meta.new_today)}`}</span>${newOnly ? `<span class="face-new-total">新着(7 日)全体 ${number(meta.new_7d)} 件</span>` : ""}`;
  }
  function defaults(config) {
    const state = { period: g.FACE_SPEC.faces[config.face].default_period, sort: g.FACE_SPEC.faces[config.face].default_sort, new: false };
    for (const f of config.filters || []) state[f.key] = [...(f.default || [])];
    for (const t of config.toggles || []) state[t.id] = t.default ?? false;
    return state;
  }
  function selection(config, state, vocab = {}) {
    const out = { period: state.period, sort: state.sort, new: state.new };
    for (const f of config.filters || []) out[f.key] = state[f.key] || [];
    for (const t of config.toggles || []) {
      const value = state[t.id] ? t.on : t.off;
      if (t.param && value != null) out[t.param] = value;
    }
    for (const rule of config.exclude || []) {
      if (state[rule.toggle]) continue;
      const chosen = out[rule.key]?.length ? out[rule.key] : vocab[rule.key] || [];
      out[rule.key] = chosen.filter(v => !(rule.values || []).includes(v));
    }
    return out;
  }
  function controls(config, state, counts = {}, demo = false, dictionary = {}) {
    const disabled = key => demo && (config.demoDisable || ["period", "sort", "new"]).includes(key) ? " disabled" : "";
    const n = value => number(state.new ? null : value);
    const periods = config.periods.map(([value, label]) => `<button type="button" data-period="${esc(value)}" aria-pressed="${state.period === value}"${disabled("period")}>${esc(label)} <span>${n(counts.periods?.[value])}</span></button>`).join("");
    const sorts = `<select data-sort aria-label="並び"${disabled("sort")}>${config.sorts.map(([value, label]) => `<option value="${esc(value)}"${state.sort === value ? " selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
    const toggles = [{ id: "new", label: "新着のみ" }, ...(config.toggles || [])].map(t => `<label><input type="checkbox" data-toggle="${esc(t.id)}"${state[t.id] ? " checked" : ""}${disabled(t.id)}>${esc(t.label)}</label>`).join("");
    const facets = (config.filters || []).map(f => `<fieldset><legend>${esc(f.label)}</legend>${(counts.facets?.[f.key] || []).map(({ value, n: total }, i) => {
      const tip = dictionary[`${config.face}.${f.key}`]?.[value] || f.tip;
      const id = `face-tip-${config.face}-${f.key}-${i}`;
      return `<label${tip ? ` title="${esc(tip)}"` : ""}><input type="checkbox" data-facet="${esc(f.key)}" value="${esc(value)}"${(state[f.key] || []).includes(value) ? " checked" : ""}${tip ? ` aria-describedby="${id}"` : ""}>${esc(value)} <span>${n(total)}</span></label>${tip ? `<span class="face-tip" id="${id}">${esc(tip)}</span>` : ""}`;
    }).join("")}</fieldset>`).join("");
    return `<div class="toolbar face-controls"><div class="seg-period">${periods}</div>${sorts}${toggles}</div><div class="face-facets">${facets}</div>`;
  }
  function mount(config) {
    const root = config.root || document.querySelector(config.target || "[data-face-controls]");
    if (!root) throw new Error("face controls container missing");
    if (!styled) { const style = document.createElement("style"); style.textContent = '.face-controls{display:flex;flex-wrap:wrap;gap:8px}.face-tip{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.face-band,.face-new-total{display:inline-block;margin:4px}.face-facets fieldset{border:0}.face-facets label{display:inline-block;margin:4px}'; document.head.appendChild(style); styled = true; }
    let state = defaults(config), counts = {}, demo = false, dictionary = {}, meta = {}, records = null;
    function draw() {
      root.innerHTML = controls(config, state, counts, demo, dictionary);
      if (config.bandRoot) config.bandRoot.innerHTML = band(meta, { demo, records, newOnly: state.new });
      if (config.hitRoot) config.hitRoot.textContent = number(state.new ? null : counts.total);
    }
    function changed() { draw(); config.onChange?.(selection(config, state, config.vocab), state); }
    root.addEventListener("click", e => { const value = e.target.closest?.("[data-period]"); if (value && !value.disabled) { state.period = value.dataset.period; changed(); } });
    root.addEventListener("change", e => {
      const el = e.target; if (el.disabled) return;
      if (el.hasAttribute("data-sort")) state.sort = el.value;
      else if (el.dataset.toggle) state[el.dataset.toggle] = el.checked;
      else if (el.dataset.facet) { const key = el.dataset.facet; state[key] = [...root.querySelectorAll("[data-facet]")].filter(x => x.dataset.facet === key && x.checked).map(x => x.value); }
      changed();
    });
    draw();
    const ready = terms().then(value => { dictionary = value; draw(); });
    return { ready, get state() { return { ...state }; }, reset() { state = defaults(config); changed(); }, update(value = {}) { counts = value.counts ?? counts; demo = value.demo ?? demo; meta = value.meta ?? meta; records = value.records ?? records; draw(); }, selection: () => selection(config, state, config.vocab) };
  }
  g.faceUi = { terms, newChip, band, controls, defaults, selection, mount, number };
})(globalThis);
