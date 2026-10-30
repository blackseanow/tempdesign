// The blueprint model. Everything the figure counts (readout, caption, table) comes from here.
// build.mjs imports it; the page inlines the same source (exports stripped), so both count alike.
// Sheets run from the top of the stack (index 0) to the bottom (index 5).
//
// clarity: the share of the sheet's strokes, by length, that are inked; the rest is pencil.
//          art.mjs draws each sheet and the build checks that its inked share is this number.
// weight:  how much the sheet counts toward getting the thing done; the closer to "how", the heavier.

export const LAYERS = [
  { id: "vision", name: "愿景", quote: "要有大格局", drawn: "远处的群山", clarity: 100, weight: 1 },
  { id: "goal", name: "目标", quote: "三年翻一番", drawn: "山顶的一面旗", clarity: 80, weight: 2 },
  { id: "route", name: "路线图", quote: "路径大家再想想", drawn: "只画了一半的盘山虚线", clarity: 20, weight: 3 },
  { id: "milestones", name: "里程碑", quote: "节点倒排", drawn: "路边几面小旗，都画在半路上", clarity: 30, weight: 2 },
  { id: "resources", name: "资源", quote: "人手先克服一下", drawn: "人员和资金的小图标，只有轮廓", clarity: 0, weight: 3 },
  { id: "timeline", name: "时间表", quote: "越快越好", drawn: "底部一把刻度尺，终点重重圈出", clarity: 100, weight: 1 },
];

// a sheet counts as drawn clearly only when every stroke on it is inked
export const CLEAR = 100;

const sumOf = (list, pick) => list.reduce((total, layer) => total + pick(layer), 0);
export const WEIGHT_TOTAL = sumOf(LAYERS, (layer) => layer.weight);

// The clear count and the weighted clarity of the sheets picked by `flags`.
export function tallyOf(flags) {
  const picked = LAYERS.filter((_, index) => flags[index]);
  const weight = sumOf(picked, (layer) => layer.weight);
  return {
    count: picked.length,
    clear: picked.filter((layer) => layer.clarity >= CLEAR).length,
    doable: weight ? sumOf(picked, (layer) => layer.clarity * layer.weight) / weight : 0,
  };
}

export const percentText = (value) => {
  const tenth = Math.round(value * 10) / 10;
  return Number.isInteger(tenth) ? `${tenth}%` : `${tenth.toFixed(1)}%`;
};

// The readout. With nothing lifted it reads the whole blueprint. After that it tallies the sheets
// lifted off the stack so far, each looked at under the lamp, so with all six up it is the whole
// blueprint again, now counted sheet by sheet.
export function readoutParts(lifted) {
  const count = lifted.filter(Boolean).length;
  const all = LAYERS.length;
  if (!count) return { scope: "整张宏图", ...tallyOf(LAYERS.map(() => true)) };
  return { scope: count === all ? "六层都掀开" : `已掀开 ${count} 层`, ...tallyOf(lifted) };
}

export const numbersOf = ({ clear, count, doable }) => `画清楚 ${clear}/${count} 层 · 可执行度 ${percentText(doable)}`;
export const readoutOf = (parts) => `${parts.scope}：${numbersOf(parts)}`;

export const NONE_LIFTED = LAYERS.map(() => false);
export const ALL_LIFTED = LAYERS.map(() => true);
