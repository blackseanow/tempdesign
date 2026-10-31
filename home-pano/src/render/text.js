// 在画布上写字（霞鹜文楷子集，Worker 里和主线程里都一样用）。
export const FONT_KAI = '"PanoKai", "LXGW WenKai", "KaiTi", "STKaiti", serif';

// 在 w × h 的画布里居中写一行字；字太宽就缩小。tracking 是字间距（相对字号）。
export function textCanvas(g, w, h, text, o = {}) {
  if (o.clear !== false) g.clearRect(0, 0, w, h);
  let size = o.size || h * 0.6;
  const fam = o.family || FONT_KAI;
  const tracking = o.tracking || 0;
  const vertical = !!o.vertical;
  g.fillStyle = o.color || '#24231F';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  if (vertical) {
    // 竖排：一个字一行
    const chars = [...text];
    size = Math.min(size, (h * 0.92) / (chars.length * (1 + tracking)), w * 0.86);
    g.font = `${o.weight || 400} ${size}px ${fam}`;
    const step = size * (1 + tracking);
    const y0 = h / 2 - step * (chars.length - 1) / 2;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, y0 + i * step));
    return size;
  }
  g.font = `${o.weight || 400} ${size}px ${fam}`;
  const chars = [...text];
  const width = () => chars.reduce((a, ch) => a + g.measureText(ch).width, 0) + size * tracking * (chars.length - 1);
  let tw = width();
  const max = w * (o.fit ?? 0.92);
  if (tw > max) { size *= max / tw; g.font = `${o.weight || 400} ${size}px ${fam}`; tw = width(); }
  let x = w / 2 - tw / 2;
  const y = h / 2 + (o.dy || 0) * size;
  g.textAlign = 'left';
  for (const ch of chars) { g.fillText(ch, x, y); x += g.measureText(ch).width + size * tracking; }
  return size;
}
