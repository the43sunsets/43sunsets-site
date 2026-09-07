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
