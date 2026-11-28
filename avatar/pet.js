// avatar/pet.js
// 3D 寵物（原創，低多邊形）。樣子和顏色照 config/pets.json（look、colors）：
//   狗（tudog 土狗、shepherd 狼犬、husky 哈士奇、lab 拉不拉多）：身體、頭、嘴巴、耳朵、尾巴、四隻腳。
//   貓（cat）：比較小、尖耳朵、背上條紋、細長往上翹的尾巴、鬍鬚。
// 肚子餓的時候：頭和尾巴垂下來、眼睛下面掛著眼淚。點牠一下會跳一下（hop）。
import * as THREE from 'three';

const INK = '#3b2a30';

/** 共用：材質、加一塊、外層 group（腳底在 y = 0，面向 +z） */
function kit(breed, scale) {
  const mats = new Map();
  const m = (color) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true }));
    return mats.get(color);
  };
  const mesh = (geo, color, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m(color));
    o.position.set(x, y, z);
    o.castShadow = true;
    return o;
  };
  const group = new THREE.Group();
  group.name = 'pet';
  const body = new THREE.Group(); // 跑步時上下彈
  group.add(body);
  const s = (breed.size || 1) * scale;
  body.scale.set(s, s, s);
  return { mesh, group, body };
}

/** 眼淚（肚子餓時才看得到） */
function addTears(head, mesh, xs, y, z) {
  const tears = [];
  for (const x of xs) {
    const t = mesh(new THREE.SphereGeometry(0.022, 6, 4), '#5aa9e6', x, y, z);
    t.scale.set(0.8, 1.5, 0.8);
    t.visible = false;
    head.add(t);
    tears.push(t);
  }
  return tears;
}

/** 共用的動作：跑步擺腳、上下彈、肚子餓垂頭垂尾巴掉眼淚、點了跳一下 */
function animator({ legs, body, head, tail, tears, tailUp, tailDown = -2.7, wagFast = 11, wagSize = 0.5, stride = 0.7, bounce = 0.04 }) {
  let phase = 0;
  let wag = 0;
  let hopT = 0;
  return {
    hop() { hopT = 0.4; },
    animate(dt, speed, hungry) {
      const k = Math.min(1, speed / 2.2);
      phase += dt * (4 + speed * 4);
      wag += dt * (hungry ? 2 : wagFast);
      const sw = Math.sin(phase) * stride * k;
      legs[0].rotation.x = sw; legs[3].rotation.x = sw;
      legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
      hopT = Math.max(0, hopT - dt);
      const jump = hopT > 0 ? Math.sin((hopT / 0.4) * Math.PI) * 0.18 : 0;
      body.position.y = Math.abs(Math.sin(phase)) * bounce * k + jump;
      const want = hungry ? 0.4 : 0;
      head.rotation.x += (want - head.rotation.x) * Math.min(1, dt * 4);
      const tailX = hungry ? tailDown : tailUp;
      tail.rotation.x += (tailX - tail.rotation.x) * Math.min(1, dt * 4);
      tail.rotation.z = hungry ? 0 : Math.sin(wag) * wagSize;
      for (const t of tears) {
        t.visible = !!hungry;
        if (hungry) t.position.y = -0.01 - ((wag * 0.05) % 0.08);
      }
    },
  };
}

/**
 * 一隻狗。breed：petRules() 的一種（look、colors、size）；scale：config/world.json 的 pets.scale。
 * 回傳 { group, animate(dt, speed, hungry), hop() }
 */
export function makeDog(breed, scale = 1) {
  const c = breed.colors;
  const look = breed.look;
  const { mesh, group, body } = kit(breed, scale);

  // 腳：從髖部轉
  const legColor = look === 'husky' ? c.light : c.body;
  const legs = [];
  for (const [x, z] of [[-0.11, 0.22], [0.11, 0.22], [-0.11, -0.22], [0.11, -0.22]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, z);
    pivot.add(mesh(new THREE.CylinderGeometry(look === 'lab' ? 0.055 : 0.05, 0.045, 0.3, 6), legColor, 0, -0.15, 0));
    body.add(pivot);
    legs.push(pivot);
  }
  // 身體（拉不拉多比較壯）
  body.add(mesh(new THREE.BoxGeometry(look === 'lab' ? 0.34 : 0.3, look === 'lab' ? 0.29 : 0.26, 0.64), c.body, 0, 0.42, 0));
  if (look === 'shepherd') body.add(mesh(new THREE.BoxGeometry(0.32, 0.1, 0.46), c.dark, 0, 0.53, -0.04)); // 背上的黑鞍
  if (look !== 'shepherd') body.add(mesh(new THREE.BoxGeometry(0.24, 0.06, 0.5), c.light, 0, 0.29, 0)); // 肚子

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.36);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(look === 'lab' ? 0.18 : 0.17, 8, 6), c.body, 0, 0, 0));
  if (look === 'husky') head.add(mesh(new THREE.SphereGeometry(0.135, 8, 6), c.light, 0, -0.04, 0.06)); // 白色的臉
  head.add(mesh(new THREE.BoxGeometry(look === 'lab' ? 0.15 : 0.13, 0.1, 0.15), look === 'shepherd' ? c.dark : c.light, 0, -0.05, 0.16)); // 嘴巴
  head.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), INK, 0, -0.02, 0.24)); // 鼻子
  for (const x of [-0.07, 0.07]) head.add(mesh(new THREE.SphereGeometry(0.026, 6, 4), c.eye, x, 0.04, 0.145));
  if (look === 'lab') {
    // 拉不拉多：耳朵軟軟垂在兩邊
    for (const x of [-0.16, 0.16]) {
      const ear = mesh(new THREE.BoxGeometry(0.05, 0.17, 0.11), c.dark, x, -0.03, -0.01);
      ear.rotation.z = x < 0 ? -0.22 : 0.22;
      head.add(ear);
    }
  } else {
    const earColor = look === 'shepherd' ? c.dark : c.body;
    for (const x of [-0.09, 0.09]) {
      const ear = mesh(new THREE.ConeGeometry(0.06, look === 'shepherd' ? 0.2 : 0.15, 4), earColor, x, 0.17, -0.02);
      ear.rotation.z = x < 0 ? 0.25 : -0.25;
      head.add(ear);
    }
  }
  const tears = addTears(head, mesh, [-0.075, 0.075], 0.0, 0.15);

  // 尾巴：土狗和哈士奇往上翹，狼犬垂在後面，拉不拉多粗粗的、斜斜的
  const tail = new THREE.Group();
  tail.position.set(0, 0.52, -0.31);
  body.add(tail);
  const tailR = look === 'husky' ? 0.07 : look === 'lab' ? 0.06 : 0.045;
  tail.add(mesh(new THREE.ConeGeometry(tailR, 0.28, 6), look === 'shepherd' ? c.dark : c.body, 0, 0.13, 0));
  const tailUp = look === 'shepherd' ? -2.2 : look === 'lab' ? -1.5 : -0.7;

  return { group, ...animator({ legs, body, head, tail, tears, tailUp }) };
}

/** 一隻貓（look: 'cat'）：比狗小一點、尖耳朵、條紋、細長的尾巴往上翹、鬍鬚 */
export function makeCat(breed, scale = 1) {
  const c = breed.colors;
  const { mesh, group, body } = kit(breed, scale);

  const legs = [];
  for (const [x, z] of [[-0.08, 0.18], [0.08, 0.18], [-0.08, -0.18], [0.08, -0.18]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.26, z);
    pivot.add(mesh(new THREE.CylinderGeometry(0.035, 0.032, 0.26, 6), c.body, 0, -0.13, 0));
    pivot.add(mesh(new THREE.SphereGeometry(0.04, 6, 4), c.light, 0, -0.25, 0.01)); // 白色的腳掌
    body.add(pivot);
    legs.push(pivot);
  }
  body.add(mesh(new THREE.BoxGeometry(0.24, 0.21, 0.52), c.body, 0, 0.36, 0));
  body.add(mesh(new THREE.BoxGeometry(0.19, 0.05, 0.4), c.light, 0, 0.25, 0)); // 肚子
  for (const z of [-0.15, -0.03, 0.09]) body.add(mesh(new THREE.BoxGeometry(0.26, 0.04, 0.05), c.dark, 0, 0.44, z)); // 背上的條紋

  const head = new THREE.Group();
  head.position.set(0, 0.55, 0.3);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), c.body, 0, 0, 0));
  head.add(mesh(new THREE.SphereGeometry(0.075, 8, 6), c.light, 0, -0.05, 0.1)); // 嘴巴周圍
  head.add(mesh(new THREE.SphereGeometry(0.022, 6, 4), '#e88a8a', 0, -0.02, 0.17)); // 粉紅鼻子
  for (const x of [-0.06, 0.06]) {
    const eye = mesh(new THREE.SphereGeometry(0.03, 6, 4), c.eye, x, 0.03, 0.125);
    eye.scale.set(1, 1.3, 0.8);
    head.add(eye);
  }
  for (const x of [-0.035, 0.035]) head.add(mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02), c.dark, x, 0.12, 0.08)); // 額頭的條紋
  for (const x of [-0.09, 0.09]) {
    const ear = mesh(new THREE.ConeGeometry(0.055, 0.13, 3), c.body, x, 0.15, -0.01);
    ear.rotation.z = x < 0 ? 0.3 : -0.3;
    head.add(ear);
  }
  // 鬍鬚：每邊兩根細線
  for (const side of [-1, 1]) for (const dy of [-0.03, -0.06]) {
    const w = mesh(new THREE.BoxGeometry(0.12, 0.006, 0.006), INK, side * 0.1, dy, 0.13);
    w.rotation.z = side * (dy < -0.04 ? -0.12 : 0.1);
    w.castShadow = false;
    head.add(w);
  }
  const tears = addTears(head, mesh, [-0.06, 0.06], -0.01, 0.13);

  // 尾巴：兩節，往上彎
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, -0.26);
  body.add(tail);
  tail.add(mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.24, 6), c.body, 0, 0.12, 0));
  const tip = new THREE.Group();
  tip.position.set(0, 0.24, 0);
  tip.rotation.x = 0.5;
  tail.add(tip);
  tip.add(mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.2, 6), c.dark, 0, 0.1, 0));

  return { group, ...animator({ legs, body, head, tail, tears, tailUp: -0.35, tailDown: -2.4, wagFast: 4, wagSize: 0.35, stride: 0.6, bounce: 0.03 }) };
}

/** 照 look 做一隻：cat 是貓，其他是狗 */
export function makePet(breed, scale = 1) {
  return breed?.look === 'cat' ? makeCat(breed, scale) : makeDog(breed, scale);
}
