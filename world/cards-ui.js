// world/cards-ui.js
// 學習屋的看卡畫面。規則全在 engine/cards.js，這裡只負責畫出來和接按鈕。
// 畫面文字從 config/text.json 的 cards 區讀；從關卡檔來的文字一律用 textContent，不會被當成 HTML。
// 「我會了／再看一次」只記在這一次的畫面裡，不存進裝置、也不送到試算表。
import { buildCards, createDeck, currentCard, flip, moveTo, mark, allMarked, deckSummary } from '../engine/cards.js';
import { speakButtons } from './speech.js';

/**
 * root：放看卡畫面的元素（index.html 的 #cards）。
 * settings：cardSettings() 的回傳。
 * onClose()：按「回到學習屋」時呼叫。
 * onOpenChange(open)：畫面打開或關上時呼叫（3D 場景可以趁這時暫停）。
 */
export function createCardsUI(root, { text, settings, onClose, onOpenChange, speaker }) {
  const T = text.cards;
  const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
  let level = null;
  let cards = [];
  let deck = null;
  let shuffle = settings.shuffle;
  let subset = null; // 正在看「再看一次」的那幾張
  let showingSummary = false;

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
    const wrap = el('div', 'cards-wrap');
    wrap.append(...nodes);
    root.replaceChildren(wrap);
    if (root.hidden) {
      root.hidden = false;
      document.addEventListener('keydown', onKey);
      onOpenChange?.(true);
    }
  }
  function hide() {
    root.hidden = true;
    root.replaceChildren();
    document.removeEventListener('keydown', onKey);
    onOpenChange?.(false);
  }

  function open(lv) {
    level = lv;
    cards = buildCards(lv, settings);
    subset = null;
    newDeck();
  }

  function newDeck(only = subset) {
    deck = createDeck(cards, { only, shuffle });
    showingSummary = false;
    draw();
  }

  // ---------- 一張卡 ----------

  function draw({ focus = 'card' } = {}) {
    if (!deck.order.length) { hide(); onClose?.(); return; }
    const n = deck.order.length;
    const c = currentCard(deck);
    const last = deck.current === n - 1;

    const bar = el('div', 'quiz-bar');
    const title = el('h2', '', level.meta.name);
    if (subset) title.append(el('span', 'tag', T.againTag));
    bar.append(title, el('span', 'muted', fill(T.counter, { n: deck.current + 1, total: n })));

    const progress = el('div', 'card-dots');
    progress.setAttribute('aria-hidden', 'true');
    deck.order.forEach((k, i) => {
      const m = deck.marks[k];
      progress.append(el('span', (m || '') + (i === deck.current ? ' cur' : '')));
    });

    // 整張卡是一個按鈕：點一下翻面
    const card = el('button', 'study-card' + (deck.flipped ? ' back' : ''));
    card.type = 'button';
    card.setAttribute('aria-label', deck.flipped ? T.flipBack : T.flip);
    if (!deck.flipped) {
      card.append(el('span', 'face-label', (c.lang === 'en' ? T.word || T.front : T.front) + '　' + c.no));
      if (c.image) {
        const img = el('img', 'card-pic');
        img.src = c.image;
        img.alt = '';
        card.append(img);
      }
      const front = el('span', 'prompt', c.front);
      if (c.lang === 'en') front.lang = 'en';
      card.append(front);
      if (c.options.length) {
        const ul = el('span', 'card-opts');
        c.options.forEach((o) => ul.append(el('span', 'card-opt', o)));
        card.append(ul);
      }
      card.append(el('span', 'flip-hint', T.flip));
    } else {
      card.append(el('span', 'face-label', c.lang === 'en' ? T.meaning || T.answer : T.answer), el('span', 'card-answer', c.answer));
      if (c.tip) {
        const tip = el('span', 'card-tip');
        tip.append(el('strong', '', c.lang === 'en' ? T.example || T.tip : T.tip), el('span', '', c.tip));
        card.append(tip);
      }
      card.append(el('span', 'flip-hint', T.flipBack));
    }
    card.addEventListener('click', () => { flip(deck); draw(); });

    const judge = el('div', 'card-judge');
    if (deck.flipped) {
      const m = deck.marks[deck.order[deck.current]];
      const again = button(T.again, 'btn ghost', () => doMark('again'));
      const known = button(T.known, 'btn', () => doMark('known'));
      again.setAttribute('aria-pressed', String(m === 'again'));
      known.setAttribute('aria-pressed', String(m === 'known'));
      judge.append(again, known);
    }

    const nav = el('div', 'quiz-nav');
    const side = el('div', 'side');
    side.append(
      button(T.prev, 'btn ghost', () => go(deck.current - 1), { disabled: deck.current === 0 }),
      last ? button(T.finish, 'btn ghost', summary) : button(T.next, 'btn ghost', () => go(deck.current + 1)),
    );
    nav.append(side);

    const extra = el('div', 'side');
    extra.append(
      button(shuffle ? T.inOrder : T.shuffle, 'btn ghost small', () => { shuffle = !shuffle; newDeck(); }),
      button(T.leave, 'btn ghost small', leave),
    );

    // 英語卡：喇叭按鈕放在卡片外面（卡片本身是翻面按鈕）
    const speak = c.speech && c.lang === 'en' ? [speakButtons(speaker, c.speech, text.speech || {})] : [];
    show([bar, progress, card, ...speak, judge, nav, extra, el('p', 'muted keys', T.keys)]);
    if (focus === 'card') root.querySelector('.study-card')?.focus({ preventScroll: true });
    if (focus === 'judge') root.querySelector('.card-judge .btn:last-child')?.focus({ preventScroll: true });
  }

  function go(i) {
    if (i < 0 || i >= deck.order.length) return;
    moveTo(deck, i);
    draw();
  }

  function doMark(v) {
    const wasLast = deck.current === deck.order.length - 1;
    mark(deck, v);
    if (wasLast && allMarked(deck)) { summary(); return; }
    draw();
  }

  function leave() { hide(); onClose?.(); }

  // ---------- 看完一輪 ----------

  function summary() {
    showingSummary = true;
    const s = deckSummary(deck);
    const bar = el('div', 'quiz-bar');
    bar.append(el('h2', '', level.meta.name));
    const box = el('section', 'quiz-card cards-done');
    box.append(el('h3', '', T.doneTitle), el('p', '', fill(T.doneBody, s)));
    if (s.unmarked) box.append(el('p', 'muted', fill(T.doneUnmarked, { n: s.unmarked })));
    if (!s.again && !s.unmarked) box.append(el('p', 'won', T.doneAllKnown));

    const actions = el('div', 'actions');
    if (s.again) actions.append(button(fill(T.reviewAgain, { n: s.again }), 'btn', () => { subset = s.againList; newDeck(); }));
    actions.append(
      button(T.restart, 'btn ghost', () => { subset = null; newDeck(); }),
      button(T.leave, 'btn ghost', leave),
    );
    show([bar, box, actions]);
    root.scrollTop = 0;
    actions.firstChild.focus();
  }

  function onKey(e) {
    if (root.hidden || showingSummary || !deck) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(deck.current + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(deck.current - 1); }
    else if (e.key === 'Escape') { e.preventDefault(); leave(); }
  }

  return {
    open,
    close: hide,
    get isOpen() { return !root.hidden; },
  };
}
