// Cloudflare Turnstile の読み込み(2026-09-08 CEO 裁定 甲: 相談フォーム・Signal 登録/再送・サービス申込にボット対策)。
// サイトキーは公開値。Cloudflare ダッシュボード → Turnstile → ウィジェット作成(43sunsets.com・Managed)で得た Site Key をここに 1 か所だけ書く。
// 秘密鍵(Secret Key)は Pages の環境変数 TURNSTILE_SECRET(Secret 型)に置く。鍵が空の間はウィジェットを出さず、Function 側も検証を省略する(honeypot と送信間隔の制限だけが効く)。
window.TURNSTILE_SITE_KEY = "0x4AAAAAAEtKtIZvRKwp2PfD";   // 2026-09-08 作成(43sunsets.com・Managed)・公開値
(function () {
  function load() {
    var k = window.TURNSTILE_SITE_KEY; if (!k) return;
    var boxes = document.querySelectorAll(".cf-turnstile"); if (!boxes.length) return;
    boxes.forEach(function (d) { d.setAttribute("data-sitekey", k); d.setAttribute("data-size", "flexible"); });
    var s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; s.async = true; s.defer = true; document.head.appendChild(s);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
