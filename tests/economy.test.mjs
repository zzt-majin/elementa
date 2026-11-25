// 用 Node 跑：node tests/economy.test.mjs
// 檢查歐巴幣和寶石的帳本：每條規則、每天上限、錯題重練不給、合併本機和雲端紀錄不重複、扣掉花費。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { economyRules, computeWallet, canAfford, createLedger, cleanEntry, localDay, DEFAULTS } from '../engine/economy.js';
import { memoryStorage } from '../engine/progress.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + err.message); process.exitCode = 1; }
}

const raw = JSON.parse(readFileSync(new URL('../config/economy.json', import.meta.url), 'utf8'));
const rules = economyRules(raw);
const DAY = 86400000;
const T0 = new Date(2026, 10, 25, 10, 0, 0).getTime(); // 這台裝置時區的 11/25 早上十點
let seq = 0;
const lv = (score, total, at = T0, level = 'jie-6a-math-unit-01', kind = 'level') => ({ id: 'e' + (++seq), at, level, island: 'math', score, total, kind });
const game = (score, at = T0, island = 'math') => ({ id: 'g' + (++seq), at, level: 'game-' + island, island, score, total: Math.max(1, score), kind: 'game' });
const wallet = (history, spends) => computeWallet({ history, spends, rules });

test('config/economy.json 讀得進來，數字和設計決定一樣', () => {
  assert.equal(rules.firstLoginGift, 50);
  assert.equal(rules.levelFirstSubmit, 10);
  assert.equal(rules.gemPerCorrect, 1);
  assert.equal(rules.gemFirstPerfectBonus, 5);
  assert.equal(rules.gemGameEvery, 5);
  assert.equal(rules.gemDailyCapPerIsland, 30);
  assert.deepEqual(rules.build.bridge, { coins: 120, gems: {} });
  assert.deepEqual(rules.build.road, { coins: 150, gems: { math: 60 } });
  assert.equal(rules.gems.math.name, '鑽石');
  assert.equal(Object.keys(rules.gems).length, 5);
  assert.ok(!('_說明' in rules.build));
});

test('數字亂填就用預設', () => {
  const r = economyRules({ earn: { firstLoginGift: -3, levelFirstSubmit: 'abc' }, gemEarn: { perCorrect: 9999 } });
  assert.equal(r.firstLoginGift, DEFAULTS.firstLoginGift);
  assert.equal(r.levelFirstSubmit, DEFAULTS.levelFirstSubmit);
  assert.equal(r.gemPerCorrect, DEFAULTS.gemPerCorrect);
});

test('什麼都沒做：只有見面禮 50', () => {
  const w = wallet([]);
  assert.equal(w.coins, 50);
  assert.deepEqual(w.gems, {});
});

test('第一次交卷 +10，答對幾題給幾顆鑽石', () => {
  const w = wallet([lv(5, 7)]);
  assert.equal(w.coins, 60);
  assert.equal(w.gems.math, 5);
});

test('第一次全對：+10 +每題 5，鑽石 = 答對題數 + 5', () => {
  const w = wallet([lv(7, 7)]);
  assert.equal(w.coins, 50 + 10 + 35);
  assert.equal(w.gems.math, 7 + 5);
});

test('先 5 題再全對：交卷只給一次，鑽石只補多答對的', () => {
  const w = wallet([lv(5, 7), lv(7, 7, T0 + 60000)]);
  assert.equal(w.coins, 50 + 10 + 35);
  assert.equal(w.gems.math, 7 + 5);
});

test('同一天一直寫同一關，鑽石不會變多', () => {
  const w = wallet([lv(7, 7), lv(7, 7, T0 + 1000), lv(6, 7, T0 + 2000), lv(7, 7, T0 + 3000)]);
  assert.equal(w.gems.math, 12);
  assert.equal(w.coins, 95); // 第一次全對當天再全對不另外給
});

test('隔天再全對：+5 歐巴幣（每天一次），鑽石重新算當天最好', () => {
  const w = wallet([lv(7, 7), lv(7, 7, T0 + DAY), lv(7, 7, T0 + DAY + 1000)]);
  assert.equal(w.coins, 95 + 5);
  assert.equal(w.gems.math, 12 + 7);
});

test('錯題重練不給資源', () => {
  const w = wallet([lv(5, 7), lv(2, 2, T0 + 1000, 'jie-6a-math-unit-01', 'retry')]);
  assert.equal(w.coins, 60);
  assert.equal(w.gems.math, 5);
});

test('每科每天最多 30 顆鑽石，隔天重新算', () => {
  const h = [];
  for (let i = 1; i <= 6; i++) h.push(lv(7, 7, T0 + i * 1000, 'jie-6a-math-unit-0' + i)); // 每關 12 顆
  const w = wallet(h);
  assert.equal(w.gems.math, 30);
  const w2 = wallet([...h, lv(7, 7, T0 + DAY, 'jie-6a-math-unit-07')]);
  assert.equal(w2.gems.math, 42);
  assert.equal(w2.coins, 50 + 7 * 45); // 歐巴幣沒有每日上限（搶答賽除外）
});

test('搶答賽：每題 +1，第一場不算刷新，之後刷新 +15；每 5 題一顆鑽石', () => {
  const w = wallet([game(8), game(10, T0 + 1000), game(9, T0 + 2000)]);
  assert.equal(w.coins, 50 + 8 + (10 + 15) + 9);
  assert.equal(w.gems.math, 1 + 2 + 1);
});

test('搶答賽一天最多 50 歐巴幣，隔天重新算', () => {
  const h = [game(20), game(25, T0 + 1000), game(25, T0 + 2000)]; // 20 + 40 + 25 = 85 → 50
  assert.equal(wallet(h).coins, 50 + 50);
  assert.equal(wallet([...h, game(10, T0 + DAY)]).coins, 50 + 50 + 10);
});

test('不知道哪一科的紀錄：照給歐巴幣，不給寶石', () => {
  const w = wallet([{ id: 'x1', at: T0, level: 'old-level', score: 3, total: 3, kind: 'level' }]);
  assert.equal(w.coins, 50 + 10 + 15);
  assert.deepEqual(w.gems, {});
});

test('islandOf 可以幫沒有 island 的紀錄找科目', () => {
  const w = computeWallet({ history: [{ id: 'x1', at: T0, level: 'jie-6a-math-unit-01', score: 3, total: 7, kind: 'level' }], rules, islandOf: (e) => (e.level.includes('-math-') ? 'math' : '') });
  assert.equal(w.gems.math, 3);
});

test('順序亂掉也照時間算', () => {
  const a = wallet([lv(5, 7, T0), lv(7, 7, T0 + 1000)]);
  const b = wallet([lv(7, 7, T0 + 1000), lv(5, 7, T0)].map((x, i) => ({ ...x, id: 'z' + i })));
  assert.equal(a.coins, b.coins);
});

test('每一筆賺了多少（交卷畫面用）', () => {
  const e = lv(7, 7);
  const w = wallet([e]);
  assert.deepEqual(w.events.find((x) => x.id === e.id), { id: e.id, coins: 45, gems: { math: 12 } });
});

test('扣掉蓋橋和公路的花費；夠不夠付', () => {
  const h = [];
  for (let i = 1; i <= 5; i++) h.push(lv(7, 7, T0 + i * DAY, 'jie-6a-math-unit-0' + i));
  const w = wallet(h, [{ id: 's1', at: T0 + 9 * DAY, coins: 120 }]);
  assert.equal(w.coins, 50 + 5 * 45 - 120);
  assert.equal(w.gems.math, 60);
  assert.equal(canAfford(w, rules.build.bridge).ok, true);
  assert.equal(canAfford(w, rules.build.road).ok, true);
  const poor = wallet([lv(5, 7)]);
  assert.deepEqual(canAfford(poor, rules.build.road), { ok: false, short: { coins: 90, gems: { math: 55 } } });
});

test('不合格的紀錄被丟掉', () => {
  assert.equal(cleanEntry({ id: 'a', at: T0, level: 'x', score: 8, total: 7, kind: 'level' }), null);
  assert.equal(cleanEntry({ id: 'a', at: T0, level: 'x', score: 1, total: 0, kind: 'level' }), null);
  assert.equal(cleanEntry({ id: 'a', at: 'abc', level: 'x', score: 1, total: 2, kind: 'level' }), null);
  assert.equal(cleanEntry({ id: 'a', at: T0, level: 'x', score: 1, total: 2, kind: 'hack' }), null);
  assert.equal(wallet([{ id: 'a', at: T0, level: 'x', score: 99, total: 7, kind: 'level' }]).coins, 50);
});

test('紀錄本：本機和雲端同一筆只算一次，姐妹分開', () => {
  const ledger = createLedger(memoryStorage());
  const e = lv(7, 7);
  assert.equal(ledger.add('姐姐', e), true);
  assert.equal(ledger.add('姐姐', e), false);
  assert.equal(ledger.merge('姐姐', [e, lv(3, 7, T0 + 1000, 'jie-6a-math-unit-02')]), true);
  assert.equal(ledger.merge('姐姐', [e]), false);
  assert.equal(ledger.history('姐姐').length, 2);
  assert.equal(ledger.history('妹妹').length, 0);
});

test('紀錄本存起來，重新打開還在', () => {
  const st = memoryStorage();
  createLedger(st).add('姐姐', lv(7, 7));
  assert.equal(createLedger(st).history('姐姐').length, 1);
});

test('哪一天照裝置時區', () => {
  assert.equal(localDay(T0), '2026-11-25');
  assert.equal(localDay(T0 + DAY), '2026-11-26');
});

console.log(passed + ' 項通過' + (process.exitCode ? '，有失敗' : ''));
