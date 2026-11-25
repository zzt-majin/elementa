// 用 Node 跑：node tests/generate.test.mjs
// 檢查出題模組：每種題型各出幾千題，
//   1. 格式合格（選擇題剛好一個正確、選項不重複、填答有答案、沒有怪字）
//   2. 數字不超過六年級範圍（小數最多 3 位、分母不超過 12、題目和答案的整數不超過 5000）
//   3. 從題目文字把算式讀出來，另外用分數精確重算一次，答案要一樣（不靠產生器自己的算法）
//   4. 同一個種子出同一份題目；綜合練習題數、單元分配正確
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRng } from '../engine/rng.js';
import { F, div, mul, sub, add, fromDecimal, eq, gcd, lcm, roundText } from '../engine/frac.js';
import { generateQuestion, checkQuestion, questionKey, typeNames, parseMake, makeCount, materialize, mixLevel, hasType } from '../engine/generate.js';
import { isCorrect } from '../engine/quiz.js';
import { loadLevels } from '../engine/levels.js';

const N = Number(process.env.N || 1500);
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + err.message); process.exitCode = 1; }
}
const root = fileURLToPath(new URL('../', import.meta.url));
const cfg = JSON.parse(await readFile(root + 'config/generators/math.json', 'utf8'));

// 題目裡的數：整數、小數、分數、帶分數
const NUM = /(\d+又\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/g;
function val(s) {
  let m = s.match(/^(\d+)又(\d+)\/(\d+)$/);
  if (m) return add(F(Number(m[1])), F(Number(m[2]), Number(m[3])));
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return F(Number(m[1]), Number(m[2]));
  return fromDecimal(s);
}
const nums = (text) => (text.match(NUM) || []);
const answerIs = (q, f) => isCorrect(q, String(f.n / f.d)) || q.answers.some((a) => { try { return eq(val(a.replace(/\s/g, '')), f); } catch { return false; } });

// 另外重算：題型 → (題目, 數字) → 正確答案（分數）；回傳 null 表示這題型不在這裡重算
const RECHECK = {
  'factor-gcd': (q, [a, b]) => F(gcd(Number(a), Number(b))),
  'factor-lcm': (q, [a, b]) => F(Number(a) * Number(b) / gcd(Number(a), Number(b))),
  'frac-div': (q, [x, y]) => div(val(x), val(y)),
  'frac-div-mixed': (q, [x, y]) => div(val(x), val(y)),
  'dec-div': (q, [a, b]) => div(val(a), val(b)),
  'ratio-value': (q, [a, b]) => F(Number(a), Number(b)),
  'two-base': (q, n) => div(val(n[1]), val(n[0])),           // A 是 B 的 k 倍，A＝… → B ＝ A ÷ k
  'two-sum': (q, n) => div(val(n[1]), add(val(n[0]), F(1))),
  // 2026-11-25 新增
  'factor-square': (q, [a, b]) => {
    const A = Number(a), B = Number(b), g = gcd(A, B), L = lcm(A, B);
    if (q.text.includes('最長是')) return F(g);
    if (q.text.includes('拼出')) return F((L / A) * (L / B));
    return F((A / g) * (B / g));
  },
  'frac-part-whole': (q, [w, p]) => div(val(p), val(w)),
  'dec-part-whole': (q, [w, p]) => div(val(p), val(w)),
  'dec-unit-rate': (q, [x, y]) => {
    if (q.text.includes('四捨五入')) return null; // 另外檢查
    return q.text.includes('1 公斤的銅棒長') ? div(val(x), val(y)) : div(val(y), val(x));
  },
  'ratio-missing': (q) => {
    const [L, R] = q.text.split('？')[1].split('＝').map((side) => side.split('：').map((t) => t.trim()));
    const t = [...L, ...R];
    const h = t.indexOf('(　)');
    const v = t.map((x) => (x === '(　)' ? null : val(x)));
    // a:b = c:d → a×d = b×c
    if (h === 0) return div(mul(v[1], v[2]), v[3]);
    if (h === 1) return div(mul(v[0], v[3]), v[2]);
    if (h === 2) return div(mul(v[0], v[3]), v[1]);
    return div(mul(v[1], v[2]), v[0]);
  },
  'ratio-total': (q, [p, r, x]) => {
    const m = q.text.match(/^(.+?)和(.+?)的(?:人數|數量)比是.*?，(.+?)有 /);
    const part = m[3] === m[1] ? Number(p) : Number(r);
    return F(Number(x) / part * (Number(p) + Number(r)));
  },
};

/** 「x ÷ y」「x × y」或一個數 → 分數 */
const evalSide = (s) => {
  s = s.trim();
  if (s.includes(' ÷ ')) { const [x, y] = s.split(' ÷ '); return div(val(x), val(y)); }
  if (s.includes(' × ')) { const [x, y] = s.split(' × '); return mul(val(x), val(y)); }
  return val(s);
};
const signOf = (L, R) => { const d = L.n * R.d - R.n * L.d; return d > 0 ? '大於（＞）' : d < 0 ? '小於（＜）' : '等於（＝）'; };
const prodOf = (s) => s.split(' × ').map(Number).reduce((a, b) => a * b, 1);

// 題目和答案的整數不超過 5000（金額、人數）；選項可以大一點（例如移錯小數點的錯誤選項）
const limits = (q) => {
  const main = [q.text, ...(q.answers || [])].join(' ');
  const opts = (q.options || []).map((o) => o.text).join(' ');
  for (const s of nums(opts)) if (val(s).n / val(s).d > 100000) return '選項數字太大：' + s;
  for (const s of nums(main + ' ' + opts)) {
    const v = val(s);
    if (s.includes('.') && s.split('.')[1].length > 3) return '小數超過 3 位：' + s;
    if (s.includes('/') && v.d > 12 && !q.gen.startsWith('ratio-value')) return '分母太大：' + s;
    if (main.includes(s) && !s.includes('/') && !s.includes('又') && v.n / v.d > 5000) return '數字太大：' + s;
  }
  return '';
};

for (const type of typeNames()) {
  test(`${type}：${N} 題都合格、在範圍內、答案重算一致`, () => {
    const rng = createRng(12345);
    const seenTexts = new Set();
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(type, rng, cfg);
      const bad = checkQuestion(q) || limits(q);
      assert.equal(bad, '', `第 ${i} 題：${bad}\n${q.text}`);
      seenTexts.add(questionKey(q));
      if (q.type === '填答') {
        // 小孩照標準答案打，一定要判對
        for (const a of q.answers) assert.ok(isCorrect(q, a), `標準答案判錯：${a}｜${q.text}`);
        const re = RECHECK[type];
        const want = re ? re(q, nums(q.text)) : null;
        if (want) {
          assert.ok(answerIs(q, want), `重算不一致：${q.text}\n  產生器 ${q.answers.join('|')}，重算 ${want.n}/${want.d}`);
        }
        if (type === 'dec-round') {
          const [a, b] = nums(q.text);
          assert.equal(q.answers[0], roundText(div(val(a), val(b)), 2), q.text);
        }
        if (type === 'dec-unit-rate' && q.text.includes('四捨五入')) {
          const [x, y] = nums(q.text);
          assert.equal(q.answers[0], roundText(div(val(y), val(x)), 1), q.text);
        }
        if (type === 'ratio-simplify-int') {
          const [a, b] = nums(q.text).map(Number);
          const g = gcd(a, b);
          assert.equal(q.answers[0], a / g + ':' + b / g, q.text);
        }
      }
      if (type === 'factor-factorize') {
        const n = Number(nums(q.text)[0]);
        const right = q.options.find((o) => o.correct).text.split(' × ').map(Number);
        assert.equal(right.reduce((x, y) => x * y, 1), n, q.text);
        for (const o of q.options.filter((o) => !o.correct)) {
          const f = o.text.split(' × ').map(Number);
          const ok = f.reduce((x, y) => x * y, 1) === n && f.every((p) => [2, 3, 5, 7, 11, 13].includes(p));
          assert.ok(!ok, '錯的選項其實是對的：' + o.text);
        }
      }
      if (type === 'frac-compare') {
        const m = q.text.match(/：(.+) ÷ (.+) ○ (.+) × (.+)，/);
        const L = div(val(m[1]), val(m[2])), R = mul(val(m[3]), val(m[4]));
        const sign = L.n * R.d - R.n * L.d;
        const want = sign > 0 ? '大於（＞）' : sign < 0 ? '小於（＜）' : '等於（＝）';
        assert.equal(q.options.find((o) => o.correct).text, want, q.text);
      }
      if (type === 'dec-compare-n' || type === 'frac-compare-1') {
        const bigger = q.text.includes(' 大？');
        for (const o of q.options) {
          const [x, y] = o.text.split(' ÷ ').map(val);
          const qv = div(x, y);
          const s = qv.n * x.d - x.n * qv.d;
          assert.equal(o.correct, bigger ? s > 0 : s < 0, q.text + ' ' + o.text);
        }
      }
      if (type === 'frac-compare-div' || type === 'dec-compare-sign') {
        const m = q.text.match(/：(.+) ○ (.+)，○/);
        assert.equal(q.options.find((o) => o.correct).text, signOf(evalSide(m[1]), evalSide(m[2])), q.text);
      }
      if (type === 'dec-point') {
        const [a, b] = q.text.split(' 的商')[0].split(' ÷ ').map(val);
        for (const o of q.options) assert.equal(o.correct, eq(val(o.text), div(a, b)), q.text + ' ' + o.text);
      }
      if (type === 'factor-lcm-primes') {
        const m = q.text.match(/甲 ＝ (.+?)，乙 ＝ (.+?)。/);
        const A = prodOf(m[1]), B = prodOf(m[2]);
        const want = q.text.includes('最小公倍數') ? lcm(A, B) : gcd(A, B);
        for (const o of q.options) assert.equal(o.correct, prodOf(o.text) === want, q.text + ' ' + o.text);
      }
      if (type === 'factor-common-all') {
        const [a, b] = nums(q.text).map(Number);
        const g = gcd(a, b);
        const all = []; for (let i = 1; i <= g; i++) if (g % i === 0) all.push(i);
        for (const o of q.options) assert.equal(o.correct, o.text === all.join('、'), q.text + ' ' + o.text);
      }
      if (type === 'ratio-compare') {
        const most = /最(深|甜|濃)？$/.test(q.text);
        const fName = q.text.match(/^三個人用(.+?)和/)[1];
        const score = {};
        for (const seg of q.text.split('。')[1].split('；')) {
          const [who, rest] = seg.split('：');
          const amounts = {};
          for (const part of rest.split('、')) { const m = part.match(/^(.+) (\d+) /); amounts[m[1]] = Number(m[2]); }
          const f = amounts[fName];
          const o = Object.entries(amounts).find(([k]) => k !== fName)[1];
          score[who] = F(f, o);
        }
        const names = Object.keys(score).sort((x, y) => { const a = score[x], b = score[y]; return a.n * b.d - b.n * a.d; });
        const want = most ? names[2] : names[0];
        assert.equal(q.options.find((o) => o.correct).text, want, q.text);
      }
      if (type === 'dec-compare-1') {
        for (const o of q.options) {
          const [x, y] = o.text.split(' ÷ ').map(val);
          assert.equal(o.correct, x.n * y.d < y.n * x.d, o.text);
        }
      }
    }
    assert.ok(seenTexts.size > Math.min(N, 40) * 0.5, '題目變化太少：' + seenTexts.size);
  });
}

test('同一個種子出同一份題目', () => {
  const a = generateQuestion('dec-div', createRng(99), cfg);
  const b = generateQuestion('dec-div', createRng(99), cfg);
  assert.deepEqual(a, b);
});

test('make：寫法和題數', () => {
  assert.deepEqual(parseMake('dec-div*4, dec-round ×2，ratio-value'), [
    { type: 'dec-div', count: 4 }, { type: 'dec-round', count: 2 }, { type: 'ratio-value', count: 1 },
  ]);
  assert.equal(makeCount('a*3, b*2'), 5);
  assert.throws(() => parseMake('dec div*2'));
});

const { levels, errors } = await loadLevels(root + 'content/levels', (p) => readFile(p, 'utf8'));
test('關卡檔：都讀得到，題型都存在', () => {
  assert.deepEqual(errors, []);
  for (const l of levels) {
    assert.ok(l.meta.make, l.file + ' 沒有 make');
    assert.ok(l.meta.unit, l.file + ' 沒有 unit');
    for (const { type } of parseMake(l.meta.make)) assert.ok(hasType(type), l.file + ' 題型不存在：' + type);
  }
});
test('關卡：每次出的題數對、題號連號、同一關不重複', () => {
  for (const l of levels) {
    for (let s = 1; s <= 30; s++) {
      const m = materialize(l, { seed: s, cfg });
      assert.equal(m.questions.length, makeCount(l.meta.make), l.meta.id);
      assert.deepEqual(m.questions.map((q) => q.no), m.questions.map((_, i) => String(i + 1)));
      assert.equal(new Set(m.questions.map(questionKey)).size, m.questions.length, l.meta.id + ' 有重複題');
    }
  }
});
test('綜合練習：題數、單元平均分配', () => {
  const byUnit = new Map();
  for (const l of levels) { if (!byUnit.has(l.meta.unit)) byUnit.set(l.meta.unit, []); byUnit.get(l.meta.unit).push(l); }
  const units = [...byUnit].map(([unit, ls]) => ({ unit, levels: ls }));
  for (const count of [4, 10, 15]) {
    for (let s = 1; s <= 20; s++) {
      const chosen = units.slice(0, 1 + (s % units.length));
      const m = mixLevel(chosen, { count, seed: s, cfg, meta: { id: 'x-mix-' + count } });
      assert.equal(m.questions.length, count);
      const per = chosen.map((u) => m.questions.filter((q) => q.unitName === u.unit).length);
      assert.ok(Math.max(...per) - Math.min(...per) <= 1, '分配不平均：' + per);
      assert.equal(new Set(m.questions.map(questionKey)).size, count, '有重複題');
    }
  }
});

console.log(`出題模組：通過 ${passed} 項（每種題型 ${N} 題，共 ${typeNames().length} 種）` + (process.exitCode ? '（有失敗）' : ''));
