// 用 Node 跑：node tests/walk.test.mjs
// 小公主走路：不能走出草地、不能穿過建築、會沿著邊滑、點地面走過去、門口判斷、方向鍵對應畫面方向。
import { resolve, step, nearestDoor, screenToGround, createWalker, turnToward, clampTarget } from '../avatar/walk.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

const area = { cx: 0, cz: 0, radius: 10, obstacles: [{ x: 0, z: -5, r: 1 }] };
const body = 0.35;

// 1. 草地邊界
{
  const p = resolve({ x: 20, z: 0 }, area, body);
  ok(near(Math.hypot(p.x, p.z), 10 - body), '海裡的點拉回草地邊');
  let w = { x: 0, z: 0 };
  for (let i = 0; i < 100; i++) w = step(w, { x: 1, z: 0 }, 0.5, area, body);
  ok(Math.hypot(w.x, w.z) <= 10 - body + 1e-9, '一直往右走也不會掉進海裡');
}
// 2. 建築擋住
{
  let w = { x: 0, z: 0 };
  for (let i = 0; i < 40; i++) w = step(w, { x: 0, z: -1 }, 0.3, area, body);
  ok(Math.hypot(w.x - 0, w.z + 5) >= 1 + body - 1e-9, '正面走向建築會停在建築外');
  ok(w.z > -5, '沒有穿過建築到另一邊');
  // 斜著走會沿著邊滑過去
  let s = { x: 0.6, z: -2 };
  for (let i = 0; i < 60; i++) s = step(s, { x: 0, z: -1 }, 0.2, area, body);
  ok(s.z < -5, '偏一點走會沿著建築邊滑過去');
  ok(Math.hypot(s.x, s.z + 5) >= 1 + body - 1e-9, '滑過去時也沒有進到建築裡');
}
// 3. 大步也不會穿牆
{
  const w = step({ x: 0, z: -2.5 }, { x: 0, z: -1 }, 6, area, body);
  ok(w.z > -5, '一格走很遠也不會跳過建築');
}
// 4. 門口
{
  const doors = [{ kind: 'tower', x: 0, z: -3 }, { kind: 'tent', x: 5, z: 0 }];
  ok(nearestDoor({ x: 0.5, z: -2.5 }, doors, 1.6)?.kind === 'tower', '靠近測驗塔門口');
  ok(nearestDoor({ x: 2.5, z: 0 }, doors, 1.6) === null, '兩個門都太遠就沒有');
  ok(nearestDoor({ x: 4, z: 0 }, doors, 1.6)?.kind === 'tent', '靠近帳篷門口');
}
// 5. 畫面方向
{
  const up = screenToGround(0, 1, 0); // 相機在 +z，往畫面上走 = 往 -z
  ok(near(up.x, 0) && near(up.z, -1), '相機在南邊時，上 = 往北（-z）');
  const right = screenToGround(1, 0, 0);
  ok(near(right.x, 1) && near(right.z, 0), '相機在南邊時，右 = +x');
  const turned = screenToGround(0, 1, Math.PI / 2); // 相機在 +x
  ok(near(turned.x, -1) && near(turned.z, 0), '相機轉到東邊，上 = 往西');
  const diag = screenToGround(1, 1, 0);
  ok(near(Math.hypot(diag.x, diag.z), 1), '斜走速度不會變快');
  ok(screenToGround(0, 0, 1).x === 0, '沒按方向鍵就不動');
}
// 6. 點地面走過去
{
  const w = createWalker({ x: 0, z: 5 }, { speed: 4 });
  w.goTo({ x: 3, z: 5 }, area);
  let arrived = false;
  for (let i = 0; i < 120 && !arrived; i++) arrived = w.update(1 / 60, null, area).arrived;
  ok(arrived && near(w.x, 3, 0.2), '點地面會走到那裡');
  ok(w.target === null, '到了就停');
  // 點海裡：走到岸邊
  const t = clampTarget({ x: 30, z: 0 }, area, body);
  ok(near(Math.hypot(t.x, t.z), 10 - body), '點海裡就走到岸邊');
  // 目標在建築後面、被擋住：會停下來而不是一直推
  const b = createWalker({ x: 0, z: -1.4 }, { speed: 4 });
  const wall = { cx: 0, cz: 0, radius: 10, obstacles: [{ x: 0, z: -3, r: 1.2 }, { x: -1.2, z: -2.4, r: 1.2 }, { x: 1.2, z: -2.4, r: 1.2 }] };
  b.goTo({ x: 0, z: -6 }, wall);
  for (let i = 0; i < 200; i++) b.update(1 / 60, null, wall);
  ok(b.target === null, '被擋住走不過去會自己停下來');
  // 按方向鍵會取消點地面
  const c = createWalker({ x: 0, z: 0 }, { speed: 4 });
  c.goTo({ x: 5, z: 0 }, area);
  c.update(1 / 60, { x: 0, z: 1 }, area);
  ok(c.target === null, '按方向鍵會取消點地面的目標');
  ok(c.moving > 0, '走路時 moving 大於 0（腳會擺動）');
  c.update(1 / 60, null, area);
  ok(c.moving === 0, '停下來 moving 是 0');
  // 到門口後面向建築
  const d = createWalker({ x: 0, z: 2 }, { speed: 4 });
  d.goTo({ x: 0, z: 1 }, area, Math.PI);
  for (let i = 0; i < 60; i++) d.update(1 / 60, null, area);
  ok(near(d.heading, Math.PI), '走到門口會面向建築');
}
// 7. 轉身走最短的方向
{
  const a = turnToward(3, -3, 1);
  ok(near(Math.cos(a), Math.cos(-3)) && near(Math.sin(a), Math.sin(-3)), '轉到目標角度');
  ok(Math.abs(turnToward(3, -3, 0.5) - 3) < 0.3, '從 3 轉到 -3 走短的那邊（只差 0.28）');
}

console.log(`walk: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
