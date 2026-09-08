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
    cta.innerHTML = '<div class="sg-cta-in"><div class="sg-cta-k">見本モード</div><h2>この面は、登録した方に全件をお見せしています。</h2><p>' + (info.note ? info.note.replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }) : '登録すると、全件・当日分・絞り込み・企業カルテが使えます。') + '</p><div class="sg-cta-acts"><a class="sg-cta-btn" href="/signal/join/?next=' + encodeURIComponent(here) + '">もっと見る(無料で登録)</a><a class="sg-cta-lnk" href="/signal/login/?next=' + encodeURIComponent(here) + '">登録済みの方はログイン</a></div></div>';
    var head = main && main.querySelector('.facehead'); if (head && head.parentNode) head.parentNode.insertBefore(cta, head.nextSibling); else if (main) main.insertBefore(cta, main.firstChild);
    var sub = document.getElementById('hitsub'); if (sub) sub.textContent = '(見本 ' + (info.sample || '') + ' 件 / 全 ' + (info.total != null ? info.total.toLocaleString() : '—') + ' 件)';
  };
})();
