// engine/generators/english.js
// 英語題型產生器（代號 en- 開頭）。題目的英文全部從教材檔來（cfg.bank，見 engine/words.js），
// 這裡只寫「怎麼出題」：看圖拼字、填空、單選、聽寫、看中文寫英文。
// 每個產生器回傳 { type: '選擇'|'填答', text, options, answers, tip, lang: 'en', … }：
//   image：圖片網址；speech：要唸的英文；speechOnly：題目只用聽的（聽寫）；
//   sentence：答案是整句（判分時另外看第一個字大寫和句尾標點，見 engine/quiz.js）。
import { retry } from './math.js';
import { sectionItems } from '../words.js';

// ---------- 小工具 ----------

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fillT = (tpl, v) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (v[k] === undefined ? '{' + k + '}' : v[k]));
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\s+([.?!,])/g, '$1').trim();

function need(cfg) {
  if (!cfg?.bank) throw new Error('英語題目要有教材檔（關卡檔的 bank 欄位）');
  return cfg.bank;
}
function items(bank, key, filter) {
  const list = sectionItems(bank, key).filter((x) => !filter || filter(x));
  if (!list.length) throw new Error('教材檔沒有「' + key + '」這一段');
  return list;
}
const picUrl = (cfg, name) => (name ? (cfg.picPath || '') + name + '.svg' : '');

/** 選擇題選項：正確的放一個，錯的去掉重複和跟正確一樣的，最多 4 個，打亂 */
function choice(rng, right, wrongs, max = 4) {
  const seen = new Set([right.toLowerCase()]);
  const ws = [];
  for (const w of wrongs) {
    const k = String(w).toLowerCase();
    if (w && !seen.has(k) && !/\{\w+\}/.test(w)) { seen.add(k); ws.push(w); }
  }
  if (!ws.length) retry();
  return rng.shuffle([{ text: right, correct: true }, ...rng.shuffle(ws).slice(0, max - 1).map((t) => ({ text: t, correct: false }))]);
}

/** 字數提示：flew a kite → f _ _ _　a　k _ _ _（兩個字母以下的字直接給） */
export function letterHint(en) {
  return en.split(' ').map((w) => (w.length <= 2 ? w : w[0] + ' _'.repeat(w.length - 1))).join('　　');
}

const pastTimes = (bank) => items(bank, 'times', (x) => !x.opts.now);
const nowTimes = (bank) => items(bank, 'times', (x) => x.opts.now);

/** 一組隨機的人、地方、事情、時間，給句型和造句用 */
function scene(rng, bank, { whoFilter } = {}) {
  const places = items(bank, 'places');
  const acts = items(bank, 'activities');
  const people = items(bank, 'people', whoFilter);
  const [p1, p2] = rng.shuffle(places);
  const [a1, a2] = rng.shuffle(acts);
  const t = rng.pick(pastTimes(bank));
  const who = rng.pick(people);
  const third = rng.pick(items(bank, 'people', (x) => x.opts.pron === 'he' || x.opts.pron === 'she'));
  const v = {
    place: p1.cols[0], placeZh: p1.cols[1], place2: p2?.cols[0] || '', place2Zh: p2?.cols[1] || '',
    act: a1.cols[0], actZh: a1.cols[1], actBase: a1.opts.base || a1.cols[0], actS: a1.opts.s || a1.cols[0],
    act2: a2?.cols[0] || '', act2Zh: a2?.cols[1] || '',
    time: t.cols[0], timeZh: t.cols[1],
    // {who} 在句型裡是「別人」（he／she），造句時是任何人
    who: third.cols[0], whoZh: third.cols[1] + (third.opts.name ? ' ' : ''), // 英文名字後面空一格：Tina 昨天… pron: third.opts.pron, Pron: cap(third.opts.pron),
  };
  return { v, who };
}

/** 造句的人放進變數：{Who} 開頭大寫、{whoZh} 中文 */
function withSubject(v, who) {
  return { ...v, Who: cap(who.cols[0]), whoZh: who.cols[1] };
}

/** 整句答案的其他寫法：時間詞放到句首（Yesterday, I rode a bike.） */
function sentenceVariants(en, v) {
  const out = [en];
  const t = v.time;
  const endT = ' ' + t + '.';
  if (t && en.endsWith(endT)) {
    const body = en.slice(0, -endT.length);
    const first = body.split(' ')[0];
    const keep = first === 'I' || v.whoIsName;
    const rest = keep ? body : body.charAt(0).toLowerCase() + body.slice(1);
    out.push(cap(t) + ', ' + rest + '.');
  }
  return out;
}

function makeSentence(rng, bank) {
  const { v, who } = scene(rng, bank);
  const vv = { ...withSubject(v, who), whoIsName: !!who.opts.name };
  const tpl = rng.pick(items(bank, 'make'));
  const en = tidy(fillT(tpl.cols[0], vv));
  const zh = fillT(tpl.cols[1] || '', vv).replace(/\s+/g, '');
  return { en, zh: zh.replace(/^([A-Za-z]+)/, '$1 '), answers: sentenceVariants(en, vv) };
}

const SENT_TIP = '整句要注意三件事：每個字拼對、第一個字大寫、句尾加句點（問句加問號）。';

// ---------- 題型 ----------

export const ENGLISH_TYPES = {
  /** A 看圖拼字：圖＋字數提示，寫出地方或做的事（過去式） */
  'en-pic-spell'(rng, cfg) {
    const bank = need(cfg);
    const pool = [...items(bank, 'places'), ...items(bank, 'activities')].filter((x) => x.opts.pic);
    const it = rng.pick(pool);
    const en = it.cols[0];
    const isAct = !!it.opts.base;
    return {
      type: '填答', lang: 'en', image: picUrl(cfg, it.opts.pic), speech: '',
      text: '看圖寫英文' + (isAct ? '（做了什麼事，用過去式）' : '（這是什麼地方）') + '：\n' + letterHint(en),
      answers: [en],
      tip: en + '（' + it.cols[1] + '）' + (isAct ? '。原形是 ' + it.opts.base + '，過去式是 ' + en + '。' : '。'),
    };
  },

  /** C 看圖選字 */
  'en-pic-choose'(rng, cfg) {
    const bank = need(cfg);
    const key = rng.pick(['places', 'activities']);
    const pool = items(bank, key).filter((x) => x.opts.pic);
    const it = rng.pick(pool);
    const others = items(bank, key).filter((x) => x !== it).map((x) => x.cols[0]);
    return {
      type: '選擇', lang: 'en', image: picUrl(cfg, it.opts.pic), speech: '',
      text: key === 'places' ? '看圖選出這是什麼地方：' : '看圖選出他們做了什麼事：',
      options: choice(rng, it.cols[0], others),
      tip: it.cols[0] + ' 是「' + it.cols[1] + '」。',
    };
  },

  /** B 動詞填空：過去式（多數）或 he/she 現在式加 s */
  'en-verb-fill'(rng, cfg) {
    const bank = need(cfg);
    const vb = rng.pick(items(bank, 'verbs'));
    const [base, past, zh] = vb.cols;
    const now = rng.chance(0.25) && nowTimes(bank).length;
    if (now) {
      const who = rng.pick(items(bank, 'people', (x) => x.opts.pron === 'he' || x.opts.pron === 'she'));
      const t = rng.pick(nowTimes(bank));
      return {
        type: '填答', lang: 'en', speech: '',
        text: '填入正確的動詞：\n' + cap(who.cols[0]) + ' ___ ' + (vb.opts.obj || '') + ' ' + t.cols[0] + '.（' + base + '）',
        answers: [vb.opts.s || base + 's'],
        tip: t.cols[0] + '（' + t.cols[1] + '）是現在式，主詞 ' + who.cols[0] + ' 是 ' + who.opts.pron + '，動詞要加 s：' + base + ' → ' + (vb.opts.s || base + 's') + '。',
      };
    }
    const who = rng.pick(items(bank, 'people'));
    const t = rng.pick(pastTimes(bank));
    const subj = who.cols[0] === 'I' || who.opts.name ? who.cols[0] : cap(who.cols[0]);
    return {
      type: '填答', lang: 'en', speech: '',
      text: '填入正確的動詞：\n' + subj + ' ___ ' + (vb.opts.obj || '') + ' ' + t.cols[0] + '.（' + base + '）',
      answers: [past],
      tip: t.cols[0] + '（' + t.cols[1] + '）是過去的時間，要用過去式：' + base + '（' + zh + '）→ ' + past + '，' + (vb.opts.kind || '') + '。過去式不管主詞是誰都一樣。',
    };
  },

  /** B 看圖填地方：I went to the ___ last weekend. */
  'en-place-fill'(rng, cfg) {
    const bank = need(cfg);
    const it = rng.pick(items(bank, 'places').filter((x) => x.opts.pic));
    const t = rng.pick(pastTimes(bank));
    return {
      type: '填答', lang: 'en', image: picUrl(cfg, it.opts.pic), speech: '',
      text: '看圖填空：\nI went to the ___ ' + t.cols[0] + '.',
      answers: [it.cols[0]],
      tip: '圖是' + it.cols[1] + '：' + it.cols[0] + '。I went to the ' + it.cols[0] + ' ' + t.cols[0] + '.（我' + t.cols[1] + '去了' + it.cols[1] + '。）',
    };
  },

  /** C 句型問答：選出正確的回答 */
  'en-pattern-choose'(rng, cfg) {
    const bank = need(cfg);
    const pat = rng.pick(items(bank, 'patterns'));
    const { v } = scene(rng, bank);
    const q = tidy(fillT(pat.cols[0], v));
    const right = tidy(fillT(pat.cols[1], v));
    const wrongs = String(pat.opts.wrong || '').split(';;').map((s) => tidy(fillT(s.trim(), v))).filter(Boolean);
    const ctx = pat.opts.ctx ? fillT(pat.opts.ctx, v) + '\n' : '';
    const isWh = /^(Where|What|When|Who|How)\b/.test(q);
    return {
      type: '選擇', lang: 'en', speech: q,
      text: ctx + q,
      options: choice(rng, right, wrongs),
      tip: isWh
        ? '問「' + q.split(' ')[0] + '」不能用 Yes／No 回答；問句用 did，回答要用過去式：' + right
        : 'Did 開頭的問句，用 Yes, … did. 或 No, … didn\'t. 回答（didn\'t ＝ did not）。正確答案：' + right,
    };
  },

  /** C 軟 c 和硬 c */
  'en-c-sound'(rng, cfg) {
    const bank = need(cfg);
    const soft = items(bank, 'soft-c');
    const hard = items(bank, 'hard-c');
    const mode = rng.int(0, 2);
    if (mode === 2) {
      // 這個字的 c 唸什麼？（只出只有一種 c 的字）
      const isSoft = rng.chance(0.5);
      const w = rng.pick(isSoft ? soft.filter((x) => !x.opts.hard) : hard).cols[0];
      const right = isSoft ? '/s/（軟 c）' : '/k/（硬 c）';
      return {
        type: '選擇', lang: 'en', speech: w,
        text: w + ' 裡的 c 唸什麼音？',
        options: rng.shuffle([{ text: '/s/（軟 c）', correct: isSoft }, { text: '/k/（硬 c）', correct: !isSoft }]),
        tip: (isSoft ? 'c 後面接 e、i、y 唸 /s/：' : 'c 後面接 a、o、u、子音或在字尾唸 /k/：') + w + '。',
      };
    }
    const wantSoft = mode === 0;
    const sample = rng.pick(wantSoft ? soft.filter((x) => !x.opts.hard) : hard).cols[0];
    const rightPool = (wantSoft ? soft : hard).filter((x) => x.cols[0] !== sample);
    const right = rng.pick(rightPool).cols[0];
    // 問硬 c 時，裡面也有硬 c 的軟 c 字（cycle）不能當錯的選項
    const wrongPool = (wantSoft ? hard : soft.filter((x) => !x.opts.hard)).map((x) => x.cols[0]);
    return {
      type: '選擇', lang: 'en', speech: '',
      text: '哪一個字裡的 c 和 ' + sample + ' 的 c 一樣，唸 ' + (wantSoft ? '/s/' : '/k/') + '？',
      options: choice(rng, right, rng.shuffle(wrongPool), 3),
      tip: wantSoft
        ? 'c 後面接 e、i、y 唸 /s/（軟 c），像 ' + sample + '、' + right + '；candy、coat 的 c 唸 /k/。'
        : 'c 後面接 a、o、u、子音或在字尾唸 /k/（硬 c），像 ' + sample + '、' + right + '；city、ice 的 c 唸 /s/。',
    };
  },

  /** D 聽寫：單字片語或整句，網站唸，小孩打出來 */
  'en-dictation'(rng, cfg) {
    const bank = need(cfg);
    if (rng.chance(0.4)) {
      const s = makeSentence(rng, bank);
      return {
        type: '填答', lang: 'en', speech: s.en, speechOnly: true, sentence: true,
        text: '聽寫：按「🔊 聽」，寫出聽到的整句英文。',
        answers: s.answers,
        tip: s.en + '（' + s.zh + '）' + SENT_TIP,
      };
    }
    const pool = [...items(bank, 'places'), ...items(bank, 'activities'), ...items(bank, 'times', (x) => !x.opts.now)];
    const it = rng.pick(pool);
    return {
      type: '填答', lang: 'en', speech: it.cols[0], speechOnly: true,
      text: '聽寫：按「🔊 聽」，寫出聽到的英文。',
      answers: [it.cols[0]],
      tip: it.cols[0] + '（' + it.cols[1] + '）',
    };
  },

  /** E 看中文寫英文：片語（過去式）或整句 */
  'en-zh-en'(rng, cfg) {
    const bank = need(cfg);
    if (rng.chance(0.5)) {
      const s = makeSentence(rng, bank);
      return {
        type: '填答', lang: 'en', speech: '', sentence: true,
        text: '看中文寫英文（寫整句）：\n' + s.zh,
        answers: s.answers,
        tip: s.en + '　' + SENT_TIP + '時間詞放句首或句尾都可以。',
      };
    }
    const isAct = rng.chance(0.65);
    const it = rng.pick(items(bank, isAct ? 'activities' : 'places'));
    return {
      type: '填答', lang: 'en', speech: '',
      text: '看中文寫英文：' + it.cols[1] + (isAct ? '（過去式）' : ''),
      answers: [it.cols[0]],
      tip: it.cols[1] + ' ＝ ' + it.cols[0] + (isAct ? '（原形 ' + it.opts.base + '）' : '') + '。',
    };
  },
};
