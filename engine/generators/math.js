// engine/generators/math.js
// 數學題型產生器（國小高年級）。每一種題型「先決定答案，再倒推題目」，數字一定整齊。
// 純邏輯，不含小孩資料。數字範圍從 config/generators/math.json 傳進來（cfg），沒填用這裡的預設。
// 每個產生器回傳一題，格式和關卡檔解析出來的題目相同：
//   { type: '選擇'|'填答', text, options: [{ text, correct }], answers: [...], unit, tip }
// 檢查（剛好一個正確選項、選項不重複、填答有答案）在 engine/generate.js 統一做。
import {
  F, add, sub, mul, div, cmp, eq, gcd, lcm, isInt, toDecimal, fracText, mixedText, acceptAll, roundText, fromDecimal, decimalPlaces,
} from '../frac.js';

class Retry extends Error {}
/** 數字不合條件時丟出，外面會換一組亂數重來 */
export const retry = () => { throw new Retry('retry'); };
export const isRetry = (e) => e instanceof Retry;

const num = (cfg, key, def) => (Number.isFinite(Number(cfg?.[key])) ? Number(cfg[key]) : def);
const list = (cfg, key, def) => (Array.isArray(cfg?.[key]) && cfg[key].length ? cfg[key] : def);
const dec = (a) => toDecimal(a);                 // 分數 → 小數字串
const D = (n, k) => F(n, 10 ** k);               // 整數 n 縮小 10^k 倍
const places = (a) => decimalPlaces(a);
/** 把 lo～hi 的整數縮成最多 k 位小數 */
const randDec = (rng, lo, hi, k) => D(rng.int(Math.round(lo * 10 ** k), Math.round(hi * 10 ** k)), k);

function choice(rng, right, wrongs, { keepOrder = false } = {}) {
  const seen = new Set([right]);
  const ws = [];
  for (const w of wrongs) if (w != null && !seen.has(w)) { seen.add(w); ws.push(w); }
  if (!ws.length) retry();
  const opts = [{ text: right, correct: true }, ...ws.slice(0, 3).map((t) => ({ text: t, correct: false }))];
  return keepOrder ? opts : rng.shuffle(opts);
}
const fill = (text, answers, unit, tip) => ({ type: '填答', text, answers, unit: unit || '', tip });
const pick = (text, options, tip) => ({ type: '選擇', text, options, tip });

// 質因數（小於 100 的數）
function primeFactors(n) {
  const out = [];
  for (let p = 2; p * p <= n; p++) while (n % p === 0) { out.push(p); n /= p; }
  if (n > 1) out.push(n);
  return out;
}
const isPrime = (n) => n > 1 && primeFactors(n).length === 1;
const times = (arr) => arr.join(' × ');
const coprimePair = (rng, lo, hi) => {
  for (let i = 0; i < 100; i++) {
    const p = rng.int(lo, hi), q = rng.int(lo, hi);
    if (p !== q && gcd(p, q) === 1) return [p, q];
  }
  retry();
};

// =====================================================================
// 單元：因數與倍數
// =====================================================================

const LOOKALIKE = [1, 9, 15, 21, 25, 27, 33, 35, 39, 45, 49, 51, 57, 63, 69, 77, 81, 87, 91];

const factorUnit = {
  /** 哪一組全部是質數 */
  'factor-prime'(rng, cfg) {
    const max = num(cfg, 'primeMax', 60);
    const primes = [];
    for (let n = 2; n <= max; n++) if (isPrime(n)) primes.push(n);
    const fakes = LOOKALIKE.filter((n) => n <= max);
    const group = (arr) => [...arr].sort((a, b) => a - b).join('、');
    const right = rng.shuffle(primes).slice(0, 3);
    const used = [];
    const wrongs = [0, 1, 2].map(() => {
      const f = rng.pick(fakes);
      used.push(f);
      return group([...rng.shuffle(primes).slice(0, 2), f]);
    });
    const why = [...new Set(used)].map((f) => (f === 1 ? '1 只有一個因數，不是質數' : f + ' ＝ ' + times(primeFactors(f)))).join('；');
    return pick('下面哪一組數全部都是質數？', choice(rng, group(right), wrongs),
      '質數只有 1 和自己兩個因數。看到奇數不要直接當成質數，先試試 3、7 能不能整除：' + why + '。');
  },

  /** 質因數分解選擇題 */
  'factor-factorize'(rng, cfg) {
    const max = num(cfg, 'factorizeMax', 180);
    const k = rng.int(3, 4);
    const fs = Array.from({ length: k }, () => rng.pick([2, 2, 3, 3, 5, 7])).sort((a, b) => a - b);
    const n = fs.reduce((a, b) => a * b, 1);
    if (n > max || n < 24) retry();
    const right = times(fs);
    const comp = fs[0] * fs[1];
    const merged = [comp, ...fs.slice(2)].sort((a, b) => a - b); // 有一個不是質數
    const dropped = fs.slice(1);                                         // 少乘一個
    const swapped = [...fs]; swapped[swapped.length - 1] = rng.pick([2, 3, 5, 7].filter((p) => p !== fs[fs.length - 1]));
    swapped.sort((a, b) => a - b);
    const steps = [];
    let m = n;
    for (const p of fs) { steps.push(m + ' ÷ ' + p + ' ＝ ' + m / p); m /= p; }
    return pick('把 ' + n + ' 做質因數分解，哪一個是對的？',
      choice(rng, right, [times(merged), times(dropped), times(swapped)]),
      '用短除法一直除質數：' + steps.join('，') + '。檢查兩件事：每個數都是質數（' + comp + ' 不是質數），而且全部乘起來要等於 ' + n + '。');
  },

  /** 最大公因數 */
  'factor-gcd'(rng, cfg) {
    const g = rng.int(2, num(cfg, 'gcdMax', 18));
    const [p, q] = coprimePair(rng, 2, 9);
    const a = g * p, b = g * q;
    if (a > num(cfg, 'numberMax', 100) || b > num(cfg, 'numberMax', 100)) retry();
    return fill(a + ' 和 ' + b + ' 的最大公因數是多少？', [String(g)], '',
      '用短除法：' + a + ' 和 ' + b + ' 一起除以公因數 ' + times(primeFactors(g)) + '，除到兩個商 ' + p + ' 和 ' + q + ' 沒有公因數為止。' + (primeFactors(g).length > 1 ? '左邊除過的數相乘 ' + times(primeFactors(g)) + ' ＝ ' + g : '左邊除過的數就是 ' + g) + '。驗算：' + a + ' ÷ ' + g + ' ＝ ' + p + '，' + b + ' ÷ ' + g + ' ＝ ' + q + '。');
  },

  /** 最小公倍數 */
  'factor-lcm'(rng, cfg) {
    const g = rng.int(2, num(cfg, 'gcdMax', 18));
    const [p, q] = coprimePair(rng, 2, 9);
    const a = g * p, b = g * q, L = g * p * q;
    if (a > num(cfg, 'numberMax', 100) || b > num(cfg, 'numberMax', 100) || L > num(cfg, 'lcmMax', 240)) retry();
    return fill(a + ' 和 ' + b + ' 的最小公倍數是多少？', [String(L)], '',
      '短除法除到兩個商 ' + p + ' 和 ' + q + ' 沒有公因數，再把左邊的 ' + g + ' 和下面的 ' + p + '、' + q + ' 全部相乘：' + g + ' × ' + p + ' × ' + q + ' ＝ ' + L + '。驗算：' + L + ' ÷ ' + a + ' ＝ ' + q + '，' + L + ' ÷ ' + b + ' ＝ ' + p + '，都整除。');
  },

  /** 應用題：最多平分（公因數）或下一次同時（公倍數） */
  'factor-apply'(rng, cfg) {
    if (rng.chance(0.5)) {
      const g = rng.int(3, 16);
      const [p, q] = coprimePair(rng, 2, 9);
      const a = g * p, b = g * q;
      if (a > 120 || b > 120) retry();
      const [x, y, box] = rng.pick([['草莓', '藍莓', '盒'], ['鉛筆', '橡皮擦', '份'], ['紅氣球', '藍氣球', '束']]);
      return fill('有 ' + a + ' 個' + x + '和 ' + b + ' 個' + y + '，要平分成好幾' + box + '，每' + box + '的' + x + '一樣多、' + y + '也一樣多，而且都不能剩。最多可以分成幾' + box + '？',
        [String(g)], box, '「平分、不能剩、最多」要找最大公因數。' + a + ' 和 ' + b + ' 的最大公因數是 ' + g + '，每' + box + '有 ' + p + ' 個' + x + '、' + q + ' 個' + y + '。');
    }
    const g = rng.int(2, 6);
    const [p, q] = coprimePair(rng, 2, 7);
    const a = g * p, b = g * q, L = g * p * q;
    if (a < 4 || b < 4 || L > 150) retry();
    const [x, y, what, now, unit] = rng.pick([['紅燈', '藍燈', '閃一次', '同時閃', '秒'], ['A 線公車', 'B 線公車', '發一班車', '同時發車', '分鐘'], ['大鬧鐘', '小鬧鐘', '響一次', '同時響', '分鐘']]);
    return fill(x + '每 ' + a + ' ' + unit + what + '，' + y + '每 ' + b + ' ' + unit + what + '。剛剛兩個' + now + '，至少再過幾' + unit + '會再' + now + '？',
      [String(L)], unit, '「下一次同時」要找最小公倍數。' + a + ' 和 ' + b + ' 的最小公倍數是 ' + L + '。驗算：' + L + ' 是 ' + a + ' 的 ' + L / a + ' 倍，也是 ' + b + ' 的 ' + L / b + ' 倍。');
  },
};

// =====================================================================
// 單元：分數除法
// =====================================================================

const properFrac = (rng, maxDen) => { const d = rng.int(2, maxDen); const n = rng.int(1, d - 1); return F(n, d); };
const improperFrac = (rng, maxDen) => { const d = rng.int(2, maxDen); const n = rng.int(d + 1, d * 3); const f = F(n, d); if (isInt(f)) retry(); return f; };
const showF = (a) => mixedText(a);

const fracUnit = {
  /** 不用算：哪一個算式的商比被除數大／小 */
  'frac-compare-1'(rng, cfg) {
    const maxDen = num(cfg, 'denMax', 10);
    const x = rng.chance(0.5) ? properFrac(rng, maxDen) : improperFrac(rng, 6);
    const bigger = rng.chance(0.5);
    const small = () => properFrac(rng, 9);                                      // 比 1 小
    const large = () => (rng.chance(0.5) ? improperFrac(rng, 5) : F(rng.int(2, 5)));  // 比 1 大
    const right = bigger ? small() : large();
    const wrongs = bigger ? [large(), large(), large()] : [small(), small(), small()];
    const ex = (d) => showF(x) + ' ÷ ' + showF(d);
    return pick('不用計算，哪一個算式的商比 ' + showF(x) + (bigger ? ' 大' : ' 小') + '？',
      choice(rng, ex(right), wrongs.map(ex)),
      '除數比 1 小，商就比被除數大；除數比 1 大，商就比被除數小。這裡只有 ' + showF(right) + (bigger ? ' 比 1 小' : ' 比 1 大') + '。');
  },

  /** 分數 ÷ 分數 */
  'frac-div'(rng, cfg) {
    const maxDen = num(cfg, 'denMax', 10);
    const r = rng.chance(0.3) ? F(rng.int(2, 9)) : (rng.chance(0.5) ? properFrac(rng, 9) : improperFrac(rng, 6));
    const y = rng.chance(0.6) ? properFrac(rng, maxDen) : improperFrac(rng, 6);
    const x = mul(r, y);
    if (x.d > 12 || x.n > 40 || x.d === 1) retry();
    const flipped = F(y.d, y.n);
    return fill(fracText(x) + ' ÷ ' + fracText(y) + ' ＝ ？（約到最簡）', acceptAll(r), '',
      '除以一個分數，就是乘以它的倒數：' + fracText(x) + ' × ' + fracText(F(y.d, y.n)) + '。先交叉約分再乘，得到 ' + mixedText(r) + '。驗算：' + mixedText(r) + ' × ' + fracText(y) + ' ＝ ' + fracText(x) + '。');
  },

  /** 帶分數 ÷ 分數 */
  'frac-div-mixed'(rng, cfg) {
    const r = rng.chance(0.5) ? F(rng.int(2, 12)) : improperFrac(rng, 5);
    const y = properFrac(rng, num(cfg, 'denMax', 10));
    const x = mul(r, y);
    if (x.d === 1 || x.d > 9 || cmp(x, F(1)) <= 0 || Math.floor(x.n / x.d) > 5) retry();
    return fill(mixedText(x) + ' ÷ ' + fracText(y) + ' ＝ ？（約到最簡）', acceptAll(r), '',
      '帶分數先化成假分數：' + mixedText(x) + ' ＝ ' + fracText(x) + '。再乘以 ' + fracText(y) + ' 的倒數 ' + fracText(F(y.d, y.n)) + '：' + fracText(x) + ' × ' + fracText(F(y.d, y.n)) + ' ＝ ' + mixedText(r) + '。除數比 1 小，商要比 ' + mixedText(x) + ' 大，合理。');
  },

  /** 比大小：一邊除法、一邊乘法，常常兩邊相等 */
  'frac-compare'(rng, cfg) {
    const want = rng.pick(['>', '<', '=', '=']); // 「等於」多出一點，這是常錯的地方
    const T = rng.chance(0.5) ? F(rng.int(2, 10)) : (rng.chance(0.5) ? properFrac(rng, 6) : improperFrac(rng, 4));
    const T2 = want === '=' ? T : want === '>' ? sub(T, F(1, rng.int(2, 4))) : add(T, F(1, rng.int(2, 4)));
    if (T2.n <= 0) retry();
    const asText = (a) => { const s = dec(a); return s !== null && places(a) <= 2 && rng.chance(0.35) && !isInt(a) ? s : mixedText(a); };
    const b = rng.chance(0.5) ? properFrac(rng, 9) : improperFrac(rng, 5);
    const a = mul(T, b);
    const c = rng.chance(0.5) ? properFrac(rng, 9) : improperFrac(rng, 5);
    const d = div(T2, c);
    if (a.d > 12 || d.d > 12 || a.n > 60 || d.n > 60) retry();
    const L = asText(a) + ' ÷ ' + asText(b), R = asText(c) + ' × ' + asText(d);
    const opts = [{ text: '大於（＞）', correct: want === '>' }, { text: '小於（＜）', correct: want === '<' }, { text: '等於（＝）', correct: want === '=' }];
    const word = want === '>' ? '左邊比較大' : want === '<' ? '右邊比較大' : '兩邊一樣大，要選「等於」';
    return pick('比大小：' + L + ' ○ ' + R + '，○ 裡要填什麼？', opts,
      '兩邊都算出來再比，小數先化成分數。左邊 ＝ ' + mixedText(T) + '，右邊 ＝ ' + mixedText(T2) + '，' + word + '。');
  },

  /** 應用題：每杯倒多少，可以倒滿幾杯 */
  'frac-apply'(rng, cfg) {
    const y = properFrac(rng, 8);
    const [thing, unitW, cup] = rng.pick([['一桶牛奶', '公升', '杯'], ['一條緞帶', '公尺', '段'], ['一袋麵粉', '公斤', '份']]);
    const exact = rng.chance(0.5);
    const n = rng.int(3, 18);
    const x = exact ? mul(F(n), y) : add(mul(F(n), y), mul(y, F(rng.int(1, 3), 4)));
    if (x.d > 12 || isInt(x) || cmp(x, F(1)) <= 0 || Math.floor(x.n / x.d) > 9) retry();
    const q = div(x, y);
    const verb = cup === '段' ? '剪成' : '分成';
    if (exact) {
      return fill(thing + '有 ' + mixedText(x) + ' ' + unitW + '，每' + cup + ' ' + fracText(y) + ' ' + unitW + '，剛好' + verb.slice(0, 1) + '完。可以' + verb + '幾' + cup + '？',
        [String(n)], cup, mixedText(x) + ' ÷ ' + fracText(y) + ' ＝ ' + fracText(x) + ' × ' + fracText(F(y.d, y.n)) + ' ＝ ' + n + '。驗算：' + n + ' × ' + fracText(y) + ' ＝ ' + mixedText(x) + '。');
    }
    return fill(thing + '有 ' + mixedText(x) + ' ' + unitW + '，每' + cup + ' ' + fracText(y) + ' ' + unitW + '，最多可以' + verb + '幾' + cup + '？',
      [String(n)], cup, mixedText(x) + ' ÷ ' + fracText(y) + ' ＝ ' + mixedText(q) + '。不夠一整' + cup + '的不算，所以是 ' + n + ' ' + cup + '（只取整數部分）。');
  },
};

// =====================================================================
// 單元：小數除法
// =====================================================================

const decUnit = {
  /** 不用算：哪一個算式的商比 1 小 */
  'dec-compare-1'(rng) {
    const one = randDec(rng, 1.1, 19.9, rng.pick([1, 2]));
    const pairLess = () => { const b = randDec(rng, 1.2, 19.9, rng.pick([1, 2])); const a = randDec(rng, 0.5, b.n / b.d - 0.1, rng.pick([1, 2])); return [a, b]; };
    const pairMore = () => { const a = randDec(rng, 1.5, 19.9, rng.pick([1, 2])); const b = randDec(rng, 0.2, a.n / a.d - 0.1, rng.pick([1, 2])); return [a, b]; };
    const [a, b] = pairLess();
    if (cmp(a, b) >= 0) retry();
    const ex = ([p, q]) => dec(p) + ' ÷ ' + dec(q);
    const ws = [pairMore(), pairMore(), [one, one]];
    if (ws.some(([p, q]) => cmp(p, q) < 0)) retry();
    return pick('不用計算，哪一個算式的商比 1 小？', choice(rng, ex([a, b]), ws.map(ex)),
      '被除數比除數小，商就比 1 小。只有 ' + dec(a) + ' 比 ' + dec(b) + ' 小。' + dec(one) + ' ÷ ' + dec(one) + ' 剛好是 1，不算比 1 小。');
  },

  /** 不用算：哪一個算式的商比被除數大／小 */
  'dec-compare-n'(rng) {
    const n = rng.int(12, 96);
    const bigger = rng.chance(0.6);
    const lt1 = () => randDec(rng, 0.2, 0.9, rng.pick([1, 2]));
    const gt1 = () => randDec(rng, 1.1, 4.8, rng.pick([1, 2]));
    const right = bigger ? lt1() : gt1();
    const ws = bigger ? [gt1(), gt1(), F(1)] : [lt1(), lt1(), F(1)];
    const ex = (d) => n + ' ÷ ' + dec(d);
    return pick('不用計算，哪一個算式的商比 ' + n + (bigger ? ' 大' : ' 小') + '？', choice(rng, ex(right), ws.map(ex)),
      '除數比 1 小，商比被除數大；除數比 1 大，商比被除數小；除以 1 商不變。只有 ' + dec(right) + (bigger ? ' 比 1 小' : ' 比 1 大') + '。');
  },

  /** 小數點一起移：要改成哪一個算式 */
  'dec-shift'(rng) {
    const k = rng.pick([1, 2, 2]);
    const b = D(rng.int(k === 1 ? 2 : 2, k === 1 ? 99 : 99), k);
    if (places(b) !== k) retry();
    const a = rng.chance(0.4) ? F(rng.int(2, 99)) : D(rng.int(11, 999), rng.pick([1, 2]));
    const s = (x, m) => dec(mul(x, F(10 ** m)));
    const right = s(a, k) + ' ÷ ' + s(b, k);
    const wrongs = [dec(a) + ' ÷ ' + s(b, k), s(a, k + 1) + ' ÷ ' + s(b, k), (k > 1 ? s(a, k - 1) : s(a, k + 2)) + ' ÷ ' + s(b, k)];
    return pick('算 ' + dec(a) + ' ÷ ' + dec(b) + ' 之前，要先把除數變成整數。兩個數的小數點一起移動以後，要改成哪一個算式？',
      choice(rng, right, wrongs),
      '除數 ' + dec(b) + ' 有 ' + k + ' 位小數，除數和被除數的小數點都要向右移 ' + k + ' 位（不夠的補 0）：' + right + '。只移除數，商就會錯。');
  },

  /** 小數除法直式 */
  'dec-div'(rng, cfg) {
    const k = rng.pick([1, 2]);
    const b = D(rng.int(2, k === 1 ? 99 : 250), k);
    if (places(b) !== k) retry();
    const q = rng.chance(0.65) ? F(rng.int(2, num(cfg, 'quotientMax', 150))) : D(rng.int(12, 999), 1);
    const a = mul(q, b);
    if (places(a) > 3 || a.n / a.d > 999 || a.n / a.d < 0.5) retry();
    const A = dec(mul(a, F(10 ** k))), B = dec(mul(b, F(10 ** k)));
    const est = cmp(b, F(1)) < 0 ? '除數比 1 小，商要比 ' + dec(a) + ' 大' : '除數比 1 大，商要比 ' + dec(a) + ' 小';
    return fill(dec(a) + ' ÷ ' + dec(b) + ' ＝ ？', [dec(q)], '',
      '除數有 ' + k + ' 位小數，兩個數的小數點都向右移 ' + k + ' 位：' + A + ' ÷ ' + B + ' ＝ ' + dec(q) + '。先估：' + est + '。驗算：' + dec(q) + ' × ' + dec(b) + ' ＝ ' + dec(a) + '。');
  },

  /** 除不盡，四捨五入到小數第二位 */
  'dec-round'(rng) {
    const a = D(rng.int(101, 1999), 2);
    const b = D(rng.int(12, 99), 1);
    const q = div(a, b);
    if (places(q) >= 0 && places(q) <= 3) retry(); // 要除不盡
    if (q.n / q.d >= 10 || q.n / q.d < 0.1) retry();
    const third = Math.floor((q.n * 1000) / q.d) / 1000;
    const thirdStr = third.toFixed(3);
    return fill(dec(a) + ' ÷ ' + dec(b) + '，用四捨五入法取到小數第二位，商是多少？', [roundText(q, 2)], '',
      '取到小數第二位，要除到小數第三位：' + thirdStr + '…，再看第三位 ' + thirdStr.slice(-1) + ' 四捨五入，得到 ' + roundText(q, 2) + '。除數先變整數：' + dec(mul(a, F(10))) + ' ÷ ' + dec(mul(b, F(10))) + '。');
  },

  /** 應用題：最多裝幾瓶／剩多少 */
  'dec-apply-floor'(rng) {
    const y = D(rng.int(2, 15), 1);
    const n = rng.int(4, 30);
    const r = D(rng.int(1, y.n * (10 / y.d) - 1), 1);
    const x = add(mul(F(n), y), r);
    if (cmp(r, y) >= 0 || r.n <= 0 || x.n / x.d > 50) retry();
    const [what, unitW, box, verb] = rng.pick([['果汁', '公升', '瓶', '裝成'], ['緞帶', '公尺', '段', '剪成'], ['米', '公斤', '袋', '裝成']]);
    const askRest = rng.chance(0.35);
    const base = '有 ' + dec(x) + ' ' + unitW + '的' + what + '，每 ' + dec(y) + ' ' + unitW + verb + '一' + box + '，';
    const tip = dec(x) + ' ÷ ' + dec(y) + ' ＝ ' + n + ' 餘 ' + dec(r) + '（餘數的小數點要對齊原來的被除數）。不滿一' + box + '的不算，所以是 ' + n + ' ' + box + '，剩下 ' + dec(r) + ' ' + unitW + '。驗算：' + n + ' × ' + dec(y) + ' ＋ ' + dec(r) + ' ＝ ' + dec(x) + '。';
    if (askRest) return fill(base + '最多可以' + verb + '幾' + box + '後，還剩下幾' + unitW + '？', [dec(r)], unitW, tip);
    return fill(base + '最多可以' + verb + '幾' + box + '？', [String(n)], box, tip);
  },

  /** 應用題：平均每一份是多少（除得盡） */
  'dec-apply-exact'(rng) {
    if (rng.chance(0.5)) {
      const rate = rng.chance(0.6) ? F(rng.int(8, 42)) : D(rng.int(81, 420), 1);
      const x = D(rng.int(12, 95), 1);
      const y = mul(rate, x);
      if (places(y) > 2) retry();
      return fill('爸爸開車用了 ' + dec(x) + ' 公升汽油，跑了 ' + dec(y) + ' 公里。平均每公升汽油可以跑幾公里？', [dec(rate)], '公里',
        '「平均每公升」就是 公里數 ÷ 公升數：' + dec(y) + ' ÷ ' + dec(x) + ' ＝ ' + dec(rate) + '。驗算：' + dec(rate) + ' × ' + dec(x) + ' ＝ ' + dec(y) + '。');
    }
    const y = D(rng.int(12, 75), 2);
    const n = rng.int(6, 40);
    const x = mul(F(n), y);
    if (places(x) > 2 || x.n / x.d > 30) retry();
    return fill('一條繩子長 ' + dec(x) + ' 公尺，每 ' + dec(y) + ' 公尺剪成一段，剛好剪完。可以剪成幾段？', [String(n)], '段',
      dec(x) + ' ÷ ' + dec(y) + '：小數點一起向右移 2 位，' + dec(mul(x, F(100))) + ' ÷ ' + dec(mul(y, F(100))) + ' ＝ ' + n + '。驗算：' + n + ' × ' + dec(y) + ' ＝ ' + dec(x) + '。');
  },
};

// =====================================================================
// 單元：比與比值
// =====================================================================

const ratioText = (p, q) => p + ':' + q;
const ratioShow = (a, b) => a + ' ： ' + b;
const smallRatio = (rng, max) => { for (let i = 0; i < 100; i++) { const p = rng.int(1, max), q = rng.int(1, max); if (p !== q && gcd(p, q) === 1) return [p, q]; } retry(); };

const ratioUnit = {
  /** 整數比化成最簡 */
  'ratio-simplify-int'(rng, cfg) {
    const [p, q] = smallRatio(rng, num(cfg, 'ratioMax', 15));
    const g = rng.int(2, 12);
    const a = p * g, b = q * g;
    if (a > 150 || b > 150) retry();
    return fill(ratioShow(a, b) + ' 化成最簡整數比是多少？（用「:」寫，例如 3:5）', [ratioText(p, q)], '',
      a + ' 和 ' + b + ' 的最大公因數是 ' + g + '，前項、後項都除以 ' + g + '：' + a + ' ÷ ' + g + ' ＝ ' + p + '，' + b + ' ÷ ' + g + ' ＝ ' + q + '。化完要檢查 ' + p + ' 和 ' + q + ' 沒有公因數了。');
  },

  /** 小數比化成最簡 */
  'ratio-simplify-dec'(rng, cfg) {
    const [p, q] = smallRatio(rng, num(cfg, 'ratioMax', 15));
    const s = D(rng.pick([1, 2, 3, 4, 5, 6, 12, 15, 25, 35, 45]), 2);
    const a = mul(F(p), s), b = mul(F(q), s);
    if (places(a) > 2 || places(b) > 2 || (isInt(a) && isInt(b))) retry();
    const k = Math.max(places(a), places(b));
    const A = dec(mul(a, F(10 ** k))), B = dec(mul(b, F(10 ** k)));
    return fill(ratioShow(dec(a), dec(b)) + ' 化成最簡整數比是多少？（用「:」寫）', [ratioText(p, q)], '',
      '先把前項、後項同乘 ' + 10 ** k + ' 變成整數：' + A + ' ： ' + B + (gcd(Number(A), Number(B)) > 1 ? '，再除以最大公因數 ' + gcd(Number(A), Number(B)) + '，得到 ' + p + ' ： ' + q : '，' + A + ' 和 ' + B + ' 沒有公因數，已經是最簡') + '。');
  },

  /** 分數比化成最簡 */
  'ratio-simplify-frac'(rng, cfg) {
    const [p, q] = smallRatio(rng, num(cfg, 'ratioMax', 12));
    const s = F(1, rng.int(2, 9));
    const t = F(rng.int(1, 4));
    const a = mul(mul(F(p), s), t), b = mul(mul(F(q), s), t);
    if (isInt(a) && isInt(b)) retry();
    if (a.d > 12 || b.d > 12) retry();
    const L = lcm(a.d, b.d);
    const A = mul(a, F(L)), B = mul(b, F(L));
    return fill(ratioShow(mixedText(a), mixedText(b)) + ' 化成最簡整數比是多少？（用「:」寫）', [ratioText(p, q)], '',
      '帶分數先化成假分數：' + fracText(a) + ' ： ' + fracText(b) + '。前後項同乘分母的最小公倍數 ' + L + '：' + fracText(A) + ' ： ' + fracText(B) + '，再約成 ' + p + ' ： ' + q + '。');
  },

  /** 比值 */
  'ratio-value'(rng) {
    const [p, q] = smallRatio(rng, 12);
    const g = rng.pick([1, 2, 2, 3, 4, 5, 6]);
    const a = p * g, b = q * g;
    if (q === 1 && rng.chance(0.7)) retry();
    const v = F(a, b);
    return fill(ratioShow(a, b) + ' 的比值是多少？（分數要約到最簡）', acceptAll(v), '',
      '比值 ＝ 前項 ÷ 後項 ＝ ' + a + ' ÷ ' + b + ' ＝ ' + a + '/' + b + (v.n !== a ? ' ＝ ' + fracText(v) : '') + '。比值是一個數，不是比，所以不寫「:」。');
  },

  /** 比例應用：一邊變多少倍，另一邊也變多少倍 */
  'ratio-apply'(rng, cfg) {
    const [p, q] = smallRatio(rng, num(cfg, 'ratioMax', 15));
    const k = rng.int(2, 9);
    const [x, y, unitW] = rng.pick([['濃縮果汁', '水', '杯'], ['麵粉', '糖', '公克'], ['男生', '女生', '人']]);
    const scale = unitW === '公克' ? 10 : 1;
    const X = p * k * scale, Y = q * k * scale;
    const text = unitW === '人'
      ? '班上男生和女生人數的比是 ' + ratioShow(p, q) + '。男生有 ' + X + ' 人，女生有幾人？'
      : '做點心時，' + x + '和' + y + '的比是 ' + ratioShow(p, q) + '。用了 ' + X + ' ' + unitW + x + '，要用幾' + unitW + y + '？';
    return fill(text, [String(Y)], unitW,
      p + ' 變成 ' + X + ' 是乘以 ' + k * scale + '，後項 ' + q + ' 也要乘以 ' + k * scale + '：' + q + ' × ' + k * scale + ' ＝ ' + Y + '。驗算：' + X + ' ： ' + Y + ' 化簡還是 ' + p + ' ： ' + q + '。');
  },

  /** 按比例分配 */
  'ratio-share'(rng, cfg) {
    const [p, q] = smallRatio(rng, num(cfg, 'ratioMax', 9));
    const k = rng.int(2, 30) * rng.pick([1, 5, 10]);
    const T = (p + q) * k;
    if (T > 2000) retry();
    const first = rng.chance(0.5);
    return fill('哥哥和弟弟按 ' + ratioShow(p, q) + ' 分 ' + T + ' 元。' + (first ? '哥哥' : '弟弟') + '分到多少元？', [String((first ? p : q) * k)], '元',
      '全部分成 ' + p + ' ＋ ' + q + ' ＝ ' + (p + q) + ' 份，一份是 ' + T + ' ÷ ' + (p + q) + ' ＝ ' + k + ' 元。' + (first ? '哥哥 ' + p : '弟弟 ' + q) + ' 份：' + (first ? p : q) + ' × ' + k + ' ＝ ' + (first ? p : q) * k + ' 元。驗算：兩人加起來是 ' + T + '。');
  },
};

// =====================================================================
// 單元：兩量關係（基準量、比較量、倍數、打折、百分率）
// =====================================================================

const DEF_TIMES = ['0.4', '0.6', '0.75', '0.8', '1.2', '1.25', '1.4', '1.5', '1.6', '2.5', '3/4', '4/5', '2/3', '3/5', '5/4', '4/3', '7/4', '3/2', '5/3', '7/5', '9/5'];
const parseTimes = (s) => (String(s).includes('/') ? F(...String(s).split('/').map(Number)) : fromDecimal(s));
const showK = (k, raw) => (String(raw).includes('/') ? fracText(k) : dec(k));
const kOf = (rng, cfg, filter = () => true) => {
  const raws = list(cfg, 'times', DEF_TIMES).filter((r) => filter(parseTimes(r)));
  if (!raws.length) retry();
  const raw = rng.pick(raws);
  return [parseTimes(raw), raw];
};
/**
 * 兩量情境。rel：「A 是 B 的 k 倍」；a、b：比較時的名字；aIs／bIs：「姐姐有 480 元」的前半；
 * aAsk／bAsk：問句；both：合起來；step：基準量的整齊程度（10＝十的倍數、1＝整數、0.1＝一位小數）；
 * k：'lt1' 只用比 1 小的倍數、'gt1' 只用比 1 大的（讓情境合理）
 */
const CTX = [
  { rel: '今天跑步的距離是昨天的', a: '今天', b: '昨天', aIs: '今天跑了', bIs: '昨天跑了', aAsk: '今天跑了幾公里', bAsk: '昨天跑了幾公里', both: '兩天共跑了', unit: '公里', step: 0.1 },
  { rel: '姐姐的存款是妹妹的', a: '姐姐', b: '妹妹', aIs: '姐姐有', bIs: '妹妹有', aAsk: '姐姐有多少元', bAsk: '妹妹有多少元', both: '兩人共有', unit: '元', step: 10 },
  { rel: '新教室的面積是舊教室的', a: '新教室', b: '舊教室', aIs: '新教室的面積是', bIs: '舊教室的面積是', aAsk: '新教室的面積是多少平方公尺', bAsk: '舊教室的面積是多少平方公尺', both: '兩間教室的面積共', unit: '平方公尺', step: 1 },
  { rel: '小美的身高是爸爸的', a: '小美', b: '爸爸', aIs: '小美身高', bIs: '爸爸身高', aAsk: '小美身高幾公分', bAsk: '爸爸身高幾公分', both: '', unit: '公分', step: 1, k: 'lt1' },
  { rel: '紅緞帶的長度是藍緞帶的', a: '紅緞帶', b: '藍緞帶', aIs: '紅緞帶長', bIs: '藍緞帶長', aAsk: '紅緞帶長幾公尺', bAsk: '藍緞帶長幾公尺', both: '兩條緞帶共長', unit: '公尺', step: 0.1 },
  { rel: '這個月的用電量是上個月的', a: '這個月', b: '上個月', aIs: '這個月用了', bIs: '上個月用了', aAsk: '這個月用了幾度', bAsk: '上個月用了幾度', both: '兩個月共用了', unit: '度', step: 1 },
  { rel: '長方形的長是寬的', a: '長', b: '寬', aIs: '長是', bIs: '寬是', aAsk: '長是幾公尺', bAsk: '寬是幾公尺', both: '長和寬合起來是', unit: '公尺', step: 0.1, k: 'gt1' },
];
const names = (c) => ({ A: c.a, B: c.b, AIs: c.aIs, BIs: c.bIs, AAsk: c.aAsk, BAsk: c.bAsk });
const ctxOf = (rng, need = () => true) => rng.pick(CTX.filter(need));
const kFor = (rng, cfg, c) => kOf(rng, cfg, (k) => cmp(k, F(1)) !== 0 && (c.k === 'lt1' ? cmp(k, F(1)) < 0 : c.k === 'gt1' ? cmp(k, F(1)) > 0 : true));
/** 基準量：依情境取整齊的數，比較量也要整齊 */
const baseOf = (rng, step, k) => {
  const unitN = step === 10 ? rng.int(5, 90) * 10 : step === 1 ? rng.int(20, 240) : rng.int(10, 90);
  const B = step === 0.1 ? D(unitN, 1) : F(unitN);
  const A = mul(B, k);
  if (step === 0.1 ? places(A) > 2 : !isInt(A)) retry();
  return [B, A];
};

const twoUnit = {
  /** 已知比較量和倍數，求基準量 */
  'two-base'(rng, cfg) {
    const c = ctxOf(rng);
    const [k, raw] = kFor(rng, cfg, c);
    const n = names(c);
    const [B, A] = baseOf(rng, c.step, k);
    const K = showK(k, raw);
    const est = cmp(k, F(1)) < 0 ? '倍數比 1 小，' + n.B + '要比 ' + dec(A) + ' 大' : '倍數比 1 大，' + n.B + '要比 ' + dec(A) + ' 小';
    return fill(c.rel + ' ' + K + ' 倍。' + n.AIs + ' ' + dec(A) + ' ' + c.unit + '，' + n.BAsk + '？', [dec(B)], c.unit,
      '「的」前面的' + n.B + '是基準量，不知道。寫成 (　) × ' + K + ' ＝ ' + dec(A) + '，所以用除法：' + dec(A) + ' ÷ ' + K + ' ＝ ' + dec(B) + '。估算：' + est + '。驗算：' + dec(B) + ' × ' + K + ' ＝ ' + dec(A) + '。');
  },

  /** A 是 B 的 k 倍，兩個合起來多少，求 B */
  'two-sum'(rng, cfg) {
    const c = ctxOf(rng, (x) => x.both);
    const [k, raw] = kFor(rng, cfg, c);
    const n = names(c);
    const [B, A] = baseOf(rng, c.step, k);
    const S = add(A, B);
    if (places(S) > 2) retry();
    const K = showK(k, raw), KS = showK(add(k, F(1)), raw);
    return fill(c.rel + ' ' + K + ' 倍，' + c.both + ' ' + dec(S) + ' ' + c.unit + '。' + n.BAsk + '？', [dec(B)], c.unit,
      n.B + '是基準量（1 倍），' + n.A + '是 ' + K + ' 倍，合起來是 1 ＋ ' + K + ' ＝ ' + KS + ' 倍。' + dec(S) + ' ÷ ' + KS + ' ＝ ' + dec(B) + '。驗算：' + dec(B) + ' ＋ ' + dec(A) + ' ＝ ' + dec(S) + '。');
  },

  /** A 是 B 的 k 倍，知道相差多少，求 B（或 A） */
  'two-diff'(rng, cfg) {
    const c = ctxOf(rng);
    const [k, raw] = kFor(rng, cfg, c);
    const n = names(c);
    const [B, A] = baseOf(rng, c.step, k);
    const big = cmp(k, F(1)) > 0;
    const d = big ? sub(A, B) : sub(B, A);
    const K = showK(k, raw), KD = showK(big ? sub(k, F(1)) : sub(F(1), k), raw);
    const askA = rng.chance(0.4);
    return fill(c.rel + ' ' + K + ' 倍，' + (big ? n.A + '比' + n.B : n.B + '比' + n.A) + '多 ' + dec(d) + ' ' + c.unit + '。' + (askA ? n.AAsk : n.BAsk) + '？', [dec(askA ? A : B)], c.unit,
      n.B + '是 1 倍，' + n.A + '是 ' + K + ' 倍，相差 ' + (big ? K + ' － 1' : '1 － ' + K) + ' ＝ ' + KD + ' 倍。' + n.B + '：' + dec(d) + ' ÷ ' + KD + ' ＝ ' + dec(B) + (askA ? '。' + n.A + '：' + dec(B) + ' × ' + K + ' ＝ ' + dec(A) : '') + '。');
  },

  /** 已知 A 和倍數，問相差多少（常錯：沒先求基準量） */
  'two-diff-given'(rng, cfg) {
    const c = ctxOf(rng);
    const [k, raw] = kFor(rng, cfg, c);
    const n = names(c);
    const [B, A] = baseOf(rng, c.step, k);
    const big = cmp(k, F(1)) > 0;
    const d = big ? sub(A, B) : sub(B, A);
    const K = showK(k, raw);
    return fill(c.rel + ' ' + K + ' 倍，' + n.AIs + ' ' + dec(A) + ' ' + c.unit + '。' + (big ? n.A + '比' + n.B : n.B + '比' + n.A) + '多幾' + c.unit + '？', [dec(d)], c.unit,
      '先求基準量' + n.B + '：' + dec(A) + ' ÷ ' + K + ' ＝ ' + dec(B) + '，再算差：' + (big ? dec(A) + ' － ' + dec(B) : dec(B) + ' － ' + dec(A)) + ' ＝ ' + dec(d) + '。檢查：相差的量一定比兩個量都小，' + dec(d) + ' 合理。');
  },

  /** 打折 */
  'two-discount'(rng, cfg) {
    const offs = list(cfg, 'discounts', ['9', '85', '8', '75', '7', '6', '5']);
    const o = String(rng.pick(offs));
    const r = fromDecimal('0.' + o);
    const zh = { 9: '九', 85: '八五', 8: '八', 75: '七五', 7: '七', 65: '六五', 6: '六', 5: '五' }[o] || o;
    const P = F(rng.int(4, 40) * 100);
    const S = mul(P, r);
    if (!isInt(S)) retry();
    const save = sub(P, S);
    const rest = sub(F(1), r);
    const [thing, kind] = rng.pick([['外套', '件'], ['球鞋', '雙'], ['書包', '個'], ['檯燈', '盞']]);
    const v = rng.int(0, 2);
    if (v === 0) {
      return fill('一' + kind + thing + '打' + zh + '折後賣 ' + dec(S) + ' 元，原價是多少元？', [dec(P)], '元',
        '打' + zh + '折是付原價的 ' + dec(r) + ' 倍。原價是基準量：(　) × ' + dec(r) + ' ＝ ' + dec(S) + '，' + dec(S) + ' ÷ ' + dec(r) + ' ＝ ' + dec(P) + '。原價一定比特價高。');
    }
    if (v === 1) {
      return fill('一' + kind + thing + '打' + zh + '折後賣 ' + dec(S) + ' 元，比原價便宜多少元？', [dec(save)], '元',
        '先求原價：' + dec(S) + ' ÷ ' + dec(r) + ' ＝ ' + dec(P) + '，再算便宜多少：' + dec(P) + ' － ' + dec(S) + ' ＝ ' + dec(save) + '。問的是「便宜多少」，不是原價。');
    }
    return fill('商店全部打' + zh + '折，小華買的' + thing + '比原價便宜 ' + dec(save) + ' 元。' + thing + '原價是多少元？', [dec(P)], '元',
      '打' + zh + '折付 ' + dec(r) + ' 倍，便宜的是 1 － ' + dec(r) + ' ＝ ' + dec(rest) + ' 倍。(　) × ' + dec(rest) + ' ＝ ' + dec(save) + '，' + dec(save) + ' ÷ ' + dec(rest) + ' ＝ ' + dec(P) + '。');
  },

  /** 增加／減少百分率、成數 */
  'two-percent'(rng, cfg) {
    const up = rng.chance(0.5);
    const usePct = rng.chance(0.5);
    const p = usePct ? rng.pick(list(cfg, 'percents', [5, 10, 15, 20, 25, 30, 40])) : rng.pick([1, 2, 3]) * 10;
    const r = up ? F(100 + p, 100) : F(100 - p, 100);
    const B = F(rng.int(4, 40) * rng.pick([10, 20, 50]));
    const A = mul(B, r);
    if (!isInt(A)) retry();
    const how = usePct ? p + '%' : { 1: '一', 2: '兩', 3: '三' }[p / 10] + '成';
    const c = rng.pick([
      { s: '今年園遊會的人數比去年', a: '今年有', ask: '去年有多少人', who: '去年', unit: '人' },
      { s: '這個月的用電量比上個月', a: '這個月用了', ask: '上個月用了幾度', who: '上個月', unit: '度' },
      { s: '今天的營業額比昨天', a: '今天賣了', ask: '昨天賣了多少元', who: '昨天', unit: '元' },
    ]);
    const change = up ? '增加' : '減少';
    const pr = usePct ? p + '%' : dec(F(p, 100));
    return fill(c.s + change + how + '，' + c.a + ' ' + dec(A) + ' ' + c.unit + '。' + c.ask + '？', [dec(B)], c.unit,
      c.who + '是基準量。' + change + how + '，就是' + c.who + '的 1 ' + (up ? '＋' : '－') + ' ' + pr + ' ＝ ' + dec(r) + ' 倍' + '（不是 ' + dec(up ? F(100 - p, 100) : F(100 + p, 100)) + ' 倍）。' + dec(A) + ' ÷ ' + dec(r) + ' ＝ ' + dec(B) + '。驗算：' + dec(B) + ' × ' + dec(r) + ' ＝ ' + dec(A) + '。');
  },
};

/** 全部題型：代號 → 產生器 */
export const MATH_TYPES = { ...factorUnit, ...fracUnit, ...decUnit, ...ratioUnit, ...twoUnit };
