/* カードの入れ替え演出(9/7 CEO・参考 = Mitutoyo PMN の MixItUp): いまのカードを 0.17 秒で消し、新しいカードを 1 枚ずつ 32ms ずらして浮かび上がらせる。
   reduced-motion では即時差し替え。連打時は最新の HTML を即時に出す。 */
window.swapCards = function (grid, html) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const apply = () => {
    grid.classList.remove("is-leaving"); grid.innerHTML = html;
    if (window.faviFill) window.faviFill(grid);   // 9/7: 社名の左のファビコン
    tidyTitles(grid);   // 9/7 CEO: 社名を 1 行に(表示形に整え・溢れは省略記号・文字サイズは統一)
    if (!reduce) [...grid.children].forEach((c, i) => { c.style.setProperty("--i", Math.min(i, 24)); c.classList.add("enter"); });
  };
  if (reduce || !grid.children.length || grid.dataset.busy) { apply(); return; }
  grid.dataset.busy = "1"; grid.classList.add("is-leaving");
  setTimeout(() => { delete grid.dataset.busy; apply(); }, 170);
};

/* 社名の 1 行化(9/7 CEO 改訂: 文字サイズは統一・縮小しない): 表示形(法人格の省略・頭文字大文字)に整え、溢れる分は CSS の省略記号。全名は title。 */
function tidyTitles(grid){
  grid.querySelectorAll(".card h3").forEach(function(h){
    var a = h.querySelector(".companylink");
    var target = a || h;
    var node = null;
    for (var i = 0; i < target.childNodes.length; i++) { var c = target.childNodes[i]; if (c.nodeType === 3 && c.textContent.trim()) { node = c; break; } }
    if (!node) return;
    var full = node.textContent.replace(/\s*›\s*$/, "").trim();
    if (!h.getAttribute("title")) h.setAttribute("title", full);
    if (window.displayName) node.textContent = node.textContent.replace(full, displayName(full));
    h.style.fontSize = "";
  });
}
window.fitTitles = tidyTitles; window.tidyTitles = tidyTitles;
