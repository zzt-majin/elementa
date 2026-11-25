// world/buildings.js
// 島上的可愛低多邊形模型：測驗塔、學習屋、遊戲帳篷、建造中告示牌、樹、文字牌。
// 顏色全部從參數傳進來，這裡不寫死配色。
import * as THREE from 'three';

const mats = new Map();
/** 同一個顏色共用一個材質，省記憶體 */
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra);
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra }));
  }
  return mats.get(key);
}

function mesh(geo, material, { x = 0, y = 0, z = 0, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function flag(color, height) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), mat('#8a6a55'), { y: height + 0.45 }));
  const cloth = mesh(new THREE.BoxGeometry(0.55, 0.32, 0.04), mat(color), { x: 0.3, y: height + 0.72 });
  cloth.name = 'flag';
  g.add(cloth);
  return g;
}

/** 測驗塔：圓塔＋尖屋頂＋旗子 */
export function makeTower(c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.95, 1.1, 0.5, 10), mat(c.rock), { y: 0.25 }));
  g.add(mesh(new THREE.CylinderGeometry(0.8, 0.9, 3, 10), mat(c.wall), { y: 2 }));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.3, 10), mat(c.soft), { y: 3.6 }));
  g.add(mesh(new THREE.ConeGeometry(1.1, 1.8, 10), mat(c.main), { y: 4.65 }));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.42, 0.1), mat(c.deep), { x: Math.sin(a) * 0.82, y: 2.6, z: Math.cos(a) * 0.82, ry: a }));
  }
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.75, 0.1), mat(c.wood), { y: 0.85, z: 0.86 }));
  g.add(flag(c.main, 5.5));
  return g;
}

/** 學習屋：方屋＋斜屋頂＋小煙囪 */
export function makeHouse(c) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2, 1.5, 1.7), mat(c.wall), { y: 0.75 }));
  const roof = mesh(new THREE.ConeGeometry(1.75, 1.2, 4), mat(c.main), { y: 2.1 });
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.95);
  g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.6, 0.3), mat(c.rock), { x: 0.55, y: 2.3, z: -0.3 }));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.8, 0.08), mat(c.wood), { y: 0.4, z: 0.86 }));
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.4, 0.08), mat(c.deep), { x: -0.6, y: 0.95, z: 0.86 }));
  g.add(mesh(new THREE.BoxGeometry(0.45, 0.4, 0.08), mat(c.deep), { x: 0.6, y: 0.95, z: 0.86 }));
  return g;
}

/** 遊戲帳篷：條紋圓錐帳篷 */
export function makeTent(c) {
  const g = new THREE.Group();
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const r0 = 1.45 * (1 - i / layers);
    const r1 = 1.45 * (1 - (i + 1) / layers);
    const h = 0.55;
    g.add(mesh(new THREE.CylinderGeometry(r1 + 0.001, r0, h, 12), mat(i % 2 ? c.wall : c.main), { y: 0.1 + i * h + h / 2 }));
  }
  g.add(mesh(new THREE.ConeGeometry(0.42, 0.6, 3), mat(c.deep), { y: 0.3, z: 1.12 }));
  g.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), mat(c.soft), { y: 2.45 }));
  g.add(flag(c.soft, 2.4));
  return g;
}

/** 建造中：木頭告示牌＋小木箱＋三角錐 */
export function makeConstruction(c, labelText) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mat(c.wood), { x: -0.9, y: 0.9 }));
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 6), mat(c.wood), { x: 0.9, y: 0.9 }));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(labelText, { bg: c.construction, fg: c.label, w: 512, h: 210, size: 104 }) }));
  board.position.set(0, 1.45, 0.1);
  g.add(board);
  g.add(mesh(new THREE.BoxGeometry(2.3, 1.0, 0.12), mat(c.wood), { y: 1.45, z: -0.0 }));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), mat(c.wood), { x: 1.8, y: 0.35, z: 0.8, ry: 0.4 }));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat(c.construction), { x: 1.6, y: 0.95, z: 0.7, ry: 0.9 }));
  g.add(mesh(new THREE.ConeGeometry(0.28, 0.7, 8), mat('#ff9a5a'), { x: -1.7, y: 0.35, z: 1 }));
  return g;
}

/** 樹：樹幹＋圓圓的樹冠 */
export function makeTree(c, scale = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.9, 6), mat(c.wood), { y: 0.45 }));
  g.add(mesh(new THREE.IcosahedronGeometry(0.62, 0), mat(c.grassDark), { y: 1.2 }));
  g.add(mesh(new THREE.IcosahedronGeometry(0.42, 0), mat(c.grass), { x: 0.25, y: 1.55, z: 0.1 }));
  g.scale.setScalar(scale);
  return g;
}

/** 浮在島上方的名字牌 */
export function makeLabel(text, c, { sub = '', width = 6 } = {}) {
  const tex = textTexture(text, { fg: c.label, bg: 'rgba(255,255,255,0.92)', w: 512, h: sub ? 200 : 150, size: 84, sub, round: true, border: c.main });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(width, width * (tex.image.height / tex.image.width), 1);
  sprite.renderOrder = 10;
  return sprite;
}

/** 用 2D 畫布畫文字，變成貼圖 */
export function textTexture(text, { fg, bg, w, h, size, sub = '', round = false, border = '' }) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  if (round) {
    const r = h * 0.32;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, r);
    ctx.fill();
    if (border) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  } else {
    ctx.fillRect(0, 0, w, h);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px "LXGW WenKai TC", "Noto Sans TC", sans-serif`;
  ctx.fillText(text, w / 2, sub ? h * 0.4 : h / 2 + 4, w - 40);
  if (sub) {
    ctx.font = `500 ${Math.round(size * 0.45)}px "Noto Sans TC", sans-serif`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(sub, w / 2, h * 0.76, w - 40);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
