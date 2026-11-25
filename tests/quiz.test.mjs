// 用 Node 跑：node tests/quiz.test.mjs
// 檢查測驗引擎：判分規則、限時、錯題重練、計時器、最佳成績。
// 最後拿 content/levels/ 裡每一關實際跑一次「全對」和「全空白」。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseLevel, loadLevels } from '../engine/levels.js';
import {
  quizSettings, normalizeAnswer, isCorrect, createSession, setAnswer, goTo, blankCount,
  secondsLeft, grade, wrongIndices, resultSummary, createCountdown, mmss, levelLimitSeconds,
} from '../engine/quiz.js';
import { createProgress, memoryStorage } from '../engine/progress.js';

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

## 3
題型: 填答
題目: 比
答案: 8:5
技巧: 化簡。

## 4
題型: 填答
題目: 大數
答案: 16000
技巧: 數零。
`);

const T0 = 1_700_000_000_000;

test('設定：沒填用預設，亂填不採用', () => {
  const s = quizSettings({ retrySecondsPerQuestion: 45, lowTimeSeconds: -3, tickMs: 'x', warnBlankOnSubmit: false });
  assert.equal(s.retrySecondsPerQuestion, 45);
  assert.equal(s.lowTimeSeconds, 60);
  assert.equal(s.tickMs, 250);
  assert.equal(s.warnBlankOnSubmit, false);
});

test('答案整理：全形、空白、千分位', () => {
  assert.equal(normalizeAnswer('１６，０００'), '16000');
  assert.equal(normalizeAnswer(' 16,000 '), '16000');
  assert.equal(normalizeAnswer('８：５'), '8:5');
});

test('判分：選擇題看選項位置', () => {
  const q = sample.questions[0];
  assert.equal(isCorrect(q, 1), true);
  assert.equal(isCorrect(q, 0), false);
  assert.equal(isCorrect(q, undefined), false);
});

test('判分：填答題的多種寫法和數字相等', () => {
  const q = sample.questions[1];
  for (const v of ['0.75', '3/4', '.75', '0.750', '０．７５', ' 3 / 4 ']) assert.equal(isCorrect(q, v), true, v);
  for (const v of ['', '0.7', '6/8', '75']) assert.equal(isCorrect(q, v), false, v);
  assert.equal(isCorrect(sample.questions[2], '8：5'), true);
  assert.equal(isCorrect(sample.questions[3], '16,000'), true);
  assert.equal(isCorrect(sample.questions[3], '１６０００'), true);
});

test('限時：沒填 minutes 照題數，有填用 minutes', () => {
  assert.equal(levelLimitSeconds(sample, quizSettings()), 4 * 60);
  assert.equal(levelLimitSeconds(sample, quizSettings({ minutesPerQuestion: 1.5 })), 6 * 60);
  const withMin = { ...sample, meta: { ...sample.meta, minutes: 7 } };
  assert.equal(levelLimitSeconds(withMin, quizSettings()), 420);
});

test('一場測驗：作答、空白數、剩餘時間、判分', () => {
  const s = createSession(sample, { now: T0 });
  assert.equal(s.limit, 240);
  assert.equal(blankCount(s), 4);
  setAnswer(s, 1);
  goTo(s, 1); setAnswer(s, ' 3/4 ');
  goTo(s, 3); setAnswer(s, '1600');
  goTo(s, 9); // 超出範圍不動
  assert.equal(s.current, 3);
  assert.equal(blankCount(s), 1);
  assert.equal(secondsLeft(s, T0 + 30_000), 210);
  assert.equal(secondsLeft(s, T0 + 999_000), 0);
  const r = grade(s, sample, { now: T0 + 95_400 });
  assert.equal(r.score, 2);
  assert.equal(r.total, 4);
  assert.equal(r.used, 95);
  assert.equal(r.perfect, false);
  assert.deepEqual(wrongIndices(r), [2, 3]);
  assert.equal(r.items[1].givenText, '3/4');
  assert.equal(r.items[1].rightText, '0.75 公尺');
  assert.equal(r.items[2].givenText, '');
  setAnswer(s, '16000');
  assert.equal(s.answers[3], '1600', '交卷後不能再改');
});

test('用時不超過限時', () => {
  const s = createSession(sample, { now: T0 });
  const r = grade(s, sample, { now: T0 + 10_000_000, timeUp: true });
  assert.equal(r.used, 240);
  assert.equal(r.timeUp, true);
  assert.equal(r.score, 0);
});

test('錯題重練：只練錯的，時間照題數，標記 retry', () => {
  const s = createSession(sample, { now: T0, only: [2, 3], settings: quizSettings({ retrySecondsPerQuestion: 45 }) });
  assert.deepEqual(s.order, [2, 3]);
  assert.equal(s.limit, 90);
  assert.equal(s.retry, true);
  setAnswer(s, '8:5'); goTo(s, 1); setAnswer(s, '16000');
  const r = grade(s, sample, { now: T0 + 20_000 });
  assert.equal(r.perfect, true);
  assert.deepEqual(r.items.map((x) => x.no), ['3', '4']);
});

test('沒有題目的關卡不能開始', () => {
  assert.throws(() => createSession({ meta: { id: 'x' }, questions: [] }));
});

test('計時器：時間到只結束一次，停止後不再跑', () => {
  let now = T0, fn = null, cleared = 0, ends = 0, last = -1;
  const clock = { now: () => now, every: (f) => { fn = f; return 1; }, clear: () => { cleared++; } };
  const s = createSession(sample, { now: T0, only: [0], settings: quizSettings({ retrySecondsPerQuestion: 5 }) });
  createCountdown(s, { clock, onTick: (l) => { last = l; }, onEnd: () => ends++ });
  assert.equal(last, 5);
  now += 2500; fn(); assert.equal(last, 2.5);
  now += 3000; fn(); fn();
  assert.equal(ends, 1);
  assert.equal(cleared, 1);
  assert.equal(mmss(0.3), '0:01');
  assert.equal(mmss(605), '10:05');
  assert.equal(mmss(-4), '0:00');
});

test('最佳成績：好的才換，重練不算，記第一次全對', () => {
  const p = createProgress(memoryStorage());
  const r = (score, used, extra = {}) => ({ score, used, total: 4, perfect: score === 4, retry: false, at: 't' + score + used, ...extra });
  let info = p.record('A', 'L', r(2, 100));
  assert.equal(info.firstTry, true); assert.equal(info.improved, true);
  info = p.record('A', 'L', r(2, 120));
  assert.equal(info.improved, false); assert.equal(p.get('A', 'L').used, 100);
  info = p.record('A', 'L', r(4, 99, { retry: true }));
  assert.equal(p.get('A', 'L').best, 2, '錯題重練不算');
  info = p.record('A', 'L', r(4, 200));
  assert.equal(info.firstPerfect, true); assert.equal(p.get('A', 'L').perfectAt, 't4200');
  info = p.record('A', 'L', r(4, 150));
  assert.equal(info.firstPerfect, false); assert.equal(p.get('A', 'L').perfectAt, 't4200');
  assert.equal(p.get('B', 'L'), null, '姐妹分開記');
  p.merge('A', { L: { best: 4, used: 90 }, M: { best: 1, used: 30 } });
  assert.equal(p.get('A', 'L').used, 90);
  assert.equal(p.get('A', 'M').best, 1);
});

test('精簡紀錄格式和清單版作答紀錄一致', () => {
  const s = createSession(sample, { now: T0 });
  setAnswer(s, 2);
  const sum = resultSummary(grade(s, sample, { now: T0 + 1000 }), sample);
  assert.equal(sum.kid, '測試');
  assert.deepEqual(sum.items[0], { n: '1', ok: false, given: '3', right: '0.8' });
  assert.equal(sum.items[1].given, '');
});

// ---------- 實際關卡 ----------
const root = fileURLToPath(new URL('../', import.meta.url));
const { levels, errors } = await loadLevels(root + 'content/levels', (p) => readFile(p, 'utf8'));
test('關卡檔都讀得到', () => assert.deepEqual(errors, []));
for (const l of levels) {
  if (!l.questions.length) continue;
  test(l.meta.id + '：全對拿滿分、全空白 0 分、每個寫法都算對', () => {
    const s = createSession(l, { now: T0 });
    l.questions.forEach((q, i) => {
      setAnswer(s, q.type === '選擇' ? q.options.findIndex((o) => o.correct) : q.answers[0], i);
      if (q.type !== '選擇') for (const a of q.answers) assert.ok(isCorrect(q, a), `${q.no} 題 ${a}`);
      if (q.type === '選擇') q.options.forEach((o, k) => assert.equal(isCorrect(q, k), o.correct, `${q.no} 題選項 ${k}`));
    });
    const r = grade(s, l, { now: T0 + 1000 });
    assert.equal(r.score, l.questions.length);
    const blank = grade(createSession(l, { now: T0 }), l, { now: T0 });
    assert.equal(blank.score, 0);
    assert.equal(wrongIndices(blank).length, l.questions.length);
  });
}

console.log(process.exitCode ? '有測試沒通過' : `全部通過（${passed} 項，實際關卡 ${levels.length} 個）`);
