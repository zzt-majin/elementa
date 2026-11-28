// world/hud.js
// 3D 畫面上方的介面：標題、小孩切換、靜音鍵、島和建築的說明面板。
// 所有從資料來的文字都用 textContent 放進畫面，不會被當成 HTML。

export function createHud(root, text) {
  const $ = (sel) => root.querySelector(sel);
  const panel = $('#panel');
  const panelBody = $('#panel-body');
  const kidsBox = $('#kids');
  const muteBtn = $('#mute');
  const clockTime = $('#clock-time');
  const songName = $('#song-name');
  const prevBtn = $('#song-prev');
  const nextBtn = $('#song-next');
  const clockBox = $('#clock');
  let songFlashTimer = null;
  let clockTimer = null;
  const hint = $('#hint');
  const errorBox = $('#errors');
  const walletBox = $('#wallet');
  const mapBtn = $('#map');
  const enterBtn = $('#enter');
  let enterAction = null;
  let flashTimer = null;
  if (enterBtn) enterBtn.addEventListener('click', () => enterAction?.());
  $('#site-title').textContent = text.siteTitle;
  // 上方列多高（時鐘比較高，手機上會換行）：面板和登入卡片放在它下面，不會蓋住時鐘
  const topBar = root.querySelector('.top');
  // 左上角的日曆多寬多高：上方列從日曆右邊開始排，登入卡片放在日曆旁邊或下面
  const calBox = root.querySelector('#calendar');
  const syncTop = () => {
    const css = document.documentElement.style;
    css.setProperty('--hud-top', (topBar ? topBar.offsetHeight : 68) + 'px');
    css.setProperty('--cal-w', (calBox ? calBox.offsetWidth : 0) + 'px');
    css.setProperty('--cal-h', (calBox ? calBox.offsetHeight : 0) + 'px');
  };
  syncTop();
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(syncTop);
    if (topBar) ro.observe(topBar);
    if (calBox) ro.observe(calBox);
  }
  hint.textContent = text.hint;

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }
  const fill = (s, vals) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
  /** 喇叭小圖示：off = 按了會關掉（喇叭打叉）、on = 按了會打開（喇叭有聲波） */
  function icon(kind) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '18');
    svg.setAttribute('height', '18');
    svg.setAttribute('aria-hidden', 'true');
    const d = ['M4 9h4l5-4v14l-5-4H4z', kind === 'off' ? 'M17 9l5 6M22 9l-5 6' : 'M17 8a5 5 0 0 1 0 8M20 5a9 9 0 0 1 0 14'];
    for (const x of d) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', x); svg.append(p); }
    return svg;
  }

  function open(nodes, onBack) {
    if (enterBtn) enterBtn.hidden = true;
    panelBody.replaceChildren(...nodes);
    const back = el('button', 'btn ghost', text.back);
    back.type = 'button';
    back.addEventListener('click', onBack);
    panelBody.append(back);
    panel.hidden = false;
    hint.hidden = true;
  }

  /** 學習屋清單裡一關的那一列：能看就給「看學習卡」，還沒打開就說要先做什麼 */
  function houseRow(l, extra) {
    const T = text.cards;
    const st = extra.house.state(l);
    if (st.reason === 'empty') return [el('p', 'tag', text.notReady)];
    if (st.open) {
      const row = el('div', 'lv-act');
      const go = el('button', 'btn', fill(T.open, { n: l.cards?.length || l.questions.length }));
      go.type = 'button';
      go.addEventListener('click', () => extra.house.onCards(l));
      row.append(go);
      return [row];
    }
    const best = extra.best ? extra.best(l) : null;
    const msg = st.reason === 'needPerfect'
      ? (best ? fill(T.needPerfect, { n: best.best, total: l.questions.length }) : T.needPerfectNone)
      : T.needQuiz;
    const go = el('button', 'btn ghost', T.goQuiz);
    go.type = 'button';
    go.addEventListener('click', () => extra.onStart(l));
    return [el('p', 'lock', msg), go];
  }

  /** 獎賞說明框：標題、幾行規則、例子、今天還能拿多少 */
  function rewardBox(title, lines, example, today) {
    const box = el('section', 'reward-box');
    if (title) box.append(el('h4', '', title));
    if (lines && lines.length) {
      const ul = el('ul');
      for (const t of lines) ul.append(el('li', '', t));
      box.append(ul);
    }
    if (example) box.append(el('p', 'reward-example', example));
    if (today) box.append(el('p', 'reward-today', today));
    return box;
  }

  /** 遊戲帳篷上方：規則、題庫有幾關、最高紀錄、開始鈕 */
  function tentBlock(tent) {
    const T = text.race;
    const box = el('section', 'tent-box');
    box.append(el('p', 'rule-line muted', tent.ruleText));
    if (tent.reward) box.append(rewardBox(tent.reward.title, tent.reward.lines, tent.reward.example, tent.reward.today));
    if (!tent.poolCount) { box.append(el('p', 'lock', T.poolEmpty)); return box; }
    box.append(el('p', '', fill(T.poolLine, { n: tent.poolCount })));
    if (tent.best) box.append(el('p', 'best won', tent.reward?.bestText || fill(T.bestLine, { n: tent.best.best })));
    const go = el('button', 'btn race-go', T.enter);
    go.type = 'button';
    go.addEventListener('click', () => tent.onStart());
    box.append(go);
    return box;
  }

  /** 遊戲帳篷清單裡的一關：在不在題庫裡；不在的話要先做什麼 */
  function tentRow(l, extra) {
    const T = text.race;
    const st = extra.tent.state(l);
    if (st.inPool) return [el('p', 'in-pool', T.inPool)];
    if (st.reason === 'noChoice') return [el('p', 'muted', T.noChoice)];
    const best = extra.best ? extra.best(l) : null;
    const msg = st.reason === 'needPerfect'
      ? (best ? fill(T.needPerfect, { n: best.best, total: l.questions.length }) : T.needPerfectNone)
      : T.needQuiz;
    const go = el('button', 'btn ghost', T.goQuiz);
    go.type = 'button';
    go.addEventListener('click', () => extra.onStart(l));
    return [el('p', 'lock', msg), go];
  }

  /** 綜合練習：勾單元（可以複選）＋題數按鈕 */
  function mixBlock(mix) {
    const T = text.mix;
    const box = el('section', 'mix');
    box.append(el('h3', '', T.title), el('p', 'muted', T.body));
    const list = el('div', 'mix-units');
    const warn = el('p', 'lock', T.none);
    const sync = () => { warn.hidden = mix.selected.size > 0; };
    mix.units.forEach((u, i) => {
      const label = el('label', 'mix-unit');
      const cb = el('input');
      cb.type = 'checkbox';
      cb.id = 'mix-' + i;
      cb.checked = mix.selected.has(u);
      cb.addEventListener('change', () => { mix.toggle(u, cb.checked); sync(); });
      label.append(cb, el('span', '', u));
      list.append(label);
    });
    const row = el('div', 'mix-presets');
    for (const p of mix.presets) {
      const wrap = el('div', 'mix-preset');
      const b = el('button', 'btn', fill(T.preset, { n: p.count, m: p.minutes }));
      b.type = 'button';
      b.addEventListener('click', () => { if (!mix.start(p)) { warn.hidden = false; } });
      wrap.append(b);
      if (mix.coinLine) wrap.append(el('span', 'coin-line', mix.coinLine(p)));
      const best = mix.best(p);
      if (best) wrap.append(el('span', best.best >= p.count ? 'best won' : 'best', fill(T.best, { n: best.best, total: p.count })));
      row.append(wrap);
    }
    box.append(list, row, warn);
    sync();
    return box;
  }

  return {
    setKids(kids, current, onPick) {
      kidsBox.replaceChildren();
      if (kids.length < 2) { kidsBox.hidden = true; return; }
      kidsBox.hidden = false;
      for (const k of kids) {
        const b = el('button', 'chip', k);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(k === current));
        b.addEventListener('click', () => onPick(k));
        kidsBox.append(b);
      }
    },

    /** 上方的歐巴幣和寶石：w = { coins, gems: [{ code, name, color, n }] }；null 就藏起來 */
    setWallet(w) {
      if (!walletBox) return;
      if (!w) { walletBox.hidden = true; return; }
      const T = text.economy || {};
      walletBox.hidden = false;
      const coin = el('span', 'w-item coin');
      coin.title = T.coinName || '';
      coin.append(el('i', 'w-icon coin-icon'), el('b', '', String(w.coins)));
      const items = [coin];
      for (const g of w.gems) {
        const s = el('span', 'w-item gem');
        s.title = g.name;
        const icon = el('i', 'w-icon gem-icon');
        if (g.color) icon.style.setProperty('--gem', g.color);
        s.append(icon, el('b', '', String(g.n)));
        items.push(s);
      }
      walletBox.replaceChildren(...items);
      walletBox.setAttribute('aria-label', [fill(T.coinsLabel || '{n}', { n: w.coins }), ...w.gems.map((g) => g.name + ' ' + g.n)].join('，'));
    },

    /**
     * 右上角的時鐘＋音樂：m = { muted, index, count, name, flash }；
     * on = { prev, next, toggle }。flash = true 時歌名那行先寫「第 2 首・小海浪」，2 秒後變回「♪ 小海浪」
     */
    setMusic(m, on) {
      const M = text.music || {};
      if (!clockBox) return;
      clockBox.classList.toggle('off', !!m.muted);
      muteBtn.replaceChildren(icon(m.muted ? 'on' : 'off'), el('span', '', m.muted ? M.on : M.off));
      muteBtn.setAttribute('aria-pressed', String(!!m.muted));
      muteBtn.onclick = on.toggle;
      prevBtn.setAttribute('aria-label', M.prev || '');
      nextBtn.setAttribute('aria-label', M.next || '');
      prevBtn.title = M.prev || '';
      nextBtn.title = M.next || '';
      prevBtn.onclick = on.prev;
      nextBtn.onclick = on.next;
      prevBtn.hidden = nextBtn.hidden = m.count < 2;
      clearTimeout(songFlashTimer);
      const plain = m.muted ? (M.mutedLine || '') : fill(M.song || '{name}', { name: m.name });
      if (m.flash && m.name) {
        songName.textContent = fill(M.songFlash || '{name}', { n: m.index + 1, total: m.count, name: m.name });
        songFlashTimer = setTimeout(() => { songName.textContent = plain; }, 2000);
      } else {
        songName.textContent = plain;
      }
    },

    /** 時鐘開始走：format(ms) 回傳 21:05 這樣的字，每換一分鐘更新 */
    startClock(format, label, msToNext) {
      if (!clockTime) return;
      clearTimeout(clockTimer);
      const tick = () => {
        const now = Date.now();
        const t = format(now);
        clockTime.textContent = t;
        clockTime.setAttribute('aria-label', fill(label || '{t}', { t }));
        clockTimer = setTimeout(tick, msToNext(now));
      };
      tick();
    },

    /** 點到島：列出三棟建築 */
    showIsland(island, info, buildings, onBuilding, onBack, visitNote = '') {
      const nodes = [el('h2', '', island.name)];
      if (visitNote) nodes.unshift(el('p', 'visit-note', visitNote));
      if (!info.count) {
        nodes.push(el('p', 'tag', text.construction), el('p', '', text.constructionBody));
      } else {
        nodes.push(el('p', 'muted', fill(text.islandCount, { n: info.count })));
        const row = el('div', 'tiles');
        for (const [kind, b] of Object.entries(buildings)) {
          const t = el('button', 'tile ' + kind);
          t.type = 'button';
          t.append(el('strong', '', b.label), el('span', '', b.does));
          t.addEventListener('click', () => onBuilding(kind));
          row.append(t);
        }
        nodes.push(row);
      }
      open(nodes, onBack);
    },

    /**
     * 點到建築：說明＋這座島的關卡。
     * extra：{ minutes(level), best(level), onStart(level), mix, house, tent, visitNote（在姐妹的島上：最上面的說明） }
     */
    showBuilding(island, kind, building, info, extra, onBack) {
      const nodes = [el('p', 'muted', island.name), el('h2', '', building.label)];
      if (extra.visitNote) nodes.unshift(el('p', 'visit-note', extra.visitNote));
      nodes.push(el('p', '', text[kind + 'Body'] || ''));
      if (kind === 'tent' && extra.tent) nodes.push(tentBlock(extra.tent));
      if (kind === 'house' && extra.house) nodes.push(el('p', 'rule-line muted', extra.house.ruleText));
      if (kind === 'tower' && extra.towerReward) nodes.push(rewardBox(extra.towerReward.title, [], extra.towerReward.rule, ''));
      for (const g of info.groups) {
        nodes.push(el('h3', '', g.title));
        const ul = el('ul', 'levels');
        for (const l of g.items) {
          const li = el('li');
          const head = el('div', 'lv-head');
          head.append(el('strong', '', l.meta.name), el('span', 'muted', fill(text.questionsAndMinutes, { n: l.questions.length, m: extra.minutes(l) })));
          li.append(head);
          if (l.meta.why) li.append(el('p', 'why', l.meta.why));
          if (kind === 'tower') {
            if (!l.questions.length) {
              li.append(el('p', 'tag', text.notReady));
            } else {
              const best = extra.best ? extra.best(l) : null;
              const row = el('div', 'lv-act');
              const go = el('button', 'btn', best ? text.retryQuiz : text.startQuiz);
              go.type = 'button';
              go.addEventListener('click', () => extra.onStart(l));
              row.append(go);
              if (best) {
                const perfect = best.best >= l.questions.length;
                row.append(el('span', perfect ? 'best won' : 'best', (perfect ? text.towerPerfect + '・' : '') + fill(text.towerBest, { n: best.best, total: l.questions.length, t: extra.mmss(best.used) })));
              }
              li.append(row);
              if (extra.towerReward) li.append(el('p', 'coin-line', extra.towerReward.coinLine(l.meta.id, l.questions.length)));
            }
          }
          if (kind === 'house' && extra.house) li.append(...houseRow(l, extra));
          if (kind === 'tent' && extra.tent) li.append(...tentRow(l, extra));
          ul.append(li);
        }
        nodes.push(ul);
      }
      if (kind === 'tower' && extra.mix) nodes.push(mixBlock(extra.mix));
      open(nodes, onBack);
    },

    /**
     * 建設面板（蓋橋）：b = { title, body, note, price, have, short, state: 'ready'|'short'|'locked'|'built', buildLabel, confirmLabel, onBuild }
     * 錢夠的時候按兩次才蓋（第一次按鈕變成「確定要花…嗎？」），避免不小心按到。
     */
    showBridge(b, onBack) {
      const nodes = [el('h2', '', b.title), el('p', '', b.body)];
      const box = el('section', 'build-box');
      if (b.state === 'built') box.append(el('p', 'best won', b.builtText || ''));
      else if (b.state === 'locked') box.append(el('p', 'lock', b.lockedText || ''));
      else {
        box.append(el('p', 'build-price', b.price), el('p', 'muted', b.have));
        if (b.state === 'short') box.append(el('p', 'lock', b.short));
        const go = el('button', 'btn build-go', b.buildLabel);
        go.type = 'button';
        go.disabled = b.state !== 'ready';
        let armed = false;
        go.addEventListener('click', () => {
          if (b.state !== 'ready') return;
          if (!armed) { armed = true; go.textContent = b.confirmLabel; go.classList.add('armed'); return; }
          go.disabled = true;
          b.onBuild();
        });
        box.append(go);
        if (b.whyLabel) {
          const why = el('button', 'btn ghost build-why', b.whyLabel);
          why.type = 'button';
          why.addEventListener('click', b.onWhy);
          box.append(why);
        }
      }
      if (b.nthText) box.prepend(el('p', 'build-nth', b.nthText));
      nodes.push(box);
      if (b.note) nodes.push(el('p', 'muted', b.note));
      open(nodes, onBack);
      panel.querySelector('.build-go:not(:disabled)')?.focus();
    },

    /**
     * 「橋越蓋越貴囉！」說明視窗（蓋在面板上面）：i = { title, lead, rule, rows: [{ n, coins, state: done|now|later }],
     * labels: { done, now, nth }, unit, tipTitle, tip, ok }；按「我知道了」後呼叫 onDone（可以不給）
     */
    showIntro(i, onDone) {
      root.querySelector('.intro-back')?.remove();
      const back = el('div', 'intro-back');
      const box = el('section', 'intro');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', i.title);
      const lead = el('p', 'intro-lead', i.lead);
      lead.append(el('br'), el('b', '', i.rule));
      const bars = el('div', 'intro-bars');
      bars.style.gridTemplateColumns = 'repeat(' + i.rows.length + ', minmax(0, 1fr))';
      const max = Math.max(...i.rows.map((r) => r.coins), 1);
      for (const r of i.rows) {
        const col = el('div', 'intro-col ' + r.state);
        col.append(el('span', 'intro-tag', r.state === 'done' ? i.labels.done : r.state === 'now' ? i.labels.now : ''));
        const bar = el('div', 'intro-bar', String(r.coins));
        bar.style.height = Math.round(36 + 100 * (r.coins / max)) + 'px';
        col.append(bar, el('span', 'intro-n', fill(i.labels.nth, { n: r.n })));
        bars.append(col);
      }
      const tip = el('div', 'intro-tip');
      tip.append(el('b', '', i.tipTitle), i.tip);
      const ok = el('button', 'btn intro-ok', i.ok);
      ok.type = 'button';
      const close = () => { back.remove(); onDone?.(); };
      ok.addEventListener('click', close);
      back.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        if (e.key === 'Tab') { e.preventDefault(); ok.focus(); }
      });
      box.append(el('h2', '', i.title), lead, bars, el('p', 'intro-unit', i.unit), tip, ok);
      back.append(box);
      root.append(back);
      ok.focus();
    },

    /**
     * 提醒視窗（蓋在面板上面）：n = { title, tag, body, ok, cancel }。按 ok 呼叫 onOk；按 cancel 或 Esc 只關掉。
     * 例如在姐妹的島上開始測驗前：「你在妹妹的島上，這裡的活動不記成績」
     */
    showNotice(n, onOk) {
      root.querySelector('.intro-back')?.remove();
      const back = el('div', 'intro-back');
      const box = el('section', 'intro notice');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-label', n.title);
      if (n.tag) box.append(el('p', 'notice-tag', n.tag));
      box.append(el('h2', '', n.title), el('p', 'intro-lead', n.body));
      const row = el('div', 'notice-actions');
      const ok = el('button', 'btn intro-ok', n.ok);
      ok.type = 'button';
      const no = el('button', 'btn ghost', n.cancel);
      no.type = 'button';
      row.append(ok, no);
      box.append(row);
      const close = () => back.remove();
      ok.addEventListener('click', () => { close(); onOk?.(); });
      no.addEventListener('click', close);
      back.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
        if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok ? no : ok).focus(); }
      });
      back.append(box);
      root.append(back);
      ok.focus();
    },

    /** 上方中間的小標籤「拜訪中・不記成績」（在姐妹的島上時）；t 是空的就藏起來 */
    setVisit(t) {
      let tag = root.querySelector('.visit-tag');
      if (!t) { if (tag) tag.hidden = true; return; }
      if (!tag) { tag = el('p', 'visit-tag'); tag.setAttribute('aria-live', 'polite'); root.append(tag); }
      tag.textContent = t;
      tag.hidden = false;
    },

    /** 右邊的面板放別的模組做好的內容（例如商店 world/shop.js）；下面會加「返回」 */
    showPanel(nodes, onBack) { open(nodes, onBack); },

    /** 說明視窗是不是打開著 */
    introOpen() { return !!root.querySelector('.intro-back'); },

    /** 下方提示文字暫時換成一句話（例如「橋蓋好了！」），幾秒後換回來 */
    flash(t, ms = 4000) {
      const before = hint.textContent;
      hint.textContent = t;
      hint.classList.add('flash');
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { hint.classList.remove('flash'); if (hint.textContent === t) hint.textContent = before; }, ms);
    },

    close() { panel.hidden = true; hint.hidden = false; root.querySelector('.intro-back')?.remove(); },

    /** 面板（島或建築的清單）是不是打開著 */
    isOpen() { return !panel.hidden || !!root.querySelector('.intro-back'); },

    /** 下方的提示文字 */
    setHint(t) { hint.textContent = t; },

    /** 畫面下方的大按鈕「進入測驗塔」：label 是 null 就藏起來 */
    setEnter(label, onClick) {
      if (!enterBtn) return;
      enterAction = onClick || null;
      if (!label) { enterBtn.hidden = true; return; }
      if (enterBtn.dataset.label !== label) {
        enterBtn.dataset.label = label;
        enterBtn.replaceChildren(el('span', 'enter-label', label), el('kbd', 'enter-key', text.walk?.enterKey || ''));
      }
      enterBtn.hidden = !panel.hidden;
    },

    /** 右上角「地圖」：inMap = true 時按鈕寫「回到小公主」 */
    setMap(inMap, onToggle) {
      if (!mapBtn) return;
      mapBtn.textContent = inMap ? (text.walk?.mapBack || '') : (text.walk?.map || '');
      mapBtn.setAttribute('aria-pressed', String(inMap));
      mapBtn.onclick = onToggle;
    },

    showErrors(list) {
      if (!list.length) return;
      errorBox.hidden = false;
      errorBox.textContent = text.loadError + ' ' + list.map((e) => e.file + '（' + e.message + '）').join('、');
    },
  };
}
