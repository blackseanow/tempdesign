// 门外：door.png 拆成"墙 + 门框（门扇处挖空）"和"门扇"两层。门扇绕右边的合页往里开（CSS 3D），推开后能看见后面的半全景。
// 先显示 0.25 倍的小图（首屏 1 秒内一定出来），高清图加载完再换上。
import * as C from './choreo.js';

export class Door {
  constructor(root, anchors, text) {
    this.root = root;
    this.stage = root.querySelector('.door-stage');
    this.leaf = root.querySelector('.door-leaf');
    this.hint = root.querySelector('.door-hint');
    this.btn = root.querySelector('.door-btn');
    this.plate = root.querySelector('.nameplate');
    this.apply(anchors, text);
    this.hidden = false;
  }

  apply(anchors, text) {
    const d = anchors.door;
    const st = this.stage.style;
    st.setProperty('--lx', d.leaf.x + '%'); st.setProperty('--ly', d.leaf.y + '%');
    st.setProperty('--lw', d.leaf.w + '%'); st.setProperty('--lh', d.leaf.h + '%');
    // 铭牌相对门扇
    const n = d.nameplate;
    st.setProperty('--nx', ((n.x - d.leaf.x) / d.leaf.w * 100) + '%');
    st.setProperty('--ny', ((n.y - d.leaf.y) / d.leaf.h * 100) + '%');
    st.setProperty('--nw', (n.w / d.leaf.w * 100) + '%');
    st.setProperty('--nh', (n.h / d.leaf.h * 100) + '%');
    st.setProperty('--hx', d.hint.x + '%'); st.setProperty('--hy', d.hint.y + '%');
    // 推门时朝门洞中心放大
    this.origin = `${d.leaf.x + d.leaf.w / 2}% ${d.leaf.y + d.leaf.h * 0.45}%`;
    this.stage.style.transformOrigin = this.origin;
    if (text) { this.plate.textContent = text.nameplate; this.hint.textContent = text.doorHint; }
  }

  // 高清图：墙两块、门扇一块
  loadHQ() {
    for (const img of this.root.querySelectorAll('img.hq')) {
      img.decoding = 'async';
      img.onload = () => { img.style.opacity = 1; };
      img.src = img.dataset.src;
    }
  }

  update(s) {
    const d = C.door(s);
    if (!d.visible) {
      if (!this.hidden) { this.root.hidden = true; this.hidden = true; }
      return;
    }
    if (this.hidden) { this.root.hidden = false; this.hidden = false; }
    // 门扇往里开：以右边的合页为轴，左边往屋里转（CSS 里 rotateY 取负值时左边远离观众），开到约 88° 贴着门框
    this.leaf.style.transform = `rotateY(${(-d.leaf / 100 * 88).toFixed(2)}deg)`;
    this.stage.style.transform = `translate(-50%,-50%) scale(${d.scale.toFixed(4)})`;
    this.root.style.opacity = d.opacity.toFixed(3);
    this.hint.style.opacity = d.hint.toFixed(3);
    this.root.style.pointerEvents = s.step === 'door' ? 'auto' : 'none';
    // 门开着的时候露出后面：门外整幅的背景色去掉，门洞里是画布
    this.root.style.background = s.step === 'door' ? '' : 'transparent';
  }
}
