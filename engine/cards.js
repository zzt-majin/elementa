// engine/cards.js
// 學習屋（學習卡）的規則：什麼時候打開、一關有哪些卡、一輪看卡的進度。
// 純邏輯，不碰畫面、不含題目和小孩資料，瀏覽器和 Node 都能用。
// 參數在 config/cards.json；家長在試算表「設定」填的「學習卡開放」由外面傳進來。
import { correctText } from './quiz.js';

/** 三種開放時機的代號。試算表上的中文說法對應到哪一個，寫在 config/cards.json 的 sheetValues */
export const RULES = ['always', 'afterQuiz', 'afterPerfect'];

export const CARD_DEFAULTS = {
  defaultRule: 'afterQuiz',
  sheetValues: { '一開始': 'always', '測驗後': 'afterQuiz', '全對後': 'afterPerfect' },
  showOptions: true,
  shuffle: false,
};

/** 讀 config/cards.json；亂填或沒填的欄位用預設值 */
export function cardSettings(raw = {}) {
  const s = { ...CARD_DEFAULTS, sheetValues: { ...CARD_DEFAULTS.sheetValues } };
  if (!raw || typeof raw !== 'object') return s;
  if (RULES.includes(raw.defaultRule)) s.defaultRule = raw.defaultRule;
  if (raw.sheetValues && typeof raw.sheetValues === 'object') {
    const map = {};
    for (const [k, v] of Object.entries(raw.sheetValues)) if (RULES.includes(v)) map[String(k).trim()] = v;
    if (Object.keys(map).length) s.sheetValues = map;
  }
  if (typeof raw.showOptions === 'boolean') s.showOptions = raw.showOptions;
  if (typeof raw.shuffle === 'boolean') s.shuffle = raw.shuffle;
  return s;
}

/**
 * 這個小孩現在用哪一種開放時機。
 * sheet：account.settingsOf(kid) 的回傳（{ cards: '測驗後', … }），沒登入過是 null。
 * 回傳 { rule, from }：from 是 'sheet'（照試算表）或 'default'（照 config/cards.json）。
 */
export function ruleFor(sheet, settings = CARD_DEFAULTS) {
  const v = sheet && typeof sheet === 'object' ? String(sheet.cards ?? '').trim() : '';
  const rule = settings.sheetValues[v];
  return rule ? { rule, from: 'sheet' } : { rule: settings.defaultRule, from: 'default' };
}

/**
 * 某一關的學習卡現在能不能看。
 * record：progress.get(kid, id) 的回傳（{ best, used, total, perfectAt }），沒寫過是 null。
 * 回傳 { open, reason }：reason 是
 *   'empty'（關卡還沒有題目）、'open'、'needQuiz'（要先寫測驗）、'needPerfect'（要先全對）。
 */
export function cardState(level, record, rule) {
  const total = level?.questions?.length || 0;
  if (!total) return { open: false, reason: 'empty' };
  if (rule === 'always') return { open: true, reason: 'open' };
  const tried = !!record && Number.isFinite(Number(record.best));
  if (rule === 'afterPerfect') {
    return tried && Number(record.best) >= total ? { open: true, reason: 'open' } : { open: false, reason: 'needPerfect' };
  }
  return tried ? { open: true, reason: 'open' } : { open: false, reason: 'needQuiz' };
}

/**
 * 一關的學習卡：每一題一張。
 * 正面是題目（選擇題附選項），背面是正確答案和解題技巧。
 */
export function buildCards(level, settings = CARD_DEFAULTS) {
  return (level?.questions || []).map((q, i) => ({
    index: i,
    no: q.no,
    front: q.text,
    options: settings.showOptions && q.type === '選擇' ? q.options.map((o) => o.text) : [],
    answer: correctText(q),
    tip: q.tip,
    speech: q.speech || '',
  }));
}

// ---------- 一輪看卡 ----------

/**
 * 開始看一輪卡。only：只看這幾張（卡片的 index 陣列），例如「再看一次」的那幾張。
 * random：0～1 的亂數函式，測試時可以換掉。
 */
export function createDeck(cards, { only = null, shuffle = false, random = Math.random } = {}) {
  let order = only ? only.filter((i) => i >= 0 && i < cards.length) : cards.map((_, i) => i);
  if (!order.length) order = cards.map((_, i) => i);
  if (shuffle) order = shuffled(order, random);
  return { cards, order, current: 0, flipped: false, marks: {} };
}

function shuffled(arr, random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const currentCard = (deck) => deck.cards[deck.order[deck.current]];

export function flip(deck) { deck.flipped = !deck.flipped; return deck; }

export function moveTo(deck, n) {
  if (n < 0 || n >= deck.order.length) return deck;
  deck.current = n;
  deck.flipped = false;
  return deck;
}

/** 在目前這張做記號：'known'（我會了）或 'again'（再看一次），然後換下一張 */
export function mark(deck, value) {
  if (value !== 'known' && value !== 'again') return deck;
  deck.marks[deck.order[deck.current]] = value;
  if (deck.current < deck.order.length - 1) moveTo(deck, deck.current + 1);
  return deck;
}

/** 這一輪每張都做過記號了嗎 */
export const allMarked = (deck) => deck.order.every((i) => deck.marks[i]);

/** 這一輪的結果：{ known, again, unmarked, againList } */
export function deckSummary(deck) {
  const out = { known: 0, again: 0, unmarked: 0, againList: [] };
  for (const i of deck.order) {
    const m = deck.marks[i];
    if (m === 'known') out.known++;
    else if (m === 'again') { out.again++; out.againList.push(i); }
    else out.unmarked++;
  }
  return out;
}
