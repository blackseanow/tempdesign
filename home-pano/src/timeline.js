// 开场的主时间线。所有动画都是"故事时间"的函数，不按帧数算：同一个时刻画出来永远一样（截图、录像可复现）。
//
// 步骤：door（等用户推门）→ push → sit → talk → reach（等用户按录音笔）→ reverse → settle → free
// 第二次进来：door → quick（1 秒）→ free；减少动态效果：直接 free（static）。
// 两个"等"的步骤没有固定时长，用户点了才结束；它们之后的步骤从点的那一刻往后排。
//
// state() 返回：
//   { mode, step, t（这一步开始了多久）, now（故事时间）, T（每一步开始的故事时间，没到的是 null）, final（是否已是终态） }

export const STEPS = ['door', 'push', 'sit', 'talk', 'reach', 'reverse', 'settle', 'free'];

export class Timeline {
  constructor(durations) {
    this.d = durations;          // { push, sit, talk, reverse, settle, quick }
    this.rate = 1;
    this.paused = false;
    this.base = performance.now();
    this.pausedAt = 0;
    this.mode = 'full';
    this.T = { door: 0 };
    this.listeners = new Set();
    this.lastStep = 'door';
  }

  // 故事时间（秒）
  now() {
    const ms = this.paused ? this.pausedAt : performance.now();
    return (ms - this.base) / 1000 * this.rate;
  }

  pause() { if (!this.paused) { this.pausedAt = performance.now(); this.paused = true; } }
  resume() { if (this.paused) { this.base += performance.now() - this.pausedAt; this.paused = false; } }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  // 推门：完整开场或"第二次进来"的快速版
  pushDoor(quick) {
    if (this.T.push != null || this.T.quick != null || this.T.free != null) return;
    const n = this.now();
    if (quick) {
      this.mode = 'quick';
      this.T.quick = n;
      this.T.free = n + this.d.quick;
    } else {
      this.T.push = n;
      this.T.sit = n + this.d.push;
      this.T.talk = this.T.sit + this.d.sit;
      this.T.reach = this.T.talk + this.d.talk;
    }
  }

  // 伸手那一步里按下了录音笔
  pressRecorder() {
    const s = this.state();
    if (s.step !== 'reach') return false;
    const n = s.now;
    this.T.reverse = n;
    this.T.settle = n + this.d.reverse;
    this.T.free = this.T.settle + this.d.settle;
    return true;
  }

  // 跳过：直接到终态。从门外跳过时门也一起打开（0.6 秒淡出）
  skip() {
    const s = this.state();
    if (s.step === 'free') return;
    const n = s.now;
    this.skippedFrom = s.step;
    this.mode = this.mode === 'quick' ? 'quick' : 'skip';
    this.T.skip = n;
    this.T.free = n;
  }

  // 减少动态效果：不播开场
  setStatic() {
    this.mode = 'static';
    this.T.free = this.now();
    this.T.skip = this.T.free;
  }

  // 调试 / 截图：把时间线摆到某一步的某一刻。holds 指定两个"等"的步骤各等了多久。
  seek(step, t = 0, holds = {}) {
    const doorHold = holds.door ?? 1.2;
    const reachHold = holds.reach ?? 1.0;
    const T = { door: 0 };
    let n;
    this.mode = 'full';
    if (step === 'door') {
      n = t;
    } else if (step === 'quick') {
      this.mode = 'quick';
      T.quick = doorHold; T.free = doorHold + this.d.quick;
      n = T.quick + t;
    } else {
      T.push = doorHold;
      T.sit = T.push + this.d.push;
      T.talk = T.sit + this.d.sit;
      T.reach = T.talk + this.d.talk;
      const idx = STEPS.indexOf(step);
      if (idx >= STEPS.indexOf('reverse')) {
        T.reverse = T.reach + reachHold;
        T.settle = T.reverse + this.d.reverse;
        T.free = T.settle + this.d.settle;
      }
      n = (T[step] ?? 0) + t;
    }
    this.T = T;
    this.skippedFrom = null;
    const ms = performance.now();
    this.base = ms - n / this.rate * 1000;
    if (this.paused) this.pausedAt = ms;
  }

  state() {
    const now = this.now();
    const T = this.T;
    let step = 'door';
    for (const k of ['quick', 'push', 'sit', 'talk', 'reach', 'reverse', 'settle', 'free']) {
      if (T[k] != null && now >= T[k]) step = k;
    }
    if (T.free != null && now >= T.free) step = 'free';
    const t = now - (T[step] ?? 0);
    const s = { mode: this.mode, step, t, now, T, final: step === 'free', skippedFrom: this.skippedFrom || null };
    if (step !== this.lastStep) {
      const prev = this.lastStep;
      this.lastStep = step;
      for (const fn of this.listeners) fn(step, prev, s);
    }
    return s;
  }
}
