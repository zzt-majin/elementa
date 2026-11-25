// world/hud.js
// 3D 畫面上方的介面：標題、小孩切換、靜音鍵、島和建築的說明面板。
// 所有從資料來的文字都用 textContent 放進畫面，不會被當成 HTML。

export function createHud(root, text) {
  const $ = (sel) => root.querySelector(sel);
  const panel = $('#panel');
  const panelBody = $('#panel-body');
  const kidsBox = $('#kids');
  const muteBtn = $('#mute');
  const hint = $('#hint');
  const errorBox = $('#errors');
  $('#site-title').textContent = text.siteTitle;
  hint.textContent = text.hint;

  function el(tag, cls, content) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  }
  const fill = (s, vals) => String(s).replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

  function open(nodes, onBack) {
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
      const go = el('button', 'btn', fill(T.open, { n: l.questions.length }));
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

  /** 遊戲帳篷上方：規則、題庫有幾關、最高紀錄、開始鈕 */
  function tentBlock(tent) {
    const T = text.race;
    const box = el('section', 'tent-box');
    box.append(el('p', 'rule-line muted', tent.ruleText));
    if (!tent.poolCount) { box.append(el('p', 'lock', T.poolEmpty)); return box; }
    box.append(el('p', '', fill(T.poolLine, { n: tent.poolCount })));
    if (tent.best) box.append(el('p', 'best won', fill(T.bestLine, { n: tent.best.best })));
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

    setMute(muted, onToggle) {
      muteBtn.textContent = muted ? text.muteOn : text.muteOff;
      muteBtn.setAttribute('aria-pressed', String(muted));
      muteBtn.onclick = onToggle;
    },

    /** 點到島：列出三棟建築 */
    showIsland(island, info, buildings, onBuilding, onBack) {
      const nodes = [el('h2', '', island.name)];
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
     * extra：{ minutes(level), best(level), onStart(level), mix, house, tent }
     */
    showBuilding(island, kind, building, info, extra, onBack) {
      const nodes = [el('p', 'muted', island.name), el('h2', '', building.label)];
      nodes.push(el('p', '', text[kind + 'Body'] || ''));
      if (kind === 'tent' && extra.tent) nodes.push(tentBlock(extra.tent));
      if (kind === 'house' && extra.house) nodes.push(el('p', 'rule-line muted', extra.house.ruleText));
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

    close() { panel.hidden = true; hint.hidden = false; },

    showErrors(list) {
      if (!list.length) return;
      errorBox.hidden = false;
      errorBox.textContent = text.loadError + ' ' + list.map((e) => e.file + '（' + e.message + '）').join('、');
    },
  };
}
