// engine/rng.js
// 可以重現的亂數：同一個種子號碼，抽出來的數字一模一樣。
// 出題模組用它，同一個種子就是同一份題目（方便錯題重練、日後查題）。

/** mulberry32：很小、夠亂，用 32 位元整數當種子 */
export function createRng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    seed: Number(seed) >>> 0,
    /** 0 ≤ x < 1 */
    next,
    /** lo～hi 之間的整數（包含兩端） */
    int(lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); },
    /** 陣列裡隨便挑一個 */
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    /** 洗牌（不改原陣列） */
    shuffle(arr) {
      const a2 = [...arr];
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
    /** 機率 p 為真 */
    chance(p) { return next() < p; },
    /** 從這個亂數再分出一個獨立的（給每一題用） */
    fork() { return createRng(Math.floor(next() * 4294967296)); },
  };
  return rng;
}

/** 新的種子號碼 */
export const newSeed = () => (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
