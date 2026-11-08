(function(g){
  g.faceCards ||= {};
  g.faceCards.ucc = function(row, ctx = {}) {
    const META = ctx.meta || null;
    const window = g;
    const faviSlot = (...args) => g.faviSlot(...args);
    const NOISE = ctx.noise || new Set(["雑音","未分類"]);
function esc(v){ return String(v==null?"":v).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function eqHtml(eq){
  if(!eq || !eq.length) return "";
  const items = eq.map(e=>{ const bits=[]; if(e.qty) bits.push(`${e.qty} 台`); if(e.maker) bits.push(esc(e.maker)); if(e.model) bits.push(esc(e.model)); if(e.serial) bits.push(`<span class="mono">S/N ${esc(e.serial)}</span>`);
    const t = e.type ? ` — ${esc(e.type)}${e.process ? "(" + esc(e.process) + ")" : ""}${e.automation ? "・自動化" : ""}` : "";
    const src = e.source_url ? `<span class="src"><a href="${esc(e.source_url)}" target="_blank" rel="noopener">出典</a>${e.checked_at ? " " + e.checked_at : ""}${e.confidence==="low" ? "・低確信" : ""}${e.verified ? "・確認済" : ""}</span>` : (e.checked_at ? `<span class="src">${e.checked_at}・出典なし</span>` : "");
    return `<li><span class="dom">${esc(e.domain)}</span>${bits.join(" ")}${t}${src}</li>`; }).join("");
  return `<div class="fact" style="margin-top:6px"><span class="flabel" title="担保物欄の逐語+設備カタログ">設備</span><ul class="eqlist">${items}</ul></div>`;
}
function cardHtml(s){
  if (s.tier === "inference" || (s.tier != null && s.tier !== "fact" && (s.lender_class != null || s.first_published_at != null))) {
    const lender = ({maker_finance:"メーカー系金融",dealer:"機械商社",equipment_lessor:"設備リース専業"})[s.lender_class] || s.lender_class || "";
    const action = ctx.loggedIn ? `<button type="button" class="kinterest" data-id="${esc(s.id)}">気になる</button>` : `<a href="/signal/login/?next=${encodeURIComponent(ctx.page || "/signal/ucc/")}">登録すると気になる登記を印せます</a>`;
    return `<article class="card" data-id="${esc(s.id)}"><div class="head"><span class="state">${esc(s.state)}</span><h3>${window.faviSlot ? faviSlot(s.karte, s.company, s.website) : ""}${s.karte ? `<a class="companylink" href="/signal/company/?id=${esc(s.karte)}">${esc(s.company)} ›</a>` : esc(s.company)}</h3></div><div>${g.faceUi.newChip(s)}${s.jp ? '<span class="chip jp">日系</span>' : ""}</div><div class="loc">${esc(s.city)}・${esc(s.date)}</div><div class="infer">推定: 設備担保のおそれ(担保権者 ${esc(s.secured_party)} = ${esc(lender)})</div>${action}</article>`;
  }
  const jp  = s.jp ? `<span class="chip jp" title="${s.jp_basis==="roster" ? "総領事館 2025 名簿で確定" : "人の確認で確定"}">日系</span>` : (s.jp_candidate ? `<span class="chip" title="AI 判定のみ(名簿・人の確認なし)= 候補">日系?</span>` : ""); const nw = s.first_published_at ? g.faceUi.newChip(s) : s.new ? `<span class="chip newchip" title="${META ? META.new_rule : ''}">NEW</span>` : "";
  const kind = NOISE.has(s.kind) ? `<span class="chip">${s.kind}</span>` : "";
  const tier = s.tier==="infer" ? `<span class="chip tier-infer" title="索引のみ(債務者・担保権者・日付)。担保物の記載はまだ無い">索引のみ</span>` : (s.copy && s.copy.status==="purchased" ? `<span class="chip tier-fact" title="写しを取得済み(担保物の逐語あり)">写し取得済み・事実</span>` : "");
  const cand = s.candidate ? `<span class="chip cand" title="当社の購入規則に当たる行(${esc(s.candidate_reason||"")})。順次、写しを購入して担保物の記載を付けます">候補</span>` : "";
  const ind = `<span class="chip" title="${s.industry_basis==="master" ? "自社サイトの調査から" : "登記の読みから(自社サイト未調査)"}">${esc(s.industry)}${s.industry_basis==="master" ? "" : "?"}</span>`;
  const inf = s.infer ? `<div class="infer"><span class="badge-infer">推論</span>${esc(s.infer)}</div>` : "";
  const sp = s.secured_party ? `<div class="parties">担保権者: ${esc(s.secured_party)}${s.secured_party_city ? "(" + esc(s.secured_party_city) + ")" : ""}・${esc(s.lender_label)}${s.scope==="all_assets" ? "・包括担保" : s.scope==="mixed" ? "・特定設備+包括" : ""}</div>` : "";
  const made = s.made ? `${esc(s.made)}${s.website ? ` · <a href="${esc(s.website)}" target="_blank" rel="noopener">サイト</a>` : ""}` : "";
  const name = s.karte ? `<a class="companylink" href="/signal/company/?id=${esc(s.karte)}" title="企業カルテ(4 つの情報源の出来事を 1 枚に)を開く">${esc(s.company)} ›</a>` : esc(s.company);   // 9/5 CEO: カルテは会社 ID で 1 枚(/signal/company/)
  const eq = eqHtml(s.equipment);
  const fact = `<div class="fact"><span class="flabel">事実(公的記録)</span>${esc(s.fact.src)}・${esc(s.fact.ref)}・提出 <span class="mono">${s.date}</span>${s.lapse ? `・失効 <span class="mono">${s.lapse}</span>` : ""}・${esc(s.fact.status||"")}</div>`;
  const summ = `<div class="summary">${esc(s.summary)}</div>`;
  // 9/7 CEO: 重複を畳む。設備の箱があれば要約は details へ(要約は担保権者・設備・日付の言い直しのため)。
  const copy = "";
  return `<article class="card" data-id="${esc(s.id)}">
    <div class="head"><span class="state">${s.state}</span><h3>${window.faviSlot ? faviSlot(s.karte, s.company, s.website) : ""}${name}</h3></div>
    <div>${nw}${jp}${tier}${cand}${kind}${s.tier==="infer" ? "" : ind}</div>
    <div class="meta"><span>${esc(s.city)}</span>${made ? `<span>${made}</span>` : ""}<span>提出 <span class="mono">${s.date}</span>${s.lapse ? `・失効 <span class="mono">${s.lapse}</span>` : ""}${s.fact.status ? `・${esc(s.fact.status)}` : ""}</span></div>
    ${eq || summ}
    ${inf}
    ${s.tier==="infer" ? sp : ""}
    <details class="more"><summary>登記の詳細(担保権者・要約・登記番号)</summary>${s.tier==="infer" ? "" : sp}${eq ? summ : ""}${fact}</details>
    ${copy}
  </article>`;
}
    return cardHtml(row);
  };
})(globalThis);
