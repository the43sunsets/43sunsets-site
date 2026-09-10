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
  window.addEventListener('resize', function(){ if(innerWidth > 900) set(false); });
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
    ".sg-promo .pimg{display:block;width:100%;height:132px;object-fit:cover;object-position:center;background:#EEF0EC}" +
    ".sg-promo .pbody{padding:12px 14px 14px}" +
    ".sg-promo .pk{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.16em;color:var(--accent,#2F5D8A);text-transform:uppercase;margin:0 0 4px}" +
    ".sg-promo h3{font-family:'Shippori Mincho',serif;font-size:16.5px;line-height:1.45;margin:0 0 6px;letter-spacing:.01em}" +
    ".sg-promo p{font-size:12.5px;line-height:1.7;color:var(--sub,#6B737C);margin:0 0 10px}" +
    ".sg-promo .pcta{display:inline-block;font-size:12.5px;font-weight:700;color:#fff;background:var(--ink,#1F252C);border-radius:5px;padding:7px 12px;text-decoration:none}" +
    ".sg-promo .pcta:hover{background:var(--accent,#2F5D8A)}" +
    ".sg-promo .px{position:absolute;top:8px;right:8px;width:26px;height:26px;border-radius:50%;border:0;background:rgba(255,255,255,.92);color:#1F252C;font-size:15px;line-height:26px;text-align:center;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.25)}" +
    ".sg-promo .px:hover{background:#fff}" +
    "@media (max-width:600px){.sg-promo{right:12px;left:12px;bottom:12px;width:auto}.sg-promo .pimg{height:110px}}";
  var el = document.createElement("div"); el.className = "sg-promo";   /* aside だと各面の絞り込み欄の CSS(高さ・sticky)を継承して崩れる(9/9 実測) */ el.setAttribute("role", "complementary"); el.setAttribute("aria-label", "Signal のカスタマイズのご案内");
  el.innerHTML = '<button class="px" type="button" aria-label="閉じる" title="閉じる">✕</button>' +
    '<img class="pimg" src="/assets/promo-solutions.jpg" alt="" width="640" height="360" loading="eager" decoding="async">' +
    '<div class="pbody"><div class="pk">Signal をカスタマイズしませんか?</div>' +
    '<h3>御社の条件で、次に動く会社だけを毎週。</h3>' +
    '<p>気になる地域・設備・取引先に絞ったシグナルを、御社の営業の型に合わせてお届けします。まずは 30 分の相談から。</p>' +
    '<a class="pcta" href="/signal/solutions/?utm_source=signal&utm_medium=promo&utm_campaign=solutions">ソリューションを見る →</a></div>';
  var close = function(){ try{ sessionStorage.setItem(K + ":closed", "1"); }catch(e){} el.classList.remove("in"); setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 450); };
  el.querySelector(".px").addEventListener("click", close);
  var show = function(){ document.head.appendChild(css); document.body.appendChild(el); setTimeout(function(){ el.classList.add("in"); }, 40); };   /* rAF は非表示タブで止まるので setTimeout */
  var start = function(){ setTimeout(show, force ? 300 : 6000); };
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
