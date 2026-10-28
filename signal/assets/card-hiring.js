(function(g){
  g.faceCards ||= {};
  g.faceCards.hiring = function(row, ctx = {}) {
    const META = ctx.meta || null;
    const window = g;
    const faviSlot = (...args) => g.faviSlot(...args);
    const isCross = s => (s.faces.permits+s.faces.ucc+s.faces.grants)>0;
const esc=t=>String(t==null?"":t).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function cardHtml(s){
  const types=s.types.map(t=>`<span class="chip type">${esc(t)}</span>`).join(""); const jp=s.jp?`<span class="chip jp">日系</span>`:"";
  const cross=isCross(s)?`<span class="chip cross" title="許可 ${s.faces.permits}・UCC ${s.faces.ucc}・補助金 ${s.faces.grants}">他の情報源 ${s.faces.permits+s.faces.ucc+s.faces.grants} 件</span>`:"";
  const roles=Object.entries(s.by_role||{}).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<span>${esc(k)} <b>${v}</b></span>`).join("");
  const titles=(s.titles||[]).map(t=>`<li>${t.url?`<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.t)}</a>`:esc(t.t)}${t.posted?` <span>(${esc(t.posted)})</span>`:""}${t.posted && ctx.generated_at && t.posted >= new Date(Date.parse(ctx.generated_at.slice(0,10)) - 7*864e5).toISOString().slice(0,10) ? `<span class="chip">掲載 7 日以内</span>` : ""}</li>`).join("");
  const prev=s.prev30!=null?`・30 日前 <span class="mono">${s.prev30}</span>`:"";
  return `<article class="card"><div class="srcline"><span class="chip src" title="採用ページの公開 API">${esc(s.source)}</span></div>
    <div class="head"><span class="state">${esc(s.state)}</span><h3>${window.faviSlot ? faviSlot(s.company_id, s.company, s.website) : ""}<a class="companylink" href="/signal/company/?id=${esc(s.company_id)}" target="_blank" rel="noopener" title="企業カルテを開く">${esc(s.company)} ›</a></h3></div>
    <div>${types}${jp}${cross}${s.first_published_at ? g.faceUi.newChip(s) : ""}${s.ats_scope?.scope === "group" ? `<span class="chip" title="グループ共通の採用ページ = 会社単位に切り分けられない">グループ計</span>` : ""}<span class="chip">${esc(s.industry)}</span></div>
    <div class="loc">${esc(s.city||"拠点不明")}・製造職の求人 <span class="num">${s.open_mfg}</span> 件(全 ${s.open_total ?? ""}${s.truncated ? "+" : ""})・直近 30 日の新規 <span class="mono">${s.new30 === null ? `—(観測 ${esc(s.days_observed)} 日)` : s.new30}</span>${prev}</div>
    <div class="roles">${roles}</div>
    <div class="fact"><span class="flabel">事実(求人の題名・逐語)</span><ul>${titles}</ul></div>
    <div class="obs">観測 ${s.days_observed} 日(${esc(s.observed_since)} から)・最新の掲載 ${esc(s.latest)}</div></article>`;
}
    return cardHtml(row);
  };
})(globalThis);
