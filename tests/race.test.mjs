// 用 Node 跑：node tests/race.test.mjs
// 檢查搶答賽：參數、試算表規則、題庫（哪些關卡放得進去）、抽題、計分計時、送到後台的格式。
// 會拿 content/levels/ 裡每一關實際出題、實際抽題。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLevels, parseLevel } from '../engine/levels.js';
import { materialize, checkQuestion, questionKey } from '../engine/generate.js';
import { createProgress, memoryStorage } from '../engine/progress.js';
import { createCloud, cloudSettings, memoryStore } from '../engine/cloud.js';
import {
  raceSettings, rulesFor, raceId, choiceSources, poolState, buildPool, createDrawer,
  createRace, raceLeft, raceOver, answerRace, nextQuestion, finishRace, raceSummary, shouldRecord, RACE_DEFAULTS,
} from '../games/quiz-race/race.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + (err.stack || err.message)); process.exitCode = 1; }
}
const here = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const json = async (p) => JSON.parse(await readFile(here(p), 'utf8'));

const cfg = await json('config/generators/math.json');
const { levels: raw, errors } = await loadLevels(here('content/levels/'), (p) => readFile(p, 'utf8'));
// 網站裡搶答賽的題庫是一個小孩一座島；這裡用姐姐的六上數學測（妹妹四上的題型在 generate-g4.test.mjs）
const levels = raw.filter((l) => l.meta.kid === '姐姐').map((l) => materialize(l, { cfg, seed: 12345 }));

// ---------- 參數 ----------

await test('config/game.json 讀得懂，和預設一致的欄位都有', async () => {
  const conf = await json('config/game.json');
  const s = raceSettings(conf);
  assert.equal(s.seconds, conf.seconds);
  assert.equal(s.wrongPenalty, conf.wrongPenalty);
  assert.equal(s.pool, conf.pool);
  assert.deepEqual(s.sheetValues, conf.sheetValues);
  assert.equal(s.levelPrefix, 'game-');
});

await test('亂填的參數用預設', () => {
  const s = raceSettings({ seconds: 5, wrongPenalty: 99, pool: 'xx', sheetValues: { 亂: 'nope' }, tickMs: 1, levelPrefix: 'BAD PREFIX' });
  assert.equal(s.seconds, RACE_DEFAULTS.seconds);
  assert.equal(s.wrongPenalty, RACE_DEFAULTS.wrongPenalty);
  assert.equal(s.pool, RACE_DEFAULTS.pool);
  assert.deepEqual(s.sheetValues, RACE_DEFAULTS.sheetValues);
  assert.equal(s.tickMs, RACE_DEFAULTS.tickMs);
  assert.equal(s.levelPrefix, 'game-');
  assert.deepEqual(raceSettings(null), raceSettings({}));
});

await test('試算表「設定」：有填照試算表，沒填或超出範圍用預設', () => {
  const s = raceSettings({});
  assert.deepEqual(rulesFor(null, s), { seconds: 60, penalty: 3, pool: 'afterQuiz', from: 'default' });
  assert.deepEqual(rulesFor({ gameSeconds: 90, wrongPenalty: 0, gamePool: '全對後' }, s), { seconds: 90, penalty: 0, pool: 'afterPerfect', from: 'sheet' });
  assert.deepEqual(rulesFor({ gameSeconds: '120', wrongPenalty: '5', gamePool: ' 一開始 ' }, s), { seconds: 120, penalty: 5, pool: 'always', from: 'sheet' });
  const bad = rulesFor({ gameSeconds: 10, wrongPenalty: 11, gamePool: '隨便', cards: '測驗後' }, s);
  assert.deepEqual(bad, { seconds: 60, penalty: 3, pool: 'afterQuiz', from: 'default' });
  assert.equal(rulesFor({ gameSeconds: '' }, s).seconds, 60);
  assert.equal(raceId('math', s), 'game-math');
});

// ---------- 題庫 ----------

const byId = (id) => levels.find((l) => l.meta.id === id);

await test('關卡都讀得到', () => {
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.ok(levels.length >= 13);
});

await test('只有出選擇題的題型會放進題庫，題數當權重', () => {
  const u1 = choiceSources(byId('jie-6a-math-unit-01'));
  assert.deepEqual(u1.map((s) => [s.type, s.weight]), [['factor-prime', 3], ['factor-factorize', 4]]);
  assert.deepEqual(choiceSources(byId('jie-6a-math-unit-06')).map((s) => s.type), ['dec-compare-1', 'dec-compare-n', 'dec-shift']);
  assert.equal(choiceSources(byId('jie-6a-math-unit-02')).length, 0, '公因數公倍數都是填答題');
  for (const s of levels.flatMap(choiceSources)) assert.equal(s.subject, '數學');
});

await test('每一關在不在題庫（三種題目來源）', () => {
  const u1 = byId('jie-6a-math-unit-01');
  const u2 = byId('jie-6a-math-unit-02');
  const total = u1.questions.length;
  assert.deepEqual(poolState(u1, null, 'afterQuiz'), { inPool: false, reason: 'needQuiz' });
  assert.deepEqual(poolState(u1, { best: 0, used: 30, total }, 'afterQuiz'), { inPool: true, reason: 'open' });
  assert.deepEqual(poolState(u1, { best: total - 1, used: 30, total }, 'afterPerfect'), { inPool: false, reason: 'needPerfect' });
  assert.deepEqual(poolState(u1, { best: total, used: 30, total }, 'afterPerfect'), { inPool: true, reason: 'open' });
  assert.deepEqual(poolState(u1, null, 'always'), { inPool: true, reason: 'open' });
  assert.deepEqual(poolState(u2, null, 'always'), { inPool: false, reason: 'noChoice' });
});

await test('buildPool：只收寫過的、有選擇題的關卡', () => {
  const tried = new Set(['jie-6a-math-unit-01', 'jie-6a-math-unit-02', 'jie-6a-math-unit-03']);
  const rec = (l) => (tried.has(l.meta.id) ? { best: 1, used: 60, total: l.questions.length } : null);
  const pool = buildPool(levels, rec, 'afterQuiz');
  assert.deepEqual(pool.levels.map((l) => l.meta.id), ['jie-6a-math-unit-01', 'jie-6a-math-unit-03']);
  assert.equal(pool.sources.length, 4);
  assert.equal(buildPool(levels, () => null, 'afterQuiz').sources.length, 0);
  assert.equal(buildPool(levels, () => null, 'always').levels.length, 7); // unit-01、03、06、14～17
});

await test('抽題機：全部是合格的選擇題、每種題型都輪得到、一場裡不重複', () => {
  const pool = buildPool(levels, () => null, 'always');
  const types = new Set(pool.sources.map((s) => s.type));
  for (let seed = 1; seed <= 20; seed++) {
    const d = createDrawer(pool.sources, { seed, cfgOf: () => cfg });
    const seen = new Set();
    const got = new Set();
    for (let i = 0; i < 60; i++) {
      const q = d.next();
      assert.equal(q.type, '選擇');
      assert.equal(checkQuestion(q), '', q.text);
      assert.equal(q.options.filter((o) => o.correct).length, 1);
      assert.ok(!seen.has(questionKey(q)), '重複：' + q.text);
      seen.add(questionKey(q));
      got.add(q.gen);
    }
    assert.deepEqual([...got].sort(), [...types].sort());
  }
  // 抽很多題也不會壞
  const d = createDrawer(pool.sources, { seed: 99, cfgOf: () => cfg });
  for (let i = 0; i < 3000; i++) assert.equal(checkQuestion(d.next()), '');
});

await test('同一個種子抽出同樣的題目', () => {
  const pool = buildPool(levels, () => null, 'always');
  const a = createDrawer(pool.sources, { seed: 7, cfgOf: () => cfg });
  const b = createDrawer(pool.sources, { seed: 7, cfgOf: () => cfg });
  for (let i = 0; i < 20; i++) assert.equal(questionKey(a.next()), questionKey(b.next()));
});

await test('手寫題目的關卡：抽完一輪才重複，選項順序會換', () => {
  const lv = parseLevel(`---
id: test-hand-01
kid: 測試
grade: 六上
subject: 自然
name: 手寫
---

## 1
題目: 甲？
* 對
- 錯
技巧: 甲。

## 2
題目: 乙？
- 對
* 錯
技巧: 乙。

## 3
題型: 填答
題目: 丙？
答案: 3
技巧: 丙。

## 4
題目: 丁？
* 是
- 否
- 不知道
技巧: 丁。
`);
  const src = choiceSources(lv);
  assert.equal(src.length, 3);
  assert.ok(src.every((s) => s.kind === 'fixed' && s.subject === '自然'));
  const d = createDrawer(src, { seed: 3 });
  for (let round = 0; round < 5; round++) {
    const texts = [d.next(), d.next(), d.next()].map((q) => q.text).sort();
    assert.deepEqual(texts, ['丁？', '乙？', '甲？']);
  }
  const orders = new Set();
  for (let i = 0; i < 30; i++) { const q = d.next(); if (q.text === '丁？') orders.add(q.options.map((o) => o.text).join()); }
  assert.ok(orders.size > 1, '選項順序要會換');
  assert.throws(() => createDrawer([]));
});

// ---------- 一場比賽 ----------

const fakeQ = (i) => ({ type: '選擇', text: 'Q' + i, tip: 'T' + i, options: [{ text: 'a', correct: true }, { text: 'b', correct: false }] });
function fakeDraw() { let i = 0; return () => fakeQ(++i); }

await test('答對加分、連對累積；答錯不扣分但扣秒、連對歸零', () => {
  const t0 = 1_000_000;
  const r = createRace({ seconds: 60, penalty: 3, draw: fakeDraw(), now: t0 });
  assert.equal(raceLeft(r, t0), 60);
  assert.deepEqual(answerRace(r, 0, t0 + 2000), { ok: true, right: 0, cut: 0 });
  assert.equal(answerRace(r, 0, t0 + 2100), null, '同一題不能答兩次');
  nextQuestion(r, t0 + 2500); // 看答案的 0.5 秒不算
  assert.equal(raceLeft(r, t0 + 2500), 58);
  answerRace(r, 0, t0 + 4500); nextQuestion(r, t0 + 4500);
  assert.equal(r.streak, 2);
  const w = answerRace(r, 1, t0 + 6500);
  assert.deepEqual(w, { ok: false, right: 0, cut: 3 });
  assert.equal(r.score, 2);
  assert.equal(r.streak, 0);
  assert.equal(r.bestStreak, 2);
  assert.equal(raceLeft(r, t0 + 9000), 51, '暫停中：60 − 6.5 − 3 秒');
  nextQuestion(r, t0 + 9000);
  assert.equal(raceLeft(r, t0 + 9000), 51);
  assert.equal(raceLeft(r, t0 + 10000), 50);
});

await test('時間到：沒答的那題不算；扣秒扣到 0 就結束', () => {
  const t0 = 0;
  const r = createRace({ seconds: 30, penalty: 10, draw: fakeDraw(), now: t0 });
  answerRace(r, 0, t0 + 1000); nextQuestion(r, t0 + 1000);
  answerRace(r, 1, t0 + 25000); // 剩 5 秒，扣 10 秒 → 只扣到 0
  assert.equal(r.log.at(-1).cut, 5);
  assert.equal(raceLeft(r, t0 + 25000), 0);
  assert.ok(raceOver(r, t0 + 25000));
  assert.equal(nextQuestion(r, t0 + 27000), null);
  const res = finishRace(r, t0 + 27000);
  assert.equal(res.score, 1);
  assert.equal(res.total, 2);
  assert.equal(res.wrongs.length, 1);
  assert.equal(res.wrongs[0].rightText, 'a');
  assert.equal(res.wrongs[0].givenText, 'b');
  assert.equal(res.penaltyTotal, 5);
  assert.equal(res.used, 30);
  assert.equal(res.perfect, false);
  assert.equal(answerRace(r, 0, t0 + 28000), null, '結束後不能再答');

  const r2 = createRace({ seconds: 30, penalty: 0, draw: fakeDraw(), now: 0 });
  assert.equal(raceLeft(r2, 31000), 0);
  assert.equal(answerRace(r2, 0, 31000), null, '時間到之後點選項不算');
  const res2 = finishRace(r2, 31000);
  assert.equal(res2.total, 0);
  assert.equal(shouldRecord(res2), false);
});

await test('精簡紀錄：kind=game、代號 game-math、每題對錯', () => {
  const r = createRace({ seconds: 60, penalty: 3, draw: fakeDraw(), now: 0 });
  answerRace(r, 0, 1000); nextQuestion(r, 1000); answerRace(r, 1, 2000);
  const res = finishRace(r, 61000);
  const s = raceSummary(res, { id: 'game-math', kid: '姐姐', subject: '數學', name: '數學島搶答賽', grade: '六上' });
  assert.equal(s.kind, 'game');
  assert.equal(s.level, 'game-math');
  assert.equal(s.score, 1);
  assert.equal(s.total, 2);
  assert.equal(s.used, 60);
  assert.equal(s.retry, false);
  assert.deepEqual(s.items.map((x) => x.ok), [true, false]);
  assert.ok(!JSON.stringify(s).includes('"question"'), '不送題目全文');
});

await test('最高紀錄：答對多才算刷新', () => {
  const p = createProgress(memoryStorage());
  const mk = (score, total) => ({ score, total, used: 60, perfect: false, retry: false, at: '2026-11-25T00:00:00Z' });
  const a = p.record('姐姐', 'game-math', mk(8, 10));
  assert.equal(a.firstTry, true); assert.equal(a.improved, true);
  assert.equal(p.record('姐姐', 'game-math', mk(8, 9)).improved, false);
  assert.equal(p.record('姐姐', 'game-math', mk(5, 12)).improved, false);
  assert.equal(p.record('姐姐', 'game-math', mk(11, 14)).improved, true);
  assert.equal(p.get('姐姐', 'game-math').best, 11);
  assert.equal(p.get('姐姐', 'game-math').perfectAt, '');
});

await test('送到後台：搶答賽帶 kind=game；代號不是 game- 開頭的不收', async () => {
  const bodies = [];
  const fetchFn = async (_url, { body }) => {
    const b = JSON.parse(body);
    bodies.push(b);
    if (b.action === 'login') return { json: async () => ({ ok: true, token: 'tok', progress: {}, settings: {} }) };
    return { json: async () => ({ ok: true, progress: {} }) };
  };
  const cloud = createCloud({ settings: cloudSettings({ api: 'https://script.google.com/macros/s/abc/exec' }), store: memoryStore(), fetchFn });
  await cloud.login('姐姐', 'pw');
  const r = createRace({ seconds: 60, penalty: 3, draw: fakeDraw(), now: 0 });
  answerRace(r, 0, 1000);
  const s = raceSummary(finishRace(r, 61000), { id: 'game-math', kid: '姐姐', name: '數學島搶答賽' });
  assert.equal(cloud.enqueue(s), true);
  assert.equal(cloud.enqueue({ ...s, level: 'jie-6a-math-unit-01' }), false);
  assert.equal(cloud.enqueue({ kid: '姐姐', level: 'game-math', score: 1, total: 1, used: 1 }), false, '沒有 kind 的 game- 代號不收');
  assert.equal(cloud.enqueue({ kid: '姐姐', level: 'jie-6a-math-unit-01', levelName: 'x', score: 1, total: 2, used: 9, retry: true }), true);
  await cloud.flush();
  const saves = bodies.filter((b) => b.action === 'save');
  assert.equal(saves.length, 2);
  assert.equal(saves[0].kind, 'game');
  assert.equal(saves[0].level, 'game-math');
  assert.equal(saves[0].retry, false);
  assert.equal(saves[1].kind, undefined, '測驗塔的成績不帶 kind');
  assert.equal(saves[1].retry, true);
});

await test('畫面文字：程式用到的 race 區文字都有', async () => {
  const text = await json('config/text.json');
  assert.ok(text.race && typeof text.race === 'object', 'text.json 要有 race 區');
  const used = new Set();
  const ui = await readFile(here('games/quiz-race/race-ui.js'), 'utf8');
  for (const m of ui.matchAll(/\bT\.(\w+)/g)) used.add(m[1]);
  // hud.js 和 main.js 的 race 文字（在 tentBlock、tentRow、tentExtra 裡）
  for (const f of ['world/hud.js', 'world/main.js']) {
    const src = await readFile(here(f), 'utf8');
    for (const fn of src.split(/\n  (?:function|\/\*\*)/).filter((b) => /text\.race/.test(b))) {
      for (const m of fn.matchAll(/\bT\.(\w+)/g)) used.add(m[1]);
    }
    for (const m of src.matchAll(/text\.race\.(\w+)/g)) used.add(m[1]);
  }
  const missing = [...used].filter((k) => !(k in text.race));
  assert.deepEqual(missing, []);
  for (const k of ['always', 'afterQuiz', 'afterPerfect']) assert.ok(text.race.poolNames[k]);
});

console.log(passed + ' 項通過' + (process.exitCode ? '，有失敗' : ''));
