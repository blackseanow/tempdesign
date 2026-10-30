// A small card tag hanging on a string from a sheet's tab, turning about the string.
// build.mjs imports this for the static art; the page inlines the same source (the import line
// and the exports stripped), so the turning tag in the browser is drawn by exactly this code.
import { cameraOf, iso, pathOf } from "../../.claude/skills/anatomy/kit/iso-kit.mjs";

export const TAG = { w: 40, h: 84, t: 2.4, chamfer: 7, hole: 9, holeR: 2.3 };

// The tag's outline in its own plane: u across, v up, the top edge at v = 0. Counterclockwise.
export const TAG_RING = [
  [-TAG.w / 2, -TAG.h],
  [TAG.w / 2, -TAG.h],
  [TAG.w / 2, -TAG.chamfer],
  [TAG.w / 2 - TAG.chamfer, 0],
  [-TAG.w / 2 + TAG.chamfer, 0],
  [-TAG.w / 2, -TAG.chamfer],
];

const TAG_BANDS = [0, 0.2, 0.42, 0.62];
const tagBand = (score) => {
  let tone = 0;
  while (tone < TAG_BANDS.length && score >= TAG_BANDS[tone]) tone++;
  return tone;
};
const tagDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const tagUnit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
function tagView(P) {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}
function tagLight(P) {
  const { sinA, cosA } = cameraOf(P);
  return tagUnit([-sinA, cosA, 1.2]);
}
function tagHull(points) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// The frame of a tag whose string hangs at `top` (the middle of its top edge), turned by `turn`
// radians about the string. At 0 the front faces the viewer; at π the back does.
export function tagFrame(top, turn, azimuth) {
  const a = (azimuth * Math.PI) / 180;
  const right = [Math.sin(a), -Math.cos(a), 0];
  const toward = [Math.cos(a), Math.sin(a), 0];
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return {
    o: top,
    u: [c * right[0] + s * toward[0], c * right[1] + s * toward[1], 0],
    n: [c * toward[0] - s * right[0], c * toward[1] - s * right[1], 0],
  };
}

const at3 = (F, [x, y], s) => [F.o[0] + F.u[0] * x + F.n[0] * s, F.o[1] + F.u[1] * x + F.n[1] * s, F.o[2] + y];

// The tag as a thin prism, painted the kit's way: side faces in the four shades by facing, and
// the two big faces returned on their own with a continuous light score, so a turning face
// brightens and darkens smoothly instead of stepping between shades.
export function tagSolid(F, P) {
  const V = tagView(P);
  const L = tagLight(P);
  const half = TAG.t / 2;
  const n = TAG_RING.length;
  const back = TAG_RING.map((point) => iso(at3(F, point, -half), P));
  const front = TAG_RING.map((point) => iso(at3(F, point, half), P));
  const shades = [[], [], [], [], []];
  const seen = [];
  for (let j = 0; j < n; j++) {
    const [x0, y0] = TAG_RING[j];
    const [x1, y1] = TAG_RING[(j + 1) % n];
    const normal = tagUnit([F.u[0] * (y1 - y0), F.u[1] * (y1 - y0), -(x1 - x0)]);
    const visible = tagDot(normal, V) > 1e-6;
    seen.push(visible);
    if (visible) shades[tagBand(tagDot(normal, L) + 1e-9)].push(pathOf([back[j], back[(j + 1) % n], front[(j + 1) % n], front[j]], true));
  }
  const faces = [
    { side: 1, points: front, facing: tagDot(F.n, V), light: tagDot(F.n, L) },
    { side: -1, points: back, facing: -tagDot(F.n, V), light: -tagDot(F.n, L) },
  ];
  const hull = tagHull([...back, ...front]);
  const creases = [];
  for (let j = 0; j < n; j++) {
    const prev = (j - 1 + n) % n;
    const a = [TAG_RING[j][0] - TAG_RING[prev][0], TAG_RING[j][1] - TAG_RING[prev][1]];
    const b = [TAG_RING[(j + 1) % n][0] - TAG_RING[j][0], TAG_RING[(j + 1) % n][1] - TAG_RING[j][1]];
    const sharp = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]) || 1) < Math.cos(0.35);
    if (sharp && seen[j] && seen[prev]) creases.push(pathOf([back[j], front[j]]));
    for (const face of faces) if (face.facing > 1e-6 && seen[j]) creases.push(pathOf([face.points[j], face.points[(j + 1) % n]]));
  }
  return {
    fill: pathOf(hull, true),
    outline: pathOf(hull, true),
    crease: creases.join(""),
    top: shades[4].join(""),
    shades: shades.slice(0, 4).map((list) => list.join("")),
    faces: faces.map((face) => ({ side: face.side, d: face.facing > 1e-6 ? pathOf(face.points, true) : "", facing: face.facing, light: face.light })),
  };
}

// The transform that lays a face's own flat drawing (x right, y down, millimetres, origin at the
// middle of the top edge) onto that face of the tag. side 1 is the front, -1 the back; the back is
// mirrored in u so its writing reads left to right once the tag has turned round.
export function tagFace(F, side, P) {
  const half = (TAG.t / 2) * side;
  const origin = iso([F.o[0] + F.n[0] * half, F.o[1] + F.n[1] * half, F.o[2]], P);
  const along = iso([F.o[0] + F.n[0] * half + F.u[0] * side, F.o[1] + F.n[1] * half + F.u[1] * side, F.o[2]], P);
  const down = iso([F.o[0] + F.n[0] * half, F.o[1] + F.n[1] * half, F.o[2] - 1], P);
  const f = (value) => Math.round(value * 10000) / 10000;
  return `matrix(${f(along[0] - origin[0])} ${f(along[1] - origin[1])} ${f(down[0] - origin[0])} ${f(down[1] - origin[1])} ${f(origin[0])} ${f(origin[1])})`;
}
