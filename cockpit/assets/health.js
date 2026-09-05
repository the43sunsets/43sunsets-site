// 43 Sunsets Cockpit — health meter(ヘッダー右上・9/5 CEO 発案)。/cockpit/data/health.json(VPS が毎サイクル生成)を読み、
// 「今日の日付・当日の予定収集が済んだか・最終収集の日時・最終実行の新規件数」を 1 つのピルで示す。描画時に AI は動かない。
(function(){
  const els = Array.from(document.querySelectorAll(".hb[data-check], #healthbar")); if(!els.length) return;
  els.forEach(el => run(el));
})();
function run(el){
  const KEY = el.dataset.check || "permits_update_vps";
  const LABEL = el.dataset.label || ({permits_update_vps: "建設許可", ucc_sync_mac: "UCC"})[KEY] || KEY;   // 9/5 CEO: どちらの収集かを先頭に
  const TZ = "America/Chicago";
  const fmt = (iso, withTime) => { if(!iso) return "—"; const d = new Date(iso); const o = {timeZone:TZ, year:"numeric", month:"2-digit", day:"2-digit"}; if(withTime) Object.assign(o,{hour:"2-digit",minute:"2-digit",hour12:false});
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US",o).formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value])); return withTime ? `${p.month}-${p.day} ${p.hour==="24"?"00":p.hour}:${p.minute}` : `${p.year}-${p.month}-${p.day}`; };
  const todayCT = fmt(new Date().toISOString(), false);
  el.innerHTML = `<span class="hb-dot hb-wait"></span><span class="hb-txt"><span class="hb-lbl">${LABEL}</span><span class="hb-sep">·</span>今日 <span class="mono">${todayCT}</span>・読み込み中…</span>`;
  fetch("/cockpit/data/health.json", {cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); }).then(h=>{
    const c = (h.checks||{})[KEY] || {}; const last = c.raw_db_synced_at || c.last_run_at || null;
    const lastCT = fmt(last, true); const lastDay = fmt(last, false);
    const n = (c.new_records!=null) ? c.new_records : null;
    const ranToday = last && lastDay === todayCT;
    let cls = "hb-ok", label = "当日の収集 済";
    if(c.state === "FAIL"){ cls = "hb-fail"; label = "最終実行で失敗"; }
    else if(c.state === "STALE"){ cls = "hb-fail"; label = "収集が 30 時間以上止まっています"; }
    else if(!ranToday){ cls = "hb-wait"; label = `当日の収集 待ち(予定 ${c.schedule||""})`; }
    const gen = fmt(h.generated_at, true);
    const title = `運行状態(${LABEL} の収集)\n判定 ${c.state||"—"}・health.json 生成 ${gen} CT\n収集の予定: ${c.schedule||"—"}\n最終収集: ${lastCT} CT${n!=null?`・新規 ${n>=0?"+":""}${n} 件`:""}${c.fetched!=null?`・取得 ${c.fetched} 件`:""}${c.errors?`・源の障害 ${c.errors}`:""}\n${c.last_status && c.last_status.ok===0 ? "最終実行に失敗した工程があります" : ""}`.trim();
    el.className = "hb " + cls; el.title = title;
    el.innerHTML = `<span class="hb-dot"></span><span class="hb-txt"><span class="hb-lbl">${LABEL}</span><span class="hb-sep">·</span><span class="hb-k">今日</span> <span class="mono">${todayCT}</span><span class="hb-sep">·</span><span class="hb-k">${label}</span><span class="hb-sep">·</span><span class="hb-k">最終収集</span> <span class="mono">${lastCT}</span>${n!=null?`<span class="hb-sep">·</span><span class="hb-k">新規</span> <span class="mono">${n>=0?"+":""}${n}</span><span class="hb-u"> 件</span>`:""}</span>`;
  }).catch(err=>{ el.className = "hb hb-fail"; el.title = "health.json を読めません: "+err.message; el.innerHTML = `<span class="hb-dot"></span><span class="hb-txt"><span class="hb-lbl">${LABEL}</span><span class="hb-sep">·</span>今日 <span class="mono">${todayCT}</span>・運行状態 不明(${err.message})</span>`; });
}
