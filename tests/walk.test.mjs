// 用 Node 跑：node tests/walk.test.mjs
// 小公主走路：不能走出草地、不能穿過建築、會沿著邊滑、點地面走過去、門口判斷、方向鍵對應畫面方向。
import { resolve, step, nearestDoor, screenToGround, createWalker, turnToward, clampTarget, groundAt, routeVia, surfaceAt } from '../avatar/walk.js';

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

// 蓋橋以後：兩座島＋一條橋（第 4 步）
{
  const A = { type: 'circle', cx: 0, cz: 0, r: 10 };
  const B = { type: 'circle', cx: 40, cz: 0, r: 10 };
  const bridge = { type: 'strip', ax: 8, az: 0, bx: 32, bz: 0, half: 1.5 };
  const two = { grounds: [A, B], obstacles: [] };
  const linked = { grounds: [A, B, bridge], obstacles: [] };
  let w = { x: 0, z: 0 };
  for (let i = 0; i < 200; i++) w = step(w, { x: 1, z: 0 }, 0.5, two, body);
  ok(w.x <= 10 - body + 1e-9, '沒蓋橋：走不到隔壁島');
  w = { x: 0, z: 0 };
  for (let i = 0; i < 200; i++) w = step(w, { x: 1, z: 0 }, 0.5, linked, body);
  ok(w.x > 40, '蓋好橋：一直往右走會走到隔壁島');
  ok(groundAt(w, linked) === B, '走過去以後站在隔壁島上');
  // 在橋上往旁邊走不會掉進海裡
  let s = { x: 20, z: 0 };
  for (let i = 0; i < 40; i++) s = step(s, { x: 0, z: 1 }, 0.3, linked, body);
  ok(near(s.z, 1.5 - body) && near(s.x, 20), '在橋上往旁邊走會停在橋邊');
  ok(groundAt({ x: 20, z: 0 }, linked) === bridge, '橋中間站在橋上');
  ok(groundAt({ x: 9, z: 0 }, linked) === A, '橋頭（島和橋重疊）算在島上');
  // 點海裡：拉到最近的可以走的地方（橋或島）
  const t = clampTarget({ x: 20, z: 6 }, linked, body);
  ok(near(t.x, 20) && near(t.z, 1.5 - body), '點橋旁邊的海，會走到橋邊');
  // 斜的橋
  const diag = { type: 'strip', ax: 0, az: 0, bx: 30, bz: 30, half: 1 };
  const d = resolve({ x: 15, z: 18 }, { grounds: [diag], obstacles: [] }, body);
  ok(Math.abs((-15 + d.z - d.x) / Math.SQRT2) <= 1 - body + 1e-6 || Math.abs((d.z - d.x) / Math.SQRT2) <= 1 - body + 1e-6, '斜的橋也會拉回橋上');
  // 點對岸：沿著橋走過去
  const walker = createWalker({ x: 0, z: 0 }, { speed: 4, body });
  walker.goTo({ x: 40, z: 0 }, linked);
  for (let i = 0; i < 400 && walker.target; i++) walker.update(0.05, null, linked);
  ok(Math.hypot(walker.x - 40, walker.z) < 0.3, '點對岸的島，小公主會走過橋');
  // 對岸不在橋的正前方：先走到橋頭、過橋，再走過去
  const via = routeVia({ x: -5, z: 6 }, { x: 44, z: -6 }, linked);
  ok(via.length === 2 && near(via[0].x, 8) && near(via[1].x, 32), '找到路：先到橋頭再到橋尾');
  ok(routeVia({ x: 0, z: 0 }, { x: 3, z: 3 }, linked).length === 0, '同一座島直接走');
  ok(routeVia({ x: 0, z: 0 }, { x: 40, z: 0 }, two).length === 0, '沒有橋就找不到路');
  const w2 = createWalker({ x: -5, z: 6 }, { speed: 4, body });
  w2.goTo({ x: 44, z: -6 }, linked);
  for (let i = 0; i < 600 && w2.target; i++) w2.update(0.05, null, linked);
  ok(Math.hypot(w2.x - 44, w2.z + 6) < 0.3, '點對岸斜邊的地方，也會繞到橋走過去');
  // 三座島：A—B—C
  const C = { type: 'circle', cx: 40, cz: 40, r: 10 };
  const bc = { type: 'strip', ax: 40, az: 8, bx: 40, bz: 32, half: 1.5 };
  const three = { grounds: [A, B, C, bridge, bc], obstacles: [] };
  ok(routeVia({ x: 0, z: 0 }, { x: 40, z: 40 }, three).length === 4, '要過兩座橋也找得到路');
}

// 沙灘：草地 0.9，往外一個小坡，沙灘 0.6；橋上和草地一樣高
{
  const isl = { type: 'circle', cx: 0, cz: 0, r: 25, grassR: 22, slopeR: 23, sandTop: 0.6 };
  const br = { type: 'strip', ax: 20, az: 0, bx: 60, bz: 0, half: 1.5 };
  const a = { grounds: [isl, br], obstacles: [] };
  ok(surfaceAt({ x: 5, z: 0 }, a).y === 0.9 && !surfaceAt({ x: 5, z: 0 }, a).beach, '草地上 0.9');
  ok(surfaceAt({ x: 0, z: 24 }, a).y === 0.6 && surfaceAt({ x: 0, z: 24 }, a).beach, '沙灘上 0.6，算在沙灘');
  const mid = surfaceAt({ x: 0, z: 22.5 }, a);
  ok(mid.y < 0.9 && mid.y > 0.6, '草地邊的小坡：' + mid.y.toFixed(2));
  ok(surfaceAt({ x: 24, z: 0 }, a).y === 0.9 && !surfaceAt({ x: 24, z: 0 }, a).beach, '走在橋上（底下是沙灘）還是橋面高度');
  ok(surfaceAt({ x: 24, z: 2 }, a).y === 0.6, '橋旁邊的沙灘');
  let w = { x: 0, z: 0 };
  for (let i = 0; i < 120; i++) w = step(w, { x: 0, z: 1 }, 0.5, a, body);
  ok(Math.abs(w.z - (25 - body)) < 1e-6, '一直往海邊走：停在沙灘邊');
  ok(surfaceAt({ x: 1, z: 1 }, { cx: 0, cz: 0, radius: 10, obstacles: [] }).y === 0.9, '舊的一座島寫法：都算草地');
}

console.log(`walk: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
