// engine/frac.js
// 分數的精確計算和小學寫法。出題模組用它驗算，不用電腦小數（避免 0.1 + 0.2 ≠ 0.3 的誤差）。
// 分數一律存成最簡分數 { n, d }，d > 0。

export const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
export const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

export function F(n, d = 1) {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error('分數要是整數／整數：' + n + '/' + d);
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

/** 小數字串（例如 '0.75'）變分數 */
export function fromDecimal(s) {
  const str = String(s);
  const [i, f = ''] = str.split('.');
  const d = 10 ** f.length;
  const n = Number(i.replace('-', '')) * d + Number(f || 0);
  return F(str.startsWith('-') ? -n : n, d);
}

export const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => F(a.n * b.n, a.d * b.d);
export const div = (a, b) => { if (b.n === 0) throw new Error('除以 0'); return F(a.n * b.d, a.d * b.n); };
export const cmp = (a, b) => Math.sign(a.n * b.d - b.n * a.d);
export const eq = (a, b) => cmp(a, b) === 0;
export const isInt = (a) => a.d === 1;
export const toNumber = (a) => a.n / a.d;

/** 分母只有 2 和 5 的因數，才能寫成有限小數 */
export function decimalPlaces(a) {
  let d = a.d, k2 = 0, k5 = 0;
  while (d % 2 === 0) { d /= 2; k2++; }
  while (d % 5 === 0) { d /= 5; k5++; }
  return d === 1 ? Math.max(k2, k5) : -1;
}

/** 寫成小數字串；不是有限小數回傳 null */
export function toDecimal(a) {
  const k = decimalPlaces(a);
  if (k < 0) return null;
  const scaled = Math.abs(a.n) * (10 ** k) / a.d;
  const s = String(Math.round(scaled)).padStart(k + 1, '0');
  const out = k ? s.slice(0, -k) + '.' + s.slice(-k) : s;
  return (a.n < 0 ? '-' : '') + out;
}

/** 分數寫法：3/4、7/2；整數就寫整數 */
export const fracText = (a) => (a.d === 1 ? String(a.n) : a.n + '/' + a.d);

/** 帶分數寫法：2又1/3；真分數就寫 1/3；整數寫整數 */
export function mixedText(a) {
  if (a.d === 1) return String(a.n);
  const w = Math.trunc(a.n / a.d);
  const r = Math.abs(a.n % a.d);
  return w ? w + '又' + r + '/' + a.d : a.n + '/' + a.d;
}

/** 題目裡顯示用：假分數寫成帶分數（課本習慣） */
export const show = (a) => mixedText(a);

/** 填答題可以接受的寫法：最簡分數、帶分數、有限小數、整數（不收沒約分的） */
export function acceptAll(a) {
  const set = new Set([fracText(a), mixedText(a)]);
  const dec = toDecimal(a);
  if (dec !== null) set.add(dec);
  return [...set];
}

/** 四捨五入到小數第 k 位，回傳字串（例如 0.79） */
export function roundText(a, k) {
  const s = 10 ** k;
  const v = Math.floor((Math.abs(a.n) * s * 2 + a.d) / (2 * a.d)); // 精確的四捨五入
  const str = String(v).padStart(k + 1, '0');
  return (a.n < 0 ? '-' : '') + (k ? str.slice(0, -k) + '.' + str.slice(-k) : str);
}
