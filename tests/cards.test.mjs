// 用 Node 跑：node tests/cards.test.mjs
// 檢查學習卡引擎：參數、試算表規則對應、開放時機、卡片內容、一輪看卡。
// 最後拿 content/levels/ 裡每一關實際做出卡片。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseLevel, loadLevels } from '../engine/levels.js';
import { materialize } from '../engine/generate.js';
import {
  cardSettings, ruleFor, cardState, buildCards, createDeck, currentCard, flip, moveTo, mark, allMarked, deckSummary, CARD_DEFAULTS,
} from '../engine/cards.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + err.message); process.exitCode = 1; }
}

const sample = parseLevel(`---
id: test-1
kid: 測試
grade: 六上
subject: 數學
name: 測試關
---

## 1
題型: 選擇
題目: 哪個比 1 小？
- 1.2
* 0.8
- 3
技巧: 看整數位。

## 2
題型: 填答
題目: 4.5 ÷ 6 ＝ ？
答案: 0.75 | 3/4
單位: 公尺
技巧: 驗算 0.75 × 6。
第二行技巧。

## 3
題型: 填答
題目: 2 + 2 ＝ ？
答案: 4
技巧: 數手指。
`);
const empty = parseLevel('---\nid: e\nkid: 測試\ngrade: 六上\nsubject: 數學\nname: 製作中\n---\n');

test('參數：沒填用預設', () => {
  assert.deepEqual(cardSettings(), CARD_DEFAULTS);
  assert.deepEqual(cardSettings(null), CARD_DEFAULTS);
});
test('參數：亂填的欄位用預設', () => {
  const s = cardSettings({ defaultRule: 'xx', showOptions: 'yes', shuffle: 1, sheetValues: { '亂': 'bad' } });
  assert.equal(s.defaultRule, 'afterQuiz');
  assert.equal(s.showOptions, true);
  assert.equal(s.shuffle, false);
  assert.deepEqual(s.sheetValues, CARD_DEFAULTS.sheetValues);
});
test('參數：可以換試算表的說法', () => {
  const s = cardSettings({ defaultRule: 'always', sheetValues: { 'start': 'always', 'quiz': 'afterQuiz' } });
  assert.equal(s.defaultRule, 'always');
  assert.deepEqual(ruleFor({ cards: 'quiz' }, s), { rule: 'afterQuiz', from: 'sheet' });
  assert.deepEqual(ruleFor({ cards: '測驗後' }, s), { rule: 'always', from: 'default' });
});
test('試算表規則：三種說法都對得上', () => {
  assert.deepEqual(ruleFor({ cards: '一開始' }), { rule: 'always', from: 'sheet' });
  assert.deepEqual(ruleFor({ cards: '測驗後' }), { rule: 'afterQuiz', from: 'sheet' });
  assert.deepEqual(ruleFor({ cards: ' 全對後 ' }), { rule: 'afterPerfect', from: 'sheet' });
});
test('試算表規則：沒登入、沒填、填錯都用預設', () => {
  assert.deepEqual(ruleFor(null), { rule: 'afterQuiz', from: 'default' });
  assert.deepEqual(ruleFor({}), { rule: 'afterQuiz', from: 'default' });
  assert.deepEqual(ruleFor({ cards: '隨便' }), { rule: 'afterQuiz', from: 'default' });
  assert.deepEqual(ruleFor({ cards: '一開始' }, cardSettings({ defaultRule: 'afterPerfect', sheetValues: { 'x': 'always' } })), { rule: 'afterPerfect', from: 'default' });
});

const tried = { best: 1, used: 30, total: 3, perfectAt: '' };
const perfect = { best: 3, used: 30, total: 3, perfectAt: '2026-11-25' };
test('開放：一開始', () => {
  assert.deepEqual(cardState(sample, null, 'always'), { open: true, reason: 'open' });
});
test('開放：測驗後', () => {
  assert.deepEqual(cardState(sample, null, 'afterQuiz'), { open: false, reason: 'needQuiz' });
  assert.equal(cardState(sample, tried, 'afterQuiz').open, true);
  assert.equal(cardState(sample, { best: 0, used: 10, total: 3 }, 'afterQuiz').open, true, '0 分也算寫過');
});
test('開放：全對後', () => {
  assert.deepEqual(cardState(sample, null, 'afterPerfect'), { open: false, reason: 'needPerfect' });
  assert.deepEqual(cardState(sample, tried, 'afterPerfect'), { open: false, reason: 'needPerfect' });
  assert.equal(cardState(sample, perfect, 'afterPerfect').open, true);
});
test('開放：沒有題目的關卡不開', () => {
  for (const r of ['always', 'afterQuiz', 'afterPerfect']) assert.deepEqual(cardState(empty, perfect, r), { open: false, reason: 'empty' });
});
test('開放：不認得的規則當作測驗後', () => {
  assert.equal(cardState(sample, null, 'zzz').open, false);
  assert.equal(cardState(sample, tried, 'zzz').open, true);
});

test('卡片：一題一張，背面是正確答案和技巧', () => {
  const cards = buildCards(sample);
  assert.equal(cards.length, 3);
  assert.equal(cards[0].front, '哪個比 1 小？');
  assert.deepEqual(cards[0].options, ['1.2', '0.8', '3']);
  assert.equal(cards[0].answer, '0.8');
  assert.equal(cards[1].answer, '0.75 公尺');
  assert.equal(cards[1].tip, '驗算 0.75 × 6。\n第二行技巧。');
  assert.deepEqual(cards[2].options, []);
});
test('卡片：可以不列選項', () => {
  assert.deepEqual(buildCards(sample, cardSettings({ showOptions: false }))[0].options, []);
});
test('卡片：沒有題目就沒有卡', () => {
  assert.deepEqual(buildCards(empty), []);
});

test('看卡：翻面、換張會翻回正面', () => {
  const d = createDeck(buildCards(sample));
  assert.equal(currentCard(d).no, '1');
  flip(d);
  assert.equal(d.flipped, true);
  moveTo(d, 1);
  assert.equal(d.flipped, false);
  assert.equal(currentCard(d).no, '2');
  moveTo(d, 9);
  assert.equal(d.current, 1, '超出範圍不動');
});
test('看卡：做記號後換下一張，最後一張不動', () => {
  const d = createDeck(buildCards(sample));
  mark(d, 'known');
  assert.equal(d.current, 1);
  mark(d, 'again');
  mark(d, 'known');
  assert.equal(d.current, 2);
  assert.equal(allMarked(d), true);
  assert.deepEqual(deckSummary(d), { known: 2, again: 1, unmarked: 0, againList: [1] });
  mark(d, 'xx');
  assert.equal(d.marks[2], 'known', '亂給的記號不算');
});
test('看卡：只看再看一次的那幾張', () => {
  const d = createDeck(buildCards(sample), { only: [1, 7] });
  assert.deepEqual(d.order, [1]);
  assert.equal(currentCard(d).no, '2');
  assert.equal(allMarked(d), false);
  assert.deepEqual(deckSummary(d), { known: 0, again: 0, unmarked: 1, againList: [] });
});
test('看卡：only 全部無效時看全部', () => {
  assert.deepEqual(createDeck(buildCards(sample), { only: [9] }).order, [0, 1, 2]);
});
test('看卡：打亂順序，每張剛好一次', () => {
  let x = 0.37;
  const random = () => { x = (x * 9301 + 49297) % 233280 / 233280; return x; };
  const d = createDeck(buildCards(sample), { shuffle: true, random });
  assert.deepEqual([...d.order].sort(), [0, 1, 2]);
});

// 每一關實際做卡片
const root = fileURLToPath(new URL('../', import.meta.url));
const { levels: raw } = await loadLevels(root + 'content/levels', (p) => readFile(p, 'utf8'));
// 有 make 的關卡先出一份題目（每次測驗都會出新的；這裡用固定種子方便重現）
const genCfg = JSON.parse(await readFile(root + 'config/generators/math.json', 'utf8'));
const levels = raw.map((l, i) => materialize(l, { seed: 1000 + i, cfg: genCfg }));
for (const l of levels) {
  test(`關卡 ${l.meta.id} 做得出卡片`, () => {
    const cards = buildCards(l);
    assert.equal(cards.length, l.questions.length);
    for (const c of cards) {
      assert.ok(c.front, '正面沒字');
      assert.ok(c.answer, '背面沒有答案');
      assert.ok(c.tip, '背面沒有技巧');
    }
    if (l.questions.length) assert.equal(cardState(l, null, 'always').open, true);
  });
}

console.log(`學習卡引擎：通過 ${passed} 項` + (process.exitCode ? '（有失敗）' : ''));
