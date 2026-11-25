// engine/generate.js
// 出題模組：照關卡檔的 make 欄位（例如「dec-div*4, dec-round*2」）產生題目，並組出綜合練習。
// 每一題都經過檢查：選擇題剛好一個正確選項、選項不重複；填答題有答案；文字裡沒有 NaN、undefined。
// 不合格就換一組亂數重出，所以小孩看到的一定是整齊、算得出來的題目。
// 純邏輯，瀏覽器和 Node 都能用。數字範圍由外面傳進來（config/generators/*.json）。
import { createRng, newSeed } from './rng.js';
import { MATH_TYPES, isRetry } from './generators/math.js';

const REGISTRY = { ...MATH_TYPES };

/** 之後國語、英語的產生器用這個加進來 */
export function registerTypes(types) { Object.assign(REGISTRY, types); }
export const hasType = (t) => typeof REGISTRY[t] === 'function';
export const typeNames = () => Object.keys(REGISTRY);

const BAD = /NaN|undefined|null|Infinity|\[object/;

/** 判斷兩題是不是同一題：題目＋選項都一樣才算（有些題型題目文字固定，只有選項不同） */
export const questionKey = (q) => q.text + '|' + (q.options || []).map((o) => o.text).sort().join('|');

/** 檢查一題；有問題回傳說明，沒問題回傳空字串 */
export function checkQuestion(q) {
  if (!q || !q.text || !q.tip) return '缺題目或技巧';
  if (BAD.test(q.text) || BAD.test(q.tip)) return '文字有怪字：' + q.text;
  if (q.type === '選擇') {
    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) return '選項數不對';
    if (q.options.filter((o) => o.correct).length !== 1) return '正確選項不是剛好一個';
    const texts = q.options.map((o) => String(o.text));
    if (new Set(texts).size !== texts.length) return '選項重複';
    if (texts.some((t) => !t || BAD.test(t))) return '選項有怪字';
    return '';
  }
  if (q.type !== '填答') return '題型不對';
  if (!Array.isArray(q.answers) || !q.answers.length) return '沒有答案';
  if (q.answers.some((a) => !String(a) || BAD.test(String(a)))) return '答案有怪字';
  return '';
}

/** 用亂數出一題 type；cfg 是這個科目的數字範圍 */
export function generateQuestion(type, rng, cfg = {}) {
  const gen = REGISTRY[type];
  if (!gen) throw new Error('沒有這種題型：' + type);
  let lastErr = '';
  for (let i = 0; i < 300; i++) {
    const r = rng.fork();
    let q;
    try { q = gen(r, cfg); } catch (err) { if (isRetry(err)) continue; throw err; }
    const bad = checkQuestion(q);
    if (!bad) return { options: [], answers: [], unit: '', speech: '', ...q, gen: type };
    lastErr = bad;
  }
  throw new Error(type + ' 出不出合格的題目（' + (lastErr || '數字條件太嚴') + '），請放寬數字範圍');
}

/** 「dec-div*4, dec-round*2」→ [{ type, count }]；也接受 ×、x 和全形逗號 */
export function parseMake(s) {
  return String(s || '').split(/[,，、]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^([a-z0-9-]+)\s*(?:[*×x]\s*(\d+))?$/i);
    if (!m) throw new Error('make 看不懂：' + part);
    return { type: m[1], count: m[2] ? Number(m[2]) : 1 };
  });
}

export const makeCount = (make) => parseMake(make).reduce((s, x) => s + x.count, 0);

/** 依 make 出一整關的題目。同一題型不會出一模一樣的題目 */
export function buildQuestions(make, rng, cfg = {}) {
  const out = [];
  const seen = new Set();
  for (const { type, count } of parseMake(make)) {
    for (let i = 0; i < count; i++) {
      let q = generateQuestion(type, rng, cfg);
      for (let t = 0; t < 20 && seen.has(questionKey(q)); t++) q = generateQuestion(type, rng, cfg);
      seen.add(questionKey(q));
      out.push(q);
    }
  }
  return out.map((q, i) => ({ ...q, no: String(i + 1) }));
}

/**
 * 關卡檔有 make 的話，出一份新題目（回傳新的關卡物件，不改原來的）。
 * 沒有 make 的關卡原樣回傳（手寫題目的關卡照舊可以用）。
 */
export function materialize(level, { seed = newSeed(), cfg = {} } = {}) {
  if (!level?.meta?.make) return level;
  const rng = createRng(seed);
  return { ...level, seed, questions: buildQuestions(level.meta.make, rng, cfg) };
}

/**
 * 綜合練習：從勾選的單元抽題。
 * units：[{ unit, levels: [關卡…] }]（每個單元底下的關卡，用它們的 make 當題庫）
 * count：總題數；平均分給勾選的單元，多出來的輪流給。
 * meta：{ id, kid, grade, subject, name, minutes }
 */
export function mixLevel(units, { count, seed = newSeed(), cfg = {}, meta = {} }) {
  const chosen = units.filter((u) => u.levels.some((l) => l.meta.make));
  if (!chosen.length) throw new Error('沒有可以出題的單元');
  const rng = createRng(seed);
  const share = chosen.map((_, i) => Math.floor(count / chosen.length) + (i < count % chosen.length ? 1 : 0));
  const order = rng.shuffle(chosen.map((_, i) => i)); // 多出來的題數隨機給，不要老是給第一個單元
  const per = new Array(chosen.length).fill(0);
  order.forEach((idx, i) => { per[idx] = share[i]; });
  const questions = [];
  const seen = new Set();
  chosen.forEach((u, i) => {
    // 這個單元所有題型，照關卡裡的題數當權重，輪著抽，避免同一種題型擠在一起
    const pool = [];
    for (const l of u.levels) for (const { type, count: c } of parseMake(l.meta.make || '')) for (let k = 0; k < c; k++) pool.push(type);
    let bag = [];
    for (let n = 0; n < per[i]; n++) {
      if (!bag.length) bag = rng.shuffle(pool);
      const type = bag.pop();
      let q = generateQuestion(type, rng, cfg);
      for (let t = 0; t < 20 && seen.has(questionKey(q)); t++) q = generateQuestion(type, rng, cfg);
      seen.add(questionKey(q));
      questions.push({ ...q, unitName: u.unit });
    }
  });
  const mixed = rng.shuffle(questions).map((q, i) => ({ ...q, no: String(i + 1) }));
  return { meta: { ...meta, mix: true }, questions: mixed, seed, file: '' };
}
