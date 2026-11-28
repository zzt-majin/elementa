// games/quiz-race/race.js
// 遊戲帳篷的搶答賽：規則、題庫、一場比賽的計分和計時。
// 純邏輯，不碰畫面、不含題目和小孩資料，瀏覽器和 Node 都能用。
// 參數在 config/game.json；家長在試算表「設定」填的秒數、扣秒、題目來源由外面傳進來（account.settingsOf）。
// 題目由出題模組（engine/generate.js）照關卡的 make 現出，只抽選擇題；手寫題目的關卡也抽它的選擇題。
import { cardState } from '../../engine/cards.js';
import { generateQuestion, parseMake, questionKey } from '../../engine/generate.js';
import { createRng, newSeed } from '../../engine/rng.js';
import { correctText, givenText } from '../../engine/quiz.js';

/** 題目來源的三種代號，和學習卡開放時機的說法一樣 */
export const POOL_RULES = ['always', 'afterQuiz', 'afterPerfect'];

export const RACE_DEFAULTS = {
  seconds: 60,
  wrongPenalty: 3,
  pool: 'afterQuiz',
  sheetValues: { '一開始': 'always', '測驗後': 'afterQuiz', '全對後': 'afterPerfect' },
  secondsRange: [30, 300],
  penaltyRange: [0, 10],
  rightPauseMs: 500,
  wrongPauseMs: 2500,
  readySeconds: 3,
  lowTimeSeconds: 10,
  tickMs: 100,
  levelPrefix: 'game-',
};

const inRange = (v, [lo, hi]) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= lo && Number(v) <= hi;
const range = (v, d) => (Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x))) && Number(v[0]) <= Number(v[1]) ? [Number(v[0]), Number(v[1])] : d);

/** 讀 config/game.json；亂填或沒填的欄位用預設值 */
export function raceSettings(raw = {}) {
  const s = { ...RACE_DEFAULTS, sheetValues: { ...RACE_DEFAULTS.sheetValues } };
  if (!raw || typeof raw !== 'object') return s;
  s.secondsRange = range(raw.secondsRange, s.secondsRange);
  s.penaltyRange = range(raw.penaltyRange, s.penaltyRange);
  if (inRange(raw.seconds, s.secondsRange)) s.seconds = Math.round(Number(raw.seconds));
  if (inRange(raw.wrongPenalty, s.penaltyRange)) s.wrongPenalty = Math.round(Number(raw.wrongPenalty));
  if (POOL_RULES.includes(raw.pool)) s.pool = raw.pool;
  if (raw.sheetValues && typeof raw.sheetValues === 'object') {
    const map = {};
    for (const [k, v] of Object.entries(raw.sheetValues)) if (POOL_RULES.includes(v)) map[String(k).trim()] = v;
    if (Object.keys(map).length) s.sheetValues = map;
  }
  for (const k of ['rightPauseMs', 'wrongPauseMs', 'lowTimeSeconds', 'tickMs']) {
    if (inRange(raw[k], [0, 60000])) s[k] = Number(raw[k]);
  }
  if (s.tickMs < 20) s.tickMs = RACE_DEFAULTS.tickMs;
  if (inRange(raw.readySeconds, [0, 10])) s.readySeconds = Math.round(Number(raw.readySeconds));
  if (typeof raw.levelPrefix === 'string' && /^[a-z0-9-]{1,20}$/.test(raw.levelPrefix)) s.levelPrefix = raw.levelPrefix;
  return s;
}

/**
 * 這個小孩這場用的規則。sheet 是 account.settingsOf(kid)（{ gameSeconds, wrongPenalty, gamePool, … }），沒登入過是 null。
 * 回傳 { seconds, penalty, pool, from }：from 是 'sheet'（有任何一項照試算表）或 'default'。
 */
export function rulesFor(sheet, settings = RACE_DEFAULTS) {
  const s = sheet && typeof sheet === 'object' ? sheet : {};
  let from = 'default';
  let seconds = settings.seconds;
  let penalty = settings.wrongPenalty;
  let pool = settings.pool;
  if (inRange(s.gameSeconds, settings.secondsRange)) { seconds = Math.round(Number(s.gameSeconds)); from = 'sheet'; }
  if (inRange(s.wrongPenalty, settings.penaltyRange)) { penalty = Math.round(Number(s.wrongPenalty)); from = 'sheet'; }
  const p = settings.sheetValues[String(s.gamePool ?? '').trim()];
  if (p) { pool = p; from = 'sheet'; }
  return { seconds, penalty, pool, from };
}

/** 存成績用的代號，例如 game-math（島的代號見 config/subjects.json） */
export const raceId = (islandCode, settings = RACE_DEFAULTS) => settings.levelPrefix + islandCode;

// ---------- 題庫 ----------

/**
 * 一關可以拿來搶答的題目來源。
 * 有 make 的關卡：make 裡出選擇題的題型（看這一關已出好的題目判斷），題數當權重。
 * 手寫題目的關卡：它的選擇題。
 */
export function choiceSources(level) {
  const subject = level?.meta?.subject || '';
  const qs = Array.isArray(level?.questions) ? level.questions : [];
  if (level?.meta?.make) {
    const out = [];
    let parts = [];
    try { parts = parseMake(level.meta.make); } catch { parts = []; }
    for (const { type, count } of parts) {
      if (!qs.some((q) => q.gen === type && q.type === '選擇')) continue;
      const had = out.find((x) => x.type === type);
      if (had) had.weight += count; else out.push({ kind: 'gen', type, weight: count, subject, ...(level.meta.bank ? { bank: level.meta.bank } : {}) });
    }
    return out;
  }
  return qs.filter((q) => q.type === '選擇' && q.options?.some((o) => o.correct)).map((q) => ({ kind: 'fixed', q, subject }));
}

/**
 * 某一關現在在不在搶答賽題庫裡。
 * record：progress.get(kid, id)；rule：rulesFor().pool。
 * 回傳 { inPool, reason }：reason 是 'open'、'noChoice'（都是填答題）、'needQuiz'、'needPerfect'。
 */
export function poolState(level, record, rule) {
  if (!choiceSources(level).length) return { inPool: false, reason: 'noChoice' };
  const st = cardState(level, record, rule);
  if (st.reason === 'empty') return { inPool: false, reason: 'noChoice' };
  return { inPool: st.open, reason: st.reason };
}

/** 這座島現在的題庫：{ levels（放進題庫的關卡）, sources } */
export function buildPool(levels, recordOf, rule) {
  const inPool = levels.filter((l) => poolState(l, recordOf(l), rule).inPool);
  return { levels: inPool, sources: inPool.flatMap(choiceSources) };
}

/**
 * 抽題機：題型照權重放進袋子，抽完一袋再洗下一袋，所以每種題型輪得到；
 * 同一場不出一模一樣的題目（手寫的題目一輪抽完才會再出現）。
 * cfgOf(subject, source)：那一科的數字範圍（config/generators/*.json）；英語的 source.bank 是教材檔代號。
 */
export function createDrawer(sources, { seed = newSeed(), cfgOf = () => ({}) } = {}) {
  if (!sources.length) throw new Error('題庫是空的');
  const rng = createRng(seed);
  const seen = new Set();
  const fixedKeys = sources.filter((s) => s.kind === 'fixed').map((s) => questionKey(s.q));
  let bag = [];
  const refill = () => {
    const all = [];
    for (const s of sources) for (let k = 0; k < (s.kind === 'gen' ? Math.max(1, s.weight) : 1); k++) all.push(s);
    for (const key of fixedKeys) seen.delete(key); // 手寫題目新的一輪
    bag = rng.shuffle(all);
  };
  return {
    seed,
    next() {
      let fallback = null;
      for (let t = 0; t < 40; t++) {
        if (!bag.length) refill();
        const s = bag.pop();
        const q = s.kind === 'gen'
          ? generateQuestion(s.type, rng, cfgOf(s.subject, s))
          : { ...s.q, options: rng.shuffle(s.q.options) };
        if (q.type !== '選擇') continue;
        const key = questionKey(q);
        if (seen.has(key)) { fallback = fallback || q; continue; }
        seen.add(key);
        return { ...q, subject: s.subject };
      }
      if (fallback) return { ...fallback };
      throw new Error('題庫抽不出選擇題');
    },
  };
}

// ---------- 一場比賽 ----------
// 時間一律用「毫秒時間戳」傳進來（now），方便測試，平板切到背景再回來也不會多給時間。
// 答完一題後到下一題出現前，時鐘暫停（看正確答案的時間不算），扣秒照設定扣。

/** 開始一場。draw()：回傳下一題（createDrawer().next） */
export function createRace({ seconds, penalty, draw, now = Date.now() }) {
  const race = {
    seconds,
    penalty,
    draw,
    startedAt: now,
    deadline: now + seconds * 1000,
    pausedAt: null,
    score: 0,
    streak: 0,
    bestStreak: 0,
    answered: 0,
    penaltyTotal: 0,
    log: [],
    current: null,
    waiting: false,
    finished: false,
  };
  race.current = draw();
  return race;
}

/** 剩下幾秒（可能有小數，最小 0）；暫停中不會變少 */
export function raceLeft(race, now = Date.now()) {
  const at = race.pausedAt ?? now;
  return Math.max(0, (race.deadline - at) / 1000);
}

export const raceOver = (race, now = Date.now()) => race.finished || raceLeft(race, now) <= 0;

/**
 * 回答目前這題（選項位置，0 起算）。回傳 { ok, right, cut }，cut 是這次扣了幾秒。
 * 答完時鐘暫停，等 nextQuestion() 才繼續。時間已到、已經答過這題就回傳 null。
 */
export function answerRace(race, index, now = Date.now()) {
  if (race.finished || race.waiting || raceLeft(race, now) <= 0) return null;
  const q = race.current;
  const right = q.options.findIndex((o) => o.correct);
  const ok = Number(index) === right;
  race.answered++;
  let cut = 0;
  if (ok) {
    race.score++;
    race.streak++;
    race.bestStreak = Math.max(race.bestStreak, race.streak);
  } else {
    race.streak = 0;
    cut = Math.min(race.penalty, raceLeft(race, now));
    race.deadline -= race.penalty * 1000;
    race.penaltyTotal += cut;
  }
  race.log.push({ question: q, given: Number(index), ok, givenText: givenText(q, Number(index)), rightText: correctText(q), cut });
  race.waiting = true;
  race.pausedAt = now;
  return { ok, right, cut };
}

/** 時鐘繼續、換下一題。時間已經用完就回傳 null（該結束了） */
export function nextQuestion(race, now = Date.now()) {
  if (race.pausedAt !== null) { race.deadline += now - race.pausedAt; race.pausedAt = null; }
  race.waiting = false;
  if (race.finished || raceLeft(race, now) <= 0) return null;
  race.current = race.draw();
  return race.current;
}

/** 結束這一場，回傳成績。畫面上正在出、還沒回答的那題不算 */
export function finishRace(race, now = Date.now()) {
  race.finished = true;
  return {
    score: race.score,
    total: race.answered,
    bestStreak: race.bestStreak,
    seconds: race.seconds,
    penalty: race.penalty,
    penaltyTotal: race.penaltyTotal,
    used: race.seconds,
    limit: race.seconds,
    timeUp: true,
    retry: false,
    perfect: false, // 搶答賽沒有「全對」，不影響測驗塔和學習屋
    at: new Date(now).toISOString(),
    items: race.log,
    wrongs: race.log.filter((x) => !x.ok),
  };
}

/** 有答題才記成績（後台不收 0 題） */
export const shouldRecord = (result) => result.total > 0;

/**
 * 送到後台、給 hooks.onResult 的精簡紀錄。kind: 'game' 讓後台記成「搶答賽」。
 * meta：{ id, kid, grade, subject, name }
 */
export function raceSummary(result, meta) {
  return {
    kind: 'game',
    kid: meta.kid || '',
    level: meta.id,
    levelName: meta.name || '',
    grade: meta.grade || '',
    subject: meta.subject || '',
    source: meta.source || '',
    at: result.at,
    score: result.score,
    total: result.total,
    used: result.used,
    limit: result.limit,
    timeUp: true,
    retry: false,
    bestStreak: result.bestStreak,
    items: result.items.map((x, i) => ({ n: String(i + 1), ok: x.ok, given: x.givenText, right: x.rightText, gen: x.question.gen || '' })),
  };
}
