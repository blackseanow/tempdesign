// 平面版：不支持 WebGL 或明显卡顿时用。一张图（pano.png 的 1x 或 2x 切块）横向铺开，可以左右滚动；入口是图上的点击区域。
export function startFlat({ manifest, entries, stage }) {
  stage.hidden = true;
  const root = document.getElementById('flat');
  root.hidden = false;
  const scroller = root.querySelector('.flat-scroll');
  const strip = root.querySelector('.flat-strip');
  strip.textContent = '';
  const dpr = window.devicePixelRatio || 1;
  const level = innerHeight * dpr > 820 && manifest.flat['2'] ? 2 : 1;
  const L = manifest.flat[String(level)];
  for (const tile of L.tiles[0]) {
    const [x0, , x1] = tile.box;
    const img = document.createElement('img');
    img.src = 'img/tiles/' + tile.file;
    img.alt = '';
    img.draggable = false;
    img.style.left = (x0 / L.size[0] * 100) + '%';
    img.style.width = ((x1 - x0) / L.size[0] * 100) + '%';
    strip.appendChild(img);
  }
  strip.setAttribute('role', 'img');
  strip.setAttribute('aria-label', '诊室：书架、门帘、日历、挂钟、两块木牌、百子柜和横匾、锦旗、鸡汤炉、月洞窗、药炉；正中是领导和诊桌');
  entries.isFlat = true;
  entries.flatStrip = strip;
  entries.build();
  entries.setState('free');
  // 一开始对着领导
  requestAnimationFrame(() => { scroller.scrollLeft = (strip.scrollWidth - scroller.clientWidth) / 2; });
  // 鼠标也能拖着滚
  let drag = null;
  scroller.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') drag = { x: e.clientX, s: scroller.scrollLeft, moved: 0 }; });
  addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; drag.moved = Math.abs(dx); scroller.scrollLeft = drag.s - dx; entries.look = { moved: drag.moved }; });
  addEventListener('pointerup', () => { drag = null; setTimeout(() => { entries.look = { moved: 0 }; }, 0); });
  // 键盘聚焦到画面外的入口时滚过去
  strip.addEventListener('focusin', e => { const b = e.target.getBoundingClientRect(); if (b.left < 40 || b.right > innerWidth - 40) scroller.scrollLeft += b.left + b.width / 2 - innerWidth / 2; });
}
