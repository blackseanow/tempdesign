const D = __DATA__;
const root = document.querySelector(".juben");
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = root.querySelector("[data-readout]");
const readoutCount = readout.querySelector(".ro-count");
const readoutShare = readout.querySelector(".ro-share");
const live = root.querySelector("#juben-state");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nodes = [...svg.querySelectorAll(":scope > .it")].map((el) => {
  const m = el.dataset.m.split(",").map(Number);
  return { el, name: el.dataset.name, piece: el.dataset.piece, key: Number(el.dataset.k), m, lift: dot(m, D.V), shown: "" };
});
let order = nodes.map((_, index) => index);
const coverNode = nodes.find((node) => node.name === "book.cover");

const SLOTS = D.slots;
const ACT_IDS = D.acts.map((_, index) => `a${index}`);
const actNodes = nodes.filter((node) => ACT_IDS.includes(node.piece));
const CURTAIN_IDS = D.acts.map((_, index) => `c${index}`);
const slot = Object.fromEntries(SLOTS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const flip = D.acts.map(() => ({ x: 0, v: 0, drawn: -1 }));

const tags = D.acts.map((_, index) => {
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
const curtains = D.acts.map((_, index) => [-1, 1].map((side) => ({ side, panels: [...svg.querySelectorAll(`.curtain[data-curtain="${index}"][data-side="${side}"] .cur-panel`)], drawn: -1 })));
const coverEl = svg.querySelector(".cover");
const cover = {
  fill: coverEl.querySelector(".iso-fill"),
  shades: [0, 1, 2, 3].map((shade) => coverEl.querySelector(`.iso-shade[data-shade="${shade}"]`)),
  top: coverEl.querySelector(".iso-top"),
  faces: { 1: coverEl.querySelector('.cover-face[data-face="1"]'), "-1": coverEl.querySelector('.cover-face[data-face="-1"]') },
  crease: coverEl.querySelector(".iso-crease"),
  edge: coverEl.querySelector(".iso-edge"),
  sides: { 1: coverEl.querySelector('.cover-side[data-side="1"]'), "-1": coverEl.querySelector('.cover-side[data-side="-1"]') },
  drawn: -1,
};

let clock = 0;
let apart = false;
let frame = 0;
let last = 0;
let visible = false;
let phase = "";
let shownReadout = "";

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// a curtain counts as drawn once it is half open: that act is on
const openNow = () => CURTAIN_IDS.map((id) => slot[id].x >= 0.5);
const tally = () => tallyOf(openNow());

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
  announce(value ? "正在翻开剧本，五幕舞台依次弹出" : "正在合上剧本");
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

const shareOfNode = (node) => (slot[node.piece] ? slot[node.piece].x : 0);
let coverKey = coverNode.key;
const keyOf = (node) => (node === coverNode ? coverKey : node.key + node.lift * shareOfNode(node));

function place() {
  for (const node of nodes) {
    if (node === coverNode) continue;
    const share = shareOfNode(node);
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 || (!tx && !ty) ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
  }
  const next = nodes.map((_, index) => index).sort((a, b) => keyOf(nodes[a]) - keyOf(nodes[b]));
  if (next.some((index, at) => index !== order[at])) {
    const fragment = document.createDocumentFragment();
    for (const index of next) fragment.appendChild(nodes[index].el);
    svg.appendChild(fragment);
    order = next;
  }
}

function paintFaces(refs, solid, frameOf, faceOf) {
  refs.fill.setAttribute("d", solid.fill);
  solid.shades.forEach((d, shade) => refs.shades[shade].setAttribute("d", d));
  refs.top.setAttribute("d", solid.top);
  refs.crease.setAttribute("d", solid.crease);
  refs.edge.setAttribute("d", solid.outline);
  for (const face of solid.faces) {
    const path = refs.faces[face.side];
    const side = refs.sides[face.side];
    path.setAttribute("d", face.d);
    path.style.fill = faceTone(face.light);
    const alpha = smooth(0.02, 0.16, face.facing);
    if (alpha <= 0) side.style.display = "none";
    else {
      side.style.display = "";
      side.setAttribute("transform", faceOf(face.side));
      side.style.opacity = alpha >= 1 ? "" : alpha.toFixed(3);
    }
  }
}

function drawTag(index) {
  const turn = flip[index].x * Math.PI;
  if (Math.abs(turn - flip[index].drawn) < 1e-5) return;
  flip[index].drawn = turn;
  // the tag is drawn where it hangs at rest; the item's own translate carries it with its act
  const F = tagFrame(D.acts[index].top, turn, D.AZ);
  paintFaces(tags[index], tagSolid(F, D.P), F, (side) => tagFace(F, side, D.P));
}

function drawCover() {
  const theta = slot.cover.x * D.coverOpen;
  if (Math.abs(theta - cover.drawn) < 1e-5) return;
  cover.drawn = theta;
  const F = coverFrame(D.coverB, theta);
  paintFaces(cover, coverSolid(F, D.P), F, (side) => coverFace(F, side, D.P));
}

function drawCurtain(index) {
  const open = slot[CURTAIN_IDS[index]].x;
  for (const half of curtains[index]) {
    if (Math.abs(open - half.drawn) < 1e-5) continue;
    half.drawn = open;
    const F = { o: D.acts[index].curtainAt, u: D.X, v: D.BV, w: D.BW };
    const panels = curtainPaths(F, D.curtain.half, half.side, open, D.curtain.top, D.curtain.bottom, D.P);
    panels.forEach((panel, at) => {
      half.panels[at].setAttribute("d", panel.d);
      half.panels[at].dataset.shade = panel.shade;
    });
  }
}

function draw() {
  drawCover();
  // the cover's place in the order follows its angle and, while its outside shows, the acts behind it
  coverKey = coverKeyOf(slot.cover.x * D.coverOpen, D.coverOrder, Math.max(...actNodes.map(keyOf)));
  place();
  D.acts.forEach((_, index) => {
    drawTag(index);
    drawCurtain(index);
  });
  const parts = tally();
  const text = readoutOf(parts);
  if (text !== shownReadout) {
    shownReadout = text;
    readoutCount.textContent = countOf(parts);
    readoutShare.textContent = shareOf(parts);
  }
}

function settledPhase() {
  const resting = SLOTS.every((id) => !slot[id].pending && slot[id].x === slot[id].target);
  if (!resting) return;
  const parts = tally();
  if (apart) announce(`五幕都拉开了。${readoutOf(parts)}：两个小时里，真正要记下来的只有要求那五分钟。`);
  else announce(`剧本已合上。${readoutOf(parts)}。`);
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  clock += dt;
  let moving = false;
  SLOTS.forEach((id) => {
    const s = slot[id];
    if (s.pending && clock >= s.pending.at) (s.target = s.pending.value), (s.pending = null);
    if (s.pending) moving = true;
    if (step(s, s.target, dt, D.spring.stiffness, D.spring.damping)) moving = true;
  });
  // each tag turns with its curtain: the act's line shows once its curtain parts
  D.acts.forEach((_, index) => {
    if (step(flip[index], slot[CURTAIN_IDS[index]].target, dt, 22, 9.4)) moving = true;
  });
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
  // reduced motion: no springs; the picture is the one the motion would end on
  for (const id of SLOTS) Object.assign(slot[id], { x: value, v: 0, target: value, pending: null });
  flip.forEach((f) => Object.assign(f, { x: value, v: 0 }));
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
stage.setAttribute("aria-pressed", "false");
if (still.matches) jump(1);
else draw();
