(function(g){
  g.faceCards ||= {};
  g.faceCards.permits = function(row, ctx = {}) {
    const META = ctx.meta || null;
    const window = g;
    const faviSlot = (...args) => g.faviSlot(...args);
    const esc = v => String(v ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]);
function fmtUsd(v){ return v==null ? "" : "$"+v.toLocaleString("en-US"); }
const INV_TIP = {
  operator: "操業事業者 = 記録の本文に出てくる、そこで事業を営む会社(投資の意思決定者)",
  owner_occupier: "自社所有 = 登記名義が事業会社そのもの(自社の工場・施設への投資)",
  public: "公共 = 自治体・学区・公的機関",
  unknown: "未特定 = 名義が箱会社(SPE)・個人・施工者しか分からない。住所からの事業者照会で埋まり次第更新",
};
function cardHtml(s){
  let val = s.fact.value!=null ? `・評価額 <span class="mono">${fmtUsd(s.fact.value)}</span>` : "";
  if (s.amount) val = s.amount.stated_n == 0 ? "・記載額なし" : `・合計 <span class="mono">${fmtUsd(s.amount.total)}</span>(最大 ${fmtUsd(s.amount.max)}・記載 ${s.amount.stated_n}/${s.amount.member_n})`;
  const jp  = s.jp ? `<span class="chip jp">日系</span>` : "";
  const inf = s.infer ? `<div class="infer"><span class="badge-infer">推論</span>${s.infer}</div>` : "";
  // 投資主体(9/3 CEO 裁定 ①: 未特定でもカードに出す)。旧 s.company は後方互換(カルテのリンク用)
  const inv = s.investor || {name: s.company, basis: "unknown", label: "未特定"};
  const p = s.parties || {};
  // 出所は色や札で主張しない(9/3 CEO): 自社所有の名前にだけツールチップで「登記名義(課税台帳/許可記録)から」
  const srcNote = inv.basis === "owner_occupier" ? (p.owner_kind === "課税台帳" ? "登記名義(郡の課税台帳)から" : "登記名義(許可記録の所有者欄)から") : "";
  const invName = inv.name ? (s.company_id ? `<a class="companylink" href="/signal/company/?id=${/^C-\d+$/.test(s.company_id) ? s.company_id : ""}" target="_blank" rel="noopener" title="企業カルテ(4 つの情報源の出来事を 1 枚に)を開く${srcNote ? "・" + srcNote : ""}">${inv.name} ›</a>`
                             : s.karte ? `<button class="companylink" data-karte="${s.karte}" title="企業カルテを開く${srcNote ? "・" + srcNote : ""}">${inv.name} ›</button>` : `<span title="${srcNote}">${inv.name}</span>`)
                           : `<span class="unknown-inv">投資主体 未特定</span>`;
  const invChip = `<span class="chip inv ${inv.basis}" title="${INV_TIP[inv.basis] || ''}">${inv.label}</span>`;
  // 9/6 CEO: 名前の出所を小さな札で示す(推論か否かではなく「許可記録の本文/所有者欄/申請者欄・登記(郡台帳)・EPA 登録」は意味が違う)。一覧表(CSV)には出さない
  const SRC_TIP = {permit_text: "許可記録の本文に書かれた事業者名", permit_owner: "許可記録の所有者欄の名義(事業会社)", permit_applicant: "許可記録の申請者欄の事業者(施工者ではない)",
                   parcel: "郡の課税台帳(登記名義)から引いた土地所有者", epa: "EPA(米国環境保護庁)の施設登録に載る事業者。登録が古い可能性あり", google: "Google の事業所情報"};
  const srcChip = inv.name && inv.source_label ? `<span class="chip src" title="${SRC_TIP[inv.source] || ''}">${inv.source_label}</span>` : "";
  const partyBits = [];
  if (p.owner_of_record) partyBits.push(`登記名義: ${p.owner_of_record}${p.owner_is_spe ? "(箱会社)" : ""}${p.owner_kind === "課税台帳" ? "(課税台帳)" : ""}`);
  if (p.applicant) partyBits.push(`申請者: ${p.applicant}`);
  if (p.gc) partyBits.push(`施工者: ${p.gc}`);
  if (s.contractors_n != null) partyBits.push(`施工者 ${esc(s.contractors_n)} 社`);
  const parties = partyBits.length ? `<div class="parties">${partyBits.join("・")}</div>` : "";
  const nw = s.first_published_at ? g.faceUi.newChip(s) : s.new ? `<span class="chip newchip" title="${META ? META.new_rule : ''}">NEW</span>` : "";
  const note = s.note ? `<div class="loc" style="margin-top:4px">注記: ${s.note}</div>` : "";
  const src = "";
  const unc = s.category==="未分類" ? `<span class="chip" title="未分類 = AI が読んだ結果、設備投資の 5 分類のどれにも当てはまらない、または用途が読めず判定できない記録">未分類</span>` : `<span class="chip">${s.category}</span>`;
  return `<article class="card">
    ${srcChip ? `<div class="srcline">${srcChip}</div>` : ""}
    <div class="head"><span class="state">${s.state}</span><h3>${inv.name && window.faviSlot ? faviSlot(/^C-\d+$/.test(s.company_id||"") ? s.company_id : "", inv.name, s.website) : ""}${invName}</h3>${invChip}</div>
    <div>${nw}${jp}${unc}${s.kinds?.length ? s.kinds.slice(0,3).map(k=>`<span class="chip">${esc(k)}</span>`).join("") + (s.kinds.length>3 ? `<span class="chip">他 ${s.kinds.length-3}</span>` : "") : ""}<span class="chip">${s.industry}</span></div>
    ${parties}
    <div class="loc">${s.city}${s.amount?.member_n > 1 ? `・構成 ${s.amount.member_n} 件` : ""}</div>
    ${s.summary_ja ? `<div class="summary-ja">${esc(s.summary_ja)}</div>` : ""}<div class="summary">${s.summary}</div>
    ${note}
    <div class="fact"><span class="flabel">事実(公的記録)</span>${s.fact.src}・${s.fact.ref}・<span class="mono">${s.date}</span>${val}${src}</div>
    ${inf}
  </article>`;
}
    return cardHtml(row);
  };
})(globalThis);
