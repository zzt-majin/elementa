// world/islands.js
// 依 config/subjects.json 蓋出每一座島。有關卡的島在中間蓋一個小村子（三棟建築），沒有的蓋「建造中」。
// 每座島的 userData.walk 記下小公主走路要用的資料（島自己的座標）：
//   { radius 草地半徑, obstacles [{ x, z, r }] 擋路的圓, doors [{ kind, x, z, face }] 門口, spawn {x, z}, top 地面高度 }
import * as THREE from 'three';
import { mat, makeTower, makeHouse, makeTent, makeConstruction, makeTree, makeLabel } from './buildings.js';

const MAKERS = { tower: makeTower, house: makeHouse, tent: makeTent };
// 每種建築在 scale = 1 時：擋路圓的半徑、門在建築前面多遠（模型面向 +z）
const SHAPE = {
  tower: { r: 1.1, door: 0.9 },
  house: { r: 1.3, door: 0.9 },
  tent: { r: 1.45, door: 1.15 },
};
const TOP = 0.9; // 草地表面的高度

/**
 * def：subjects.json 的一筆島；colors：場景色＋公主色
 * opts：{ island（world.json 的 island）, village（world.json 的 village）, labels, levelCount }
 * 回傳 THREE.Group，userData.island = 島代號；每棟建築 userData.building = 'tower' | 'house' | 'tent'
 */
export function buildIsland(def, colors, opts) {
  const isl = opts.island || {};
  const vil = opts.village || {};
  const r = (isl.radius || 5.2) * (def.size || 1);
  const seg = isl.segments || 24;
  const g = new THREE.Group();
  const grassR = r * 0.84;
  const walk = { radius: grassR, obstacles: [], doors: [], spawn: { ...(vil.spawn || { x: 0, z: r * 0.4 }) }, top: TOP };
  g.userData = { island: def.code, radius: r, walk };
  g.position.set(def.position[0], 0, def.position[1]);

  // 底座：沙灘、草地、水下的岩石
  g.add(part(new THREE.CylinderGeometry(r, r * 0.92, 1.1, seg), mat(colors.sand), 0.05, 'island'));
  g.add(part(new THREE.CylinderGeometry(grassR, r * 0.88, 0.35, seg), mat(colors.grass), 0.72, 'island'));
  g.add(part(new THREE.ConeGeometry(r * 0.9, 3.2 + r * 0.1, Math.max(9, Math.round(seg / 2))), mat(colors.rock), -2.1 - r * 0.05, 'island', Math.PI));

  // 島的代表色小花（只是裝飾，不擋路）
  const flowers = isl.flowers ?? 7;
  for (let i = 0; i < flowers; i++) {
    const a = i * 2.39 + def.code.length;
    const d = grassR * (0.2 + 0.75 * (((i * 37) % 23) / 23));
    const f = part(new THREE.IcosahedronGeometry(0.16, 0), mat(def.accent || colors.soft), TOP + 0.05, 'island');
    f.position.x = Math.sin(a) * d;
    f.position.z = Math.cos(a) * d;
    g.add(f);
  }

  const s = vil.buildingScale || 1; // 建築維持原本大小，不跟著島放大
  if (opts.levelCount > 0) {
    for (const kind of ['tower', 'house', 'tent']) {
      const spot = vil[kind] || { x: 0, z: 0, ry: 0 };
      const b = MAKERS[kind](colors);
      b.position.set(spot.x, TOP, spot.z);
      b.rotation.y = spot.ry || 0;
      b.scale.setScalar(s);
      b.userData = { island: def.code, building: kind };
      b.traverse((o) => { o.userData.building = kind; o.userData.island = def.code; });
      g.add(b);
      const shape = SHAPE[kind];
      walk.obstacles.push({ x: spot.x, z: spot.z, r: shape.r * s, kind });
      // 門口：建築前面（轉過 ry 之後的 +z 方向）
      const dz = (shape.r + shape.door) * s;
      const ry = spot.ry || 0;
      walk.doors.push({ kind, x: spot.x + Math.sin(ry) * dz, z: spot.z + Math.cos(ry) * dz, face: ry + Math.PI });
    }
  } else {
    const at = vil.construction || { x: 0, z: 0 };
    const sign = makeConstruction(colors, opts.labels.construction);
    sign.position.set(at.x, TOP, at.z);
    sign.scale.setScalar(s * 1.1);
    sign.traverse((o) => { o.userData.island = def.code; });
    g.add(sign);
    walk.obstacles.push({ x: at.x, z: at.z, r: 2.1 * s });
  }

  // 樹：種在島邊一圈
  const trees = isl.trees ?? 5;
  for (let i = 0; i < trees; i++) {
    const a = (i / trees) * Math.PI * 2 + 0.35 + def.code.length * 0.2;
    const d = grassR * (0.72 + 0.12 * ((i * 7) % 3) / 2);
    const k = (0.8 + 0.3 * ((i * 5) % 4) / 3) * s;
    const t = makeTree(colors, k);
    const x = Math.sin(a) * d;
    const z = Math.cos(a) * d;
    t.position.set(x, TOP, z);
    t.rotation.y = i;
    g.add(t);
    walk.obstacles.push({ x, z, r: 0.5 * k });
  }

  const label = makeLabel(def.name, colors, { sub: opts.levelCount > 0 ? opts.labels.count.replace('{n}', opts.levelCount) : opts.labels.construction });
  label.position.set(0, 9.5 * s + 2, 0);
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

/** 島自己的座標 → 世界座標的走路區域（給 avatar/walk.js 用） */
export function walkAreaOf(group) {
  const w = group.userData.walk;
  const ox = group.position.x;
  const oz = group.position.z;
  return {
    cx: ox,
    cz: oz,
    radius: w.radius,
    obstacles: w.obstacles.map((o) => ({ x: o.x + ox, z: o.z + oz, r: o.r })),
    doors: w.doors.map((d) => ({ kind: d.kind, x: d.x + ox, z: d.z + oz, face: d.face })),
    spawn: { x: w.spawn.x + ox, z: w.spawn.z + oz },
    top: w.top,
  };
}
