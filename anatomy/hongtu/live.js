const D = __DATA__;
const root = document.querySelector(".hongtu");
const stage = root.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const readout = root.querySelector("[data-readout]");
const readoutScope = readout.querySelector(".ro-scope");
const readoutNumbers = readout.querySelector(".ro-nums");
const live = root.querySelector("#hongtu-state");
const still = matchMedia("(prefers-reduced-motion: reduce)");

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const nodes = [...svg.querySelectorAll(":scope > .it")].map((el) => {
  const m = el.dataset.m.split(",").map(Number);
  return { el, name: el.dataset.name, piece: el.dataset.piece, key: Number(el.dataset.k), m, lift: dot(m, D.V), shown: "", pin: el.querySelector(".tack-pin"), pinShown: 0 };
});
let order = nodes.map((_, index) => index);
const headNode = nodes.find((node) => node.name === "stand.lamp.head");
const knuckleKey = nodes.find((node) => node.name === "stand.lamp.knuckle").key;

const SLOTS = D.slots;
const SHEETS = SLOTS.slice(1);
const slot = Object.fromEntries(SLOTS.map((id) => [id, { x: 0, v: 0, target: 0, pending: null }]));
const flip = SHEETS.map(() => ({ x: 0, v: 0, drawn: -1 }));
const aim = { x: D.lamp.rest, v: 0 };
const light = SHEETS.map((_, index) => ({ x: index === 0 ? 1 : 0, v: 0 }));
let drawnAim = NaN;

const tags = SHEETS.map((_, index) => {
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
const pools = SHEETS.map((_, index) => svg.querySelector(`[data-pool="${index}"]`));
const arts = SHEETS.map((_, index) => svg.querySelector(`[data-art="${index}"]`));
const edges = SHEETS.map((_, index) => svg.querySelector(`[data-edge="${index}"]`));
// how clearly each sheet's drawing reads: all of them at rest, the one under the lamp once apart
const focus = SHEETS.map(() => ({ x: 1, v: 0, drawn: -1 }));

// the lamp head's live paths
const solidRefs = (group) => ({
  group,
  fill: group.querySelector(".iso-fill"),
  shades: [0, 1, 2, 3].map((shade) => group.querySelector(`.iso-shade[data-shade="${shade}"]`)),
  top: group.querySelector(".iso-top"),
  crease: group.querySelector(".iso-crease"),
  edge: group.querySelector(".iso-edge"),
});
const head = {
  neck: solidRefs(svg.querySelector(".lamp-neck .iso-solid")),
  shade: solidRefs(svg.querySelector(".lamp-shade > .iso-solid")),
  bulb: solidRefs(svg.querySelector(".lamp-bulb .iso-solid")),
  band: svg.querySelector(".lamp-band"),
  vents: svg.querySelector(".lamp-vents"),
  stem: solidRefs(svg.querySelector(".lamp-stem .iso-solid")),
  button: solidRefs(svg.querySelector(".lamp-button .iso-solid")),
  mouth: svg.querySelector(".lamp-mouth"),
  inside: svg.querySelector(".lamp-inside"),
  clip: svg.querySelector("#lamp-mouth-clip path"),
  throat: svg.querySelector(".lamp-throat"),
  lip: svg.querySelector(".lamp-lip"),
};

function paint(refs, paths) {
  refs.fill.setAttribute("d", paths.fill);
  paths.shades.forEach((d, shade) => refs.shades[shade].setAttribute("d", d));
  refs.top.setAttribute("d", paths.top);
  if (refs.crease) refs.crease.setAttribute("d", paths.crease || "");
  refs.edge.setAttribute("d", paths.outline);
}

let clock = 0;
let apart = false;
let frame = 0;
let last = 0;
let visible = false;
let phase = "";
let shownReadout = readout.textContent;

const DIM = 0.72;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// a sheet has left the stack once it is 2 mm clear of where it lay
const offsetOf = (index) => D.sheets[index].lift * slot[SHEETS[index]].x;
const liftedNow = () => SHEETS.map((_, index) => offsetOf(index) >= 2);
const tally = () => readoutParts(liftedNow());
// the lamp follows the lowest sheet that is most of the way up (80%); before that, the top sheet. So
// it rises with the first sheet, then steps down one sheet at a time, and closing runs back up
const current = () => {
  for (let index = SHEETS.length - 1; index >= 0; index--) if (slot[SHEETS[index]].x >= 0.8) return index;
  return 0;
};
const centreOf = (index) => {
  const c = D.sheets[index].centre;
  return [c[0], c[1], c[2] + offsetOf(index)];
};

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
  announce(value ? "正在把描图纸一张张掀起来" : "正在一张张合上");
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

// critically damped follow with time constant tau
function follow(state, target, dt, tau) {
  const w = 1 / tau;
  for (let index = 0; index < 4; index++) {
    const h = dt / 4;
    state.v += (w * w * (target - state.x) - 2 * w * state.v) * h;
    state.x += state.v * h;
  }
  if (Math.abs(target - state.x) < 1e-4 && Math.abs(state.v) < 1e-4) {
    state.x = target;
    state.v = 0;
    return false;
  }
  return true;
}

const shareOf = (node) => (slot[node.piece] ? slot[node.piece].x : 0);
const keyOf = (node) => {
  if (node === headNode) return headKey;
  return node.key + node.lift * shareOf(node);
};
let headKey = headNode.key;

function place() {
  for (const node of nodes) {
    const share = shareOf(node);
    const tx = (D.EX[0] * node.m[0] + D.EY[0] * node.m[1] + D.EZ[0] * node.m[2]) * share;
    const ty = (D.EX[1] * node.m[0] + D.EY[1] * node.m[1] + D.EZ[1] * node.m[2]) * share;
    const text = share === 0 || (!tx && !ty) ? "" : `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`;
    if (text !== node.shown) {
      node.shown = text;
      if (text) node.el.setAttribute("transform", text);
      else node.el.removeAttribute("transform");
    }
    if (node.pin) {
      // the pin shows once it has come out of the stack: 9.5 mm of a 400 mm travel
      const seen = smooth(0.012, 0.03, share);
      if (Math.abs(seen - node.pinShown) > 1e-3 || (seen === 0) !== (node.pinShown === 0)) {
        node.pinShown = seen;
        node.pin.style.opacity = seen.toFixed(3);
      }
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

function drawTag(index) {
  const turn = flip[index].x * Math.PI;
  if (Math.abs(turn - flip[index].drawn) < 1e-5) return;
  flip[index].drawn = turn;
  const F = tagFrame(D.sheets[index].top, turn, D.AZ);
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

function drawHead() {
  if (Math.abs(aim.x - drawnAim) < 1e-5) return;
  drawnAim = aim.x;
  const parts = headParts(D.lamp, aim.x, D.P);
  paint(head.neck, parts.neck);
  paint(head.shade, parts.shade);
  head.band.setAttribute("d", parts.band);
  head.vents.innerHTML = dotsSvg(parts.vents, { size: 0.75, tone: "hi" });
  paint(head.stem, parts.stem);
  paint(head.button, parts.button);
  // looking into the shade: the white enamel inside, the step of the cap and the lamp
  const open = smooth(0.0, 0.06, parts.facing);
  if (open <= 0) head.mouth.style.display = "none";
  else {
    head.mouth.style.display = "";
    head.mouth.style.opacity = open >= 1 ? "" : open.toFixed(3);
    head.inside.setAttribute("d", parts.opening);
    head.clip.setAttribute("d", parts.opening);
    head.throat.setAttribute("d", parts.throat);
    head.lip.setAttribute("d", parts.lip);
    paint(head.bulb, parts.bulb);
  }
  // the neck leaves the knuckle toward the viewer or away from it
  headKey = knuckleKey + (parts.facing > 0 ? 0.004 : -0.004);
}

function drawPools() {
  SHEETS.forEach((_, index) => {
    const pool = pools[index];
    const level = light[index].x;
    if (level < 0.004) {
      if (pool.style.opacity !== "0") pool.style.opacity = "0";
      return;
    }
    const s = D.sheets[index];
    const off = offsetOf(index);
    const origin = [s.origin[0], s.origin[1], s.origin[2] + off];
    const spot = poolOf(D.lamp, aim.x, origin, D.X, D.S, D.N);
    if (!spot) {
      pool.style.opacity = "0";
      return;
    }
    pool.setAttribute("cx", spot.u.toFixed(1));
    pool.setAttribute("cy", spot.v.toFixed(1));
    pool.setAttribute("rx", spot.rx.toFixed(1));
    pool.setAttribute("ry", spot.ry.toFixed(1));
    pool.setAttribute("transform", `rotate(${spot.turn.toFixed(2)} ${spot.u.toFixed(1)} ${spot.v.toFixed(1)})`);
    pool.style.opacity = level.toFixed(3);
  });
}

function drawFocus() {
  SHEETS.forEach((_, index) => {
    const level = focus[index].x;
    const lit = light[index].x;
    const key = Math.round(level * 1000) * 1000 + Math.round(lit * 1000);
    if (key === focus[index].drawn) return;
    focus[index].drawn = key;
    arts[index].style.opacity = level >= 0.999 ? "" : level.toFixed(3);
    edges[index].style.stroke = lit <= 0.001 ? "" : `color-mix(in srgb, var(--ink) ${Math.round(lit * 100)}%, #8C8778)`;
  });
}

function draw() {
  place();
  drawFocus();
  SHEETS.forEach((_, index) => drawTag(index));
  drawHead();
  drawPools();
  const parts = tally();
  const text = readoutOf(parts);
  if (text !== shownReadout) {
    shownReadout = text;
    readoutScope.textContent = `${parts.scope}：`;
    readoutNumbers.textContent = numbersOf(parts);
  }
}

function settledPhase() {
  const resting = SLOTS.every((id) => !slot[id].pending && slot[id].x === slot[id].target);
  if (!resting) return;
  const parts = tally();
  if (apart) announce(`六张都掀开了，灯照着时间表。${numbersOf(parts)}，只有愿景和时间表两层画清楚了。`);
  else announce(`已合上。整张宏图${numbersOf(parts)}。`);
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
  SHEETS.forEach((id, index) => {
    if (step(flip[index], slot[id].target, dt, 22, 9.4)) moving = true;
  });
  const now_ = current();
  if (follow(aim, angleTo(D.lamp, centreOf(now_)), dt, 0.18)) moving = true;
  const anyUp = liftedNow().some(Boolean);
  light.forEach((state, index) => {
    if (follow(state, index === now_ ? 1 : 0, dt, 0.16)) moving = true;
    if (follow(focus[index], !anyUp || index === now_ ? 1 : DIM, dt, 0.2)) moving = true;
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
  const lit = current();
  Object.assign(aim, { x: angleTo(D.lamp, centreOf(lit)), v: 0 });
  const anyUp = liftedNow().some(Boolean);
  light.forEach((state, index) => Object.assign(state, { x: index === lit ? 1 : 0, v: 0 }));
  focus.forEach((state, index) => Object.assign(state, { x: !anyUp || index === lit ? 1 : DIM, v: 0 }));
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
