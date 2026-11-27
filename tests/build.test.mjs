// 用 Node 跑：node tests/build.test.mjs
// 建設帳本：蓋橋的紀錄、同一座橋只扣一次錢、哪些島走得到、歐巴幣扣掉蓋橋的花費。
import { cleanBuild, effectiveBuilds, bridgePlan, reachable, createBuildBook, bridgePrice, sharedRoad, roadPrice, ROAD_KEY } from '../engine/build.js';
import { computeWallet, economyRules, canAfford } from '../engine/economy.js';
import { memoryStorage } from '../engine/progress.js';
import { readFileSync } from 'node:fs';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };

const b = (over = {}) => ({ id: 'b-1', at: 1000, kind: 'bridge', key: 'math-chinese', coins: 120, gems: {}, ...over });

// 1. 整理紀錄
ok(cleanBuild(b())?.coins === 120, '合格的建設');
ok(cleanBuild(b({ kind: 'castle' })) === null, '不認得的種類不收');
ok(cleanBuild(b({ key: 'Math Chinese' })) === null, '代號只能是小寫英文、數字、-');
ok(cleanBuild(b({ coins: -5 })) === null, '負的花費不收');
ok(cleanBuild(b({ id: '<x>' })) === null, '編號有怪字不收');
ok(JSON.stringify(cleanBuild(b({ gems: { math: 60, x: 0, 'A B': 3 } })).gems) === '{"math":60}', '寶石只留合格的');

// 2. 同一座橋只算一次
{
  const list = effectiveBuilds([b({ id: 'b-2', at: 2000 }), b({ id: 'b-1', at: 1000 }), b({ id: 'b-3', key: 'math-english', at: 1500 })]);
  ok(list.length === 2 && list[0].id === 'b-1' && list[1].key === 'math-english', '兩台裝置都蓋了同一座橋：只留最早的');
}

// 3. 可以蓋哪些橋
const subjects = { islands: ['math', 'chinese', 'english', 'science', 'social'].map((code) => ({ code })) };
{
  const plan = bridgePlan(subjects, 'math');
  ok(plan.length === 4 && plan.every((x) => x.from === 'math'), '沒寫 bridges：數學島到每座島各一座');
  const custom = bridgePlan({ ...subjects, bridges: [{ from: 'math', to: 'chinese' }, { from: 'chinese', to: 'math' }, { from: 'chinese', to: 'english' }, { from: 'math', to: 'nope' }] }, 'math');
  ok(custom.length === 2 && custom[1].key === 'chinese-english', '照 subjects.json 的 bridges，重複和不存在的島跳過');
  const reach = reachable(custom, new Set(['math-chinese', 'chinese-english']), 'math');
  ok(reach.has('english') && reach.size === 3, '連過兩座橋也走得到');
  ok(reachable(custom, new Set(['chinese-english']), 'math').size === 1, '只蓋了遠的那座：還是走不到');
}

// 4. 建設本
{
  const book = createBuildBook(memoryStorage());
  ok(book.add('姐姐', b()) === true, '蓋第一座');
  ok(book.add('姐姐', b({ id: 'b-9' })) === false, '同一座橋不能再蓋一次');
  ok(book.built('姐姐').has('math-chinese') && book.built('妹妹').size === 0, '姐姐和妹妹的橋分開');
  ok(book.merge('姐姐', [b(), b({ id: 'b-5', key: 'math-english', at: 3000 })]) === true, '合併試算表：多了一座');
  ok(book.merge('姐姐', [b()]) === false, '合併一樣的不會重複');
  ok(book.effective('姐姐').length === 2, '現在有兩座');
}

// 5. 歐巴幣扣掉蓋橋的錢
{
  const rules = economyRules({ coinsResetAt: '', earn: { firstLoginGift: 50 } });
  const history = [{ id: 'h1', at: 500, level: 'lv-1', island: 'math', score: 7, total: 7, kind: 'level' }]; // 50 + 45 = 95
  const before = computeWallet({ history, spends: [], rules });
  ok(before.coins === 95, '還沒蓋：95 枚');
  ok(!canAfford(before, { coins: 120 }).ok && canAfford(before, { coins: 120 }).short.coins === 25, '不夠：還差 25 枚');
  const more = [...history, { id: 'h2', at: 600, level: 'lv-2', island: 'math', score: 7, total: 7, kind: 'level' }];
  const rich = computeWallet({ history: more, spends: [], rules });
  ok(canAfford(rich, { coins: 120 }).ok, '140 枚：夠蓋');
  const after = computeWallet({ history: more, spends: effectiveBuilds([b(), b({ id: 'b-2', at: 2000 })]), rules });
  ok(after.coins === 20, '蓋了一座（重複的不算）：剩 20 枚');
}

// 6. 橋越蓋越貴：第 n 座 = 120 + 120 × (n − 1)
{
  const rule = economyRules({ build: { bridge: { coins: 120, step: 120 } } }).build.bridge;
  ok([0, 1, 2, 3].map((k) => bridgePrice(rule, k).coins).join(',') === '120,240,360,480', '120、240、360、480');
  ok(bridgePrice(rule, 1).nth === 2, '蓋好 1 座，下一座是第 2 座');
  ok(bridgePrice(economyRules({ build: { bridge: { coins: 120 } } }).build.bridge, 3).coins === 120, '沒寫 step：每座一樣');
  ok(bridgePrice(rule, -2).coins === 120 && bridgePrice(null, 2).coins === 0, '奇怪的數字不會出錯');
  const real = economyRules(JSON.parse(readFileSync(new URL('../config/economy.json', import.meta.url), 'utf8'))).build.bridge;
  ok(bridgePrice(real, 1).coins === 240 && bridgePrice(real, 3).coins === 480, 'economy.json：第 2 座 240、第 4 座 480');
}

// 7. 公路：兩人共有，誰最早蓋就算誰的；錢只從蓋的人扣
{
  const road = (over = {}) => ({ id: 'r-1', at: 5000, kind: 'road', key: ROAD_KEY, coins: 150, gems: { math: 60 }, ...over });
  ok(sharedRoad({}) === null && sharedRoad({ 姐姐: [b()] }) === null, '還沒蓋公路');
  ok(sharedRoad({ 姐姐: [b(), road()], 妹妹: [] })?.kid === '姐姐', '姐姐蓋的公路');
  ok(sharedRoad({ 姐姐: [road({ at: 9000 })], 妹妹: [road({ id: 'r-2', at: 7000 })] })?.kid === '妹妹', '兩人都蓋了：算最早的');
  ok(sharedRoad({ 姐姐: [road({ key: 'road-x' })] }) === null, '別的代號不算公路');
  const book = createBuildBook(memoryStorage());
  book.add('妹妹', road());
  ok(book.road(['姐姐', '妹妹'])?.kid === '妹妹' && book.road(['姐姐']) === null, '建設本：看全部小孩');
  ok(!book.add('妹妹', road({ id: 'r-3' })), '同一個人不會蓋第二條');
  const rules = economyRules(JSON.parse(readFileSync(new URL('../config/economy.json', import.meta.url), 'utf8')));
  const p = roadPrice(rules.build.road);
  ok(p.coins === 800 && p.gems.math === 200, 'economy.json：公路 800 歐巴幣＋200 鑽石');
  ok(roadPrice(null).coins === 0 && !Object.keys(roadPrice(null).gems).length, '沒有設定：0');
  const w = computeWallet({ history: [], spends: book.effective('妹妹'), rules });
  ok(w.coins === -150 && w.gems.math === -60, '公路的錢從蓋的人扣（照紀錄寫的扣）');
  ok(computeWallet({ history: [], spends: book.effective('姐姐'), rules }).coins === 0, '另一個人不扣');
  ok(!canAfford({ coins: 900, gems: { math: 199 } }, p).ok && canAfford({ coins: 800, gems: { math: 200 } }, p).ok, '鑽石不夠不能蓋');
}

console.log(`build: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
