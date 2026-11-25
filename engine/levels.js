// engine/levels.js
// 讀取與解析關卡檔（.md）。不含任何題目、小孩名字或畫面程式，
// 關卡檔可以手寫題目，也可以只寫 make（出題模組的題型和題數，見 engine/generate.js），
// 瀏覽器和 Node 都能用。格式見 docs/關卡檔格式.md。

const FIELD_NAMES = ['題型', '題目', '答案', '單位', '技巧', '語音'];

/** 把一個關卡檔的文字解析成 { meta, questions } */
export function parseLevel(text) {
  const src = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('關卡檔開頭要有 --- 資料區');
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    const val = line.slice(i + 1).trim();
    if (key) meta[key] = val;
  }
  for (const k of ['lost', 'minutes', 'order', 'unitOrder']) {
    if (meta[k] !== undefined && meta[k] !== '') meta[k] = Number(meta[k]);
  }
  const questions = parseQuestions(m[2]);
  return { meta, questions };
}

function parseQuestions(body) {
  const blocks = body.split(/^##\s+/m).slice(1);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const q = { no: lines.shift().trim(), type: '', text: '', options: [], answers: [], unit: '', tip: '', speech: '' };
    let current = null; // 正在接續多行的欄位
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const opt = line.match(/^([-*])\s+(.*)$/);
      if (opt) {
        q.options.push({ text: opt[2], correct: opt[1] === '*' });
        current = null;
        continue;
      }
      const field = FIELD_NAMES.find((f) => line.startsWith(f + ':') || line.startsWith(f + '：'));
      if (field) {
        current = field;
        setField(q, field, line.slice(field.length + 1).trim());
        continue;
      }
      if (current && line.trim() !== '') appendField(q, current, line.trim());
    }
    if (!q.type) q.type = q.options.length ? '選擇' : '填答';
    return q;
  });
}

function setField(q, field, value) {
  if (field === '題型') q.type = value;
  else if (field === '題目') q.text = value;
  else if (field === '答案') q.answers = value.split('|').map((s) => s.trim()).filter(Boolean);
  else if (field === '單位') q.unit = value;
  else if (field === '技巧') q.tip = value;
  else if (field === '語音') q.speech = value;
}

function appendField(q, field, value) {
  if (field === '題目') q.text += '\n' + value;
  else if (field === '技巧') q.tip += '\n' + value;
}

/**
 * 從某個資料夾讀所有關卡：先讀 index.json（檔名陣列），再逐一讀檔。
 * 讀不到或格式錯的檔案放進 errors，不讓整個網站壞掉。
 * fetchText 可以換掉（例如測試時從硬碟讀）。
 */
export async function loadLevels(folder, fetchText = defaultFetchText) {
  const base = folder.endsWith('/') ? folder : folder + '/';
  const names = JSON.parse(await fetchText(base + 'index.json'));
  if (!Array.isArray(names)) throw new Error('index.json 要是檔名陣列');
  const levels = [];
  const errors = [];
  await Promise.all(names.map(async (name) => {
    try {
      const level = parseLevel(await fetchText(base + name));
      level.file = name;
      levels.push(level);
    } catch (err) {
      errors.push({ file: name, message: err.message });
    }
  }));
  levels.sort(compareLevels);
  return { levels, errors };
}

async function defaultFetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(url + ' 讀不到（' + res.status + '）');
  return res.text();
}

function compareLevels(a, b) {
  const ka = [a.meta.grade || '', a.meta.unitOrder ?? 99, a.meta.unit || a.meta.source || '', a.meta.order ?? 99, a.meta.id || ''];
  const kb = [b.meta.grade || '', b.meta.unitOrder ?? 99, b.meta.unit || b.meta.source || '', b.meta.order ?? 99, b.meta.id || ''];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/** 列出關卡裡出現過的小孩稱呼（不寫死在程式裡） */
export function kidsIn(levels) {
  return [...new Set(levels.map((l) => l.meta.kid).filter(Boolean))];
}

/** 某個小孩、某個科目的關卡，依單元分組（沒有 unit 欄位的關卡照年級＋考卷來源分組） */
export function levelsFor(levels, { kid, subject }) {
  const list = levels.filter((l) => (!kid || l.meta.kid === kid) && l.meta.subject === subject);
  const groups = new Map();
  for (const l of list) {
    const key = l.meta.unit || [l.meta.grade, l.meta.source].filter(Boolean).join(' ');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  return { count: list.length, groups: [...groups].map(([title, items]) => ({ title, items })) };
}

/** 限時（分鐘）：有填 minutes 用它，沒填就照題數 × 每題分鐘（預設 1，從 config/quiz.json 傳進來） */
export function timeLimitMinutes(level, minutesPerQuestion = 1) {
  return Number.isFinite(level.meta.minutes) && level.meta.minutes > 0
    ? level.meta.minutes
    : Math.max(1, level.questions.length) * minutesPerQuestion;
}
