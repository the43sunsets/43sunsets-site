(function(g){
  g.faceCards ||= {};
  g.faceCards.subsidies = function(row, ctx = {}) {
    const META = ctx.meta || null;
    const window = g;
    const faviSlot = (...args) => g.faviSlot(...args);
function fmtUsd(v){ if(v==null) return "—"; if(v>=1e6) return "$"+(v/1e6).toFixed(v>=1e8?0:1)+"M"; if(v>=1e3) return "$"+Math.round(v/1e3)+"k"; return "$"+Math.round(v); }
function esc(t){ return String(t==null?"":t).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function cardHtml(s){
  const jp = s.jp ? `<span class="chip jp" title="${esc(s.jp_basis||"")}">日系</span>` : "";
  const prog = s.program_label ? esc(s.program_label) : s.program_name ? `${esc(s.program_name)}(${esc(s.program)})` : (s.program ? `CFDA ${esc(s.program)}` : "");
  const link = s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${s.issuer_level==="州" ? "契約 ↗" : "記録 ↗"}</a>` : "";
  const basisTip = s.basis === "ai" ? `AI の読み(${esc((s.ai&&s.ai.model)||"")}・確信度 ${esc((s.ai&&s.ai.confidence)||"")})。低確信は「未分類」に置く` : "規則(制度番号・機関・本文の語)による割り当て。AI 読みが付き次第、置き換わる";
  const name = s.company_id ? `<a class="companylink" href="/signal/company/?id=${esc(s.company_id)}" target="_blank" rel="noopener" title="企業カルテ(建設許可・UCC・補助金を 1 枚に)を開く">${esc(s.recipient)} ›</a>` : esc(s.recipient);
  const summary = "";   // 9/8 CEO: 「AI のまとめ」欄は廃止 → 下の「推論」に統合(他の面と同じ型)
  const inferText = [s.summary, s.infer].filter(Boolean).join(" ");
  const infer = inferText ? `<div class="infer"><span class="badge-infer" title="当社 AI(${esc((s.ai&&s.ai.model)||"")})が記録を読んで書いた要約と、記録から読み取れる推論。事実は上の欄">推論</span>${esc(inferText)}</div>` : "";
  // 事実の本文: AI 読みの日本語訳があればそれを主に、英語の逐語は折り畳み(逐語は原文のまま残す規律)
  const verb = s.description_ja ? `<span class="verbatim">${esc(s.description_ja)}</span> <details class="verb-en"><summary>原文(英語)</summary>${esc(s.description)}</details>` : (s.description ? `<span class="verbatim">${esc(s.description.length>220 ? s.description.slice(0,220)+"…" : s.description)}</span>` : "");
  /* card:start */
  return `<article class="card">
    <div class="head"><span class="state">${esc(s.state)}</span><h3>${window.faviSlot ? faviSlot(s.company_id, s.recipient, s.website) : ""}${name}</h3><span class="chip kind" title="助成 = 返済不要の交付 / 融資 = 連邦の融資・保証">${esc(s.kind_label)}</span></div>
    <div class="loc">${esc(s.city||"")}</div>
    <div class="money"><span class="amount" title="${s.issuer_level==="州" ? "州の交付・控除額" : (s.kind==="grant" ? "交付額" : "融資額")}">${s.headline ? esc(s.headline.kind) + " " + fmtUsd(s.headline.value) : fmtUsd(s.amount)}</span>${s.headline && s.jobs_new != null ? `<span>+${esc(s.jobs_new)} 人</span>` : ""}<span class="when">決定 <span class="mono">${esc(s.date||"—")}</span></span></div>
    ${s.purpose_ja ? `<div class="purpose">${esc(s.purpose_ja.slice(0,40))}</div>` : ""}<div class="srcline"><span class="chip src" title="出し手の層と機関">${esc(s.issuer_level)}・${esc(s.issuer||"")}</span>${prog ? `<span class="prog">${prog}</span>` : ""}</div>
    <div><span class="chip stage" title="承認 = 審議会が決めた(これから建つ)/ 契約・交付 = 実行済み">${esc(s.stage)}</span><span class="chip" title="投資の種類 — ${basisTip}">${esc(s.category)}</span><span class="chip" title="業種 — ${basisTip}">${esc(s.industry)}</span>${jp}${s.layer ? `<span class="chip">${esc(({state_incentive:"州の誘致インセンティブ",local_abatement:"市・郡の減免",federal_capex:"連邦の製造支援・設備融資",rnd:"研究開発",training_other:"訓練・その他"})[s.layer] || s.layer)}</span>` : ""}${s.first_published_at ? g.faceUi.newChip(s) : ""}${s.investment ? `<span class="chip" title="予定投資額(州の契約に記載)">投資 ${fmtUsd(s.investment)}</span>` : ""}${s.jobs_new ? `<span class="chip" title="雇用の目標(新規)">雇用 ${s.jobs_new}</span>` : ""}</div>
    <details class="detail"><summary>詳細(記録の本文・履行期間・記録へのリンク・推論)</summary>
      <div class="fact"><span class="flabel">事実(公的記録)</span>${esc(s.issuer_level==="州" ? (s.issuer||"州") : "USAspending.gov")}・決定 <span class="mono">${esc(s.date||"—")}</span>${s.start_date?`・履行期間 <span class="mono">${esc(s.start_date)}</span>〜<span class="mono">${esc(s.end_date||"")}</span>`:""}・${s.kind==="grant"?"交付額":"融資額"} <span class="mono">${s.amount!=null?"$"+Math.round(s.amount).toLocaleString("en-US"):"—"}</span>${s.jobs_retained?`・雇用の維持 <span class="mono">${esc(s.jobs_retained)}</span>`:""}${link?"・"+link:""}${verb}</div>
      ${infer}
    </details>
  </article>`;
  /* card:end */
}
    return cardHtml(row);
  };
})(globalThis);
