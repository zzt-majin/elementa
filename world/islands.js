// world/islands.js
// 依 config/subjects.json 蓋出每一座島。有關卡的島蓋三棟建築，沒有的蓋「建造中」。
import * as THREE from 'three';
import { mat, makeTower, makeHouse, makeTent, makeConstruction, makeTree, makeLabel } from './buildings.js';

// 建築在島上的位置（以島半徑為 1 的比例）
const SPOTS = {
  tower: { x: -0.38, z: -0.22, ry: 0.3 },
  house: { x: 0.4, z: -0.12, ry: -0.35 },
  tent: { x: 0.02, z: 0.42, ry: 0 },
};
const TREE_SPOTS = [[-0.62, 0.35, 1], [0.66, 0.38, 0.8], [-0.1, -0.62, 0.9], [0.5, -0.55, 0.7], [-0.7, -0.05, 0.75]];

/**
 * def: subjects.json 的一筆島；colors: 場景色＋公主色；opts: { radius, labels, levelCount }
 * 回傳 THREE.Group，userData.island = 島代號；每棟建築 userData.building = 'tower' | 'house' | 'tent'
 */
export function buildIsland(def, colors, opts) {
  const r = opts.radius * (def.size || 1);
  const g = new THREE.Group();
  g.userData = { island: def.code, radius: r };
  g.position.set(def.position[0], 0, def.position[1]);

  // 底座：沙灘、草地、水下的岩石
  g.add(part(new THREE.CylinderGeometry(r, r * 0.92, 1.1, 11), mat(colors.sand), 0.05, 'island'));
  g.add(part(new THREE.CylinderGeometry(r * 0.84, r * 0.88, 0.35, 11), mat(colors.grass), 0.72, 'island'));
  g.add(part(new THREE.ConeGeometry(r * 0.9, 3.2, 9), mat(colors.rock), -2.1, 'island', Math.PI));
  // 島的代表色小花
  for (let i = 0; i < 7; i++) {
    const a = i * 2.39 + def.code.length;
    const d = r * (0.55 + 0.3 * ((i * 37) % 10) / 10);
    const f = part(new THREE.IcosahedronGeometry(0.13, 0), mat(def.accent || colors.soft), 0.95, 'island');
    f.position.x = Math.sin(a) * d;
    f.position.z = Math.cos(a) * d;
    g.add(f);
  }

  const top = 0.9;
  const s = r / 5.2; // 建築大小跟著島縮放
  if (opts.levelCount > 0) {
    for (const [kind, maker] of [['tower', makeTower], ['house', makeHouse], ['tent', makeTent]]) {
      const b = maker(colors);
      const spot = SPOTS[kind];
      b.position.set(spot.x * r, top, spot.z * r);
      b.rotation.y = spot.ry;
      b.scale.setScalar(s);
      b.userData = { island: def.code, building: kind };
      b.traverse((o) => { o.userData.building = kind; o.userData.island = def.code; });
      g.add(b);
    }
  } else {
    const sign = makeConstruction(colors, opts.labels.construction);
    sign.position.set(0, top, 0.1 * r);
    sign.scale.setScalar(s * 1.1);
    sign.traverse((o) => { o.userData.island = def.code; });
    g.add(sign);
  }
  TREE_SPOTS.forEach(([x, z, k], i) => {
    if (opts.levelCount > 0 && i > 2) return;
    const t = makeTree(colors, k * s);
    t.position.set(x * r, top, z * r);
    t.rotation.y = i;
    g.add(t);
  });

  const label = makeLabel(def.name, colors, { sub: opts.levelCount > 0 ? opts.labels.count.replace('{n}', opts.levelCount) : opts.labels.construction });
  label.position.set(0, 7.4 * s + 1.2, 0);
  label.userData.island = def.code;
  g.add(label);
  g.userData.label = label;
  return g;
}

function part(geo, material, y, tag, rx = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.y = y;
  m.rotation.x = rx;
  m.castShadow = tag !== 'island' || y > 0;
  m.receiveShadow = true;
  return m;
}

/** 從被點到的物件往上找，得到 { island, building } */
export function whatWasHit(object) {
  let o = object;
  while (o) {
    if (o.userData && (o.userData.building || o.userData.island)) {
      return { island: o.userData.island, building: o.userData.building || null };
    }
    o = o.parent;
  }
  return null;
}
