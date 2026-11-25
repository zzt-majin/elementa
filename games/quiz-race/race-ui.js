// games/quiz-race/race-ui.js
// 搶答賽的畫面：準備、3-2-1、作答、結束。規則全在 race.js，這裡只負責畫出來和接按鈕。
// 畫面文字從 config/text.json 的 race 區讀；題目文字一律用 textContent，不會被當成 HTML。
import { createRace, raceLeft, raceOver, answerRace, nextQuestion, finishRace } from './race.js';
import { mmss } from '../../engine/quiz.js';

/**
 * root：放搶答賽畫面的元素（index.html 的 #game）。
 * settings：raceSettings() 的回傳。
 * onResult(result)：一場結束時呼叫，回傳 { record, improved, firstTry, saved }（saved=false 表示沒有記成績）。
 * onClose()：按「回到遊戲帳篷」時呼叫。
 * onOpenChange(open)：畫面打開或關上時呼叫（3D 場景可以趁這時暫停）。
 * clock：測試時可以換掉的時鐘 { now(), every(fn, ms), clear(id), later(fn, ms), cancel(id) }。
 */
export function createRaceUI(root, { text, settings, onResult, onClose, onOpenChange, clock = defaultClock }) {
  const T = text.race;
  const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
  let setup = null;
  let race = null;
  let ticker = null;
  let timer = null; // 答完一題後，等一下才出下一題
  let confirmLeave = false;
  let screen = ''; // 'ready' | 'count' | 'play' | 'end'
  let els = {};

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }
  function button(label, cls, onClick) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function show(nodes) {
    const wrap = el('div', 'race-wrap');
    wrap.append(...nodes);
    root.replaceChildren(wrap);
    if (root.hidden) {
      root.hidden = false;
      document.addEventListener('keydown', onKey);
      onOpenChange?.(true);
    }
  }
  function stopAll() {
    if (ticker !== null) { clock.clear(ticker); ticker = null; }
    if (timer !== null) { clock.cancel(timer); timer = null; }
  }
  function hide() {
    stopAll();
    race = null;
    screen = '';
    root.hidden = true;
    root.replaceChildren();
    document.removeEventListener('keydown', onKey);
    onOpenChange?.(false);
  }
  function leave() { hide(); onClose?.(); }

  // ---------- 準備 ----------

  /**
   * setup：{ title, rules: { seconds, penalty }, poolLevels, makeDrawer(), best() }
   */
  function open(s) {
    setup = s;
    drawReady();
  }

  function ruleLines() {
    const { seconds, penalty } = setup.rules;
    return [
      fill(T.ruleTime, { s: seconds }),
      penalty > 0 ? fill(T.rulePenalty, { p: penalty }) : T.ruleNoPenalty,
      T.ruleStreak,
    ];
  }

  function drawReady() {
    screen = 'ready';
    stopAll();
    const bar = el('div', 'quiz-bar');
    bar.append(el('h2', '', setup.title));
    const card = el('section', 'quiz-card race-ready');
    const ul = el('ul', 'race-rules');
    for (const line of ruleLines()) ul.append(el('li', '', line));
    card.append(ul, el('p', 'muted', fill(T.poolLine, { n: setup.poolLevels })));
    const best = setup.best?.();
    card.append(el('p', 'race-best', best ? fill(T.bestLine, { n: best.best }) : T.bestNone));
    const actions = el('div', 'actions');
    actions.append(button(T.start, 'btn race-go', countdown), button(T.leave, 'btn ghost', leave));
    show([bar, card, actions]);
    actions.firstChild.focus();
  }

  function countdown() {
    let n = settings.readySeconds;
    if (!n) { go(); return; }
    screen = 'count';
    const big = el('div', 'race-count', String(n));
    big.setAttribute('aria-live', 'assertive');
    show([el('div', 'quiz-bar'), big]);
    root.querySelector('.quiz-bar').append(el('h2', '', setup.title));
    const step = () => {
      n--;
      if (screen !== 'count') return;
      if (n <= 0) { timer = null; go(); return; }
      big.textContent = String(n);
      timer = clock.later(step, 1000);
    };
    timer = clock.later(step, 1000);
  }

  // ---------- 作答 ----------

  function go() {
    let drawer;
    try { drawer = setup.makeDrawer(); } catch (err) { console.error(err); drawReady(); return; }
    race = createRace({ seconds: setup.rules.seconds, penalty: setup.rules.penalty, draw: () => drawer.next(), now: clock.now() });
    confirmLeave = false;
    screen = 'play';
    drawPlay();
    ticker = clock.every(tick, settings.tickMs);
  }

  function tick() {
    if (!race || screen !== 'play') return;
    const left = raceLeft(race, clock.now());
    if (els.clock) {
      els.clock.textContent = mmss(left);
      els.clock.classList.toggle('low', left <= settings.lowTimeSeconds);
    }
    if (!race.waiting && raceOver(race, clock.now())) end();
  }

  function drawPlay() {
    const q = race.current;
    const bar = el('div', 'quiz-bar race-bar');
    const stats = el('div', 'race-stats');
    els.score = el('span', 'race-score', fill(T.score, { n: race.score }));
    els.streak = el('span', 'race-streak', race.streak >= 2 ? fill(T.streak, { n: race.streak }) : '');
    stats.append(els.score, els.streak);
    els.clock = el('div', 'clock');
    els.clock.setAttribute('role', 'timer');
    els.clock.setAttribute('aria-label', T.timeLeft);
    bar.append(stats, els.clock);

    const card = el('section', 'quiz-card race-card');
    card.append(el('p', 'muted', fill(T.counter, { n: race.answered + 1 })), el('p', 'prompt', q.text));
    const opts = el('div', 'opts race-opts');
    q.options.forEach((o, k) => {
      const b = button(o.text, 'opt', () => pick(k));
      b.dataset.key = String(k + 1);
      opts.append(b);
    });
    card.append(opts);
    els.opts = opts;
    els.feedback = el('div', 'race-feedback');
    els.feedback.setAttribute('aria-live', 'polite');
    card.append(els.feedback);

    const extra = el('div', 'side');
    extra.append(button(confirmLeave ? T.leaveConfirm : T.quit, 'btn ghost small', (e) => {
      if (confirmLeave) { leave(); return; }
      confirmLeave = true;
      if (race.waiting) e.currentTarget.textContent = T.leaveConfirm; // 正在看答案時不重畫，只換字
      else drawPlay();
    }));
    const nodes = [bar, card, extra];
    if (confirmLeave) nodes.splice(2, 0, el('p', 'warn', T.quitWarn));
    show(nodes);
    tick();
    opts.firstChild?.focus({ preventScroll: true });
  }

  function pick(k) {
    if (!race || screen !== 'play') return;
    const r = answerRace(race, k, clock.now());
    if (!r) return;
    const buttons = [...els.opts.children];
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === r.right) b.classList.add('right');
      else if (i === k) b.classList.add('wrong');
    });
    els.score.textContent = fill(T.score, { n: race.score });
    els.streak.textContent = race.streak >= 2 ? fill(T.streak, { n: race.streak }) : '';
    tick();
    els.feedback.replaceChildren();
    if (r.ok) {
      els.feedback.append(el('p', 'race-ok', race.streak >= 2 ? fill(T.rightStreak, { n: race.streak }) : T.right));
    } else {
      const p = el('p', 'race-bad');
      p.append(T.wrong + T.rightAnswer, el('b', '', race.log[race.log.length - 1].rightText));
      if (r.cut > 0) p.append(el('span', 'race-cut', fill(T.cut, { p: r.cut })));
      const nextBtn = button(T.next, 'btn', proceed);
      els.feedback.append(p, nextBtn);
      nextBtn.focus({ preventScroll: true });
    }
    timer = clock.later(proceed, r.ok ? settings.rightPauseMs : settings.wrongPauseMs);
  }

  function proceed() {
    if (timer !== null) { clock.cancel(timer); timer = null; }
    if (!race || screen !== 'play' || !race.waiting) return;
    const q = nextQuestion(race, clock.now());
    if (!q) { end(); return; }
    drawPlay();
  }

  // ---------- 結束 ----------

  function end() {
    if (!race || screen !== 'play') return;
    stopAll();
    screen = 'end';
    const result = finishRace(race, clock.now());
    let info = {};
    try { info = onResult?.(result) || {}; } catch (err) { console.error(err); }
    drawEnd(result, info);
  }

  function drawEnd(r, info) {
    const bar = el('div', 'quiz-bar');
    bar.append(el('h2', '', setup.title));
    const card = el('section', 'quiz-card result race-end');
    card.append(el('p', 'race-timeup', T.timeUp));
    const score = el('div', 'score');
    const big = el('div', 'big', String(r.score));
    big.append(el('small', '', ' ' + T.unit));
    score.append(big);
    const isRecord = info.saved !== false && info.improved && r.score > 0;
    if (isRecord) score.append(el('div', 'stamp', info.firstTry ? T.firstRecord : T.newRecord));
    card.append(score);
    card.append(el('p', '', fill(T.endLine, { total: r.total, n: r.score, streak: r.bestStreak })));
    if (r.penaltyTotal > 0) card.append(el('p', 'muted', fill(T.endPenalty, { p: Math.round(r.penaltyTotal) })));
    if (info.saved === false) card.append(el('p', 'muted', T.notSaved));
    else if (info.record && !isRecord) card.append(el('p', 'muted', fill(T.bestLine, { n: info.record.best })));

    const actions = el('div', 'actions');
    actions.append(button(T.again, 'btn', countdown), button(T.leave, 'btn ghost', leave));

    const nodes = [bar, card, actions];
    if (r.wrongs.length) {
      nodes.push(el('h3', 'race-review-title', fill(T.reviewTitle, { n: r.wrongs.length })));
      const list = el('ol', 'review');
      for (const x of r.wrongs) {
        const li = el('li', 'bad');
        li.append(el('h3', '', x.question.text));
        const ans = el('p', 'ans');
        ans.append(T.yourAnswer, el('b', 'r', x.givenText), '　' + T.rightAnswer, el('b', 'g', x.rightText));
        const tip = el('p', 'tip');
        tip.append(el('strong', '', T.tip), '　' + x.question.tip);
        li.append(ans, tip);
        list.append(li);
      }
      nodes.push(list);
    } else if (r.total) {
      nodes.push(el('p', 'race-allright', T.allRight));
    }
    show(nodes);
    root.scrollTop = 0;
    actions.firstChild.focus();
  }

  function onKey(e) {
    if (root.hidden) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (screen === 'play' && race) {
      const n = Number(e.key);
      if (!race.waiting && n >= 1 && n <= race.current.options.length) { e.preventDefault(); pick(n - 1); return; }
      if (race.waiting && e.key === 'Enter') { e.preventDefault(); proceed(); }
    }
  }

  // 平板切回前景時馬上檢查一次時間
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  return {
    open,
    close: hide,
    get isOpen() { return !root.hidden; },
    get screen() { return screen; },
  };
}

const defaultClock = {
  now: () => Date.now(),
  every: (fn, ms) => setInterval(fn, ms),
  clear: (id) => clearInterval(id),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (id) => clearTimeout(id),
};
