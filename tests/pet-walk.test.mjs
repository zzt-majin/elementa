// 用 Node 跑：node tests/pet-walk.test.mjs
// 狗狗自己亂跑：只在自己的島和蓋好的橋上、會過橋、不會跑到公路上；肚子餓時不動。
import { createWalker, groundAt } from '../avatar/walk.js';
import { createPetBrain, pickSpot } from '../avatar/pet-walk.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
// 亂數固定，每次跑都一樣
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// 數學島（0,0）半徑 24、國語島（60,0）半徑 18，中間一座橋；公路在南邊（不放進狗狗的地）
const home = { type: 'circle', cx: 0, cz: 0, r: 24, grassR: 21, slopeR: 22.5, sandTop: 0.6, island: 'math' };
const other = { type: 'circle', cx: 60, cz: 0, r: 18, grassR: 15, slopeR: 16.5, sandTop: 0.6, island: 'chinese' };
const bridge = { type: 'strip', ax: 22, az: 0, bx: 44, bz: 0, half: 1.2 };
const area = { grounds: [home, other, bridge], obstacles: [{ x: 0, z: -3, r: 2 }] };
const onLand = (p) => Math.hypot(p.x, p.z) <= 24.01 || Math.hypot(p.x - 60, p.z) <= 18.01 || (p.x >= 21.9 && p.x <= 44.1 && Math.abs(p.z) <= 1.21);

let bad = null;
for (let i = 0; i < 200 && !bad; i++) {
  const p = pickSpot(area, { x: rand() * 20 - 10, z: rand() * 20 - 10 }, { rand });
  if (!onLand(p)) bad = p;
}
ok(!bad, '挑的地方都在地上' + (bad ? '：' + JSON.stringify(bad) : ''));
ok(onLand(pickSpot({ grounds: [home] }, { x: 200, z: 200 }, { rand })), '離很遠也會挑回島上');

const w = createWalker({ x: 0, z: 10 }, { speed: 2.6, body: 0.28 });
const brain = createPetBrain(w, { rest: [0.5, 1.5], range: 14, hop: 0.3, rand });
let visited = false;
let offLand = 0;
let south = 0;
for (let t = 0; t < 600; t += 0.05) {
  brain.update(0.05, area, false);
  if (!onLand(w)) offLand++;
  if (groundAt(w, area)?.island === 'chinese') visited = true;
  if (w.z > 25) south++;
}
ok(offLand === 0, '一直在地上（跑出去 ' + offLand + ' 次）');
ok(visited, '會自己過橋到別的島');
ok(south === 0, '不會跑到南邊的公路上');

// 肚子餓：停下來不動
const h = createWalker({ x: 0, z: 10 }, { speed: 2.6, body: 0.28 });
const hb = createPetBrain(h, { rest: [0.1, 0.2], rand });
for (let t = 0; t < 2; t += 0.05) hb.update(0.05, area, false); // 先讓牠開始跑
for (let t = 0; t < 0.3; t += 0.05) hb.update(0.05, area, true);
const at = { x: h.x, z: h.z };
for (let t = 0; t < 10; t += 0.05) hb.update(0.05, area, true);
ok(Math.hypot(h.x - at.x, h.z - at.z) < 1e-6 && !h.target, '肚子餓時坐著不動');
for (let t = 0; t < 10; t += 0.05) hb.update(0.05, area, false);
ok(Math.hypot(h.x - at.x, h.z - at.z) > 0.5, '吃飽（錢變回正的）又會跑');
ok(brain.update(0.05, null, false).resting === true, '還沒有地也不會壞');

console.log(`pet-walk: ${pass} 項通過` + (fail.length ? `，${fail.length} 項失敗：\n  ` + fail.join('\n  ') : ''));
if (fail.length) process.exit(1);
