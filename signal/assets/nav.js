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
