(function(g){
  g.faceCards ||= {};
  g.faceCards.news = function(row, ctx = {}) {
    const META = ctx.meta || null;
    const window = g;
    const faviSlot = (...args) => g.faviSlot(...args);
    const esc = v => String(v ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
    const STN = {IL:"イリノイ", IN:"インディアナ", MI:"ミシガン", OH:"オハイオ", WI:"ウィスコンシン"};
    const mono = src => `<span class="ph" aria-hidden="true">${esc((src||"·").replace(/^The /,"").slice(0,2).toUpperCase())}</span>`;
    const card = x => `<article class="ncard"><a href="${esc(x.url)}" target="_blank" rel="noopener" aria-hidden="true" tabindex="-1">${x.thumb ? `<span class="ph"><img src="${esc(typeof x.thumb === "object" ? x.thumb.url : x.thumb)}" alt="" loading="lazy"></span>` : mono(x.media_name || x.source)}</a>${typeof x.thumb === "object" && ["og","press","stock"].includes(x.thumb?.layer) && x.thumb.credit ? `<span class="credit">${esc(x.thumb.credit)}</span>` : ""}
      <div><h3><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></h3>${x.summary_ja ? `<p>${esc(x.summary_ja)}</p>` : ""}
      <div class="m">${x.first_published_at ? g.faceUi.newChip(x) : ""}<span>${esc(x.media_name||x.source||"")}</span><span>${esc(x.published_at||"")}</span>${x.state ? `<span>${esc(STN[x.state]||x.state)}${x.city ? "・"+esc(x.city) : ""}</span>` : ""}${(x.tags||[]).map(t=>`<span class="chip">${esc(t)}</span>`).join("")}${x.relevance>=3 ? `<span class="rel3" title="特定の会社の具体的な動き">会社の動き</span>` : ""}${x.company_id ? `<a class="kar" href="/signal/company/?id=${esc(x.company_id)}" target="_blank" rel="noopener" title="企業カルテを開く">${esc(x.company || "企業カルテ")} ↗</a>` : (x.company ? `<span>${esc(x.company)}</span>` : "")}</div>${x.others_n > 0 ? `<details class="news-others"><summary>他 ${esc(x.others_n)} 媒体</summary>${(x.others||[]).map(o=>`<a href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.title)}・${esc(o.media_name)}・${esc(o.published_at)}</a>`).join("")}</details>` : ""}</div></article>`;
    return card(row);
  };
})(globalThis);
