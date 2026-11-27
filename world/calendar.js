// world/calendar.js
// 群島左上角的日曆（傳統臺灣撕日曆的樣子）：民國年、干支生肖、月份、節氣、大大的日期（週末和國定假日紅字）、
// 星期、農曆、日干支；下面是「今天生日」「今天是什麼日子」，點了跳出小視窗用小學生看得懂的話介紹。
// 日期和農曆在 engine/lunar.js 算，每天的名人和紀念日讀 content/calendar/月-日.md（engine/daybook.js）。
// 所有從檔案來的文字都用 textContent 放進畫面，不會被當成 HTML。
import { calendarDay } from '../engine/lunar.js';
import { parseDaybook, subtitleOf } from '../engine/daybook.js';

const NS = 'http://www.w3.org/2000/svg';
// 18 種圖案：本專案自己畫的簡單線條圖（viewBox 0 0 64 64），fill 的部分用 [d, 'fill'] 表示
const ICON_PATHS = {
  功夫: ['M38 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0', 'M36 19l-6 16 10 8 4 14', 'M30 35l-12 10', 'M34 24l14-4', 'M34 24l-16-6', ['M23 31h16v5H23z', '#f2b829']],
  吉他: ['M40 10l14 14', 'M44 14L28 30', ['M28 30c-6-4-14-2-16 4-2 5 2 8 1 12s3 9 8 8 6-6 10-6 9-3 8-10-5-6-11-8z', '#fff'], 'M24 42m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'],
  鍵盤: [['M8 20h48v26H8z', '#fff'], 'M16 20v26M24 20v26M32 20v26M40 20v26M48 20v26', ['M14 20h4v14h-4zM22 20h4v14h-4zM38 20h4v14h-4zM46 20h4v14h-4z', '#3b2a30']],
  麥克風: [['M24 8h16v24a8 8 0 0 1-16 0z', '#fff'], 'M16 30a16 16 0 0 0 32 0', 'M32 46v10M22 56h20'],
  書: [['M8 14c8-3 16-3 24 2v36c-8-5-16-5-24-2z', '#fff'], ['M56 14c-8-3-16-3-24 2v36c8-5 16-5 24-2z', '#fff']],
  畫筆: ['M48 8l8 8-26 26-10 2 2-10z', ['M14 46c-6 2-6 8-8 10 6 0 12-2 14-6', '#e8506a']],
  教師: [['M8 46l24 8 24-8V22l-24 8-24-8z', '#fff'], 'M32 30v24', ['M32 16m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', '#e8506a'], 'M32 8c0-3 2-5 5-5'],
  科學: ['M24 8h16', 'M27 8v16L12 52a4 4 0 0 0 4 6h32a4 4 0 0 0 4-6L37 24V8', ['M17 44h30l4 8a2 2 0 0 1-2 3H15a2 2 0 0 1-2-3z', '#7fd4f5']],
  地球: [['M32 32m-22 0a22 22 0 1 0 44 0a22 22 0 1 0-44 0', '#c9e7ff'], ['M20 18c6 2 8 8 4 12s2 8 6 10-2 10-6 12', '#9fdc8c'], ['M40 14c-4 6 4 8 8 12s-2 10 4 12', '#9fdc8c']],
  火箭: [['M32 6c10 8 12 22 8 34H24C20 28 22 14 32 6z', '#fff'], 'M32 22m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'M24 40l-8 10 10-2M40 40l8 10-10-2', ['M28 44h8l-4 12z', '#f2b829']],
  運動: [['M32 32m-22 0a22 22 0 1 0 44 0a22 22 0 1 0-44 0', '#fff'], 'M32 10v44M10 32h44', 'M16 16c8 8 8 24 0 32M48 16c-8 8-8 24 0 32'],
  電影: [['M8 20h48v32H8z', '#fff'], 'M8 20l6-10h40l-6 10', 'M22 10l-6 10M34 10l-6 10M46 10l-6 10', ['M28 30l12 6-12 6z', '#3b2a30']],
  愛心: [['M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z', '#ff8fab']],
  花: [['M32 20m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M20 28m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M44 28m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M25 40m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M39 40m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0', '#ffb7c5'], ['M32 31m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', '#f2b829'], 'M32 48v12'],
  樹: [['M32 6L12 34h12L14 48h36L40 34h12z', '#9fdc8c'], 'M32 48v12'],
  旗子: ['M14 58V6', ['M14 8h34l-8 10 8 10H14', '#e8506a']],
  蛋糕: [['M10 34h44v22H10z', '#fff'], 'M10 42c6 4 10 4 14 0s10-4 14 0 10 4 16 0', 'M22 34v-8M32 34v-8M42 34v-8', ['M22 20c-2-2-2-4 0-6 2 2 2 4 0 6zM32 20c-2-2-2-4 0-6 2 2 2 4 0 6zM42 20c-2-2-2-4 0-6 2 2 2 4 0 6z', '#f2b829']],
  星星: [['M32 6l7 16 18 2-13 12 4 18-16-9-16 9 4-18L7 24l18-2z', '#ffd34d']],
};
// 圖案後面的圓形底色
const ICON_BG = { 功夫: '#ffe08a', 吉他: '#c9e7ff', 鍵盤: '#e3d6ff', 麥克風: '#ffd3e0', 書: '#fff2c9', 畫筆: '#ffe3ea', 教師: '#c9f0d2', 科學: '#d6f3ff', 地球: '#e4f4ff', 火箭: '#e3d6ff', 運動: '#c9f0d2', 電影: '#ffe3c9', 愛心: '#ffe3ea', 花: '#fff2c9', 樹: '#dff5d8', 旗子: '#ffe3ea', 蛋糕: '#fff2c9', 星星: '#fff2c9' };

/** 畫一個圖案（SVG） */
export function iconSvg(name, size = 60) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  for (const p of ICON_PATHS[name] || ICON_PATHS.星星) {
    const path = document.createElementNS(NS, 'path');
    const [d, fill] = Array.isArray(p) ? p : [p, 'none'];
    path.setAttribute('d', d);
    path.setAttribute('fill', fill);
    path.setAttribute('stroke', '#3b2a30');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}

const CAKE = ['M4 21h16v-8H4z', 'M4 16c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 4 0', 'M12 13V9', 'M12 6.5c.8-1 .8-2 0-3-.8 1-.8 2 0 3z'];
const FLAG = ['M5 21V4', 'M5 4h12l-2 4 2 4H5'];
function smallIcon(paths) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

/**
 * root：日曆放在哪（#calendar）；host：小視窗放在哪（#hud）；text：config/text.json 的 calendar；
 * config：config/calendar.json；fetchText(url) → 檔案文字或 null（沒有檔案）
 */
export function createCalendar(root, host, { text = {}, config = {}, fetchText, now = () => Date.now() } = {}) {
  const T = text;
  const tz = config.timeZone || 'Asia/Taipei';
  const folder = typeof config.folder === 'string' && /^[\w./-]*$/.test(config.folder) ? config.folder : 'content/calendar/';
  const books = new Map(); // 月-日 → { people, days }（讀過就記著）
  let shownKey = '';
  let dialog = null;
  let lastFocus = null;
  let info = null;

  const el = (tag, cls, content) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  };
  const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

  async function bookOf(key) {
    if (books.has(key)) return books.get(key);
    let src = null;
    try { src = await fetchText(folder + key + '.md'); } catch { src = null; }
    const b = parseDaybook(src || '', { maxPeople: config.maxPeople, maxDays: config.maxDays });
    books.set(key, b);
    return b;
  }

  function render() {
    info = calendarDay(now(), { timeZone: tz, holidays: config.holidays || {} });
    shownKey = info.key;
    const page = el('div', 'cal-page' + (info.red ? ' red' : ''));
    // 上面紅色年份條（兩個裝訂孔）
    const head = el('div', 'cal-head');
    head.append(el('span', 'cal-hole left'), el('span', 'cal-hole right'), el('div', 'cal-roc', info.rocText));
    head.append(el('div', 'cal-gz', fill(T.yearLine, { y: info.year, gz: info.yearGanzhi, animal: info.animal })));
    const month = el('div', 'cal-month');
    const mz = el('span', 'cal-month-zh', info.monthZh + ' ');
    mz.append(el('small', '', info.monthEn));
    month.append(mz, el('span', 'cal-term' + (info.termToday ? ' today' : ''), info.term));
    // 中間：直寫農曆｜大日期、星期｜直寫日干支
    const body = el('div', 'cal-body');
    const mid = el('div', 'cal-mid');
    mid.append(el('div', 'cal-day', String(info.day)), el('div', 'cal-week', info.weekdayZh), el('div', 'cal-week-en', info.weekdayEn));
    if (info.holiday) mid.append(el('div', 'cal-holiday', info.holiday));
    body.append(el('div', 'cal-lunar', info.lunarText), mid, el('div', 'cal-daygz', info.dayGanzhi));
    page.append(head, month, body);
    const foot = el('div', 'cal-foot');
    foot.hidden = true;
    page.append(foot);
    root.replaceChildren(page);
    root.setAttribute('aria-label', fill(T.label, { date: info.rocText + info.monthZh + info.day + '日' + info.weekdayZh }));
    const key = info.key;
    bookOf(key).then((b) => { if (shownKey === key) renderFoot(foot, b); });
  }

  function chip(item, cls) {
    const b = el('button', 'cal-chip ' + cls, item.name);
    b.type = 'button';
    b.addEventListener('click', () => openItem(item));
    return b;
  }

  function renderFoot(foot, b) {
    if (!b.people.length && !b.days.length) { foot.hidden = true; return; }
    foot.hidden = false;
    foot.replaceChildren();
    // 電腦、平板：直接列出人名和節日
    const full = el('div', 'cal-lists');
    if (b.people.length) {
      const t = el('div', 'cal-sec birthday');
      t.append(smallIcon(CAKE), el('span', '', T.birthdays));
      const row = el('div', 'cal-chips');
      for (const p of b.people) row.append(chip(p, 'birthday'));
      full.append(t, row);
    }
    if (b.days.length) {
      const t = el('div', 'cal-sec day');
      t.append(smallIcon(FLAG), el('span', '', T.days));
      const row = el('div', 'cal-chips');
      for (const d of b.days) row.append(chip(d, 'day'));
      full.append(t, row);
    }
    // 手機：一個按鈕，按了列出全部
    const more = el('button', 'cal-more', fill(T.more, { n: b.people.length + b.days.length }));
    more.type = 'button';
    more.addEventListener('click', () => openList(b));
    foot.append(full, more);
  }

  function openDialog(nodes, label) {
    closeDialog(false);
    lastFocus = document.activeElement;
    const back = el('div', 'cal-back');
    const box = el('section', 'cal-dialog');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', label);
    const close = el('button', 'cal-close', T.close);
    close.type = 'button';
    close.addEventListener('click', () => closeDialog());
    box.append(...nodes, close);
    back.append(box);
    back.addEventListener('click', (e) => { if (e.target === back) closeDialog(); });
    back.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDialog(); }
      if (e.key === 'Tab') {
        // 焦點留在小視窗裡
        const f = [...box.querySelectorAll('button')];
        if (!f.length) return;
        const i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    host.append(back);
    dialog = back;
    (box.querySelector('.cal-pick') || close).focus();
  }

  function closeDialog(restore = true) {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
    if (restore && lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  function openItem(item) {
    const head = el('div', 'cal-d-head');
    const badge = el('div', 'cal-badge');
    badge.style.background = ICON_BG[item.icon] || '#fff2c9';
    badge.append(iconSvg(item.icon, 60));
    const names = el('div', 'cal-d-names');
    names.append(el('h2', '', item.name));
    if (item.foreign) names.append(el('p', 'cal-d-foreign', item.foreign));
    names.append(el('p', 'cal-d-sub', subtitleOf(item, info.month, info.day)));
    head.append(badge, names);
    const nodes = [head, el('p', 'cal-d-text', item.text)];
    if (item.fact) {
      const f = el('div', 'cal-d-fact');
      f.append(el('b', '', T.fact), item.fact);
      nodes.push(f);
    }
    openDialog(nodes, item.name);
  }

  function openList(b) {
    const nodes = [el('h2', '', fill(T.listTitle, { m: info.month, d: info.day }))];
    const add = (title, items, cls) => {
      if (!items.length) return;
      nodes.push(el('h3', 'cal-l-title ' + cls, title));
      const row = el('div', 'cal-chips big');
      for (const x of items) {
        const b2 = chip(x, cls + ' cal-pick');
        row.append(b2);
      }
      nodes.push(row);
    };
    add(T.birthdays, b.people, 'birthday');
    add(T.days, b.days, 'day');
    openDialog(nodes, fill(T.listTitle, { m: info.month, d: info.day }));
  }

  render();
  // 換日：每分鐘看一下日期有沒有變（過了台灣時間半夜 12 點就換一頁）
  const timer = setInterval(() => {
    const k = calendarDay(now(), { timeZone: tz, holidays: {} }).key;
    if (k !== shownKey) { closeDialog(false); render(); }
  }, 60000);

  return {
    render,
    isOpen: () => !!dialog,
    close: () => closeDialog(),
    /** 檢查用：今天的資料 */
    today: () => info,
    stop: () => clearInterval(timer),
  };
}
