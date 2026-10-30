// The five paper-cut scenes, the arches' printing and the cover's two faces.
// Outlines are in the board frame (u across, v up, millimetres). A scene's art is printed on its card,
// drawn in the card's face plane with x = u and y = -v, so it lands there through the build's matrix.
// Seen from the front right, each act stands a step further back and shows a step higher through the
// arches in front of it, so the scenes are laid out to clear each other: the rostrum low in front, the
// cabinet to the left, the mirror to the right, the notice board in the middle, the cards at the top.
import { ACTS } from "./model.mjs";

export const GROUND = 84; // the stage floor line on every ground row
const STRIP = { u0: -216, u1: 174, v0: 24 };
export const MID = -21; // the middle of the arch's opening
const r1 = (value) => Math.round(value * 10) / 10;
const pt = ([u, v]) => `${r1(u)} ${r1(-v)}`;
const line = (points) => `M${points.map(pt).join("L")}`;
const poly = (points) => `${line(points)}Z`;
const at = (x, v) => [MID + x, v];
const mirrorX = (points) => points.map(([x, v]) => [-x, v]).reverse();
// the ground row's outline: the strip, then the scene's skyline from right to left
const ground = (skyline) => [[STRIP.u0, STRIP.v0], [STRIP.u1, STRIP.v0], [STRIP.u1, GROUND], ...skyline, [STRIP.u0, GROUND]];
// a ring of n points on an ellipse, for rounded ends
const arc = (cx, cv, rx, rv, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, index) => {
  const a = a0 + ((a1 - a0) * index) / n;
  return [cx + rx * Math.cos(a), cv + rv * Math.sin(a)];
});
const P = (d, cls) => `<path class="${cls}" d="${d}"/>`;
const C = (u, v, r, cls) => `<circle class="${cls}" cx="${r1(u)}" cy="${r1(-v)}" r="${r}"/>`;
// the riser along the bottom of every ground row: the stage's front edge, panelled
function riser(panels = 9) {
  const top = GROUND - 8;
  const bottom = STRIP.v0 + 8;
  const width = (STRIP.u1 - STRIP.u0) / panels;
  let d = line([[STRIP.u0, GROUND], [STRIP.u1, GROUND]]) + line([[STRIP.u0, top], [STRIP.u1, top]]) + line([[STRIP.u0, bottom], [STRIP.u1, bottom]]);
  for (let index = 1; index < panels; index++) d += line([[STRIP.u0 + width * index, bottom], [STRIP.u0 + width * index, top]]);
  return P(d, "art-line");
}

// ---- 1 开场: a rostrum under a tablecloth, a row of microphones and one lidded tea bowl ---------------------
const TABLE = { half: 96, top: GROUND + 76, flare: 6 };
const MICS = [-70, -46, -24, 24, 46, 70];
function micSkyline(x) {
  const t = TABLE.top;
  return [at(x + 7, t), at(x + 4, t + 5), at(x + 1.3, t + 5), at(x + 1.3, t + 38), at(x + 4, t + 41), at(x + 4, t + 53), ...arc(MID + x, t + 53, 4, 3.2, 0, Math.PI, 6).slice(1, -1), at(x - 4, t + 53), at(x - 4, t + 41), at(x - 1.3, t + 38), at(x - 1.3, t + 5), at(x - 4, t + 5), at(x - 7, t)];
}
function bowlSkyline(x) {
  const t = TABLE.top;
  return [at(x + 16, t), at(x + 16, t + 3), at(x + 8, t + 3), at(x + 13, t + 16), at(x + 14, t + 17), at(x + 11, t + 21), at(x + 6, t + 23), at(x + 3, t + 23), at(x + 3, t + 27), at(x + 2, t + 28.5), at(x - 2, t + 28.5), at(x - 3, t + 27), at(x - 3, t + 23), at(x - 6, t + 23), at(x - 11, t + 21), at(x - 14, t + 17), at(x - 13, t + 16), at(x - 8, t + 3), at(x - 16, t + 3), at(x - 16, t)];
}
function opening() {
  const { half, top, flare } = TABLE;
  const skyline = [at(half + flare, GROUND), at(half, top)];
  for (const x of [...MICS.filter((m) => m > 0)].reverse()) skyline.push(...micSkyline(x));
  skyline.push(...bowlSkyline(0));
  for (const x of [...MICS.filter((m) => m < 0)].reverse()) skyline.push(...micSkyline(x));
  skyline.push(at(-half, top), at(-half - flare, GROUND));
  // the cloth: a pale blue drape with a gold border under the top edge and folds to the floor
  const edge = (v) => half + (flare * (top - v)) / (top - GROUND);
  const drape = poly([at(-edge(GROUND), GROUND), at(edge(GROUND), GROUND), at(half, top), at(-half, top)]);
  const band = poly([at(-edge(top - 14), top - 14), at(edge(top - 14), top - 14), at(edge(top - 6), top - 6), at(-edge(top - 6), top - 6)]);
  const folds = [-72, -46, -20, 6, 32, 58, 80].map((x) => line([at(x * (edge(top - 14) / half), top - 14), at(x * (edge(GROUND + 0.01) / half), GROUND)])).join("");
  const fringe = Array.from({ length: 29 }, (_, index) => {
    const x = -edge(top - 14) + 3 + (index * (2 * edge(top - 14) - 6)) / 28;
    return line([at(x, top - 6), at(x, top - 14)]);
  }).join("");
  let mics = "";
  for (const x of MICS) {
    const t = top;
    mics += P(poly([at(x + 7, t), at(x + 4, t + 5), at(x - 4, t + 5), at(x - 7, t)]), "art-dark");
    mics += P(poly([at(x + 1.3, t + 5), at(x + 1.3, t + 38), at(x - 1.3, t + 38), at(x - 1.3, t + 5)]), "art-steel");
    mics += P(poly([at(x + 4, t + 41), at(x + 4, t + 53), ...arc(MID + x, t + 53, 4, 3.2, 0, Math.PI, 6).slice(1, -1), at(x - 4, t + 53), at(x - 4, t + 41), at(x - 1.3, t + 38), at(x + 1.3, t + 38)]), "art-dark");
    mics += P(line([at(x - 4, t + 46), at(x + 4, t + 46)]) + line([at(x - 4, t + 50), at(x + 4, t + 50)]), "art-grille");
  }
  // the lidded bowl, blue on white: a band on the bowl, the lid's rim and knob
  const b = top;
  const bowl = P(poly([at(16, b), at(16, b + 3), at(8, b + 3), at(13, b + 16), at(-13, b + 16), at(-8, b + 3), at(-16, b + 3), at(-16, b)]), "art-porcelain") +
    P(poly([at(14, b + 17), at(11, b + 21), at(6, b + 23), at(3, b + 23), at(3, b + 27), at(2, b + 28.5), at(-2, b + 28.5), at(-3, b + 27), at(-3, b + 23), at(-6, b + 23), at(-11, b + 21), at(-14, b + 17)]), "art-porcelain") +
    P(line([at(-10.3, b + 9), at(10.3, b + 9)]) + line([at(-12.2, b + 13), at(12.2, b + 13)]) + line([at(-14, b + 17), at(14, b + 17)]) + line([at(-3, b + 23), at(3, b + 23)]), "art-blue");
  return {
    outline: ground(skyline),
    art: riser() + P(drape, "art-cloth") + P(band, "art-gold") + P(folds + line([at(-edge(top - 14), top - 14), at(edge(top - 14), top - 14)]), "art-fold") + P(fringe, "art-fringe") + mics + bowl,
  };
}

// ---- 2 回顾: a glass cabinet, every shelf full of cups --------------------------------------------------------
const CAB = { x0: -146, x1: -80, feet: 8, top: GROUND + 238 };
function trophy(x, base, h) {
  const w = h * 0.3;
  const stem = h * 0.05;
  const a = Math.acos(stem / w);
  const right = arc(MID + x, base + h, w, h * 0.58, -a, 0, 7);
  const left = arc(MID + x, base + h, w, h * 0.58, Math.PI, Math.PI + a, 7);
  const body = [at(x + h * 0.26, base), at(x + h * 0.26, base + h * 0.1), at(x + h * 0.15, base + h * 0.1), at(x + h * 0.15, base + h * 0.16), at(x + stem, base + h * 0.2), ...right, at(x + w + 1.2, base + h), at(x - w - 1.2, base + h), ...left, at(x - stem, base + h * 0.2), at(x - h * 0.15, base + h * 0.16), at(x - h * 0.15, base + h * 0.1), at(x - h * 0.26, base + h * 0.1), at(x - h * 0.26, base)];
  // each handle leaves the bowl and comes back to it, both ends on the bowl's own curve
  const bowlAt = (t) => [w * Math.cos(t), base + h + h * 0.58 * Math.sin(t)];
  const handle = (side) => {
    const [xu, vu] = bowlAt(-0.12);
    const [xl, vl] = bowlAt(-0.78);
    const reach = w * 1.42;
    return `M${pt(at(x + side * xu, vu))}C${pt(at(x + side * reach, vu + h * 0.02))} ${pt(at(x + side * reach, vl - h * 0.02))} ${pt(at(x + side * xl, vl))}`;
  };
  // a highlight down the bowl: a sliver from the rim to the bowl's lower curve
  const [sx0, sv0] = bowlAt(-0.05);
  const [sx1, sv1] = bowlAt(-0.6);
  const shine = poly([at(x - sx0 * 0.62, sv0), at(x - sx0 * 0.5, sv0), at(x - sx1 * 0.42, sv1), at(x - sx1 * 0.5, sv1 - 0.4)]);
  return P(poly(body), "art-trophy") + P(handle(1) + handle(-1), "art-trophy-line") + P(shine, "art-trophy-shine");
}

function review() {
  const { x0, x1, feet, top } = CAB;
  const crest = arc(MID + (x0 + x1) / 2, top + 9, (x1 - x0) / 2 - 4, 12, 0, Math.PI, 12);
  const outline = ground([at(x1, GROUND), at(x1, top), at(x1 + 5, top), at(x1 + 5, top + 9), ...crest, at(x0 - 5, top + 9), at(x0 - 5, top), at(x0, top), at(x0, GROUND)]);
  const feetArt = poly([at(x1, GROUND), at(x1, GROUND + feet), at(x1 - 12, GROUND + feet), at(x1 - 12, GROUND)]) + poly([at(x0 + 12, GROUND), at(x0 + 12, GROUND + feet), at(x0, GROUND + feet), at(x0, GROUND)]);
  const inside = { x0: x0 + 4, x1: x1 - 4, v0: GROUND + feet + 6, v1: top - 6 };
  const shelves = [0.25, 0.5, 0.75].map((t) => inside.v0 + (inside.v1 - inside.v0) * t);
  const back = P(poly([at(inside.x0, inside.v0), at(inside.x1, inside.v0), at(inside.x1, inside.v1), at(inside.x0, inside.v1)]), "art-cabinet");
  const shelfLines = shelves.map((v) => line([at(inside.x0, v), at(inside.x1, v)]) + line([at(inside.x0, v - 2), at(inside.x1, v - 2)])).join("");
  const rows = [inside.v0, ...shelves];
  const cups = [
    [[-132, 30], [-113, 40], [-94, 27]],
    [[-127, 36], [-100, 42]],
    [[-133, 28], [-117, 34], [-99, 30]],
    [[-124, 40], [-100, 30]],
  ];
  let trophies = "";
  cups.forEach((row, index) => row.forEach(([x, h]) => (trophies += trophy(x, rows[index] + (index ? 0.5 : 0), Math.min(h, (inside.v1 - inside.v0) / 4 - 6)))));
  // a medal on a blue ribbon hangs from the top shelf
  const medal = P(poly([at(-92, shelves[2] - 2), at(-88, shelves[2] - 16), at(-84, shelves[2] - 2)]), "art-ribbon") + C(MID - 88, shelves[2] - 19, 4.2, "art-trophy");
  const doors = line([at((x0 + x1) / 2, inside.v0), at((x0 + x1) / 2, inside.v1)]);
  const frame = poly([at(inside.x0, inside.v0), at(inside.x1, inside.v0), at(inside.x1, inside.v1), at(inside.x0, inside.v1)]);
  const cornice = line([at(x0 - 3, top), at(x1 + 3, top)]) + line([at(x0 - 5, top + 4), at(x1 + 5, top + 4)]);
  const glint = (a, b, t) => poly([at(inside.x0, inside.v1 - a), at(inside.x0 + a * 0.62, inside.v1), at(inside.x0 + (a + t) * 0.62, inside.v1), at(inside.x0, inside.v1 - a - t)]);
  const glare = glint(26, 3) + glint(36, 1.6);
  const knobs = C(MID + (x0 + x1) / 2 - 3, (inside.v0 + inside.v1) / 2, 1.1, "art-knob") + C(MID + (x0 + x1) / 2 + 3, (inside.v0 + inside.v1) / 2, 1.1, "art-knob");
  return {
    outline,
    art: riser() + back + trophies + medal + P(shelfLines, "art-shelf") + P(frame + doors + cornice + line([at(x0, GROUND + feet), at(x1, GROUND + feet)]), "art-line") + P(feetArt, "art-dark") + P(glare, "art-glint-fill") + knobs,
  };
}

// ---- 3 问题: a cheval glass on two posts, its face toward the audience ------------------------------------------
const GLASS = { x0: 87, x1: 133, v0: GROUND + 34, v1: GROUND + 214, post: 6 };
function problems() {
  const { x0, x1, v0, v1, post } = GLASS;
  const r = (x1 - x0) / 2;
  const cx = (x0 + x1) / 2;
  const topV = v1 - r;
  // posts on splayed feet either side of the frame, a turned finial on each
  const foot = 16;
  const skyline = [at(x1 + post + foot, GROUND), at(x1 + post + foot - 4, GROUND + 5), at(x1 + post, GROUND + 7), at(x1 + post, topV + 8), at(x1 + post + 1.5, topV + 10), ...arc(MID + x1 + post / 2, topV + 14, post / 2 + 1.5, 4, 0, Math.PI, 6), at(x1 - 1.5, topV + 10), at(x1, topV + 8), at(x1, topV), ...arc(MID + cx, topV, r, r, 0, Math.PI, 16).slice(1, -1), at(x0, topV), at(x0, topV + 8), at(x0 + 1.5, topV + 10), ...arc(MID + x0 - post / 2, topV + 14, post / 2 + 1.5, 4, 0, Math.PI, 6), at(x0 - post - 1.5, topV + 10), at(x0 - post, topV + 8), at(x0 - post, GROUND + 7), at(x0 - post - foot + 4, GROUND + 5), at(x0 - post - foot, GROUND)];
  const inset = 4.5;
  const glass = [at(x1 - inset, v0 + inset), at(x1 - inset, topV), ...arc(MID + cx, topV, r - inset, r - inset, 0, Math.PI, 16).slice(1, -1), at(x0 + inset, topV), at(x0 + inset, v0 + inset)];
  const frameOuter = [at(x1, v0), at(x1, topV), ...arc(MID + cx, topV, r, r, 0, Math.PI, 16).slice(1, -1), at(x0, topV), at(x0, v0)];
  // two streaks of glint across the glass, each running edge to edge
  const streak = (a, b, w) => poly([at(x0 + inset, a), at(x1 - inset, b), at(x1 - inset, b + w), at(x0 + inset, a + w)]);
  const posts = line([at(x1, GROUND + 7), at(x1, v0)]) + line([at(x0, GROUND + 7), at(x0, v0)]);
  const pivots = C(MID + x1 + post / 2, v0 + (topV - v0) * 0.55, 2.2, "art-knob-gold") + C(MID + x0 - post / 2, v0 + (topV - v0) * 0.55, 2.2, "art-knob-gold");
  const crossbar = poly([at(x0, GROUND + 18), at(x1, GROUND + 18), at(x1, GROUND + 22), at(x0, GROUND + 22)]);
  return {
    outline: ground(skyline),
    holes: [[at(x0, GROUND + 7), at(x1, GROUND + 7), at(x1, GROUND + 18), at(x0, GROUND + 18)], [at(x0, GROUND + 22), at(x1, GROUND + 22), at(x1, v0), at(x0, v0)]],
    art: riser() + P(poly(frameOuter), "art-gold") + P(poly(glass), "art-glass") + P(streak(v0 + 70, v0 + 110, 7) + streak(v0 + 92, v0 + 132, 3), "art-glint") + P(poly(glass), "art-glass-edge") + P(crossbar, "art-gold") + P(posts, "art-line") + pivots,
  };
}

// ---- 4 要求: a notice board full of items, one of them stamped 划重点 ---------------------------------------------
const BOARD = { x0: -66, x1: 66, v0: GROUND + 76, v1: GROUND + 206, leg: 6 };
export const SEAL = { x: 26, v: GROUND + 106, w: 48, h: 18, turn: -7, text: "划重点" };
function asks() {
  const { x0, x1, v0, v1, leg } = BOARD;
  const legs = [x0 + 10, x1 - 10];
  // two legs on little feet, a rail between them, the board on top
  const skyline = [at(legs[1] + leg / 2 + 8, GROUND), at(legs[1] + leg / 2, GROUND + 4), at(legs[1] + leg / 2, v0), at(x1, v0), at(x1, v1), at(x0, v1), at(x0, v0), at(legs[0] - leg / 2, v0), at(legs[0] - leg / 2, GROUND + 4), at(legs[0] - leg / 2 - 8, GROUND)];
  const holes = [[at(legs[0] + leg / 2, GROUND + 4), at(legs[1] - leg / 2, GROUND + 4), at(legs[1] - leg / 2, GROUND + 26), at(legs[0] + leg / 2, GROUND + 26)].reverse(), [at(legs[0] + leg / 2, GROUND + 32), at(legs[1] - leg / 2, GROUND + 32), at(legs[1] - leg / 2, v0 - 0.01), at(legs[0] + leg / 2, v0 - 0.01)].reverse()];
  const face = { x0: x0 + 5, x1: x1 - 5, v0: v0 + 5, v1: v1 - 19 };
  const header = poly([at(x0 + 5, v1 - 15), at(x1 - 5, v1 - 15), at(x1 - 5, v1 - 5), at(x0 + 5, v1 - 5)]);
  const rows = 9;
  const ends = [44, 30, 52, 38, 48, 24, 50, 36, 42];
  let items = "";
  let bullets = "";
  for (let index = 0; index < rows; index++) {
    const v = face.v1 - 8 - index * ((face.v1 - face.v0 - 12) / (rows - 1));
    bullets += C(MID + face.x0 + 6, v, 1.3, "art-bullet");
    items += line([at(face.x0 + 11, v), at(face.x0 + 11 + ends[index] + 30, v)]);
  }
  const pins = [[face.x0 + 4, face.v1 - 2], [face.x1 - 4, face.v1 - 2], [face.x0 + 4, face.v0 + 3], [face.x1 - 4, face.v0 + 3]].map(([x, v]) => C(MID + x, v, 1.6, "art-pin")).join("");
  const rail = poly([at(legs[0] + leg / 2, GROUND + 26), at(legs[1] - leg / 2, GROUND + 26), at(legs[1] - leg / 2, GROUND + 32), at(legs[0] + leg / 2, GROUND + 32)]);
  return {
    outline: ground(skyline),
    holes,
    art: riser() + P(poly([at(face.x0, face.v0), at(face.x1, face.v0), at(face.x1, face.v1), at(face.x0, face.v1)]), "art-noticeboard") + P(header, "art-header") + P(items, "art-item") + bullets + pins + P(rail, "art-gold") + P(line([at(x0 + 5, v1 - 15), at(x1 - 5, v1 - 15)]), "art-line") + seal(),
  };
}
function seal() {
  const { x, v, w, h, turn, text } = SEAL;
  const [cx, cy] = [MID + x, -v];
  const chars = [...text];
  const size = 11.5;
  const glyphs = chars.map((ch, index) => `<text class="seal-text" x="${r1(cx + (index - (chars.length - 1) / 2) * (size + 1.6))}" y="${r1(cy + 0.6)}" font-size="${size}">${ch}</text>`).join("");
  return `<g class="seal" transform="rotate(${turn} ${r1(cx)} ${r1(cy)})"><rect class="seal-rim" x="${r1(cx - w / 2)}" y="${r1(cy - h / 2)}" width="${w}" height="${h}" rx="2"/><rect class="seal-rim seal-inner" x="${r1(cx - w / 2 + 2.2)}" y="${r1(cy - h / 2 + 2.2)}" width="${w - 4.4}" height="${h - 4.4}" rx="1"/>${glyphs}</g>`;
}

// ---- 5 表态: below the stage, a row of seat backs and the voting cards raised over them ----------------------------
const SEATS = [-120, -80, -40, 0, 40, 80, 120];
const CARD_V = [276, 286, 272, 290, 278, 284, 270];
const CARD_TILT = [-6, 3, -2, 0, 4, -3, 6];
function pledge() {
  const back = { half: 15, top: GROUND + 40 };
  const card = { w: 30, h: 22 };
  const skyline = [];
  const art = [];
  [...SEATS].reverse().forEach((x, rev) => {
    const index = SEATS.length - 1 - rev;
    const tilt = (CARD_TILT[index] * Math.PI) / 180;
    const cv = CARD_V[index];
    const stick = 1.6;
    // the card's corners turned about its middle, and where its stick leaves it
    const rot = ([dx, dv]) => [x + dx * Math.cos(tilt) - dv * Math.sin(tilt), cv + dx * Math.sin(tilt) + dv * Math.cos(tilt)];
    const corners = [[card.w / 2, -card.h / 2], [card.w / 2, card.h / 2], [-card.w / 2, card.h / 2], [-card.w / 2, -card.h / 2]].map(rot);
    const foot = [x, cv - card.h / 2];
    const a = Math.acos(stick / back.half);
    skyline.push(at(x + back.half, GROUND), at(x + back.half, back.top - 6), ...arc(MID + x, back.top - 6, back.half, 6, 0, a, 5).slice(1));
    // up the stick's right side, round the card, down the left side
    skyline.push(at(foot[0] + stick, foot[1] - 1), ...[corners[0], corners[1], corners[2], corners[3]].map(([cx, cvv]) => at(cx, cvv)), at(foot[0] - stick, foot[1] - 1));
    skyline.push(...arc(MID + x, back.top - 6, back.half, 6, Math.PI - a, Math.PI, 5).slice(0, -1), at(x - back.half, back.top - 6), at(x - back.half, GROUND));
    const inset = [[card.w / 2 - 2.5, -card.h / 2 + 2.5], [card.w / 2 - 2.5, card.h / 2 - 2.5], [-card.w / 2 + 2.5, card.h / 2 - 2.5], [-card.w / 2 + 2.5, -card.h / 2 + 2.5]].map(rot).map(([cx, cvv]) => at(cx, cvv));
    const tick = [[-7, 0], [-2, -5], [8, 6]].map(rot).map(([cx, cvv]) => at(cx, cvv));
    art.push(P(poly(inset), "art-card"), P(line(tick), "art-tick"));
    art.push(P(line([at(x - back.half + 5, GROUND + 4), at(x - back.half + 5, back.top - 8)]) + line([at(x + back.half - 5, GROUND + 4), at(x + back.half - 5, back.top - 8)]) + line([at(x - back.half + 5, GROUND + 4), at(x + back.half - 5, GROUND + 4)]) + line([at(x - back.half + 5, back.top - 8), at(x + back.half - 5, back.top - 8)]), "art-line"));
    art.push(P(poly([at(x - back.half + 5.5, GROUND + 4.5), at(x + back.half - 5.5, GROUND + 4.5), at(x + back.half - 5.5, back.top - 8.5), at(x - back.half + 5.5, back.top - 8.5)]), "art-seat"));
    art.push(P(poly([at(x + stick, back.top - 0.2), at(x + stick, cv - card.h / 2 - 1), at(x - stick, cv - card.h / 2 - 1), at(x - stick, back.top - 0.2)]), "art-stick"));
  });
  return { outline: ground(skyline), art: riser() + art.join("") };
}

export const STAGES = {
  opening: opening(),
  review: review(),
  problems: problems(),
  asks: asks(),
  pledge: pledge(),
};

// ---- the arch's printing: pillars with bases, flutes and capitals, a beam with a band of lozenges ------------------
export function archArt(index, ARCH) {
  const { u0, u1, v0, beam, pillar } = ARCH;
  const v1 = ARCH.v1;
  const left = [u0, u0 + pillar];
  const right = [u1 - pillar, u1];
  let d = "";
  for (const [a, b] of [left, right]) {
    d += line([[a, v0 + 14], [b, v0 + 14]]) + line([[a, v0 + 19], [b, v0 + 19]]) + line([[a, beam - 6], [b, beam - 6]]);
    for (const t of [0.33, 0.67]) d += line([[a + (b - a) * t, v0 + 19], [a + (b - a) * t, beam - 6]]);
  }
  // the beam: a rule under its top edge and lozenges along it, the act's number in pips in the middle
  const mid = (beam + v1) / 2;
  d += line([[u0, v1 - 5], [u1, v1 - 5]]);
  let lozenges = "";
  const count = 14;
  for (let i = 0; i < count; i++) {
    const u = u0 + pillar + 8 + ((u1 - u0 - 2 * pillar - 16) * (i + 0.5)) / count;
    if (Math.abs(u - MID) < 16) continue;
    lozenges += poly([[u - 6, mid], [u, mid + 4], [u + 6, mid], [u, mid - 4]]);
  }
  const pips = Array.from({ length: index + 1 }, (_, i) => C(MID + (i - index / 2) * 3.4, mid, 0.9, "art-pip")).join("");
  return P(d, "arch-line") + P(lozenges, "arch-lozenge") + C(MID, mid, 9, "arch-medal") + pips;
}

// ---- the cover: outside, a bronze-gold opera mask and the title slip; inside, the lining with the playbill -----------
// the outer face is drawn as read with the book shut: x from the free edge (left) to the crease, y down
function mask(cx, cy) {
  // a three-tile painted face: forehead and cheek tiles, a flame between the brows, brows sweeping up,
  // eye patches with slits for eyes, a bat-wing nose and a mouth pattern; drawn as a pattern, not a face
  const right = [
    ["mask-brow", "M8 -56C30 -84 76 -96 112 -70C104 -66 92 -64 80 -64C60 -64 40 -58 22 -46Z"],
    ["mask-socket", "M14 -40C36 -58 88 -58 114 -36C108 -12 80 6 56 6C36 6 18 -14 14 -40Z"],
    ["mask-slit", "M36 -30C52 -39 74 -39 92 -30C74 -25 52 -25 36 -30Z"],
    ["mask-cheek", "M112 -2C118 30 104 66 74 84C60 76 54 58 58 40C66 22 88 8 112 -2Z"],
    ["mask-curl", "M96 22C90 34 82 46 70 54"],
  ];
  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${-Number(x)} ${y}`);
  const shapes = [
    ["mask-face", "M0 -150C68 -150 120 -104 120 -36C120 40 92 104 44 140C28 152 -28 152 -44 140C-92 104 -120 40 -120 -36C-120 -104 -68 -150 0 -150Z"],
    ["mask-rim", "M0 -140C62 -140 110 -98 110 -36C110 34 84 96 42 130C27 141 -27 141 -42 130C-84 96 -110 34 -110 -36C-110 -98 -62 -140 0 -140Z"],
    ["mask-tile", "M-90 -72C-74 -118 -34 -138 0 -140C34 -138 74 -118 90 -72C64 -82 32 -78 12 -62L0 -50L-12 -62C-32 -78 -64 -82 -90 -72Z"],
    ["mask-flame", "M0 -134C10 -116 14 -96 8 -78C6 -70 2 -64 0 -56C-2 -64 -6 -70 -8 -78C-14 -96 -10 -116 0 -134Z"],
    ["mask-flame-line", "M0 -122C3 -108 4 -92 0 -72"],
    ...right,
    ...right.map(([cls, d]) => [cls, mirror(d)]),
    ["mask-nose", "M0 -36C6 -20 12 0 22 14C26 22 18 30 8 28C4 34 -4 34 -8 28C-18 30 -26 22 -22 14C-12 0 -6 -20 0 -36Z"],
    ["mask-mouth", "M-40 70C-24 60 24 60 40 70C32 76 22 78 14 76C8 88 -8 88 -14 76C-22 78 -32 76 -40 70Z"],
    ["mask-chin", "M-18 104C-6 110 6 110 18 104C14 122 -14 122 -18 104Z"],
  ];
  return `<g class="mask" transform="translate(${cx} ${cy})">${shapes.map(([cls, d]) => `<path class="${cls}" d="${d}"/>`).join("")}</g>`;
}
function titleSlip() {
  const [x, y, w, h] = [20, 22, 44, 214];
  return `<g class="slip"><rect class="slip-paper" x="${x}" y="${y}" width="${w}" height="${h}"/><rect class="slip-rule" x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}"/><text class="slip-title" x="${x + w / 2}" y="${y + 62}" font-size="27">剧</text><text class="slip-title" x="${x + w / 2}" y="${y + 100}" font-size="27">本</text></g>`;
}
// the inner face is drawn as read with the cover open: x from the crease to the free edge, y down
function playbill() {
  const lining = `<rect class="lining" x="9" y="9" width="414" height="552"/><rect class="lining-rule" x="9" y="9" width="414" height="552"/>`;
  const box = [92, 92, 248, 386];
  let rows = "";
  const perMinute = 160 / Math.max(...ACTS.map((act) => act.minutes));
  ACTS.forEach((act, index) => {
    const y = box[1] + 96 + index * 56;
    rows += `<circle class="bill-pip" cx="${box[0] + 22}" cy="${y}" r="4.5"/>`;
    rows += `<path class="bill-rule" d="M${box[0] + 36} ${y - 8}H${box[0] + 96}"/>`;
    rows += `<rect class="bill-bar" x="${box[0] + 36}" y="${y + 1}" width="${Math.round(act.minutes * perMinute * 10) / 10}" height="7"/>`;
  });
  const frame = `<rect class="bill-frame" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}"/><rect class="bill-frame bill-inner" x="${box[0] + 5}" y="${box[1] + 5}" width="${box[2] - 10}" height="${box[3] - 10}"/>`;
  const head = `<rect class="bill-head" x="${box[0] + 16}" y="${box[1] + 18}" width="${box[2] - 32}" height="36"/><circle class="bill-medal" cx="${box[0] + box[2] / 2}" cy="${box[1] + 36}" r="11"/>`;
  return lining + frame + head + rows;
}

export const ART = {
  outer: `<rect class="cover-rule" x="10" y="10" width="410" height="550"/>${titleSlip()}${mask(212, 330)}`,
  inner: playbill(),
  arch: archArt,
  css: `
.art-line{fill:none;stroke:#8F8A7C;stroke-width:.45;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.art-cloth{fill:#D9E2E7;stroke:#5D798D;stroke-width:.5;vector-effect:non-scaling-stroke}
.art-fold{fill:none;stroke:#7F98A8;stroke-width:.45;vector-effect:non-scaling-stroke}
.art-fringe{fill:none;stroke:#957747;stroke-width:.4;vector-effect:non-scaling-stroke}
.art-gold{fill:#D6BB83;stroke:#957747;stroke-width:.5;vector-effect:non-scaling-stroke}
.art-dark{fill:#3B576C;stroke:#1C2C38;stroke-width:.4;vector-effect:non-scaling-stroke}
.art-steel{fill:#B9BCB8;stroke:#5F635F;stroke-width:.35;vector-effect:non-scaling-stroke}
.art-grille{fill:none;stroke:#8EA3B1;stroke-width:.4;vector-effect:non-scaling-stroke}
.art-porcelain{fill:#FBFAF6;stroke:#3B576C;stroke-width:.45;vector-effect:non-scaling-stroke}
.art-blue{fill:none;stroke:#3B576C;stroke-width:.6;vector-effect:non-scaling-stroke}
.art-cabinet{fill:#E6E0D1;stroke:none}
.art-shelf{fill:none;stroke:#A79F88;stroke-width:.45;vector-effect:non-scaling-stroke}
.art-trophy{fill:#D6BB83;stroke:#6D5733;stroke-width:.45;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.art-trophy-line{fill:none;stroke:#6D5733;stroke-width:.55;vector-effect:non-scaling-stroke}
.art-trophy-shine{fill:#F2E4C2;stroke:none}
.art-ribbon{fill:#3B576C;stroke:#1C2C38;stroke-width:.35;vector-effect:non-scaling-stroke}
.art-glint-fill{fill:#FBFAF6;stroke:none;opacity:.85}
.art-knob{fill:#957747;stroke:none}
.art-knob-gold{fill:#C9A86A;stroke:#6D5733;stroke-width:.4;vector-effect:non-scaling-stroke}
.art-glass{fill:#C9D3D9;stroke:none}
.art-glass-edge{fill:none;stroke:#6F818B;stroke-width:.45;vector-effect:non-scaling-stroke}
.art-glint{fill:#EEF2F4;stroke:none}
.art-noticeboard{fill:#EFE7D4;stroke:#957747;stroke-width:.5;vector-effect:non-scaling-stroke}
.art-header{fill:#3B576C;stroke:#1C2C38;stroke-width:.4;vector-effect:non-scaling-stroke}
.art-item{fill:none;stroke:#4E4C45;stroke-width:.55;stroke-linecap:round;vector-effect:non-scaling-stroke}
.art-bullet{fill:#4E4C45}
.art-pin{fill:#C9A86A;stroke:#6D5733;stroke-width:.35;vector-effect:non-scaling-stroke}
.seal-rim{fill:none;stroke:var(--cinnabar);stroke-width:1;vector-effect:non-scaling-stroke}
.seal-inner{stroke-width:.5}
.seal-text{fill:var(--cinnabar);font-family:var(--kai);text-anchor:middle;dominant-baseline:central}
.art-card{fill:#FBFAF6;stroke:#957747;stroke-width:.5;vector-effect:non-scaling-stroke}
.art-tick{fill:none;stroke:#3B576C;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.art-seat{fill:#E2D7BF;stroke:none}
.art-stick{fill:#C9A86A;stroke:none}
.arch-line{fill:none;stroke:#8A6D3F;stroke-width:.45;vector-effect:non-scaling-stroke}
.arch-lozenge{fill:#E2CB98;stroke:#8A6D3F;stroke-width:.4;vector-effect:non-scaling-stroke}
.arch-medal{fill:#E2CB98;stroke:#6D5733;stroke-width:.5;vector-effect:non-scaling-stroke}
.art-pip{fill:#4E3D22}
.cover-rule{fill:none;stroke:#7F98A8;stroke-width:.5;vector-effect:non-scaling-stroke;opacity:.7}
.slip-paper{fill:#F2EFE6;stroke:#1C2C38;stroke-width:.5;vector-effect:non-scaling-stroke}
.slip-rule{fill:none;stroke:#8F8A7C;stroke-width:.45;vector-effect:non-scaling-stroke}
.slip-title{fill:var(--ink);font-family:var(--kai);text-anchor:middle;dominant-baseline:central}
.mask-face{fill:#D6BB83;stroke:#6D5733;stroke-width:.9;vector-effect:non-scaling-stroke}
.mask-rim{fill:none;stroke:#957747;stroke-width:.55;vector-effect:non-scaling-stroke}
.mask-tile{fill:#C9A86A;stroke:#957747;stroke-width:.5;vector-effect:non-scaling-stroke}
.mask-flame{fill:#6D5733;stroke:#4E3D22;stroke-width:.5;vector-effect:non-scaling-stroke}
.mask-flame-line{fill:none;stroke:#E2CB98;stroke-width:.7;stroke-linecap:round;vector-effect:non-scaling-stroke}
.mask-brow{fill:#4E3D22;stroke:none}
.mask-socket{fill:#4E3D22;stroke:none}
.mask-slit{fill:#E2CB98;stroke:none}
.mask-cheek{fill:#B7955A;stroke:#957747;stroke-width:.45;vector-effect:non-scaling-stroke}
.mask-curl{fill:none;stroke:#E2CB98;stroke-width:.8;stroke-linecap:round;vector-effect:non-scaling-stroke}
.mask-nose{fill:#6D5733;stroke:#4E3D22;stroke-width:.5;vector-effect:non-scaling-stroke}
.mask-mouth{fill:#4E3D22;stroke:none}
.mask-chin{fill:#B7955A;stroke:#957747;stroke-width:.45;vector-effect:non-scaling-stroke}
.lining{fill:#F2EFE6;stroke:none}
.lining-rule{fill:none;stroke:#C9BFA8;stroke-width:.5;vector-effect:non-scaling-stroke}
.bill-frame{fill:none;stroke:#957747;stroke-width:.7;vector-effect:non-scaling-stroke}
.bill-inner{stroke-width:.4}
.bill-head{fill:#E2CB98;stroke:#957747;stroke-width:.5;vector-effect:non-scaling-stroke}
.bill-medal{fill:#C9A86A;stroke:#6D5733;stroke-width:.5;vector-effect:non-scaling-stroke}
.bill-pip{fill:#3B576C}
.bill-rule{fill:none;stroke:#8F8A7C;stroke-width:.9;stroke-linecap:round;vector-effect:non-scaling-stroke}
.bill-bar{fill:#5D798D;stroke:#1F3A4D;stroke-width:.4;vector-effect:non-scaling-stroke}
`,
};
