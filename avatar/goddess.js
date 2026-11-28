// avatar/goddess.js
// 海邊女神（原創，低多邊形）：湖水綠長髮、白色貝殼小皇冠、白底水藍裙子，笑咪咪、臉頰紅紅的。
// 浮出海面到腰：group 的 y = 0 是腰，裙子在 y < 0（泡在海裡看不到）。
// 顏色從 config/toys.json 的 goddess.colors 來。
import * as THREE from 'three';

/** 回傳 { group, animate(dt) }；group 面向 +z */
export function makeGoddess(colors = {}, size = 1) {
  const c = {
    hair: '#3cc8b4', hairDark: '#249e8e', skin: '#ffe3cf', shell: '#ffffff', shellPink: '#ffd0dc',
    top: '#ffffff', skirt: '#7cc8f0', eye: '#3b2a30', cheek: '#ff8fa8', ...colors,
  };
  const mats = new Map();
  const m = (col) => {
    if (!mats.has(col)) mats.set(col, new THREE.MeshStandardMaterial({ color: col, roughness: 0.75, metalness: 0, flatShading: true }));
    return mats.get(col);
  };
  const mesh = (geo, col, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m(col));
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const group = new THREE.Group();
  group.name = 'goddess';
  const body = new THREE.Group();
  group.add(body);

  // 裙子（水藍，泡在海裡）＋腰上一圈白邊
  body.add(mesh(new THREE.CylinderGeometry(0.26, 0.62, 1.0, 12), c.skirt, 0, -0.5, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.1, 12), c.top, 0, 0.0, 0));
  // 上衣（白）
  body.add(mesh(new THREE.CylinderGeometry(0.17, 0.25, 0.5, 10), c.top, 0, 0.28, 0));
  // 胸前的小貝殼
  body.add(mesh(new THREE.SphereGeometry(0.06, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), c.shellPink, 0, 0.36, 0.2));

  // 手：一隻揮手、一隻放下
  const arm = (x, up) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.48, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.42, 6), c.skin, 0, -0.21, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.085, 8, 6), c.top, 0, 0, 0));
    pivot.rotation.z = up ? 2.5 : (x < 0 ? -0.25 : 0.25);
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-0.27, false);
  const armR = arm(0.27, true);

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.32, 14, 10), c.skin));
  // 頭髮：上面一頂、後面長長的一片，兩邊各一撮
  head.add(mesh(new THREE.SphereGeometry(0.35, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), c.hair, 0, 0.03, -0.03));
  head.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 1.05, 12), c.hair, 0, -0.5, -0.16));
  head.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 6), c.hairDark, -0.3, -0.3, 0.08));
  head.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 6), c.hairDark, 0.3, -0.3, 0.08));
  // 笑咪咪的眼睛（扁扁的彎彎）、嘴巴、紅臉頰
  for (const x of [-0.11, 0.11]) {
    const eye = mesh(new THREE.SphereGeometry(0.05, 8, 5), c.eye, x, 0.02, 0.29);
    eye.scale.set(1.1, 0.35, 0.6);
    head.add(eye);
    const cheek = mesh(new THREE.SphereGeometry(0.055, 8, 5), c.cheek, x * 1.6, -0.08, 0.26);
    cheek.scale.set(1, 0.6, 0.5);
    head.add(cheek);
  }
  const mouth = mesh(new THREE.SphereGeometry(0.045, 8, 5), '#e2566f', 0, -0.13, 0.29);
  mouth.scale.set(1.3, 0.55, 0.5);
  head.add(mouth);
  // 白色貝殼小皇冠：中間一個大的扇貝，兩邊小的
  const crown = new THREE.Group();
  crown.position.set(0, 0.3, 0.06);
  head.add(crown);
  const shell = (x, s, tilt) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    g.rotation.z = tilt;
    for (let i = 0; i < 5; i++) {
      const rib = mesh(new THREE.ConeGeometry(0.035 * s, 0.17 * s, 4), i % 2 ? c.shellPink : c.shell, 0, 0.07 * s, 0);
      rib.rotation.z = (i - 2) * 0.32;
      rib.position.x = Math.sin((i - 2) * 0.32) * 0.06 * s;
      g.add(rib);
    }
    g.add(mesh(new THREE.SphereGeometry(0.03 * s, 6, 4), c.shellPink, 0, 0, 0.01));
    crown.add(g);
  };
  shell(0, 1.3, 0);
  shell(-0.14, 0.8, 0.35);
  shell(0.14, 0.8, -0.35);

  group.scale.setScalar(size);
  let t = 0;
  return {
    group,
    parts: { body, head, armL, armR, crown },
    /** 輕輕搖、揮手 */
    animate(dt) {
      t += dt;
      armR.rotation.z = 2.5 + Math.sin(t * 7) * 0.35;
      armL.rotation.z = -0.25 - Math.sin(t * 2) * 0.05;
      head.rotation.z = Math.sin(t * 2.2) * 0.08;
      body.position.y = Math.sin(t * 2.6) * 0.03;
    },
  };
}
