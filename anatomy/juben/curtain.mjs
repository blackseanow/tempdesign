// One half of a stage curtain: a run of pleats hanging from a rod, drawn the kit's way.
// build.mjs imports this for the static art; the page inlines the same source (import line and
// exports stripped), so the curtain that gathers in the browser is drawn by exactly this code.
import { cameraOf, iso, pathOf } from "../../.claude/skills/anatomy/kit/iso-kit.mjs";

// u across the opening, v up, w toward the audience, all in the curtain's own plane (millimetres).
// Each half hangs in `pleats` pleats of two panels each, with `slack` more cloth than its width, so
// even drawn shut it folds a little. Drawn open it gathers against its side: the run of pleats gets
// `gather` narrower, and since the cloth keeps its length the panels fold deeper.
export const CURTAIN = { pleats: 7, slack: 1.06, gather: 0.84, sag: 4 };

const curtainDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const curtainUnit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const CURTAIN_BANDS = [0, 0.2, 0.42, 0.62];
const curtainBand = (score) => {
  let tone = 0;
  while (tone < CURTAIN_BANDS.length && score >= CURTAIN_BANDS[tone]) tone++;
  return Math.min(tone, 3);
};
function curtainView(P) {
  const { sinA, cosA, sinE, cosE } = cameraOf(P);
  return [cosA * cosE, sinA * cosE, sinE];
}
function curtainLight(P) {
  const { sinA, cosA } = cameraOf(P);
  return curtainUnit([-sinA, cosA, 1.2]);
}

// The fold line positions of one half, in the curtain plane: [u, w] from the middle edge to the
// side edge. `side` is -1 for the left half and 1 for the right; `open` runs 0 (closed) to 1.
export function curtainFolds(half, side, open) {
  const n = CURTAIN.pleats * 2;
  const panel = (half / n) * CURTAIN.slack;
  const span = half * (1 - CURTAIN.gather * open);
  const step = span / n;
  const depth = Math.sqrt(Math.max(0, panel * panel - step * step));
  const points = [];
  for (let i = 0; i <= n; i++) points.push([side * (half - span + i * step), i % 2 ? depth / 2 : -depth / 2]);
  return points;
}

// The panels of one half as paths, painted back to front, each in the kit's four shades by how
// it faces the light. F: { o, u, v, w } places the curtain's plane in the world (o at the middle
// of the rod), top and bottom are v of the rod and of the hem.
export function curtainPaths(F, half, side, open, top, bottom, P) {
  const V = curtainView(P);
  const L = curtainLight(P);
  const at = ([u, w], v) => [F.o[0] + F.u[0] * u + F.v[0] * v + F.w[0] * w, F.o[1] + F.u[1] * u + F.v[1] * v + F.w[1] * w, F.o[2] + F.u[2] * u + F.v[2] * v + F.w[2] * w];
  const folds = curtainFolds(half, side, open);
  // the hem rises a little at every fold that points back, so the bottom edge reads as cloth
  const hemOf = (index) => bottom + (index % 2 ? 0 : CURTAIN.sag * (0.4 + 0.6 * open));
  const panels = [];
  for (let i = 0; i < folds.length - 1; i++) {
    const a = folds[i];
    const b = folds[i + 1];
    const quad = [at(a, top), at(b, top), at(b, hemOf(i + 1)), at(a, hemOf(i))];
    const du = b[0] - a[0];
    const dw = b[1] - a[1];
    // the panel's normal toward the audience side; cloth is seen from either side
    let normal = curtainUnit([F.w[0] * du - F.u[0] * dw, F.w[1] * du - F.u[1] * dw, F.w[2] * du - F.u[2] * dw]);
    if (curtainDot(normal, V) < 0) normal = normal.map((value) => -value);
    const centre = quad.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4, sum[2] + p[2] / 4], [0, 0, 0]);
    panels.push({ d: pathOf(quad.map((p) => iso(p, P)), true), shade: curtainBand(curtainDot(normal, L)), depth: curtainDot(centre, V) });
  }
  // each panel is filled and stroked on its own, back to front, so a nearer panel hides the folds
  // behind it and the hem is the run of the panels' bottom edges
  panels.sort((x, y) => x.depth - y.depth);
  return panels;
}
