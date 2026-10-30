// The lamp head: a neck and a conical shade that turn together about the head knuckle, so the
// light can follow one sheet at a time. build.mjs imports this for the static art; the page
// inlines the same source with lathe.mjs as `G`, so the head in the browser is drawn by this code.
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";

// Lengths in millimetres along the aim, from the knuckle's axis.
export const HEAD = {
  knuckle: 10,
  neck: [7.6, 32, 5.6],
  shade: [
    [32, 15],
    [33.2, 19.5, 1],
    [35.4, 22.6, 1],
    [38.6, 24.4, 1],
    [42, 25],
    [58, 25],
    [58, 27.6],
    [124, 70],
    [124, 72.4],
    [126.8, 72.4],
  ],
  // a seam round the cap, its ring of vent holes, and where the push switch stands
  band: 49,
  vents: [45.5, 25, 16],
  switch: [53.5],
  // the opening, the step where the cone leaves the cap (seen from inside), and the lamp
  rim: [126.8, 72.4],
  lip: [126.8, 69.4],
  throat: [58, 27.6],
  bulb: [86, 21],
  // half-angle of the beam the shade lets out
  cone: 0.36,
};

export function aimOf(lamp, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return G.unit3(G.add3(G.mul3(lamp.e2, c), G.mul3(lamp.n, s)));
}

export function headFrame(lamp, theta) {
  const d = aimOf(lamp, theta);
  return G.frameOf(lamp.H, d, lamp.m, G.cross3(d, lamp.m));
}

// The aim angle (from e2 toward n) that points the head at a point in the lamp's plane.
export function angleTo(lamp, point) {
  const r = G.sub3(point, lamp.H);
  return Math.atan2(G.dot3(r, lamp.n), G.dot3(r, lamp.e2));
}

export function headParts(lamp, theta, P) {
  const F = headFrame(lamp, theta);
  const V = G.viewOf(P);
  const [n0, n1, nr] = HEAD.neck;
  // the push switch on top of the cap: a stem and a button, standing out along the cap's top
  const FS = G.frameOf(G.pointOf(F, HEAD.switch[0], 0, 0), F.v, F.a, F.u);
  return {
    F,
    facing: G.dot3(F.a, V),
    neck: G.disc(n0, n1, nr, F, P),
    shade: G.solidOf(HEAD.shade, F, P),
    band: G.arcOf(F, HEAD.band, HEAD.shade[4][1], P),
    vents: G.dotsOf(F, HEAD.vents[0], HEAD.vents[1], HEAD.vents[2], P, { phase: Math.PI / HEAD.vents[2], fade: [0.04, 0.42] }),
    stem: G.disc(Math.sqrt(HEAD.shade[4][1] ** 2 - 2.6 ** 2), HEAD.shade[4][1] + 4, 2.6, FS, P),
    button: G.solidOf([[HEAD.shade[4][1] + 4, 4.6], [HEAD.shade[4][1] + 6.2, 4.6], [HEAD.shade[4][1] + 7.4, 3.6, 1], [HEAD.shade[4][1] + 7.8, 0]], FS, P),
    opening: G.circleOf(F, HEAD.rim[0], HEAD.rim[1], P),
    lip: G.circleOf(F, HEAD.lip[0], HEAD.lip[1], P),
    throat: G.circleOf(F, HEAD.throat[0], HEAD.throat[1], P),
    bulb: G.sphereOf(G.pointOf(F, HEAD.bulb[0], 0, 0), HEAD.bulb[1], P),
  };
}

// Where the light lands on a sheet: the beam's axis meets the sheet's plane, and the pool is the
// beam cut by that plane, an ellipse stretched along the beam. In the sheet's own flat coordinates
// (origin, xAxis, yAxis span the sheet; normal is its upper face's normal).
export function poolOf(lamp, theta, origin, xAxis, yAxis, normal) {
  const d = aimOf(lamp, theta);
  const B = G.add3(lamp.H, G.mul3(d, HEAD.bulb[0]));
  const dn = G.dot3(d, normal);
  if (dn > -0.05) return null;
  const t = G.dot3(G.sub3(origin, B), normal) / dn;
  if (t <= 0) return null;
  const hit = G.sub3(G.add3(B, G.mul3(d, t)), origin);
  const r = t * Math.tan(HEAD.cone);
  return {
    u: G.dot3(hit, xAxis),
    v: G.dot3(hit, yAxis),
    rx: r / -dn,
    ry: r,
    turn: (Math.atan2(G.dot3(d, yAxis), G.dot3(d, xAxis)) * 180) / Math.PI,
  };
}
