// world/bridges.js
// 島和島之間的橋（世界設定第 4 步）：
//   還沒蓋：海上兩條虛線標出橋的位置，中間一個浮標「蓋橋」，點它打開建設面板。
//   蓋好：木板一片一片長出來，兩邊有欄杆，小公主可以走過去。
//   還沒連上的島：周圍一圈淡淡的霧。
// 數字都從 config/world.json 的 bridge 來；顏色從 theme 的場景色＋公主色來。
import * as THREE from 'three';
import { mat, textTexture } from './buildings.js';

const TOP = 0.9; // 草地表面的高度（和 islands.js 一樣），橋面也在這個高度

export const BRIDGE_DEFAULTS = {
  width: 3, // 橋面寬（公尺）
  overlap: 1.5, // 兩頭伸進草地多深
  plank: 0.9, // 一片木板多長（沿著橋）
  gap: 0.12, // 木板之間的縫
  postEvery: 3, // 每幾片木板一根欄杆柱
  growSeconds: 3, // 蓋橋動畫幾秒
  dash: 1.4, // 虛線一段多長
  dashGap: 1.0,
  deck: '#d9a86c',
  rail: '#b07a4f',
  dashColor: '#ffffff',
  mist: { opacity: 0.32, height: 10, extra: 1.06, color: '#ffffff' },
};

export function bridgeConfig(raw = {}) {
  const c = { ...BRIDGE_DEFAULTS, ...(raw || {}) };
  c.mist = { ...BRIDGE_DEFAULTS.mist, ...((raw && raw.mist) || {}) };
  return c;
}

/**
 * 一座橋在世界裡的位置（純計算）。from／to 是 subjects.json 的兩座島；island 是 world.json 的 island。
 * 回傳 a、b（兩頭，在草地裡）、u（方向）、len、half（半寬）、seaFrom／seaTo（從 a 量起，哪一段在海上）
 */
export function bridgeLine(from, to, island, cfg) {
  const base = island?.radius || 5.2;
  const rA = base * (from.size || 1);
  const rB = base * (to.size || 1);
  const [x1, z1] = from.position;
  const [x2, z2] = to.position;
  const d = Math.hypot(x2 - x1, z2 - z1) || 1;
  const u = { x: (x2 - x1) / d, z: (z2 - z1) / d };
  const eA = rA * 0.84 - cfg.overlap; // 草地半徑 = 島半徑 × 0.84（islands.js）
  const eB = rB * 0.84 - cfg.overlap;
  const a = { x: x1 + u.x * eA, z: z1 + u.z * eA };
  const b = { x: x2 - u.x * eB, z: z2 - u.z * eB };
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return { a, b, u, len, half: cfg.width / 2, seaFrom: rA - eA, seaTo: d - rB - eA, mid: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } };
}

/** 走路用的長條地（avatar/walk.js 的 strip） */
export function bridgeStrip(line) {
  return { type: 'strip', ax: line.a.x, az: line.a.z, bx: line.b.x, bz: line.b.z, half: line.half };
}

/** 把群組放在 a、讓它的 +z 朝向 b */
function placeAlong(g, line) {
  g.position.set(line.a.x, 0, line.a.z);
  g.rotation.y = Math.atan2(line.u.x, line.u.z);
}

function box(w, h, l, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * 蓋好的橋。回傳 { group, grow(p) }：p 從 0 到 1，木板一片一片出現（最新那片從上面落下來）。
 * 一開始就蓋好的橋直接 grow(1)。
 */
export function makeBridge(line, colors, cfg, key) {
  const g = new THREE.Group();
  placeAlong(g, line);
  g.userData = { bridge: key, built: true };
  const step = cfg.plank + cfg.gap;
  const n = Math.max(1, Math.ceil(line.len / step));
  const planks = [];
  const deck = mat(cfg.deck);
  const rail = mat(cfg.rail);
  for (let i = 0; i < n; i++) {
    const p = box(cfg.width, 0.18, cfg.plank, deck, 0, TOP - 0.09, i * step + cfg.plank / 2);
    p.rotation.z = ((i * 7) % 3 - 1) * 0.015; // 木板稍微歪一點，比較可愛
    g.add(p);
    const posts = [];
    if (i % cfg.postEvery === 0 || i === n - 1) {
      for (const side of [-1, 1]) {
        const post = box(0.16, 0.8, 0.16, rail, side * (line.half - 0.08), TOP + 0.4, i * step + cfg.plank / 2);
        g.add(post);
        posts.push(post);
      }
    }
    planks.push({ mesh: p, posts, z: i * step });
  }
  // 欄杆：兩條長木條，長度跟著動畫拉長
  const rails = [-1, 1].map((side) => {
    const geo = new THREE.BoxGeometry(0.12, 0.1, 1);
    geo.translate(0, 0, 0.5); // 原點在一頭，scale.z 就是長度
    const r = new THREE.Mesh(geo, rail);
    r.position.set(side * (line.half - 0.08), TOP + 0.75, 0);
    r.castShadow = true;
    g.add(r);
    return r;
  });
  g.traverse((o) => { o.userData.bridge = key; });

  function grow(p) {
    const k = Math.max(0, Math.min(1, p));
    const shown = k * n;
    planks.forEach((pl, i) => {
      const f = Math.max(0, Math.min(1, shown - i)); // 這一片落下來的進度
      const vis = f > 0;
      pl.mesh.visible = vis;
      pl.mesh.position.y = TOP - 0.09 + (1 - easeOut(f)) * 1.6;
      for (const post of pl.posts) { post.visible = f >= 1; }
    });
    const reach = Math.max(0.001, Math.min(line.len, Math.floor(shown) * step));
    for (const r of rails) { r.scale.z = reach; r.visible = shown >= 1; }
  }
  grow(1);
  return { group: g, grow };
}

/**
 * 還沒蓋的橋：海上兩條虛線＋中間的浮標「蓋橋・120 歐巴幣」。全部的物件 userData.bridge = key，點到就打開建設面板。
 * labelText／labelSub：浮標上的字。
 */
export function makeBridgeSite(line, colors, cfg, key, labelText, labelSub) {
  const g = new THREE.Group();
  placeAlong(g, line);
  g.userData = { bridge: key, built: false };
  const dashMat = new THREE.MeshBasicMaterial({ color: cfg.dashColor, transparent: true, opacity: 0.85 });
  const from = Math.max(0, line.seaFrom - 0.5);
  const to = Math.min(line.len, line.seaTo + 0.5);
  for (let z = from; z + cfg.dash <= to; z += cfg.dash + cfg.dashGap) {
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, cfg.dash), dashMat);
      d.position.set(side * line.half, 0.32, z + cfg.dash / 2);
      g.add(d);
    }
  }
  // 點擊範圍：整條橋的位置（看不見，只用來被點到；平板手指比較好點）
  const hit = new THREE.Mesh(new THREE.BoxGeometry(line.half * 2 + 3, 1.2, Math.max(1, to - from)), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.set(0, 0.6, (from + to) / 2);
  g.add(hit);
  // 中間的浮標：圓圓的浮筒＋告示牌
  const buoy = new THREE.Group();
  buoy.name = 'buoy';
  buoy.position.set(0, 0, line.len / 2);
  const float = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.7, 12), mat(colors.main));
  float.position.y = 0.35;
  float.castShadow = true;
  buoy.add(float);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6), mat(cfg.rail));
  pole.position.y = 1.7;
  buoy.add(pole);
  const tex = textTexture(labelText, { fg: colors.label || '#4a3343', bg: 'rgba(255,255,255,0.95)', w: 512, h: 220, size: 92, sub: labelSub, round: true, border: colors.main });
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sign.scale.set(5, 5 * (220 / 512), 1);
  sign.position.y = 3.9;
  sign.renderOrder = 9;
  buoy.add(sign);
  // 浮標比較大，平板好點：再加一個看不見的大圓柱
  const buoyHit = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 6, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  buoyHit.position.y = 2.6;
  buoy.add(buoyHit);
  g.add(buoy);
  g.traverse((o) => { o.userData.bridge = key; });
  return { group: g, buoy };
}

/** 還沒連上的島周圍的淡霧：一圈往上變透明的霧牆。點不到（不擋點擊） */
export function makeMist(def, island, cfg) {
  const m = cfg.mist;
  const r = (island?.radius || 5.2) * (def.size || 1) * m.extra;
  const tex = mistTexture();
  const material = new THREE.MeshBasicMaterial({ color: m.color, map: tex, transparent: true, opacity: m.opacity, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, m.height, 48, 1, true), material);
  wall.position.set(def.position[0], m.height / 2 - 0.6, def.position[1]);
  wall.raycast = () => {}; // 不擋住點擊島和建築
  wall.renderOrder = 5;
  wall.userData = { mist: def.code };
  return wall;
}

function mistTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 木板落下的動畫曲線：先快後慢 */
function easeOut(t) { return 1 - (1 - t) ** 3; }
