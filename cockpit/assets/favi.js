/* 会社のファビコン(9/7 CEO 採用): 公式サイトのドメインのファビコンを 20px の識別子として社名の左に置く。取れない社は頭文字。
   提携・推奨の暗示に使わない(免責はページ側)。取得は Google の favicon サービス(64px・referrer なし)。将来は VPS で取得して自前配信に切替。 */
(function(){
  var esc = function(v){ return String(v==null?"":v).replace(/[&<>"]/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c]; }); };
  var initials = function(name){ var w = String(name||"").replace(/[^A-Za-z0-9 ]/g," ").trim().split(/\s+/).filter(function(x){ return x && !/^(inc|llc|lp|corp|corporation|co|company|ltd|the|of|and|dba)$/i.test(x); }); return (((w[0]||"?")[0]) + ((w[1]||"")[0]||"")).toUpperCase().slice(0,2); };
  var domainOf = function(w){ try { return new URL(w).hostname.replace(/^www\./,""); } catch(e){ return null; } };
  var iniHtml = function(name){ return '<span class="favi-ini" aria-hidden="true">' + esc(initials(name)) + '</span>'; };
  var imgHtml = function(domain, name){ return '<img class="favi" alt="" width="20" height="20" referrerpolicy="no-referrer" data-ini="' + esc(initials(name)) + '" onerror="window.faviFail(this)" src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64">'; };
  var cache = {};
  window.faviFail = function(img){ var s = document.createElement("span"); s.className = "favi-ini"; s.setAttribute("aria-hidden","true"); s.textContent = img.getAttribute("data-ini") || "?"; img.replaceWith(s); };
  window.faviSlot = function(karte, name){ return '<span class="favi-slot" data-karte="' + esc(karte||"") + '" data-name="' + esc(name||"") + '"></span>'; };
  window.faviFromWebsite = function(website, name){ var d = website && domainOf(website); return d ? imgHtml(d, name) : iniHtml(name); };
  window.faviFill = function(root){
    (root || document).querySelectorAll(".favi-slot").forEach(function(slot){
      var k = slot.getAttribute("data-karte"), name = slot.getAttribute("data-name");
      if(!k || !/^C-\d+$/.test(k)){ slot.outerHTML = iniHtml(name); return; }
      var done = function(domain){ if(!slot.isConnected) return; slot.outerHTML = domain ? imgHtml(domain, name) : iniHtml(name); };
      if(k in cache){ done(cache[k]); return; }
      fetch("/cockpit/data/companies/" + k + ".json", {cache:"force-cache"}).then(function(r){ return r.ok ? r.json() : null; })
        .then(function(c){ var d = c && c.website ? domainOf(c.website) : null; cache[k] = d; done(d); })
        .catch(function(){ cache[k] = null; done(null); });
    });
  };
})();

/* 社名の表示形(9/7 CEO: カードの文字サイズは統一・省略で 1 行に): 法人格を省き、全部大文字の名前は頭文字だけ大文字に(3 文字以下の語 = USA・GI などは大文字のまま)。
   正式名は title と企業カルテに残す。 */
(function(){
  var SUFFIX = /[,\s]+(L\.?L\.?C\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.?|COMPANY|LTD\.?|LIMITED|L\.?P\.?|LLP|PLC|P\.?C\.?|N\.?A\.?)\s*$/i;
  window.displayName = function(name){
    var n = String(name||"").trim();
    for (var i = 0; i < 2; i++) n = n.replace(SUFFIX, "").replace(/[,\s]+$/, "");   // "XYZ HOLDINGS, LLC" → "XYZ HOLDINGS"・二重の法人格にも対応
    if (n && n === n.toUpperCase() && /[A-Z]/.test(n)) {
      n = n.split(/(\s+|-|\/)/).map(function(w){
        if (!/[A-Z]/.test(w)) return w;
        if (/^(OF|AND|THE|FOR|DE|LA|DU|DEL|VON|VAN|&)$/.test(w)) return w.toLowerCase();   // 接続語は小文字
        if (w.replace(/[^A-Z]/g,"").length <= 3) return w;            // USA・GI・TC・OH などは大文字のまま
        if (/^(MC|MAC)[A-Z]/.test(w)) return w[0] + w.slice(1,2).toLowerCase() + w.slice(2,3) + w.slice(3).toLowerCase();   // MCMASTER → McMaster
        return w[0] + w.slice(1).toLowerCase();
      }).join("");
    }
    return n || String(name||"");
  };
})();
