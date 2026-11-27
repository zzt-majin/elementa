// world/quiz-ui.js
// 測驗塔的作答畫面和成績畫面。規則全在 engine/quiz.js，這裡只負責畫出來和接按鈕。
// 畫面文字從 config/text.json 的 quiz 區讀；從關卡檔來的文字一律用 textContent，不會被當成 HTML。
import {
  createSession, setAnswer, goTo, answered, blankCount, secondsLeft,
  grade, wrongIndices, createCountdown, mmss,
} from '../engine/quiz.js';

/**
 * root：放測驗畫面的元素（index.html 的 #quiz）。
 * onResult(result, level)：交卷後呼叫，回傳要顯示的額外資訊（例如 { improved, record }）。
 * onClose()：按「回到測驗塔」時呼叫。
 * onOpenChange(open)：測驗畫面打開或關上時呼叫（3D 場景可以趁這時暫停）。
 * refresh(level)：按「整關再挑戰」時呼叫，回傳同一關的新題目（出題模組用）；不給就用原來的題目。
 */
export function createQuizUI(root, { text, settings, onResult, onClose, onOpenChange, refresh }) {
  const T = text.quiz;
  const fill = (s, vals) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
  let level = null;
  let session = null;
  let countdown = null;
  let confirm = null; // 'submit' | 'restart' | 'leave'：再按一次才會執行
  let lastResult = null;
  let backLabel = ''; // 成績畫面「回到…」按鈕的字；從學習屋來的測驗會換成「回到學習屋」

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }
  function button(label, cls, onClick, { disabled = false } = {}) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function show(nodes) {
    root.replaceChildren(el('div', 'quiz-wrap'));
    root.firstChild.append(...nodes);
    if (root.hidden) { root.hidden = false; onOpenChange?.(true); }
  }
  function hide() {
    stopClock();
    root.hidden = true;
    root.replaceChildren();
    onOpenChange?.(false);
  }
  function stopClock() { if (countdown) { countdown.stop(); countdown = null; } }

  // ---------- 作答 ----------

  function start(lv, { only = null, backLabel: back } = {}) {
    stopClock();
    if (back !== undefined) backLabel = back || '';
    level = lv;
    session = createSession(lv, { only, settings });
    confirm = null;
    drawQuiz();
    countdown = createCountdown(session, {
      tickMs: settings.tickMs,
      onTick: updateClock,
      onEnd: () => finish(true),
    });
  }

  let clockEl = null;
  function updateClock(left) {
    if (!clockEl) return;
    clockEl.textContent = mmss(left);
    clockEl.classList.toggle('low', left <= settings.lowTimeSeconds);
  }

  function drawQuiz({ focus = true } = {}) {
    const n = session.order.length;
    const qi = session.order[session.current];
    const q = level.questions[qi];

    const bar = el('div', 'quiz-bar');
    const title = el('h2', '', level.meta.name);
    if (session.retry) title.append(el('span', 'tag', T.retryTag));
    clockEl = el('div', 'clock');
    clockEl.setAttribute('role', 'timer');
    clockEl.setAttribute('aria-label', T.timeLeft);
    // 上方右邊：重新開始、離開、交卷，最右邊是計時
    const tools = el('div', 'quiz-tools');
    tools.append(
      button(T.restart, 'btn ghost small', () => ask('restart', () => start(level, { only: session.retry ? session.order : null }))),
      button(T.leave, 'btn ghost small', () => ask('leave', () => { hide(); onClose?.(); })),
      button(T.submit, 'btn submit', trySubmit),
      clockEl,
    );
    bar.append(title, tools);
    updateClock(secondsLeft(session));

    const dots = el('div', 'dots');
    dots.setAttribute('role', 'group');
    dots.setAttribute('aria-label', T.questionNumbers);
    session.order.forEach((k, i) => {
      const d = button(String(i + 1), (answered(session, k) ? 'done ' : '') + (i === session.current ? 'cur' : ''), () => move(i));
      d.setAttribute('aria-label', fill(T.questionN, { n: i + 1 }));
      if (i === session.current) d.setAttribute('aria-current', 'step');
      dots.append(d);
    });

    const card = el('section', 'quiz-card');
    card.append(el('p', 'muted', fill(T.counter, { n: session.current + 1, total: n })), el('p', 'prompt', q.text));
    let input = null;
    if (q.type === '選擇') {
      const opts = el('div', 'opts');
      q.options.forEach((o, k) => {
        const b = button(o.text, 'opt', () => { setAnswer(session, k); confirm = null; drawQuiz({ focus: false }); focusOption(k); });
        b.setAttribute('aria-pressed', String(session.answers[qi] === k));
        opts.append(b);
      });
      card.append(opts);
    } else {
      const row = el('div', 'fill');
      const label = el('label', '', T.answerLabel);
      input = el('input');
      input.id = 'quiz-answer';
      label.htmlFor = input.id;
      input.autocomplete = 'off';
      input.inputMode = 'decimal';
      input.spellcheck = false;
      input.value = session.answers[qi] ?? '';
      input.addEventListener('input', () => {
        setAnswer(session, input.value);
        confirm = null;
        dots.children[session.current].classList.toggle('done', answered(session, qi));
        warnBox.replaceChildren();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (session.current < n - 1) move(session.current + 1); }
      });
      row.append(label, input);
      if (q.unit) row.append(el('span', '', q.unit));
      card.append(row);
    }

    const warnBox = el('div', 'warns');
    warnBox.setAttribute('aria-live', 'polite');
    if (confirm === 'submit') warnBox.append(el('p', 'warn', fill(T.blankWarn, { n: blankCount(session) })));
    if (confirm === 'restart') warnBox.append(el('p', 'warn', T.restartWarn));
    if (confirm === 'leave') warnBox.append(el('p', 'warn', T.leaveWarn));

    const nav = el('div', 'quiz-nav');
    const side = el('div', 'side');
    side.append(
      button(T.prev, 'btn ghost', () => move(session.current - 1), { disabled: session.current === 0 }),
      button(T.next, 'btn ghost', () => move(session.current + 1), { disabled: session.current === n - 1 }),
    );
    nav.append(side);

    // 提醒（還有幾題沒寫、確定要重新開始嗎…）放在按鈕下面，按了馬上看得到
    show([bar, warnBox, dots, card, nav]);
    if (focus && input) input.focus();
  }

  function focusOption(k) {
    const b = root.querySelectorAll('.opt')[k];
    if (b) b.focus();
  }

  function move(i) {
    if (i < 0 || i >= session.order.length) return;
    goTo(session, i);
    confirm = null;
    drawQuiz();
  }

  function ask(kind, run) {
    if (confirm === kind) { confirm = null; run(); return; }
    confirm = kind;
    drawQuiz({ focus: false });
  }

  function trySubmit() {
    if (settings.warnBlankOnSubmit && blankCount(session) > 0 && confirm !== 'submit') {
      confirm = 'submit';
      drawQuiz({ focus: false });
      return;
    }
    finish(false);
  }

  function finish(timeUp) {
    if (!session || session.finished) return;
    stopClock();
    const result = grade(session, level, { timeUp });
    const extra = onResult?.(result, level) || {};
    lastResult = result;
    drawResult(result, extra);
  }

  // ---------- 成績 ----------

  function drawResult(r, extra) {
    const wrong = wrongIndices(r);
    const bar = el('div', 'quiz-bar');
    const title = el('h2', '', fill(T.resultTitle, { name: level.meta.name }));
    if (r.retry) title.append(el('span', 'tag', T.retryTag));
    bar.append(title);

    const card = el('section', 'quiz-card result');
    const score = el('div', 'score');
    const big = el('div', 'big', String(r.score));
    big.append(el('small', '', ' / ' + r.total));
    let stamp;
    if (r.perfect && !r.retry) stamp = el('div', 'stamp', level.meta.lost ? fill(T.stampLost, { n: level.meta.lost }) : T.stampPass);
    else if (r.perfect) stamp = el('div', 'stamp', T.stampAllFixed);
    else stamp = el('div', 'stamp miss', fill(T.stampMiss, { n: wrong.length }));
    score.append(big, stamp);
    card.append(score);
    card.append(el('p', '', (r.timeUp ? T.timeUp : fill(T.used, { t: mmss(r.used), limit: mmss(r.limit) })) + (r.perfect ? '' : T.readTips)));
    if (!r.retry && extra.record) {
      card.append(el('p', 'muted', extra.improved && !extra.firstTry ? fill(T.newBest, { n: extra.record.best, total: r.total }) : fill(T.best, { n: extra.record.best, total: r.total, t: mmss(extra.record.used) })));
    }
    if (r.retry) card.append(el('p', 'muted', T.retryNotCounted));
    if (extra.rewardText) card.append(el('p', 'reward', extra.rewardText));

    const actions = el('div', 'actions');
    if (wrong.length) actions.append(button(fill(T.retry, { n: wrong.length }), 'btn', () => start(level, { only: wrong })));
    actions.append(
      button(T.again, 'btn ghost', () => { let lv = level; try { lv = refresh ? refresh(level) || level : level; } catch (err) { console.error(err); } start(lv); }),
      button(backLabel || T.back, 'btn ghost', () => { hide(); onClose?.(); }),
    );

    const list = el('ol', 'review');
    r.items.forEach((x, i) => {
      const li = el('li', x.ok ? 'ok' : 'bad');
      li.append(el('h3', '', (i + 1) + '. ' + x.question.text));
      const ans = el('p', 'ans');
      ans.append(T.yourAnswer, el('b', x.ok ? 'g' : 'r', x.givenText || T.blank));
      if (x.ok) ans.append('　' + T.correct);
      else ans.append('　' + T.rightAnswer, el('b', 'g', x.rightText));
      const tip = el('p', 'tip');
      tip.append(el('strong', '', T.tip), '　' + x.question.tip);
      li.append(ans, tip);
      list.append(li);
    });

    show([bar, card, actions, list]);
    root.scrollTop = 0;
    actions.firstChild.focus();
  }

  // 平板切回前景時馬上檢查一次時間，不用等下一次更新
  document.addEventListener('visibilitychange', () => { if (!document.hidden && countdown) countdown.check(); });

  return {
    start,
    close: hide,
    get open() { return !root.hidden; },
    get lastResult() { return lastResult; },
  };
}
