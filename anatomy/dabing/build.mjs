// 大饼解剖图: a seven-layer sesame flatbread on a footed plate, on an old counter scale.
// node build.mjs            writes dabing.html and dabing.svg (light theme, the platform palette)
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
import { ACTUAL_TOTAL, ALL_LIFTED, DIAL_FULL, LAYERS, NOMINAL_TOTAL, NONE_LIFTED, numbersOf, readoutOf, readoutParts } from "./model.mjs";
import { TAG, TAG_RING, tagFace, tagFrame, tagSolid } from "./tag.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTH = 600;
const AZ = 60;

// ---- world plan, millimetres; x along the scale, y toward the front, z up -------------------
const SKIRT = { x: -284, y: -116, w: 568, d: 232, r: 18 };
const BODY = { x: -280, y: -112, w: 560, d: 224, r: 16 };
const COVER = k.insetPlan(BODY, 7);
const Z = { skirt: 8, body: 14, seam: 40, cover: 48, deck: 50 };
const FOOT_H = 8;

const C = [-140, 0];
const PAN = { collar: [50, 54, 34], neck: [54, 64, 22], pan: [64, 69, 104] };
const STAND = { ring: [69, 72, 74], dome: [72, 88], knop: 112, knopR: 21, stemR: 14, flare: [134, 146], plate: [146, 152, 160] };
const PLATE_TOP = STAND.plate[1];
const CAKE_R = 150;
const LAYER_H = 6;
const GAP = 38;
const BASE = LAYERS.length - 1;
const layerZ = (index) => PLATE_TOP + LAYER_H * (BASE - index);
// apart, every layer stands GAP above the one below it, the base GAP above the plate
const liftOf = (index) => (LAYERS.length - index) * GAP;

const DIAL = { o: [170, 0, 200], r: 80, back: -19, front: 19, bezel: 23, face: 67, bezelR: 82 };
const COLUMN = { x: 142, y: -26, w: 56, d: 52, r: 10 };
const COLUMN_Z = [Z.deck, 112];
const NECK_R = 18;
const KNOB = { at: [170, -6], r: 6.5, h: 8 };

const R_T = 184;
const PICK = { from: CAKE_R, to: R_T + 2.4, r: 1.15, up: 3.2 };
const STRING = 5;
// screen offsets of the tags from the stem: the top four layers to the left, the bottom three to the
// right, read left to right in layer order; the stem stays in sight between the two groups, and apart
// the tags step down in one diagonal from top left to bottom right
const TAG_X = [-170, -135, -100, -65, 65, 100, 135];

// ---- camera ---------------------------------------------------------------------------------
const deg = Math.PI / 180;
const angleOf = (index) => AZ * deg - Math.asin(TAG_X[index] / R_T);
const along = (index, r, z) => [C[0] + r * Math.cos(angleOf(index)), C[1] + r * Math.sin(angleOf(index)), z];
const pickZ = (index) => layerZ(index) + PICK.up;
const tagTop = (index) => along(index, R_T, pickZ(index) - PICK.r - STRING);
const circle = ([cx, cy], r, z, count = 32) => Array.from({ length: count }, (_, i) => [cx + r * Math.cos((i / count) * 2 * Math.PI), cy + r * Math.sin((i / count) * 2 * Math.PI), z]);
const F_DRUM = G.frameOf(DIAL.o, [0, 1, 0], [1, 0, 0], [0, 0, 1]);

const fitPoints = [
  ...k.boxCorners(SKIRT, 0, Z.deck),
  ...[DIAL.back, DIAL.bezel].flatMap((s) => Array.from({ length: 24 }, (_, i) => G.pointOf(F_DRUM, s, DIAL.bezelR, (i / 24) * 2 * Math.PI))),
  [KNOB.at[0], KNOB.at[1], DIAL.o[2] + DIAL.r + 3 + KNOB.h],
  ...circle(C, STAND.plate[2], STAND.plate[0]),
  ...circle(C, CAKE_R, layerZ(0) + LAYER_H + liftOf(0)),
  ...LAYERS.flatMap((_, index) => {
    const top = tagTop(index);
    const right = [Math.sin(AZ * deg), -Math.cos(AZ * deg)];
    return [-1, 1].flatMap((side) => [0, -TAG.h].map((dz) => [top[0] + right[0] * side * (TAG.w / 2), top[1] + right[1] * side * (TAG.w / 2), top[2] + dz + liftOf(index)]));
  }),
];
const PAD = 22;
const unit = fitPoints.map((point) => k.iso(point, { origin: [0, 0], scale: 1, azimuth: AZ }));
const spanX = Math.max(...unit.map(([x]) => x)) - Math.min(...unit.map(([x]) => x));
const spanY = Math.max(...unit.map(([, y]) => y)) - Math.min(...unit.map(([, y]) => y));
const HEIGHT = Math.ceil(PAD * 2 + (spanY * (WIDTH - PAD * 2)) / spanX);
const P = k.fitProjection(fitPoints, WIDTH, HEIGHT, { pad: PAD, azimuth: AZ });
const KS = G.scaleOf(P);
const V = G.viewOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const f2 = (value) => Math.round(value * 100) / 100;

// The flat drawing plane of the dial face: x right, y down, millimetres from the dial centre.
function planeMatrix(origin, xAxis, yAxis) {
  const o = at(origin);
  const x = at(G.add3(origin, xAxis));
  const y = at(G.add3(origin, yAxis));
  const r4 = (value) => Math.round(value * 10000) / 10000;
  return `matrix(${r4(x[0] - o[0])} ${r4(x[1] - o[1])} ${r4(y[0] - o[0])} ${r4(y[1] - o[1])} ${r4(o[0])} ${r4(o[1])})`;
}
const FACE_S = DIAL.front + 0.2;
const DIAL_MATRIX = planeMatrix([DIAL.o[0], DIAL.o[1] + FACE_S, DIAL.o[2]], [1, 0, 0], [0, 0, -1]);
const NEEDLE_MATRIX = planeMatrix([DIAL.o[0], DIAL.o[1] + FACE_S + 1.6, DIAL.o[2]], [1, 0, 0], [0, 0, -1]);
const needleAngle = (grams) => (360 * grams) / DIAL_FULL;

// ---- the assemblies that come apart ---------------------------------------------------------
const SLOTS = LAYERS.map((_, index) => `l${index}`);
const SPRING = { stagger: 0.28, stiffness: 36, damping: 12.6, substeps: 4 };
const MOVES = Object.fromEntries(SLOTS.map((id, index) => [id, [0, 0, liftOf(index)]]));
const R = A.recorder(P, { order: SLOTS, spring: SPRING });
const record = (shape) => R.solid(shape);
const nameFor = R.nameFor;

function put(piece, ref, svg, { bias = 0, shapes = [], name, ...rest } = {}) {
  return R.put({ piece, at: ref, bias, svg, move: MOVES[piece] ?? [0, 0, 0], shapes, name: name ?? nameFor(`${piece}.item`), ...rest });
}

// ---- the scale --------------------------------------------------------------------------------
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));

function base() {
  const feet = byDepth(k.corners(SKIRT, 30));
  const halo = `<path class="iso-halo" d="${k.haloOf(k.insetPlan(SKIRT, 6), 0, FOOT_H, P)}"/>`;
  feet.forEach(([x, y], index) => {
    const svg = S(k.cylinder(x, y, 11, 0, 1.8, P, 28), { tone: "lo" }) + S(k.cylinder(x, y, 8.5, 1.8, FOOT_H - 1.8, P, 28), { tone: "mid", crease: "none" }) + L(k.knurl(x, y, 8.5, 1.8, FOOT_H, 22, P), { tone: "lo" });
    put("scale", [x, y, FOOT_H / 2], `${index === 0 ? halo : ""}<g class="m-indigo">${svg}</g>`, {
      bias: -2000,
      shapes: [record(A.cylinder(x, y, 11, 0, 1.8, { name: nameFor("stand.foot.pad"), ground: true })), record(A.cylinder(x, y, 8.5, 1.8, FOOT_H - 1.8, { name: nameFor("stand.foot") }))],
    });
  });
  const seam = k.sideSeam(BODY, Z.seam, P, 8);
  const body = S(k.slabOf(SKIRT, Z.skirt, Z.body - Z.skirt, P, 8, 0.8), { tone: "mid" }) + S(k.slabOf(BODY, Z.body, Z.cover - Z.body, P, 8, 1.2), { tone: "mid", inner: L(seam, { tone: "lo" }) });
  put("scale", [0, 0, Z.skirt], `<g class="m-indigo">${body}</g>`, {
    bias: -1000,
    name: "stand.base",
    shapes: [record(A.slab(SKIRT, Z.skirt, Z.body - Z.skirt, { name: "stand.skirt" })), record(A.slab(BODY, Z.body, Z.cover - Z.body, { name: "stand.body" }))],
  });
  // raised deck panel with corner screws
  const screws = k.corners(COVER, 9);
  const deck = S(k.slabOf(COVER, Z.cover, Z.deck - Z.cover, P, 8, 1), { tone: "mid" }) +
    L(k.planOutline(k.insetPlan(COVER, 5), Z.deck, P), { tone: "lo" }) +
    L(screws.map(([x, y]) => k.ring(x, y, 2.6, Z.deck, P, 16)).join(""), { tone: "lo" }) +
    D(screws.map(([x, y]) => at([x, y, Z.deck])), { size: 0.55, tone: "mid" });
  put("scale", [0, 0, Z.cover + 1], `<g class="m-indigo">${deck}</g>`, { bias: -990, name: "stand.deck", shapes: [record(A.slab(COVER, Z.cover, Z.deck - Z.cover, { name: "stand.deck" }))] });
}

function labelPlate() {
  // enamel plate on the front of the base: two screws and three rule lines that stand for print
  const y = BODY.y + BODY.d;
  const plate = { x: -78, y, w: 112, d: 1.4, r: 0.6 };
  const z0 = 22;
  const z1 = 40;
  const face = y + plate.d;
  const rule = (x0, x1, z) => L(k.segment([x0, face, z], [x1, face, z], P), { tone: "lo", free: true });
  const svg = S(k.slabOf(plate, z0, z1 - z0, P, 3), { tone: "mid", crease: "faint" }) +
    rule(plate.x + 14, plate.x + plate.w - 14, 34.5) + rule(plate.x + 14, plate.x + plate.w - 30, 30.5) + rule(plate.x + 14, plate.x + plate.w - 46, 26.5) +
    D([at([plate.x + 6, face, 31]), at([plate.x + plate.w - 6, face, 31])], { size: 0.55, tone: "mid" });
  put("scale", [plate.x + plate.w / 2, y + 1, 31], `<g class="m-sheet">${svg}</g>`, { bias: -980, name: "stand.label", shapes: [record(A.slab(plate, z0, z1 - z0, { name: "stand.label" }))] });
}

function level() {
  // a bubble level let into the deck, between the pan and the dial
  const [x, y] = [52, 62];
  const svg = `<g class="m-indigo">${S(k.cylinder(x, y, 10, Z.deck, 2.4, P, 32, 0.6), { tone: "mid" })}</g>` +
    `<g class="m-glass">${S(k.cylinder(x, y, 7, Z.deck + 2.4, 0.3, P, 32), { tone: "mid", crease: "none" })}${L(k.ring(x, y, 2.6, Z.deck + 2.7, P, 20), { tone: "lo" })}${L(k.ring(x + 1.6, y - 1.2, 1.5, Z.deck + 2.7, P, 16), { tone: "faint" })}</g>`;
  put("scale", [x, y, Z.deck + 1.2], svg, { bias: -980, name: "stand.level", shapes: [record(A.cylinder(x, y, 10, Z.deck, 2.4, { name: "stand.level" })), record(A.cylinder(x, y, 7, Z.deck + 2.4, 0.3, { name: "stand.level.glass" }))] });
}

function tareKnob() {
  // the tare knob at the right-hand end of the deck: a boss, an engraved ring and a knurled cap with a pointer
  const [x, y] = [236, 58];
  const z = Z.deck;
  const svg =
    S(k.cylinder(x, y, 13, z, 2, P, 40, 0.6), { tone: "mid" }) +
    L(k.ring(x, y, 11, z + 2, P, 40), { tone: "lo" }) +
    S(k.cylinder(x, y, 8, z + 2, 7, P, 36, 0.5), { tone: "mid" }) +
    L(k.knurl(x, y, 8, z + 2, z + 9, 34, P), { tone: "lo" }) +
    L(k.lineOnTop([x - 3, y], [x + 6.2, y], z + 9, P), { tone: "hi", free: "end" }) +
    D([at([x, y, z + 9])], { size: 0.55, tone: "hi" });
  put("scale", [x, y, z + 4], `<g class="m-indigo">${svg}</g>`, {
    bias: -975,
    name: "stand.tare",
    shapes: [record(A.cylinder(x, y, 13, z, 2, { name: "stand.tare.boss" })), record(A.cylinder(x, y, 8, z + 2, 7, { name: "stand.tare" }))],
  });
}

function endVents() {
  // three closed slots on the right-hand end of the base: the spring housing breathes there
  const x = BODY.x + BODY.w;
  const slot = (y0, y1, z) => {
    const r = 1.6;
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push([x, y1 - r + r * Math.sin((i / 8) * Math.PI), z + r * Math.cos((i / 8) * Math.PI)]);
    for (let i = 0; i <= 8; i++) pts.push([x, y0 + r - r * Math.sin((i / 8) * Math.PI), z - r * Math.cos((i / 8) * Math.PI)]);
    return k.pathOf(pts.map(at), true);
  };
  const svg = L([22, 28, 34].map((z) => slot(-60, 60, z)).join(""), { tone: "lo" });
  put("scale", [x, 0, 28], `<g class="m-indigo">${svg}</g>`, { bias: -980, name: "stand.vents", shapes: [record(A.box([x - 0.2, -62, 20], [x, 62, 36], { name: "stand.vents" }))] });
}

function pan() {
  const [x, y] = C;
  const [c0, c1, cr] = PAN.collar;
  const [n0, n1, nr] = PAN.neck;
  const [p0, p1, pr] = PAN.pan;
  put("scale", [x, y, c0 + 1], `<g class="m-indigo">${S(k.cylinder(x, y, cr, c0, c1 - c0, P, 56, 0.6), { tone: "mid" })}</g>`, { name: "stand.pan.collar", shapes: [record(A.cylinder(x, y, cr, c0, c1 - c0, { name: "stand.pan.collar" }))] });
  put("scale", [x, y, n0 + 2], `<g class="m-indigo">${S(k.cylinder(x, y, nr, n0, n1 - n0, P, 48), { tone: "mid", crease: "none", inner: L(k.sideArc(x, y, nr, 59, P, 32), { tone: "faint" }) })}</g>`, { name: "stand.pan.neck", shapes: [record(A.cylinder(x, y, nr, n0, n1 - n0, { name: "stand.pan.neck" }))] });
  const top = L(k.ring(x, y, pr - 7, p1, P, 96), { tone: "lo" }) + L(k.ring(x, y, pr - 15, p1, P, 96), { tone: "faint" });
  put("scale", [x, y, p0 + 1], `<g class="m-indigo">${S(k.cylinder(x, y, pr, p0, p1 - p0, P, 112, 1.2), { tone: "mid" })}${top}</g>`, { name: "stand.pan", shapes: [record(A.cylinder(x, y, pr, p0, p1 - p0, { name: "stand.pan" }))] });
}

function dialTower() {
  const [cx, , cz] = DIAL.o;
  const [z0, z1] = COLUMN_Z;
  const foot = k.insetPlan(COLUMN, -5);
  const cap = k.insetPlan(COLUMN, -3);
  put("scale", [cx, 0, z0 + 2], `<g class="m-indigo">${S(k.slabOf(foot, z0, 5, P, 6, 0.8), { tone: "mid" })}${D(k.corners(foot, 5.6).map(([x, y]) => at([x, y, z0 + 5])), { size: 0.5, tone: "mid" })}</g>`, { name: "stand.column.foot", shapes: [record(A.slab(foot, z0, 5, { name: "stand.column.foot" }))] });
  const seam = k.sideSeam(COLUMN, 82, P, 6);
  put("scale", [cx, 0, (z0 + z1) / 2], `<g class="m-indigo">${S(k.slabOf(COLUMN, z0 + 5, z1 - z0 - 9, P, 6, 0.6), { tone: "mid", inner: L(seam, { tone: "faint" }) })}</g>`, { name: "stand.column", shapes: [record(A.slab(COLUMN, z0 + 5, z1 - z0 - 9, { name: "stand.column" }))] });
  put("scale", [cx, 0, z1 - 2], `<g class="m-indigo">${S(k.slabOf(cap, z1 - 4, 4, P, 6, 0.6), { tone: "mid" })}</g>`, { name: "stand.column.cap", shapes: [record(A.slab(cap, z1 - 4, 4, { name: "stand.column.cap" }))] });
  // the neck: a saddle that leaves the cap and meets the drum along its curve
  const F_NECK = G.frameOf([cx, 0, cz], [0, 0, -1], [1, 0, 0], [0, -1, 0]);
  const start = (angle) => G.saddleStart(DIAL.r, NECK_R, angle);
  const neck = G.saddleOf(F_NECK, NECK_R, start, cz - z1, P);
  const drumShape = A.disc(F_DRUM, DIAL.back, DIAL.front, DIAL.r, { name: "stand.dial.drum" });
  put("scale", [cx, 0, z1 + 3], `<g class="m-indigo">${S(neck, { tone: "mid" })}</g>`, {
    name: "stand.dial.neck",
    shapes: [record(A.disc(F_NECK, DIAL.r - 12, cz - z1, NECK_R, { name: "stand.dial.neck", seated: true, cut: drumShape }))],
  });
  // the drum, its band seam toward the back, and the bezel ring
  const drum = G.disc(DIAL.back, DIAL.front, DIAL.r, F_DRUM, P);
  const band = G.arcOf(F_DRUM, -7, DIAL.r, P);
  put("scale", [cx, 0, cz], `<g class="m-indigo">${S(drum, { tone: "mid", inner: L(band, { tone: "faint" }) })}</g>`, { name: "stand.dial.drum", shapes: [record(drumShape)] });
  // the zero knob on top of the drum: a saddle pad, then a knurled cap with a pointer
  const F_KNOB = G.frameOf([KNOB.at[0], KNOB.at[1], cz], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const padTop = DIAL.r + 3;
  const pad = G.saddleOf(F_KNOB, KNOB.r + 1.5, (angle) => G.saddleStart(DIAL.r, KNOB.r + 1.5, angle), padTop, P);
  const kz = cz + padTop;
  const knob = S(pad, { tone: "mid" }) + S(k.cylinder(KNOB.at[0], KNOB.at[1], KNOB.r, kz, KNOB.h, P, 32, 0.5), { tone: "mid" }) +
    L(k.knurl(KNOB.at[0], KNOB.at[1], KNOB.r, kz, kz + KNOB.h, 30, P), { tone: "lo" }) +
    L(k.lineOnTop([KNOB.at[0] - 2.6, KNOB.at[1]], [KNOB.at[0] + 4.4, KNOB.at[1]], kz + KNOB.h, P), { tone: "hi", free: "end" });
  put("scale", [KNOB.at[0], KNOB.at[1], kz], `<g class="m-indigo">${knob}</g>`, {
    name: "stand.dial.knob",
    shapes: [
      record(A.disc(F_KNOB, DIAL.r - 6, padTop, KNOB.r + 1.5, { name: "stand.dial.knob.pad", seated: true, cut: drumShape })),
      record(A.cylinder(KNOB.at[0], KNOB.at[1], KNOB.r, kz, KNOB.h, { name: "stand.dial.knob" })),
    ],
  });
}

function dialFace() {
  const [cx, cy, cz] = DIAL.o;
  const ticks = [];
  for (let i = 0; i < 100; i++) {
    const a = (i / 100) * 2 * Math.PI;
    const major = i % 10 === 0;
    const half = i % 5 === 0;
    const r0 = major ? 53 : half ? 56.5 : 58.6;
    ticks.push({ d: `M${f2(Math.sin(a) * r0)} ${f2(-Math.cos(a) * r0)}L${f2(Math.sin(a) * 62)} ${f2(-Math.cos(a) * 62)}`, tone: i === 0 ? "hi" : major ? "mid" : "lo" });
  }
  const group = (tone) => ticks.filter((t) => t.tone === tone).map((t) => t.d).join("");
  const face =
    `<circle class="dial-face" r="${DIAL.face}"/>` +
    `<circle class="iso-line" data-tone="lo" r="62"/>` +
    `<circle class="iso-line" data-tone="faint" r="46"/>` +
    L(group("lo"), { tone: "lo" }) + L(group("mid"), { tone: "mid" }) + `<path class="iso-line dial-zero" data-tone="hi" d="${group("hi")}"/>` +
    `<text class="dial-unit" x="0" y="31" text-anchor="middle" dominant-baseline="central">克</text>`;
  put("scale", [cx, cy + FACE_S, cz], `<g class="m-sheet"><g transform="${DIAL_MATRIX}">${face}</g></g>`, {
    bias: 0.2,
    name: "stand.dial.face",
    shapes: [record(A.disc(F_DRUM, DIAL.front, FACE_S, DIAL.face, { name: "stand.dial.face" }))],
  });
}

const NEEDLE = `M-1.25 0L-0.32 -58.5L0 -60.5L0.32 -58.5L1.25 0L0.9 11L-0.9 11Z`;

function needleAndHub(grams) {
  const [cx, cy, cz] = DIAL.o;
  const s0 = FACE_S;
  const needle = `<g class="needle" data-needle="" transform="${NEEDLE_MATRIX} rotate(${f2(needleAngle(grams))})"><path class="needle-body" d="${NEEDLE}"/><circle class="needle-weight" cy="8.4" r="2.5"/></g>`;
  const hub = G.disc(s0 + 1.6, s0 + 5.2, 4.4, F_DRUM, P);
  const cap = at(G.pointOf(F_DRUM, s0 + 5.2, 0, 0));
  const svg = needle + `<g class="m-indigo">${S(hub, { tone: "mid" })}</g>` + D([cap], { size: 0.7, tone: "hi" });
  // the needle sweeps; record the disc it can occupy so the audit sees what is drawn
  put("scale", [cx, cy + s0 + 3, cz], svg, {
    bias: 0.3,
    name: "stand.dial.needle",
    shapes: [record(A.disc(F_DRUM, s0 + 1.2, s0 + 1.9, 61, { name: "stand.dial.needle" })), record(A.disc(F_DRUM, s0 + 1.9, s0 + 5.2, 4.4, { name: "stand.dial.hub" }))],
  });
}

function bezel() {
  const [cx, cy, cz] = DIAL.o;
  const meridian = [[DIAL.bezel, DIAL.face], [DIAL.front, DIAL.face], [DIAL.front, DIAL.bezelR], [DIAL.bezel - 1.2, DIAL.bezelR], [DIAL.bezel, DIAL.bezelR - 1.6], [DIAL.bezel, DIAL.face]];
  // hard knots only: smooth shading assumes an outer surface, and this meridian turns back along the bore
  const ring = G.lathe(meridian, F_DRUM, P, { hole: [DIAL.bezel, DIAL.face], smooth: false });
  // the bore of the bezel down to the face: seen from inside, so only its inward-facing facets are drawn
  const bore = G.lathe([[DIAL.bezel, DIAL.face], [FACE_S, DIAL.face]], F_DRUM, P, { fill: "facets", rims: "none", smooth: false });
  const screws = G.dotsOf(F_DRUM, DIAL.bezel, (DIAL.face + DIAL.bezelR) / 2 - 0.6, 3, P, { phase: Math.PI / 6, all: true });
  put("scale", [cx, cy + DIAL.bezel, cz], `<g class="m-indigo">${S(bore, { tone: "mid", crease: "none" })}${S(ring, { tone: "mid" })}${D(screws, { size: 0.6, tone: "mid" })}</g>`, {
    bias: 0.5,
    name: "stand.dial.bezel",
    shapes: [record(A.ring(F_DRUM, DIAL.front, DIAL.bezel, DIAL.face, DIAL.bezelR, { name: "stand.dial.bezel" }))],
  });
}

// ---- the footed plate (高脚盘) -------------------------------------------------------------------
function cakeStand() {
  const [x, y] = C;
  const UP = G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
  const [r0, r1, rr] = STAND.ring;
  put("cake", [x, y, r0 + 1], `<g class="m-plate">${S(k.cylinder(x, y, rr, r0, r1 - r0, P, 96, 0.6), { tone: "mid" })}</g>`, { name: "plate.foot", shapes: [record(A.cylinder(x, y, rr, r0, r1 - r0, { name: "plate.foot" }))] });
  // the foot rises as a dome into the stem: r = 14 + 56 (1 - t)^1.7
  const [d0, d1] = STAND.dome;
  const span = d1 - d0;
  const domeR = (s) => STAND.stemR + 56 * Math.pow(Math.max(0, 1 - (s - d0) / span), 1.7);
  const domeSlope = (s) => (-56 * 1.7 * Math.pow(Math.max(0, 1 - (s - d0) / span), 0.7)) / span;
  const dome = Array.from({ length: 9 }, (_, i) => d0 + (span * i) / 8).map((s) => [s, domeR(s), 1]);
  put("cake", [x, y, d0 + 4], `<g class="m-plate">${S(G.solidOf(dome, UP, P, { smooth: { slope: domeSlope, radius: domeR } }), { tone: "mid" })}</g>`, {
    name: "plate.dome",
    shapes: [record(A.solid(UP, dome, { radius: domeR, name: "plate.dome" }))],
  });
  const knop = [x, y, STAND.knop];
  const meet = Math.sqrt(STAND.knopR ** 2 - STAND.stemR ** 2);
  const knopShape = A.ball(knop, STAND.knopR, { name: "plate.knop" });
  const stem = (z0, z1, name) =>
    put("cake", [x, y, (z0 + z1) / 2], `<g class="m-plate">${S(k.cylinder(x, y, STAND.stemR, z0, z1 - z0, P, 48), { tone: "mid", crease: "none" })}</g>`, {
      name,
      shapes: [record(A.cylinder(x, y, STAND.stemR, z0, z1 - z0, { name, seated: true, cut: knopShape }))],
    });
  stem(d1, STAND.knop - meet, "plate.stem.low");
  put("cake", knop, `<g class="m-plate">${S(G.sphereOf(knop, STAND.knopR, P), { tone: "mid" })}</g>`, { name: "plate.knop", shapes: [record(knopShape)] });
  stem(STAND.knop + meet, STAND.flare[0], "plate.stem.high");
  // the flare opens under the plate: r = 14 + 48 t^2.2
  const [f0, f1] = STAND.flare;
  const fs = f1 - f0;
  const flareR = (s) => STAND.stemR + 48 * Math.pow(Math.max(0, (s - f0) / fs), 2.2);
  const flareSlope = (s) => (48 * 2.2 * Math.pow(Math.max(0, (s - f0) / fs), 1.2)) / fs;
  const flare = Array.from({ length: 9 }, (_, i) => f0 + (fs * i) / 8).map((s) => [s, flareR(s), 1]);
  put("cake", [x, y, f0 + 6], `<g class="m-plate">${S(G.solidOf(flare, UP, P, { smooth: { slope: flareSlope, radius: flareR } }), { tone: "mid" })}</g>`, {
    name: "plate.flare",
    shapes: [record(A.solid(UP, flare, { radius: flareR, name: "plate.flare" }))],
  });
  const [p0, p1, pr] = STAND.plate;
  const glaze = L(k.ring(x, y, pr - 4.5, p1, P, 160), { tone: "faint" });
  put("cake", [x, y, p0 + 1], `<g class="m-plate">${S(k.cylinder(x, y, pr, p0, p1 - p0, P, 120, 1), { tone: "mid", inner: L(k.sideArc(x, y, pr, p0 + 2.4, P, 96), { tone: "faint" }) })}${glaze}</g>`, {
    name: "plate.plate",
    shapes: [record(A.cylinder(x, y, pr, p0, p1 - p0, { name: "plate.plate" }))],
  });
}

// ---- the cake ---------------------------------------------------------------------------------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function sesame(z) {
  // seeds scattered on the top layer, none within 6 mm of the rim
  const random = rng(20261030);
  const seeds = [];
  const cell = 15.5;
  for (let gx = -150; gx <= 150; gx += cell)
    for (let gy = -150; gy <= 150; gy += cell) {
      const px = gx + (random() - 0.5) * cell * 0.9;
      const py = gy + (random() - 0.5) * cell * 0.9;
      if (Math.hypot(px, py) > CAKE_R - 7) continue;
      const a = random() * Math.PI;
      const pts = [];
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * 2 * Math.PI;
        const lx = Math.cos(t) * 1.7 * (1 - 0.18 * Math.cos(t));
        const ly = Math.sin(t) * 0.95;
        pts.push(at([C[0] + px + lx * Math.cos(a) - ly * Math.sin(a), C[1] + py + lx * Math.sin(a) + ly * Math.cos(a), z]));
      }
      seeds.push(k.pathOf(pts, true));
    }
  return `<path class="sesame" d="${seeds.join("")}"/>`;
}

function pores(z, seed) {
  // the inner layers are bare dough: a scatter of small air pockets, closed shapes, none near the rim
  const random = rng(7919 * (seed + 1));
  const shapes = [];
  for (let i = 0; i < 46; i++) {
    const r = Math.sqrt(random()) * (CAKE_R - 14);
    const t = random() * 2 * Math.PI;
    const [px, py] = [r * Math.cos(t), r * Math.sin(t)];
    const a = random() * Math.PI;
    const rx = 1.6 + random() * 2.4;
    const ry = rx * (0.45 + random() * 0.3);
    const pts = [];
    for (let j = 0; j < 10; j++) {
      const u = (j / 10) * 2 * Math.PI;
      const lx = Math.cos(u) * rx;
      const ly = Math.sin(u) * ry;
      pts.push(at([C[0] + px + lx * Math.cos(a) - ly * Math.sin(a), C[1] + py + lx * Math.sin(a) + ly * Math.cos(a), z]));
    }
    shapes.push(k.pathOf(pts, true));
  }
  return `<path class="pores" d="${shapes.join("")}"/>`;
}

function layers() {
  LAYERS.forEach((layer, index) => {
    const z = layerZ(index);
    const piece = SLOTS[index];
    const solid = k.cylinder(C[0], C[1], CAKE_R, z, LAYER_H, P, 120, 1.4);
    const extra = index === 0 ? sesame(z + LAYER_H) : pores(z + LAYER_H, index);
    put(piece, [C[0], C[1], z + LAYER_H / 2], `<g class="m-gold" data-layer="${index}">${S(solid, { tone: "hi", crease: "faint" })}${extra}</g>`, {
      name: `cake.layer${index}`,
      shapes: [record(A.cylinder(C[0], C[1], CAKE_R, z, LAYER_H, { name: `cake.layer${index}` }))],
    });
  });
}

// ---- picks, strings and tags --------------------------------------------------------------------
const columnsOf = {
  vision: ["格局", "要打开"],
  promotion: ["下一批", "就考虑你"],
  raise: ["等明年", "效益好了"],
  bonus: ["看全年", "考核"],
  honor: ["今年名额", "给你留着"],
  training: ["有合适的", "就让你去"],
  praise: ["这次", "干得不错"],
};

function glyphs(text, x, top, size, pitch, className) {
  return [...text].map((ch, i) => `<text class="${className}" x="${f2(x)}" y="${f2(top + pitch * i + pitch / 2)}" font-size="${size}">${ch}</text>`).join("");
}

const FRAME_TOP = 12.6;
const FRAME = { x0: -TAG.w / 2 + 2.6, x1: TAG.w / 2 - 2.6, y0: FRAME_TOP, y1: TAG.h - 2.6 };
const framePath = `M${FRAME.x0 + 1.2} ${FRAME.y0}H${FRAME.x1 - 1.2}Q${FRAME.x1} ${FRAME.y0} ${FRAME.x1} ${FRAME.y0 + 1.2}V${FRAME.y1 - 1.2}Q${FRAME.x1} ${FRAME.y1} ${FRAME.x1 - 1.2} ${FRAME.y1}H${FRAME.x0 + 1.2}Q${FRAME.x0} ${FRAME.y1} ${FRAME.x0} ${FRAME.y1 - 1.2}V${FRAME.y0 + 1.2}Q${FRAME.x0} ${FRAME.y0} ${FRAME.x0 + 1.2} ${FRAME.y0}Z`;
const GROMMET = 3.3;
const eyelet = `<circle class="tag-hole" cy="${TAG.hole}" r="${TAG.holeR}"/><circle class="iso-line" data-tone="mid" cy="${TAG.hole}" r="${GROMMET}"/><path class="iso-line tag-string" data-tone="mid" d="M0 0V${TAG.hole - GROMMET}"/>`;

function frontFace(layer) {
  const count = [...layer.name].length;
  const size = count <= 2 ? 14 : count === 3 ? 12.6 : 11.2;
  const pitch = size + (count <= 2 ? 2 : 1.2);
  const top = (FRAME.y0 + FRAME.y1) / 2 - (pitch * count) / 2;
  return `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}${glyphs(layer.name, 0, top, size, pitch, "tag-name")}`;
}

function backFace(layer) {
  const columns = columnsOf[layer.id];
  const size = 10.4;
  const pitch = 11.4;
  const xs = [6.2, -6.2];
  const rows = Math.max(...columns.map((text) => [...text].length));
  const top = layer.id === "praise" ? FRAME.y0 + 3.2 : (FRAME.y0 + FRAME.y1) / 2 - (pitch * rows) / 2;
  let svg = `<path class="iso-line" data-tone="lo" d="${framePath}"/>${eyelet}`;
  columns.forEach((text, i) => (svg += glyphs(text, xs[i], top, size, pitch, "tag-quote")));
  if (layer.id === "praise") {
    // the only real layer: a cinnabar seal under the short right-hand column
    const sx = xs[0];
    const sy = top + pitch * 2 + 4.2;
    const w = 9.2;
    const h = 22.4;
    svg += `<g class="seal" transform="rotate(-6 ${f2(sx)} ${f2(sy + h / 2)})"><rect x="${f2(sx - w / 2)}" y="${f2(sy)}" width="${w}" height="${h}" rx="1.1"/>${glyphs("已兑现", sx, sy + 1.6, 6.1, 6.4, "seal-text")}</g>`;
  }
  return svg;
}

function tags() {
  LAYERS.forEach((layer, index) => {
    const piece = SLOTS[index];
    const angle = angleOf(index);
    const z = pickZ(index);
    // the bamboo pick, pushed into the layer's edge along the radius
    const F_PICK = G.frameOf([C[0], C[1], z], [Math.cos(angle), Math.sin(angle), 0], [-Math.sin(angle), Math.cos(angle), 0], [0, 0, 1]);
    const pick = G.disc(PICK.from, PICK.to, PICK.r, F_PICK, P, { steps: 24 });
    const knot = G.pointOf(F_PICK, R_T, PICK.r, -Math.PI / 2);
    const tip = G.pointOf(F_PICK, PICK.to, 0, 0);
    put(piece, along(index, (PICK.from + PICK.to) / 2, z), `<g class="m-wood">${S(pick, { tone: "hi", crease: "faint" })}</g>`, {
      name: `tag.pick${index}`,
      shapes: [record(A.disc(F_PICK, PICK.from, PICK.to, PICK.r, { name: `tag.pick${index}` }))],
    });
    // the string: from the knot under the pick down to the tag's top edge
    const top = tagTop(index);
    const knotAt = [top[0], top[1], z - PICK.r];
    R.route(`tag.string${index}`, [knotAt, top], 0.35, { piece, move: MOVES[piece], rims: [0.35, 0.35] });
    put(piece, [top[0], top[1], (knotAt[2] + top[2]) / 2], `<path class="iso-line tag-string" data-tone="mid" d="${k.pathOf([at(knotAt), at(top)])}"/>${D([at(knotAt)], { size: 0.75, tone: "hi" })}`, {
      name: `tag.string${index}`,
      bias: -0.1,
      // the route above is what the clearance checks see; this copy only gives the drawn item its footprint
      shapes: [A.tube([knotAt, top], 0.35, { name: `tag.string${index}`, owner: `tag.string${index}` })],
    });
    // the tag itself, front toward the viewer
    const F = tagFrame(top, 0, AZ);
    const solid = tagSolid(F, P);
    const faces = solid.faces
      .map((face) => `<path class="tag-face" data-face="${face.side}" d="${face.d}"/>`)
      .join("");
    const content = [1, -1]
      .map((side) => `<g class="tag-side" data-side="${side}" transform="${tagFace(F, side, P)}"${side === 1 ? "" : ' style="display:none"'}>${side === 1 ? frontFace(layer) : backFace(layer)}</g>`)
      .join("");
    const shades = solid.shades.map((d, shade) => (d ? `<path class="iso-shade" data-shade="${shade}" d="${d}"/>` : `<path class="iso-shade" data-shade="${shade}" d=""/>`)).join("");
    const svg =
      `<g class="m-wood tag" data-tag="${index}"><g class="iso-solid">` +
      `<path class="iso-fill" d="${solid.fill}"/>${shades}<path class="iso-top" d="${solid.top}"/>${faces}` +
      `<path class="iso-line iso-crease" data-tone="faint" d="${solid.crease}"/><path class="iso-line iso-edge" data-tone="hi" d="${solid.outline}"/></g>${content}</g>`;
    const tagShape = A.prism({ o: top, a: F.n, u: F.u, v: [0, 0, 1] }, TAG_RING, -TAG.t / 2, TAG.t / 2, { name: `tag.tag${index}` });
    put(piece, [top[0], top[1], top[2] - TAG.h / 2], svg, { name: `tag.tag${index}`, shapes: [record(tagShape)] });
  });
}

// ---- assemble ---------------------------------------------------------------------------------
base();
labelPlate();
level();
tareKnob();
endVents();
pan();
dialTower();
dialFace();
needleAndHub(ACTUAL_TOTAL);
bezel();
cakeStand();
layers();
tags();

// --quick keeps the first-guess keys (centre depth plus bias) for fast drafts; every real build settles them
const QUICK = process.argv.includes("--quick") || process.argv.includes("--chars");
const SETTLE = JSON.parse(process.env.SETTLE || "{}");
const started = Date.now();
// Layers are coaxial discs of one radius that only ever move straight up and never close the gap below
// them, so a higher layer always paints over a lower one: their pairs are left out of the ray-cast
// (they cost most of the solver's time) and their keys keep the stack order on their own.
const stacked = (a, b) => A.sameRun(a, b) || (a.name.startsWith("cake.layer") && b.name.startsWith("cake.layer"));
if (!QUICK) A.settle(R, P, { skip: stacked, ...SETTLE });
if (!QUICK) console.log(`settled in ${((Date.now() - started) / 1000).toFixed(1)} s`);
const ordered = R.items.slice().sort((a, b) => a.key - b.key);
const body = ordered
  .map((item, index) => {
    const [mx, my, mz] = item.move;
    return `<g class="it" data-piece="${item.piece}" data-name="${item.name}" data-k="${item.key.toFixed(2)}" data-m="${mx},${my},${mz}" data-i="${index}">${item.svg}</g>`;
  })
  .join("");

const LABEL =
  "一张直径 30 厘米、七层的芝麻千层大饼，放在函套青的高脚圆盘里，圆盘放在一台带圆表盘的老式台秤上。每层边缘插着竹签，挂一块小木牌，正面写名字：愿景、升职、加薪、年终奖、评优、培训机会、表扬；翻过来是领导的原话。标称总重 1000 克，台秤指针只指到 65 克。";

const closedReadout = readoutParts(NONE_LIFTED);
const openReadout = readoutParts(ALL_LIFTED);
const readoutHtml = (parts) => `<span class="ro-scope">${parts.scope}：</span><span class="ro-nums">${numbersOf(parts)}</span>`;

const STAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${LABEL}">${body}</svg>`;

// ---- styles -----------------------------------------------------------------------------------
const FONT_CSS_URL = "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont/style.css";
const manifestPath = join(HERE, "fonts", "manifest.json");
const embedded = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
      .map((entry) => `@font-face{font-family:"Dabing WenKai";font-style:normal;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${readFileSync(join(HERE, "fonts", entry.file)).toString("base64")}) format("woff2");unicode-range:${entry.range}}`)
      .join("")
  : "";

const TOKENS = `
.iso{--paper:#ECEAE1;--sheet:#F8F7F2;--ink:#24231F;--ink-2:#4E4C45;--ink-3:#6B685F;--line:#D6D2C4;--line-2:#E4E0D4;--indigo:#1F3A4D;--gold:#C9A86A;--cinnabar:#B5382A;--brass:#85682F;
  --kai:"LXGW WenKai","Dabing WenKai","KaiTi","STKaiti",serif}
.iso[data-theme="light"]{
  --anatomy-page:var(--paper);--anatomy-card:var(--sheet);--anatomy-text:var(--ink-2);--anatomy-strong:var(--ink);--anatomy-muted:var(--ink-3);
  --anatomy-paper:var(--sheet);--anatomy-face:#FCFBF8;--anatomy-top:#FCFBF8;
  --anatomy-shade-0:#E2DED2;--anatomy-shade-1:#EAE7DD;--anatomy-shade-2:#F0EEE6;--anatomy-shade-3:#F5F3ED;
  --anatomy-lit-top:#FCFBF8;--anatomy-lit-shade:#F0EEE6;
  --anatomy-hi:var(--ink);--anatomy-mid:var(--ink-3);--anatomy-lo:#A79F88;--anatomy-faint:var(--line);--anatomy-lit:var(--ink);
  --anatomy-halo:#6E6656;--anatomy-halo-opacity:.34;--anatomy-dot:var(--ink)}
.m-gold{--anatomy-paper:#C9A86A;--anatomy-top:#E2CB98;--anatomy-shade-3:#D6BB83;--anatomy-shade-2:#C9A86A;--anatomy-shade-1:#B7955A;--anatomy-shade-0:#B7955A;
  --anatomy-faint:#B09056;--anatomy-lo:#957747;--anatomy-mid:#6D5733;--anatomy-dot:#5A4626}
.m-indigo{--anatomy-paper:#3B576C;--anatomy-top:#5D798D;--anatomy-shade-3:#4B677B;--anatomy-shade-2:#3B576C;--anatomy-shade-1:#2D485C;--anatomy-shade-0:#1F3A4D;
  --anatomy-faint:#3A5367;--anatomy-lo:#2A3F4F;--anatomy-mid:#1C2C38;--anatomy-dot:var(--sheet)}
.m-plate{--anatomy-paper:#2E4A5E;--anatomy-top:#4F6C81;--anatomy-shade-3:#3F5B70;--anatomy-shade-2:#304C61;--anatomy-shade-1:#264155;--anatomy-shade-0:#1F3A4D;
  --anatomy-faint:#5F7A8D;--anatomy-lo:#22394A;--anatomy-mid:#182A37;--anatomy-dot:var(--sheet)}
.m-wood{--anatomy-paper:#F2ECDF;--anatomy-top:#FBF8F1;--anatomy-shade-3:#F3EEE3;--anatomy-shade-2:#EAE2D2;--anatomy-shade-1:#E0D6C3;--anatomy-shade-0:#D3C7B0;
  --anatomy-faint:#D2C6AF;--anatomy-lo:#B3A68C;--anatomy-mid:#7B7160;--anatomy-dot:var(--ink);
  --face:#F5F0E5;--face-lit:#FCFAF5;--face-dark:#DDD3C0}
.m-sheet{--anatomy-paper:var(--sheet);--anatomy-top:#FCFBF8;--anatomy-shade-3:#F4F2EB;--anatomy-shade-2:#EDEAE1;--anatomy-shade-1:#E5E1D6;--anatomy-shade-0:#DBD6C9;
  --anatomy-faint:var(--line);--anatomy-lo:#A79F88;--anatomy-mid:var(--ink-3)}
.m-glass{--anatomy-paper:#E8ECEA;--anatomy-top:#EEF1EF;--anatomy-shade-2:#E3E8E6;--anatomy-faint:#B9C2C2;--anatomy-lo:#7F8F93}
.dial-face{fill:var(--sheet);stroke:none}
.dial-zero{stroke-width:1.1}
.dial-unit{fill:var(--ink-3);font-family:var(--kai);font-size:7.4px}
.needle-body,.needle-weight{fill:var(--ink);stroke:var(--ink);stroke-width:.3}
.sesame{fill:#F7EFD8;stroke:#7A6033;stroke-width:.3;stroke-opacity:.55}
.pores{fill:#D9BF8A;stroke:#A9884F;stroke-width:.3;stroke-opacity:.5}
.tag-face{fill:var(--face);stroke:none}
.tag-hole{fill:#A99B80}
.tag-name,.tag-quote,.seal-text{font-family:var(--kai);text-anchor:middle;dominant-baseline:central}
.tag-name{fill:var(--ink)}
.tag-quote{fill:var(--ink)}
.seal rect{fill:var(--cinnabar)}
.seal-text{fill:var(--sheet)}
`;

const PAGE_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:15px/1.7 var(--kai);-webkit-font-smoothing:antialiased}
.iso-page{width:min(720px,100% - 32px);margin:56px auto 88px}
.iso-figure{margin:0}
.iso-plate{padding:58px 24px 56px;box-shadow:0 0 0 1px var(--line)}
.iso-plate-corner{font-family:var(--kai);font-size:13px;letter-spacing:.06em;color:var(--ink-3)}
.iso-plate-corner[data-corner="fig"]{color:var(--ink-2)}
.iso-plate-corner[data-corner="title"]{color:var(--ink);font-size:15px;letter-spacing:.18em;text-transform:none;top:-2px}
.iso-plate-corner[data-corner="hint"]{letter-spacing:.12em;text-transform:none}
.iso-plate-corner[data-corner="readout"]{color:var(--ink);font-variant-numeric:tabular-nums}
.iso-stage{position:relative;outline:none;touch-action:pan-y;cursor:pointer;border-radius:2px}
.iso-stage:focus-visible{outline:1px solid var(--brass);outline-offset:6px}
.iso-legend{margin-top:14px;color:var(--ink-2);font-size:14px;line-height:1.75;gap:10px}
.iso-key{color:var(--ink-2)}
.iso-swatch path{stroke:var(--ink)}
.iso-swatch[data-mark="raised"] path{stroke:#B7955A}
.iso-swatch[data-mark="flat"] path{stroke:var(--indigo)}
.iso-swatch[data-mark="dim"] path{stroke:#B3A68C}
.weigh{width:100%;border-collapse:collapse;font-size:13.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.weigh th,.weigh td{padding:4px 6px;border-bottom:1px solid var(--line-2);text-align:left;font-weight:400}
.weigh th{color:var(--ink-3);font-size:12.5px;letter-spacing:.06em}
.weigh td.n,.weigh th.n{text-align:right;white-space:nowrap}
.weigh tr.real td{color:var(--ink)}
.weigh tfoot td{border-bottom:none;color:var(--ink)}
.weigh .q2{display:none}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:560px){
  .iso-plate{padding:50px 10px 74px}
  .iso-plate-corner{font-size:12px}
  .iso-plate-corner[data-corner="readout"]{font-size:11.5px;letter-spacing:.02em}
  .iso-plate{padding-bottom:92px}
  .iso-plate-corner[data-corner="hint"]{bottom:40px}
  .iso-plate-corner[data-corner="readout"]{line-height:1.4}
  .ro-scope{display:block;text-align:right}
  .weigh .q{display:none}
  .weigh .q2{display:block;color:var(--ink-3);font-size:12.5px;line-height:1.5}
}
`;

// ---- the legend under the card ------------------------------------------------------------------
const rows = LAYERS.map(
  (layer, index) =>
    `<tr${layer.actual === layer.nominal ? ' class="real"' : ""}><td>${index + 1}</td><td>${layer.name}<span class="q2">“${layer.quote}”</span></td><td class="q">“${layer.quote}”</td><td class="n">${layer.nominal} 克</td><td class="n">${layer.actual} 克</td></tr>`,
).join("");
const table = `<table class="weigh"><thead><tr><th>层</th><th>名字</th><th class="q">木牌背面</th><th class="n">标称</th><th class="n">实称</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td></td><td>合计</td><td class="q"></td><td class="n">${NOMINAL_TOTAL} 克</td><td class="n">${ACTUAL_TOTAL} 克</td></tr></tfoot></table>`;
const swatch = (mark) => {
  const bodyPath = mark === "flat" ? "M2 6.5 8 3.5 14 6.5 8 9.5Z" : "M2 4.5 8 1.5 14 4.5 14 6 8 9 2 6Z";
  const crease = mark === "flat" || mark === "lit" ? "" : '<path class="iso-swatch-crease" d="M2 4.5 8 7.5 14 4.5"/>';
  return mark === "lit" ? `<svg class="iso-swatch" data-mark="lit" viewBox="0 0 16 10" aria-hidden="true"><path d="M1.5 5h13"/></svg>` : `<svg class="iso-swatch" data-mark="${mark}" viewBox="0 0 16 10" aria-hidden="true"><path d="${bodyPath}"/>${crease}</svg>`;
};
const keys = [
  ["lit", "指针：秤上饼的实际分量，满圈 1000 克"],
  ["raised", "七层饼：标称 1000 克"],
  ["flat", "高脚圆盘和台秤（已去皮）"],
  ["dim", "木牌：正面写名字，背面是原话"],
];
const CAPTION = `领导说这张饼有 ${NOMINAL_TOTAL} 克，台秤只称出 ${ACTUAL_TOTAL} 克，兑现率 ${((ACTUAL_TOTAL / NOMINAL_TOTAL) * 100).toFixed(1)}%。把饼从上往下一层层抬起来，每抬走一层，指针就退回这一层的实际分量：愿景只有面上 2 克芝麻，升职、加薪、评优一克也没有，年终奖 8 克，培训机会 5 克，前六层合起来不过 15 克。最后抬起饼底那层表扬，指针一下退回 50 克，回到零：标称 50 克，实称 50 克，是唯一兑现的一层。`;
const legend = `<figcaption class="iso-legend"><span class="iso-keys">${keys.map(([mark, label]) => `<span class="iso-key">${swatch(mark)}${label}</span>`).join("")}</span>${table}<span class="iso-caption">${CAPTION}</span></figcaption>`;

const plate = `<figure class="iso-figure dabing"><div class="iso-plate"><div class="iso-plate-corners" aria-hidden="true"><span class="iso-plate-corner" data-corner="fig">图 1</span><span class="iso-plate-corner" data-corner="title">大饼解剖图</span><span class="iso-plate-corner" data-corner="hint">悬停，一层层看</span><span class="iso-plate-corner" data-corner="readout" data-readout>${readoutHtml(closedReadout)}</span></div><div class="iso-stage" tabindex="0" role="button" aria-label="大饼解剖图。按空格或回车，把饼从上到下一层层抬起来；再按一次合上。" aria-describedby="dabing-state">${STAGE_SVG}</div><p class="sr" id="dabing-state" aria-live="polite"></p></div>${legend}</figure>`;

// ---- the page's live code -----------------------------------------------------------------------
const DATA = {
  P,
  AZ,
  W: WIDTH,
  H: HEIGHT,
  slots: SLOTS,
  spring: SPRING,
  lifts: LAYERS.map((_, index) => liftOf(index)),
  tops: LAYERS.map((_, index) => tagTop(index).map(f2)),
  needle: NEEDLE_MATRIX,
  full: DIAL_FULL,
  EX: k.axisVector(P, [1, 0, 0]),
  EY: k.axisVector(P, [0, 1, 0]),
  EZ: k.axisVector(P, [0, 0, 1]),
  V: R.V,
};
const inline = (file) => readFileSync(join(HERE, file), "utf8").replace(/^import .*$/gm, "").replace(/^export /gm, "");
const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA));
const SCRIPT = [kitScript(), inline("model.mjs"), inline("tag.mjs"), LIVE].join("\n");

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>大饼解剖图</title><meta name="description" content="画大饼：领导许诺的大饼，拆开、称一称，看看里面到底有几层是实的。"><link rel="stylesheet" href="${FONT_CSS_URL}"><style>${embedded}${k.ISO_CSS}${TOKENS}${PAGE_CSS}</style></head><body class="iso" data-theme="light"><main class="iso-page">${plate}</main><script type="module">${SCRIPT.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;

// ---- the standalone SVG: the figure at rest, styles and font inside ------------------------------
const standalone = `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso" data-theme="light" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${LABEL}"><title>大饼解剖图</title><style>@import url("${FONT_CSS_URL}");${embedded}${k.ISO_CSS}${TOKENS}.iso-svg{background:var(--sheet)}</style><rect width="${WIDTH}" height="${HEIGHT}" fill="#F8F7F2"/>${body}</svg>`;

if (process.argv.includes("--chars")) {
  const readouts = LAYERS.map((_, count) => readoutOf(readoutParts(LAYERS.map((__, index) => index < count + 1))));
  const texts = [LABEL, CAPTION, table, plate, readoutOf(closedReadout), readoutOf(openReadout), ...readouts, ...LAYERS.flatMap((layer) => [layer.name, layer.quote]), "已兑现克", "0123456789.%·—：，。“”（）"];
  const chars = [...new Set(texts.join("").replace(/<[^>]*>/g, "").replace(/\s/g, ""))].sort().join("");
  writeFileSync(join(HERE, "fonts", "chars.txt"), chars + "\n");
  console.log(`chars: ${chars.length}`);
} else {
  writeFileSync(join(HERE, "dabing.html"), html);
  writeFileSync(join(HERE, "dabing.svg"), standalone);
  console.log(`wrote dabing.html (${(html.length / 1024).toFixed(1)} KB) and dabing.svg (${(standalone.length / 1024).toFixed(1)} KB) · ${R.items.length} items · scale ${KS.toFixed(3)} px/mm`);
}

A.auditOrExit(R, P, {});
