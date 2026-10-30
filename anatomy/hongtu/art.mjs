// What is drawn on the six tracing sheets, in each sheet's own flat coordinates: u to the right,
// v down the board toward the front edge, millimetres from the sheet's back-left corner.
// Every stroke is inked or left in pencil. A sheet's clarity is its inked length over the length
// of all its strokes; build.mjs checks that against the clarity in model.mjs.

export const SHEET = { w: 520, h: 540 };

const f1 = (value) => {
  const text = (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, "");
  return text === "-0" ? "0" : text;
};
export const dOf = (points, closed = false) => points.map(([u, v], index) => `${index ? "L" : "M"}${f1(u)} ${f1(v)}`).join("") + (closed ? "Z" : "");

const lengthOf = (points, closed = false) => {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
  if (closed && points.length > 2) total += Math.hypot(points[0][0] - points[points.length - 1][0], points[0][1] - points[points.length - 1][1]);
  return total;
};

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const on = (a, b, u) => lerp(a, b, (u - a[0]) / (b[0] - a[0]));

function ellipse(cx, cy, rx, ry, turn = 0, count = 48, from = 0, to = Math.PI * 2) {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const closed = Math.abs(to - from - Math.PI * 2) < 1e-9;
  const steps = closed ? count : Math.max(2, Math.round((count * (to - from)) / (Math.PI * 2)));
  return Array.from({ length: closed ? count : steps + 1 }, (_, index) => {
    const a = from + ((to - from) * index) / steps;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    return [cx + x * c - y * s, cy + x * s + y * c];
  });
}

// a polyline with every inner corner rounded by an arc of radius r (clamped to the legs)
function rounded(points, r, per = 8) {
  const out = [points[0]];
  for (let index = 1; index < points.length - 1; index++) {
    const [p, q, n] = [points[index - 1], points[index], points[index + 1]];
    const a = [p[0] - q[0], p[1] - q[1]];
    const b = [n[0] - q[0], n[1] - q[1]];
    const la = Math.hypot(...a);
    const lb = Math.hypot(...b);
    const ua = [a[0] / la, a[1] / la];
    const ub = [b[0] / lb, b[1] / lb];
    const half = Math.acos(Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1]))) / 2;
    const cut = Math.min(r / Math.tan(half), la * 0.48, lb * 0.48);
    const radius = cut * Math.tan(half);
    const start = [q[0] + ua[0] * cut, q[1] + ua[1] * cut];
    const end = [q[0] + ub[0] * cut, q[1] + ub[1] * cut];
    const bis = [ua[0] + ub[0], ua[1] + ub[1]];
    const lbis = Math.hypot(...bis) || 1;
    const centre = [q[0] + (bis[0] / lbis) * (radius / Math.sin(half)), q[1] + (bis[1] / lbis) * (radius / Math.sin(half))];
    let a0 = Math.atan2(start[1] - centre[1], start[0] - centre[0]);
    let a1 = Math.atan2(end[1] - centre[1], end[0] - centre[0]);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    for (let step = 0; step <= per; step++) {
      const angle = a0 + (sweep * step) / per;
      out.push([centre[0] + radius * Math.cos(angle), centre[1] + radius * Math.sin(angle)]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// the piece of a polyline between two arc lengths
function piece(points, from, to) {
  const out = [];
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const s0 = walked;
    const s1 = walked + length;
    if (s1 >= from && s0 <= to && length > 0) {
      if (!out.length) out.push(lerp(a, b, Math.max(0, (from - s0) / length)));
      if (s1 <= to) out.push(b);
      else {
        out.push(lerp(a, b, (to - s0) / length));
        break;
      }
    }
    walked = s1;
  }
  return out;
}

function pointAt(points, at) {
  let walked = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (walked + length >= at) return lerp(a, b, (at - walked) / (length || 1));
    walked += length;
  }
  return points[points.length - 1];
}

// ---- 1 愿景: the far mountains, every line inked ------------------------------------------------
const A = [150, 142];
const B = [330, 84];
const C = [452, 146];
const RIDGE = [[14, 254], [58, 222], [86, 230], A, [196, 196], [226, 186], [258, 204], B, [378, 150], [404, 172], C, [482, 192], [508, 254]];
export const SUMMIT = B;

function vision() {
  const ink = [{ points: RIDGE }];
  // far ridges seen over the two saddles: each starts and ends on the near ridge
  ink.push({ points: [on(A, [196, 196], 172), [232, 138], on([258, 204], B, 276)] });
  ink.push({ points: [on(B, [378, 150], 362), [402, 118], on([404, 172], C, 426)] });
  // snow lines just under the three peaks, ending on both slopes
  const snow = (peak, left, right, tl, tr, teeth) => {
    const a = lerp(peak, left, tl);
    const b = lerp(peak, right, tr);
    const points = [a];
    for (let index = 1; index < teeth * 2; index++) {
      const t = index / (teeth * 2);
      const base = lerp(a, b, t);
      points.push([base[0], base[1] + (index % 2 ? 7 : -1)]);
    }
    points.push(b);
    return { points };
  };
  ink.push(snow(B, [258, 204], [378, 150], 0.27, 0.42, 3));
  ink.push(snow(A, [86, 230], [196, 196], 0.3, 0.36, 2));
  ink.push(snow(C, [404, 172], [482, 192], 0.42, 0.34, 2));
  // hatching on the shaded right-hand faces, each stroke hung from the ridge
  const hatch = (from, to, count, length) => {
    for (let index = 0; index < count; index++) {
      const t = 0.22 + (0.62 * index) / Math.max(1, count - 1);
      const start = lerp(from, to, t);
      const reach = length * (0.75 + 0.25 * Math.sin(index * 1.7));
      ink.push({ points: [start, [start[0] - reach * 0.42, start[1] + reach * 0.9]] });
    }
  };
  hatch(B, [378, 150], 6, 22);
  hatch(A, [196, 196], 4, 18);
  hatch(C, [482, 192], 3, 16);
  return { ink, pencil: [] };
}

// ---- 2 目标: a flag on the main peak; the cloth is inked, the foot of the pole is not ---------------
function goal() {
  const top = 22;
  const wave = (v) => Array.from({ length: 13 }, (_, index) => [B[0] + index * 4, v + Math.sin((index / 12) * Math.PI * 2) * 2.6]);
  const cloth = [...wave(top), ...wave(top + 26).reverse()];
  // the outline leaves the pole at the top and comes back to it at the bottom
  const outline = [[B[0], top], ...cloth.slice(1, -1), [B[0], top + 26]];
  // two chevrons pointing up: twice as high
  const chevron = (v) => [[B[0] + 16, v + 5], [B[0] + 24, v - 2], [B[0] + 32, v + 5]];
  const strokes = [{ points: outline }, { points: chevron(top + 10) }, { points: chevron(top + 18) }];
  const cloth_length = strokes.reduce((total, stroke) => total + lengthOf(stroke.points), 0);
  const pole = B[1] - top;
  // clarity 80%: the pencil share of the whole flag is the foot of the pole
  const pencil = 0.2 * (cloth_length + pole);
  const split = B[1] - pencil;
  return {
    ink: [...strokes, { points: [[B[0], top], [B[0], split]] }],
    pencil: [{ points: [[B[0], split], B] }],
  };
}

// ---- 3 路线图: the switchback road; only its first half is drawn, and that as dashes --------------
const ROAD = rounded(
  [[266, 486], [372, 448], [262, 410], [376, 370], [284, 330], [370, 292], [298, 252], [358, 214], [308, 176], [344, 140], [322, 112], [B[0], B[1] + 4]],
  15,
);
export const ROAD_LENGTH = lengthOf(ROAD);
export const ROAD_HALF = pointAt(ROAD, ROAD_LENGTH / 2);

function route() {
  const half = ROAD_LENGTH / 2;
  const count = Math.round(half / 10.5);
  const period = half / count;
  const dash = period * 0.4;
  const ink = [];
  for (let index = 0; index < count; index++) ink.push({ points: piece(ROAD, index * period, index * period + dash) });
  // the first half counts in full; only its dashes carry ink
  return { ink, pencil: [{ points: piece(ROAD, half, ROAD_LENGTH), dotted: true }], gaps: half - count * dash };
}

// ---- 4 里程碑: five pennants, all crowded round the middle of the road ------------------------------
function milestones() {
  const at = [-34, -17, 0, 15, 30].map((shift) => ROAD_LENGTH / 2 + shift);
  const ink = [];
  const pencil = [];
  at.forEach((length, index) => {
    const [u, v] = pointAt(ROAD, length);
    const pole = [[u, v], [u, v - 14]];
    const reach = Math.sqrt(7 * 7 - 3 * 3);
    const flag = [[u, v - 14], [u + reach, v - 11], [u, v - 8]];
    // pole and pennant are each 14 mm of line, so one whole flag and one bare pole are 30%
    if (index === 2) ink.push({ points: pole }, { points: flag });
    else if (index === 0) ink.push({ points: pole }), pencil.push({ points: flag });
    else pencil.push({ points: pole }, { points: flag });
  });
  return { ink, pencil };
}

// ---- 5 资源: three people, a purse and a stack of coins, outlines in pencil only -----------------
function resources() {
  const pencil = [];
  [52, 92, 132].forEach((u, index) => {
    const v = 356 + (index === 1 ? -6 : 0);
    pencil.push({ points: ellipse(u, v, 8, 8, 0, 32), closed: true });
    pencil.push({ points: [...ellipse(u, v + 30, 16, 16, 0, 24, Math.PI, Math.PI * 2), [u + 16, v + 30], [u - 16, v + 30]], closed: true });
  });
  // the purse: a round body, a neck and a tie
  const purse = [[60, 418], ...ellipse(72, 446, 22, 20, 0, 40, -Math.PI * 0.62, Math.PI * 1.62).slice(1, -1), [84, 418]];
  pencil.push({ points: [...purse, [78, 424], [66, 424]], closed: true });
  pencil.push({ points: [[64, 414], [72, 420], [80, 414]] });
  // coins: three lying discs stacked
  [0, 1, 2].forEach((level) => pencil.push({ points: ellipse(148, 462 - level * 7, 20, 7, 0, 36), closed: true }));
  return { ink: [], pencil };
}

// ---- 6 时间表: a scale along the foot of the sheet, its far end circled again and again ------------
export const RULER = { u0: 34, u1: 470, v0: 494, v1: 508, months: 36 };
export const DEADLINE = [RULER.u1, (RULER.v0 + RULER.v1) / 2];

function timeline() {
  const { u0, u1, v0, v1, months } = RULER;
  const ink = [{ points: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], closed: true }];
  for (let month = 1; month < months; month++) {
    const u = u0 + ((u1 - u0) * month) / months;
    const reach = month % 12 === 0 ? 10 : month % 3 === 0 ? 6.5 : 4;
    ink.push({ points: [[u, v0], [u, v0 + reach]] });
  }
  // three pen loops round the end, each a little off the last
  const [cu, cv] = DEADLINE;
  ink.push({ points: ellipse(cu + 1, cv, 21, 15, -0.12, 56), closed: true, heavy: true });
  ink.push({ points: ellipse(cu - 1, cv + 1, 23, 13.5, 0.08, 56), closed: true, heavy: true });
  ink.push({ points: ellipse(cu, cv - 1, 19.5, 16.5, 0.22, 56), closed: true, heavy: true });
  return { ink, pencil: [] };
}

// the one red mark in the figure: a rubber stamp on the timeline sheet, just above the ruler's end
export const STAMP = { u: 418, v: 466, w: 70, h: 24, turn: -7 };

const DRAWERS = [vision, goal, route, milestones, resources, timeline];

export function artOf(index) {
  return DRAWERS[index]();
}

export function clarityOf(index) {
  const { ink, pencil, gaps = 0 } = artOf(index);
  const inked = ink.reduce((total, stroke) => total + lengthOf(stroke.points, stroke.closed), 0);
  const drawn = pencil.reduce((total, stroke) => total + lengthOf(stroke.points, stroke.closed), 0);
  return (inked / (inked + gaps + drawn)) * 100;
}
