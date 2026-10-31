// 转头：电脑上鼠标拖动；手机上陀螺仪（没有或没授权就用手指拖）；键盘方向键；Tab 到入口时自动转过去。
// 左右各约 80°，往上约 10°，往下约 5°。到边界时柔和减速：离边界还剩 20% 起，往外拖的位移按"剩多少"打折，
// 越近越慢，永远到不了边；放手后的惯性同样打折，所以是慢慢停住，不是撞墙。往回拖不打折。
// 所有动画按时间算（dt），不按帧数。
import { clamp, lerp, DEG } from './geom.js';

export class Look {
  constructor(el, cfg, { reduced }) {
    this.el = el;
    this.cfg = cfg;
    this.reduced = reduced;
    this.yaw = 0; this.pitch = 0;               // 拖动/键盘/自动转头这一路（度；yaw 右正，pitch 上正，相对正前方俯 neutralPitch）
    this.vy = 0; this.vp = 0;                   // 惯性速度（度/秒）
    this.target = null;                         // 自动转头的目标
    this.gyro = { on: false, ref: null, yaw: 0, pitch: 0, sy: 0, sp: 0, last: 0, seen: false };
    this.dragging = null;
    this.moved = 0;                             // 这次按下以后拖了多远（像素），用来区分"拖"和"点"
    this.lastInput = 0;
    this.limits = { yaw: cfg.yawLimit, up: cfg.pitchUp, down: cfg.pitchDown };
    this.view = { hfov: 70, vfov: 50, w: 1, h: 1 };
    this.listeners = new Set();
    this._bind();
  }

  on(fn) { this.listeners.add(fn); }
  _emit(type) { for (const fn of this.listeners) fn(type); }

  _bind() {
    const el = this.el;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (e.target.closest('[data-nodrag]')) return;
      this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), samples: [] };
      this.moved = 0;
      this.vy = this.vp = 0;
      this.target = null;
      this._emit('dragstart');
    });
    window.addEventListener('pointermove', e => {
      const d = this.dragging;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      this.moved += Math.hypot(dx, dy);
      if (this.moved > 4 && !d.captured) {
        d.captured = true;
        try { this.el.setPointerCapture(e.pointerId); } catch (_) { /* 有的指针不能捕获 */ }
        this.el.classList.add('is-dragging');
      }
      if (!d.captured) return;
      // 内容跟着手走：往右拖，画面往右移，也就是往左看
      const degX = -dx * this.view.hfov / this.view.w;
      const degY = dy * this.view.vfov / this.view.h;
      this._push(degX, degY);
      const now = performance.now();
      d.samples.push([now, degX, degY]);
      while (d.samples.length && now - d.samples[0][0] > 90) d.samples.shift();
      this.lastInput = now;
    });
    const end = e => {
      const d = this.dragging;
      if (!d || d.id !== e.pointerId) return;
      this.dragging = null;
      this.el.classList.remove('is-dragging');
      if (d.captured && !this.reduced && d.samples.length > 1) {
        const span = (d.samples[d.samples.length - 1][0] - d.samples[0][0]) / 1000 || 0.016;
        const sx = d.samples.reduce((a, s) => a + s[1], 0), sy = d.samples.reduce((a, s) => a + s[2], 0);
        this.vy = clamp(sx / span, -240, 240);
        this.vp = clamp(sy / span, -120, 120);
      }
      this._emit('dragend');
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  // 往外推时打折（柔和减速）
  _push(dy, dp) {
    const L = this.eff;
    if (!L) return;
    this.yaw = this._soft(this.yaw, dy, -L.yaw, L.yaw);
    this.pitch = this._soft(this.pitch, dp, -L.down, L.up);
  }
  _soft(v, d, lo, hi) {
    if (d > 0 && hi > 0) {
      const knee = hi * 0.8;
      if (v + d > knee) {
        const before = Math.max(0, knee - v);
        let rest = d - before, x = Math.max(v, knee);
        // 剩下的位移每一小步都按"离边界还剩多少"打折
        for (let i = 0; i < 4 && rest > 0; i++) { const step = rest / (4 - i); x += step * clamp((hi - x) / (hi - knee), 0, 1); rest -= step; }
        return Math.min(x, hi - 1e-3);
      }
    } else if (d < 0 && lo < 0) {
      const knee = lo * 0.8;
      if (v + d < knee) {
        const before = Math.min(0, knee - v);
        let rest = d - before, x = Math.min(v, knee);
        for (let i = 0; i < 4 && rest < 0; i++) { const step = rest / (4 - i); x += step * clamp((x - lo) / (knee - lo), 0, 1); rest -= step; }
        return Math.max(x, lo + 1e-3);
      }
    }
    return v + d;
  }

  // 键盘：方向键转头
  nudge(dy, dp) {
    const L = this.eff || this.limits;
    const ty = clamp((this.target ? this.target.yaw : this.yaw) + dy, -L.yaw * 0.97, L.yaw * 0.97);
    const tp = clamp((this.target ? this.target.pitch : this.pitch) + dp, -L.down * 0.97, L.up * 0.97);
    this.lookAt(ty, tp);
    this.lastInput = performance.now();
  }

  // 自动转头（Tab 到入口时）：减少动态效果时直接跳过去
  lookAt(yaw, pitch, instant = this.reduced) {
    const L = this.eff || this.limits;
    const gy = this.gyro.on ? this.gyro.yaw : 0, gp = this.gyro.on ? this.gyro.pitch : 0;
    const ty = clamp(yaw - gy, -L.yaw * 0.97 - gy, L.yaw * 0.97 - gy);
    const tp = clamp(pitch - gp, -L.down * 0.97 - gp, L.up * 0.97 - gp);
    this.vy = this.vp = 0;
    if (instant) { this.yaw = ty; this.pitch = tp; this.target = null; }
    else this.target = { yaw: ty, pitch: tp };
  }

  // —— 陀螺仪 ——
  // 推门那一下调用。只在触屏设备上用陀螺仪（电脑上用鼠标拖）。
  // iOS 的授权请求必须在手势里同步发出；注册监听（浏览器要初始化传感器）挪到下一个任务，不拖长推门那一下
  async enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return 'none';
    if (!matchMedia('(pointer: coarse)').matches && !('ontouchstart' in window)) return 'desktop';
    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return 'denied';
      }
    } catch (e) { return 'denied'; }
    if (this._gyroBound) return 'ok';
    this._gyroBound = true;
    await new Promise(r => setTimeout(r, 0));
    window.addEventListener('deviceorientation', e => this._onOrient(e));
    return 'ok';
  }
  _onOrient(e) {
    if (e.alpha == null || e.beta == null || e.gamma == null) return;
    const g = this.gyro;
    const orient = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const [yaw, pitch] = deviceLook(e.alpha * DEG, e.beta * DEG, e.gamma * DEG, orient * DEG);
    g.raw = [yaw, pitch];
    g.last = performance.now();
    if (!g.seen) { g.seen = true; g.on = true; this._emit('gyro'); }
    if (!g.ref) g.ref = [yaw, pitch];
  }
  // 以当前手机朝向为"正前方"
  recenterGyro() { if (this.gyro.raw) this.gyro.ref = this.gyro.raw.slice(); this.gyro.yaw = this.gyro.pitch = this.gyro.sy = this.gyro.sp = 0; }

  // 每帧：free 是开场允许转头的程度（0..1），downMax 是视野决定的最多能往下看多少（不出画）
  update(dt, { free, downMax, upMax }) {
    const intro = this.cfg.introLook;
    const k = free <= 0.15 ? free / 0.15 : 1;
    const f2 = free <= 0.15 ? 0 : (free - 0.15) / 0.85;
    const L = {
      yaw: lerp(intro.yaw * k, this.limits.yaw, f2),
      up: Math.min(lerp(intro.pitch * k, this.limits.up, f2), upMax ?? 99),
      down: Math.min(lerp(intro.pitch * k, this.limits.down, f2), Math.max(0, downMax ?? 99)),
    };
    this.eff = L;
    // 惯性（指数衰减，按时间）+ 柔和减速
    if (!this.dragging && (Math.abs(this.vy) > 0.05 || Math.abs(this.vp) > 0.05)) {
      this._push(this.vy * dt, this.vp * dt);
      const decay = Math.exp(-dt / 0.28);
      this.vy *= decay; this.vp *= decay;
      const nearY = Math.abs(this.yaw) / Math.max(1, L.yaw);
      if (nearY > 0.8) this.vy *= Math.exp(-dt / 0.12);
    }
    // 自动转头
    if (this.target && !this.dragging) {
      const a = 1 - Math.exp(-dt / 0.2);
      this.yaw = lerp(this.yaw, this.target.yaw, a);
      this.pitch = lerp(this.pitch, this.target.pitch, a);
      if (Math.abs(this.yaw - this.target.yaw) < 0.02 && Math.abs(this.pitch - this.target.pitch) < 0.02) this.target = null;
    }
    // 陀螺仪：相对参考方向，低通滤波；转出界太多时参考方向跟着挪，往回转马上有反应
    const g = this.gyro;
    let gy = 0, gp = 0;
    if (g.on && g.raw && g.ref) {
      let dyaw = wrapDeg(g.raw[0] - g.ref[0]);
      let dp = g.raw[1] - g.ref[1];
      const over = Math.abs(dyaw) - (L.yaw + 12);
      if (over > 0) { g.ref[0] = wrapDeg(g.ref[0] + Math.sign(dyaw) * over); dyaw -= Math.sign(dyaw) * over; }
      const a = 1 - Math.exp(-dt / 0.07);
      g.sy = lerp(g.sy, dyaw, a); g.sp = lerp(g.sp, dp, a);
      gy = softClamp(g.sy, L.yaw);
      gp = g.sp >= 0 ? softClamp(g.sp, L.up) : -softClamp(-g.sp, L.down);
      g.yaw = gy; g.pitch = gp;
    }
    // 限位变小时（开场里、视野变了）慢慢拉回来，不跳
    const pull = 1 - Math.exp(-dt / 0.25);
    const ly = Math.max(0, L.yaw - Math.abs(gy)), lu = Math.max(0, L.up - Math.max(0, gp)), ld = Math.max(0, L.down + Math.min(0, gp));
    if (Math.abs(this.yaw) > ly) this.yaw = lerp(this.yaw, Math.sign(this.yaw) * ly, pull);
    if (this.pitch > lu) this.pitch = lerp(this.pitch, lu, pull);
    if (this.pitch < -ld) this.pitch = lerp(this.pitch, -ld, pull);
    return { yaw: this.yaw + gy, pitch: this.pitch + gp };
  }
}

// 超过 knee 以后渐近于 limit，导数连续（陀螺仪用：手机转多少都不会超过边界）
function softClamp(x, limit) {
  const s = Math.sign(x), a = Math.abs(x), knee = limit * 0.8;
  if (a <= knee) return x;
  const r = limit - knee;
  return s * (knee + r * (1 - Math.exp(-(a - knee) / Math.max(1e-3, r))));
}
function wrapDeg(d) { return ((d + 540) % 360) - 180; }

// 手机朝向 → 背面摄像头看出去的方向（yaw 右正、pitch 上正，度）。和 Three.js 的 DeviceOrientationControls 同一套换算。
function deviceLook(alpha, beta, gamma, orient) {
  // 欧拉角（YXZ：beta, alpha, -gamma）→ 四元数
  const c1 = Math.cos(beta / 2), s1 = Math.sin(beta / 2);
  const c2 = Math.cos(alpha / 2), s2 = Math.sin(alpha / 2);
  const c3 = Math.cos(-gamma / 2), s3 = Math.sin(-gamma / 2);
  let x = s1 * c2 * c3 + c1 * s2 * s3;
  let y = c1 * s2 * c3 - s1 * c2 * s3;
  let z = c1 * c2 * s3 - s1 * s2 * c3;
  let w = c1 * c2 * c3 + s1 * s2 * s3;
  // 乘 q1：手机背面朝前，不是顶边朝前
  const q1 = [-Math.SQRT1_2, 0, 0, Math.SQRT1_2];
  [x, y, z, w] = qmul([x, y, z, w], q1);
  // 屏幕方向
  const q0 = [0, 0, Math.sin(-orient / 2), Math.cos(-orient / 2)];
  [x, y, z, w] = qmul([x, y, z, w], q0);
  // 前方 (0,0,-1) 转到世界里
  const fx = -(2 * (x * z + w * y));
  const fy = -(2 * (y * z - w * x));
  const fz = -(1 - 2 * (x * x + y * y));
  const yaw = Math.atan2(fx, -fz) / DEG;       // 右正
  const pitch = Math.asin(clamp(fy, -1, 1)) / DEG;
  return [yaw, pitch];
}
function qmul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}
