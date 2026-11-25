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
  const fill = (s, vals) => s.replace(/\{(\w)\}/g, (_, k) => String(vals[k] ?? ''));

  function open(nodes, onBack) {
    panelBody.replaceChildren(...nodes);
    const back = el('button', 'btn ghost', text.back);
    back.addEventListener('click', onBack);
    panelBody.append(back);
    panel.hidden = false;
    hint.hidden = true;
  }

  return {
    setKids(kids, current, onPick) {
      kidsBox.replaceChildren();
      if (kids.length < 2) { kidsBox.hidden = true; return; }
      kidsBox.hidden = false;
      for (const k of kids) {
        const b = el('button', 'chip', k);
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
          t.append(el('strong', '', b.label), el('span', '', b.does));
          t.addEventListener('click', () => onBuilding(kind));
          row.append(t);
        }
        nodes.push(row);
      }
      open(nodes, onBack);
    },

    /** 點到建築：說明＋這座島的關卡 */
    showBuilding(island, kind, building, info, extra, onBack) {
      const nodes = [el('p', 'muted', island.name), el('h2', '', building.label)];
      nodes.push(el('p', '', text[kind + 'Body'] || ''));
      if (kind === 'tent') nodes.push(el('p', 'tag', fill(text.tentPool, { n: extra.choiceCount })));
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
            const go = el('button', 'btn', text.startSoon);
            go.disabled = true;
            li.append(go);
          }
          ul.append(li);
        }
        nodes.push(ul);
      }
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
