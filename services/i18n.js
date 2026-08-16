/* Shared EN/JA toggle for the Services pages.
   English lives in the markup (data-i18n); Japanese in window.SERVICES_JA on each page.
   Same mechanism and the same localStorage key ('lang') as the root site, so the choice carries over. */
(function () {
  function init() {
    var ja = window.SERVICES_JA || {};
    var en = {};
    var btn = document.getElementById('lang-toggle');
    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (el) { en[el.getAttribute('data-i18n')] = el.innerHTML; });
    function apply(lang) {
      var dict = lang === 'ja' ? ja : en;
      nodes.forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (dict[key] !== undefined) el.innerHTML = dict[key];
      });
      document.documentElement.lang = lang;
      if (btn) btn.textContent = lang === 'ja' ? 'EN' : '日本語';
      try { localStorage.setItem('lang', lang); } catch (err) {}
    }
    if (btn) btn.addEventListener('click', function () {
      apply(document.documentElement.lang === 'ja' ? 'en' : 'ja');
    });
    var saved = null;
    try { saved = localStorage.getItem('lang'); } catch (err) {}
    if (saved === 'ja') apply('ja');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
