// world/toys3d.js
// 寶箱、飛盤、力量條、箭頭、海邊的泡泡和水波、女神的對話框（3D 物件，自己畫的，不用素材）。
// 只管長什麼樣子和動畫；什麼時候出現由 world/frisbee.js 決定。
import * as THREE from 'three';

const canvasOf = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 五角星的路徑（中心 cx, cy，外半徑 R、內半徑 r） */
function starPath(ctx, cx, cy, R, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r : R;
    const x = cx + Math.cos(a) * k;
    const y = cy + Math.sin(a) * k;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

/** 飛盤正面的圖：外圈紅、內圈藍、正中央白色五角星 */
function discTexture(c) {
  const cv = canvasOf(256, 256);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = c.outer || '#d32f2f';
  ctx.beginPath(); ctx.arc(128, 128, 126, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.inner || '#1e6fd9';
  ctx.beginPath(); ctx.arc(128, 128, 82, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.star || '#ffffff';
  starPath(ctx, 128, 132, 60, 24);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 3D 的飛盤：扁扁的圓盤，邊緣深紅。radius 是半徑（公尺）。回傳 Group */
export function makeDisc(colors = {}, radius = 0.3) {
  const g = new THREE.Group();
  g.name = 'frisbee';
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.9, radius * 0.22, 24), new THREE.MeshStandardMaterial({ color: colors.rim || '#a82424', roughness: 0.6, flatShading: true }));
  rim.castShadow = true;
  g.add(rim);
  const top = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.94, 32), new THREE.MeshStandardMaterial({ map: discTexture(colors), roughness: 0.55 }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = radius * 0.115;
  g.add(top);
  return g;
}

/** 一團柔柔的光（寶箱打開時、飛盤停在沙灘邊閃一下） */
function glowTexture(color) {
  const cv = canvasOf(128, 128);
  const ctx = cv.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, color);
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}
export function makeGlow(color = 'rgba(255,214,90,0.8)', size = 2) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, depthWrite: false, opacity: 0 }));
  s.scale.set(size, size, 1);
  s.raycast = () => {};
  s.renderOrder = 7;
  return s;
}

/**
 * 寶箱：木頭箱子、金色的邊、箱蓋從後面打開、會閃亮光。
 * 回傳 { group, setOpen(k 0～1), animate(dt, t) }；group 面向 +z
 */
export function makeChest() {
  const group = new THREE.Group();
  group.name = 'chest';
  const wood = new THREE.MeshStandardMaterial({ color: '#b9773a', roughness: 0.85, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: '#7a4a22', roughness: 0.9, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: '#ffcf3f', roughness: 0.4, metalness: 0.3, flatShading: true });
  const box = (w, h, d, mat, x, y, z, parent = group) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  box(1.1, 0.6, 0.75, wood, 0, 0.3, 0);
  box(1.14, 0.1, 0.79, dark, 0, 0.05, 0);
  for (const x of [-0.42, 0.42]) box(0.1, 0.62, 0.79, gold, x, 0.31, 0);
  // 箱蓋：轉軸在後面上方
  const lid = new THREE.Group();
  lid.position.set(0, 0.6, -0.375);
  group.add(lid);
  box(1.12, 0.26, 0.77, wood, 0, 0.13, 0.385, lid);
  for (const x of [-0.42, 0.42]) box(0.1, 0.28, 0.79, gold, x, 0.13, 0.385, lid);
  box(0.18, 0.2, 0.06, gold, 0, -0.02, 0.79, lid); // 鎖
  // 裡面的光和外面的閃光
  const inner = makeGlow('rgba(255,236,140,0.9)', 1.6);
  inner.position.set(0, 0.75, 0);
  group.add(inner);
  const sparkles = [];
  for (let i = 0; i < 4; i++) {
    const s = makeGlow('rgba(255,255,200,0.9)', 0.45);
    group.add(s);
    sparkles.push(s);
  }
  let open = 0;
  return {
    group,
    lid,
    setOpen(k) {
      open = Math.max(0, Math.min(1, k));
      lid.rotation.x = -open * 1.9;
    },
    animate(dt, t) {
      // 沒打開：一閃一閃的小星星；打開：裡面亮起來
      inner.material.opacity = open * (0.75 + Math.sin(t * 6) * 0.2);
      inner.scale.setScalar(1.2 + open * 1.4);
      sparkles.forEach((s, i) => {
        const a = t * 1.3 + i * (Math.PI / 2);
        const k = (Math.sin(t * 3 + i * 1.7) + 1) / 2;
        s.position.set(Math.cos(a) * 0.75, 0.6 + k * 0.7, Math.sin(a) * 0.55);
        s.material.opacity = 0.25 + k * 0.7;
        s.scale.setScalar(0.25 + k * 0.4);
      });
    },
  };
}

/**
 * 小公主頭上的力量條：set(k) k 是 0～1（藍 → 黃 → 紅）。
 * 一張會重畫的圖（Sprite 永遠面向鏡頭，鏡頭轉角度也不會歪）。group 要放在場景裡，每一格移到小公主頭上。
 */
export function makePowerBar() {
  const group = new THREE.Group();
  const cv = canvasOf(256, 48);
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  const bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, depthTest: false, transparent: true }));
  bar.scale.set(1.3, 0.24, 1);
  bar.renderOrder = 10;
  bar.raycast = () => {};
  group.add(bar);
  let last = -1;
  const set = (k) => {
    const v = Math.round(Math.max(0, Math.min(1, k)) * 50) / 50;
    if (v === last) return;
    last = v;
    ctx.clearRect(0, 0, 256, 48);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath(); ctx.roundRect(4, 4, 248, 40, 18); ctx.fill();
    if (v > 0) {
      ctx.fillStyle = v < 0.5 ? '#5aa9e6' : v < 0.99 ? '#f5b52a' : '#e2453a';
      ctx.beginPath(); ctx.roundRect(10, 10, Math.max(20, 236 * v), 28, 13); ctx.fill();
    }
    ctx.lineWidth = 5; ctx.strokeStyle = '#3b2a30';
    ctx.beginPath(); ctx.roundRect(4, 4, 248, 40, 18); ctx.stroke();
    tex.needsUpdate = true;
  };
  set(0);
  group.visible = false;
  return { group, set };
}

/** 飛盤上方往下指的黃色箭頭（附近沒有狗，要小公主自己去撿） */
export function makeArrow() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffcf3f', roughness: 0.5, flatShading: true, emissive: '#7a5200' });
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 4), mat);
  head.rotation.x = Math.PI;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), mat);
  tail.position.y = 0.45;
  head.raycast = () => {};
  tail.raycast = () => {};
  group.add(head, tail);
  group.visible = false;
  return {
    group,
    /** 轉圈、上下跳；回傳這一格要往上多少 */
    animate(t) { group.rotation.y = t * 2; return Math.sin(t * 5) * 0.18; },
  };
}

/**
 * 漫畫對話框（女神說的話）：白底、深色框、下面一個小尾巴。text 用「，」換行。
 * 回傳 Sprite（寬 w 公尺）
 */
export function makeSpeech(text, w = 4.2) {
  const lines = String(text || '').split(/(?<=，)/).filter(Boolean);
  const cv = canvasOf(640, 120 + lines.length * 76);
  const ctx = cv.getContext('2d');
  const H = cv.height - 44;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3b2a30';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(8, 8, 624, H - 8, 46);
  ctx.moveTo(290, H);
  ctx.lineTo(320, cv.height - 6);
  ctx.lineTo(350, H);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(292, H - 10, 56, 14); // 把框和尾巴接起來
  ctx.fillStyle = '#2f5f8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 58px "LXGW WenKai TC", "Noto Sans TC", sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, 320, 8 + (H - 8) / 2 + (i - (lines.length - 1) / 2) * 76, 580));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, depthTest: false, transparent: true }));
  s.scale.set(w, w * (cv.height / 640), 1);
  s.renderOrder = 12;
  s.raycast = () => {};
  return s;
}

/** 海上的水波（一圈一圈往外散）和冒泡：update(k) k 從 0 到 1，strength 是多明顯 */
export function makeSplash() {
  const group = new THREE.Group();
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2), mat);
    r.position.y = 0.2;
    group.add(r);
    rings.push(r);
  }
  const bubbles = [];
  const bmat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, roughness: 0.2 });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.08 + (i % 3) * 0.04, 8, 6), bmat);
    b.userData.a = (i / 9) * Math.PI * 2;
    b.userData.r = 0.3 + (i % 4) * 0.22;
    b.userData.s = 0.8 + (i % 5) * 0.25;
    group.add(b);
    bubbles.push(b);
  }
  group.visible = false;
  return {
    group,
    /** wave：水波 0～1（0 = 沒有）、bubble：泡泡 0～1、t：時間 */
    update(wave, bubble, t) {
      rings.forEach((r, i) => {
        const k = ((t * 0.9 + i / 3) % 1);
        r.scale.setScalar(0.6 + k * 2.4);
        r.material.opacity = wave * (1 - k) * 0.75;
      });
      bmat.opacity = 0.85 * bubble;
      for (const b of bubbles) {
        const k = ((t * b.userData.s + b.userData.a) % 1);
        b.visible = bubble > 0.01;
        b.position.set(Math.cos(b.userData.a + t) * b.userData.r, k * 0.6, Math.sin(b.userData.a + t) * b.userData.r);
        b.scale.setScalar(0.6 + k * 0.6);
      }
    },
  };
}
