// 第二阶段"让场景活起来"：代码画的细节和差分贴片。都在渲染 Worker 里。
// - 差分贴片：说话时嘴在张、闭之间切换（跟着说话声的节奏），每隔几秒眨一次眼，按录音笔时切成按下
// - 霞鹜文楷写的字：日历、两面锦旗、两块木牌、几个档案盒标签（横匾、抽屉标签在 core.js 里）
// - 热气：盖碗、鸡汤锅、药罐；开讲时鸡汤的热气越来越多，反转后慢慢平静；药炉冒热气表示有材料在生成
// - 开讲时桌面上一道淡淡的阳光，跟着挂钟从右往左移（只照在桌面木头上：模板缓冲遮罩）
// - 录音笔指示灯：按下以后一呼一吸地亮着
// 颜色只用竹纸、素笺、松烟墨、函套青、古铜金。只动位移、旋转、缩放、透明度，按时间算。
import * as C from '../choreo.js';
import { span, lerp, easeOut, easeInOut, hash, clamp } from '../geom.js';

const INK = '#24231F', SHEET = '#F8F7F2', PAPER = '#ECEAE1', INDIGO = '#1F3A4D', GOLD = '#C9A86A';
const CN_MONTH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const CN_WEEK = ['日', '一', '二', '三', '四', '五', '六'];

// 档案盒标签（20 个里挑几个写字）：[第几个, 主标题, 小字]
const ARCHIVE = [
  [0, '年度总结', '第七稿'],
  [2, '汇报材料', '终版'],
  [6, '整改方案', '第三版'],
  [9, '会议纪要', '待签'],
  [12, '述职报告', '改'],
  [16, '工作计划', '修订'],
  [18, '经验交流', '第二稿'],
];

// —— 字（随锚点一起重建）——
export function build(ctx) {
  const { addDecal, anchors, textCanvas, FONT_KAI, init } = ctx;
  const info = init.details || {};
  const T = anchors.texts;
  // 手撕日历：月份、日期（函套青）、星期、今天宜什么
  const now = new Date();
  addDecal('calendar', T.calendar.rect, 'far', (g, w, h) => {
    g.clearRect(0, 0, w, h);
    textCanvas(g, w, h * 0.2, `${CN_MONTH[now.getMonth()]}月`, { family: FONT_KAI, color: INK, size: h * 0.12, clear: false, dy: 0.2 });
    g.save(); g.translate(0, h * 0.17);
    textCanvas(g, w, h * 0.42, String(now.getDate()), { family: FONT_KAI, color: INDIGO, size: h * 0.36, clear: false });
    g.restore();
    g.save(); g.translate(0, h * 0.58);
    textCanvas(g, w, h * 0.14, `星期${CN_WEEK[now.getDay()]}`, { family: FONT_KAI, color: INK, size: h * 0.09, clear: false });
    g.restore();
    if (info.yi) {
      g.save(); g.translate(0, h * 0.74);
      textCanvas(g, w, h * 0.16, `宜${info.yi}`, { family: FONT_KAI, color: INK, size: h * 0.085, clear: false, fit: 0.86 });
      g.restore();
    }
  }, { res: 6 });
  // 两面锦旗：古铜金字。上款"赠 某某同志"，中间四个大字，下款"某某 敬赠"
  const banners = info.banners || [{ phrase: '妙手回春', from: '王建国' }, { phrase: '药到病除', from: '李明' }];
  ['banner-l', 'banner-r'].forEach((key, i) => {
    const b = banners[i % banners.length];
    addDecal(key, T[key].rect, 'far', (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.save(); g.translate(w * 0.76, 0);
      textCanvas(g, w * 0.2, h * 0.36, `赠${info.user || '张伟'}同志`, { family: FONT_KAI, color: GOLD, size: w * 0.12, vertical: true, clear: false, tracking: 0.05 });
      g.restore();
      g.save(); g.translate(0, h * 0.06);
      textCanvas(g, w, h * 0.66, b.phrase, { family: FONT_KAI, color: GOLD, size: w * 0.34, vertical: true, clear: false, tracking: 0.12 });
      g.restore();
      g.save(); g.translate(w * 0.04, h * 0.5);
      textCanvas(g, w * 0.2, h * 0.32, `${b.from}敬赠`, { family: FONT_KAI, color: GOLD, size: w * 0.11, vertical: true, clear: false, tracking: 0.05 });
      g.restore();
    }, { res: 5 });
  });
  // 两块竖木牌
  addDecal('board-doctor', T['board-doctor'].rect, 'far', (g, w, h) => textCanvas(g, w, h, '先生坐诊', { family: FONT_KAI, color: INK, size: w * 0.7, vertical: true, tracking: 0.12 }), { res: 7 });
  addDecal('board-order', T['board-order'].rect, 'far', (g, w, h) => textCanvas(g, w, h, '医嘱随访', { family: FONT_KAI, color: INK, size: w * 0.7, vertical: true, tracking: 0.12 }), { res: 7 });
  // 档案盒标签：主标题竖排，下面一行小字
  for (const [i, title, note] of ARCHIVE) {
    const a = T.archive[i];
    if (!a) continue;
    addDecal('archive-' + i, a.rect, 'far', (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const mainH = h * (note ? 0.68 : 0.9);
      textCanvas(g, w, mainH, title, { family: FONT_KAI, color: INK, size: w * 0.66, vertical: true, clear: false, tracking: 0.02 });
      if (note) {
        g.save(); g.translate(0, mainH);
        textCanvas(g, w, h - mainH, note, { family: FONT_KAI, color: INK, size: w * 0.44, vertical: true, clear: false, tracking: 0 });
        g.restore();
      }
    }, { res: 6 });
  }
}

// —— 贴片、热气、阳光、指示灯（建一次）——
export async function init(ctx) {
  const { THREE, anchors, pano, Rf, Rn, cylGeometry, material, texFrom, bitmap, quad, groups, env, init: initMsg } = ctx;
  const out = { patches: {}, steam: [], ready: false };
  const reduced = !!initMsg.reduced;

  // 差分贴片：和近层同一个圆柱、同一套映射，叠在近层上面（不做深度测试，不会和近层打架）
  const pm = initMsg.patches || {};
  for (const [name, p] of Object.entries(pm)) {
    if (name === 'desk-mask') continue;
    try {
      const bmp = await bitmap(p.file);
      const r = pano.pctToPx(p.rect);
      const m = new THREE.Mesh(cylGeometry(Rn, r.x, r.x + r.w, r.y, r.y + r.h, 3), material(texFrom(bmp, { mip: true }), { depthTest: false }));
      m.renderOrder = 14;
      m.visible = false;
      groups.near.add(m);
      out.patches[name] = m;
    } catch (e) { /* 没有贴片就不切换 */ }
    await env.idle();
  }

  // 桌上的阳光：先用桌面木头的遮罩写模板缓冲，阳光只画在模板 = 1 的地方
  if (pm['desk-mask']) {
    try {
      const bmp = await bitmap(pm['desk-mask'].file);
      const r = pano.pctToPx(pm['desk-mask'].rect);
      const maskMat = new THREE.MeshBasicMaterial({ map: texFrom(bmp, { mip: false }), transparent: true, alphaTest: 0.5, colorWrite: false, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
        stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp });
      const mask = new THREE.Mesh(cylGeometry(Rn, r.x, r.x + r.w, r.y, r.y + r.h, 2), maskMat);
      mask.renderOrder = 12;
      groups.near.add(mask);
      // 阳光：一条斜着的、边缘很软的光带（素笺色），宽约 120 px（1x），盖住桌面那几行；绕圆柱轴转动 = 在桌上左右移动
      const cv = new env.OffscreenCanvas(256, 512);
      const g = cv.getContext('2d');
      for (let y = 0; y < 512; y++) {
        const shift = (y / 512) * 70;                                // 越往下越往左偏：从右上方的窗户斜照进来
        const grad = g.createLinearGradient(0, 0, 256, 0);
        const c = 128 - 35 + shift * 0.5;
        grad.addColorStop(0, 'rgba(248,247,242,0)');
        grad.addColorStop(clamp((c - 70) / 256, 0, 1), 'rgba(248,247,242,0)');
        grad.addColorStop(clamp(c / 256, 0, 1), 'rgba(248,247,242,1)');
        grad.addColorStop(clamp((c + 46) / 256, 0, 1), 'rgba(248,247,242,1)');
        grad.addColorStop(clamp((c + 110) / 256, 0, 1), 'rgba(248,247,242,0)');
        grad.addColorStop(1, 'rgba(248,247,242,0)');
        g.fillStyle = grad;
        g.fillRect(0, y, 256, 1);
      }
      const bandW = 240;                                              // 1x 像素
      const cx = r.x + r.w / 2;
      const bandMat = material(texFrom(cv, { mip: true }), { opacity: 0, depthTest: false });
      Object.assign(bandMat, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp });
      const band = new THREE.Mesh(cylGeometry(Rn - 0.001, cx - bandW / 2, cx + bandW / 2, r.y, r.y + r.h, 2), bandMat);
      band.renderOrder = 13;
      groups.near.add(band);
      // 从桌子右边（录音笔、茶碗那头）走到左边（处方笺那头）
      out.sun = { band, from: pano.yawOf(1560) - pano.yawOf(cx), to: pano.yawOf(520) - pano.yawOf(cx) };
    } catch (e) { /* 没有遮罩就不画阳光 */ }
  }

  // 录音笔指示灯：古铜金的小点 + 一圈很淡的光晕
  {
    const cv = new env.OffscreenCanvas(64, 64);
    const g = cv.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(201,168,106,1)');
    rg.addColorStop(0.28, 'rgba(201,168,106,1)');
    rg.addColorStop(0.36, 'rgba(201,168,106,0.45)');
    rg.addColorStop(1, 'rgba(201,168,106,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    const p = anchors.points.recorderLight;
    const u = p.x / 100 * pano.W, v = p.y / 100 * pano.H;
    const s = 7;                                                      // 1x 像素
    const light = new THREE.Mesh(cylGeometry(Rn - 0.002, u - s, u + s, v - s, v + s, 4), material(texFrom(cv, { mip: true }), { depthTest: false, blending: THREE.AdditiveBlending }));
    light.renderOrder = 15;
    groups.near.add(light);
    out.light = light;
  }

  // 热气：几种弯弯的细烟（松烟墨，很淡），从锅口、碗口往上飘
  const wisps = [0, 1, 2].map(k => {
    const cv = new env.OffscreenCanvas(64, 256);
    const g = cv.getContext('2d');
    g.lineCap = 'round';
    g.strokeStyle = INK;
    const amp = 10 + k * 4, ph = k * 1.7;
    for (let i = 0; i < 40; i++) {
      const t0 = i / 40, t1 = (i + 1) / 40;
      const x0 = 32 + Math.sin(t0 * Math.PI * 2.2 + ph) * amp * t0, x1 = 32 + Math.sin(t1 * Math.PI * 2.2 + ph) * amp * t1;
      g.lineWidth = 1 + 4.2 * Math.sin(Math.PI * t0);                 // 两头细，中间粗
      g.globalAlpha = Math.sin(Math.PI * t0);
      g.beginPath(); g.moveTo(x0, 250 - t0 * 240); g.lineTo(x1, 250 - t1 * 240); g.stroke();
    }
    return texFrom(cv, { mip: true });
  });
  const emitters = [
    { key: 'teabowl', layer: 'near', w: 0.045, rise: 0.11, gap: 0.55, life: 2.6, max: 6, alpha: 0.32 },
    { key: 'soupPot', layer: 'far', w: 0.13, rise: 0.36, gap: 0.22, life: 2.4, max: 12, alpha: 0.4 },
    { key: 'medPot', layer: 'far', w: 0.14, rise: 0.38, gap: 0.42, life: 2.8, max: 8, alpha: 0.32 },
  ];
  for (const em of emitters) {
    const a = anchors.fx[em.key];
    if (!a || !a.steam) continue;
    const R = (em.layer === 'near' ? Rn : Rf) - (em.layer === 'near' ? 0.03 : 0.08);
    const u = a.steam.x / 100 * pano.W, v = a.steam.y / 100 * pano.H;
    const yaw = pano.yawOf(u);
    em.base = new THREE.Vector3(R * Math.sin(yaw), pano.heightOf(v, R + (em.layer === 'near' ? 0.03 : 0.08)), -R * Math.cos(yaw));
    em.meshes = [];
    for (let i = 0; i < em.max; i++) {
      const m = new THREE.Mesh(quad(), material(wisps[i % 3], { opacity: 0, depthTest: em.layer === 'far' }));
      m.renderOrder = em.layer === 'near' ? 16 : 6;
      m.visible = false;
      groups.fx.add(m);
      em.meshes.push(m);
    }
    out.steam.push(em);
  }
  out.reduced = reduced;
  out.ready = true;
  return out;
}

// 每帧
export function update(ctx, D, s, amb, mouthLevel) {
  if (!D || !D.ready) return;
  const { THREE, camera } = ctx;
  const P = D.patches;
  // 嘴：说话时跟着音节张合（choreo.mouth 和声音用同一套节奏）；不说话时闭嘴
  // 有真实的说话声文件时，主线程按音量给 mouthLevel（0/1）；否则用和合成说话声同一套音节节拍
  const open = mouthLevel == null ? C.mouth(s, amb) : (C.talking(s) ? mouthLevel : 0);
  if (P['mouth-closed']) P['mouth-closed'].visible = open === 0;
  // 眨眼：每 3–5 秒一次（减少动态效果时不眨）
  if (P['eyes-closed']) P['eyes-closed'].visible = !D.reduced && C.blink(amb) === 1;
  // 按下录音笔
  if (P.press) P.press.visible = C.pressed(s);
  // 阳光：开讲时淡入，跟着挂钟从右往左；钟停了它也停
  if (D.sun) {
    const k = C.sun(s);
    const vis = s.mode !== 'full' ? 1 : (s.T.talk == null ? 0 : span(s.now - s.T.talk, 0, 1.5));
    D.sun.band.material.opacity = 0.34 * vis;
    D.sun.band.visible = vis > 0.003;
    D.sun.band.rotation.y = -(D.sun.from + (D.sun.to - D.sun.from) * k);
  }
  // 指示灯：按下以后一呼一吸（1.6 秒一周）；按下以前很暗
  if (D.light) {
    const on = s.mode !== 'full' || (s.T.reverse != null && s.now >= s.T.reverse);
    const breath = D.reduced ? 1 : 0.62 + 0.38 * Math.sin(amb * Math.PI * 2 / 1.6);
    D.light.material.opacity = on ? breath : 0.12;
  }
  // 热气
  const t = D.reduced ? 7.3 : amb;                                    // 减少动态效果：定格
  const soupK = C.soup(s);
  const medK = (ctx.init.details && ctx.init.details.treating) ? 0.8 : 0;
  for (const em of D.steam) {
    const k = em.key === 'soupPot' ? soupK : em.key === 'medPot' ? medK : 0.7;
    // 强度越大，粒子越密：每隔 gap 秒出生一个，按强度决定这个粒子要不要出现
    const gap = em.key === 'soupPot' ? lerp(0.5, em.gap, soupK) : em.gap;
    const newest = Math.floor(t / gap);
    em.meshes.forEach((m, j) => {
      const i = newest - j;
      const born = i * gap;
      const age = (t - born) / em.life;
      const show = age >= 0 && age < 1 && hash(i * 13 + em.key.length) < k;
      if (!show) { m.visible = false; return; }
      const sway = Math.sin(age * 3 + hash(i) * 6) * em.w * 0.35;
      m.position.set(em.base.x, em.base.y + em.rise * easeOut(age), em.base.z);
      // 横向漂一点（沿圆柱切线方向）
      const yaw = Math.atan2(em.base.x, -em.base.z);
      m.position.x += Math.cos(yaw) * (sway + (hash(i + 3) - 0.5) * em.w * 0.6);
      m.position.z += Math.sin(yaw) * (sway + (hash(i + 3) - 0.5) * em.w * 0.6);
      m.quaternion.copy(camera.quaternion);
      const sc = lerp(0.7, 1.35, age);
      m.scale.set(em.w * sc * (hash(i + 9) > 0.5 ? 1 : -1), em.w * 3.2 * sc, 1);
      m.material.opacity = em.alpha * span(age, 0, 0.18) * (1 - span(age, 0.55, 1)) * (0.6 + 0.4 * k);
      m.visible = m.material.opacity > 0.003;
    });
  }
}
