/* カードの入れ替え演出(9/7 CEO・参考 = Mitutoyo PMN の MixItUp): いまのカードを 0.17 秒で消し、新しいカードを 1 枚ずつ 32ms ずらして浮かび上がらせる。
   reduced-motion では即時差し替え。連打時は最新の HTML を即時に出す。 */
window.swapCards = function (grid, html) {
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const apply = () => {
    grid.classList.remove("is-leaving"); grid.innerHTML = html;
    if (!reduce) [...grid.children].forEach((c, i) => { c.style.setProperty("--i", Math.min(i, 24)); c.classList.add("enter"); });
  };
  if (reduce || !grid.children.length || grid.dataset.busy) { apply(); return; }
  grid.dataset.busy = "1"; grid.classList.add("is-leaving");
  setTimeout(() => { delete grid.dataset.busy; apply(); }, 170);
};
