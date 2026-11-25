// engine/quiz.js
// 測驗引擎：出一場測驗、記答案、計時、判分、挑出錯題重練。
// 純邏輯，不碰畫面、不含題目和小孩名字，瀏覽器和 Node 都能用。
// 時間一律用「毫秒時間戳」傳進來（now），方便測試，也不受分頁休眠影響。

/** 預設參數；實際值從 config/quiz.json 讀，沒填的才用這裡的 */
export const QUIZ_DEFAULTS = {
  minutesPerQuestion: 1,        // 關卡沒填 minutes 時，一題幾分鐘
  retrySecondsPerQuestion: 60,  // 錯題重練時，一題幾秒
  lowTimeSeconds: 60,           // 剩下幾秒時時鐘變紅
  tickMs: 250,                  // 時鐘多久更新一次
  warnBlankOnSubmit: true,      // 有空白題時，交卷要按兩次
};

export function quizSettings(config = {}) {
  const s = { ...QUIZ_DEFAULTS };
  for (const k of Object.keys(QUIZ_DEFAULTS)) {
    const v = config[k];
    if (typeof QUIZ_DEFAULTS[k] === 'number' && Number.isFinite(Number(v)) && Number(v) > 0) s[k] = Number(v);
    if (typeof QUIZ_DEFAULTS[k] === 'boolean' && typeof v === 'boolean') s[k] = v;
  }
  return s;
}

// ---------- 判分 ----------

/** 全形轉半形、去掉空白和千分位逗號、英文轉小寫 */
export function normalizeAnswer(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/\s+/g, '')
    .replace(/,/g, '')
    .toLowerCase();
}

const isBlank = (v) => v === undefined || v === null || v === '';

/**
 * 這一題答對了嗎？
 * 選擇題 given 是選項的位置（0 起算）；填答題 given 是小孩打的字。
 * 填答題：整理後和任一個標準答案相同，或兩邊都是數字且相等，就算對。
 * 分數不會自動約分比對（9/10 和 18/20 不同），要接受的寫法請在關卡檔用 | 列出。
 */
export function isCorrect(q, given) {
  if (isBlank(given)) return false;
  if (q.type === '選擇') {
    const i = q.options.findIndex((o) => o.correct);
    return Number(given) === i;
  }
  const g = normalizeAnswer(given);
  if (!g) return false;
  return q.answers.some((a) => {
    const n = normalizeAnswer(a);
    if (n === g) return true;
    const x = Number(n);
    const y = Number(g);
    return n !== '' && Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) < 1e-9;
  });
}

/** 正確答案要怎麼顯示 */
export function correctText(q) {
  if (q.type === '選擇') return (q.options.find((o) => o.correct) || {}).text || '';
  return (q.answers[0] || '') + (q.unit ? ' ' + q.unit : '');
}

/** 小孩的答案要怎麼顯示；沒寫回傳空字串 */
export function givenText(q, given) {
  if (isBlank(given)) return '';
  if (q.type === '選擇') return (q.options[Number(given)] || {}).text || '';
  return String(given);
}

// ---------- 一場測驗 ----------

/** 整關的限時（秒）：關卡有填 minutes 就用，沒填就照題數算 */
export function levelLimitSeconds(level, settings = QUIZ_DEFAULTS) {
  const m = Number.isFinite(level.meta.minutes) && level.meta.minutes > 0
    ? level.meta.minutes
    : Math.max(1, level.questions.length) * settings.minutesPerQuestion;
  return Math.round(m * 60);
}

/**
 * 開一場測驗。
 * only：錯題重練時傳入要練的題目位置（0 起算）；不傳就是整關。
 */
export function createSession(level, { only = null, now = Date.now(), settings = QUIZ_DEFAULTS } = {}) {
  if (!level || !level.questions.length) throw new Error('這一關還沒有題目');
  const order = only && only.length
    ? only.filter((i) => i >= 0 && i < level.questions.length)
    : level.questions.map((_, i) => i);
  const retry = !!(only && only.length);
  const limit = retry ? order.length * settings.retrySecondsPerQuestion : levelLimitSeconds(level, settings);
  return {
    levelId: level.meta.id,
    order,
    answers: {},
    current: 0,
    retry,
    limit,
    startedAt: now,
    deadline: now + limit * 1000,
    finished: false,
  };
}

/** 記下目前這題（或指定題）的答案；字串會去掉頭尾空白 */
export function setAnswer(session, value, qIndex = session.order[session.current]) {
  if (session.finished) return session;
  session.answers[qIndex] = typeof value === 'string' ? value.trim() : value;
  return session;
}

/** 換到第 n 題（依出題順序，0 起算） */
export function goTo(session, n) {
  if (n >= 0 && n < session.order.length) session.current = n;
  return session;
}

export const answered = (session, qIndex) => !isBlank(session.answers[qIndex]);
export const blankCount = (session) => session.order.filter((i) => !answered(session, i)).length;

/** 剩下幾秒（可能有小數，最小 0） */
export function secondsLeft(session, now = Date.now()) {
  return Math.max(0, (session.deadline - now) / 1000);
}

/** 判分並結束這一場。之後再改答案不會有效果。 */
export function grade(session, level, { now = Date.now(), timeUp = false } = {}) {
  session.finished = true;
  const used = Math.min(session.limit, Math.max(0, Math.round((now - session.startedAt) / 1000)));
  const items = session.order.map((index) => {
    const q = level.questions[index];
    const given = session.answers[index];
    return {
      index,
      no: q.no,
      question: q,
      given,
      givenText: givenText(q, given),
      rightText: correctText(q),
      ok: isCorrect(q, given),
    };
  });
  const score = items.filter((x) => x.ok).length;
  return {
    levelId: level.meta.id,
    score,
    total: items.length,
    perfect: score === items.length,
    used,
    limit: session.limit,
    timeUp: !!timeUp,
    retry: session.retry,
    at: new Date(now).toISOString(),
    items,
  };
}

/** 錯題重練要練哪幾題（題目位置） */
export const wrongIndices = (result) => result.items.filter((x) => !x.ok).map((x) => x.index);

/** 存檔或送到後台用的精簡版（不含題目全文） */
export function resultSummary(result, level) {
  return {
    kid: level.meta.kid || '',
    level: level.meta.id,
    levelName: level.meta.name || '',
    grade: level.meta.grade || '',
    subject: level.meta.subject || '',
    source: level.meta.source || '',
    at: result.at,
    score: result.score,
    total: result.total,
    used: result.used,
    limit: result.limit,
    timeUp: result.timeUp,
    retry: result.retry,
    items: result.items.map((x) => ({ n: x.no, ok: x.ok, given: x.givenText, right: x.rightText })),
  };
}

// ---------- 計時 ----------

/**
 * 倒數計時器。每 tickMs 呼叫 onTick(剩下秒數)，時間到呼叫一次 onEnd()。
 * 用截止時間算剩餘時間，平板切到背景再回來也不會多給時間。
 * clock 可以換掉（測試用）。
 */
export function createCountdown(session, { onTick, onEnd, tickMs = QUIZ_DEFAULTS.tickMs, clock = defaultClock } = {}) {
  let id = null;
  let ended = false;
  const step = () => {
    const left = secondsLeft(session, clock.now());
    if (onTick) onTick(left);
    if (left <= 0 && !ended) {
      ended = true;
      stop();
      if (onEnd) onEnd();
    }
  };
  function stop() { if (id !== null) { clock.clear(id); id = null; } }
  id = clock.every(step, tickMs);
  step();
  return { stop, check: step };
}

const defaultClock = {
  now: () => Date.now(),
  every: (fn, ms) => setInterval(fn, ms),
  clear: (id) => clearInterval(id),
};

/** 秒數變成 m:ss（無條件進位，剩 0.3 秒顯示 0:01） */
export function mmss(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
