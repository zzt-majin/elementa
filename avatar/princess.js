// avatar/princess.js
// 3D 小公主（原創，低多邊形）：頭、頭髮、小皇冠、身體、裙子、手、腳。
// 裙子和衣服用選的公主代表色（main／soft／deep），膚色、髮色、皇冠色從 config/world.json 的 avatar 來。
// 之後更衣室的衣服可以換掉 parts 裡的部件。
import * as THREE from 'three';

/**
 * colors：{ main, soft, deep }；look：{ skin, hair, crown, eye, cheek, scale }
 * 回傳 { group, parts, animate(dt, speed) }；group 的腳底在 y = 0，面向 +z。
 */
export function makePrincess(colors, look = {}) {
  const skin = look.skin || '#ffe0c8';
  const hairC = look.hair || '#7a4a32';
  const crownC = look.crown || '#ffd34d';
  const eyeC = look.eye || '#4a3343';
  const cheekC = look.cheek || '#ff9fb5';
  const mats = new Map();
  const m = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, flatShading: true }));
    return mats.get(c);
  };
  const mesh = (geo, color, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m(color));
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    return o;
  };

  const group = new THREE.Group();
  group.name = 'princess';
  const body = new THREE.Group(); // 走路時整個身體上下彈
  group.add(body);

  // 腳：從髖部轉，所以把腳放在一個以髖部為原點的小組
  const leg = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.42, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.36, 6), skin, 0, -0.2, 0));
    pivot.add(mesh(new THREE.BoxGeometry(0.16, 0.09, 0.24), colors.deep, 0, -0.38, 0.04));
    body.add(pivot);
    return pivot;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);

  // 裙子：上窄下寬，兩層
  body.add(mesh(new THREE.CylinderGeometry(0.2, 0.56, 0.55, 10), colors.main, 0, 0.66, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.1, 10), colors.soft, 0, 0.4, 0));
  // 身體
  body.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.42, 8), colors.soft, 0, 1.12, 0));
  body.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 8), colors.deep, 0, 0.93, 0)); // 腰帶

  // 手：從肩膀轉
  const arm = (x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.28, 0);
    pivot.add(mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.4, 6), skin, 0, -0.2, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.075, 6, 5), colors.soft, 0, 0, 0)); // 泡泡袖
    pivot.rotation.z = x < 0 ? -0.18 : 0.18;
    body.add(pivot);
    return pivot;
  };
  const armL = arm(-0.24);
  const armR = arm(0.24);

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 12, 10), skin));
  const hair = mesh(new THREE.SphereGeometry(0.33, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairC, 0, 0.02, -0.03);
  head.add(hair);
  const back = mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.5, 10), hairC, 0, -0.2, -0.12); // 後面的長髮
  head.add(back);
  for (const x of [-0.1, 0.1]) {
    head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), eyeC, x, 0.0, 0.27));
    head.add(mesh(new THREE.SphereGeometry(0.04, 6, 5), cheekC, x * 1.7, -0.08, 0.24));
  }
  // 小皇冠
  const crown = new THREE.Group();
  crown.position.set(0, 0.3, 0);
  crown.add(mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10, 1, true), crownC));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    crown.add(mesh(new THREE.ConeGeometry(0.035, 0.11, 4), crownC, Math.sin(a) * 0.15, 0.09, Math.cos(a) * 0.15));
  }
  crown.add(mesh(new THREE.OctahedronGeometry(0.04, 0), colors.main, 0, 0.02, 0.155));
  head.add(crown);

  const scale = look.scale || 1;
  group.scale.setScalar(scale);

  let phase = 0;
  let swing = 0; // 0 = 站著、1 = 走路，平滑變化
  let idle = 0;
  return {
    group,
    parts: { body, head, hair, crown, legL, legR, armL, armR },
    /** speed：每秒走幾公尺（0 = 停著） */
    animate(dt, speed) {
      const walking = speed > 0.2;
      swing += ((walking ? 1 : 0) - swing) * Math.min(1, dt * 10);
      phase += dt * (4 + Math.min(speed, 6) * 2.2);
      idle += dt;
      const s = Math.sin(phase) * 0.7 * swing;
      legL.rotation.x = s;
      legR.rotation.x = -s;
      armL.rotation.x = -s * 0.9;
      armR.rotation.x = s * 0.9;
      body.position.y = Math.abs(Math.sin(phase)) * 0.06 * swing + Math.sin(idle * 2) * 0.012 * (1 - swing);
      head.rotation.z = Math.sin(phase) * 0.05 * swing;
    },
  };
}
