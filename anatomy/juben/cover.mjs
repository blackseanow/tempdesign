// The script's front cover: a cloth-covered board that swings open about the crease beside the binding.
// build.mjs imports this for the static art; the page inlines the same source (import line and
// exports stripped), so the cover that turns in the browser is drawn by exactly this code.
import { cameraOf, iso, pathOf } from "../../.claude/skills/anatomy/kit/iso-kit.mjs";

// w from the crease to the free edge, h along the crease, t thick (millimetres)
export const COVER = { w: 432, h: 570, t: 5 };

const coverDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const coverUnit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const COVER_BANDS = [0, 0.2, 0.42, 0.62];
const coverBand = (score) => {
  let tone = 0;
  while (tone < COVER_BANDS.length && score >= COVER_BANDS[tone]) tone++;
  return tone;
};
function coverView(P) {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}
function coverLight(P) {
  const { sinA, cosA } = cameraOf(P);
  return coverUnit([-sinA, cosA, 1.2]);
}

// The cover swung open by theta. B: { H, u, v, w }, the book's frame: H the bottom of the crease on
// the cover's outer face, u across the book (the binding is on the +u side), v up the board, w out of
// it. At 0 the cover lies over the pages, outer face toward the audience, its free edge to the -u side;
// it swings out toward the audience and round to the +u side, the way a thread-bound book opens.
export function coverFrame(B, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // d: from the crease toward the free edge; n: the outer face's normal
  const d = [-c * B.u[0] + s * B.w[0], -c * B.u[1] + s * B.w[1], -c * B.u[2] + s * B.w[2]];
  const n = [s * B.u[0] + c * B.w[0], s * B.u[1] + c * B.w[1], s * B.u[2] + c * B.w[2]];
  return { o: B.H, v: B.v, d, n };
}

// a point on the cover: a from the crease toward the free edge, b up along the crease, k into the board
const coverAt = (F, a, b, k) => [F.o[0] + F.d[0] * a + F.v[0] * b - F.n[0] * k, F.o[1] + F.d[1] * a + F.v[1] * b - F.n[1] * k, F.o[2] + F.d[2] * a + F.v[2] * b - F.n[2] * k];

function coverHull(points) {
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

// The board as a thin box painted the kit's way: the four edges in the shades by facing, the two big
// faces returned on their own (with how squarely each faces the viewer and the light), the hull as
// fill and outline, creases where a face meets a visible edge.
export function coverSolid(F, P) {
  const V = coverView(P);
  const L = coverLight(P);
  const { w, h, t } = COVER;
  const ring = [[0, 0], [w, 0], [w, h], [0, h]];
  const outer = ring.map(([a, b]) => iso(coverAt(F, a, b, 0), P));
  const inner = ring.map(([a, b]) => iso(coverAt(F, a, b, t), P));
  const down = F.v.map((value) => -value);
  const normals = [down, F.d, F.v, F.d.map((value) => -value)];
  const shades = [[], [], [], [], []];
  const seen = [];
  for (let j = 0; j < 4; j++) {
    const visible = coverDot(normals[j], V) > 1e-6;
    seen.push(visible);
    if (visible) shades[coverBand(coverDot(normals[j], L))].push(pathOf([outer[j], outer[(j + 1) % 4], inner[(j + 1) % 4], inner[j]], true));
  }
  const faces = [
    { side: 1, points: outer, facing: coverDot(F.n, V), light: coverDot(F.n, L) },
    { side: -1, points: inner, facing: -coverDot(F.n, V), light: -coverDot(F.n, L) },
  ];
  const creases = [];
  for (const face of faces) if (face.facing > 1e-6) for (let j = 0; j < 4; j++) if (seen[j]) creases.push(pathOf([face.points[j], face.points[(j + 1) % 4]]));
  for (let j = 0; j < 4; j++) if (seen[j] && seen[(j + 3) % 4]) creases.push(pathOf([outer[j], inner[j]]));
  const hull = coverHull([...outer, ...inner]);
  return {
    fill: pathOf(hull, true),
    outline: pathOf(hull, true),
    crease: creases.join(""),
    top: shades[4].join(""),
    shades: shades.slice(0, 4).map((list) => list.join("")),
    faces: faces.map((face) => ({ side: face.side, d: face.facing > 1e-6 ? pathOf(face.points, true) : "", facing: face.facing, light: face.light })),
  };
}

// The transform that lays a face's own flat drawing onto it (x right, y down, millimetres), each
// drawn the way it is read: the outer face closed, origin at its top left (the free edge) and x
// toward the crease; the inner face open, origin at the top of the crease and x toward the free edge.
export function coverFace(F, side, P) {
  const { w, h, t } = COVER;
  const f = (value) => Math.round(value * 10000) / 10000;
  const o = side > 0 ? coverAt(F, w, h, 0) : coverAt(F, 0, h, t);
  const along = side > 0 ? coverAt(F, w - 1, h, 0) : coverAt(F, 1, h, t);
  const down = side > 0 ? coverAt(F, w, h - 1, 0) : coverAt(F, 0, h - 1, t);
  const [a, b, c] = [iso(o, P), iso(along, P), iso(down, P)];
  return `matrix(${f(b[0] - a[0])} ${f(b[1] - a[1])} ${f(c[0] - a[0])} ${f(c[1] - a[1])} ${f(a[0])} ${f(a[1])})`;
}

// a big face's tone: its colour mixed toward the lit or the dark shade by how squarely it takes the light
export const faceTone = (light) => (light >= 0 ? `color-mix(in srgb, var(--face-lit) ${Math.round(Math.min(1, light / 0.64) * 100)}%, var(--face))` : `color-mix(in srgb, var(--face-dark) ${Math.round(Math.min(1, -light / 0.64) * 100)}%, var(--face))`);

// the cover's middle, for its depth key
export const coverCentre = (F) => coverAt(F, COVER.w / 2, COVER.h / 2, COVER.t / 2);

// The cover's place in the painter's order as it swings. The build measures it at fixed angles against
// every other part (C.keys over 0..C.open), with the acts at home, and apart once the cover is most of
// the way round. Up to C.flip, where the board turns edge-on to the reader, its outside shows and every
// act lies behind it; past C.flip its inside shows, with the acts in front. So the nearest measured
// angle on the same side of C.flip gives its key among the fixed parts, and while its outside shows it
// also goes over the acts' live keys (actTop, the highest), however far out they still are.
export function coverKeyOf(theta, C, actTop) {
  const steps = C.keys.length - 1;
  const at = (theta / C.open) * steps;
  const edge = (C.flip / C.open) * steps;
  const outside = at < edge;
  let index = Math.round(at);
  index = outside ? Math.min(index, Math.ceil(edge) - 1) : Math.max(index, Math.floor(edge) + 1);
  const key = C.keys[Math.max(0, Math.min(steps, index))];
  return outside ? Math.max(key, actTop + 0.01) : key;
}
