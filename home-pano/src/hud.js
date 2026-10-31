// 界面：字幕、最后那行小字、屏幕底部的脉搏线、跳过按钮、声音开关、提示。
// 脉搏线是一整条预先画好的线，只做平移：横坐标对应故事时间，屏幕右边缘就是"现在"。
// 每拍是一个平滑的脉搏波（主峰 + 重搏切迹的小峰，没有心电图那种尖刺）。
// 坐定时 66 次/分，开讲里一路加快到 132，伸手时保持，反转后放慢、压平，落定后淡出。
import * as C from './choreo.js';
import { span, clamp, lerp, easeOut } from './geom.js';

const NS = 'http://www.w3.org/2000/svg';

export class Hud {
  constructor(root) {
    this.root = root;
    this.caps = Object.fromEntries([...root.querySelectorAll('.cap')].map(el => [el.dataset.cap, el]));
    this.pulse = root.querySelector('#pulse');
    this.svg = root.querySelector('.pulse-svg');
    this.g = document.createElementNS(NS, 'g');
    this.path = document.createElementNS(NS, 'path');
    this.g.appendChild(this.path);
    this.svg.appendChild(this.g);
    this.skip = document.getElementById('skip');
    this.sound = document.getElementById('sound');
    this.cue = document.getElementById('cue');
    this.lastBuild = -1;
    this.taglineDismissed = false;
  }

  dismissTagline() { this.taglineDismissed = true; this.taglineAt = performance.now(); }

  update(s, view) {
    // 字幕
    const cap = C.captions(s);
    for (const key of ['surface', 'actually']) {
      const el = this.caps[key], o = cap[key];
      el.style.opacity = o.toFixed(3);
      el.style.transform = `translate(-50%, ${((1 - o) * 8).toFixed(1)}px)`;
      el.setAttribute('aria-hidden', o < 0.5 ? 'true' : 'false');
    }
    let tl = cap.tagline;
    if (this.taglineDismissed) tl *= 1 - clamp((performance.now() - this.taglineAt) / 900, 0, 1);
    const tEl = this.caps.tagline;
    tEl.style.opacity = tl.toFixed(3);
    tEl.style.transform = `translate(-50%, ${((1 - Math.min(1, cap.tagline * 1.2)) * 8).toFixed(1)}px)`;
    tEl.setAttribute('aria-hidden', cap.tagline < 0.5 ? 'true' : 'false');
    // 跳过：开场里才有
    const showSkip = s.mode === 'full' && s.step !== 'free' || (s.mode === 'quick' && s.step !== 'free');
    if (this.skip.hidden === showSkip) this.skip.hidden = !showSkip;
    this.updatePulse(s, view);
  }

  // —— 脉搏线 ——
  rate(s, t) {
    // 某个故事时刻的心率（次/秒）和幅度（0..1）
    const T = s.T;
    if (T.sit == null || t < T.sit) return [1.1, 1];
    if (T.talk == null || t < T.talk) return [1.1, 1];
    if (T.reverse == null || t < T.reverse) {
      const k = clamp((t - T.talk) / 12, 0, 1);
      return [lerp(1.1, 2.2, k * k * (3 - 2 * k)), 1];
    }
    const k = clamp((t - T.reverse) / 2.4, 0, 1);
    return [lerp(2.2, 0.8, easeOut(k)), 1 - easeOut(k)];
  }
  // 从坐定开始数拍子：每拍的时间和幅度
  beats(s, until) {
    const out = [];
    let t = s.T.sit;
    if (t == null) return out;
    let guard = 0;
    while (t < until && guard++ < 4000) {
      const [r, a] = this.rate(s, t);
      out.push([t, a, 1 / r]);
      t += 1 / r;
      if (a <= 0.001 && s.T.reverse != null && t > s.T.reverse + 2.4) break;
    }
    return out;
  }
  updatePulse(s, view) {
    if (s.mode !== 'full' || s.T.sit == null) {
      this.pulse.style.opacity = '0';
      return;
    }
    const v = view.w < 640 ? 70 : 92;                 // 每秒走多少像素
    const W = view.w, H = this.pulse.clientHeight || 46;
    const now = s.now;
    // 出现、淡出
    let o = span(now - s.T.sit, 0.3, 1.0);
    if (s.T.settle != null) o *= 1 - span(now - s.T.settle, 1.0, 2.6);
    if (s.step === 'free') o = 0;
    this.pulse.style.opacity = (o * 0.62).toFixed(3);
    if (o <= 0) return;
    // 每 0.25 秒重画一次路径（路径用"故事时间 × 速度"做横坐标，重画不会让已有的线动）；平时只改平移
    const key = Math.floor(now * 4) + (s.T.reverse ?? 0) * 1000;
    if (key !== this.lastBuild) {
      this.lastBuild = key;
      const from = now - W / v - 1, to = now + 1.2;
      const beats = this.beats(s, to + 1);
      const base = H * 0.7, amp = H * 0.5;
      const step = 3 / v;                             // 每 3 像素一个点
      let d = '';
      for (let t = Math.max(s.T.sit, from); t <= to; t += step) {
        let y = 0;
        for (let i = beats.length - 1; i >= 0; i--) {
          const [bt, a, per] = beats[i];
          if (bt > t) continue;
          const x = (t - bt) / Math.min(per, 0.9);
          if (x > 1.2) break;
          y += a * (Math.exp(-(((x - 0.16) / 0.075) ** 2)) + 0.38 * Math.exp(-(((x - 0.42) / 0.09) ** 2)));
        }
        d += (d ? 'L' : 'M') + ((t - s.T.sit) * v).toFixed(1) + ' ' + (base - y * amp).toFixed(1);
      }
      this.path.setAttribute('d', d);
    }
    const x = W - (now - s.T.sit) * v;
    this.g.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
  }

  setMuted(m) {
    this.sound.setAttribute('aria-pressed', String(!m));
    this.sound.setAttribute('aria-label', m ? '声音：关（点一下打开）' : '声音：开（点一下关掉）');
  }

  // 录音笔旁边的提示
  showCue(text, box, o) {
    const el = this.cue;
    if (!box || o <= 0.001) { el.style.opacity = '0'; return; }
    if (el.textContent !== text) el.textContent = text;
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = box.x + box.w + 14, y = box.y + box.h * 0.35 - h / 2;
    if (x + w > innerWidth - 12) x = box.x - w - 14;
    x = clamp(x, 8, innerWidth - w - 8); y = clamp(y, 8, innerHeight - h - 8);
    el.style.transform = `translate(${x.toFixed(1)}px, ${(y + (1 - o) * 6).toFixed(1)}px)`;
    el.style.opacity = o.toFixed(3);
  }
}
