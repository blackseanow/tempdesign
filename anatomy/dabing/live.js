const D = __DATA__;
const root = document.querySelector(".dabing");
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = root.querySelector("[data-readout]");
const live = root.querySelector("#dabing-state");
const needle = svg.querySelector("[data-needle]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const nodes = [...svg.querySelectorAll(":scope > .it")].map((el) => {
  const m = el.dataset.m.split(",").map(Number);
  return { el, piece: el.dataset.piece, key: Number(el.dataset.k), m, lift: m[0] * D.V[0] + m[1] * D.V[1] + m[2] * D.V[2], shown: "" };
});
let order = nodes.map((_, index) => index);

const SLOTS = D.slots;
const slot = Object.fromEntries(SLOTS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const flip = SLOTS.map(() => ({ x: 0, v: 0, drawn: -1 }));
const scale = { x: 0, v: 0 };

const tags = SLOTS.map((_, index) => {
  const el = svg.querySelector(`.tag[data-tag="${index}"]`);
  return {
    fill: el.querySelector(".iso-fill"),
    shades: [0, 1, 2, 3].map((shade) => el.querySelector(`.iso-shade[data-shade="${shade}"]`)),
    top: el.querySelector(".iso-top"),
    faces: { 1: el.querySelector('.tag-face[data-face="1"]'), "-1": el.querySelector('.tag-face[data-face="-1"]') },
    crease: el.querySelector(".iso-crease"),
    edge: el.querySelector(".iso-edge"),
    sides: { 1: el.querySelector('.tag-side[data-side="1"]'), "-1": el.querySelector('.tag-side[data-side="-1"]') },
  };
});

let clock = 0;
let apart = false;
let frame = 0;
let last = 0;
let visible = false;
let phase = "";
let shownReadout = readout.textContent;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function onScale() {
  return SLOTS.map((id, index) => index === D.base || D.lifts[index] * slot[id].x < 0.3);
}

function weigh() {
  const resting = onScale();
  let nominal = 0;
  let actual = 0;
  D.layers.forEach((layer, index) => {
    if (resting[index]) (nominal += layer.nominal), (actual += layer.actual);
  });
  return { nominal, actual };
}

function rateText(nominal, actual) {
  if (!nominal) return "—";
  const rate = (actual / nominal) * 100;
  return rate >= 99.95 ? "100%" : `${rate.toFixed(1)}%`;
}

const readoutOf = ({ nominal, actual }) => `标称总重 ${nominal} 克 · 实际总重 ${actual} 克 · 兑现率 ${rateText(nominal, actual)}`;

function toggle(value) {
  const goal = value ? 1 : 0;
  let index = 0;
  for (const id of value ? SLOTS : [...SLOTS].reverse()) {
    if (slot[id].target === goal) slot[id].pending = null;
    else slot[id].pending = { value: goal, at: clock + index++ * D.spring.stagger };
  }
}

function setApart(value) {
  if (still.matches || apart === value) return;
  apart = value;
  toggle(value);
  stage.setAttribute("aria-pressed", String(value));
  announce(value ? "正在把饼一层层抬起来" : "正在一层层合上");
  run();
}

function announce(text) {
  if (phase === text) return;
  phase = text;
  live.textContent = text;
}

function step(state, target, dt, stiffness, damping) {
  for (let index = 0; index < D.spring.substeps; index++) {
    const h = dt / D.spring.substeps;
    state.v += ((target - state.x) * stiffness - state.v * damping) * h;
    state.x += state.v * h;
  }
  if (Math.abs(target - state.x) < 2e-4 && Math.abs(state.v) < 2e-4) {
    state.x = target;
    state.v = 0;
    return false;
  }
  return true;
}

function place() {
  for (const node of nodes) {
    const share = slot[node.piece] ? slot[node.piece].x : 0;
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 || (!tx && !ty) ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const shareOf = (node) => (slot[node.piece] ? slot[node.piece].x : 0);
  const next = nodes.map((_, index) => index).sort((a, b) => nodes[a].key + nodes[a].lift * shareOf(nodes[a]) - (nodes[b].key + nodes[b].lift * shareOf(nodes[b])));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    svg.appendChild(fragment);
    order = next;
  }
}

function drawTag(index) {
  const turn = flip[index].x * Math.PI;
  if (Math.abs(turn - flip[index].drawn) < 1e-5) return;
  flip[index].drawn = turn;
  const F = tagFrame(D.tops[index], turn, D.AZ);
  const solid = tagSolid(F, D.P);
  const t = tags[index];
  t.fill.setAttribute("d", solid.fill);
  solid.shades.forEach((d, shade) => t.shades[shade].setAttribute("d", d));
  t.top.setAttribute("d", solid.top);
  t.crease.setAttribute("d", solid.crease);
  t.edge.setAttribute("d", solid.outline);
  for (const face of solid.faces) {
    const path = t.faces[face.side];
    const side = t.sides[face.side];
    path.setAttribute("d", face.d);
    const tone = face.light >= 0 ? `color-mix(in srgb, var(--face-lit) ${Math.round(Math.min(1, face.light / 0.64) * 100)}%, var(--face))` : `color-mix(in srgb, var(--face-dark) ${Math.round(Math.min(1, -face.light / 0.64) * 100)}%, var(--face))`;
    path.style.fill = tone;
    const alpha = smooth(0.02, 0.16, face.facing);
    if (alpha <= 0) {
      side.style.display = "none";
    } else {
      side.style.display = "";
      side.setAttribute("transform", tagFace(F, face.side, D.P));
      side.style.opacity = alpha >= 1 ? "" : alpha.toFixed(3);
    }
  }
}

function draw() {
  place();
  tags.forEach((_, index) => drawTag(index));
  needle.setAttribute("transform", `${D.needle} rotate(${((scale.x * 360) / D.full).toFixed(3)})`);
  const text = readoutOf(weigh());
  if (text !== shownReadout) {
    shownReadout = text;
    readout.textContent = text;
  }
}

function settledPhase() {
  const resting = SLOTS.every((id) => !slot[id].pending && slot[id].x === slot[id].target);
  if (!resting) return;
  const w = weigh();
  if (apart) announce(`已拆开。秤上只剩表扬：标称 ${w.nominal} 克，实际 ${w.actual} 克，兑现率 ${rateText(w.nominal, w.actual)}。`);
  else announce(`已合上。标称总重 ${w.nominal} 克，实际总重 ${w.actual} 克，兑现率 ${rateText(w.nominal, w.actual)}。`);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  let moving = false;
  SLOTS.forEach((id, index) => {
    const s = slot[id];
    if (s.pending && clock >= s.pending.at) (s.target = s.pending.value), (s.pending = null);
    if (s.pending) moving = true;
    if (step(s, s.target, dt, D.spring.stiffness, D.spring.damping)) moving = true;
    if (step(flip[index], s.target, dt, 22, 9.4)) moving = true;
  });
  if (step(scale, weigh().actual, dt, 70, 7.5)) moving = true;
  draw();
  settledPhase();
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
}

function run() {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
}

function jump(value) {
  // reduced motion: no tour, no springs; the picture is the one the motion would end on
  for (const id of SLOTS) Object.assign(slot[id], { x: value, v: 0, target: value, pending: null });
  flip.forEach((f) => Object.assign(f, { x: value, v: 0 }));
  scale.x = weigh().actual;
  scale.v = 0;
  apart = Boolean(value);
  stage.setAttribute("aria-pressed", String(apart));
  draw();
}

function calmChanged() {
  if (still.matches) jump(1);
  else jump(0);
}

stage.addEventListener("pointerenter", (event) => event.pointerType !== "touch" && setApart(true));
stage.addEventListener("pointerleave", (event) => event.pointerType !== "touch" && setApart(false));
stage.addEventListener("pointerdown", (event) => event.pointerType === "touch" && setApart(!apart));
stage.addEventListener("keydown", (event) => {
  let to = null;
  if (event.key === " " || event.key === "Enter") to = !apart;
  if (event.key === "Escape" || event.key === "ArrowDown") to = false;
  if (event.key === "ArrowUp") to = true;
  if (to === null) return;
  event.preventDefault();
  setApart(to);
});
stage.addEventListener("focus", () => settledPhase());
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);
still.addEventListener("change", calmChanged);
scale.x = weigh().actual;
stage.setAttribute("aria-pressed", "false");
if (still.matches) jump(1);
else draw();
