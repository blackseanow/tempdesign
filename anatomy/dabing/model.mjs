// The weighing model. Everything the figure shows (needle, readout, caption, table) comes from here.
// build.mjs imports it; the page inlines the same source (exports stripped), so both count alike.
// Layers run from the top of the cake (index 0) to the base (index 6). Grams throughout.

export const LAYERS = [
  { id: "vision", name: "愿景", quote: "格局要打开", nominal: 120, actual: 2, note: "只有面上那层芝麻" },
  { id: "promotion", name: "升职", quote: "下一批就考虑你", nominal: 220, actual: 0 },
  { id: "raise", name: "加薪", quote: "等明年效益好了", nominal: 240, actual: 0 },
  { id: "bonus", name: "年终奖", quote: "看全年考核", nominal: 160, actual: 8 },
  { id: "honor", name: "评优", quote: "今年名额给你留着", nominal: 110, actual: 0 },
  { id: "training", name: "培训机会", quote: "有合适的就让你去", nominal: 100, actual: 5 },
  { id: "praise", name: "表扬", quote: "这次干得不错", nominal: 50, actual: 50 },
];

export const BASE = LAYERS.length - 1;
export const DIAL_FULL = 1000;

const sumOf = (list, key) => list.reduce((total, layer) => total + layer[key], 0);
export const NOMINAL_TOTAL = sumOf(LAYERS, "nominal");
export const ACTUAL_TOTAL = sumOf(LAYERS, "actual");

if (NOMINAL_TOTAL !== 1000) throw new Error(`nominal total is ${NOMINAL_TOTAL}, not 1000`);

// What the layers picked by `flags` weigh together, as the label says and as the scale says.
export function weighOf(flags) {
  const picked = LAYERS.filter((_, index) => flags[index]);
  return { nominal: sumOf(picked, "nominal"), actual: sumOf(picked, "actual"), layers: picked.length };
}

export const rateText = (nominal, actual) => {
  if (!nominal) return "—";
  const rate = (actual / nominal) * 100;
  return rate >= 99.95 ? "100%" : `${rate.toFixed(1)}%`;
};

// The readout. With nothing lifted it reads the whole cake, as the scale weighs it. After that it
// tallies the layers taken off so far, each weighed by how far the needle fell when it left the plate,
// so with all seven up it is the whole cake again, now counted layer by layer.
export function readoutParts(lifted) {
  const count = lifted.filter(Boolean).length;
  if (!count) return { scope: "整张饼", ...weighOf(LAYERS.map(() => true)) };
  return { scope: count === LAYERS.length ? "七层都拆开" : `已拆开 ${count} 层`, ...weighOf(lifted) };
}

export const numbersOf = ({ nominal, actual }) => `标称总重 ${nominal} 克 · 实际总重 ${actual} 克 · 兑现率 ${rateText(nominal, actual)}`;
export const readoutOf = (parts) => `${parts.scope}：${numbersOf(parts)}`;

export const NONE_LIFTED = LAYERS.map(() => false);
export const ALL_LIFTED = LAYERS.map(() => true);
