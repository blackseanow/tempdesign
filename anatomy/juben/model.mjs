// The script model. Everything the figure counts (readout, caption, table) comes from here.
// build.mjs imports it; the page inlines the same source (exports stripped), so both count alike.
// Acts run from the front of the script (index 0, the first page under the cover) to the back.
//
// minutes: how long the act runs in a two-hour meeting.
// keep:    the act worth writing down. Only the requirements are; the rest is the routine.

export const ACTS = [
  { id: "opening", name: "开场", quote: "今天就简单说几句", columns: ["今天就", "简单说几句"], minutes: 20, scene: "铺着台布的主席台，一排话筒和一只盖碗" },
  { id: "review", name: "回顾", quote: "成绩是主要的", columns: ["成绩是", "主要的"], minutes: 45, scene: "一面摆满奖杯的展柜" },
  { id: "problems", name: "问题", quote: "主要是执行不到位", columns: ["主要是", "执行不到位"], minutes: 35, scene: "一面落地镜，镜面朝着台下" },
  { id: "asks", name: "要求", quote: "下面我强调几点", columns: ["下面我", "强调几点"], minutes: 5, scene: "一块写满条目的告示板，盖着“划重点”", keep: true },
  { id: "pledge", name: "表态", quote: "大家没意见，就这么定了", columns: ["大家没意见", "就这么定了"], minutes: 15, scene: "台下一排竖起来的表决牌" },
];

const sumOf = (list, pick) => list.reduce((total, act) => total + pick(act), 0);
export const TOTAL_MINUTES = sumOf(ACTS, (act) => act.minutes);
export const KEEP_MINUTES = sumOf(ACTS.filter((act) => act.keep), (act) => act.minutes);

// The acts whose curtains are open (flags in script order): how many, how long, and the share of
// that time worth writing down. Nothing open yet means no time to take a share of.
export function tallyOf(open) {
  const picked = ACTS.filter((_, index) => open[index]);
  const minutes = sumOf(picked, (act) => act.minutes);
  const keep = sumOf(picked.filter((act) => act.keep), (act) => act.minutes);
  return { count: picked.length, all: ACTS.length, minutes, keep, share: minutes ? keep / minutes : null };
}

export const percentText = (share) => {
  if (share === null) return "—";
  const tenth = Math.round(share * 1000) / 10;
  return Number.isInteger(tenth) ? `${tenth}%` : `${tenth.toFixed(1)}%`;
};

// The readout, in two parts so a phone can set them on two lines.
export const countOf = ({ count, all, minutes }) => `已拉开 ${count}/${all} 幕 · 累计 ${minutes} 分钟`;
export const shareOf = ({ share }) => `要记的占比 ${percentText(share)}`;
export const readoutOf = (tally) => `${countOf(tally)} · ${shareOf(tally)}`;

export const NONE_OPEN = ACTS.map(() => false);
export const ALL_OPEN = ACTS.map(() => true);
