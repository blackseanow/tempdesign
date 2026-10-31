// 空间声音。领导的声音从正前方来，挂钟在左边，鸡汤在右边咕嘟，药炉在更右边、更小声；转头时方向跟着变（听者朝向 = 镜头朝向）。
// 声音文件放在 audio/ 里就会用上（文件名见 README）；没有的用简单的合成音代替。音量默认偏低，右上角可以关。
// 必须在用户点击里调用 unlock()（推门那一下）。
import { clamp, hash } from './geom.js';
import * as C from './choreo.js';

export const SOUND_FILES = {
  leader: '领导说话（循环），从正前方来',
  clock: '挂钟滴答（一秒一下的循环）',
  soup: '鸡汤咕嘟（循环；音量随开场变大，反转后变小）',
  stove: '药炉小火（循环，更小声）',
  recorder: '按下录音笔（单次）',
  door: '推门（单次）',
};
const EXT = ['mp3'];

export class AudioScene {
  constructor({ positions, muted, base }) {
    this.positions = positions;       // { leader, clock, soup, stove, recorder }：三维坐标（米）
    this.muted = muted;
    this.base = base;
    this.ctx = null;
    this.ready = false;
    this.buffers = {};
    this.nextTick = 0; this.tickN = 0;
    this.nextSyl = 0; this.sylN = 0;
    this.nextBloop = 0; this.bloopN = 0;
    this.nextCrackle = 0;
    this.lastTalking = false;
  }

  // 用户点击里调用：建上下文、开始加载文件
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.32;
    // 轻压一下，防止叠在一起爆音
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.noise = makeNoise(ctx);
    this.bus = {};
    for (const [key, opt] of Object.entries({ leader: { gain: 0.55, ref: 1.2 }, clock: { gain: 0.42, ref: 2 }, soup: { gain: 0.55, ref: 2 }, stove: { gain: 0.22, ref: 2 }, recorder: { gain: 0.6, ref: 0.6 } })) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = opt.ref; p.rolloffFactor = 0.7;
      const pos = this.positions[key] || [0, 0, -1];
      setPos(p, pos);
      const g = ctx.createGain(); g.gain.value = opt.gain;
      g.connect(p).connect(this.master);
      this.bus[key] = { panner: p, gain: g };
    }
    // 鸡汤的底噪（小火慢炖），音量跟强度走
    this.soupBed = loopNoise(ctx, this.noise, 'lowpass', 320, 0.0, this.bus.soup.gain);
    this.stoveBed = loopNoise(ctx, this.noise, 'bandpass', 900, 0.09, this.bus.stove.gain);
    this.ready = true;
    this._loadFiles();
  }

  async _loadFiles() {
    for (const key of Object.keys(SOUND_FILES)) {
      for (const ext of EXT) {
        try {
          const res = await fetch(new URL(`audio/${key}.${ext}`, this.base));
          if (!res.ok) continue;
          const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
          this.buffers[key] = buf;
          if (['leader', 'clock', 'soup', 'stove'].includes(key)) this._startLoop(key, buf);
          break;
        } catch (e) { /* 没有这个文件：用合成音 */ }
      }
    }
  }
  _startLoop(key, buf) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g).connect(this.bus[key].gain);
    src.start();
    this.loops = this.loops || {};
    this.loops[key] = g;
  }

  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.32, t, 0.05);
    if (!m) this.ctx.resume();
  }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx && !this.muted) this.ctx.resume(); }

  // 每帧：更新听者朝向，往前排 0.25 秒的合成音
  update(s, pose) {
    if (!this.ready) return;
    const ctx = this.ctx, now = ctx.currentTime, ahead = now + 0.25;
    const L = ctx.listener;
    const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
    const fwd = [sy * cp, sp, -cy * cp], up = [-sy * sp, cp, cy * sp];
    if (L.forwardX) {
      L.forwardX.setTargetAtTime(fwd[0], now, 0.02); L.forwardY.setTargetAtTime(fwd[1], now, 0.02); L.forwardZ.setTargetAtTime(fwd[2], now, 0.02);
      L.upX.setTargetAtTime(up[0], now, 0.02); L.upY.setTargetAtTime(up[1], now, 0.02); L.upZ.setTargetAtTime(up[2], now, 0.02);
      L.positionX.setTargetAtTime(pose.pos[0], now, 0.02); L.positionY.setTargetAtTime(pose.pos[1], now, 0.02); L.positionZ.setTargetAtTime(pose.pos[2], now, 0.02);
    } else {
      L.setOrientation(...fwd, ...up); L.setPosition(...pose.pos);
    }
    const talking = C.talking(s);
    const soup = C.soup(s);
    const clockRuns = s.mode === 'full' && s.T.reverse == null && s.step !== 'free';
    const fast = s.step === 'talk';
    // 文件循环：只调音量
    if (this.loops) {
      const set = (k, v) => this.loops[k] && this.loops[k].gain.setTargetAtTime(v, now, 0.12);
      set('leader', talking ? 1 : 0); set('clock', clockRuns ? 1 : 0); set('soup', 0.25 + 0.75 * soup); set('stove', 1);
    }
    this.soupBed.gain.setTargetAtTime(this.buffers.soup ? 0 : 0.05 + 0.25 * soup, now, 0.2);
    this.stoveBed.gain.setTargetAtTime(this.buffers.stove ? 0 : 0.09, now, 0.3);

    // 领导说话：一秒 4.6 个字，每个字一个带共振峰的短音，音高随句子起伏；说话停了就不排
    if (talking && !this.buffers.leader) {
      if (!this.lastTalking) this.nextSyl = Math.max(this.nextSyl, now + 0.02);
      while (this.nextSyl < ahead) {
        const n = this.sylN++;
        if (hash(n * 3 + 1) > 0.16) this._syllable(this.nextSyl, n);
        this.nextSyl += 1 / 4.6 * (0.85 + 0.3 * hash(n * 7));
      }
    }
    this.lastTalking = talking;
    // 挂钟：一秒一下；开讲时时间飞快，三倍速；反转以后停住
    if (clockRuns && !this.buffers.clock) {
      if (this.nextTick < now) this.nextTick = now + 0.05;
      while (this.nextTick < ahead) { this._tick(this.nextTick, this.tickN++ % 2); this.nextTick += fast ? 0.33 : 1.0; }
    }
    // 鸡汤咕嘟：强度越大越密
    if (!this.buffers.soup) {
      if (this.nextBloop < now) this.nextBloop = now + 0.1;
      while (this.nextBloop < ahead) {
        const n = this.bloopN++;
        this._bloop(this.nextBloop, n, soup);
        this.nextBloop += (0.18 + 0.9 * hash(n * 13)) / (0.3 + 2.4 * soup);
      }
    }
    // 药炉：偶尔噼啪一下
    if (!this.buffers.stove) {
      if (this.nextCrackle < now) this.nextCrackle = now + 0.3;
      while (this.nextCrackle < ahead) { this._crackle(this.nextCrackle); this.nextCrackle += 0.5 + 1.6 * Math.random(); }
    }
  }

  _syllable(t, n) {
    const ctx = this.ctx;
    const dur = 0.13 + 0.09 * hash(n * 5);
    const f0 = 118 * (1 + 0.18 * Math.sin(n * 0.37) + 0.08 * (hash(n) - 0.5));
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t); osc.frequency.linearRampToValueAtTime(f0 * (0.92 + 0.12 * hash(n * 11)), t + dur);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520 + 260 * hash(n * 17); f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1300 + 600 * hash(n * 19); f2.Q.value = 6;
    const g = ctx.createGain();
    const peak = 0.55 * (0.6 + 0.4 * hash(n * 23));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.025); g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
    osc.connect(f1).connect(g); osc.connect(f2).connect(g);
    g.connect(this.bus.leader.gain);
    osc.start(t); osc.stop(t + dur + 0.2);
  }
  _tick(t, tock) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = tock ? 2300 : 3100; f.Q.value = 8;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.9, t + 0.002); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.bus.clock.gain);
    src.start(t, Math.random() * 1.5, 0.08);
  }
  _bloop(t, n, k) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sine';
    const f0 = 180 + 220 * hash(n * 29);
    osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f0 * (2.2 + hash(n)), t + 0.05);
    const g = ctx.createGain(); const peak = (0.12 + 0.5 * k) * (0.5 + 0.5 * hash(n * 31));
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(g).connect(this.bus.soup.gain);
    osc.start(t); osc.stop(t + 0.12);
  }
  _crackle(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(f).connect(g).connect(this.bus.stove.gain);
    src.start(t, Math.random() * 1.5, 0.05);
  }
  // 单次：按下录音笔、推门
  play(key) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    if (this.buffers[key]) {
      const s = ctx.createBufferSource(); s.buffer = this.buffers[key];
      s.connect(key === 'recorder' ? this.bus.recorder.gain : this.master); s.start(t);
      return;
    }
    if (key === 'recorder') {
      // 咔嗒 + 一声轻轻往上走的"嘀"
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      src.connect(f).connect(g).connect(this.bus.recorder.gain); src.start(t, 0.2, 0.06);
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(660, t + 0.06); o.frequency.exponentialRampToValueAtTime(990, t + 0.22);
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t + 0.06); g2.gain.linearRampToValueAtTime(0.25, t + 0.09); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(g2).connect(this.bus.recorder.gain); o.start(t + 0.06); o.stop(t + 0.5);
    } else if (key === 'door') {
      // 门轴吱呀：带通噪声加一个慢慢下滑的低音
      const src = ctx.createBufferSource(); src.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 12;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(420, t + 0.9);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
      src.connect(f).connect(g).connect(this.master); src.start(t, 0, 1.2);
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.9);
      const g2 = ctx.createGain(); g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.08, t + 0.1); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      o.connect(g2).connect(this.master); o.start(t); o.stop(t + 1);
    }
  }
}

function setPos(p, [x, y, z]) {
  if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
}
function makeNoise(ctx) {
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
  return buf;
}
function loopNoise(ctx, noise, type, freq, gain, out) {
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(out); src.start();
  return g;
}
