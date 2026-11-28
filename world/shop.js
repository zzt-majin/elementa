// world/shop.js
// 商店（時鐘左邊的按鈕）：目前只有「寵物商店」，「更衣室」之後開。
// 這裡只管畫面；買不買得起、每天多少錢由 engine/pets.js 算，買下去由 world/main.js 記到建設本。
// 所有從資料來的文字（狗的名字、小孩取的名字）都用 textContent 放進畫面，不會被當成 HTML。

const NS = 'http://www.w3.org/2000/svg';
const INK = '#3b2a30';
const LEGS = 'M36 64v20M48 66v18M76 66v18M88 64v20';

/** 寵物的畫法（自己畫的，viewBox 0 0 120 96）：四種狗和貓；顏色照 config/pets.json 的 colors */
function dogShapes(look, c) {
  const line = { stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' };
  const legs = (inner) => [
    ['path', { d: LEGS, stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: LEGS, stroke: inner, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }],
  ];
  if (look === 'shepherd') {
    return [
      ['path', { d: 'M94 50c12 2 20 10 18 20-8-4-12-10-18-12', fill: c.dark, ...line }],
      ['ellipse', { cx: 62, cy: 54, rx: 35, ry: 18, fill: c.body, ...line }],
      ['path', { d: 'M36 46c10-10 40-10 56 0-8 8-46 8-56 0z', fill: c.dark }],
      ...legs(c.body),
      ['circle', { cx: 30, cy: 38, r: 17, fill: c.body, ...line }],
      ['path', { d: 'M18 26l0-22 13 14M34 20l9-16 3 20', fill: c.dark, ...line }],
      ['path', { d: 'M12 40c-4 1-5 5-2 7s10 1 12-2', fill: c.dark, ...line }],
      ['circle', { cx: 26, cy: 35, r: 2.5, fill: c.eye }],
    ];
  }
  if (look === 'husky') {
    return [
      ['path', { d: 'M92 42c12-8 18-20 12-26-8 4-10 12-12 18', fill: c.body, ...line }],
      ['ellipse', { cx: 62, cy: 54, rx: 34, ry: 18, fill: c.body, ...line }],
      ['path', { d: 'M34 60c12 8 44 8 58 0-4 10-50 12-58 0z', fill: c.light }],
      ...legs(c.light),
      ['circle', { cx: 30, cy: 38, r: 17, fill: c.body, ...line }],
      ['path', { d: 'M17 27l1-20 12 13M34 21l9-15 3 19', fill: c.body, ...line }],
      ['path', { d: 'M14 36c6-4 14-2 18 4-2 10-16 14-22 6z', fill: c.light }],
      ['path', { d: 'M12 42c-4 1-5 5-2 7s10 1 12-2', fill: c.light, ...line }],
      ['circle', { cx: 10, cy: 43, r: 2.5, fill: INK }],
      ['circle', { cx: 26, cy: 35, r: 3, fill: c.eye, stroke: INK, 'stroke-width': 1.5 }],
    ];
  }
  if (look === 'lab') {
    // 拉不拉多：壯壯的身體、軟軟垂下來的耳朵、粗尾巴
    return [
      ['path', { d: 'M94 46c10 0 18-6 20-14-8 0-14 4-20 8', fill: c.body, ...line }],
      ['ellipse', { cx: 62, cy: 54, rx: 36, ry: 19, fill: c.body, ...line }],
      ['path', { d: 'M36 62c12 7 40 7 52 0-4 8-46 9-52 0z', fill: c.light }],
      ...legs(c.body),
      ['circle', { cx: 30, cy: 38, r: 18, fill: c.body, ...line }],
      ['path', { d: 'M38 24c8 2 10 14 6 22-6-2-8-12-6-22z', fill: c.dark, ...line }],
      ['path', { d: 'M13 40c-5 1-6 6-3 8s11 1 13-2', fill: c.light, ...line }],
      ['circle', { cx: 10, cy: 43, r: 2.8, fill: INK }],
      ['circle', { cx: 25, cy: 34, r: 2.6, fill: c.eye }],
    ];
  }
  if (look === 'cat') {
    // 虎斑貓：小小的身體、尖耳朵、條紋、往上彎的尾巴、鬍鬚
    const thin = { stroke: INK, 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' };
    const catLegs = 'M42 64v18M52 66v16M74 66v16M84 64v18';
    return [
      ['path', { d: 'M92 52c14-2 20-14 16-28-2-4-6-4-6 0 2 10-2 18-12 20', fill: c.body, ...line }],
      ['ellipse', { cx: 64, cy: 56, rx: 29, ry: 15, fill: c.body, ...line }],
      ['path', { d: 'M56 42l3 10M66 41l1 11M76 43l-1 10', stroke: c.dark, 'stroke-width': 4, 'stroke-linecap': 'round', fill: 'none' }],
      ['path', { d: catLegs, stroke: INK, 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' }],
      ['path', { d: catLegs, stroke: c.body, 'stroke-width': 3, 'stroke-linecap': 'round', fill: 'none' }],
      ['path', { d: 'M18 30l-1-18 12 10M34 22l10-10 0 18', fill: c.body, ...line }],
      ['circle', { cx: 30, cy: 38, r: 15, fill: c.body, ...line }],
      ['path', { d: 'M27 25l1 6M33 25l-1 6', stroke: c.dark, 'stroke-width': 3, 'stroke-linecap': 'round' }],
      ['ellipse', { cx: 22, cy: 44, rx: 8, ry: 6, fill: c.light }],
      ['path', { d: 'M18 41l3 2 3-2z', fill: '#e88a8a', stroke: INK, 'stroke-width': 1 }],
      ['ellipse', { cx: 25, cy: 34, rx: 2.4, ry: 3.2, fill: c.eye, stroke: INK, 'stroke-width': 1 }],
      ['ellipse', { cx: 36, cy: 34, rx: 2.4, ry: 3.2, fill: c.eye, stroke: INK, 'stroke-width': 1 }],
      ['path', { d: 'M14 44l-10-2M14 47l-10 2M30 45l9-2M30 48l9 2', ...thin }],
    ];
  }
  return [
    ['path', { d: 'M92 40c10-6 14-16 10-22-6 4-8 10-10 14', fill: c.body, ...line }],
    ['ellipse', { cx: 62, cy: 54, rx: 34, ry: 17, fill: c.body, ...line }],
    ...legs(c.body),
    ['circle', { cx: 30, cy: 38, r: 17, fill: c.body, ...line }],
    ['path', { d: 'M18 26l2-18 10 12M34 22l8-14 2 18', fill: c.body, ...line }],
    ['path', { d: 'M14 42c-4 0-6 3-4 6s8 2 10-1', fill: c.light, ...line }],
    ['circle', { cx: 11, cy: 43, r: 2.5, fill: INK }],
    ['circle', { cx: 26, cy: 35, r: 2.5, fill: c.eye }],
  ];
}

/** 一隻寵物的圖（SVG）：breed = petRules() 的一種 */
export function petPicture(breed, w = 96) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 96');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(Math.round(w * 0.8)));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', breed.name);
  for (const [tag, attrs] of dogShapes(breed.look, breed.colors)) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    svg.append(e);
  }
  return svg;
}

/** 商店按鈕上的小房子圖示 */
function shopIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M4 9l1.5-5h13L20 9', 'M4 9c0 2 1.6 3 3 3s3-1 3-3c0 2 1.6 3 2 3s2-1 2-3c0 2 1.6 3 3 3s3-1 3-3', 'M5 12v8h14v-8', 'M10 20v-5h4v5']) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
function el(tag, cls, content) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (content !== undefined) e.textContent = content;
  return e;
}
const count = (s) => Array.from(s).length;
const cut = (s, max) => Array.from(s).slice(0, max).join('');

/**
 * button：時鐘左邊的 #shop；root：#hud（確認視窗放這裡）；hud：createHud()；text：config/text.json 的 shop。
 * 回傳 { show(state, onBack) }：
 *   state = { kid, coins, coin（歐巴幣的名字）, breeds, owned, shopState(breed), fee(breed), totalFee, hungry, nameMax, maxOwned, onBuy(breed, name) }
 *   showGift(gift, onClaim(name), onLater)：送寵物的視窗；gift = { breed, coin, fee, nameMax, maxOwned }
 */
export function createShop({ button, root, hud, text = {}, onOpen = () => {} }) {
  if (button) {
    button.replaceChildren(shopIcon(), el('span', '', text.button || ''));
    button.addEventListener('click', () => onOpen());
  }

  function show(st, onBack) {
    const T = text;
    const coin = st.coin;
    const nodes = [el('h2', '', T.title)];
    const tabs = el('div', 'shop-tabs');
    const on = el('span', 'shop-tab on', T.tabPets);
    const off = el('span', 'shop-tab off', T.tabCloset);
    off.setAttribute('aria-disabled', 'true');
    tabs.append(on, off);
    nodes.push(tabs, el('p', 'shop-intro', T.intro));
    if (st.hungry && st.owned.length) nodes.push(el('p', 'shop-hungry', fill(T.hungry, { coin })));
    if (st.totalFee > 0) nodes.push(el('p', 'muted', fill(T.total, { n: st.totalFee, coin })));
    if (st.kid) nodes.push(el('p', 'muted pet-max', fill(T.maxLine, { max: st.maxOwned, n: st.owned.filter((p) => !p.gift).length })));
    const gifts = st.owned.filter((p) => p.gift);
    for (const g of gifts) nodes.push(el('p', 'pet-gift-line', fill(T.giftOwned, { breed: g.breed, name: g.name })));
    const list = el('div', 'pet-list');
    for (const b of st.breeds) {
      const s = st.shopState(b);
      const row = el('section', 'pet-row' + (s.state === 'owned' ? ' owned' : s.state === 'ready' ? '' : ' dim'));
      const pic = el('div', 'pet-pic');
      pic.append(petPicture(b, 92));
      const info = el('div', 'pet-info');
      info.append(el('b', 'pet-name', b.name), el('span', 'pet-blurb', b.blurb), el('span', 'pet-fee', fill(T.feeLine, { fee: st.fee(b), coin })));
      const act = el('div', 'pet-act');
      if (s.state === 'owned') {
        act.append(el('span', 'pet-owned', fill(T.owned, { name: s.owned.name })));
      } else {
        const go = el('button', 'btn pet-buy', fill(T.buy, { price: b.price, coin }));
        go.type = 'button';
        go.disabled = s.state !== 'ready';
        go.addEventListener('click', () => confirmBuy(st, b));
        act.append(go);
        if (s.state === 'short') act.append(el('span', 'pet-short', fill(T.short, { n: s.short, coin })));
        if (s.state === 'locked') act.append(el('span', 'pet-short', T.locked));
        if (s.state === 'full') act.append(el('span', 'pet-short', fill(T.full, { max: st.maxOwned })));
      }
      row.append(pic, info, act);
      list.append(row);
    }
    nodes.push(list);
    hud.showPanel(nodes, onBack);
    root.querySelector('#panel .pet-buy:not(:disabled)')?.focus();
  }

  /** 「你要確定要買臺灣土狗嗎？」：取名字（最多 nameMax 個字），按「確定要買」才買 */
  function confirmBuy(st, b) {
    const T = text;
    const coin = st.coin;
    const fee = st.fee(b);
    // 「購買後每天會自動扣 10 歐巴幣作為…」：把數字標粗
    const lead = el('p', 'intro-lead');
    const parts = String(T.confirmBody || '').split('{fee}');
    lead.append(fill(parts[0], { coin }));
    if (parts.length > 1) { lead.append(el('b', '', ' ' + fee + ' ')); lead.append(fill(parts.slice(1).join(''), { coin })); }
    nameDialog({
      cls: 'pet-confirm',
      breed: b,
      title: fill(T.confirmTitle, { breed: b.name }),
      body: [lead, el('p', 'pet-when', fill(T.confirmWhen, { coin }))],
      chips: [fill(T.chipPrice, { price: b.price, coin }), fill(T.chipAfter, { have: st.coins, after: st.coins - b.price }), fill(T.chipFee, { fee })],
      max: st.nameMax,
      okText: T.ok,
      cancelText: T.cancel,
      onOk: (name) => st.onBuy(b, name),
    });
  }

  /** 送寵物：「送你一隻臺灣土狗！」取好名字按「領取」才拿到；「等一下再領」關掉，下次打開網站再問 */
  function showGift(g, onClaim, onLater = () => {}) {
    const T = text;
    const b = g.breed;
    nameDialog({
      cls: 'pet-confirm pet-gift',
      breed: b,
      title: fill(T.giftTitle, { breed: b.name }),
      body: [
        el('p', 'intro-lead', fill(T.giftBody, { coin: g.coin, max: g.maxOwned })),
        el('p', 'pet-when', fill(T.giftWhen, { coin: g.coin, fee: g.fee })),
        el('p', 'muted pet-later-note', T.giftLaterNote),
      ],
      chips: [fill(T.chipFee, { fee: g.fee })],
      max: g.nameMax,
      okText: T.giftOk,
      cancelText: T.giftLater,
      onOk: onClaim,
      onCancel: onLater,
    });
  }

  /** 共用的視窗：寵物的圖、標題、說明、取名字、小標籤、兩個按鈕 */
  function nameDialog({ cls, breed, title, body, chips, max, okText, cancelText, onOk, onCancel = () => {} }) {
    const T = text;
    root.querySelector('.intro-back')?.remove();
    const back = el('div', 'intro-back');
    const box = el('section', 'intro ' + cls);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    const pic = el('div', 'pet-pic big');
    pic.append(petPicture(breed, 132));
    const label = el('label', 'pet-name-field');
    const cap = el('span', 'pet-name-cap', fill(T.nameLabel, { max }));
    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.placeholder = T.namePlaceholder || '';
    input.setAttribute('aria-describedby', 'pet-name-count');
    const counter = el('span', 'pet-name-count', fill(T.nameCount, { n: 0, max }));
    counter.id = 'pet-name-count';
    label.append(cap, input, counter);
    const chipRow = el('div', 'pet-chips');
    chips.forEach((c, i) => chipRow.append(el('span', 'pet-chip' + (i === chips.length - 1 ? ' fee' : ''), c)));
    const need = el('p', 'pet-need', T.nameNeeded);
    const row = el('div', 'notice-actions');
    const ok = el('button', 'btn intro-ok', okText);
    ok.type = 'button';
    const no = el('button', 'btn ghost', cancelText);
    no.type = 'button';
    row.append(ok, no);
    box.append(pic, el('h2', '', title), ...body, label, chipRow, need, row);
    back.append(box);
    root.append(back);

    const name = () => input.value.replace(/\s+/g, ' ').trim();
    const sync = () => {
      // 打注音時（還在選字）先不截，選好字再截成最多 max 個字
      if (count(input.value) > max) input.value = cut(input.value, max);
      counter.textContent = fill(T.nameCount, { n: count(name()), max });
      ok.disabled = !name();
      need.hidden = !!name();
    };
    input.addEventListener('input', (e) => { if (!e.isComposing) sync(); });
    input.addEventListener('compositionend', sync);
    sync();
    const close = () => back.remove();
    const cancel = () => { close(); onCancel(); };
    const submit = () => {
      sync();
      if (!name()) { input.focus(); return; }
      ok.disabled = true;
      close();
      onOk(name());
    };
    ok.addEventListener('click', submit);
    no.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); } });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    // 空白鍵、方向鍵是打字用的，不要讓小公主走路或「進入」
    back.addEventListener('keydown', (e) => e.stopPropagation());
    input.focus();
  }

  return { show, showGift };
}
