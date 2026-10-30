// 宏图解剖图: six tracing sheets pinned on an old drafting table, under a clamp-on lamp.
// node build.mjs            writes hongtu.html and hongtu.svg (light theme, the platform palette)
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
import { ALL_LIFTED, CLEAR, LAYERS, NONE_LIFTED, WEIGHT_TOTAL, numbersOf, percentText, readoutOf, readoutParts } from "./model.mjs";
import { DEADLINE, SHEET, STAMP, artOf, clarityOf, dOf } from "./art.mjs";
import { TAG, TAG_RING, tagFace, tagFrame, tagSolid } from "./tag.mjs";
import { HEAD, angleTo, headParts, poolOf } from "./lamp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SKILL = join(HERE, "../../.claude/skills/anatomy");
const WIDTH = 600;
const AZ = 60;
const EL = 38;

// every sheet's inked share has to be the clarity the model claims for it
LAYERS.forEach((layer, index) => {
  const measured = clarityOf(index);
  if (Math.abs(measured - layer.clarity) > 0.05) throw new Error(`${layer.name}: drawn ${measured.toFixed(2)}% inked, model says ${layer.clarity}%`);
});

// ---- the world, millimetres: x along the table, y toward the front, z up ----------------------
const deg = Math.PI / 180;
const TILT = 15 * deg;
const sT = Math.sin(TILT);
const cT = Math.cos(TILT);
const N = [0, sT, cT]; // the board's normal: the way the tacks come out
const S = [0, cT, -sT]; // down the board, toward its front edge
const X = [1, 0, 0];
const UP = [0, 0, 1]; // the way the sheets lift
const BOARD = { u0: -450, u1: 450, v0: -300, v1: 300, t: 28, r: 5 };
const FRONT_Z = 600; // the top of the board's front edge
const ZC = FRONT_Z + BOARD.v1 * sT;
const FB = G.frameOf([0, 0, ZC], N, X, S);
// a point in the board's frame: u across, v down the board, a up off its top
const bp = (u, v, a = 0) => [u, v * cT + a * sT, ZC - v * sT + a * cT];

// the sheets lie flush with the right-hand edge, 6 mm in, and lift straight up, staying parallel
const W = SHEET.w;
const H = SHEET.h;
const U0 = BOARD.u1 - 6 - W;
const V0 = -282;
const PAPER = 0.5;
const GAP = 60;
const COUNT = LAYERS.length;
const restA = (index) => (COUNT - 1 - index) * PAPER;
const liftOf = (index) => (COUNT - index) * GAP;
// the tacks leave along their pins and end up over their holes in the top sheet
const TACK_OUT = 40;
const TACK_MOVE = G.add3(G.mul3(UP, COUNT * GAP), G.mul3(N, TACK_OUT));
const sheetPoint = (index, su, sv, da = PAPER) => bp(U0 + su, V0 + sv, restA(index) + da);
const TAB_V = LAYERS.map((_, index) => 40 + 92 * index);
const TAB = { out: 40, half: 13, r: 6, hole: 32, holeR: 2.3, ringR: 4.4 };
const STRING = 8;
const tagTop = (index) => {
  const hole = sheetPoint(index, W + TAB.hole, TAB_V[index]);
  return [hole[0], hole[1], hole[2] - STRING];
};
const TACK_AT = [[16, 16], [W - 16, 16], [16, H - 16], [W - 16, H - 16]];

// ---- the stand ---------------------------------------------------------------------------------
const XF = 330;
const FOOT = { y0: -280, y1: 280, half: 22, z0: 14, z1: 48 };
const BEARER = { half: 18, a0: -64, a1: -BOARD.t, v0: -262, v1: 262 };
const HUB = { r: 22, half: 32 };
const HUB_C = (x) => bp(x, 0, BEARER.a0 - HUB.r);
const COLUMN = { half: 19 };
const STRETCHER = { z: 196, r: 11 };

// ---- the lamp: clamped to the left edge, its arm in one plane with the line the sheets lift along
// the clamp's socket is cast at 15° so the lamp's post stands upright on the sloping board; the arm
// swings in the upright plane through the post and the line the sheet centres rise along
const CLAMP = { u: -428, v: -186 };
const SOCKET = { r: 12, h: 40 };
const JAW_TOP = 12;
// the socket's axis, and its front foot on the jaw's sloping top
const SOCKET_Y = bp(CLAMP.u, CLAMP.v, JAW_TOP)[1];
const jawZ = (y) => {
  const v = (y - JAW_TOP * sT) / cT;
  return ZC - v * sT + JAW_TOP * cT;
};
const SOCKET_AT = [CLAMP.u, SOCKET_Y, jawZ(SOCKET_Y + SOCKET.r)];
const S0 = G.add3(SOCKET_AT, [0, 0, SOCKET.h + 30]);
const SHEET_C = sheetPoint(0, W / 2, H / 2);
const toward = G.sub3(SHEET_C, S0);
const E2 = G.unit3([toward[0], toward[1], 0]);
const M = G.unit3(G.cross3(UP, E2));
const inPlane = (p, q) => G.add3(S0, G.add3(G.mul3(E2, p), G.mul3(UP, q)));
const HEAD_AT = inPlane(200, 400);
// both arms the same length, the elbow back over the clamp and above the head
const ELBOW = (() => {
  const [hp, hq] = [200, 400];
  const p = -150;
  const q = (hp * hp + hq * hq - 2 * p * hp) / (2 * hq);
  return inPlane(p, q);
})();
const LAMP = { H: HEAD_AT, e2: E2, n: UP, m: M };
const sheetCentre = (index, offset = 0) => G.add3(sheetPoint(index, W / 2, H / 2), G.mul3(UP, offset));
const restTheta = angleTo(LAMP, sheetCentre(0));

// ---- camera --------------------------------------------------------------------------------------
const corners3 = (index, offset) => [[0, 0], [W + TAB.out, 0], [W + TAB.out, H], [0, H]].map(([su, sv]) => G.add3(sheetPoint(index, su, sv), G.mul3(UP, offset)));
const tagCorners = (index, offset) => {
  const top = G.add3(tagTop(index), G.mul3(UP, offset));
  const right = [Math.sin(AZ * deg), -Math.cos(AZ * deg)];
  return [-1, 1].flatMap((side) => [0, -TAG.h].map((dz) => [top[0] + right[0] * side * (TAG.w / 2), top[1] + right[1] * side * (TAG.w / 2), top[2] + dz]));
};
const fitPoints = [
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [sx * (XF + FOOT.half), sy * FOOT.y1, 0]),
  ...[[BOARD.u0, BOARD.v0], [BOARD.u1, BOARD.v0], [BOARD.u1, BOARD.v1], [BOARD.u0, BOARD.v1]].map(([u, v]) => bp(u, v)),
  ...corners3(0, liftOf(0)),
  ...TACK_AT.map(([su, sv]) => G.add3(sheetPoint(0, su, sv, 8), TACK_MOVE)),
  ...LAYERS.flatMap((_, index) => [...tagCorners(index, 0), ...tagCorners(index, liftOf(index))]),
  G.add3(ELBOW, [-26, 0, 30]),
  G.add3(HEAD_AT, [-40, 0, 46]),
  G.add3(HEAD_AT, [140, 0, 40]),
];
const PAD = 18;
const unit = fitPoints.map((point) => k.iso(point, { origin: [0, 0], scale: 1, azimuth: AZ, elevation: EL }));
const spanX = Math.max(...unit.map(([x]) => x)) - Math.min(...unit.map(([x]) => x));
const spanY = Math.max(...unit.map(([, y]) => y)) - Math.min(...unit.map(([, y]) => y));
const HEIGHT = Math.ceil(PAD * 2 + (spanY * (WIDTH - PAD * 2)) / spanX);
const P = k.fitProjection(fitPoints, WIDTH, HEIGHT, { pad: PAD, azimuth: AZ, elevation: EL });
const KS = G.scaleOf(P);
const V = G.viewOf(P);
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

// ---- the assemblies that come apart ---------------------------------------------------------------
const SLOTS = ["tacks", ...LAYERS.map((_, index) => `s${index}`)];
const SPRING = { stagger: 0.46, stiffness: 30, damping: 11, substeps: 4 };
const MOVES = Object.fromEntries([["tacks", TACK_MOVE], ...LAYERS.map((_, index) => [`s${index}`, G.mul3(UP, liftOf(index))])]);
const R = A.recorder(P, { order: SLOTS, spring: SPRING });
const record = (shape) => R.solid(shape);
const nameFor = R.nameFor;

function put(piece, ref, svg, { bias = 0, shapes = [], name, ...rest } = {}) {
  return R.put({ piece, at: ref, bias, svg, move: MOVES[piece] ?? [0, 0, 0], shapes, name: name ?? nameFor(`${piece}.item`), ...rest });
}

const byDepth = (points) => [...points].sort((a, b) => G.dot3(a, V) - G.dot3(b, V));
const plan = (u0, u1, v0, v1, r = 0, steps = 4) => k.roundedPlan({ x: u0, y: v0, w: u1 - u0, d: v1 - v0, r }, steps);
// a box in the board's frame
function boardBox(name, piece, [u0, u1], [v0, v1], [a0, a1], { r = 0, steps = 4, tone = "mid", cls = "m-gold", crease, inner = "", bias = 0, extra = "" } = {}) {
  const ring = plan(u0, u1, v0, v1, r, steps);
  const paths = G.prismOf(FB, ring, a0, a1, P);
  return put(piece, bp((u0 + u1) / 2, (v0 + v1) / 2, (a0 + a1) / 2), `<g class="${cls}">${Sd(paths, { tone, crease, inner })}${extra}</g>`, {
    name,
    bias,
    shapes: [record(A.prism(FB, ring, a0, a1, { name }))],
  });
}
// a turned part on any axis
function turned(name, piece, F, profile, { tone = "mid", cls = "m-indigo", inner = "", extra = "", bias = 0, shape, ...options } = {}) {
  const paths = G.solidOf(profile, F, P, options);
  const s0 = profile[0][0];
  const s1 = profile[profile.length - 1][0];
  return put(piece, G.pointOf(F, (s0 + s1) / 2, 0, 0), `<g class="${cls}">${Sd(paths, { tone, inner })}${extra}</g>`, {
    name,
    bias,
    shapes: [record(shape ?? A.solid(F, profile, { name }))],
  });
}
const rod = (name, piece, from, to, r, options = {}) => {
  const axis = G.unit3(G.sub3(to, from));
  const F = G.frameAlong(from, axis);
  return turned(name, piece, F, [[0, r], [G.len3(G.sub3(to, from)), r]], options);
};

// ---- the stand: two cast end frames, a stretcher and a footrest -------------------------------------
function stand() {
  const halo = [-1, 1].map((side) => `<path class="iso-halo" d="${k.haloOf({ x: side * XF - FOOT.half - 14, y: FOOT.y0 - 10, w: FOOT.half * 2 + 28, d: FOOT.y1 - FOOT.y0 + 20, r: 24 }, 0, 4, P)}"/>`).join("");

  for (const side of [-1, 1]) {
    const x = side * XF;
    const hub = HUB_C(x);
    // levelling pads under both ends of the foot
    for (const y of [FOOT.y0 + 30, FOOT.y1 - 30]) {
      const svg = (side < 0 && y < 0 ? halo : "") + Sd(k.cylinder(x, y, 15, 0, 5, P, 32, 0.5), { tone: "lo" }) + Sd(k.cylinder(x, y, 6, 5, FOOT.z0 - 5, P, 20), { tone: "mid", crease: "none" });
      put("stand", [x, y, 6], `<g class="m-indigo">${svg}</g>`, {
        name: nameFor("stand.pad"),
        bias: -2000,
        shapes: [record(A.cylinder(x, y, 15, 0, 5, { name: nameFor("stand.pad.disc"), ground: true })), record(A.cylinder(x, y, 6, 5, FOOT.z0 - 5, { name: nameFor("stand.pad.stem") }))],
      });
    }
    const foot = { x: x - FOOT.half, y: FOOT.y0, w: FOOT.half * 2, d: FOOT.y1 - FOOT.y0, r: 18 };
    const footSeam = k.sideSeam(k.insetPlan(foot, 0), FOOT.z0 + 12, P, 8);
    put("stand", [x, 0, (FOOT.z0 + FOOT.z1) / 2], `<g class="m-indigo">${Sd(k.slabOf(foot, FOOT.z0, FOOT.z1 - FOOT.z0, P, 8, 1.2), { tone: "mid", inner: Ln(footSeam, { tone: "faint" }) })}</g>`, {
      name: `stand.foot${side}`,
      bias: -1500,
      shapes: [record(A.slab(foot, FOOT.z0, FOOT.z1 - FOOT.z0, { name: `stand.foot${side}` }))],
    });
    // the column: a plinth, the shaft with a casting seam, a collar under the hub
    const yc = hub[1];
    const shaft = { x: x - COLUMN.half, y: yc - COLUMN.half, w: COLUMN.half * 2, d: COLUMN.half * 2, r: 6 };
    const plinth = k.insetPlan(shaft, -9);
    const collar = k.insetPlan(shaft, -4);
    const top = hub[2] - HUB.r;
    put("stand", [x, yc, FOOT.z1 + 6], `<g class="m-indigo">${Sd(k.slabOf(plinth, FOOT.z1, 12, P, 6, 0.8), { tone: "mid" })}${Dt(k.corners(plinth, 6).map(([px, py]) => at([px, py, FOOT.z1 + 12])), { size: 0.55, tone: "mid" })}</g>`, {
      name: `stand.plinth${side}`,
      shapes: [record(A.slab(plinth, FOOT.z1, 12, { name: `stand.plinth${side}` }))],
    });
    // the column telescopes: an outer sleeve with a casting seam, a clamping collar with a lock knob on
    // its front, and the inner post rising out of it to the collar under the hub
    const SLEEVE_TOP = 400;
    const seam = k.sideSeam(shaft, (FOOT.z1 + 12 + SLEEVE_TOP) / 2, P, 6);
    put("stand", [x, yc, (FOOT.z1 + SLEEVE_TOP) / 2], `<g class="m-indigo">${Sd(k.slabOf(shaft, FOOT.z1 + 12, SLEEVE_TOP - FOOT.z1 - 12, P, 6, 0.6), { tone: "mid", inner: Ln(seam, { tone: "faint" }) })}</g>`, {
      name: `stand.column${side}`,
      shapes: [record(A.slab(shaft, FOOT.z1 + 12, SLEEVE_TOP - FOOT.z1 - 12, { name: `stand.column${side}` }))],
    });
    const clampRing = k.insetPlan(shaft, -3);
    put("stand", [x, yc, SLEEVE_TOP + 6], `<g class="m-indigo">${Sd(k.slabOf(clampRing, SLEEVE_TOP, 12, P, 6, 0.6), { tone: "mid" })}</g>`, {
      name: `stand.collar.lock${side}`,
      shapes: [record(A.slab(clampRing, SLEEVE_TOP, 12, { name: `stand.collar.lock${side}` }))],
    });
    const FL = G.frameOf([x, yc + clampRing.d / 2, SLEEVE_TOP + 6], [0, 1, 0], [1, 0, 0], [0, 0, 1]);
    const lockKnob = [[0, 4.5], [6, 4.5], [6, 9], [7, 10, 1], [14, 10, 1], [15, 9], [15, 0]];
    turned(`stand.knob.lock${side}`, "stand", FL, lockKnob, { extra: k.fadedSvg(G.ribsOf(FL, 7, 14, 10, 28, P, { fade: [0.1, 0.55] }), { tone: "lo" }), bias: 0.3 });
    const post = k.insetPlan(shaft, 4);
    put("stand", [x, yc, (SLEEVE_TOP + top) / 2], `<g class="m-indigo">${Sd(k.slabOf(post, SLEEVE_TOP + 12, top - 16 - SLEEVE_TOP - 12, P, 6, 0.6), { tone: "mid", crease: "faint" })}</g>`, {
      name: `stand.post${side}`,
      shapes: [record(A.slab(post, SLEEVE_TOP + 12, top - 16 - SLEEVE_TOP - 12, { name: `stand.post${side}` }))],
    });
    put("stand", [x, yc, top - 8], `<g class="m-indigo">${Sd(k.slabOf(collar, top - 16, 16, P, 6, 0.6), { tone: "mid" })}</g>`, {
      name: `stand.collar${side}`,
      shapes: [record(A.slab(collar, top - 16, 16, { name: `stand.collar${side}` }))],
    });
    // the pivot hub, across the table
    const FH = G.frameOf(G.add3(hub, [-HUB.half, 0, 0]), X, [0, 1, 0], [0, 0, 1]);
    turned(`stand.hub${side}`, "stand", FH, [[0, HUB.r], [HUB.half * 2, HUB.r]], { extra: D_hubEnd(hub, side) });
    // the board's bearer rail, on the underside
    boardBox(`stand.bearer${side}`, "stand", [x - BEARER.half, x + BEARER.half], [BEARER.v0, BEARER.v1], [BEARER.a0, BEARER.a1], { r: 4, cls: "m-indigo", bias: -120 });
    quadrant(x, side);
  }
  // stretcher between the columns, flanged at both ends
  const yc = HUB_C(0)[1];
  const inner = XF - COLUMN.half;
  const FS = G.frameOf([-inner, yc, STRETCHER.z], X, [0, 1, 0], [0, 0, 1]);
  turned("stand.stretcher", "stand", FS, [[0, 24], [6, 24], [6, STRETCHER.r], [inner * 2 - 6, STRETCHER.r], [inner * 2 - 6, 24], [inner * 2, 24]], {
    extra: Dt([...G.dotsOf(FS, 6, 19, 4, P, { phase: Math.PI / 4, all: true })], { size: 0.5, tone: "mid" }),
  });
  // footrest across the front of the two feet
  const rest = { x: -XF - FOOT.half, y: 166, w: 2 * (XF + FOOT.half), d: 52, r: 4 };
  // three closed tread grooves along the bar
  const ribs = [-0.5, 0, 0.5].map((t) => k.planOutline({ x: rest.x + 30, y: 192 + t * 30 - 2, w: rest.w - 60, d: 4, r: 2 }, FOOT.z1 + 10, P, 4)).join("");
  put("stand", [0, 192, FOOT.z1 + 5], `<g class="m-indigo">${Sd(k.slabOf(rest, FOOT.z1, 10, P, 4, 0.8), { tone: "mid" })}${Ln(ribs, { tone: "faint" })}${Dt([[rest.x + 13, 192], [rest.x + rest.w - 13, 192]].map(([px, py]) => at([px, py, FOOT.z1 + 10])), { size: 0.6, tone: "mid" })}</g>`, {
    name: "stand.footrest",
    shapes: [record(A.slab(rest, FOOT.z1, 10, { name: "stand.footrest" }))],
  });
}

function D_hubEnd(hub, side) {
  // a bolt head on each end of the pivot
  const F = G.frameOf(G.add3(hub, [side * HUB.half, 0, 0]), [side, 0, 0], [0, 1, 0], [0, 0, 1]);
  return Ln(G.circleOf(F, 0, 9, P), { tone: "lo" });
}

// the tilt quadrant on the outside of each end frame: a fan of plate with a slot, a degree scale
// along its rim and a lock knob in the slot at 15°
function quadrant(x, side) {
  const hub = HUB_C(x);
  const plate = 4;
  const x0 = x + side * HUB.half;
  const FQ = G.frameOf([x0, hub[1], hub[2]], [side, 0, 0], [0, -1, 0], [0, 0, 1]);
  const R_OUT = 92;
  const fan = [[0, 0], ...Array.from({ length: 13 }, (_, index) => {
    const a = (-8 + (48 * index) / 12) * deg;
    return [R_OUT * Math.cos(a), R_OUT * Math.sin(a)];
  })];
  const paths = G.prismOf(FQ, fan, 0, plate, P);
  const face = (r, a) => G.pointOf(FQ, plate, r, a);
  const ticks = { major: [], minor: [] };
  for (let d = 0; d <= 40; d += 5) {
    const a = d * deg;
    (d % 15 === 0 ? ticks.major : ticks.minor).push(k.pathOf([at(face(R_OUT, a)), at(face(R_OUT - (d % 15 === 0 ? 11 : 6), a))]));
  }
  const slotPts = [];
  for (let index = 0; index <= 16; index++) slotPts.push(at(face(70 + 3.2, ((index / 16) * 36 + 0) * deg)));
  for (let index = 0; index <= 8; index++) {
    const a = 36 * deg;
    const t = (index / 8) * Math.PI;
    slotPts.push(at(G.pointOf(FQ, plate, 70 + 3.2 * Math.cos(t), a + (3.2 * Math.sin(t)) / 70)));
  }
  for (let index = 16; index >= 0; index--) slotPts.push(at(face(70 - 3.2, ((index / 16) * 36) * deg)));
  for (let index = 0; index <= 8; index++) {
    const t = (index / 8) * Math.PI;
    slotPts.push(at(G.pointOf(FQ, plate, 70 - 3.2 * Math.cos(t), -(3.2 * Math.sin(t)) / 70)));
  }
  const svg = `<g class="m-brass">${Sd(paths, { tone: "mid" })}${Ln(ticks.minor.join(""), { tone: "lo" })}${Ln(ticks.major.join(""), { tone: "mid" })}${Ln(k.pathOf(slotPts, true), { tone: "lo" })}</g>`;
  put("stand", face(40, 16 * deg), svg, { name: `stand.quadrant${side}`, bias: 0.4, shapes: [record(A.prism(FQ, fan, 0, plate, { name: `stand.quadrant${side}` }))] });
  // the lock knob: a stud from the slot and a knurled cap
  const knobAt = face(70, 15 * deg);
  const FK = G.frameOf(knobAt, [side, 0, 0], [0, -1, 0], [0, 0, 1]);
  const knob = [[0, 5], [5, 5], [5, 13], [6, 14, 1], [14, 14, 1], [15, 13], [15, 0]];
  const knurl = k.fadedSvg(G.ribsOf(FK, 6, 14, 14, 30, P, { fade: [0.1, 0.55] }), { tone: "lo" });
  turned(`stand.knob${side}`, "stand", FK, knob, { cls: "m-indigo", extra: knurl, bias: 0.6 });
}

// ---- the board -------------------------------------------------------------------------------------
function board() {
  const ring = plan(BOARD.u0, BOARD.u1, BOARD.v0, BOARD.v1, BOARD.r, 4);
  const paths = G.prismOf(FB, ring, -BOARD.t, 0, P);
  // the breadboard ends: a glue line across the top and down the front face at each end strip
  const seams = [-412, 412].map((u) => k.pathOf([at(bp(u, BOARD.v0, 0)), at(bp(u, 276, 0))]) + k.pathOf([at(bp(u, BOARD.v1, 0)), at(bp(u, BOARD.v1, -BOARD.t))])).join("");
  put("board", bp(0, 0, -BOARD.t / 2), `<g class="m-gold">${Sd(paths, { tone: "mid", inner: Ln(seams, { tone: "faint" }) })}</g>`, {
    name: "stand.board",
    bias: 0,
    shapes: [record(A.prism(FB, ring, -BOARD.t, 0, { name: "stand.board" }))],
  });
  // the pencil ledge along the front edge, with its groove
  const groove = k.pathOf([at(bp(BOARD.u0, 287, 14)), at(bp(BOARD.u1, 287, 14))]);
  boardBox("stand.ledge", "board", [BOARD.u0, BOARD.u1], [276, BOARD.v1], [0, 14], { r: 1.5, steps: 3, extra: Ln(groove, { tone: "lo" }), bias: 40 });
  // a small brass maker's plate on the ledge's front face: two pins and three rule lines for its lettering
  const [p0, p1] = [-150, -60];
  const face = BOARD.v1;
  const FP = G.frameOf(bp(p0, face, 2), S, X, N);
  const rect = [[0, 0], [p1 - p0, 0], [p1 - p0, 10], [0, 10]];
  const rule = (x0, x1, a) => k.pathOf([at(bp(x0, face + 0.8, a)), at(bp(x1, face + 0.8, a))]);
  const plate = G.prismOf(FP, rect, 0, 0.8, P);
  const rules = rule(p0 + 9, p1 - 9, 9) + rule(p0 + 9, p1 - 22, 7) + rule(p0 + 9, p1 - 34, 5);
  put("board", bp((p0 + p1) / 2, face + 0.4, 7), `<g class="m-brass">${Sd(plate, { tone: "mid", crease: "faint" })}${Ln(rules, { tone: "lo", free: true })}${Dt([at(bp(p0 + 4, face + 0.8, 7)), at(bp(p1 - 4, face + 0.8, 7))], { size: 0.5, tone: "mid" })}</g>`, {
    name: "stand.plate",
    bias: 0.2,
    shapes: [record(A.prism(FP, rect, 0, 0.8, { name: "stand.plate" }))],
  });
}

function tools() {
  // two pencils against the ledge
  const LEDGE_TOP = 14;
  const pencil = (name, u0, u1, v, cls) => {
    const r = 3.6;
    // the flat of the hexagon lies on the ledge's top
    const F = G.frameOf(bp(u0, v, LEDGE_TOP + r * Math.cos(Math.PI / 6)), X, S, N);
    const hex = Array.from({ length: 6 }, (_, index) => [r * Math.cos((index / 6) * 2 * Math.PI), r * Math.sin((index / 6) * 2 * Math.PI)]);
    const length = u1 - u0;
    const body = G.prismOf(F, hex, 0, length - 18, P);
    const FC = G.frameOf(G.pointOf(F, length - 18, 0, 0), X, S, N);
    const cone = G.solidOf([[0, 3.1], [14, 0.9], [18, 0]], FC, P);
    const tip = G.solidOf([[13.2, 1.15], [18, 0]], FC, P);
    put("board", bp((u0 + u1) / 2, v, LEDGE_TOP + r), `<g class="${cls}">${Sd(body, { tone: "mid" })}</g><g class="m-gold">${Sd(cone, { tone: "mid" })}</g><g class="m-graphite">${Sd(tip, { tone: "hi", crease: "none" })}</g>`, {
      name,
      shapes: [record(A.prism(F, hex, 0, length - 18, { name: `${name}.body` })), record(A.solid(FC, [[0, 3.1], [14, 0.9], [18, 0]], { name: `${name}.cone` }))],
    });
  };
  pencil("stand.pencil1", -420, -246, 291.6, "m-indigo");
  pencil("stand.pencil2", -394, -268, 283.4, "m-gold");
  // a three-sided scale rule lying across the left of the board, graduated along its near face
  const SR = { u0: -404, u1: -112, v: -64, half: 11, h: 18 };
  const FR = G.frameOf(bp(SR.u0, SR.v, 0), X, S, N);
  const tri3 = [[-SR.half, 0], [SR.half, 0], [0, SR.h]];
  const rule3 = G.prismOf(FR, tri3, 0, SR.u1 - SR.u0, P);
  const faceUp = G.unit3(G.add3(G.mul3(S, -SR.half), G.mul3(N, SR.h)));
  const marks = { minor: [], major: [] };
  for (let mm = 6; mm <= SR.u1 - SR.u0 - 6; mm += 4) {
    const foot = bp(SR.u0 + mm, SR.v + SR.half, 0);
    const major = (mm - 6) % 20 === 0;
    (major ? marks.major : marks.minor).push(k.pathOf([at(foot), at(G.add3(foot, G.mul3(faceUp, major ? 6 : 3.2)))]));
  }
  put("board", bp((SR.u0 + SR.u1) / 2, SR.v, SR.h / 3), `<g class="m-ivory">${Sd(rule3, { tone: "mid" })}${Ln(marks.minor.join(""), { tone: "lo" })}${Ln(marks.major.join(""), { tone: "mid" })}</g>`, {
    name: "stand.scale",
    shapes: [record(A.prism(FR, tri3, 0, SR.u1 - SR.u0, { name: "stand.scale" }))],
  });
  // a set square lying on the left of the board, with its thumb hole
  const tri = [[-418, 146], [-226, 146], [-418, 6]];
  const FT = FB;
  const sq = G.prismOf(FT, tri, 0, 2.2, P);
  const holeC = bp(-358, 104, 2.2);
  const hole = Array.from({ length: 40 }, (_, index) => at(G.add3(holeC, G.add3(G.mul3(X, 9 * Math.cos((index / 40) * 2 * Math.PI)), G.mul3(S, 9 * Math.sin((index / 40) * 2 * Math.PI))))));
  const scale = [];
  for (let index = 1; index < 30; index++) {
    const u = -418 + index * 6;
    if (u > -232) break;
    scale.push(k.pathOf([at(bp(u, 146, 2.2)), at(bp(u, 146 - (index % 5 === 0 ? 7 : 3.5), 2.2))]));
  }
  put("board", bp(-354, 100, 1.1), `<g class="m-celluloid">${Sd(sq, { tone: "mid" })}<path class="sq-hole" d="${k.pathOf(hole, true)}"/>${Ln(k.pathOf(hole, true), { tone: "lo" })}${Ln(scale.join(""), { tone: "lo" })}</g>`, {
    name: "stand.square",
    shapes: [record(A.prism(FT, tri, 0, 2.2, { name: "stand.square" }))],
  });
  // a drafting compass lying open on the board: a knurled handle on the hinge head, two legs, a needle
  // point and a lead point
  const CP = { u: -300, v: -128, legs: 116, open: 9 * deg, r: 2.2 };
  const head = bp(CP.u, CP.v, 7);
  const legEnd = (sign) => bp(CP.u + CP.legs * Math.cos(sign * CP.open), CP.v + CP.legs * Math.sin(sign * CP.open), CP.r);
  const FHd = G.frameOf(bp(CP.u, CP.v, 0), N, X, S);
  const headShape = turned("stand.compass.head", "board", FHd, [[0, 7.5], [9, 7.5], [9, 3], [17, 3], [18, 2.2, 1], [19, 0]], { cls: "m-steel", extra: k.fadedSvg(G.ribsOf(FHd, 10, 17, 3, 16, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }).shapes[0];
  // each leg is hinged in the head on its own side of the joint, so the two never touch
  for (const sign of [-1, 1]) {
    const dir = [Math.cos(sign * CP.open), Math.sin(sign * CP.open)];
    const side = [-dir[1] * sign, dir[0] * sign];
    const start = bp(CP.u + 4 * dir[0] + 2.6 * side[0], CP.v + 4 * dir[1] + 2.6 * side[1], CP.r);
    const end = bp(CP.u + CP.legs * dir[0] + 2.6 * side[0], CP.v + CP.legs * dir[1] + 2.6 * side[1], CP.r);
    const axis = G.unit3(G.sub3(end, start));
    const F = G.frameAlong(start, axis);
    const length = G.len3(G.sub3(end, start));
    const tip = sign < 0 ? [[length, CP.r], [length + 9, 0.5], [length + 12, 0]] : [[length, CP.r], [length + 3, 1.6], [length + 10, 0.7], [length + 12, 0]];
    const profile = [[0, CP.r], ...tip];
    turned(`stand.compass.leg${sign}`, "board", F, profile, { cls: "m-steel", shape: A.solid(F, profile, { name: `stand.compass.leg${sign}`, seated: true, cut: headShape }), extra: sign > 0 ? Dt([at(G.pointOf(F, length + 11.2, 0, 0))], { size: 0.45, tone: "hi" }) : "" });
  }
  // an eraser
  const turn = 22 * deg;
  const er = [[-18, -9], [18, -9], [18, 9], [-18, 9]].map(([x, y]) => [-150 + x * Math.cos(turn) - y * Math.sin(turn), 214 + x * Math.sin(turn) + y * Math.cos(turn)]);
  put("board", bp(-150, 214, 5), `<g class="m-eraser">${Sd(G.prismOf(FB, er, 0, 9, P), { tone: "mid" })}</g>`, {
    name: "stand.eraser",
    shapes: [record(A.prism(FB, er, 0, 9, { name: "stand.eraser" }))],
  });
}

// ---- the lamp ----------------------------------------------------------------------------------------
const pinOn = (F, s0, s1, r) => [[s0, r], [s1, r]];
function lamp() {
  const { u, v } = CLAMP;
  // the clamp: top jaw on the board, spine down the left edge, bottom jaw and screw under it
  const jaw = boardBox("stand.clamp.jaw", "lamp", [BOARD.u0, u + 24], [v - 26, v + 26], [0, JAW_TOP], { r: 3, cls: "m-indigo", bias: 0.1 });
  boardBox("stand.clamp.spine", "lamp", [BOARD.u0 - 14, BOARD.u0], [v - 26, v + 26], [-58, JAW_TOP], { r: 2, cls: "m-indigo" });
  boardBox("stand.clamp.foot", "lamp", [BOARD.u0, u + 8], [v - 26, v + 26], [-58, -46], { r: 2, cls: "m-indigo" });
  // the screw: a pad pressing the board's underside and its stem down to the foot, then the stem
  // below the foot with a knurled knob; it is drawn in two pieces, one each side of the foot
  const FSC = G.frameOf(bp(u + 2, v, 0), N, X, S);
  const upper = [[-46, 4.2], [-32, 4.2], [-32, 9], [-28, 9]];
  turned("stand.clamp.screw", "lamp", FSC, upper);
  const lower = [[-94, 8], [-93, 9.4], [-82, 9.4], [-81, 8], [-81, 4.2], [-58, 4.2]];
  const knurl = k.fadedSvg(G.ribsOf(FSC, -93, -82, 9.4, 30, P, { fade: [0.1, 0.55] }), { tone: "lo" });
  turned("stand.clamp.knob", "lamp", FSC, lower, { extra: knurl });
  // the upright socket: its foot follows the sloping jaw, front low and back high
  const [sx, sy, sz] = SOCKET_AT;
  const FUP = G.frameOf([sx, sy, 0], UP, X, [0, 1, 0]);
  const top = sz + SOCKET.h;
  turned("stand.lamp.socket", "lamp", FUP, [[sz - 2 * SOCKET.r * Math.tan(TILT), SOCKET.r], [top, SOCKET.r]], {
    inner: Ln(G.arcOf(FUP, top - 9, SOCKET.r, P), { tone: "faint" }),
    shape: A.disc(FUP, sz - 2 * SOCKET.r * Math.tan(TILT), top, SOCKET.r, { name: "stand.lamp.socket", seated: true, cut: jaw.shapes[0] }),
    extra: Dt([at([sx, sy + SOCKET.r, top - 18])], { size: 0.6, tone: "mid" }),
  });
  turned("stand.lamp.collar", "lamp", FUP, [[top, 16], [top + 6, 16]], { extra: Dt(G.dotsOf(FUP, top + 6, 12.5, 4, P, { all: true }), { size: 0.5, tone: "mid" }) });
  // joints: shoulder, elbow and head knuckle, each a drum on M; the arms' paired rods end in eyes that
  // sit flush on the drums' ends, the low arm's next to the drum, the high arm's outside it
  const EYE = { low: [14, 20.8, 6.4], high: [20.8, 27.6, 6] };
  const drums = {};
  const joint = (name, centre, r, half) => {
    const F = G.frameOf(G.add3(centre, G.mul3(M, -half)), M, E2, UP);
    drums[name] = turned(name, "lamp", F, [[0, r], [half * 2, r]]).shapes[0];
  };
  joint("stand.lamp.shoulder", S0, 11, EYE.low[0]);
  joint("stand.lamp.elbow", ELBOW, 12, EYE.low[0]);
  joint("stand.lamp.knuckle", HEAD_AT, HEAD.knuckle, EYE.high[0]);
  // the post rises from the swivel collar into the shoulder drum, its rim on the drum
  const postTop = S0[2] - Math.sqrt(11 * 11 - 7 * 7) + 0.6;
  turned("stand.lamp.post", "lamp", FUP, [[top + 6, 7], [postTop, 7]], { shape: A.solid(FUP, [[top + 6, 7], [postTop, 7]], { name: "stand.lamp.post", seated: true, cut: drums["stand.lamp.shoulder"] }) });
  const eyesAt = new Map();
  const eyes = (centre, [from, to, r], name) => {
    const made = [];
    for (const side of [-1, 1]) {
      const F = G.frameOf(G.add3(centre, G.mul3(M, side * from)), G.mul3(M, side), E2, UP);
      const pin = side > 0 ? Dt([at(G.pointOf(F, to - from, 0, 0))], { size: 0.7, tone: "mid" }) : "";
      made.push(turned(nameFor(name), "lamp", F, [[0, r], [to - from, r]], { extra: pin }).shapes[0]);
    }
    eyesAt.set(`${name}@${centre.join()}`, made);
    return made;
  };
  const lowS = eyes(S0, EYE.low, "stand.lamp.eye.low");
  const lowE = eyes(ELBOW, EYE.low, "stand.lamp.eye.low");
  const highE = eyes(ELBOW, EYE.high, "stand.lamp.eye.high");
  const highH = eyes(HEAD_AT, EYE.high, "stand.lamp.eye.high");
  // each rod runs from eye to eye, its ends seated in them (rim on a round body)
  const rodShapes = {};
  const rods = (from, to, [m0, m1, eyeR], r, ends, name) => {
    const axis = G.unit3(G.sub3(to, from));
    const lift = Math.sqrt(eyeR * eyeR - r * r);
    const offset = (m0 + m1) / 2;
    [-1, 1].forEach((side, index) => {
      const a = G.add3(G.add3(from, G.mul3(M, side * offset)), G.mul3(axis, lift - 0.6));
      const b = G.add3(G.add3(to, G.mul3(M, side * offset)), G.mul3(axis, -lift + 0.6));
      const F = G.frameAlong(a, G.unit3(G.sub3(b, a)));
      const length = G.len3(G.sub3(b, a));
      const rodName = nameFor(name);
      const shape = A.solid(F, [[0, r], [length, r]], { name: rodName, seated: true, cut: [ends[0][index], ends[1][index]] });
      rodShapes[rodName] = shape;
      turned(rodName, "lamp", F, [[0, r], [length, r]], { shape });
    });
  };
  rods(S0, ELBOW, EYE.low, 3.2, [lowS, lowE], "stand.lamp.rod.low");
  rods(ELBOW, HEAD_AT, EYE.high, 3, [highE, highH], "stand.lamp.rod.high");
  // a knurled tension knob on the near end of the elbow and of the head knuckle
  for (const [centre, r] of [[ELBOW, 10], [HEAD_AT, 8.5]]) {
    const F = G.frameOf(G.add3(centre, G.mul3(M, EYE.high[1])), M, E2, UP);
    const knob = [[0, r - 3], [2, r - 3], [2, r], [9, r], [10, r - 1.5], [10, 0]];
    turned(nameFor("stand.lamp.knob"), "lamp", F, knob, { cls: "m-brass", extra: k.fadedSvg(G.ribsOf(F, 2, 9, r, 26, P, { fade: [0.1, 0.55] }), { tone: "lo" }) });
  }
  // springs between the rods, each hung on two cross pins whose ends sit in the rods
  const spring = (from, to, [m0, m1], rodR, rodNames, name) => {
    const axis = G.unit3(G.sub3(to, from));
    const length = G.len3(G.sub3(to, from));
    const k2 = G.cross3(axis, M);
    const offset = (m0 + m1) / 2;
    const half = offset - Math.sqrt(rodR * rodR - 1.4 * 1.4);
    for (const end of [0, 1]) {
      const c = G.add3(from, G.mul3(axis, end * length));
      const a = G.add3(c, G.mul3(M, -half - 0.4));
      const F = G.frameAlong(a, M);
      const pinName = nameFor(`${name}.pin`);
      turned(pinName, "lamp", F, [[0, 1.4], [2 * half + 0.8, 1.4]], { cls: "m-brass", shape: A.solid(F, [[0, 1.4], [2 * half + 0.8, 1.4]], { name: pinName, seated: true, cut: rodNames.map((rodName) => rodShapes[rodName]) }) });
    }
    const turns = Math.round((length - 20) / 3.2);
    const pts = [];
    const steps = turns * 16;
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const angle = t * turns * 2 * Math.PI;
      const c = G.add3(from, G.mul3(axis, 10 + t * (length - 20)));
      pts.push(G.add3(c, G.add3(G.mul3(M, 4.2 * Math.cos(angle)), G.mul3(k2, 4.2 * Math.sin(angle)))));
    }
    const hooks = [[from, pts[0]], [pts[pts.length - 1], G.add3(from, G.mul3(axis, length))]];
    const front = [];
    const back = [];
    for (let index = 1; index < pts.length; index++) {
      const mid = G.mul3(G.add3(pts[index], pts[index - 1]), 0.5);
      const c = G.add3(from, G.mul3(axis, G.dot3(G.sub3(mid, from), axis)));
      (G.dot3(G.sub3(mid, c), V) >= 0 ? front : back).push(k.pathOf([at(pts[index - 1]), at(pts[index])]));
    }
    const svg = `<g class="m-brass">${Ln(back.join(""), { tone: "lo" })}${Ln(hooks.map(([a, b]) => k.pathOf([at(a), at(b)])).join(""), { tone: "mid" })}${Ln(front.join(""), { tone: "mid" })}</g>`;
    // the coil is recorded from pin to pin, so it hangs on them
    put("lamp", G.mul3(G.add3(from, G.add3(from, G.mul3(axis, length))), 0.5), svg, {
      name: nameFor(name),
      shapes: [record(A.tube([G.add3(from, G.mul3(axis, 1.4)), G.add3(from, G.mul3(axis, length - 1.4))], 4.8, { name: nameFor(`${name}.coil`) }))],
    });
  };
  const lowAxis = G.unit3(G.sub3(ELBOW, S0));
  spring(G.add3(S0, G.mul3(lowAxis, 40)), G.add3(S0, G.mul3(lowAxis, 210)), EYE.low, 3.2, ["stand.lamp.rod.low", "stand.lamp.rod.low#2"], "stand.lamp.spring.low");
  const highAxis = G.unit3(G.sub3(HEAD_AT, ELBOW));
  spring(G.add3(ELBOW, G.mul3(highAxis, 34)), G.add3(ELBOW, G.mul3(highAxis, 170)), EYE.high, 3, ["stand.lamp.rod.high", "stand.lamp.rod.high#2"], "stand.lamp.spring.high");
  head(restTheta, drums["stand.lamp.knuckle"]);
}

// a solid whose paths the page rewrites every frame: every part is present, even when empty
function liveSolid(paths, { tone = "mid", crease = "faint" } = {}) {
  const shades = paths.shades.map((d, shade) => `<path class="iso-shade" data-shade="${shade}" d="${d}"/>`).join("");
  return `<g class="iso-solid"${paths.seamless ? ' data-seamless=""' : ""}><path class="iso-fill" d="${paths.fill}"/>${shades}<path class="iso-top" d="${paths.top}"/><path class="iso-line iso-crease" data-tone="${crease}" d="${paths.crease || ""}"/><path class="iso-line iso-edge" data-tone="${tone}" d="${paths.outline}"/></g>`;
}

function head(theta, knuckle) {
  const parts = headParts(LAMP, theta, P);
  const F = parts.F;
  const open = parts.facing > 0.02;
  const svg =
    `<g class="m-indigo lamp-neck">${liveSolid(parts.neck)}</g>` +
    `<g class="m-indigo lamp-shade">${liveSolid(parts.shade)}<path class="iso-line lamp-band" data-tone="faint" d="${parts.band}"/><g class="lamp-vents">${Dt(parts.vents, { size: 0.75, tone: "hi" })}</g>` +
    `<g class="lamp-mouth"${open ? "" : ' style="display:none"'}><path class="lamp-inside" d="${parts.opening}"/><clipPath id="lamp-mouth-clip"><path d="${parts.opening}"/></clipPath><g clip-path="url(#lamp-mouth-clip)"><path class="lamp-throat iso-line" data-tone="faint" d="${parts.throat}"/><g class="m-bulb lamp-bulb">${liveSolid(parts.bulb, { tone: "lo", crease: "none" })}</g></g><path class="iso-line lamp-lip" data-tone="lo" d="${parts.lip}"/></g></g>` +
    `<g class="m-brass lamp-switch"><g class="lamp-stem">${liveSolid(parts.stem)}</g><g class="lamp-button">${liveSolid(parts.button)}</g></g>`;
  put("lamp", G.pointOf(F, 70, 0, 0), svg, {
    name: "stand.lamp.head",
    bias: 0.5,
    shapes: [record(A.disc(F, HEAD.neck[0], HEAD.neck[1], HEAD.neck[2], { name: "stand.lamp.neck", seated: true, cut: knuckle })), record(A.solid(F, HEAD.shade, { name: "stand.lamp.shade" }))],
  });
}

// ---- the sheets --------------------------------------------------------------------------------------
const columnsOf = {
  vision: ["要有", "大格局"],
  goal: ["三年", "翻一番"],
  route: ["路径大家", "再想想"],
  milestones: ["节点", "倒排"],
  resources: ["人手先", "克服一下"],
  timeline: ["越快", "越好"],
};

function sheetOutline() {
  const ring = [[0, 0], [W, 0]];
  return (tab) => {
    const pts = [...ring, [W, tab - TAB.half]];
    const arc = (cx, cy, a0, a1) => {
      for (let index = 0; index <= 6; index++) {
        const a = a0 + ((a1 - a0) * index) / 6;
        pts.push([cx + TAB.r * Math.cos(a), cy + TAB.r * Math.sin(a)]);
      }
    };
    arc(W + TAB.out - TAB.r, tab - TAB.half + TAB.r, -Math.PI / 2, 0);
    arc(W + TAB.out - TAB.r, tab + TAB.half - TAB.r, 0, Math.PI / 2);
    pts.push([W, tab + TAB.half], [W, H], [0, H]);
    return pts;
  };
}
const outlineFor = sheetOutline();

function sheets() {
  LAYERS.forEach((layer, index) => {
    const piece = `s${index}`;
    const outline = outlineFor(TAB_V[index]);
    const art = artOf(index);
    const strokes = (list, cls) => list.map((stroke) => `<path class="${cls}${stroke.heavy ? " art-heavy" : ""}${stroke.dotted ? " art-dotted" : ""}" d="${dOf(stroke.points, stroke.closed)}"/>`).join("");
    const holes = TACK_AT.map(([su, sv]) => `<circle class="art-hole" cx="${su}" cy="${sv}" r="0.9"/>`).join("");
    const tab = `<circle class="tab-ring" cx="${W + TAB.hole}" cy="${TAB_V[index]}" r="${TAB.ringR}"/><circle class="tab-hole" cx="${W + TAB.hole}" cy="${TAB_V[index]}" r="${TAB.holeR}"/>`;
    // at rest the lamp lights the top of the stack: that pool is drawn here, the page moves it after
    const rest = index === 0 ? poolOf(LAMP, restTheta, sheetPoint(0, 0, 0), X, S, N) : null;
    const ellipse = rest
      ? `cx="${f2(rest.u)}" cy="${f2(rest.v)}" rx="${f2(rest.rx)}" ry="${f2(rest.ry)}" transform="rotate(${f2(rest.turn)} ${f2(rest.u)} ${f2(rest.v)})" style="opacity:1"`
      : `cx="0" cy="0" rx="1" ry="1" style="opacity:0"`;
    const pool = `<clipPath id="pool-clip-${index}"><rect width="${W}" height="${H}"/></clipPath><g clip-path="url(#pool-clip-${index})"><ellipse class="pool" data-pool="${index}" ${ellipse}/></g>`;
    const stamp = layer.id === "timeline" ? stampSvg() : "";
    const content = `<g class="sheet-plane" transform="${planeMatrix(sheetPoint(index, 0, 0), X, S)}"><path class="sheet-paper" d="${dOf(outline, true)}"/>${pool}<g class="sheet-art" data-art="${index}">${strokes(art.pencil, "art-pencil")}${strokes(art.ink, "art-ink")}${stamp}</g>${holes}${tab}<path class="sheet-edge" data-edge="${index}" d="${dOf(outline, true)}"/></g>`;
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    const FSH = G.frameOf(sheetPoint(index, 0, 0, 0), N, X, S);
    const tabRect = [[W, TAB_V[index] - TAB.half], [W + TAB.out, TAB_V[index] - TAB.half], [W + TAB.out, TAB_V[index] + TAB.half], [W, TAB_V[index] + TAB.half]];
    put(piece, sheetPoint(index, W / 2, H / 2, 0), `<g class="sheet" data-sheet="${index}">${content}</g>`, {
      name: `sheet.${index}`,
      bias: 0.05 * (COUNT - index),
      shapes: [record(A.prism(FSH, rect, 0, PAPER, { name: `sheet.${index}` })), record(A.prism(FSH, tabRect, 0, PAPER, { name: `sheet.${index}.tab` }))],
    });
  });
}

function stampSvg() {
  const { u, v, w, h, turn } = STAMP;
  const chars = [...STAMP_TEXT];
  const size = 15;
  const glyphs = chars.map((ch, index) => `<text class="stamp-text" x="${f2(u - ((chars.length - 1) / 2 - index) * (size + 2.2))}" y="${f2(v + 0.8)}" font-size="${size}">${ch}</text>`).join("");
  return `<g class="stamp" transform="rotate(${turn} ${u} ${v})"><rect class="stamp-rim" x="${u - w / 2}" y="${v - h / 2}" width="${w}" height="${h}" rx="2.4"/><rect class="stamp-rim stamp-inner" x="${u - w / 2 + 2.6}" y="${v - h / 2 + 2.6}" width="${w - 5.2}" height="${h - 5.2}" rx="1.2"/>${glyphs}</g>`;
}
const STAMP_TEXT = "已明确";

// ---- tacks: brass heads with their pins, pushed through all six sheets --------------------------
const TACK = [[-9.5, 0], [-8.6, 0.42], [0, 0.42], [0, 5.8], [0.6, 6.1], [1.2, 5.9, 1], [2.1, 5.1, 1], [2.8, 3.6, 1], [3.2, 1.8, 1], [3.3, 0]];
function tacks() {
  const topA = restA(0) + PAPER;
  TACK_AT.forEach(([su, sv], index) => {
    const base = sheetPoint(0, su, sv);
    const F = G.frameOf(base, N, X, S);
    const head = TACK.filter(([s]) => s >= 0);
    const pin = G.solidOf([[-9.5, 0], [-8.6, 0.42], [0, 0.42]], F, P);
    const cap = G.solidOf(head, F, P);
    // the pin is inside the stack at rest; the page fades it in over the first millimetres it travels
    const svg = `<g class="tack-pin" style="opacity:0"><g class="m-steel">${Sd(pin, { tone: "mid", crease: "none" })}</g></g><g class="m-brass">${Sd(cap, { tone: "mid" })}</g>`;
    put("tacks", G.pointOf(F, 2, 0, 0), svg, {
      name: `tack.${index}`,
      bias: 0.2,
      // the pin is recorded from the board's face up: below it, at rest, it is in its own hole in the board
      shapes: [record(A.solid(F, head, { name: `tack.${index}` })), record(A.disc(F, -(restA(0) + PAPER), 0, 0.42, { name: `tack.${index}.pin` }))],
    });
  });
}

// ---- tags on strings from the tabs -------------------------------------------------------------------
function glyphs(text, x, top, size, pitch, className) {
  return [...text].map((ch, index) => `<text class="${className}" x="${f2(x)}" y="${f2(top + pitch * index + pitch / 2)}" font-size="${size}">${ch}</text>`).join("");
}
const FRAME_TOP = 15.5;
const FRAME = { x0: -TAG.w / 2 + 3, x1: TAG.w / 2 - 3, y0: FRAME_TOP, y1: TAG.h - 3 };
const framePath = `M${FRAME.x0 + 1.4} ${FRAME.y0}H${FRAME.x1 - 1.4}Q${FRAME.x1} ${FRAME.y0} ${FRAME.x1} ${FRAME.y0 + 1.4}V${FRAME.y1 - 1.4}Q${FRAME.x1} ${FRAME.y1} ${FRAME.x1 - 1.4} ${FRAME.y1}H${FRAME.x0 + 1.4}Q${FRAME.x0} ${FRAME.y1} ${FRAME.x0} ${FRAME.y1 - 1.4}V${FRAME.y0 + 1.4}Q${FRAME.x0} ${FRAME.y0} ${FRAME.x0 + 1.4} ${FRAME.y0}Z`;
const GROMMET = 3.6;
const eyelet = `<circle class="tag-hole" cy="${TAG.hole}" r="${TAG.holeR}"/><circle class="iso-line" data-tone="mid" cy="${TAG.hole}" r="${GROMMET}"/><path class="iso-line tag-string" data-tone="mid" d="M0 0V${TAG.hole - GROMMET}"/>`;

function frontFace(layer) {
  const count = [...layer.name].length;
  const size = count <= 2 ? 17 : 15.4;
  const pitch = size + (count <= 2 ? 3 : 1.6);
  const top = (FRAME.y0 + FRAME.y1) / 2 - (pitch * count) / 2;
  return `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}${glyphs(layer.name, 0, top, size, pitch, "tag-name")}`;
}

function backFace(layer) {
  const columns = columnsOf[layer.id];
  const size = 12.6;
  const pitch = 13.8;
  const xs = columns.length === 1 ? [0] : [7.4, -7.4];
  const rows = Math.max(...columns.map((text) => [...text].length));
  const top = (FRAME.y0 + FRAME.y1) / 2 - (pitch * rows) / 2;
  let svg = `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}`;
  columns.forEach((text, index) => (svg += glyphs(text, xs[index], top, size, pitch, "tag-quote")));
  return svg;
}

function tags() {
  LAYERS.forEach((layer, index) => {
    const piece = `s${index}`;
    const hole = sheetPoint(index, W + TAB.hole, TAB_V[index]);
    const top = tagTop(index);
    R.route(`tag.string${index}`, [hole, top], 0.35, { piece, move: MOVES[piece], rims: [0.35, 0.35] });
    put(piece, [top[0], top[1], (hole[2] + top[2]) / 2], `<path class="iso-line tag-string" data-tone="mid" d="${k.pathOf([at(hole), at(top)])}"/>${Dt([at(hole)], { size: 0.8, tone: "hi" })}`, {
      name: `tag.string${index}`,
      bias: 0.3,
      shapes: [A.tube([hole, top], 0.5, { name: `tag.string${index}`, owner: `tag.string${index}` }), A.ball(hole, 0.8 / KS, { name: `tag.knot${index}`, owner: `tag.string${index}` })],
    });
    const F = tagFrame(top, 0, AZ);
    const solid = tagSolid(F, P);
    const faces = solid.faces.map((face) => `<path class="tag-face" data-face="${face.side}" d="${face.d}"/>`).join("");
    const content = [1, -1]
      .map((side) => `<g class="tag-side" data-side="${side}" transform="${tagFace(F, side, P)}"${side === 1 ? "" : ' style="display:none"'}>${side === 1 ? frontFace(layer) : backFace(layer)}</g>`)
      .join("");
    const shades = solid.shades.map((d, shade) => `<path class="iso-shade" data-shade="${shade}" d="${d}"/>`).join("");
    const svg =
      `<g class="m-wood tag" data-tag="${index}"><g class="iso-solid">` +
      `<path class="iso-fill" d="${solid.fill}"/>${shades}<path class="iso-top" d="${solid.top}"/>${faces}` +
      `<path class="iso-line iso-crease" data-tone="faint" d="${solid.crease}"/><path class="iso-line iso-edge" data-tone="hi" d="${solid.outline}"/></g>${content}</g>`;
    const tagShape = A.prism({ o: top, a: F.n, u: F.u, v: [0, 0, 1] }, TAG_RING, -TAG.t / 2, TAG.t / 2, { name: `tag.tag${index}` });
    put(piece, [top[0], top[1], top[2] - TAG.h / 2], svg, { name: `tag.tag${index}`, bias: 0.4, shapes: [record(tagShape)] });
  });
}

// ---- assemble ----------------------------------------------------------------------------------------
stand();
board();
tools();
lamp();
sheets();
tacks();
tags();

const QUICK = process.argv.includes("--quick") || process.argv.includes("--chars");
const SETTLE = JSON.parse(process.env.SETTLE || "{}");
const started = Date.now();
// The sheets are parallel and only ever move along their own normal, the higher ones further and
// first, so a higher sheet always paints over a lower one: their pairs are left out of the ray-cast
// and their keys keep the stack order on their own.
const sheetOf = (item) => (item.name.startsWith("sheet.") ? Number(item.name.split(".")[1]) : null);
// Everything on or under the board stays put while the sheets only rise from it, so a sheet always
// paints over the board, the ledge, the tools on it and the frame beneath: those pairs keep their
// order from the keys too (each sheet's centre is nearer the viewer than any of them at rest).
const UNDER = /^stand\.(board|ledge|plate|pencil|square|scale|compass|eraser|bearer|hub|column|post|collar|plinth|quadrant|knob|stretcher|foot|pad)/;
const stacked = (a, b) => A.sameRun(a, b) || (sheetOf(a) !== null && sheetOf(b) !== null) || (sheetOf(a) !== null && UNDER.test(b.name)) || (sheetOf(b) !== null && UNDER.test(a.name));
// --draft settles on the uniform and prefix states only, for quick looks; every real build replays the springs
const DRAFT = process.argv.includes("--draft");
if (!QUICK) A.settle(R, P, { skip: stacked, ...(DRAFT ? { states: [...A.uniformStates(10), ...A.prefixStates(SLOTS)] } : {}), ...SETTLE });
if (!QUICK) console.log(`settled in ${((Date.now() - started) / 1000).toFixed(1)} s`);
// keep the sheets in stack order after settling: the lower one first
const ordered = R.items.slice().sort((a, b) => a.key - b.key);
const body = ordered
  .map((item, index) => {
    const [mx, my, mz] = item.move;
    return `<g class="it" data-piece="${item.piece}" data-name="${item.name}" data-k="${item.key.toFixed(2)}" data-m="${f2(mx)},${f2(my)},${f2(mz)}" data-i="${index}">${item.svg}</g>`;
  })
  .join("");

// the lamp's light on paper: the sheet under it scatters more and turns a warm white, warmest at the centre
const DEFS = `<defs><radialGradient id="pool-light"><stop offset="0" stop-color="#FFF1CC" stop-opacity=".9"/><stop offset=".38" stop-color="#FFF4DA" stop-opacity=".7"/><stop offset=".72" stop-color="#FFF8EA" stop-opacity=".3"/><stop offset="1" stop-color="#FFF8EA" stop-opacity="0"/></radialGradient></defs>`;

const LABEL =
  "一张老式绘图桌，桌面宽 90 厘米、倾斜 15 度，左边夹着一盏摇臂台灯。桌面右半边用四枚图钉钉着 6 张半透明描图纸，从上到下是愿景、目标、路线图、里程碑、资源、时间表，每张纸边挂一块小牌，正面写名字，翻过来是领导的原话。只有愿景和时间表两层画清楚了，可执行度 40%。";

const closedReadout = readoutParts(NONE_LIFTED);
const openReadout = readoutParts(ALL_LIFTED);
const readoutHtml = (parts) => `<span class="ro-scope">${parts.scope}：</span><span class="ro-nums">${numbersOf(parts)}</span>`;
const STAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${LABEL}">${DEFS}${body}</svg>`;

// ---- styles ------------------------------------------------------------------------------------------
const FONT_CSS_URL = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css";
const manifestPath = join(HERE, "fonts", "manifest.json");
const embedded = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
      .map((entry) => `@font-face{font-family:"Hongtu WenKai";font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${readFileSync(join(HERE, "fonts", entry.file)).toString("base64")}) format("woff2");unicode-range:${entry.range}}`)
      .join("")
  : "";

const TOKENS = `
.iso{--paper:#ECEAE1;--sheet:#F8F7F2;--ink:#24231F;--ink-2:#4E4C45;--ink-3:#6B685F;--line:#D6D2C4;--line-2:#E4E0D4;--indigo:#1F3A4D;--gold:#C9A86A;--cinnabar:#B5382A;--pencil:#9A958A;
  --kai:"LXGW WenKai","Hongtu WenKai","KaiTi","STKaiti",serif}
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
  --anatomy-faint:#3A5367;--anatomy-lo:#2A3F4F;--anatomy-mid:#1C2C38;--anatomy-dot:var(--sheet)}
.m-ivory{--anatomy-paper:#F2EFE6;--anatomy-top:#FBFAF6;--anatomy-shade-3:#F4F2EB;--anatomy-shade-2:#ECE9E0;--anatomy-shade-1:#E2DED2;--anatomy-shade-0:#D6D1C3;--anatomy-faint:#D6D2C4;--anatomy-lo:#8F8A7C;--anatomy-mid:#4E4C45}
.m-celluloid{--anatomy-paper:#C9D3D8;--anatomy-top:#D9E1E4;--anatomy-shade-3:#C9D3D8;--anatomy-shade-2:#B9C5CB;--anatomy-shade-1:#A9B7BE;--anatomy-shade-0:#99A9B1;
  --anatomy-faint:#A0AEB5;--anatomy-lo:#6F818B;--anatomy-mid:#3F5562}
.m-eraser{--anatomy-paper:#E6DCC6;--anatomy-top:#EFE8D8;--anatomy-shade-3:#E6DCC6;--anatomy-shade-2:#DCD0B6;--anatomy-shade-1:#D2C4A7;--anatomy-shade-0:#C8B898;--anatomy-mid:#8C7E62}
.m-graphite{--anatomy-paper:#4E4C45;--anatomy-top:#6B685F;--anatomy-shade-3:#5C5A52;--anatomy-shade-2:#4E4C45;--anatomy-shade-1:#3F3D38;--anatomy-shade-0:#33312C;--anatomy-hi:var(--ink)}
.m-steel{--anatomy-paper:#B9BCB8;--anatomy-top:#D3D5D1;--anatomy-shade-3:#C5C8C3;--anatomy-shade-2:#B9BCB8;--anatomy-shade-1:#A7ABA6;--anatomy-shade-0:#959A95;--anatomy-mid:#5F635F}
.m-bulb{--anatomy-paper:#F8F7F2;--anatomy-top:#FCFBF8;--anatomy-shade-3:#F8F7F2;--anatomy-shade-2:#F1EFE7;--anatomy-shade-1:#E9E6DC;--anatomy-shade-0:#DFDBCF;--anatomy-lo:#B3A68C}
.m-wood{--anatomy-paper:#F2ECDF;--anatomy-top:#FBF8F1;--anatomy-shade-3:#F3EEE3;--anatomy-shade-2:#EAE2D2;--anatomy-shade-1:#E0D6C3;--anatomy-shade-0:#D3C7B0;
  --anatomy-faint:#D2C6AF;--anatomy-lo:#B3A68C;--anatomy-mid:#7B7160;--anatomy-dot:var(--ink);
  --face:#F5F0E5;--face-lit:#FCFAF5;--face-dark:#DDD3C0}
.sheet-paper{fill:#ECEAE1;fill-opacity:.2;stroke:none}
.sheet-edge{fill:none;stroke:#8C8778;stroke-width:.55;vector-effect:non-scaling-stroke;stroke-linejoin:round}
.art-ink{fill:none;stroke:var(--ink);stroke-width:.75;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.art-heavy{stroke-width:1.25}
.art-pencil{fill:none;stroke:var(--pencil);stroke-width:.5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;stroke-dasharray:2.4 1.8}
.art-dotted{stroke-dasharray:.01 3.6;stroke-width:.9}
.art-hole{fill:var(--sheet);stroke:#8C8778;stroke-width:.4;vector-effect:non-scaling-stroke}
.tab-ring{fill:#E2CB98;stroke:#957747;stroke-width:.45;vector-effect:non-scaling-stroke}
.tab-hole{fill:#6B685F;stroke:none}
.pool{fill:url(#pool-light)}
.stamp-rim{fill:none;stroke:var(--cinnabar);stroke-width:1.1;vector-effect:non-scaling-stroke}
.stamp-inner{stroke-width:.55}
.stamp-text{fill:var(--cinnabar);font-family:var(--kai);text-anchor:middle;dominant-baseline:central}
.lamp-inside{fill:#EFEBE0;stroke:none}
.lamp-vents circle{fill:#14263A}
.sq-hole{fill:#E2CB98;stroke:none}
.tag-face{fill:var(--face);stroke:none}
.tag-hole{fill:#A99B80}
.tag-name,.tag-quote{font-family:var(--kai);text-anchor:middle;dominant-baseline:central;fill:var(--ink)}
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
.iso-swatch[data-mark="dim"] path{stroke:#B3A68C}
.iso-swatch[data-mark="dashed"] path{stroke:var(--pencil)}
.layers{width:100%;border-collapse:collapse;font-size:13.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.layers th,.layers td{padding:4px 6px;border-bottom:1px solid var(--line-2);text-align:left;font-weight:400}
.layers th{color:var(--ink-3);font-size:12.5px;letter-spacing:.06em}
.layers td.n,.layers th.n{text-align:right;white-space:nowrap}
.layers tr.clear td{color:var(--ink)}
.layers tfoot td{border-bottom:none;color:var(--ink)}
.layers .q2{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:560px){
  .iso-plate{padding:50px 8px 92px}
  .iso-plate-corner{font-size:12px}
  .iso-plate-corner[data-corner="hint"]{bottom:40px}
  .iso-plate-corner[data-corner="readout"]{font-size:11.5px;letter-spacing:.02em;line-height:1.4}
  .ro-scope{display:block;text-align:right}
  .layers .q,.layers .d{display:none}
  .layers .q2{display:block;color:var(--ink-3);font-size:12.5px;line-height:1.5}
}
`;

// ---- the legend under the card ---------------------------------------------------------------------
const rows = LAYERS.map(
  (layer, index) =>
    `<tr${layer.clarity >= CLEAR ? ' class="clear"' : ""}><td>${index + 1}</td><td>${layer.name}<span class="q2">“${layer.quote}”</span></td><td class="q">“${layer.quote}”</td><td class="d">${layer.drawn}</td><td class="n">${layer.clarity}%</td><td class="n">${layer.weight}</td></tr>`,
).join("");
const whole = readoutParts(NONE_LIFTED);
const table = `<table class="layers"><thead><tr><th>层</th><th>名字</th><th class="q">牌子背面</th><th class="d">纸上画了什么</th><th class="n">清晰度</th><th class="n">权重</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td></td><td>合计<span class="q2">画清楚 ${whole.clear}/${whole.count} 层</span></td><td class="q"></td><td class="d">画清楚 ${whole.clear}/${whole.count} 层（清晰度 100% 的才算）</td><td class="n">可执行度 ${percentText(whole.doable)}</td><td class="n">${WEIGHT_TOTAL}</td></tr></tfoot></table>`;
const swatch = (mark) => {
  const bodyPath = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
  const crease = mark === "flat" ? "" : '<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>';
  return mark === "lit" || mark === "dashed" ? `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>` : `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${bodyPath}"/>${crease}</svg>`;
};
const keys = [
  ["lit", "墨线：画定了的"],
  ["dashed", "铅笔线：只打了个底"],
  ["raised", "绘图板：斜 15°，宽 90 厘米"],
  ["flat", "铸铁架子和摇臂台灯"],
];
const CAPTION = `六张描图纸叠在一起，看着是一张完整的宏图：远山、山顶的旗、盘山路、路边的小旗、人和钱、一把时间尺。掀开来一张张放到灯下，才看出哪几层是画定了的。清晰度是一层纸上墨线占全部笔画的比例：愿景 100%，目标 80%，路线图 20%，里程碑 30%，资源 0%，时间表 100%。只有清晰度 100% 的才算画清楚，六层里只有愿景和时间表两层。可执行度按权重加权平均，越接近“怎么干”的层权重越高：路线图、资源各 3，目标、里程碑各 2，愿景、时间表各 1，合计 ${WEIGHT_TOTAL}，可执行度 ${percentText(whole.doable)}。整张宏图里，只有截止时间盖了“已明确”的章。`;
const legend = `<figcaption class="iso-legend"><span class="iso-keys">${keys.map(([mark, label]) => `<span class="iso-key">${swatch(mark)}${label}</span>`).join("")}</span>${table}<span class="iso-caption">${CAPTION}</span></figcaption>`;

const plate = `<figure class="iso-figure hongtu"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">图 2</span><span class="iso-plate-corner" data-corner="title">宏图解剖图</span><span class="iso-plate-corner" data-corner="hint">悬停，一层层掀开</span><span class="iso-plate-corner" data-corner="readout" data-readout>${readoutHtml(closedReadout)}</span></div><div class="iso-stage" tabindex="0" role="button" aria-label="宏图解剖图。按空格或回车，把六张描图纸从上到下一张张掀起来；再按一次合上。" aria-describedby="hongtu-state">${STAGE_SVG}</div><p class="sr" id="hongtu-state" aria-live="polite"></p></div>${legend}</figure>`;

// ---- the page's live code ------------------------------------------------------------------------------
const sheetData = LAYERS.map((_, index) => ({
  origin: sheetPoint(index, 0, 0).map(f2),
  centre: sheetCentre(index).map(f2),
  lift: liftOf(index),
  top: tagTop(index).map(f2),
}));
const DATA = {
  P,
  AZ,
  W: WIDTH,
  H: HEIGHT,
  slots: SLOTS,
  spring: SPRING,
  sheets: sheetData,
  X,
  S,
  N,
  lamp: { H: HEAD_AT, e2: E2, n: UP, m: M, rest: restTheta },
  EX: k.axisVector(P, [1, 0, 0]),
  EY: k.axisVector(P, [0, 1, 0]),
  EZ: k.axisVector(P, [0, 0, 1]),
  V: R.V,
};
const LATHE_SOURCE = readFileSync(join(SKILL, "kit/lathe.mjs"), "utf8");
const LATHE_NAMES = [...LATHE_SOURCE.matchAll(/^export (?:function|const) (\w+)/gm)].map((match) => match[1]);
const latheScript = () => `const G = (() => {\n${LATHE_SOURCE.replace(/^import .*$/gm, "").replace(/^export /gm, "")}\nreturn { ${LATHE_NAMES.join(", ")} };\n})();`;
const inline = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const LIVE = existsSync(join(HERE, "live.js")) ? readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA)) : "";
const SCRIPT = [kitScript(), latheScript(), inline("model.mjs"), inline("tag.mjs"), inline("lamp.mjs"), LIVE].join("\n");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>宏图解剖图</title><meta name="description" content="宏图：领导描绘的宏伟蓝图，一层层掀开，看看哪几层是画清楚了的。"><link rel="stylesheet" href="${FONT_CSS_URL}"><style>${embedded}${k.ISO_CSS}${TOKENS}${PAGE_CSS}</style></head><body class="iso" data-theme="light"><main class="iso-page">${plate}</main><script type="module">${SCRIPT.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

// ---- the standalone SVG: the figure at rest, styles and font inside -----------------------------------
const standalone = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso" data-theme="light" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${LABEL}"><title>宏图解剖图</title><style>@import url("${FONT_CSS_URL}");${embedded}${k.ISO_CSS}${TOKENS}.iso-svg{background:var(--sheet)}</style><rect width="${WIDTH}" height="${HEIGHT}" fill="#F8F7F2"/>${DEFS}${body}</svg>`;

if (process.argv.includes("--chars")) {
  const readouts = LAYERS.map((_, count) => readoutOf(readoutParts(LAYERS.map((__, index) => index < count + 1))));
  const texts = [LABEL, CAPTION, table, plate, readoutOf(closedReadout), readoutOf(openReadout), ...readouts, ...LAYERS.flatMap((layer) => [layer.name, layer.quote, layer.drawn]), STAMP_TEXT, readFileSync(join(HERE, "live.js"), "utf8").replace(/[^\u3000-\u9fff\uff00-\uffef]/g, ""), "0123456789.%·—：，。“”（）/°"];
  const chars = [...new Set(texts.join("").replace(/<[^>]*>/g, "").replace(/\s/g, ""))].sort().join("");
  writeFileSync(join(HERE, "fonts", "chars.txt"), chars + "\n");
  console.log(`chars: ${chars.length}`);
} else {
  writeFileSync(join(HERE, "hongtu.html"), html);
  writeFileSync(join(HERE, "hongtu.svg"), standalone);
  console.log(`wrote hongtu.html (${(html.length / 1024).toFixed(1)} KB) and hongtu.svg (${(standalone.length / 1024).toFixed(1)} KB) · ${R.items.length} items · ${R.solids.length} solids · scale ${KS.toFixed(3)} px/mm · ${WIDTH}×${HEIGHT}`);
}

// The kit's audit. Every check runs as the kit runs it, except how the solids are tested in the replayed
// frames: the sheets are 0.28 m² each and the kit's 0.6 mm sampling over its ~9000 replayed frames
// takes hours. Here the solids are tested at rest, apart and in the kit's prefix states (its worst
// frames) at 1.2 mm, and in every fourth replayed frame at 3 mm, leaving out two kinds of pair that
// cannot meet: sheet × sheet (parallel, only ever moving apart) and sheet × anything on or under the
// board (the sheets only rise from it). Tubes are checked in every replayed frame as the kit does.
function auditFigure() {
  if (!process.argv.includes("--audit")) return;
  const started = Date.now();
  const lap = (label) => console.log(`  ${label} · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const { items, overlaps, solved, states } = R.settled ?? A.settle(R, P, { skip: stacked });
  const mounts = A.mountsOf(R.tubes, R.solids);
  const links = A.linksOf(R.tubes, mounts);
  const { frames } = A.explodeStates(SLOTS, SPRING);
  const isSheet = (shape) => shape.name.startsWith("sheet.");
  const others = R.solids.filter((shape) => !isSheet(shape));
  const sheetGroups = LAYERS.map((_, index) => {
    const own = R.solids.filter((shape) => shape.name === `sheet.${index}` || shape.name === `sheet.${index}.tab`);
    return [...own, ...others.filter((shape) => !UNDER.test(shape.name))];
  });
  const solidHits = (state, spacing) => [...A.solidClearances(others, { state, spacing }), ...sheetGroups.flatMap((list) => A.solidClearances(list, { state, spacing }))];
  const worst = new Map();
  const keep = (list) => {
    for (const hit of list) {
      const key = `${hit.tube}|${hit.other}`;
      if (!worst.has(key) || worst.get(key).clearance > hit.clearance) worst.set(key, hit);
    }
  };
  frames.forEach((state) => keep(A.clearances(R.tubes, R.solids, { state, mounts, only: "through" })));
  lap(`tubes in ${frames.length} replayed frames`);
  const prefix = A.prefixStates(SLOTS);
  prefix.forEach((state) => keep(solidHits(state, 1.2)));
  lap(`solids in ${prefix.length} prefix states`);
  frames.forEach((state, index) => index % 4 === 0 && keep(solidHits(state, 3)));
  lap(`solids in ${Math.ceil(frames.length / 4)} replayed frames`);
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
    depth: A.depthOrder(items, P, { overlaps, solved }),
  };
  lap("the rest");
  console.log(A.report(result));
  console.log(`audit · ${R.tubes.length} tubes · ${R.solids.length} solids · ${R.items.length} items · ${states.length} depth states · ${frames.length} replayed frames · ${overlaps.pairs.length} overlaps · ${solved.rules} order rules · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const count = A.failures(result);
  console.log(count ? `audit failed: ${count} problem${count === 1 ? "" : "s"}` : "audit passed");
  if (count) process.exitCode = 1;
}
auditFigure();
