// 用 Node 跑：node tests/levels.test.mjs
// 檢查所有關卡檔都能解析，選擇題剛好一個正確答案，填答題有答案，每題都有技巧。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadLevels, kidsIn, levelsFor, timeLimitMinutes } from '../engine/levels.js';
import { materialize } from '../engine/generate.js';
import { loadBanks } from '../engine/words.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const { levels: raw, errors } = await loadLevels(root + 'content/levels', (p) => readFile(p, 'utf8'));
// 有 make 的關卡先出一份題目（每次測驗都會出新的；這裡用固定種子方便重現）
// 出題參數照科目讀 config/generators/<島的代號>.json，英語再加上教材檔（content/words/）
const islands = JSON.parse(await readFile(root + 'config/subjects.json', 'utf8')).islands;
const { banks, errors: bankErrors } = await loadBanks(raw, root + 'content/words', (p) => readFile(p, 'utf8'));
const genCfg = {};
for (const i of islands) {
  try { genCfg[i.subject] = JSON.parse(await readFile(root + 'config/generators/' + i.code + '.json', 'utf8')); } catch { genCfg[i.subject] = {}; }
  genCfg[i.subject].banks = banks;
}
const levels = raw.map((l, i) => materialize(l, { seed: 1000 + i, cfg: genCfg[l.meta.subject] || {} }));
let problems = [...errors, ...bankErrors].map((e) => `${e.file}: ${e.message}`);

for (const l of levels) {
  for (const k of ['id', 'kid', 'grade', 'subject', 'name']) if (!l.meta[k]) problems.push(`${l.file}: 缺 ${k}`);
  if (l.file !== l.meta.id + '.md') problems.push(`${l.file}: id 和檔名不同`);
  for (const q of l.questions) {
    const where = `${l.meta.id} 第 ${q.no} 題`;
    if (!q.text) problems.push(`${where}: 沒有題目`);
    if (!q.tip) problems.push(`${where}: 沒有技巧`);
    if (q.type === '選擇') {
      const n = q.options.filter((o) => o.correct).length;
      if (n !== 1) problems.push(`${where}: 正確選項有 ${n} 個`);
      if (q.options.length < 2 || q.options.length > 4) problems.push(`${where}: 選項 ${q.options.length} 個`);
    } else if (!q.answers.length) problems.push(`${where}: 填答題沒有答案`);
  }
}

console.log(`關卡 ${levels.length} 個，題目 ${levels.reduce((s, l) => s + l.questions.length, 0)} 題`);
console.log('小孩：', kidsIn(levels).join('、'));
for (const kid of kidsIn(levels)) for (const subject of ['數學', '英語']) {
  const r = levelsFor(levels, { kid, subject });
  if (!r.count) continue;
  console.log(`${kid} ${subject}：${r.count} 關`, r.groups.map((g) => `${g.title}(${g.items.map((i) => i.meta.name + '/' + timeLimitMinutes(i) + '分').join('、')})`).join('；'));
}
if (problems.length) {
  console.log('問題：\n' + problems.join('\n'));
  process.exit(1);
}
console.log('全部通過');
