// world/chest.js
// 寶箱（3D）：放在第一座橋另一頭的島上，會閃亮光。打開：箱蓋打開、發光、飛盤轉著飛到半空；
// 收下就縮小消失，沒收下箱蓋關回去、留在原地。位置由 engine/toys.js 的 chestSpot 算。
import * as THREE from 'three';
import { makeChest, makeDisc } from './toys3d.js';

export function createChestView({ scene, rules, item }) {
  const C = rules.chest;
  const view = makeChest();
  view.group.visible = false;
  scene.add(view.group);
  const prize = makeDisc(item?.colors || {}, 0.34);
  prize.visible = false;
  view.group.add(prize);
  view.group.traverse((o) => { o.userData.chest = true; });
  let spot = null;
  let anim = null; // { kind: 'open'|'close'|'vanish', t }
  let onOpened = null;

  return {
    /** 放到這裡（spot = { x, y, z, face }）；null 就藏起來 */
    place(s) {
      spot = s;
      anim = null;
      prize.visible = false;
      view.setOpen(0);
      view.group.scale.setScalar(1);
      view.group.visible = !!s;
      if (s) { view.group.position.set(s.x, s.y ?? 0.9, s.z); view.group.rotation.y = s.face; }
    },
    get shown() { return !!spot; },
    get busy() { return !!anim; },
    /** 擋路的圓：小公主和狗狗不能穿過寶箱 */
    obstacle() { return spot ? { x: spot.x, z: spot.z, r: 0.7 } : null; },
    /** 門口：寶箱前面，走到這裡跳「打開寶箱」 */
    door() {
      if (!spot) return null;
      const fx = Math.sin(spot.face);
      const fz = Math.cos(spot.face);
      return { kind: 'chest', id: 'chest', x: spot.x + fx * 1.25, z: spot.z + fz * 1.25, face: spot.face + Math.PI, reach: C.reach };
    },
    /** 打開：動畫跑完呼叫 done（這時才跳「獲得飛盤！」） */
    open(done) {
      if (!spot || anim) return false;
      anim = { kind: 'open', t: 0 };
      onOpened = done;
      prize.visible = true;
      prize.position.set(0, 0.5, 0);
      return true;
    },
    /** 收下：寶箱縮小消失 */
    vanish() { if (spot) anim = { kind: 'vanish', t: 0 }; },
    /** 沒收下：箱蓋關回去，留在原地 */
    shut() { if (spot) anim = { kind: 'close', t: 0 }; },
    update(dt, t) {
      if (!spot) return;
      view.animate(dt, t);
      if (!anim) return;
      anim.t += dt;
      if (anim.kind === 'open') {
        const k = Math.min(1, anim.t / C.openSeconds);
        view.setOpen(Math.min(1, k * 2.2));
        prize.position.y = 0.5 + Math.min(1, k * 1.3) * 1.5;
        prize.rotation.set(1.1, anim.t * 9, 0);
        if (k >= 1 && onOpened) { const f = onOpened; onOpened = null; f(); }
      } else if (anim.kind === 'close') {
        const k = Math.min(1, anim.t / 0.5);
        view.setOpen(1 - k);
        prize.position.y = 2 - k * 1.5;
        if (k >= 1) { prize.visible = false; anim = null; }
      } else if (anim.kind === 'vanish') {
        const k = Math.min(1, anim.t / 0.5);
        view.group.scale.setScalar(Math.max(0.001, 1 - k));
        view.group.position.y = (spot.y ?? 0.9) + k * 0.6;
        if (k >= 1) { view.group.visible = false; spot = null; anim = null; }
      }
    },
    group: view.group,
  };
}
