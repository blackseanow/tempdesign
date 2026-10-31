// 全景坐标 ⇄ 圆柱面 ⇄ 屏幕。主线程（热区、墨线圈、调试叠加）和渲染 Worker（贴图、特效）共用这一份，保证两边算的一样。
//
// 约定
// - 全景图坐标用 1x 像素（pano.png 原图 2106 × 747）；anchors.json 里是百分比，pctToPx 换算。
// - 横向线性对应 yaw：u = 0 是最左（−90°），u = W 是最右（+90°）。yaw 为正是往右。
// - 竖向是圆柱展开：第 horizonRow 行是视平线，往上为正；某一行在半径 R 的圆柱上的高度 = R × (horizonRow − v) / k，
//   k = W / 横向弧度（每弧度多少像素），所以横竖比例一致，从圆心看过去和原画的透视一样。
// - 三维坐标：眼睛在原点，正前方是 −Z，右是 +X，上是 +Y（和 Three.js 一样）。
//   yaw φ 方向、半径 R 的点在 (R sin φ, y, −R cos φ)。
// - 相机：look.yaw 为正往右看、look.pitch 为正往上看；Three.js 里 rotation.order = 'YXZ'，rotation.y = −yaw，rotation.x = pitch。

export const DEG = Math.PI / 180;

export function makePano(cfg) {
  const W = cfg.width1x, H = cfg.height1x;
  const span = cfg.yawSpanDeg * DEG;
  const k = W / span;
  const vh = cfg.horizonRow1x;
  return {
    W, H, span, k, vh,
    padBottom: cfg.padBottom1x || 0,
    yawOf: u => (u / W - 0.5) * span,
    uOf: yaw => (yaw / span + 0.5) * W,
    heightOf: (v, R) => R * (vh - v) / k,
    vOf: (h, R) => vh - h * k / R,
    pctToPx: (p) => ({ x: p.x / 100 * W, y: p.y / 100 * H, w: (p.w || 0) / 100 * W, h: (p.h || 0) / 100 * H }),
  };
}

// 全景图上一点（1x 像素）贴到半径 R 的圆柱面上
export function panoTo3(pano, u, v, R) {
  const yaw = pano.yawOf(u);
  return [R * Math.sin(yaw), pano.heightOf(v, R), -R * Math.cos(yaw)];
}

// 一个矩形（1x 像素）在圆柱面上的边界采样点：四条边各取 n 段，横边是弧线
export function rectSamples(pano, r, R, n = 6) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(panoTo3(pano, r.x + r.w * t, r.y, R));
    pts.push(panoTo3(pano, r.x + r.w * t, r.y + r.h, R));
    pts.push(panoTo3(pano, r.x, r.y + r.h * t, R));
    pts.push(panoTo3(pano, r.x + r.w, r.y + r.h * t, R));
  }
  return pts;
}

// 相机：位置 + 朝向 + 竖直视野（度）+ 宽高比。返回一个能把世界坐标投到屏幕（CSS 像素）的对象。
export function makeCamera(pose, vw, vh) {
  const cy = Math.cos(-pose.yaw), sy = Math.sin(-pose.yaw);
  const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
  const t = Math.tan(pose.fov * DEG / 2);
  const aspect = vw / vh;
  const [px, py, pz] = pose.pos;
  // 世界 → 相机：先减位置，再绕 Y 转 +yaw（rotation.y 的逆），再绕 X 转 −pitch
  function toCam(p) {
    const x = p[0] - px, y = p[1] - py, z = p[2] - pz;
    // R_y(−ry) where ry = −yaw  →  R_y(yaw)
    const x1 = x * cy - z * sy;
    const z1 = x * sy + z * cy;
    // R_x(−pitch)
    const y2 = y * cp + z1 * sp;
    const z2 = -y * sp + z1 * cp;
    return [x1, y2, z2];
  }
  function project(p) {
    const c = toCam(p);
    if (c[2] > -0.02) return null;               // 在身后或贴脸
    const nx = c[0] / (-c[2] * t * aspect);
    const ny = c[1] / (-c[2] * t);
    return [(nx + 1) / 2 * vw, (1 - ny) / 2 * vh, -c[2]];
  }
  // 屏幕点（CSS 像素）→ 世界里的射线方向
  function ray(sx, sy2) {
    const nx = sx / vw * 2 - 1, ny = 1 - sy2 / vh * 2;
    const cx = nx * t * aspect, cyy = ny * t, cz = -1;
    // 相机 → 世界：R_x(pitch) 再 R_y(−yaw)
    const y1 = cyy * cp - cz * sp;
    const z1 = cyy * sp + cz * cp;
    const x2 = cx * cy + z1 * sy;
    const z2 = -cx * sy + z1 * cy;
    const len = Math.hypot(x2, y1, z2);
    return [x2 / len, y1 / len, z2 / len];
  }
  return { toCam, project, ray, aspect, vw, vh, pose };
}

// 屏幕上一点 → 打在半径 R 的圆柱面上，换回全景图坐标（1x 像素）。调试面板的读数、拖锚点用。
export function screenToPano(pano, cam, sx, sy, R) {
  const d = cam.ray(sx, sy);
  const o = cam.pose.pos;
  // |o.xz + t d.xz| = R
  const a = d[0] * d[0] + d[2] * d[2];
  const b = 2 * (o[0] * d[0] + o[2] * d[2]);
  const c = o[0] * o[0] + o[2] * o[2] - R * R;
  const disc = b * b - 4 * a * c;
  if (a < 1e-9 || disc < 0) return null;
  const tt = (-b + Math.sqrt(disc)) / (2 * a);
  const p = [o[0] + d[0] * tt, o[1] + d[1] * tt, o[2] + d[2] * tt];
  const yaw = Math.atan2(p[0], -p[2]);
  return { u: pano.uOf(yaw), v: pano.vOf(p[1], R), yaw, h: p[1] };
}

// 一组三维点投到屏幕后的包围盒（有点在身后就返回 null）
export function screenBox(cam, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, zmin = Infinity;
  for (const p of pts) {
    const s = cam.project(p);
    if (!s) return null;
    if (s[0] < x0) x0 = s[0];
    if (s[0] > x1) x1 = s[0];
    if (s[1] < y0) y0 = s[1];
    if (s[1] > y1) y1 = s[1];
    if (s[2] < zmin) zmin = s[2];
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, z: zmin };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeInOut = t => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = t => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };
export const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
// 在 [a, b] 区间内从 0 到 1（区间外夹住）
export const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
// 确定性的伪随机（同一个 i 每次一样，截图和录像可复现）
export function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
