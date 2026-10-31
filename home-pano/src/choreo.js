// 开场的编排：每个会动的东西在某个时刻是什么样子，都是时间线状态的纯函数（不读帧数、不存中间状态）。
// 主线程（门、字幕、墨线圈、脉搏线）和渲染 Worker（声浪、道具、飘字、挂钟、横匾）都从这里取值。
// 只动位移、旋转、缩放、透明度。
import { span, easeInOut, easeOut, easeIn, lerp, clamp, hash } from './geom.js';

const at = (s, key) => (s.T[key] == null ? null : s.now - s.T[key]);   // 从某一步开始过了多久（没到是 null）
const isFinal = s => s.mode === 'skip' || s.mode === 'static' || (s.mode === 'quick');

// ① 门外 ② 推门：门扇角度（0 关、100 开到底）、门外整幅的缩放和透明度、门下小字
export function door(s) {
  const skipAge = s.T.skip != null ? s.now - s.T.skip : null;
  if (s.mode === 'static') return { visible: false, leaf: 100, scale: 1, opacity: 0, hint: 0 };
  if (skipAge != null && (s.skippedFrom === 'door' || s.mode === 'skip')) {
    // 从门外跳过：门直接推开、淡出；开场中途跳过：门早就不在了
    if (s.skippedFrom !== 'door' && s.skippedFrom !== 'push') return { visible: false, leaf: 100, scale: 1, opacity: 0, hint: 0 };
    const k = span(skipAge, 0, 0.6);
    return { visible: k < 1, leaf: 100, scale: 1 + 0.4 * k, opacity: 1 - k, hint: 0 };
  }
  if (s.step === 'door') return { visible: true, leaf: 0, scale: 1, opacity: 1, hint: 0.7 + 0.3 * Math.cos(s.t * 2.2) };
  if (s.mode === 'quick') {
    const t = at(s, 'quick');
    return { visible: t < 0.95, leaf: 100 * easeOut(span(t, 0, 0.5)), scale: 1 + 3 * easeIn(span(t, 0.15, 0.9)), opacity: 1 - span(t, 0.5, 0.95), hint: 0 };
  }
  const t = at(s, 'push');
  if (t == null) return { visible: true, leaf: 0, scale: 1, opacity: 1, hint: 1 };
  return {
    visible: t < 2.6,
    leaf: 100 * easeInOut(span(t, 0.05, 1.45)),
    scale: 1 + 3.4 * easeIn(span(t, 0.5, 2.45)),
    opacity: 1 - span(t, 1.85, 2.5),
    hint: 1 - span(t, 0, 0.3),
  };
}

// 镜头：位置（z 往后为正，y 往上为正，米）、额外俯仰（度）、允许用户转头的程度（0..1）
export function camera(s) {
  if (isFinal(s) && s.mode !== 'quick') return { z: 0, y: 0, pitch: 0, free: 1 };
  if (s.mode === 'quick') {
    const t = at(s, 'quick') ?? 0;
    if (s.step === 'door') return { z: 1.15, y: 0.06, pitch: 3, free: 0 };
    const k = easeOut(span(t, 0, 1.0));
    return { z: lerp(0.7, 0, k), y: lerp(0.05, 0, k), pitch: lerp(2, 0, k), free: s.step === 'free' ? 1 : 0 };
  }
  switch (s.step) {
    case 'door': return { z: 1.15, y: 0.06, pitch: 3, free: 0 };
    case 'push': {
      const k = easeInOut(span(s.t, 0.4, 2.6));
      return { z: lerp(1.15, 0.35, k), y: 0.06, pitch: lerp(3, 1.2, k), free: 0 };
    }
    case 'sit': {
      const k = easeOut(span(s.t, 0, 1.8));
      return { z: lerp(0.35, 0, k), y: lerp(0.06, 0, easeInOut(span(s.t, 0.2, 1.6))), pitch: lerp(1.2, 0, easeInOut(span(s.t, 0.2, 1.8))), free: 0.15 * span(s.t, 1.8, 3.4) };
    }
    case 'talk': case 'reach': case 'reverse': return { z: 0, y: 0, pitch: 0, free: 0.15 };
    case 'settle': return { z: 0, y: 0, pitch: 0, free: lerp(0.15, 1, span(s.t, 2.0, 3.2)) };
    default: return { z: 0, y: 0, pitch: 0, free: 1 };
  }
}

// 字幕和最后那行小字
export function captions(s) {
  const out = { surface: 0, actually: 0, tagline: 0 };
  if (s.mode === 'static' || s.mode === 'skip') { out.tagline = 1; return out; }
  if (s.mode === 'quick') { out.tagline = span(at(s, 'quick') ?? 0, 0.3, 1.0); return out; }
  const sit = at(s, 'sit'), talk = at(s, 'talk'), rev = at(s, 'reverse'), settle = at(s, 'settle');
  if (sit != null) out.surface = span(sit, 0.9, 1.5) * (talk == null ? 1 : 1 - span(talk, 0.6, 1.3));
  if (rev != null) out.actually = span(rev, 1.0, 1.6) * (settle == null ? 1 : 1 - span(settle, 0.2, 0.8));
  if (settle != null) out.tagline = span(settle, 1.2, 2.0);
  return out;
}

// 横匾上浮现"今天把脉了吗？"
export function plaque(s) {
  if (s.mode === 'static' || s.mode === 'skip') return { opacity: 1, scale: 1 };
  if (s.mode === 'quick') { const k = span(at(s, 'quick') ?? 0, 0.2, 0.9); return { opacity: k, scale: 1.06 - 0.06 * k }; }
  const t = at(s, 'settle');
  if (t == null) return { opacity: 0, scale: 1.08 };
  const k = easeOut(span(t, 0.3, 1.5));
  return { opacity: k, scale: 1.08 - 0.08 * k };
}

// 挂钟：9:00 以后过了多少分钟。开讲 12 秒走到 11:40；伸手时会议还在拖（1.2 秒一分钟）；反转后停住
export const CLOCK_END = 160;
export function clockMinutes(s) {
  if (s.mode !== 'full') return CLOCK_END;
  const talk = at(s, 'talk');
  if (talk == null) return 0;
  const reachLen = s.T.reverse != null ? s.T.reverse - s.T.reach : null;
  const reach = at(s, 'reach');
  if (reach == null) return CLOCK_END * easeInOut(span(talk, 0.4, 11.6));
  return CLOCK_END + (reachLen != null ? Math.min(reach, reachLen) : reach) / 1.2;
}

// 领导在说话（开讲和伸手两步）：声浪、嘴、说话声都看这个
export function talking(s) {
  return s.mode === 'full' && (s.step === 'talk' || s.step === 'reach');
}

// 声浪：开讲起每 0.34 秒从嘴边发出一圈，1.9 秒飞到眼前；反转时还在半路的掉头吸进录音笔
export const WAVE_GAP = 0.34, WAVE_LIFE = 1.9, WAVE_SUCK = 0.85;
export function waves(s) {
  if (s.mode !== 'full' || s.T.talk == null) return [];
  const t0 = s.T.talk, rev = s.T.reverse;
  const until = rev ?? s.now;
  const out = [];
  const last = Math.floor((until - t0) / WAVE_GAP);
  for (let i = Math.max(0, last - Math.ceil(WAVE_LIFE / WAVE_GAP) - 1); i <= last; i++) {
    const e = t0 + i * WAVE_GAP;
    if (e > until) break;
    if (rev == null || s.now < rev) {
      const p = (s.now - e) / WAVE_LIFE;
      if (p >= 0 && p < 1) out.push({ i, phase: 'out', p });
    } else {
      const p0 = (rev - e) / WAVE_LIFE;
      if (p0 < 0 || p0 >= 1) continue;
      const q = (s.now - rev - 0.06 * hash(i) * 3) / WAVE_SUCK;
      if (q < 1) out.push({ i, phase: 'suck', p: p0, q: clamp(q, 0, 1) });
    }
  }
  return out;
}

// 六个道具：开讲 1 秒起每 1.7 秒放出一个，2.1 秒飘到镜头前的位置停住、轻轻浮动；反转时一个个掉头吸进录音笔
export const PROP_IDS = ['juben', 'hongtu', 'dabing', 'jitang', 'daqi', 'huojian'];
export const PROP_FLIGHT = 2.1, PROP_SUCK = 1.0;
export function props(s) {
  if (s.mode !== 'full' || s.T.talk == null) return PROP_IDS.map(id => ({ id, phase: 'hidden' }));
  return PROP_IDS.map((id, k) => {
    const launch = s.T.talk + 1.0 + k * 1.7;
    if (s.now < launch) return { id, k, phase: 'hidden' };
    const rev = s.T.reverse;
    if (rev != null && s.now >= rev) {
      if (launch >= rev) return { id, k, phase: 'hidden' };
      const p0 = Math.min(1, (rev - launch) / PROP_FLIGHT);
      const start = rev + 0.2 + k * 0.22;
      const q = (s.now - start) / PROP_SUCK;
      if (q >= 1) return { id, k, phase: 'gone' };
      return { id, k, phase: 'suck', p: p0, q: clamp(q, 0, 1), age: rev - launch };
    }
    const p = (s.now - launch) / PROP_FLIGHT;
    return { id, k, phase: p < 1 ? 'out' : 'hover', p: Math.min(1, p), age: s.now - launch };
  });
}

// 三句话依次浮过；伸手那一步里每 3.6 秒再冒一句（会还在开）；反转时还在飘的也吸进录音笔
export const PHRASES = ['这个事情很重要', '下面我再强调几点', '大家克服一下'];
export const PHRASE_LIFE = 3.4;
export function phrases(s) {
  if (s.mode !== 'full' || s.T.talk == null) return [];
  const starts = [2.0, 5.6, 9.2].map((d, j) => ({ j, e: s.T.talk + d, text: PHRASES[j] }));
  if (s.T.reach != null) {
    const until = s.T.reverse ?? s.now;
    for (let n = 0; ; n++) {
      const e = s.T.reach + 1.2 + n * 3.6;
      if (e > until) break;
      starts.push({ j: 3 + n, e, text: PHRASES[n % 3] });
    }
  }
  const out = [];
  const rev = s.T.reverse;
  for (const { j, e, text } of starts) {
    if (s.now < e) continue;
    if (rev == null || s.now < rev) {
      const p = (s.now - e) / PHRASE_LIFE;
      if (p < 1) out.push({ j, text, phase: 'out', p });
    } else {
      const p0 = (rev - e) / PHRASE_LIFE;
      if (p0 < 0 || p0 >= 1) continue;
      const q = (s.now - rev - 0.05) / 0.8;
      if (q < 1) out.push({ j, text, phase: 'suck', p: p0, q: clamp(q, 0, 1) });
    }
  }
  return out;
}

// 录音笔周围的墨线圈和"按下录音笔"提示
export function recorderCue(s) {
  if (s.mode !== 'full') return { ring: 0, hint: 0, breathe: 0 };
  const reach = at(s, 'reach'), rev = at(s, 'reverse');
  if (reach == null) return { ring: 0, hint: 0, breathe: 0 };
  if (rev != null) return { ring: 1 - span(rev, 0, 0.45), hint: 1 - span(rev, 0, 0.3), breathe: 0 };
  return { ring: span(reach, 0, 0.6), hint: span(reach, 3.0, 3.5), breathe: 0.5 + 0.5 * Math.sin(reach * 2.6) };
}

// 录音笔被按下（反转那一刻起）
export function pressed(s) {
  if (s.mode !== 'full') return false;
  const rev = at(s, 'reverse');
  return rev != null && rev < 1.6;
}

// 鸡汤：开讲时咕嘟声越来越大、热气越来越多，反转后慢慢平静（0..1）
export function soup(s) {
  if (s.mode !== 'full') return 0.18;
  const talk = at(s, 'talk'), rev = at(s, 'reverse');
  if (talk == null) return 0.18;
  if (rev == null) return lerp(0.18, 1, easeIn(span(talk, 0, 12)));
  return lerp(1, 0.18, easeOut(span(rev, 0, 3.6)));
}

// 桌上那道阳光：跟着挂钟，从右往左移（0 = 右边，1 = 左边）
export function sun(s) {
  return clamp(clockMinutes(s) / CLOCK_END, 0, 1.12);
}

// 说话的音节：一秒 4.6 个字，第 n 个字从故事时间 n / 4.6 开始；偶尔空一拍换气。嘴和合成说话声都按这个来，所以对得上
export const SYL_RATE = 4.6;
export const sylOpen = n => hash(n) > 0.18;
export const SYL_ON = 0.12, SYL_OFF = 0.78;      // 一拍里张嘴的那一段
// 嘴：说话时张合（返回 0 = 闭、1 = 张）
export function mouth(s, amb) {
  if (!talking(s)) return 0;
  const x = s.now * SYL_RATE;
  const n = Math.floor(x), ph = x - n;
  return sylOpen(n) && ph > SYL_ON && ph < SYL_OFF ? 1 : 0;
}

// 眨眼：每 3–5 秒一次，闭眼 0.14 秒（领导说话时也眨）
export function blink(amb) {
  const cycle = Math.floor(amb / 4.1);
  const start = cycle * 4.1 + hash(cycle + 7) * 1.6;
  return amb >= start && amb < start + 0.14 ? 1 : 0;
}
