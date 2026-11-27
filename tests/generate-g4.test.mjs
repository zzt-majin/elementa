// 用 Node 跑：node tests/generate-g4.test.mjs
// 獨立檢查四年級上學期出題模組（engine/generators/math-g4.js）：
//   1. 格式合格（選擇題剛好一個正確、選項不重複、填答有答案、沒有怪字）
//   2. 從題目文字把算式讀出來，另外獨立重算答案驗證
//   3. 妹妹四上 5 個關卡檔都讀得到、題數對、同一關不重複
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRng } from '../engine/rng.js';
import { registerTypes, generateQuestion, checkQuestion, questionKey, parseMake, makeCount, materialize, hasType } from '../engine/generate.js';
import { MATH_G4_TYPES } from '../engine/generators/math-g4.js';
import { isCorrect } from '../engine/quiz.js';
import { loadLevels } from '../engine/levels.js';

registerTypes(MATH_G4_TYPES);

const N = Number(process.env.N || 1500);
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + err.message); process.exitCode = 1; }
}
const root = fileURLToPath(new URL('../', import.meta.url));
const cfg = JSON.parse(await readFile(root + 'config/generators/math-g4.json', 'utf8'));

for (const type of Object.keys(MATH_G4_TYPES)) {
  test(`${type}：${N} 題都合格、答案重算一致`, () => {
    const rng = createRng(40401);
    const seen = new Set();
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(type, rng, cfg);
      const bad = checkQuestion(q);
      assert.equal(bad, '', `第 ${i} 題：${bad}\n${q.text}`);
      seen.add(questionKey(q));

      if (q.type === '填答') {
        for (const a of q.answers) assert.ok(isCorrect(q, a), `標準答案判錯：${a}｜${q.text}`);
      }
      if (type === 'g4-bignum-word') {
        const m = q.text.match(/(\d+) [元本人工個].*?比.*?(少|多) (\d+) 萬(?: (\d+))?/);
        const base = Number(m[1]);
        const diff = Number(m[3]) * 10000 + (m[4] ? Number(m[4]) : 0);
        const want = m[2] === '少' ? base + diff : base - diff;
        assert.equal(Number(q.answers[0]), want, q.text);
      }
      if (type === 'g4-bignum-compare') {
        const m = q.text.match(/(\d+) 個千萬 ＋ (\d+) 個十萬 ○ (\d+)/);
        const L = Number(m[1]) * 10000000 + Number(m[2]) * 100000;
        const R = Number(m[3]);
        const want = L > R ? '大於（＞）' : L < R ? '小於（＜）' : '等於（＝）';
        assert.equal(q.options.find((o) => o.correct).text, want, q.text);
      }
      if (type === 'g4-mul-zeros') {
        const m = q.text.match(/「(\d+) × (\d+)」/);
        let p = Number(m[1]) * Number(m[2]), z = 0;
        while (p > 0 && p % 10 === 0) { z++; p /= 10; }
        assert.equal(q.options.find((o) => o.correct).text, z + ' 個', q.text);
      }
      if (type === 'g4-angle-special' && q.type === '填答') {
        const m = q.text.match(/(\d+) 度/);
        const a = Number(m[1]);
        const want = q.text.includes('直角') ? 90 - a : 180 - a;
        assert.equal(Number(q.answers[0]), want, q.text);
      }
      if (type === 'g4-km-calc') {
        if (q.text.includes('－')) {
          const m = q.text.match(/(\d+) 公里 (\d+) 公尺 － (\d+) 公尺/);
          const want = Number(m[1]) * 1000 + Number(m[2]) - Number(m[3]);
          assert.equal(Number(q.answers[0]), want, q.text);
        } else {
          const m = q.text.match(/全長 (\d+) 公里.*?甲走了 (\d+) 公里 (\d+) 公尺，乙走了 (\d+) 公尺/);
          const want = Number(m[1]) * 1000 - (Number(m[2]) * 1000 + Number(m[3]) + Number(m[4]));
          assert.equal(Number(q.answers[0]), want, q.text);
        }
      }
      if (type === 'g4-div3-zeros') {
        if (q.type === '選擇') {
          const m = q.text.match(/「(\d+) ÷ (\d+)」/);
          const q0 = Number(m[1]) / Number(m[2]);
          for (const o of q.options) {
            const [x, y] = o.text.split(' ÷ ').map(Number);
            assert.equal(o.correct, Math.abs(x / y - q0) < 1e-9, q.text + ' | ' + o.text);
          }
        } else if (q.text.includes(' ÷ ')) {
          const m = q.text.match(/(\d+) ÷ (\d+)/);
          assert.equal(Number(q.answers[0]), Number(m[1]) / Number(m[2]), q.text);
        } else {
          const m = q.text.match(/(\d+) (?:公分|公克|毫升).*?每 (\d+) /);
          const D = Number(m[1]), d = Number(m[2]);
          const want = q.text.includes('剩下') ? D % d : Math.floor(D / d);
          assert.equal(Number(q.answers[0]), want, q.text);
        }
      }
    }
    assert.ok(seen.size > 15, '題目變化太少：' + seen.size);
  });
}

const { levels, errors } = await loadLevels(root + 'content/levels', (p) => readFile(p, 'utf8'));
const g4Levels = levels.filter((l) => l.meta.kid === '妹妹' && l.meta.grade === '四上');
test('四上關卡檔：都讀得到，題型都存在且不重複', () => {
  assert.deepEqual(errors, []);
  assert.equal(g4Levels.length, 5);
  for (const l of g4Levels) {
    for (const { type } of parseMake(l.meta.make)) assert.ok(hasType(type), l.file + ' 題型不存在：' + type);
    for (let s = 1; s <= 20; s++) {
      const m = materialize(l, { seed: s, cfg });
      assert.equal(m.questions.length, makeCount(l.meta.make), l.meta.id);
      assert.equal(new Set(m.questions.map(questionKey)).size, m.questions.length, l.meta.id + ' 有重複題');
    }
  }
});

console.log(`四上數學出題模組：通過 ${passed} 項（每種題型 ${N} 題，共 ${Object.keys(MATH_G4_TYPES).length} 種）` + (process.exitCode ? '（有失敗）' : ''));
