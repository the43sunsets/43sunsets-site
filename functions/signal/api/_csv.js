// CSV の見出しと写像は各画面の通常 CSV から逐語で移したもの。
import { FACE_SPEC } from "./_face_spec.js";
function csvEscape(v){ v = String(v==null?"":v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }
export const CSV = {
  permits: { name: "permits", rows(list) {
    const head = ["id","州","市・所在","投資主体","投資主体の根拠","登記名義","登記名義の出所","名義は箱会社","申請者","施工者","名義の種別(AI)","業種","設備投資の種類","確信度","日付","申請日","評価額USD","日系","サマリー(AI付与)","注記(AI付与)","事実_出典","事実_参照","事実_逐語","推論(AI付与)","工事の種類","合計USD","施工者数"];
  const rows = list.map(s=>{ const inv=s.investor||{}, p=s.parties||{}; return [s.id,s.state,s.city,inv.name??"",inv.label??"",p.owner_of_record??"",p.owner_kind??"",p.owner_is_spe?"1":"",p.applicant??"",p.gc??"",s.entity_type??"",s.industry,s.category,s.confidence??"",s.date,s.applied??"",s.fact.value??"",s.jp?"1":"",s.summary,s.note??"",s.fact.src,s.fact.ref,s.fact.verbatim,s.infer??"",(s.kinds||[]).join("・"),s.amount?.total??"",s.contractors_n??""]; });
  return [head, ...rows];
  } },
  subsidies: { name: "subsidies", rows(list) {
    const head = ["id","州","市","受領者","企業カルテ","種別","出し手の層","機関","制度番号","制度名","金額USD","段階","決定日","履行開始","履行終了","投資の種類","業種","分類の出所","確信度","投資規模","日系","AI のまとめ","推論(AI)","本文(逐語)","URL","層","予定投資額USD","何を・どこに(AI付与)"];
  const rows = list.map(s=>[s.id,s.state,s.city??"",s.recipient,s.company_id??"",s.kind_label,s.issuer_level,s.issuer??"",s.program??"",s.program_name??"",s.amount??"",s.stage,s.date??"",s.start_date??"",s.end_date??"",s.category,s.industry,s.basis==="ai"?"AI":"規則",(s.ai&&s.ai.confidence)||"",s.size,s.jp?"1":"",s.summary??"",s.infer??"",s.description,s.url??"",s.layer??"",s.investment??"",s.purpose_ja??""]);
  return [head, ...rows];
  } },
  hiring: { name: "hiring", rows(list) {
    const head=["id","州","市","会社","企業カルテ","業種","採用の背景","製造職の求人","全求人","直近30日の新規","30日前","職種の内訳","題名(逐語)","観測開始","最新掲載","出典","上限"];
  const rows=list.map(s=>[s.id,s.state,s.city??"",s.company,s.company_id,s.industry,s.types.join("・"),s.open_mfg,s.open_total??"",s.new30,s.prev30??"",Object.entries(s.by_role||{}).map(([k,v])=>k+" "+v).join("・"),(s.titles||[]).map(t=>t.t).join(" | "),s.observed_since,s.latest,s.source,s.truncated?"1":""]);
  return [head, ...rows];
  } },
  ucc: { name: "ucc-machines", rows(list) {
    const tierNames = new Map(Object.entries(FACE_SPEC.faces.ucc.contract_names.tier.values).map(([name, value]) => [value, name]));
    const head = ["登記id","州","会社","市","業種(マスター)","業種の根拠","作っている物","自社サイト","日系(名簿/人の確認=1・AI候補=?)","担保権者","貸し手の種類","担保の範囲","提出日","失効日","領域","工程","機種","メーカー(判定)","メーカー(逐語)","型式","製番","台数","自動化","出典URL","調べた日","確信度","人の確認","要約","推論","出典","登記番号","段","担保権者の種類"];
  const rows = [];
  for(const s of list){ const eq = (s.equipment && s.equipment.length) ? s.equipment : [{}];
    for(const e of eq){ rows.push([s.id,s.state,s.company,s.city,s.industry,s.industry_basis==="master"?"自社サイト":"登記の読み",s.made??"",s.website??"",s.jp?"1":(s.jp_candidate?"?":""),s.secured_party??"",s.lender_label??"",s.scope??"",s.date,s.lapse??"",
      e.domain??"",e.process??"",e.type??"",e.maker??"",e.maker_raw??"",e.model??"",e.serial??"",e.qty??"",e.automation?"1":"",e.source_url??"",e.checked_at??"",e.confidence??"",e.verified?"済":"未",s.summary??"",s.infer??"",s.fact.src,s.fact.ref,tierNames.get(s.tier)??s.tier??"",s.lender_class??""]); } }
  return [head, ...rows];
  } },
};

// 0ca191d: CRM rows, including duplicate handling, retained verbatim.
{
const CRM_HEAD = ["会社名","市","州","住所","出来事","日付","申請日","評価額USD","記録の参照","情報源","企業ページ","要約(AI付与)","Signalの許可ID"];
function crmRows(list, origin){
  const rows = [];
  for(const s of list){
    const inv = s.investor || {name: s.company};   // カード(405 行)と同じ: 投資主体の名前・無ければ旧 company
    const f = s.fact || {};
    const loc = String(s.city || ""); const i = loc.indexOf("・"); const city = i >= 0 ? loc.slice(0, i) : loc; const addr = i >= 0 ? loc.slice(i + 1) : "";   // city = 「自治体・住所」の 1 列(export.py 247 行)
    const cid = String(s.company_id || ""); const page = /^C-\d+$/.test(cid) ? `${origin}/signal/company/?id=${cid}` : "";   // 411 行と同じ条件
    rows.push([inv.name ?? "", city, s.state ?? "", addr, `建設許可(${s.category ?? "未分類"})`, s.date ?? "", s.applied ?? "", f.value ?? "", f.ref ?? "", f.src ?? "", page, s.summary ?? "", s.id ?? ""]);
  }
  return [CRM_HEAD, ...rows];
}

CSV.permits.crm = crmRows;
}

// 0ca191d: CRM rows, including duplicate handling, retained verbatim.
{
const CRM_HEAD = ["会社名","市","州","出来事","日付","失効日","担保権者","記録の参照","記録のURL","情報源","企業ページ","要約(AI付与)","Signalの登記ID"];
const RECORD_SOURCE = {WI: {url: "https://wims.dfi.wi.gov/uccsearch", src: "ウィスコンシン州 DFI UCC 登記(wims.dfi.wi.gov・公開検索)"}, OH: {url: "https://ucc.ohiosos.gov/search", src: "オハイオ州務長官 UCC 登記(ucc.ohiosos.gov・公開検索)"}};   // 登記ごとの深いリンクは両州とも無い = 検索画面で「記録の参照」の番号を引く。情報源も州で引く(fact.src は読み行で OH に固定されている)
function crmRows(list, origin){
  const pick = new Map();   // 同じ登記 ID は 1 行に畳む(企業ページ karte のある読み行 > 索引行・それ以外は先に出た行。copy.status は読み行が free・索引行が purchased なので優先の鍵にしない)
  for(const s of list){ const cur = pick.get(s.id); const hasK = !!s.karte; const curK = !!(cur && cur.karte);
    if(!cur || (hasK && !curK)) pick.set(s.id, s); }
  const rows = [];
  for(const s of pick.values()){ const city = String(s.city || ""); const i = city.lastIndexOf(", "); const cityOnly = i >= 0 ? city.slice(0, i) : city;
    rows.push([s.company ?? "", cityOnly, s.state ?? "", `UCC 登記(${s.kind ?? "未分類"})`, s.date ?? "", s.lapse ?? "", s.secured_party ?? "", (s.fact && s.fact.ref) ?? "", (RECORD_SOURCE[s.state] || {}).url ?? "", (RECORD_SOURCE[s.state] || {}).src ?? ((s.fact && s.fact.src) ?? ""), s.karte ? `${origin}/signal/company/?id=${s.karte}` : "", s.summary ?? "", s.id ?? ""]); }
  return [CRM_HEAD, ...rows];
}

CSV.ucc.crm = crmRows;
}
export function csvText(face, list, layout, origin) { return "\ufeff" + (layout === "crm" ? CSV[face].crm(list, origin) : CSV[face].rows(list)).map(r => r.map(csvEscape).join(",")).join("\r\n"); }
