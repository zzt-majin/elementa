// 用 Node 跑：node tests/toys.test.mjs
// 寶箱、裝備和飛盤的規則（engine/toys.js、avatar/frisbee-play.js）。
import { readFileSync } from 'node:fs';
import { toyRules, itemRecord, ownedItems, chestState, chestSpot, chargeOf, throwDistance, itemKey } from '../engine/toys.js';
import { onLand, landingOf, goddessSpot, pickChasers, firstCatch, flightAt } from '../avatar/frisbee-play.js';
import { cleanBuild, effectiveBuilds } from '../engine/build.js';
import { milestones } from '../engine/diary.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const raw = JSON.parse(readFileSync(new URL('../config/toys.json', import.meta.url), 'utf8'));
const R = toyRules(raw);
ok(R.slots === 4, '裝備一列 4 格');
ok(R.chest.item === 'frisbee' && R.items[0].name === '飛盤', '寶箱裡是飛盤');
ok(R.frisbee.chargeSeconds === 1.5 && R.frisbee.minDistance === 3 && R.frisbee.maxDistance === 20 && R.frisbee.dogRange === 15, '蓄力 1.5 秒、3～20 公尺、狗 15 公尺內');
ok(R.goddess.riseSeconds === 0.6 && R.goddess.talkSeconds === 1.5, '女神浮出 0.6 秒、說話 1.5 秒');
ok(R.items[0].colors.outer === '#d32f2f' && R.items[0].colors.inner === '#1e6fd9' && R.items[0].colors.rim === '#a82424', '飛盤的顏色');
const D = toyRules({});
ok(D.frisbee.maxDistance === 20 && D.chest.item === '' && D.slots === 4, '沒有設定也不會壞');
ok(toyRules({ frisbee: { minDistance: 10, maxDistance: 5 } }).frisbee.maxDistance === 10, '最遠不會比最近還近');

// 建設本認得裝備
const rec = itemRecord({ id: 'a1', at: 1000, code: 'frisbee' });
ok(rec && rec.kind === 'item' && rec.key === 'item-frisbee' && rec.coins === 0, '收下飛盤記成一筆 item');
ok(cleanBuild(rec)?.key === 'item-frisbee', 'build.js 收 item');
ok(itemRecord({ id: 'a', at: 1, code: 'Bad Code' }) === null, '代號不對就不記');
ok(itemKey('frisbee') === 'item-frisbee', 'itemKey');

const bridge = { id: 'b1', at: 500, kind: 'bridge', key: 'math-chinese', coins: 120, gems: {} };
const bridge2 = { id: 'b2', at: 900, kind: 'bridge', key: 'math-english', coins: 240, gems: {} };
ok(!chestState([], R).show, '還沒蓋橋：沒有寶箱');
const st = chestState([bridge2, bridge], R);
ok(st.show && st.bridge.key === 'math-chinese', '蓋好橋：寶箱在第一座橋那邊');
ok(!chestState([bridge, rec], R).show, '收下以後寶箱不見');
ok(!chestState([bridge, rec, { ...rec, id: 'a2', at: 2000 }], R).show && effectiveBuilds([rec, { ...rec, id: 'a2', at: 2000 }]).length === 1, '兩台裝置都收下也只算一次');
ok(ownedItems([bridge, rec]).join() === 'frisbee', '裝備清單有飛盤');
ok(ownedItems([bridge]).length === 0, '沒收下就沒有飛盤');

// 寶箱的位置：第一座橋另一頭、下橋往前一點、往旁邊一點（不擋橋）
const line = { a: { x: 20, z: 0 }, b: { x: 40, z: 0 }, u: { x: 1, z: 0 } };
const spot = chestSpot(line, R);
ok(near(spot.x, 41.8) && Math.abs(spot.z) > 1.5, '寶箱在下橋後一步、旁邊');
ok(near(spot.face, Math.atan2(-1, 0)), '寶箱面向橋');

// 蓄力和距離
ok(chargeOf(0, R) === 0 && near(chargeOf(0.75, R), 0.5) && chargeOf(3, R) === 1, '按 1.5 秒蓄滿');
ok(throwDistance(0, R) === 3 && throwDistance(1, R) === 20 && near(throwDistance(0.5, R), 11.5), '輕按 3 公尺、按滿 20 公尺');

// 落點：島（0,0）半徑 24、橋往東接到（60,0）的島
const home = { type: 'circle', cx: 0, cz: 0, r: 24 };
const other = { type: 'circle', cx: 60, cz: 0, r: 18 };
const strip = { type: 'strip', ax: 22, az: 0, bx: 44, bz: 0, half: 1.5 };
const area = { grounds: [home, other, strip], obstacles: [{ x: 0, z: 8, r: 2 }] };
const east = Math.PI / 2; // 面向 +x
const north = 0; // 面向 +z
let L = landingOf({ x: 0, z: -10 }, east, 10, area);
ok(!L.sea && near(L.x, 10, 0.01) && near(L.z, -10, 0.01), '在島上：丟多遠就落多遠');
L = landingOf({ x: 15, z: -10 }, east, 20, area);
ok(L.sea && Math.hypot(L.x, L.z) <= 24 && Math.hypot(L.x, L.z) > 22, '要掉進海裡：停在沙灘邊');
L = landingOf({ x: 15, z: 0 }, east, 20, area);
ok(!L.sea && near(L.x, 35, 0.01), '沿著橋丟：落在橋上');
L = landingOf({ x: 30, z: 0 }, north, 10, area);
ok(L.sea && Math.abs(L.z) < 1.5, '在橋上往旁邊丟：馬上停住');
L = landingOf({ x: 0, z: 3 }, north, 5, area);
ok(!L.sea && Math.hypot(L.x - 0, L.z - 8) >= 2, '落在建築裡就推到旁邊');
ok(onLand({ x: 0, z: 0 }, area) && !onLand({ x: 0, z: 30 }, area), 'onLand');

// 女神：在飛盤外面的海上，面向飛盤
const g = goddessSpot({ x: 23.5, z: 0 }, { grounds: [home] }, north, 3);
ok(near(g.x, 26.5, 0.01) && near(g.z, 0, 0.01), '女神從島往外 3 公尺的海上');
ok(!onLand(g, { grounds: [home] }), '女神在海裡');
ok(near(g.face, Math.atan2(-1, 0)), '女神面向飛盤');

// 誰去追
const myArea = { grounds: [home] };
const dogs = [
  { id: 'near', x: 2, z: 0, area: myArea },
  { id: 'cat', x: 1, z: 0, cat: true, area: myArea },
  { id: 'hungry', x: 1, z: 1, hungry: true, area: myArea },
  { id: 'far', x: 0, z: 20, area: myArea },
  { id: 'close', x: 9, z: 0, area: myArea },
  { id: 'otherIsland', x: 60, z: 0, area: { grounds: [other] } },
];
const ch = pickChasers(dogs, { x: 0, z: 0 }, { x: 10, z: 0 }, { range: 15 });
ok(ch.join() === 'close,near', '15 公尺內、不是貓、不餓、走得到的狗，近的先：' + ch.join());
ok(pickChasers(dogs, { x: 0, z: 0 }, { x: 10, z: 0 }, { range: 1 }).length === 0, '太遠的狗不追');
ok(pickChasers([{ id: 'v', x: 50, z: 0, area: { grounds: [other] } }], { x: 48, z: 0 }, { x: 0, z: 0 }).length === 0, '落在狗走不到的地方：不追');
ok(firstCatch([{ id: 'a', x: 0.5, z: 0 }, { id: 'b', x: 0.2, z: 0 }], { x: 0, z: 0 }, 0.9) === 'b', '最先碰到（最近）的接住');
ok(firstCatch([{ id: 'a', x: 3, z: 0 }], { x: 0, z: 0 }, 0.9) === null, '還沒碰到');

// 飛的路線
const f0 = flightAt({ x: 0, y: 1, z: 0 }, { x: 10, y: 0, z: 0 }, 0);
const f1 = flightAt({ x: 0, y: 1, z: 0 }, { x: 10, y: 0, z: 0 }, 1);
const fm = flightAt({ x: 0, y: 1, z: 0 }, { x: 10, y: 0, z: 0 }, 0.5);
ok(near(f0.x, 0) && near(f0.y, 1) && near(f1.x, 10) && near(f1.y, 0) && fm.y > 1, '從手上飛出去、拱起來、落到地上');

// 日記
const ms = milestones({ builds: [bridge, rec], text: { itemTitle: '打開寶箱！', itemBody: '拿到{item}', itemDiary: '{m}/{d} 打開寶箱，拿到{item}！' }, items: { frisbee: '飛盤' }, timeZone: 'Asia/Taipei' });
const it = ms.find((m) => m.id === 'item-frisbee');
ok(it && it.line === '1/1 打開寶箱，拿到飛盤！' && it.art === 'chest', '日記：打開寶箱，拿到飛盤：' + (it && it.line));

// Apps Script 認得「裝備」
const gs = readFileSync(new URL('../backend/Code.gs', import.meta.url), 'utf8');
ok(/'裝備':\s*'item'/.test(gs), 'Apps Script 的建設類型有「裝備」');

console.log(`toys: ${pass} 項通過` + (fail.length ? `，${fail.length} 項失敗：\n  ` + fail.join('\n  ') : ''));
if (fail.length) process.exit(1);
