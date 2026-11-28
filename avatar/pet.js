// avatar/pet.js
// 3D 狗狗（原創，低多邊形）：身體、頭、嘴巴、耳朵、尾巴、四隻腳。樣子和顏色照 config/pets.json（look、colors）。
// 肚子餓的時候：頭和尾巴垂下來、眼睛下面掛著眼淚。
import * as THREE from 'three';

const INK = '#3b2a30';

/**
 * breed：petRules() 的一種（look、colors、size）；scale：config/world.json 的 pets.scale。
 * 回傳 { group, animate(dt, speed, hungry) }；group 的腳底在 y = 0，面向 +z。
 */
export function makeDog(breed, scale = 1) {
  const c = breed.colors;
  const look = breed.look;
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

  // 腳：從髖部轉
  const legColor = look === 'husky' ? c.light : look === 'shepherd' ? c.body : c.body;
  const legs = [];
  for (const [x, z] of [[-0.11, 0.22], [0.11, 0.22], [-0.11, -0.22], [0.11, -0.22]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.3, z);
    pivot.add(mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.3, 6), legColor, 0, -0.15, 0));
    body.add(pivot);
    legs.push(pivot);
  }
  // 身體
  body.add(mesh(new THREE.BoxGeometry(0.3, 0.26, 0.64), c.body, 0, 0.42, 0));
  if (look === 'shepherd') body.add(mesh(new THREE.BoxGeometry(0.32, 0.1, 0.46), c.dark, 0, 0.53, -0.04)); // 背上的黑鞍
  if (look !== 'shepherd') body.add(mesh(new THREE.BoxGeometry(0.24, 0.06, 0.5), c.light, 0, 0.29, 0)); // 肚子

  // 頭
  const head = new THREE.Group();
  head.position.set(0, 0.62, 0.36);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), c.body, 0, 0, 0));
  if (look === 'husky') head.add(mesh(new THREE.SphereGeometry(0.135, 8, 6), c.light, 0, -0.04, 0.06)); // 白色的臉
  head.add(mesh(new THREE.BoxGeometry(0.13, 0.1, 0.15), look === 'shepherd' ? c.dark : c.light, 0, -0.05, 0.16)); // 嘴巴
  head.add(mesh(new THREE.SphereGeometry(0.035, 6, 4), INK, 0, -0.02, 0.24)); // 鼻子
  for (const x of [-0.07, 0.07]) head.add(mesh(new THREE.SphereGeometry(0.026, 6, 4), c.eye, x, 0.04, 0.145));
  const earColor = look === 'shepherd' ? c.dark : c.body;
  for (const x of [-0.09, 0.09]) {
    const ear = mesh(new THREE.ConeGeometry(0.06, look === 'shepherd' ? 0.2 : 0.15, 4), earColor, x, 0.17, -0.02);
    ear.rotation.z = x < 0 ? 0.25 : -0.25;
    head.add(ear);
  }
  // 眼淚（肚子餓時才看得到）
  const tears = [];
  for (const x of [-0.075, 0.075]) {
    const t = mesh(new THREE.SphereGeometry(0.022, 6, 4), '#5aa9e6', x, 0.0, 0.15);
    t.scale.set(0.8, 1.5, 0.8);
    t.visible = false;
    head.add(t);
    tears.push(t);
  }

  // 尾巴：土狗和哈士奇往上翹，狼犬垂在後面
  const tail = new THREE.Group();
  tail.position.set(0, 0.52, -0.31);
  body.add(tail);
  const tailMesh = mesh(new THREE.ConeGeometry(look === 'husky' ? 0.07 : 0.045, 0.26, 6), look === 'shepherd' ? c.dark : c.body, 0, 0.13, 0);
  tail.add(tailMesh);
  const tailUp = look === 'shepherd' ? -2.2 : -0.7;

  let phase = 0;
  let wag = 0;
  return {
    group,
    animate(dt, speed, hungry) {
      const k = Math.min(1, speed / 2.2);
      phase += dt * (4 + speed * 4);
      wag += dt * (hungry ? 2 : 11);
      const sw = Math.sin(phase) * 0.7 * k;
      legs[0].rotation.x = sw; legs[3].rotation.x = sw;
      legs[1].rotation.x = -sw; legs[2].rotation.x = -sw;
      body.position.y = Math.abs(Math.sin(phase)) * 0.04 * k;
      // 肚子餓：頭垂下來、尾巴垂下來不搖、掉眼淚
      const want = hungry ? 0.4 : 0;
      head.rotation.x += (want - head.rotation.x) * Math.min(1, dt * 4);
      const tailX = hungry ? -2.7 : tailUp;
      tail.rotation.x += (tailX - tail.rotation.x) * Math.min(1, dt * 4);
      tail.rotation.z = hungry ? 0 : Math.sin(wag) * 0.5;
      for (const t of tears) {
        t.visible = !!hungry;
        if (hungry) t.position.y = -0.01 - ((wag * 0.05) % 0.08);
      }
    },
  };
}
