// 用 Node 跑：node tests/english.test.mjs
// 英語：教材檔解析、每種題型出很多題都合格、判分（大小寫、標點、半分、縮寫、時間詞放前後）、學習卡、綜合練習、搶答賽只抽選擇題。
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseBank, bankCards, loadBanks } from '../engine/words.js';
import { letterHint } from '../engine/generators/english.js';
import { generateQuestion, checkQuestion, questionKey, typeNames, materialize, mixLevel, levelCfg } from '../engine/generate.js';
import { englishCredit, creditOf, isCorrect, createSession, setAnswer, grade, wrongIndices, resultSummary } from '../engine/quiz.js';
import { loadLevels } from '../engine/levels.js';
import { createRng } from '../engine/rng.js';
import { choiceSources, createDrawer } from '../games/quiz-race/race.js';
import { cardSettings, ruleFor, buildCards } from '../engine/cards.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readFile(p, 'utf8');
let pass = 0;
const fails = [];
function test(name, fn) {
  try { fn(); pass++; } catch (err) { fails.push('✗ ' + name + '\n  ' + err.message); }
}
function eq(a, b, msg = '') {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg + ' 期望 ' + JSON.stringify(b) + '，得到 ' + JSON.stringify(a));
}
function ok(v, msg) { if (!v) throw new Error(msg); }

const bank = parseBank(await read(root + 'content/words/jie-6a-en-u1.md'));
const enCfg = JSON.parse(await read(root + 'config/generators/english.json'));
const cfg = { ...enCfg, bank };

test('教材檔解析：各段都有東西', () => {
  eq(bank.meta.id, 'jie-6a-en-u1');
  for (const [k, n] of [['places', 4], ['activities', 6], ['verbs', 11], ['times', 8], ['people', 6], ['patterns', 7], ['make', 2], ['sentences', 6], ['soft-c', 7], ['hard-c', 5], ['extras', 7]]) {
    eq(bank.sections[k]?.items.length, n, k);
  }
  const kite = bank.sections.activities.items.find((x) => x.cols[0] === 'flew a kite');
  eq(kite.opts, { base: 'fly a kite', s: 'flies a kite', pic: 'flew-a-kite' });
});

for (const it of [...bank.sections.places.items, ...bank.sections.activities.items]) {
  const f = root + 'assets/pics/en/' + it.opts.pic + '.svg';
  try { const svg = await read(f); ok(svg.includes('<svg') && !/<text/i.test(svg), it.opts.pic + ' 不是 SVG 或有字'); pass++; } catch (err) { fails.push('✗ 圖 ' + f + '\n  ' + err.message); }
}

test('字數提示', () => {
  eq(letterHint('flew a kite'), 'f _ _ _　　a　　k _ _ _');
  eq(letterHint('night market'), 'n _ _ _ _　　m _ _ _ _ _');
});

const EN = typeNames().filter((t) => t.startsWith('en-'));
test('英語題型有 8 種', () => eq(EN.length, 8));

const N = 1500;
for (const type of EN) {
  test(type + '：' + N + ' 題都合格', () => {
    const rng = createRng(4242);
    const keys = new Set();
    for (let i = 0; i < N; i++) {
      const q = generateQuestion(type, rng, cfg);
      const bad = checkQuestion(q);
      if (bad) throw new Error(bad + '：' + q.text);
      if (q.lang !== 'en') throw new Error('沒有 lang');
      if (/\{\w+\}/.test(q.text + (q.options || []).map((o) => o.text).join('') + q.answers.join(''))) throw new Error('有沒換掉的 {…}：' + q.text);
      if (q.type === '填答') {
        for (const a of q.answers) if (englishCredit(q, a).credit !== 1) throw new Error('標準答案自己不是滿分：' + a);
        if (q.speechOnly && !q.speech) throw new Error('聽寫沒有要唸的字');
        if (q.speechOnly && q.text.toLowerCase().includes(q.answers[0].toLowerCase())) throw new Error('聽寫題目露出答案');
      }
      if (q.image && !q.image.startsWith('assets/pics/en/')) throw new Error('圖片路徑：' + q.image);
      if (type === 'en-pic-spell' && q.text.includes(q.answers[0])) throw new Error('看圖拼字露出答案');
      if (type === 'en-zh-en' && /[a-z]{3,}/.test(q.text.replace(/^[^：]*：\n?/, '').replace(/Tina|Ben/g, ''))) throw new Error('中翻英題目有英文：' + q.text);
      keys.add(questionKey(q));
    }
    if (keys.size < 8) throw new Error('題目太少種：' + keys.size);
  });
}

test('軟 c／硬 c：正確選項的字真的和題目同一種', () => {
  const soft = new Set(bank.sections['soft-c'].items.map((x) => x.cols[0]));
  const rng = createRng(7);
  for (let i = 0; i < 800; i++) {
    const q = generateQuestion('en-c-sound', rng, cfg);
    const m = q.text.match(/和 (\w+) 的 c 一樣，唸 (\/[sk]\/)/);
    if (!m) continue;
    const right = q.options.find((o) => o.correct).text;
    const wantSoft = m[2] === '/s/';
    eq(soft.has(right), wantSoft, q.text + ' ' + right);
    for (const o of q.options) if (!o.correct) { eq(soft.has(o.text), !wantSoft, '錯的選項 ' + o.text); if (!wantSoft) ok(o.text !== 'cycle', 'cycle 不能當硬 c 的錯選項'); }
  }
});

test('句型問答：Where／What 的正確答案不是 Yes/No；Did 的是', () => {
  const rng = createRng(9);
  for (let i = 0; i < 800; i++) {
    const q = generateQuestion('en-pattern-choose', rng, cfg);
    const right = q.options.find((o) => o.correct).text;
    const last = q.text.split('\n').pop();
    if (/^Did /.test(last)) ok(/^(Yes|No), \w+ did(n't)?\.$/.test(right), right);
    else ok(!/^(Yes|No)/.test(right), right);
  }
});

// ---------- 判分 ----------
const word = { type: '填答', lang: 'en', answers: ['flew a kite'] };
const sent = { type: '填答', lang: 'en', sentence: true, answers: ['I rode a bike yesterday.', 'Yesterday, I rode a bike.'] };
const ask = { type: '填答', lang: 'en', sentence: true, answers: ['Where did you go last weekend?'] };
const no = { type: '填答', lang: 'en', sentence: true, answers: ["No, we didn't."] };
const c = (q, g) => englishCredit(q, g).credit;
const n = (q, g) => englishCredit(q, g).notes;

test('片語：不分大小寫、前後空白、多的空格', () => {
  eq(c(word, 'flew a kite'), 1);
  eq(c(word, '  Flew  A   KITE '), 1);
  eq(c(word, 'flew a kite.'), 1);
  eq(c(word, 'Ｆｌｅｗ　ａ　ｋｉｔｅ'), 1, '全形');
});
test('片語：拼錯或黏在一起都錯', () => {
  eq(c(word, 'flewakite'), 0);
  eq(c(word, 'flyed a kite'), 0);
  eq(c(word, 'fly a kite'), 0);
  eq(n(word, 'flw a kite'), ['spell']);
  eq(c(word, ''), 0);
  eq(isCorrect(word, 'flew a kite'), true);
  eq(isCorrect(word, 'flewakite'), false);
});
test('整句：全對 1、時間詞放前面也對、逗號可有可無', () => {
  eq(c(sent, 'I rode a bike yesterday.'), 1);
  eq(c(sent, 'Yesterday, I rode a bike.'), 1);
  eq(c(sent, 'Yesterday I rode a bike.'), 1);
  eq(c(sent, 'I  rode a bike yesterday。'), 1, '中文句號');
  eq(c(sent, 'I rode a bike yesterday．'), 1, '全形句點');
});
test('整句：只錯大寫或標點得一半，並說原因', () => {
  eq(englishCredit(sent, 'i rode a bike yesterday.'), { credit: 0.5, notes: ['cap'] });
  eq(englishCredit(sent, 'I rode a bike yesterday'), { credit: 0.5, notes: ['period'] });
  eq(englishCredit(sent, 'i rode a bike yesterday'), { credit: 0.5, notes: ['cap', 'period'] });
  eq(englishCredit(ask, 'Where did you go last weekend.'), { credit: 0.5, notes: ['question'] });
  eq(englishCredit(ask, 'Where did you go last weekend？'), { credit: 1, notes: [] }, '全形問號');
});
test('整句：拼錯就 0', () => {
  eq(englishCredit(sent, 'I ride a bike yesterday.'), { credit: 0, notes: ['spell'] });
  eq(c(sent, 'I rode bike yesterday.'), 0, '少字');
});
test("整句：didn't／did not、彎引號都一樣", () => {
  eq(c(no, "No, we didn't."), 1);
  eq(c(no, 'No, we did not.'), 1);
  eq(c(no, 'No, we didn’t.'), 1);
  eq(c(no, 'No we didn’t.'), 1);
});
test('選擇題和數學照舊只有 0／1', () => {
  const pick = { type: '選擇', lang: 'en', options: [{ text: 'a', correct: false }, { text: 'b', correct: true }] };
  eq(creditOf(pick, 1).credit, 1);
  eq(creditOf(pick, 0).credit, 0);
  eq(creditOf({ type: '填答', answers: ['0.5'] }, '1/2').credit, 0);
  eq(creditOf({ type: '填答', answers: ['12'] }, '12').credit, 1);
});

test('交卷：半分加總、要整題都對才算全對、半對的進錯題重練', () => {
  const level = { meta: { id: 'x', kid: '姐姐', subject: '英語' }, questions: [word, sent, ask, no].map((q, i) => ({ ...q, no: String(i + 1), text: 't', tip: 't', options: [] })) };
  const s = createSession(level, { now: 0 });
  setAnswer(s, 'flew a kite', 0);
  setAnswer(s, 'i rode a bike yesterday.', 1);
  setAnswer(s, 'Where did you go last weekend?', 2);
  setAnswer(s, 'no, we didnt', 3);
  const r = grade(s, level, { now: 1000 });
  eq(r.score, 2.5);
  eq(r.perfect, false);
  eq(r.items.map((x) => x.credit), [1, 0.5, 1, 0]);
  eq(r.items[1].notes, ['cap']);
  eq(wrongIndices(r), [1, 3]);
  const sum = resultSummary(r, level);
  eq(sum.score, 2.5);
  eq(sum.items[1].half, true);
  eq(sum.items[0].half, undefined);
});

// ---------- 學習卡 ----------
test('學習卡：從教材檔來，有圖、有要唸的字、背面中文', () => {
  const cards = bankCards(bank, 'places, activities, extras', enCfg);
  eq(cards.length, 4 + 6 + 7);
  eq(cards[0].front, 'department store');
  eq(cards[0].answer, '百貨公司');
  eq(cards[0].image, 'assets/pics/en/department-store.svg');
  eq(cards[0].speech, 'department store');
  ok(cards.every((x) => x.front && x.answer), '每張都有正反面');
  const v = bankCards(bank, ['verbs'], enCfg);
  eq(v[0].front, 'eat → ate');
});

test('學習卡開放：英語預設一開始、數學照舊測驗後、試算表有填照試算表', () => {
  const st = cardSettings({ defaultRule: 'afterQuiz', bySubject: { 英語: 'always', 亂填: 'xx' } });
  eq(ruleFor(null, st, '英語'), { rule: 'always', from: 'default' });
  eq(ruleFor(null, st, '數學'), { rule: 'afterQuiz', from: 'default' });
  eq(ruleFor({ cards: '全對後' }, st, '英語'), { rule: 'afterPerfect', from: 'sheet' });
  eq(st.bySubject, { 英語: 'always' });
});
test('學習卡畫面用的卡：關卡有 cards 就用教材卡', () => {
  const lv = { meta: {}, questions: [{ text: 'q', tip: 't', type: '填答', answers: ['a'], options: [] }], cards: bankCards(bank, 'places', enCfg) };
  const cs = buildCards(lv);
  eq(cs.length, 4);
  eq([cs[1].front, cs[1].answer, cs[1].lang, cs[1].no], ['night market', '夜市', 'en', '2']);
  eq(buildCards({ meta: {}, questions: lv.questions }).length, 1);
});

// ---------- 關卡 ----------
const { levels: raw } = await loadLevels(root + 'content/levels', read);
const en = raw.filter((l) => l.meta.subject === '英語');
const { banks, errors } = await loadBanks(en, root + 'content/words', read);
test('六關英語都讀得到教材檔', () => { eq(en.length, 6); eq(errors, []); eq(Object.keys(banks), ['jie-6a-en-u1']); });
const subjCfg = { ...enCfg, banks };
test('每一關出題、學習卡都正常', () => {
  for (const l of en) {
    for (let k = 0; k < 30; k++) {
      const m = materialize(l, { seed: 100 + k, cfg: subjCfg });
      ok(m.questions.length >= 6, l.meta.id + ' 題數');
      for (const q of m.questions) { const bad = checkQuestion(q); if (bad) throw new Error(l.meta.id + '：' + bad); }
      ok(m.cards?.length >= 6, l.meta.id + ' 學習卡');
      const keys = new Set(m.questions.map(questionKey));
      ok(keys.size === m.questions.length, l.meta.id + ' 同一關有重複題目');
    }
  }
});
test('沒有教材檔時講清楚', () => {
  let msg = '';
  try { levelCfg(en[0], enCfg); } catch (err) { msg = err.message; }
  ok(msg.includes('jie-6a-en-u1'), msg);
});
test('綜合練習：4／10／15 題都出得來', () => {
  for (const count of [4, 10, 15]) {
    const lv = mixLevel([{ unit: en[0].meta.unit, levels: en }], { count, seed: count, cfg: subjCfg, meta: { id: 'm' } });
    eq(lv.questions.length, count);
    for (const q of lv.questions) eq(checkQuestion(q), '');
  }
});
test('搶答賽：只抽選擇題（句型、軟硬 c、看圖選字）', () => {
  const lv = en.map((l, i) => materialize(l, { seed: i + 1, cfg: subjCfg }));
  const sources = lv.flatMap(choiceSources);
  eq([...new Set(sources.map((s) => s.type))].sort(), ['en-c-sound', 'en-pattern-choose', 'en-pic-choose']);
  const d = createDrawer(sources, { seed: 3, cfgOf: (subject, s) => levelCfg({ meta: { bank: s?.bank } }, subjCfg) });
  for (let i = 0; i < 60; i++) eq(d.next().type, '選擇');
});

if (fails.length) { console.log(fails.join('\n')); console.log(`英語：通過 ${pass} 項（有失敗）`); process.exit(1); }
console.log(`英語：全部通過（${pass} 項）`);
