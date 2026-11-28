// world/equip.js
// 右上角「裝備」（商店左邊）：我的裝備格子、使用／收起來；打開寶箱時的「獲得飛盤！」視窗。
// 這裡只管畫面；有哪些裝備由 engine/toys.js 從建設本算，收下由 world/main.js 記到建設本。
// 所有文字都用 textContent 放進畫面，不會被當成 HTML。

const NS = 'http://www.w3.org/2000/svg';
const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

function el(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (content !== undefined) e.textContent = content;
  return e;
}
function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** 五角星的頂點（中心 cx, cy） */
function starPoints(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 ? r : R;
    pts.push((cx + Math.cos(a) * k).toFixed(2) + ',' + (cy + Math.sin(a) * k).toFixed(2));
  }
  return pts.join(' ');
}

/** 裝備的圖（自己畫的）：飛盤 = 外圈紅、內圈藍、正中央白色五角星 */
export function itemPicture(item, size = 64) {
  const c = item?.colors || {};
  const svg = svgEl('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', class: 'item-pic' });
  svg.append(
    svgEl('circle', { cx: 32, cy: 33.5, r: 29, fill: c.rim || '#a82424' }),
    svgEl('circle', { cx: 32, cy: 32, r: 29, fill: c.outer || '#d32f2f', stroke: c.rim || '#a82424', 'stroke-width': 2 }),
    svgEl('circle', { cx: 32, cy: 32, r: 18.5, fill: c.inner || '#1e6fd9' }),
    svgEl('polygon', { points: starPoints(32, 33, 13.5, 5.4), fill: c.star || '#ffffff' }),
  );
  return svg;
}

/** 右上角「裝備」按鈕的小圖示（星星背包） */
function equipIcon() {
  const svg = svgEl('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' });
  svg.append(
    svgEl('path', { d: 'M6 8h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z' }),
    svgEl('path', { d: 'M9 8V6a3 3 0 0 1 6 0v2' }),
    svgEl('polygon', { points: starPoints(12, 14.6, 3.6, 1.5), class: 'fillstar' }),
  );
  return svg;
}

export function createEquip({ button, root, hud, text = {}, onOpen = () => {} }) {
  if (button) {
    button.replaceChildren(equipIcon(), el('span', '', text.button || ''));
    button.setAttribute('aria-label', text.button || '');
    button.addEventListener('click', () => onOpen());
  }

  /**
   * 「我的裝備」：st = { items（全部裝備的資料）, owned（有的代號）, slots, inHand（拿在手上的代號）, onUse(code), onPutAway() }
   */
  function show(st, onBack, pick = '') {
    const T = text;
    const nodes = [el('h2', '', T.title), el('p', 'shop-intro', st.owned.length ? T.intro : T.empty)];
    const grid = el('div', 'equip-grid');
    const n = Math.max(st.slots, Math.ceil(st.owned.length / st.slots) * st.slots);
    const chosen = pick || st.inHand || st.owned[0] || '';
    for (let i = 0; i < n; i++) {
      const code = st.owned[i];
      const item = code ? st.items.find((x) => x.code === code) : null;
      if (!item) {
        const empty = el('div', 'equip-slot empty');
        empty.setAttribute('aria-label', T.emptySlot || '');
        grid.append(empty);
        continue;
      }
      const b = el('button', 'equip-slot' + (code === chosen ? ' on' : '') + (code === st.inHand ? ' held' : ''));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(code === chosen));
      b.append(itemPicture(item, 54), el('span', 'equip-name', item.name));
      if (code === st.inHand) b.append(el('span', 'equip-held', T.held));
      b.addEventListener('click', () => show(st, onBack, code));
      grid.append(b);
    }
    nodes.push(grid);
    const item = st.items.find((x) => x.code === chosen);
    if (item && st.owned.includes(chosen)) {
      const box = el('section', 'equip-detail');
      box.append(el('b', 'equip-d-name', item.name), el('p', '', item.blurb));
      const held = st.inHand === chosen;
      if (held) box.append(el('p', 'equip-d-held', T.heldLine));
      const go = el('button', 'btn ' + (held ? 'ghost equip-off' : 'equip-use'), held ? T.putAway : T.use);
      go.type = 'button';
      go.addEventListener('click', () => (held ? st.onPutAway() : st.onUse(chosen)));
      box.append(go);
      nodes.push(box);
    }
    hud.showPanel(nodes, onBack);
    root.querySelector('#panel .equip-use, #panel .equip-off')?.focus();
  }

  /** 打開寶箱：「獲得飛盤！已經放進『裝備』」＋「收下」；按「等一下」或 Esc 只關掉，寶箱留在原地 */
  function showChest(item, onTake, onLater) {
    const T = text;
    root.querySelector('.intro-back')?.remove();
    const back = el('div', 'intro-back chest-back');
    const box = el('section', 'intro notice chest-got');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const title = fill(T.gotTitle, { item: item.name });
    box.setAttribute('aria-label', title);
    const pic = el('div', 'chest-pic');
    pic.append(itemPicture(item, 110));
    box.append(pic, el('h2', '', title), el('p', 'intro-lead', fill(T.gotBody, { item: item.name })));
    const row = el('div', 'notice-actions');
    const ok = el('button', 'btn intro-ok chest-take', T.take);
    ok.type = 'button';
    const no = el('button', 'btn ghost chest-later', T.later);
    no.type = 'button';
    row.append(ok, no);
    box.append(row);
    let done = false;
    const close = (took) => {
      if (done) return;
      done = true;
      back.remove();
      if (took) onTake?.(); else onLater?.();
    };
    ok.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
      if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok ? no : ok).focus(); }
    });
    back.append(box);
    root.append(back);
    ok.focus();
  }

  return { show, showChest };
}
