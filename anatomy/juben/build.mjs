// 剧本解剖图: a thread-bound script on a wooden flip-chart easel, five paper-cut stages inside.
// node build.mjs            writes juben.html and juben.svg (light theme, the platform palette)
// node build.mjs --audit    also proves the geometry with the kit's audit
// node build.mjs --chars    writes fonts/chars.txt, the glyphs tools/subset.py has to keep
// node build.mjs --quick    a draft: skips settling the painter's keys
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../.claude/skills/anatomy/kit/iso-kit.mjs";
import * as G from "../../.claude/skills/anatomy/kit/lathe.mjs";
import * as A from "../../.claude/skills/anatomy/kit/audit.mjs";
import { kitScript } from "../../.claude/skills/anatomy/scripts/inline-kit.mjs";
import { ACTS, ALL_OPEN, KEEP_MINUTES, NONE_OPEN, TOTAL_MINUTES, countOf, percentText, readoutOf, shareOf, tallyOf } from "./model.mjs";
import { TAG, TAG_RING, tagFace, tagFrame, tagSolid } from "./tag.mjs";
import { COVER, coverCentre, coverFace, coverFrame, coverKeyOf, coverSolid, faceTone } from "./cover.mjs";
import { curtainPaths } from "./curtain.mjs";
import { ART, GROUND, STAGES } from "./stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, "../../.claude/skills/anatomy");
const WIDTH = 600;
const AZ = 57;
const EL = 28;

// ---- the world, millimetres: x across the easel, y toward its front, z up ----------------------------
const deg = Math.PI / 180;
const LEAN = 13 * deg;
const sL = Math.sin(LEAN);
const cL = Math.cos(LEAN);
const X = [1, 0, 0];
const UP = [0, 0, 1];
const BV = [0, -sL, cL]; // up the board
const BW = [0, cL, sL]; // out of the board, toward the audience
const TRAY_Z = 560; // the tray's top: the script stands on it
const ORIGIN = [0, 0, TRAY_Z];
// a point in the board's frame: u across, v up the board, w out of it
const bp = (u, v, w = 0) => [u, v * BV[1] + w * BW[1], TRAY_Z + v * BV[2] + w * BW[2]];
const FB = G.frameOf(ORIGIN, BW, X, BV); // polygons in (u, v), extruded along w

// ---- the script ----------------------------------------------------------------------------------------
// A back board, five act slots, the cover. Bound on the right the old way: the cover's margin is sewn
// to the back board through four holes, and the cover swings open about the crease beside the stitches.
const BOOK = { left: -230, right: 230, h: 592, back: 6, slot: 9 };
const COUNT = ACTS.length;
const STACK = BOOK.back + COUNT * BOOK.slot; // the front of the pages
const FACE = STACK + COVER.t; // the cover's outer face
const SPINE = { u0: 204, v0: 10, v1: 580 }; // the sewn margin, cover crease at u0
const STITCH = { u: 217, holes: [62, 222, 368, 528] };
const COVER_B = { H: bp(SPINE.u0, SPINE.v0, FACE), u: X, v: BV, w: BW };
// act i (0 = the first page under the cover) lies in its slot; inside the slot, back to front: the
// ground row with the scene on it, the curtain, the arch
const slot0 = (index) => STACK - (index + 1) * BOOK.slot;
// the arch stops 24 mm short of the crease: the cover's 5 mm board turns about the crease, and an act on
// its way out drifts toward the binding (see "the acts come apart")
const ARCH = { u0: -222, u1: 180, v0: 22, v1: 552, pillar: 26, beam: 520 };
const OPEN = { u0: ARCH.u0 + ARCH.pillar, u1: ARCH.u1 - ARCH.pillar }; // between the pillars
const MID = (OPEN.u0 + OPEN.u1) / 2;
const GROUND_V = GROUND; // the ground row's top edge: the stage floor line
const PROP_T = 1.5;
const ARCH_T = 2;
const PROP_W = (index) => slot0(index);
const CURTAIN_W = (index) => slot0(index) + 4.5;
const ARCH_W = (index) => slot0(index) + BOOK.slot - ARCH_T;
// the tabs on the arches' left edges (the fore edge), the deeper acts higher, so their tags hang in a
// column beside the closed script and still clear each other once the acts stand apart
const TAB = { out: 76, half: 12, r: 6, hole: 66, holeR: 2.3, ringR: 4.4 };
const TAB_V = ACTS.map((_, index) => 130 + 100 * index);
const STRING = 8;
const STRING_OUT = 2.5; // the string leaves the tab square to its face and hangs this far in front of it

// ---- the acts come apart: each springs out of the script toward the audience -------------------------
// Seen from the front right, an act further out drifts left on screen; each act in front moves right
// by that drift, so the arches line up and the scenes behind show through the arches in front. The
// arch stands out in front of its own scene, so each act opens into a small stage.
const GAP = 100;
const DEPTH = { curtain: 15, arch: 38 };
const ALIGN = 1;
const DROP = 4;
const DRIFT = (GAP * cL * Math.cos(AZ * deg)) / Math.sin(AZ * deg);
const actMove = (index, extra = 0) => {
  const ahead = COUNT - 1 - index;
  const out = (COUNT - index) * GAP + extra;
  return G.add3(G.add3(G.mul3(BW, out), G.mul3(X, ALIGN * DRIFT * (ahead - (COUNT - 1) / 2))), G.mul3(BV, -DROP * ahead));
};

// ---- the easel ------------------------------------------------------------------------------------------
const BOARD = { half: 206, v0: -26, v1: 622, t: 16 };
const LEG = { w: -31, r: 15 };
const HEAD = { v0: 624, v1: 664, half: 104, w0: -50, w1: -16 };
const FOOT_U = 336;
const TOP_U = 76;
const legV0 = (-TRAY_Z - LEG.w * sL) / cL; // where a front leg's centre line meets the floor
const legU = (v, side) => side * (FOOT_U + ((TOP_U - FOOT_U) * (v - legV0)) / (HEAD.v1 - legV0));
const REAR = { top: bp(0, 640, HEAD.w0 - 10), foot: [0, -690, 0] };
const TRAY = { half: 234, w1: 84, t: 22, lip: 5, lipT: 9 };
const CLAMP = { half: 140, v0: 584, v1: 620, w1: 18 };

// ---- camera --------------------------------------------------------------------------------------------
const holeOf = (index) => bp(ARCH.u0 - TAB.hole, TAB_V[index], ARCH_W(index) + ARCH_T);
const tabEdgeOf = (index) => bp(ARCH.u0 - TAB.hole, TAB_V[index] - TAB.half, ARCH_W(index) + ARCH_T + STRING_OUT);
const tagTop = (index, offset = [0, 0, 0]) => {
  const edge = G.add3(tabEdgeOf(index), offset);
  return [edge[0], edge[1], edge[2] - STRING];
};
const tagCorners = (index, offset) => {
  const top = tagTop(index, offset);
  const right = [Math.sin(AZ * deg), -Math.cos(AZ * deg)];
  return [-1, 1].flatMap((side) => [0, -TAG.h].map((dz) => [top[0] + right[0] * side * (TAG.w / 2), top[1] + right[1] * side * (TAG.w / 2), top[2] + dz]));
};
const COVER_OPEN = 168 * deg;
const coverCorners = (theta) => {
  const F = coverFrame(COVER_B, theta);
  return [[0, 0], [COVER.w, 0], [COVER.w, COVER.h], [0, COVER.h]].map(([a, b]) => G.add3(F.o, G.add3(G.mul3(F.d, a), G.mul3(F.v, b))));
};
const fitPoints = [
  ...[-1, 1].map((side) => [side * (FOOT_U + 20), bp(0, legV0, LEG.w)[1], 0]),
  REAR.foot,
  bp(-HEAD.half, HEAD.v1, HEAD.w0),
  bp(HEAD.half, HEAD.v1, HEAD.w0),
  ...[0, 30, 60, 90, 120, 150, 168].flatMap((angle) => coverCorners(angle * deg)),
  ...ACTS.flatMap((_, index) => [[ARCH.u0 - TAB.out, ARCH.v0], [ARCH.u1, ARCH.v0], [ARCH.u1, ARCH.v1], [ARCH.u0, ARCH.v1]].map(([u, v]) => G.add3(bp(u, v, ARCH_W(index)), actMove(index, DEPTH.arch)))),
  ...ACTS.flatMap((_, index) => [...tagCorners(index, [0, 0, 0]), ...tagCorners(index, actMove(index, DEPTH.arch))]),
];
const PAD = 14;
const unit = fitPoints.map((point) => k.iso(point, { origin: [0, 0], scale: 1, azimuth: AZ, elevation: EL }));
const spanX = Math.max(...unit.map(([x]) => x)) - Math.min(...unit.map(([x]) => x));
const spanY = Math.max(...unit.map(([, y]) => y)) - Math.min(...unit.map(([, y]) => y));
const HEIGHT = Math.ceil(PAD * 2 + (spanY * (WIDTH - PAD * 2)) / spanX);
const P = k.fitProjection(fitPoints, WIDTH, HEIGHT, { pad: PAD, azimuth: AZ, elevation: EL });
const KS = G.scaleOf(P);
const V = G.viewOf(P);
const L = G.lightOf(P);
const at = (point) => k.iso(point, P);
const Sd = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const f2 = (value) => Math.round(value * 100) / 100;
const r4 = (value) => Math.round(value * 10000) / 10000;

// The flat drawing plane through `origin` with these two world directions as its x and y.
function planeMatrix(origin, xAxis, yAxis) {
  const o = at(origin);
  const x = at(G.add3(origin, xAxis));
  const y = at(G.add3(origin, yAxis));
  return `matrix(${r4(x[0] - o[0])} ${r4(x[1] - o[1])} ${r4(y[0] - o[0])} ${r4(y[1] - o[1])} ${r4(o[0])} ${r4(o[1])})`;
}
// a card's face plane in the board frame at depth w: art drawn with x = u and y = -v
const faceMatrix = (w) => planeMatrix(bp(0, 0, w), X, G.mul3(BV, -1));

// ---- the assemblies that come apart ---------------------------------------------------------------------
// One stagger for everything; a "~" slot holds no parts and only spaces the ones around it. The cover is
// three beats round before the first act comes out, then the acts spring out one by one; going back, the
// first act is that far home before the cover swings in over it, so the board's edge at the crease clears
// the arch it turns past. The curtains part after them one at a time, two beats apart; they slide nothing,
// so the kit replays only MOTION, and the page runs the whole list with the same springs.
const MOTION = ["cover", "~a", "~b", "~c", ...ACTS.map((_, index) => `a${index}`)];
const SLOTS = [...MOTION, ...ACTS.flatMap((_, index) => [`~${index + 1}`, `c${index}`])];
const SPRING = { stagger: 0.18, stiffness: 26, damping: 10.2, substeps: 4 };
const MOVES = Object.fromEntries(ACTS.map((_, index) => [`a${index}`, actMove(index)]));
const R = A.recorder(P, { order: MOTION, spring: SPRING });
const record = (shape) => R.solid(shape);
const nameFor = R.nameFor;

function put(piece, ref, svg, { bias = 0, shapes = [], name, move, ...rest } = {}) {
  return R.put({ piece, at: ref, bias, svg, move: move ?? MOVES[piece] ?? [0, 0, 0], shapes, name: name ?? nameFor(`${piece}.item`), ...rest });
}

const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
const plan = (u0, u1, v0, v1, r = 0, steps = 4) => k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, steps);
// a box in the board's frame
function boardBox(name, piece, [u0, u1], [v0, v1], [w0, w1], { r = 0, steps = 4, tone = "mid", cls = "m-gold", crease, inner = "", bias = 0, extra = "", move, ring } = {}) {
  const outline = ring ?? plan(u0, u1, v0, v1, r, steps);
  const paths = G.prismOf(FB, outline, w0, w1, P);
  return put(piece, bp((u0 + u1) / 2, (v0 + v1) / 2, (w0 + w1) / 2), `<g class="${cls}">${Sd(paths, { tone, crease, inner })}${extra}</g>`, {
    name,
    bias,
    move,
    shapes: [record(A.prism(FB, outline, w0, w1, { name }))],
  });
}
// a turned part on any axis
function turned(name, piece, F, profile, { tone = "mid", cls = "m-brass", inner = "", extra = "", bias = 0, shape, move, ...options } = {}) {
  const paths = G.solidOf(profile, F, P, options);
  const s0 = profile[0][0];
  const s1 = profile[profile.length - 1][0];
  return put(piece, G.pointOf(F, (s0 + s1) / 2, 0, 0), `<g class="${cls}">${Sd(paths, { tone, inner })}${extra}</g>`, {
    name,
    bias,
    move,
    shapes: [record(shape ?? A.solid(F, profile, { name }))],
  });
}

// A flat card of any outline, with holes, in the board frame at depth w0..w1: the face toward the
// audience, the cut edges in the kit's four shades by facing, the outline round the outside and holes.
const signedArea = (ring) => ring.reduce((sum, [x0, y0], index) => {
  const [x1, y1] = ring[(index + 1) % ring.length];
  return sum + x0 * y1 - x1 * y0;
}, 0) / 2;
function cardPaths(outer, holes, w0, w1) {
  const rings = [signedArea(outer) > 0 ? outer : [...outer].reverse(), ...holes.map((hole) => (signedArea(hole) < 0 ? hole : [...hole].reverse()))];
  const shades = [[], [], [], [], []];
  const edges = [];
  const crease = [];
  for (const ring of rings) {
    const n = ring.length;
    const seen = [];
    for (let j = 0; j < n; j++) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[(j + 1) % n];
      const normal = G.unit3(G.sub3(G.mul3(X, y1 - y0), G.mul3(BV, x1 - x0)));
      const visible = G.dot3(normal, V) > 1e-6;
      seen.push(visible);
      if (visible) shades[G.bandOf(G.dot3(normal, L))].push(k.pathOf([at(bp(x0, y0, w1)), at(bp(x1, y1, w1)), at(bp(x1, y1, w0)), at(bp(x0, y0, w0))], true));
    }
    // the silhouette: the face's edge where the cut edge under it is hidden, the cut edge's back where it shows
    for (let j = 0; j < n; j++) {
      const [x0, y0] = ring[j];
      const [x1, y1] = ring[(j + 1) % n];
      edges.push(seen[j] ? k.pathOf([at(bp(x0, y0, w0)), at(bp(x1, y1, w0))]) : k.pathOf([at(bp(x0, y0, w1)), at(bp(x1, y1, w1))]));
      if (seen[j]) crease.push(k.pathOf([at(bp(x0, y0, w1)), at(bp(x1, y1, w1))]));
      if (seen[j] !== seen[(j + n - 1) % n]) edges.push(k.pathOf([at(bp(x0, y0, w0)), at(bp(x0, y0, w1))]));
    }
  }
  const face = rings.map((ring) => k.pathOf(ring.map(([x, y]) => at(bp(x, y, w1))), true)).join("");
  shades[G.bandOf(G.dot3(BW, L))].push(face);
  return { face, shades: shades.slice(0, 4).map((list) => list.join("")), top: shades[4].join(""), crease: crease.join(""), outline: edges.join("") };
}
function cardSvg(paths, { tone = "mid", crease = "faint", inner = "" } = {}) {
  const shades = paths.shades.map((d, shade) => (d ? `<path class="iso-shade" data-shade="${shade}" fill-rule="evenodd" d="${d}"/>` : "")).join("");
  return `<g class="iso-solid"><path class="iso-fill" fill-rule="evenodd" d="${paths.face}"/>${shades}${paths.top ? `<path class="iso-top" fill-rule="evenodd" d="${paths.top}"/>` : ""}${paths.crease && crease !== "none" ? `<path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease}"/>` : ""}${inner}<path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/></g>`;
}

// ---- the easel --------------------------------------------------------------------------------------------
const TIP = [[0, 0], [2, 7, 1], [6, 11, 1], [12, 13]];
function easel() {
  // the head: a cross piece over the tops of the legs, a brass bolt through each leg
  const head = boardBox("stand.head", "stand", [-HEAD.half, HEAD.half], [HEAD.v0, HEAD.v1], [HEAD.w0, HEAD.w1], { r: 8, steps: 4 }).shapes;
  // the stay's two brass sleeves sit between halves of the rods they hold, not round one rod, so each
  // half orders cleanly against its sleeve: the stretcher at its middle, the rear leg where the stay meets it
  const SV = -270;
  const rearAxis = G.unit3(G.sub3(REAR.top, REAR.foot));
  const rearO = G.add3(REAR.foot, G.mul3(rearAxis, 2));
  const SLEEVE = 7;
  // two round front legs up the back of the board and one behind, each on a brass ferrule and a rubber tip
  const leg = (name, foot, top, sleeve = null) => {
    const axis = G.unit3(G.sub3(top, foot));
    // the leg's axis meets the floor at `foot`; the tip's lowest point sits on the floor
    const F = G.frameAlong(G.add3(foot, G.mul3(axis, 2)), axis);
    const length = G.len3(G.sub3(top, F.o));
    turned(`stand.tip${name}`, "stand", F, TIP, { cls: "m-indigo" });
    turned(`stand.ferrule${name}`, "stand", F, [[12, 16], [34, 16]], { cls: "m-brass", inner: Ln(G.arcOf(F, 18, 16, P), { tone: "faint" }) });
    const body = [[sleeve === null ? 34 : sleeve + SLEEVE, LEG.r], [length, LEG.r]];
    turned(`stand.leg${name}`, "stand", F, body, { cls: "m-gold", shape: A.solid(F, body, { name: `stand.leg${name}`, seated: true, cut: head }) });
    if (sleeve === null) return;
    turned(`stand.leg${name}.low`, "stand", F, [[34, LEG.r], [sleeve - SLEEVE, LEG.r]], { cls: "m-gold" });
    turned("stand.stay.collar", "stand", F, [[sleeve - SLEEVE, 17.5], [sleeve + SLEEVE, 17.5]], { cls: "m-brass" });
  };
  for (const side of [-1, 1]) leg(side, bp(legU(legV0, side), legV0, LEG.w), bp(legU(HEAD.v1 - 6, side), HEAD.v1 - 6, LEG.w));
  leg(0, REAR.foot, REAR.top, (bp(0, SV, LEG.w)[2] - rearO[2]) / rearAxis[2]);
  for (const side of [-1, 1]) {
    const F = G.frameOf(bp(legU(HEAD.v0 + 20, side), HEAD.v0 + 20, HEAD.w1), BW, X, BV);
    turned(nameFor("stand.bolt"), "stand", F, [[0, 6.5], [1.6, 6.5], [2.6, 5.6, 1], [3.6, 3.6, 1], [4.1, 0]], { cls: "m-brass" });
  }
  // the board, the tray on its front on two brackets, a maker's plate on the tray
  boardBox("stand.board", "stand", [-BOARD.half, BOARD.half], [BOARD.v0, BOARD.v1], [-BOARD.t, 0], { r: 3 });
  boardBox("stand.tray", "stand", [-TRAY.half, TRAY.half], [-TRAY.t, 0], [0, TRAY.w1], { r: 2 });
  boardBox("stand.lip", "stand", [-TRAY.half, TRAY.half], [0, TRAY.lip], [TRAY.w1 - TRAY.lipT, TRAY.w1], { r: 2 });
  for (const u of [-150, 150]) {
    const F = G.frameOf(bp(u - 7, 0, 0), X, BW, BV);
    const gusset = [[0, -TRAY.t], [62, -TRAY.t], [0, -TRAY.t - 70]];
    put("stand", bp(u, -TRAY.t - 20, 18), `<g class="m-gold">${Sd(G.prismOf(F, gusset, 0, 14, P), { tone: "mid" })}</g>`, { name: nameFor("stand.bracket"), shapes: [record(A.prism(F, gusset, 0, 14, { name: nameFor("stand.bracket") }))] });
  }
  {
    const [p0, p1, v0, v1] = [-46, 46, -19, -5];
    const plate = rect(p0, p1, v0, v1);
    const rules = [[p0 + 9, p1 - 9, -9], [p0 + 9, p1 - 22, -12], [p0 + 9, p1 - 34, -15]].map(([a, b2, v]) => k.pathOf([at(bp(a, v, TRAY.w1 + 0.8)), at(bp(b2, v, TRAY.w1 + 0.8))])).join("");
    put("stand", bp(0, -12, TRAY.w1 + 0.4), `<g class="m-brass">${Sd(G.prismOf(FB, plate, TRAY.w1, TRAY.w1 + 0.8, P), { tone: "mid", crease: "faint" })}${Ln(rules, { tone: "lo", free: true })}${Dt([at(bp(p0 + 4, -12, TRAY.w1 + 0.8)), at(bp(p1 - 4, -12, TRAY.w1 + 0.8))], { size: 0.55, tone: "mid" })}</g>`, {
      name: "stand.plate",
      bias: 0.2,
      shapes: [record(A.prism(FB, plate, TRAY.w1, TRAY.w1 + 0.8, { name: "stand.plate" }))],
    });
  }
  // a pointer lying in the tray, between the script and the lip
  {
    const F = G.frameOf(bp(-196, 4.5, 66), X, BW, BV);
    const length = 330;
    turned("stand.pointer.tip", "stand", F, [[0, 0], [1.2, 2.6, 1], [3, 3.6, 1], [9, 3.8]], { cls: "m-indigo" });
    turned("stand.pointer", "stand", F, [[9, 3.4], [length - 26, 4.4]], { cls: "m-gold" });
    turned("stand.pointer.ferrule", "stand", F, [[length - 26, 4.6], [length - 12, 4.6]], { cls: "m-brass" });
    turned("stand.pointer.knob", "stand", F, [[length - 12, 3.4], [length - 9, 4.4, 1], [length - 4, 4.4, 1], [length, 0]], { cls: "m-brass" });
  }
  // the clamp over the script's back board, two knurled thumb screws on its face
  const FC = G.frameOf(bp(-CLAMP.half, 0, 0), X, BW, BV);
  const clampRing = [[0, CLAMP.v1], [0, BOOK.h], [BOOK.back, BOOK.h], [BOOK.back, CLAMP.v0], [CLAMP.w1, CLAMP.v0], [CLAMP.w1, CLAMP.v1]];
  put("stand", bp(0, (CLAMP.v0 + CLAMP.v1) / 2, CLAMP.w1 / 2), `<g class="m-gold">${Sd(G.prismOf(FC, clampRing, 0, CLAMP.half * 2, P), { tone: "mid" })}</g>`, {
    name: "stand.clamp",
    shapes: [record(A.prism(FC, clampRing, 0, CLAMP.half * 2, { name: "stand.clamp" }))],
  });
  for (const u of [-96, 96]) {
    const F = G.frameOf(bp(u, (CLAMP.v0 + CLAMP.v1) / 2, CLAMP.w1), BW, X, BV);
    const knob = [[0, 4], [3, 4], [3, 8.5], [4, 9.5, 1], [10, 9.5, 1], [11, 8.5], [11, 0]];
    turned(nameFor("stand.knob"), "stand", F, knob, { cls: "m-brass", extra: k.fadedSvg(G.ribsOf(F, 4, 10, 9.5, 26, P, { fade: [0.1, 0.55] }), { tone: "lo" }) });
  }
  // a stretcher between the front legs and a folding brass stay back to the rear leg
  const legShapes = R.solids.filter((shape) => /^stand\.leg-?1$/.test(shape.name));
  {
    const u = Math.abs(legU(SV, 1));
    const F = G.frameOf(bp(-u + 8, SV, LEG.w), X, BW, BV);
    for (const [name, s0, s1] of [["stand.stretcher", 0, u - 8 - SLEEVE], ["stand.stretcher.right", u - 8 + SLEEVE, 2 * u - 16]]) {
      const rod = [[s0, 9], [s1, 9]];
      turned(name, "stand", F, rod, { cls: "m-gold", shape: A.solid(F, rod, { name, seated: true, cut: legShapes }) });
    }
  }
  {
    const front = bp(0, SV, LEG.w);
    const rearLeg = R.solids.find((shape) => shape.name === "stand.leg0");
    const axis = rearLeg.F.a;
    const t = (front[2] - rearLeg.F.o[2]) / axis[2];
    const back = G.add3(rearLeg.F.o, G.mul3(axis, t));
    // the clip on the stretcher (the collar on the rear leg is drawn with the leg), the two leaves of
    // the stay meeting at a knuckle
    const clipF = G.frameOf(G.add3(front, [-SLEEVE, 0, 0]), X, [0, 1, 0], UP);
    turned("stand.stay.clip", "stand", clipF, [[0, 11.5], [2 * SLEEVE, 11.5]], { cls: "m-brass" });
    const a = G.add3(front, [0, -11.5, 0]);
    const b2 = G.add3(back, [0, 17.5 * Math.hypot(axis[1], axis[2]) / axis[2], 0]);
    const knuckle = G.mul3(G.add3(a, b2), 0.5);
    const leaf = rect(-6, 6, -1.5, 1.5);
    for (const [from, to, name] of [[a, G.add3(knuckle, [0, 5, 0]), "stand.stay.front"], [G.add3(knuckle, [0, -5, 0]), b2, "stand.stay.back"]]) {
      const F = G.frameOf(from, G.unit3(G.sub3(to, from)), X, UP);
      const length = G.len3(G.sub3(to, from));
      put("stand", G.mul3(G.add3(from, to), 0.5), `<g class="m-brass">${Sd(G.prismOf(F, leaf, 0, length, P), { tone: "mid" })}</g>`, { name, shapes: [record(A.prism(F, leaf, 0, length, { name }))] });
    }
    const KF = G.frameOf(G.add3(knuckle, [-6, 0, 0]), X, [0, 1, 0], UP);
    turned("stand.stay.knuckle", "stand", KF, [[0, 5], [12, 5]], { cls: "m-brass", extra: Dt([at(G.add3(knuckle, [6, 0, 0]))], { size: 0.6, tone: "mid" }) });
  }
}

function book() {
  boardBox("book.back", "book", [BOOK.left, BOOK.right], [0, BOOK.h], [0, BOOK.back], { cls: "m-indigo", r: 3 });
  // the sewn margin: the thread runs down the stitch line between the corner guards and round the
  // spine edge at each of the four holes
  const ends = [SPINE.v0 + 20, SPINE.v1 - 20];
  const stitches = STITCH.holes.map((v) => k.pathOf([at(bp(STITCH.u, v, FACE)), at(bp(BOOK.right, v, FACE)), at(bp(BOOK.right, v, BOOK.back))])).join("") + k.pathOf([at(bp(STITCH.u, ends[0], FACE)), at(bp(STITCH.u, ends[1], FACE))]);
  const spine = boardBox("book.spine", "book", [SPINE.u0, BOOK.right], [SPINE.v0, SPINE.v1], [BOOK.back, FACE], { cls: "m-indigo", r: 1.5, extra: `<g class="thread">${Ln(stitches, { tone: "hi" })}${Dt(STITCH.holes.map((v) => at(bp(STITCH.u, v, FACE))), { size: 0.9, tone: "hi" })}</g>` });
  // silk guards over the two corners of the spine, lying on its outside: an angle over its face and its
  // edge, run along the spine, and over the top end a cap (the bottom end is never seen)
  const FV = G.frameOf(ORIGIN, BV, X, BW); // polygons in (u, w), run along v
  const angle = [[STITCH.u - 5, FACE], [BOOK.right, FACE], [BOOK.right, BOOK.back], [BOOK.right + 1, BOOK.back], [BOOK.right + 1, FACE + 0.8], [STITCH.u - 5, FACE + 0.8]];
  const capRing = rect(STITCH.u - 5, BOOK.right + 1, SPINE.v1, SPINE.v1 + 1);
  for (const [v0, v1, cap] of [[SPINE.v0, ends[0], false], [ends[1], SPINE.v1, true]]) {
    const name = nameFor("book.guard");
    const svg = Sd(G.prismOf(FV, angle, v0, v1, P), { tone: "mid" }) + (cap ? Sd(G.prismOf(FB, capRing, BOOK.back, FACE + 0.8, P), { tone: "mid" }) : "");
    put("book", bp(BOOK.right - 6, (v0 + v1) / 2, FACE), `<g class="m-brocade">${svg}</g>`, {
      name,
      bias: 0.1,
      shapes: [record(A.prism(FV, angle, v0, v1, { name })), ...(cap ? [record(A.prism(FB, capRing, BOOK.back, FACE + 0.8, { name: `${name}.cap` }))] : [])],
    });
  }
}

// the cover: drawn at rest here; the page swings it and rewrites its paths
const coverShape = (theta, name) => {
  const F = coverFrame(COVER_B, theta);
  return A.prism({ o: F.o, a: G.mul3(F.n, -1), u: F.d, v: F.v }, rect(0, COVER.w, 0, COVER.h), 0, COVER.t, { name });
};
function cover() {
  const F = coverFrame(COVER_B, 0);
  const solid = coverSolid(F, P);
  const faces = solid.faces.map((face) => `<path class="cover-face" data-face="${face.side}" d="${face.d}" style="fill:${faceTone(face.light)}"/>`).join("");
  const shades = solid.shades.map((d, shade) => `<path class="iso-shade" data-shade="${shade}" d="${d}"/>`).join("");
  const content = [1, -1].map((side) => `<g class="cover-side" data-side="${side}" transform="${coverFace(F, side, P)}"${side === 1 ? "" : ' style="display:none"'}>${side === 1 ? ART.outer : ART.inner}</g>`).join("");
  const svg = `<g class="m-indigo cover"><g class="iso-solid"><path class="iso-fill" d="${solid.fill}"/>${shades}<path class="iso-top" d="${solid.top}"/>${faces}<path class="iso-line iso-crease" data-tone="faint" d="${solid.crease}"/><path class="iso-line iso-edge" data-tone="mid" d="${solid.outline}"/></g>${content}</g>`;
  put("cover", coverCentre(F), svg, { name: "book.cover", shapes: [record(coverShape(0, "book.cover"))] });
}

// ---- the acts ------------------------------------------------------------------------------------------------
// an arch: two pillars and a beam with a scalloped valance, the tab on the left pillar
function archOutline(tabV) {
  const { u0, u1, v0, v1, beam } = ARCH;
  const count = 9;
  const width = (OPEN.u1 - OPEN.u0) / count;
  const valance = [];
  for (let index = 0; index < count; index++) {
    const start = OPEN.u0 + index * width;
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      if (index > 0 && step === 0) continue;
      valance.push([start + width * t, beam - 12 * Math.sin(Math.PI * t)]);
    }
  }
  const c = TAB.r * (1 - Math.SQRT1_2);
  const tab = [[u0, tabV - TAB.half], [u0 - TAB.out + TAB.r, tabV - TAB.half], [u0 - TAB.out + c, tabV - TAB.half + c], [u0 - TAB.out, tabV - TAB.half + TAB.r], [u0 - TAB.out, tabV + TAB.half - TAB.r], [u0 - TAB.out + c, tabV + TAB.half - c], [u0 - TAB.out + TAB.r, tabV + TAB.half], [u0, tabV + TAB.half]];
  // counterclockwise: along the bottom of the left pillar, up its inside, along the valance, down the
  // right pillar's inside, round the outside and down the fore edge past the tab
  return [[u0, v0], [OPEN.u0, v0], ...valance, [OPEN.u1, v0], [u1, v0], [u1, v1], [u0, v1], ...tab.reverse()];
}

function acts() {
  ACTS.forEach((act, index) => {
    const piece = `a${index}`;
    const stage = STAGES[act.id];
    // the ground row: a strip along the bottom with the scene cut out above it
    const wP = PROP_W(index);
    const prop = cardPaths(stage.outline, stage.holes ?? [], wP, wP + PROP_T);
    put(piece, bp(MID, 300, wP), `<g class="${stage.cls ?? "m-paper"}">${cardSvg(prop, { tone: "mid" })}<g class="art" transform="${faceMatrix(wP + PROP_T)}">${stage.art}</g></g>`, {
      name: `act${index}.scene`,
      shapes: [record(A.prism(FB, stage.outline, wP, wP + PROP_T, { name: `act${index}.scene` }))],
    });
    // the curtain, two halves on a rod behind the beam
    const wC = CURTAIN_W(index);
    const CF = { o: bp(MID, 0, wC), u: X, v: BV, w: BW };
    for (const side of [-1, 1]) {
      const panels = curtainPaths(CF, (OPEN.u1 - OPEN.u0) / 2 + 4, side, 0, ARCH.beam + 2, GROUND_V + 3, P);
      const svg = `<g class="m-indigo curtain" data-curtain="${index}" data-side="${side}">${panels.map((panel) => `<path class="cur-panel" data-shade="${panel.shade}" d="${panel.d}"/>`).join("")}</g>`;
      const half = rect(side < 0 ? OPEN.u0 - 4 : MID, side < 0 ? MID : OPEN.u1 + 4, GROUND_V + 3, ARCH.beam + 2);
      put(piece, bp(MID, 300, wC), svg, {
        name: `act${index}.curtain${side}`,
        move: actMove(index, DEPTH.curtain),
        shapes: [record(A.prism(FB, half, PROP_W(index) + PROP_T, ARCH_W(index), { name: `act${index}.curtain${side}` }))],
      });
    }
    // the arch, its tab on the fore edge
    const wF = ARCH_W(index);
    const outline = archOutline(TAB_V[index]);
    const arch = cardPaths(outline, [], wF, wF + ARCH_T);
    const holeU = ARCH.u0 - TAB.out + (TAB.out - TAB.hole);
    const ring = `<circle class="tab-ring" cx="${holeU}" cy="${-TAB_V[index]}" r="${TAB.ringR}"/><circle class="tab-hole" cx="${holeU}" cy="${-TAB_V[index]}" r="${TAB.holeR}"/>`;
    put(piece, bp(MID, 300, wF), `<g class="m-gold">${cardSvg(arch, { tone: "mid" })}<g class="art" transform="${faceMatrix(wF + ARCH_T)}">${ART.arch(index, ARCH)}${ring}</g></g>`, {
      name: `act${index}.arch`,
      move: actMove(index, DEPTH.arch),
      shapes: [record(A.prism(FB, outline, wF, wF + ARCH_T, { name: `act${index}.arch` }))],
    });
  });
}

// ---- tags on strings from the tabs -------------------------------------------------------------------
function glyphs(text, x, top, size, pitch, className) {
  return [...text].map((ch, index) => `<text class="${className}" x="${f2(x)}" y="${f2(top + pitch * index + pitch / 2)}" font-size="${size}">${ch}</text>`).join("");
}
const FRAME_TOP = 15.5;
const TAGFRAME = { x0: -TAG.w / 2 + 3, x1: TAG.w / 2 - 3, y0: FRAME_TOP, y1: TAG.h - 3 };
const framePath = `M${TAGFRAME.x0 + 1.4} ${TAGFRAME.y0}H${TAGFRAME.x1 - 1.4}Q${TAGFRAME.x1} ${TAGFRAME.y0} ${TAGFRAME.x1} ${TAGFRAME.y0 + 1.4}V${TAGFRAME.y1 - 1.4}Q${TAGFRAME.x1} ${TAGFRAME.y1} ${TAGFRAME.x1 - 1.4} ${TAGFRAME.y1}H${TAGFRAME.x0 + 1.4}Q${TAGFRAME.x0} ${TAGFRAME.y1} ${TAGFRAME.x0} ${TAGFRAME.y1 - 1.4}V${TAGFRAME.y0 + 1.4}Q${TAGFRAME.x0} ${TAGFRAME.y0} ${TAGFRAME.x0 + 1.4} ${TAGFRAME.y0}Z`;
const GROMMET = 3.6;
const eyelet = `<circle class="tag-hole" cy="${TAG.hole}" r="${TAG.holeR}"/><circle class="iso-line" data-tone="mid" cy="${TAG.hole}" r="${GROMMET}"/><path class="iso-line tag-string" data-tone="mid" d="M0 0V${TAG.hole - GROMMET}"/>`;

function frontFace(act) {
  const count = [...act.name].length;
  const size = 17;
  const pitch = size + 3;
  const top = (TAGFRAME.y0 + TAGFRAME.y1) / 2 - (pitch * count) / 2;
  return `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}${glyphs(act.name, 0, top, size, pitch, "tag-name")}`;
}

function backFace(act) {
  const size = 11.6;
  const pitch = 12.6;
  const xs = act.columns.length === 1 ? [0] : [7.2, -7.2];
  const rows = Math.max(...act.columns.map((text) => [...text].length));
  const top = (TAGFRAME.y0 + TAGFRAME.y1) / 2 - (pitch * rows) / 2;
  let svg = `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}`;
  act.columns.forEach((text, index) => (svg += glyphs(text, xs[index], top, size, pitch, "tag-quote")));
  return svg;
}

function tags() {
  ACTS.forEach((act, index) => {
    const piece = `a${index}`;
    const move = actMove(index, DEPTH.arch);
    const hole = holeOf(index);
    const edge = tabEdgeOf(index);
    const top = tagTop(index);
    // out of the hole square to the tab, round a small bend, down past the tab's edge and plumb to the tag
    const route = G.fillet([hole, G.add3(hole, G.mul3(BW, STRING_OUT)), edge, top], 1.2);
    R.route(`tag.string${index}`, route, 0.35, { piece, move, rims: [0.35, 0.35] });
    put(piece, [top[0], top[1], (hole[2] + top[2]) / 2], `<path class="iso-line tag-string" data-tone="mid" d="${k.pathOf(route.map(at))}"/>${Dt([at(hole)], { size: 0.8, tone: "hi" })}`, {
      name: `tag.string${index}`,
      bias: 0.3,
      move,
      shapes: [A.tube(route, 0.5, { name: `tag.string${index}`, owner: `tag.string${index}` }), A.ball(hole, 0.8 / KS, { name: `tag.knot${index}`, owner: `tag.string${index}` })],
    });
    const F = tagFrame(top, 0, AZ);
    const solid = tagSolid(F, P);
    const faces = solid.faces.map((face) => `<path class="tag-face" data-face="${face.side}" d="${face.d}" style="fill:${faceTone(face.light)}"/>`).join("");
    const content = [1, -1]
      .map((side) => `<g class="tag-side" data-side="${side}" transform="${tagFace(F, side, P)}"${side === 1 ? "" : ' style="display:none"'}>${side === 1 ? frontFace(act) : backFace(act)}</g>`)
      .join("");
    const shades = solid.shades.map((d, shade) => `<path class="iso-shade" data-shade="${shade}" d="${d}"/>`).join("");
    const svg =
      `<g class="m-wood tag" data-tag="${index}"><g class="iso-solid">` +
      `<path class="iso-fill" d="${solid.fill}"/>${shades}<path class="iso-top" d="${solid.top}"/>${faces}` +
      `<path class="iso-line iso-crease" data-tone="faint" d="${solid.crease}"/><path class="iso-line iso-edge" data-tone="hi" d="${solid.outline}"/></g>${content}</g>`;
    const tagShape = A.prism({ o: top, a: F.n, u: F.u, v: [0, 0, 1] }, TAG_RING, -TAG.t / 2, TAG.t / 2, { name: `tag.tag${index}` });
    put(piece, [top[0], top[1], top[2] - TAG.h / 2], svg, { name: `tag.tag${index}`, bias: 0.4, move, shapes: [record(tagShape)] });
  });
}

// ---- assemble ----------------------------------------------------------------------------------------
easel();
book();
acts();
cover();
tags();

// The cover swings rather than slides, so its place in the painter's order is worked out pose by pose:
// a stand-in at each angle is measured against every part (the acts at home, and apart once the cover
// is most of the way round), and the cover takes a key above everything it covers there and below
// everything that covers it.
const COVER_STEPS = Array.from({ length: 15 }, (_, index) => (COVER_OPEN * index) / 14);
const QUICK = process.argv.includes("--quick") || process.argv.includes("--chars");
const started = Date.now();
// Two departures from the kit's defaults, to keep settling in minutes: the parts of one act are flat cards
// stacked along the one direction they all move in (scene, curtain, arch, front to back and staying so),
// so their pairs are left out and their keys keep that order on their own; and the overlaps are measured
// on a 1-unit grid, which these cards and boards, all far wider than a unit, do not need finer.
const SKIP = (a, b) => A.sameRun(a, b) || a.name === "book.cover" || b.name === "book.cover" || (a.piece === b.piece && /^a\d$/.test(a.piece));
const DEPTH_STATES = A.explodeStates(MOTION, SPRING).depth;
if (!QUICK) A.settle(R, P, { skip: SKIP, states: DEPTH_STATES, step: 1 });
if (!QUICK) console.log(`settled in ${((Date.now() - started) / 1000).toFixed(1)} s`);
const coverItem = R.items.find((item) => item.name === "book.cover");
const others = R.items.filter((item) => item !== coverItem);
const proxies = COVER_STEPS.map((theta, step) => ({ ...coverItem, name: `cover@${step}`, key: 0, shapes: [coverShape(theta, "book.cover")] }));
const coverPairs = QUICK ? [] : A.overlapsOf([...proxies, ...others], P, { states: [0, 1], step: 0.5, skip: (a, b) => proxies.includes(a) === proxies.includes(b) }).pairs;
const coverKeys = COVER_STEPS.map((theta, step) => {
  // the acts are home until the cover is most of the way round; after that they may be anywhere
  const states = theta < 100 * deg ? [0] : [0, 1];
  let low = -Infinity;
  let high = Infinity;
  for (const pair of coverPairs) {
    if (!states.includes(pair.state) || (pair.a !== step && pair.b !== step)) continue;
    const other = others[(pair.a === step ? pair.b : pair.a) - proxies.length];
    const [coverSide, otherSide] = pair.a === step ? pair.front : [pair.front[1], pair.front[0]];
    const key = A.keyAt(other, pair.state, R.V);
    if (coverSide.area >= 0.25 && otherSide.area < 0.25) low = Math.max(low, key);
    if (otherSide.area >= 0.25 && coverSide.area < 0.25) high = Math.min(high, key);
  }
  if (low >= high) console.log(`cover at ${(theta / deg).toFixed(0)}°: no key fits (${low.toFixed(2)} ≥ ${high.toFixed(2)})`);
  // a draft build measures nothing: the cover simply goes over everything in the script
  if (QUICK) return Math.max(...others.filter((item) => item.piece.startsWith("a") || item.piece === "book").map((item) => item.key)) + 0.01;
  const key = low === -Infinity ? (high === Infinity ? coverItem.key : high - 0.01) : high === Infinity ? low + 0.01 : Math.min(low + 0.01, (low + high) / 2);
  return Math.round(key * 1000) / 1000;
});
console.log(`cover keys measured in ${((Date.now() - started) / 1000).toFixed(1)} s`);
coverItem.key = coverKeys[0];
// where the board turns edge-on to the reader: its outside shows below this angle, its inside above
const COVER_FLIP = Math.atan2(G.dot3(R.V, BW), -G.dot3(R.V, X));
const COVER_ORDER = { keys: coverKeys, flip: COVER_FLIP, open: COVER_OPEN };
const ordered = R.items.slice().sort((a, b) => a.key - b.key);
const body = ordered
  .map((item, index) => {
    const [mx, my, mz] = item.move;
    return `<g class="it" data-piece="${item.piece}" data-name="${item.name}" data-k="${item.key.toFixed(3)}" data-m="${f2(mx)},${f2(my)},${f2(mz)}" data-i="${index}">${item.svg}</g>`;
  })
  .join("");

const LABEL = "一个木制翻页架，三条腿撑开，架上夹着一本线装剧本，封面是一张京剧脸谱。剧本里是五幕纸雕立体舞台，从前往后是开场、回顾、问题、要求、表态，每幕挂着一道幕布和一块小牌。两个小时的戏，真正要记下来的只有要求那五分钟。";

const closedTally = tallyOf(NONE_OPEN);
const readoutHtml = (tally) => `<span class="ro-count">${countOf(tally)}</span><span class="ro-sep"> · </span><span class="ro-share">${shareOf(tally)}</span>`;
const STAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${LABEL}">${body}</svg>`;

// ---- styles ------------------------------------------------------------------------------------------
const FONT_CSS_URL = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css";
const manifestPath = join(HERE, "fonts", "manifest.json");
const embedded = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
      .map((entry) => `@font-face{font-family:"Juben WenKai";font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${readFileSync(join(HERE, "fonts", entry.file)).toString("base64")}) format("woff2");unicode-range:${entry.range}}`)
      .join("")
  : "";

const TOKENS = `
.iso{--paper:#ECEAE1;--sheet:#F8F7F2;--ink:#24231F;--ink-2:#4E4C45;--ink-3:#6B685F;--line:#D6D2C4;--line-2:#E4E0D4;--indigo:#1F3A4D;--gold:#C9A86A;--cinnabar:#B5382A;
  --kai:"LXGW WenKai","Juben WenKai","KaiTi","STKaiti",serif}
.iso[data-theme="light"]{
  --anatomy-page:var(--paper);--anatomy-card:var(--sheet);--anatomy-text:var(--ink-2);--anatomy-strong:var(--ink);--anatomy-muted:var(--ink-3);
  --anatomy-paper:var(--sheet);--anatomy-face:#FCFBF8;--anatomy-top:#FCFBF8;
  --anatomy-shade-0:#E2DED2;--anatomy-shade-1:#EAE7DD;--anatomy-shade-2:#F0EEE6;--anatomy-shade-3:#F5F3ED;
  --anatomy-lit-top:#FCFBF8;--anatomy-lit-shade:#F0EEE6;
  --anatomy-hi:var(--ink);--anatomy-mid:var(--ink-3);--anatomy-lo:#A79F88;--anatomy-faint:var(--line);--anatomy-lit:var(--ink);
  --anatomy-halo:#6E6656;--anatomy-halo-opacity:.30;--anatomy-dot:var(--ink)}
.m-gold{--anatomy-paper:#C9A86A;--anatomy-top:#E2CB98;--anatomy-shade-3:#D6BB83;--anatomy-shade-2:#C9A86A;--anatomy-shade-1:#B7955A;--anatomy-shade-0:#B7955A;
  --anatomy-faint:#BFA06A;--anatomy-lo:#957747;--anatomy-mid:#6D5733;--anatomy-dot:#5A4626}
.m-brass{--anatomy-paper:#C9A86A;--anatomy-top:#E2CB98;--anatomy-shade-3:#D6BB83;--anatomy-shade-2:#C9A86A;--anatomy-shade-1:#B7955A;--anatomy-shade-0:#B7955A;
  --anatomy-faint:#A88A52;--anatomy-lo:#8A6D3F;--anatomy-mid:#5E4A2A;--anatomy-dot:#4E3D22}
.m-indigo{--anatomy-paper:#3B576C;--anatomy-top:#5D798D;--anatomy-shade-3:#4B677B;--anatomy-shade-2:#3B576C;--anatomy-shade-1:#2D485C;--anatomy-shade-0:#1F3A4D;
  --anatomy-faint:#3A5367;--anatomy-lo:#2A3F4F;--anatomy-mid:#1C2C38;--anatomy-dot:var(--sheet);
  --face:#3B576C;--face-lit:#5D798D;--face-dark:#2D485C}
.m-paper{--anatomy-paper:#F2EFE6;--anatomy-top:#FBFAF6;--anatomy-shade-3:#F4F2EB;--anatomy-shade-2:#ECE9E0;--anatomy-shade-1:#E2DED2;--anatomy-shade-0:#D6D1C3;--anatomy-faint:#D6D2C4;--anatomy-lo:#8F8A7C;--anatomy-mid:#4E4C45}
.m-wood{--anatomy-paper:#F2ECDF;--anatomy-top:#FBF8F1;--anatomy-shade-3:#F3EEE3;--anatomy-shade-2:#EAE2D2;--anatomy-shade-1:#E0D6C3;--anatomy-shade-0:#D3C7B0;
  --anatomy-faint:#D2C6AF;--anatomy-lo:#B3A68C;--anatomy-mid:#7B7160;--anatomy-dot:var(--ink);
  --face:#F5F0E5;--face-lit:#FCFAF5;--face-dark:#DDD3C0}
.m-brocade{--anatomy-paper:#C9A86A;--anatomy-top:#E2CB98;--anatomy-shade-3:#D6BB83;--anatomy-shade-2:#C9A86A;--anatomy-shade-1:#B7955A;--anatomy-shade-0:#B7955A;--anatomy-mid:#6D5733;--anatomy-faint:#A88A52}
.thread .iso-line{stroke:#E9DDBF}
.thread .iso-dots circle{fill:#14263A;opacity:.9}
.curtain{--anatomy-shade-0:#2D485C;--anatomy-shade-1:#3B576C;--anatomy-shade-2:#4B677B;--anatomy-shade-3:#5D798D;--anatomy-mid:#1C2C38}
.cur-panel{stroke:var(--anatomy-mid);stroke-width:.45;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.cur-panel[data-shade="0"]{fill:var(--anatomy-shade-0)}
.cur-panel[data-shade="1"]{fill:var(--anatomy-shade-1)}
.cur-panel[data-shade="2"]{fill:var(--anatomy-shade-2)}
.cur-panel[data-shade="3"]{fill:var(--anatomy-shade-3)}
.cover-face{fill:var(--face);stroke:none}
.tab-ring{fill:#E2CB98;stroke:#957747;stroke-width:.45;vector-effect:non-scaling-stroke}
.tab-hole{fill:#6B685F;stroke:none}
.tag-face{fill:var(--face);stroke:none}
.tag-hole{fill:#A99B80}
.tag-name,.tag-quote{font-family:var(--kai);text-anchor:middle;dominant-baseline:central;fill:var(--ink)}
${ART.css}
`;

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:15px/1.7 var(--kai);-webkit-font-smoothing:antialiased}
.iso-page{width:min(780px,100% - 32px);margin:48px auto 88px}
.iso-figure{margin:0}
.iso-plate{padding:58px 22px 56px;box-shadow:0 0 0 1px var(--line)}
.iso-plate-corner{font-family:var(--kai);font-size:13px;letter-spacing:.06em;color:var(--ink-3)}
.iso-plate-corner[data-corner="fig"]{color:var(--ink-2)}
.iso-plate-corner[data-corner="title"]{color:var(--ink);font-size:15px;letter-spacing:.18em;text-transform:none;top:-2px}
.iso-plate-corner[data-corner="hint"]{letter-spacing:.12em;text-transform:none}
.iso-plate-corner[data-corner="readout"]{color:var(--ink);font-variant-numeric:tabular-nums}
.iso-stage{position:relative;outline:none;touch-action:pan-y;cursor:pointer;border-radius:2px}
.iso-stage:focus-visible{outline:1px solid var(--ink-3);outline-offset:6px}
.iso-legend{margin-top:14px;color:var(--ink-2);font-size:14px;line-height:1.75;gap:10px}
.iso-key{color:var(--ink-2)}
.iso-swatch path{stroke:var(--ink)}
.iso-swatch[data-mark="raised"] path{stroke:#B7955A}
.iso-swatch[data-mark="flat"] path{stroke:var(--indigo)}
.iso-swatch[data-mark="dim"] path{stroke:#A79F88}
.acts{width:100%;border-collapse:collapse;font-size:13.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.acts th,.acts td{padding:4px 6px;border-bottom:1px solid var(--line-2);text-align:left;font-weight:400}
.acts th{color:var(--ink-3);font-size:12.5px;letter-spacing:.06em}
.acts td.n,.acts th.n{text-align:right;white-space:nowrap}
.acts tr.keep td{color:var(--ink)}
.acts tfoot td{border-bottom:none;color:var(--ink)}
.acts .q2{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:560px){
  .iso-plate{padding:50px 8px 92px}
  .iso-plate-corner{font-size:12px}
  .iso-plate-corner[data-corner="hint"]{bottom:40px}
  .iso-plate-corner[data-corner="readout"]{font-size:11.5px;letter-spacing:.02em;line-height:1.4}
  .ro-count,.ro-share{display:block;text-align:right}
  .ro-sep{display:none}
  .acts .q,.acts .d{display:none}
  .acts .q2{display:block;color:var(--ink-3);font-size:12.5px;line-height:1.5}
}
`;

// ---- the legend under the card ---------------------------------------------------------------------
const whole = tallyOf(ALL_OPEN);
const rows = ACTS.map(
  (act, index) =>
    `<tr${act.keep ? ' class="keep"' : ""}><td>${index + 1}</td><td>${act.name}<span class="q2">“${act.quote}”</span></td><td class="q">“${act.quote}”</td><td class="d">${act.scene}</td><td class="n">${act.minutes} 分钟</td></tr>`,
).join("");
const table = `<table class="acts"><thead><tr><th>幕</th><th>名字</th><th class="q">小牌背面</th><th class="d">舞台上</th><th class="n">时长</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td></td><td>合计<span class="q2">要记的 ${KEEP_MINUTES} 分钟，占 ${percentText(whole.share)}</span></td><td class="q"></td><td class="d">要记的只有要求一幕：${KEEP_MINUTES} 分钟，占 ${percentText(whole.share)}</td><td class="n">${TOTAL_MINUTES} 分钟</td></tr></tfoot></table>`;
const swatch = (mark) => {
  const bodyPath = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
  const crease = mark === "flat" ? "" : '<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>';
  return `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${bodyPath}"/>${crease}</svg>`;
};
const keys = [
  ["raised", "翻页架：木制，高 120 厘米，三条腿撑开"],
  ["flat", "线装剧本和五道幕布：函套青"],
  ["dim", "纸雕舞台：一幕一层，从前往后"],
];
const CAPTION = `会议早有剧本：开场、回顾、问题、要求、表态，一幕接一幕，按部就班。翻开剧本，五幕纸雕舞台依次弹出，从前往后错开排开，幕布一幕幕拉开，每块小牌翻过来，是台上那句原话。两个小时 ${TOTAL_MINUTES} 分钟里，开场 ${ACTS[0].minutes} 分钟，回顾 ${ACTS[1].minutes} 分钟，问题 ${ACTS[2].minutes} 分钟，要求 ${ACTS[3].minutes} 分钟，表态 ${ACTS[4].minutes} 分钟。真正要记下来的只有要求那一幕：告示板上盖着“划重点”的那 ${KEEP_MINUTES} 分钟，占 ${percentText(whole.share)}。读数按拉开的幕累计：前三幕 ${tallyOf([true, true, true, false, false]).minutes} 分钟，要记的一分钟也没有。`;
const legend = `<figcaption class="iso-legend"><span class="iso-keys">${keys.map(([mark, label]) => `<span class="iso-key">${swatch(mark)}${label}</span>`).join("")}</span>${table}<span class="iso-caption">${CAPTION}</span></figcaption>`;

const plate = `<figure class="iso-figure juben"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">图 3</span><span class="iso-plate-corner" data-corner="title">剧本解剖图</span><span class="iso-plate-corner" data-corner="hint">悬停，拉开大幕</span><span class="iso-plate-corner" data-corner="readout" data-readout>${readoutHtml(closedTally)}</span></div><div class="iso-stage" tabindex="0" role="button" aria-label="剧本解剖图。按空格或回车，翻开剧本，五幕舞台依次弹出，幕布一幕幕拉开；再按一次合上。" aria-describedby="juben-state">${STAGE_SVG}</div><p class="sr" id="juben-state" aria-live="polite"></p></div>${legend}</figure>`;

// ---- the page's live code ------------------------------------------------------------------------------
const DATA = {
  P,
  AZ,
  W: WIDTH,
  H: HEIGHT,
  slots: SLOTS,
  spring: SPRING,
  coverB: COVER_B,
  coverOpen: COVER_OPEN,
  coverOrder: COVER_ORDER,
  curtain: { half: (OPEN.u1 - OPEN.u0) / 2 + 4, top: ARCH.beam + 2, bottom: GROUND_V + 3 },
  acts: ACTS.map((_, index) => ({ curtainAt: bp(MID, 0, CURTAIN_W(index)), top: tagTop(index) })),
  X,
  BV,
  BW,
  EX: k.axisVector(P, [1, 0, 0]),
  EY: k.axisVector(P, [0, 1, 0]),
  EZ: k.axisVector(P, [0, 0, 1]),
  V: R.V,
};
const inline = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const LIVE = existsSync(join(HERE, "live.js")) ? readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA)) : "";
const SCRIPT = [kitScript(), inline("model.mjs"), inline("tag.mjs"), inline("cover.mjs"), inline("curtain.mjs"), LIVE].join("\n");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>剧本解剖图</title><meta name="description" content="剧本：会议早有剧本，开场、回顾、表态都按部就班；一幕幕拉开，看看两个小时里，真正要记下来的是哪一幕。"><link rel="stylesheet" href="${FONT_CSS_URL}"><style>${embedded}${k.ISO_CSS}${TOKENS}${PAGE_CSS}</style></head><body class="iso" data-theme="light"><main class="iso-page">${plate}</main><script type="module">${SCRIPT.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

const standalone = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso" data-theme="light" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${LABEL}"><title>剧本解剖图</title><style>@import url("${FONT_CSS_URL}");${embedded}${k.ISO_CSS}${TOKENS}.iso-svg{background:var(--sheet)}</style><rect width="${WIDTH}" height="${HEIGHT}" fill="#F8F7F2"/>${body}</svg>`;

if (process.argv.includes("--debug")) {
  // where each act's floor line and the front valance land on screen, apart
  const apart = (index, u, v, extra = 0) => at(G.add3(bp(u, v, PROP_W(index) + extra), actMove(index, extra)));
  ACTS.forEach((act, index) => {
    const floor = apart(index, MID, GROUND_V);
    const left = apart(index, OPEN.u0 + 40, GROUND_V);
    const right = apart(index, OPEN.u1 - 40, GROUND_V);
    console.log(`${act.name}: floor ${floor.map((value) => value.toFixed(1)).join(",")}  left ${left[0].toFixed(1)}  right ${right[0].toFixed(1)}`);
  });
  const valance = at(G.add3(bp(MID, ARCH.beam - 12, ARCH_W(0) + ARCH_T), actMove(0, DEPTH.arch)));
  console.log(`front valance ${valance.map((value) => value.toFixed(1)).join(",")} · mm per screen unit up the card ${(1 / Math.hypot(...k.axisVector(P, BV))).toFixed(3)}`);
}
if (process.argv.includes("--chars")) {
  // every glyph the page, the SVG and the live code can show, for tools/subset.py
  const readouts = ACTS.map((_, count) => readoutOf(tallyOf(ACTS.map((__, index) => index < count + 1))));
  const texts = [LABEL, CAPTION, table, plate, readoutOf(tallyOf(NONE_OPEN)), ...readouts, ...ACTS.flatMap((act) => [act.name, act.quote, act.scene, ...act.columns]), STAGE_SVG, readFileSync(join(HERE, "live.js"), "utf8").replace(/[^\u3000-\u9fff\uff00-\uffef]/g, ""), "0123456789.%·—：，。“”（）/"];
  const chars = [...new Set(texts.join("").replace(/<[^>]*>/g, "").replace(/\s/g, ""))].sort().join("");
  writeFileSync(join(HERE, "fonts", "chars.txt"), chars + "\n");
  console.log(`chars: ${chars.length}`);
  process.exit(0);
}
writeFileSync(join(HERE, "juben.html"), html);
writeFileSync(join(HERE, "juben.svg"), standalone);
console.log(`wrote juben.html (${(html.length / 1024).toFixed(1)} KB) and juben.svg (${(standalone.length / 1024).toFixed(1)} KB) · ${R.items.length} items · ${R.solids.length} solids · scale ${KS.toFixed(3)} px/mm · ${WIDTH}×${HEIGHT}`);

// The kit's audit. Every check runs as the kit runs it, with these changes, all because of what moves how:
// - The cover swings instead of sliding, so the replayed explode leaves it out of the solid checks and it
//   gets three of its own. The acts' cards and the cover's board are slabs along the crease, so in every
//   replayed frame the board, swung to its angle, is tested against every card posed for that frame in
//   the section across the crease, which is exact. The fixed parts never move, so the board's surface is
//   tested against them at every half degree it passes through. And its place in the painter's order,
//   which the page works out from its angle and the acts' live keys (coverKeyOf in cover.mjs), is held
//   to true depth: in every eighth replayed frame it swings in, the board at its angle is measured
//   against every part posed for that frame.
// - The acts' cards are large (0.2 m² each) and the kit's 0.6 mm sampling over its ~10 000 replayed
//   frames would run for hours. Solids are tested at rest, apart and in the kit's prefix states (its
//   worst frames) at 1.2 mm, and in every fourth replayed frame at 3 mm, there only the pairs that have
//   moved against each other since rest. Every pair is sampled only where the two boxes in the board's
//   frame (across, up and out of it) come within half a millimetre. Tubes (the tags' strings) are
//   checked in every replayed frame as the kit does.
function auditFigure() {
  if (!process.argv.includes("--audit")) return;
  const started = Date.now();
  const lap = (label) => console.log(`  ${label} · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const { items, overlaps, solved, states } = R.settled ?? A.settle(R, P);
  const mounts = A.mountsOf(R.tubes, R.solids);
  const links = A.linksOf(R.tubes, mounts);
  const { frames } = A.explodeStates(MOTION, SPRING);
  const solids = R.solids.filter((shape) => shape.name !== "book.cover");
  const worst = new Map();
  const keep = (list) => {
    for (const hit of list) {
      const key = `${hit.tube}|${hit.other}`;
      if (!worst.has(key) || worst.get(key).clearance > hit.clearance) worst.set(key, hit);
    }
  };
  frames.forEach((state) => keep(A.clearances(R.tubes, R.solids, { state, mounts, only: "through" })));
  lap(`tubes in ${frames.length} replayed frames`);
  // every solid's box in the board's frame
  const AXES = [X, BV, BW];
  const along = (p) => AXES.map((axis) => G.dot3(G.sub3(p, ORIGIN), axis));
  const shiftOf = (shape, state) => {
    const offset = A.offsetOf(shape, state);
    return AXES.map((axis) => G.dot3(offset, axis));
  };
  const span = (points, pad = [0, 0, 0]) => AXES.map((_, i) => [Math.min(...points.map((p) => p[i])) - pad[i], Math.max(...points.map((p) => p[i])) + pad[i]]);
  const boxIn = (shape) => {
    if (shape.kind === "prism") return span(shape.poly.flatMap(([x, y]) => [shape.s0, shape.s1].map((s) => along(G.add3(G.add3(shape.F.o, G.mul3(shape.F.a, s)), G.add3(G.mul3(shape.F.u, x), G.mul3(shape.F.v, y)))))));
    if (shape.kind === "body") {
      const ends = shape.poly.map(([s]) => s);
      const r = Math.max(...shape.poly.map(([, value]) => value));
      return span([Math.min(...ends), Math.max(...ends)].map((s) => along(G.add3(shape.F.o, G.mul3(shape.F.a, s)))), AXES.map((axis) => r * Math.sqrt(Math.max(0, 1 - G.dot3(shape.F.a, axis) ** 2))));
    }
    const box = A.boundsOf(shape);
    return span([0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((l) => along([[box.min[0], box.max[0]][i], [box.min[1], box.max[1]][j], [box.min[2], box.max[2]][l]])))));
  };
  const boxes = new Map(solids.map((shape) => [shape, boxIn(shape)]));
  const solidHits = (state, spacing, { moved = false } = {}) => {
    const shifts = solids.map((shape) => shiftOf(shape, state));
    const found = [];
    for (let a = 0; a < solids.length; a++)
      for (let b = a + 1; b < solids.length; b++) {
        if (moved && shifts[a].every((value, i) => Math.abs(value - shifts[b][i]) < 1e-9)) continue;
        const [ba, bb] = [boxes.get(solids[a]), boxes.get(solids[b])];
        if (AXES.some((_, i) => ba[i][0] + shifts[a][i] > bb[i][1] + shifts[b][i] + 0.5 || bb[i][0] + shifts[b][i] > ba[i][1] + shifts[a][i] + 0.5)) continue;
        found.push(...A.solidClearances([solids[a], solids[b]], { state, spacing }));
      }
    return found;
  };
  const prefix = A.prefixStates(MOTION);
  [0, ...prefix].forEach((state) => keep(solidHits(state, 1.2)));
  lap(`solids at rest and in ${prefix.length} prefix states`);
  const moving = (state) => typeof state !== "number" && MOTION.some((id) => id.startsWith("a") && state.shares[id] > 0.001 && state.shares[id] < 0.999);
  let sampled = 0;
  frames.forEach((state, index) => index % 4 === 0 && moving(state) && (sampled++, keep(solidHits(state, 3, { moved: true }))));
  lap(`solids in ${sampled} replayed frames (every fourth with an act on the move)`);
  // the cover's board against the acts' cards, in the section across the crease (u across, w out)
  const thetaOf = (state) => (typeof state === "number" ? state : state.shares.cover ?? 0) * COVER_OPEN;
  const crease = along(COVER_B.H);
  const boardSection = (theta) => [[0, 0], [COVER.w, 0], [COVER.w, COVER.t], [0, COVER.t]].map(([a, t]) => [crease[0] - a * Math.cos(theta) - t * Math.sin(theta), crease[2] + a * Math.sin(theta) - t * Math.cos(theta)]);
  // how far apart two convex outlines are along the axis that parts them best; below 0, how deep they cross
  const apartBy = (p, q) => {
    let best = -Infinity;
    for (const ring of [p, q])
      for (let i = 0; i < ring.length; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[(i + 1) % ring.length];
        const length = Math.hypot(x1 - x0, y1 - y0);
        const [nx, ny] = [(y1 - y0) / length, (x0 - x1) / length];
        const sp = p.map(([x, y]) => x * nx + y * ny);
        const sq = q.map(([x, y]) => x * nx + y * ny);
        best = Math.max(best, Math.min(...sq) - Math.max(...sp), Math.min(...sp) - Math.max(...sq));
      }
    return best;
  };
  const cards = solids.filter((shape) => /^a\d$/.test(shape.piece) && shape.kind === "prism" && Math.abs(G.dot3(shape.F.a, BW)) > 0.9999);
  const sectionHits = [];
  let tightest = { gap: Infinity };
  for (const state of frames) {
    const theta = thetaOf(state);
    const board = boardSection(theta);
    for (const card of cards) {
      const [u, v, w] = boxes.get(card);
      const [du, dv, dw] = shiftOf(card, state);
      if (v[0] + dv > crease[1] + COVER.h || v[1] + dv < crease[1]) continue;
      const gap = apartBy(board, [[u[0] + du, w[0] + dw], [u[1] + du, w[0] + dw], [u[1] + du, w[1] + dw], [u[0] + du, w[1] + dw]]);
      if (A.offsetOf(card, state).some((value) => value !== 0) && gap < tightest.gap) tightest = { gap, card: card.name, theta, label: state.label ?? `${state}` };
      if (gap < -0.05) sectionHits.push({ tube: "book.cover", other: card.name, kind: "through", solid: true, clearance: gap, need: -0.05, at: [0, 0, 0], from: 0, to: 0, length: 0, state: `${state.label ?? state} · cover ${(theta / deg).toFixed(1)}°` });
    }
  }
  keep(sectionHits);
  lap(`the cover against the cards in ${frames.length} replayed frames, in section: closest ${tightest.gap.toFixed(2)} mm (${tightest.card}, cover ${(tightest.theta / deg).toFixed(1)}°, ${tightest.label})`);
  // the cover's surface against the fixed parts at every half degree
  const fixed = solids.filter((shape) => !/^a\d$/.test(shape.piece));
  const swing = [];
  const poses = Array.from({ length: Math.round(COVER_OPEN / deg) * 2 + 1 }, (_, index) => (index * deg) / 2);
  for (const theta of poses) {
    const F = coverFrame(COVER_B, theta);
    const points = [];
    for (let a = 0; a <= COVER.w; a += 4) for (let b = 0; b <= COVER.h; b += 4) for (const t of [0, COVER.t]) points.push(G.add3(F.o, G.add3(G.add3(G.mul3(F.d, a), G.mul3(F.v, b)), G.mul3(F.n, -t))));
    const reach = { min: [0, 1, 2].map((i) => Math.min(...points.map((p) => p[i])) - 1), max: [0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) + 1) };
    for (const shape of fixed) {
      const box = A.boundsOf(shape);
      if (box.min.some((value, i) => value > reach.max[i]) || box.max.some((value, i) => value < reach.min[i])) continue;
      let deepest = 0;
      for (const p of points) {
        if (p.some((value, i) => value < box.min[i] || value > box.max[i])) continue;
        deepest = Math.min(deepest, A.sdf(shape, p));
      }
      if (deepest < -0.5) swing.push({ tube: "book.cover", other: shape.name, kind: "through", solid: true, clearance: deepest, need: -0.5, at: [0, 0, 0], from: 0, to: 0, length: 0, state: `cover ${(theta / deg).toFixed(1)}°` });
    }
  }
  keep(swing);
  lap(`the cover against the fixed parts at ${poses.length} angles`);
  // the cover's place in the painter's order against true depth, the page's own rule
  const coverItem = R.items.find((item) => item.name === "book.cover");
  const others = R.items.filter((item) => item !== coverItem);
  const actItems = others.filter((item) => /^a\d$/.test(item.piece));
  const swinging = frames.filter((state) => typeof state !== "number" && state.shares.cover > 0 && state.shares.cover < 1);
  const orderProblems = [];
  let measured = 0;
  swinging.forEach((state, index) => {
    if (index % 8) return;
    measured++;
    const theta = thetaOf(state);
    const proxy = { ...coverItem, key: 0, shapes: [coverShape(theta, "book.cover")] };
    const key = coverKeyOf(theta, COVER_ORDER, Math.max(...actItems.map((item) => A.keyAt(item, state, R.V))));
    const { pairs } = A.overlapsOf([proxy, ...others], P, { states: [state], step: 2, skip: (a, b) => a !== proxy && b !== proxy });
    for (const pair of pairs) {
      const other = others[(pair.a === 0 ? pair.b : pair.a) - 1];
      const [mine, theirs] = pair.a === 0 ? pair.front : [pair.front[1], pair.front[0]];
      const otherKey = A.keyAt(other, state, R.V);
      const label = `${state.label} · cover ${(theta / deg).toFixed(1)}°`;
      const cycle = mine.area >= 0.25 && theirs.area >= 0.25;
      if (cycle || (mine.area >= 0.25 && key <= otherKey)) orderProblems.push({ cycle, label, front: "book.cover", frontKey: key, back: other.name, backKey: otherKey, area: mine.area, against: cycle ? theirs.area : 0, depth: mine.depth, at: mine.at ?? [0, 0] });
      else if (theirs.area >= 0.25 && otherKey <= key) orderProblems.push({ cycle: false, label, front: other.name, frontKey: otherKey, back: "book.cover", backKey: key, area: theirs.area, depth: theirs.depth, at: theirs.at ?? [0, 0] });
    }
  });
  lap(`the cover's order in ${measured} replayed frames it swings in`);
  const depth = A.depthOrder(items, P, { overlaps, solved });
  depth.problems.push(...orderProblems);
  const result = {
    clearance: A.clearances(R.tubes, R.solids, { mounts }),
    apart: [...A.clearances(R.tubes, R.solids, { state: 1, mounts, only: "through" }), ...solidHits(1, 1.2)],
    flight: [...worst.values()].sort((x, y) => x.clearance - y.clearance),
    crowding: [0, 1].flatMap((state) => A.crowding(R.routes, P, { links, items, state, rods: A.slenderOf(R.solids) })),
    cover: A.coverage(items, P),
    terminals: A.terminals(R.tubes, R.solids, { mounts }),
    loose: A.looseEnds(R.tubes, R.solids, { state: 1 }),
    folds: A.folds(R.routes, P, { items }),
    self: A.selfOverlaps(items, P),
    wobble: A.wobble(R.solids),
    seats: A.seats(R.solids),
    supports: A.supports(R.solids, R.tubes, { ground: R.ground }),
    depth,
  };
  lap("the rest");
  console.log(A.report(result));
  console.log(`audit · ${R.tubes.length} tubes · ${R.solids.length} solids · ${R.items.length} items · ${states.length} depth states · ${frames.length} replayed frames · ${poses.length} cover angles · ${measured} frames of cover order · ${overlaps.pairs.length} overlaps · ${solved.rules} order rules · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const count = A.failures(result);
  console.log(count ? `audit failed: ${count} problem${count === 1 ? "" : "s"}` : "audit passed");
  if (count) process.exitCode = 1;
}
auditFigure();
