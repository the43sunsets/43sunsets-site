/* カードの入れ替え演出(9/7 CEO・参考 = Mitutoyo PMN の MixItUp): いまのカードを 0.17 秒で消し、新しいカードを 1 枚ずつ 32ms ずらして浮かび上がらせる。
   reduced-motion では即時差し替え。連打時は最新の HTML を即時に出す。 */
window.swapCards = function (grid, html) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const apply = () => {
    grid.classList.remove("is-leaving"); grid.innerHTML = html;
    if (window.faviFill) window.faviFill(grid);   // 9/7: 社名の左のファビコン
    fitTitles(grid);   // 9/7 CEO: 社名を 1 行に(縮小 → それでも溢れたら省略記号+全名の tooltip)
    if (!reduce) [...grid.children].forEach((c, i) => { c.style.setProperty("--i", Math.min(i, 24)); c.classList.add("enter"); });
  };
  if (reduce || !grid.children.length || grid.dataset.busy) { apply(); return; }
  grid.dataset.busy = "1"; grid.classList.add("is-leaving");
  setTimeout(() => { delete grid.dataset.busy; apply(); }, 170);
};

/* 社名の 1 行化(9/7 CEO): h3 の文字を 14.5px → 最小 12px まで縮め、まだ溢れる分は CSS の省略記号に任せる。全名は title に。 */
function fitTitles(grid){
  grid.querySelectorAll(".card h3").forEach(function(h){
    if (!h.getAttribute("title")) h.setAttribute("title", h.textContent.replace(/\s*›\s*$/, "").trim());
    h.style.fontSize = "";
    var size = parseFloat(getComputedStyle(h).fontSize) || 14.5, min = 12;
    while (h.scrollWidth > h.clientWidth + 1 && size > min) { size -= 0.5; h.style.fontSize = size + "px"; }
  });
}
window.fitTitles = fitTitles;
