/* 携帯の折り畳み導線(9/7 CEO 指摘): 900px 以下でヘッダーの導線 8 本を「☰ メニュー」で開閉する。ヘッダー markup は各ページ共通なので、ボタンはここで差し込む。 */
(function(){
  var head = document.querySelector('header.site-head'); if(!head) return;
  var nav = head.querySelector('.cnav'); var right = head.querySelector('.hdr-right'); if(!nav || !right) return;
  var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'menu-btn'; btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'cnav'); btn.setAttribute('aria-label', 'ページの一覧を開く'); btn.textContent = '☰ メニュー';
  nav.id = nav.id || 'cnav'; right.insertBefore(btn, right.firstChild);
  var set = function(open){ head.classList.toggle('nav-open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); btn.textContent = open ? '✕ 閉じる' : '☰ メニュー'; };
  btn.addEventListener('click', function(e){ e.stopPropagation(); set(!head.classList.contains('nav-open')); });
  nav.addEventListener('click', function(e){ if(e.target.closest('a')) set(false); });
  document.addEventListener('click', function(e){ if(head.classList.contains('nav-open') && !head.contains(e.target)) set(false); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') set(false); });
  window.addEventListener('resize', function(){ if(innerWidth > 1180) set(false); });   /* 9/9: 折り畳みの境界 1180px(cockpit.css と揃える) */
})();

/* ── ログイン状態と見本モード(2026-09-08・設計 = memory/signal-gating-and-magic-link-design.md)──
   ヘッダー右(.hdr-right / .kbar-right)に「登録」「ログイン」または「ログアウト」を差し込む。
   見本モードの面(UCC・補助金・採用・カルテの許可以外)は、各ページの boot が d.demo を見て window.sgDemo() を呼ぶ。 */
(function(){
  var right = document.querySelector('header.site-head .hdr-right') || document.querySelector('.kbar-right'); if(!right) return;
  var wrap = document.createElement('span'); wrap.className = 'sg-auth'; right.insertBefore(wrap, right.firstChild);
  var here = location.pathname + location.search;
  var nav = document.querySelector('header.site-head .cnav');   // 携帯(≤600px)はヘッダー右に収まらないので ☰ メニューの末尾にも同じ導線を置く
  function esc(s){ return String(s || '').replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function render(m){
    var q = encodeURIComponent(here);
    if (m && m.loggedIn) {
      wrap.innerHTML = '<span class="sg-who" title="' + esc(m.email) + '">' + esc(m.company || m.email) + '</span><form method="post" action="/signal/logout" class="sg-form"><button type="submit" class="sg-btn">ログアウト</button></form>';
      if (nav) nav.insertAdjacentHTML('beforeend', '<form method="post" action="/signal/logout" class="sg-navitem sg-form"><button type="submit" class="sg-navbtn">ログアウト(' + esc(m.company || m.email) + ')</button></form>');
      document.documentElement.setAttribute('data-sg', 'in');
    } else {
      wrap.innerHTML = '<a class="sg-btn sg-join" href="/signal/join/?next=' + q + '">登録</a><a class="sg-btn" href="/signal/login/?next=' + q + '">ログイン</a>';
      if (nav) nav.insertAdjacentHTML('beforeend', '<a class="sg-navitem" href="/signal/join/?next=' + q + '">登録(無料)</a><a class="sg-navitem" href="/signal/login/?next=' + q + '">ログイン</a>');
      document.documentElement.setAttribute('data-sg', 'out');
    }
  }
  fetch('/signal/me', {cache:'no-store', credentials:'same-origin'}).then(function(r){ return r.json(); }).then(render).catch(function(){ render(null); });
  window.sgDemo = function(info){
    info = info || {};
    var aside = document.querySelector('aside'); var main = document.querySelector('main'); var grid = document.getElementById('grid');
    document.documentElement.setAttribute('data-demo', '1');
    if (aside) { aside.classList.add('sg-locked'); aside.setAttribute('inert', ''); }
    if (grid) grid.classList.add('sg-blur');
    var tb = main && main.querySelector('.toolbar'); if (tb) { tb.querySelectorAll('button,select,input').forEach(function(b){ b.disabled = true; }); }
    var cta = document.createElement('div'); cta.className = 'sg-cta'; cta.setAttribute('role', 'region'); cta.setAttribute('aria-label', '見本モードの案内');
    cta.innerHTML = '<div class="sg-cta-in"><div class="sg-cta-k">見本モード</div><h2>このページは、登録した方に全件をお見せしています。</h2><p>' + (info.note ? info.note.replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }) : '登録すると、全件・当日分・絞り込み・企業カルテが使えます。') + '</p><div class="sg-cta-acts"><a class="sg-cta-btn" href="/signal/join/?next=' + encodeURIComponent(here) + '">もっと見る(無料で登録)</a><a class="sg-cta-lnk" href="/signal/login/?next=' + encodeURIComponent(here) + '">登録済みの方はログイン</a></div></div>';
    var head = main && main.querySelector('.facehead'); if (head && head.parentNode) head.parentNode.insertBefore(cta, head.nextSibling); else if (main) main.insertBefore(cta, main.firstChild);
    var sub = document.getElementById('hitsub'); if (sub) sub.textContent = '(見本 ' + (info.sample || '') + ' 件 / 全 ' + (info.total != null ? info.total.toLocaleString() : '—') + ' 件)';
  };
})();


/* ── 右下のプロモ(2026-09-09 CEO): ヘッダーの「ソリューション」を外し、Signal 操作中に小さなカード広告で /signal/solutions/ へ誘導。
   画像つき・× で閉じる・閉じたらその閲覧の間だけ出さない(sessionStorage)・それ以外の抑制なし・solutions/admin/login/join では出さない・表示は 6 秒後。?promo=1 で即時(検証用)。 */
(function(){
  var path = location.pathname;
  if(/^\/signal\/(solutions|admin|login|join)\//.test(path)) return;
  /* 9/9 CEO: 7 日の抑制は長すぎる(操作の最中に「カスタマイズできる」と気づいてもらうのが目的)。× で閉じたら、その閲覧(タブ)の間だけ出さない = sessionStorage。
     次に来たときはまた出る。CTA を押しても休まない(9/9 CEO: 抑制のロジックは持たない)。 */
  var K = "sg-promo-solutions"; var force = /[?&]promo=1/.test(location.search);
  try{ if(!force && sessionStorage.getItem(K + ":closed")) return; }catch(e){}

  var css = document.createElement("style"); css.textContent =
    ".sg-promo{position:fixed !important;top:auto !important;left:auto !important;right:18px;bottom:18px;z-index:9000;width:300px;height:auto !important;max-height:none !important;margin:0;padding:0;max-width:calc(100vw - 24px);background:var(--card,#fff);color:var(--ink,#1F252C);border:1px solid var(--line,#DCDFDB);border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.18);overflow:hidden;font-family:'Zen Kaku Gothic New',-apple-system,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;transform:translateY(24px);opacity:0;transition:transform .45s cubic-bezier(.2,.8,.2,1),opacity .45s}" +
    ".sg-promo.in{transform:none;opacity:1}" +
    ".sg-promo .pimg{display:block;width:100%;height:140px;overflow:hidden;background:var(--chip-bg,#EDF0F3);border-bottom:1px solid var(--line-soft,#ECEEEA)}.sg-promo .pimg svg{display:block;width:100%;height:100%}" +
    ".sg-promo .pbody{padding:12px 14px 14px}" +
    ".sg-promo .pk{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.16em;color:var(--accent,#2F5D8A);margin:0 0 5px}" +
    ".sg-promo h3{font-family:'Shippori Mincho',serif;font-size:16.5px;line-height:1.45;margin:0 0 6px;letter-spacing:.01em}" +
    ".sg-promo p{font-size:12.5px;line-height:1.7;color:var(--sub,#6B737C);margin:0 0 10px}" +
    ".sg-promo .pcta{display:inline-block;font-size:12.5px;font-weight:700;color:#fff;background:var(--ink,#1F252C);border-radius:5px;padding:7px 12px;text-decoration:none}" +
    ".sg-promo .pcta:hover{background:var(--accent,#2F5D8A)}" +
    ".sg-promo .px{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#1F252C;font-size:15px;line-height:26px;text-align:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}" +
    ".sg-promo .px:hover{background:#fff}" +
    "@media (max-width:600px){.sg-promo{right:12px;left:12px;bottom:12px;width:auto}.sg-promo .pimg{height:110px}}";
  var el = document.createElement("div"); el.className = "sg-promo";   /* aside だと各面の絞り込み欄の CSS(高さ・sticky)を継承して崩れる(9/9 実測) */ el.setAttribute("role", "complementary"); el.setAttribute("aria-label", "Signal のカスタマイズのご案内");
  el.innerHTML = '<button class="px" type="button" aria-label="閉じる" title="閉じる">✕</button>' +
    '<div class="pimg" aria-hidden="true">' +
      '<svg viewBox="0 0 640 300" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
        '<defs><linearGradient id="sgpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--paper,#F7F7F4)"/><stop offset="1" stop-color="var(--chip-bg,#EDF0F3)"/></linearGradient>' +
        '<filter id="sgsh" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity=".16"/></filter></defs>' +
        '<rect width="640" height="300" fill="url(#sgpg)"/>' +
        '<g stroke="var(--line,#DCDFDB)" stroke-width="1"><path d="M0 60H640M0 120H640M0 180H640M0 240H640M80 0V300M160 0V300M240 0V300M320 0V300M400 0V300M480 0V300M560 0V300" opacity=".55"/></g>' +
        /* 左: 条件のスイッチ(地域・設備・取引先) */
        '<g font-family="Zen Kaku Gothic New,Hiragino Kaku Gothic ProN,Meiryo,sans-serif" font-size="15" fill="var(--ink,#1F252C)">' +
          '<g transform="translate(44,58)"><rect x="0" y="0" width="230" height="46" rx="10" fill="var(--card,#fff)" stroke="var(--line,#DCDFDB)"/><text x="18" y="29">地域</text><text x="70" y="29" fill="var(--sub,#6B737C)" font-size="12">IL · OH · WI</text><rect x="172" y="11" width="42" height="24" rx="12" fill="var(--accent,#2F5D8A)"/><circle cx="203" cy="23" r="9" fill="#fff"/></g>' +
          '<g transform="translate(44,116)"><rect x="0" y="0" width="230" height="46" rx="10" fill="var(--card,#fff)" stroke="var(--line,#DCDFDB)"/><text x="18" y="29">設備</text><text x="70" y="29" fill="var(--sub,#6B737C)" font-size="12">レーザー · MC</text><rect x="172" y="11" width="42" height="24" rx="12" fill="var(--fact,#2E6E4E)"/><circle cx="203" cy="23" r="9" fill="#fff"/></g>' +
          '<g transform="translate(44,174)"><rect x="0" y="0" width="230" height="46" rx="10" fill="var(--card,#fff)" stroke="var(--line,#DCDFDB)"/><text x="18" y="29">取引先</text><text x="84" y="29" fill="var(--sub,#6B737C)" font-size="12">日系 · Tier 1</text><rect x="172" y="11" width="42" height="24" rx="12" fill="var(--line,#DCDFDB)"/><circle cx="183" cy="23" r="9" fill="#fff"/></g>' +
        '</g>' +
        /* 中央: 絞り込みの流れ */
        '<path d="M296 135 C 330 135, 330 135, 352 135" stroke="var(--ink,#1F252C)" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M344 127 L354 135 L344 143" stroke="var(--ink,#1F252C)" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
        /* 右: 多数の点(すべての会社)→ 1 枚のカード(次に動く会社) */
        '<g fill="var(--mute,#9AA1A9)" opacity=".55"><circle cx="392" cy="70" r="4"/><circle cx="430" cy="52" r="3"/><circle cx="476" cy="66" r="4"/><circle cx="520" cy="48" r="3"/><circle cx="566" cy="70" r="4"/><circle cx="604" cy="56" r="3"/><circle cx="408" cy="236" r="3"/><circle cx="452" cy="252" r="4"/><circle cx="500" cy="238" r="3"/><circle cx="548" cy="254" r="4"/><circle cx="594" cy="236" r="3"/><circle cx="386" cy="150" r="3"/><circle cx="612" cy="150" r="3"/></g>' +
        '<g transform="translate(400,96)" filter="url(#sgsh)"><rect x="0" y="0" width="200" height="108" rx="12" fill="var(--card,#fff)" stroke="var(--accent,#2F5D8A)" stroke-width="2"/>' +
          '<rect x="16" y="16" width="34" height="18" rx="4" fill="var(--ink,#1F252C)"/><text x="33" y="29" text-anchor="middle" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="11" fill="var(--paper,#F7F7F4)">WI</text>' +
          '<rect x="58" y="16" width="52" height="18" rx="4" fill="var(--fact-bg,#EEF5F0)"/><text x="84" y="29" text-anchor="middle" font-family="Zen Kaku Gothic New,sans-serif" font-size="10.5" fill="var(--fact,#2E6E4E)">新規</text>' +
          '<rect x="16" y="46" width="132" height="12" rx="6" fill="var(--ink,#1F252C)" opacity=".85"/><rect x="16" y="66" width="168" height="8" rx="4" fill="var(--line,#DCDFDB)"/><rect x="16" y="82" width="120" height="8" rx="4" fill="var(--line,#DCDFDB)"/>' +
          '<circle cx="176" cy="24" r="7" fill="var(--stamp,#B54434)"/></g>' +
      '</svg></div>' +
    '<div class="pbody"><div class="pk">SIGNAL をカスタマイズ</div>' +
    '<h3>御社の条件で、<br>次に動く会社を。</h3>' +
    '<p>地域・設備・取引先に合わせて、<br>必要なシグナルだけを毎週お届けします。</p>' +
    '<a class="pcta" href="/signal/solutions/?utm_source=signal&utm_medium=promo&utm_campaign=solutions">ソリューションを見る →</a></div>';
  var close = function(){ try{ sessionStorage.setItem(K + ":closed", "1"); }catch(e){} el.classList.remove("in"); setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 450); };
  el.querySelector(".px").addEventListener("click", close);
  var show = function(){ document.head.appendChild(css); document.body.appendChild(el); setTimeout(function(){ el.classList.add("in"); }, 40); };   /* rAF は非表示タブで止まるので setTimeout */
  var start = function(){ setTimeout(show, force ? 300 : 6000); };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

/* ── 左の絞り込み: 注記を折り畳む(2026-09-10 CEO 指摘「見切れている」)──
   注記(.fnote)は 152〜187px あり、絞り込み項目を画面外へ押し出していた(実測)。
   既定は閉じ、見出しを押すと開く。開閉は面ごとに localStorage で覚える。
   携帯(≤820px)は既存の「絞り込み ▾」折り畳みが効いているので触らない。 */
(function(){
  if (!window.matchMedia || !matchMedia('(min-width:821px)').matches) return;
  var note = document.querySelector('aside .fnote'); if(!note || note.closest('details')) return;
  var key = 'sg-fnote:' + location.pathname;
  var d = document.createElement('details'); d.className = 'fnote-fold';
  var s = document.createElement('summary'); s.textContent = 'この絞り込みの読み方';
  try{ d.open = localStorage.getItem(key) === '1'; }catch(e){}
  note.parentNode.insertBefore(d, note);
  d.appendChild(s); d.appendChild(note);
  d.addEventListener('toggle', function(){ try{ localStorage.setItem(key, d.open ? '1' : '0'); }catch(e){} });
})();

/* ── 左の絞り込み: グループの折り畳み(2026-09-10 CEO 指摘「見切れている」)──
   既定は「開いたまま」= 初見で見えるものは従来どおり。使う人が要らない群を畳める。
   畳んだ状態は面ごと・群ごとに localStorage で記憶する。携帯(≤820px)は既存の折り畳みに任せる。 */
(function(){
  if (!window.matchMedia || !matchMedia('(min-width:821px)').matches) return;
  var groups = document.querySelectorAll('aside .fgroup');
  Array.prototype.forEach.call(groups, function(g, i){
    var h = g.querySelector('h2'); if(!h || h.dataset.fold) return;
    h.dataset.fold = '1';
    var label = (h.textContent || ('group' + i)).trim();
    var key = 'sg-fold:' + location.pathname + ':' + label;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'fgroup-toggle';
    btn.setAttribute('aria-label', label + ' の絞り込みを開閉');
    var span = document.createElement('span'); span.textContent = label;
    btn.appendChild(span);
    h.textContent = ''; h.appendChild(btn);
    var set = function(folded, save){
      g.classList.toggle('folded', folded);
      btn.setAttribute('aria-expanded', folded ? 'false' : 'true');
      if (save) { try{ localStorage.setItem(key, folded ? '1' : '0'); }catch(e){} }
    };
    var saved = null; try{ saved = localStorage.getItem(key); }catch(e){}
    set(saved === '1', false);
    btn.addEventListener('click', function(){ set(!g.classList.contains('folded'), true); });
  });
})();

/* ── 左の絞り込み: 素のテキストのラベルを span に包み、収まらないものに title を付ける(2026-09-10)──
   静的なトグル(日系のみ・未分類のみ・索引のみ…)はラベルが素のテキストノードなので、CSS の ellipsis が効かず
   横にはみ出して切れていた(実測 UCC「索引のみ(推論段)の行を隠す 4944」= 14px はみ出し)。span に包めば効く。
   ellipsis で見えなくなった分は title(ホバー)で必ず読めるようにする = 文字は消さない。 */
(function(){
  if (!window.matchMedia || !matchMedia('(min-width:821px)').matches) return;
  var aside = document.querySelector('aside'); if(!aside) return;

  /* 素のテキストノードを span に包む(静的トグルのみ。動的な項目は renderFilters が span を作っている) */
  Array.prototype.forEach.call(aside.querySelectorAll('.fitem'), function(el){
    Array.prototype.slice.call(el.childNodes).forEach(function(n){
      if (n.nodeType === 3 && n.nodeValue.trim()){
        var s = document.createElement('span'); s.textContent = n.nodeValue;
        el.replaceChild(s, n);
      }
    });
  });

  /* 収まらないラベルに title を付ける。件数は絞り込みのたびに再描画されるので、その都度掛け直す。
     見ているのは childList/subtree だけで、付けるのは属性 → 自分の変更で再発火しない。 */
  var mark = function(){
    Array.prototype.forEach.call(aside.querySelectorAll('.fitem'), function(el){
      var s = el.querySelector('span:not(.cnt)'); if(!s) return;
      var over = s.scrollWidth > s.clientWidth + 1;
      if (over && !el.getAttribute('title')) el.setAttribute('title', s.textContent.trim());
      if (!over && el.dataset.autoTitle) { el.removeAttribute('title'); delete el.dataset.autoTitle; }
      if (over && !el.dataset.autoTitle) el.dataset.autoTitle = '1';
    });
  };
  mark();
  if (window.MutationObserver) new MutationObserver(mark).observe(aside, {childList:true, subtree:true});
})();
