// engine/words.js
// 教材檔（content/words/*.md）：讀檔、解析，和把教材變成學習卡。
// 教材檔只放單字、句型等內容；怎麼出題寫在 engine/generators/english.js。格式見 docs/英語島.md。
// 純邏輯，瀏覽器和 Node 都能用；不含任何英文題目或小孩資料。

/**
 * 解析教材檔文字 → { meta, sections }
 * sections[段代號] = { title, items: [{ cols: [固定欄位…], opts: { 名稱: 值 } }] }
 */
export function parseBank(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('教材檔開頭要有 --- 資料區');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  if (!meta.id) throw new Error('教材檔缺 id');
  const sections = {};
  let cur = null;
  for (const raw of m[2].split('\n')) {
    const line = raw.trim();
    const h = line.match(/^##\s+([a-z0-9-]+)\s*(.*)$/i);
    if (h) { cur = sections[h[1]] = { title: h[2].trim(), items: [] }; continue; }
    if (!cur || !line.startsWith('- ')) continue;
    const cols = [];
    const opts = {};
    for (const part of line.slice(2).split('|').map((s) => s.trim())) {
      const kv = part.match(/^([a-zA-Z0-9]+)=(.*)$/);
      if (kv) opts[kv[1]] = kv[2].trim();
      else cols.push(part);
    }
    if (cols.length && cols[0]) cur.items.push({ cols, opts });
  }
  return { meta, sections };
}

/** 某一段的項目（沒有這一段回傳空陣列） */
export const sectionItems = (bank, key) => bank?.sections?.[key]?.items || [];

/** 這個關卡用到的教材檔代號（沒有寫 bank 回傳空字串） */
export const bankOf = (level) => String(level?.meta?.bank || '').trim();

/**
 * 讀關卡用到的所有教材檔。回傳 { banks: { 代號: 教材 }, errors: [{ file, message }] }。
 * fetchText 可以換掉（測試時從硬碟讀）。
 */
export async function loadBanks(levels, folder, fetchText) {
  const base = folder.endsWith('/') ? folder : folder + '/';
  const ids = [...new Set(levels.map(bankOf).filter(Boolean))];
  const banks = {};
  const errors = [];
  await Promise.all(ids.map(async (id) => {
    try {
      const b = parseBank(await fetchText(base + id + '.md'));
      if (b.meta.id !== id) throw new Error('檔名和 id 不同（' + b.meta.id + '）');
      banks[id] = b;
    } catch (err) { errors.push({ file: id + '.md', message: err.message }); }
  }));
  return { banks, errors };
}

// ---------- 學習卡 ----------

const SOFT_TIP = 'c 後面接 e、i、y 時唸 /s/（軟 c）。';
const HARD_TIP = 'c 後面接 a、o、u、子音或在字尾時唸 /k/（硬 c）。';

/**
 * 教材檔變成學習卡。sections：要哪幾段（「places, activities」或陣列）。
 * 每張卡 { front, answer, tip, image, speech, options: [] }；no 由外面補。
 * picPath：圖片放哪（config/generators/english.json 的 picPath）。
 */
export function bankCards(bank, sections, { picPath = '' } = {}) {
  const keys = Array.isArray(sections) ? sections : String(sections || '').split(/[,，、\s]+/).filter(Boolean);
  const pic = (name) => (name ? picPath + name + '.svg' : '');
  const out = [];
  for (const key of keys) {
    for (const { cols, opts } of sectionItems(bank, key)) {
      const [a, b = '', c = ''] = cols;
      let card;
      if (key === 'verbs') card = { front: a + ' → ' + b, speech: a + ', ' + b, answer: c, tip: (opts.kind || '') + (opts.obj ? '　例：' + b + ' ' + opts.obj : '') };
      else if (key === 'activities') card = { front: a, speech: a, answer: b, tip: '原形：' + (opts.base || a) + (opts.s ? '；he/she 現在式：' + opts.s : ''), image: pic(opts.pic) };
      else if (key === 'places') card = { front: a, speech: a, answer: b, tip: 'I went to the ' + a + ' last weekend.', image: pic(opts.pic) };
      else if (key === 'sentences') card = { front: a, speech: a, answer: b, tip: c };
      else if (key === 'soft-c') card = { front: a, speech: a, answer: b, tip: SOFT_TIP + (opts.hard ? '（' + a + ' 的第二個 c 唸 /k/）' : '') };
      else if (key === 'hard-c') card = { front: a, speech: a, answer: b, tip: HARD_TIP };
      else card = { front: a, speech: a, answer: b, tip: c };
      out.push({ options: [], image: '', ...card });
    }
  }
  return out;
}
