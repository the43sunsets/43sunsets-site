// CSV の見出しと写像は各画面の通常 CSV から逐語で移したもの。
function csvEscape(v){ v = String(v==null?"":v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }
export const CSV = {
  permits: { name: "permits", rows(list) {
    const head = ["id","州","市・所在","投資主体","投資主体の根拠","登記名義","登記名義の出所","名義は箱会社","申請者","施工者","名義の種別(AI)","業種","設備投資の種類","確信度","日付","申請日","評価額USD","日系","サマリー(AI付与)","注記(AI付与)","事実_出典","事実_参照","事実_逐語","推論(AI付与)"];
  const rows = list.map(s=>{ const inv=s.investor||{}, p=s.parties||{}; return [s.id,s.state,s.city,inv.name??"",inv.label??"",p.owner_of_record??"",p.owner_kind??"",p.owner_is_spe?"1":"",p.applicant??"",p.gc??"",s.entity_type??"",s.industry,s.category,s.confidence??"",s.date,s.applied??"",s.fact.value??"",s.jp?"1":"",s.summary,s.note??"",s.fact.src,s.fact.ref,s.fact.verbatim,s.infer??""]; });
  return [head, ...rows];
  } },
  subsidies: { name: "subsidies", rows(list) {
    const head = ["id","州","市","受領者","企業カルテ","種別","出し手の層","機関","制度番号","制度名","金額USD","段階","決定日","履行開始","履行終了","投資の種類","業種","分類の出所","確信度","投資規模","日系","AI のまとめ","推論(AI)","本文(逐語)","URL"];
  const rows = list.map(s=>[s.id,s.state,s.city??"",s.recipient,s.company_id??"",s.kind_label,s.issuer_level,s.issuer??"",s.program??"",s.program_name??"",s.amount??"",s.stage,s.date??"",s.start_date??"",s.end_date??"",s.category,s.industry,s.basis==="ai"?"AI":"規則",(s.ai&&s.ai.confidence)||"",s.size,s.jp?"1":"",s.summary??"",s.infer??"",s.description,s.url??""]);
  return [head, ...rows];
  } },
  hiring: { name: "hiring", rows(list) {
    const head=["id","州","市","会社","企業カルテ","業種","採用の背景","製造職の求人","全求人","直近30日の新規","30日前","職種の内訳","題名(逐語)","観測開始","最新掲載","出典"];
  const rows=list.map(s=>[s.id,s.state,s.city??"",s.company,s.company_id,s.industry,s.types.join("・"),s.open_mfg,s.open_all,s.new30,s.prev30??"",Object.entries(s.by_role||{}).map(([k,v])=>k+" "+v).join("・"),(s.titles||[]).map(t=>t.t).join(" | "),s.observed_since,s.latest,s.source]);
  return [head, ...rows];
  } },
  ucc: { name: "ucc-machines", rows(list) {
    const head = ["登記id","州","会社","市","業種(マスター)","業種の根拠","作っている物","自社サイト","日系(名簿/人の確認=1・AI候補=?)","担保権者","貸し手の種類","担保の範囲","提出日","失効日","領域","工程","機種","メーカー(判定)","メーカー(逐語)","型式","製番","台数","自動化","出典URL","調べた日","確信度","人の確認","要約","推論","出典","登記番号"];
  const rows = [];
  for(const s of list){ const eq = (s.equipment && s.equipment.length) ? s.equipment : [{}];
    for(const e of eq){ rows.push([s.id,s.state,s.company,s.city,s.industry,s.industry_basis==="master"?"自社サイト":"登記の読み",s.made??"",s.website??"",s.jp?"1":(s.jp_candidate?"?":""),s.secured_party??"",s.lender_label??"",s.scope??"",s.date,s.lapse??"",
      e.domain??"",e.process??"",e.type??"",e.maker??"",e.maker_raw??"",e.model??"",e.serial??"",e.qty??"",e.automation?"1":"",e.source_url??"",e.checked_at??"",e.confidence??"",e.verified?"済":"未",s.summary??"",s.infer??"",s.fact.src,s.fact.ref]); } }
  return [head, ...rows];
  } },
};
export function csvText(face, list) { return "\ufeff" + CSV[face].rows(list).map(r => r.map(csvEscape).join(",")).join("\r\n"); }
