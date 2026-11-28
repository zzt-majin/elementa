// world/calendar.js
// 群島左上角的日曆（傳統臺灣撕日曆的樣子）：民國年、干支生肖、月份、節氣、大大的日期（週末和國定假日紅字）、
// 星期、農曆、日干支；下面是「今天生日」「今天是什麼日子」，點了跳出小視窗用小學生看得懂的話介紹。
// 日期和農曆在 engine/lunar.js 算，每天的名人和紀念日讀 content/calendar/月-日.md（engine/daybook.js）。
// 所有從檔案來的文字都用 textContent 放進畫面，不會被當成 HTML。
import { calendarDay } from '../engine/lunar.js';
import { parseDaybook, subtitleOf } from '../engine/daybook.js';

const NS = 'http://www.w3.org/2000/svg';
// 30 種圖案：本專案自己畫的簡單線條圖（viewBox 0 0 64 64），fill 的部分用 [d, 'fill'] 表示
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
  // 2026-11-27 晚上加的 12 種（11-28～11-30 用到的）
  皇冠: [['M10 46l-2-28 13 12 11-18 11 18 13-12-2 28z', '#f2b829'], ['M10 46h44v8H10z', '#ffd34d'], ['M32 34m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', '#e8506a']],
  帆船: [['M32 8v36', 'none'], ['M34 10c10 8 14 20 14 30H34z', '#fff'], ['M30 16c-6 6-10 14-10 24h10z', '#ffd3e0'], ['M8 44h48l-8 10H16z', '#d9a86c'], 'M4 58c5-2 8 2 13 0s8-2 13 0 8 2 13 0 8-2 13 0'],
  木筏: [['M8 40h48v8H8z', '#d9a86c'], 'M16 40v8M24 40v8M32 40v8M40 40v8M48 40v8', 'M32 40V12', ['M32 12l16 8-16 8z', '#e8506a'], 'M4 56c5-2 8 2 13 0s8-2 13 0 8 2 13 0 8-2 13 0'],
  獅子: [['M32 32m-22 0a22 22 0 1 0 44 0a22 22 0 1 0-44 0', '#f2b829'], ['M32 34m-13 0a13 13 0 1 0 26 0a13 13 0 1 0-26 0', '#ffe08a'], ['M27 30m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M37 30m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', '#3b2a30'], ['M29 37h6l-3 3z', '#3b2a30'], 'M32 40v3M28 44c2 2 6 2 8 0'],
  聲波: [['M8 26h8l10-10v32L16 38H8z', '#fff'], 'M34 24c4 4 4 12 0 16', 'M42 18c8 8 8 20 0 28', 'M50 12c11 11 11 29 0 40'],
  留聲機: [['M14 44h30v12H14z', '#d9a86c'], ['M18 42h22l-2-4H20z', '#3b2a30'], 'M29 38V28', ['M28 30L44 10c8 4 12 12 12 20z', '#f2b829'], 'M44 10l-4 8M50 14l-6 8M55 22l-8 6'],
  望遠鏡: [['M10 30l34-14 5 11-34 14z', '#c9e7ff'], ['M44 16l8-3 5 11-8 3z', '#fff'], 'M28 34l-10 22M30 34l4 22M29 34l-2 22', ['M8 30l4-2 5 11-4 2z', '#3b2a30']],
  放大鏡: [['M26 26m-16 0a16 16 0 1 0 32 0a16 16 0 1 0-32 0', '#e4f4ff'], 'M20 18a9 9 0 0 1 10-2', ['M37 37l6-6 15 15-6 6z', '#b07a4f']],
  鋼筆: [['M40 6l18 18-24 24-12 4 4-12z', '#7fa8e8'], ['M22 40l-8 16 16-8', '#f2b829'], 'M18 50l6-6', 'M34 12l18 18'],
  草帽: [['M6 42c0-6 52-6 52 0s-52 6-52 0z', '#f2d38a'], ['M18 40c0-14 4-22 14-22s14 8 14 22z', '#f2d38a'], ['M18 34h28v5H18z', '#e8506a'], 'M24 26l2 8M32 22v12M40 26l-2 8'],
  鎖頭: ['M20 30V20a12 12 0 0 1 24 0v10', ['M12 30h40v26H12z', '#f2b829'], ['M32 41m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0', '#3b2a30'], 'M32 45v5'],
  電腦: [['M8 10h48v32H8z', '#c9e7ff'], 'M8 36h48', ['M26 42h12l2 8H24z', '#fff'], ['M16 50h32v6H16z', '#fff'], 'M16 20l6 5-6 5M26 30h10'],
  // 2026-11-28 加的 19 種（12-01～12-15 用到的；別的寫法在 engine/daybook.js 的 ICON_ALIASES）
  獎盃: [['M20 10h24v14a12 12 0 0 1-24 0z', '#f2b829'], 'M20 14h-8c0 8 4 12 10 12M44 14h8c0 8-4 12-10 12', 'M32 36v10', ['M22 46h20v8H22z', '#d9a86c']],
  音符: [['M22 46m-7 0a7 6 0 1 0 14 0a7 6 0 1 0-14 0', '#3b2a30'], ['M46 40m-7 0a7 6 0 1 0 14 0a7 6 0 1 0-14 0', '#3b2a30'], 'M29 46V14l24-6v32', ['M29 14l24-6v8l-24 6z', '#3b2a30']],
  貓: [['M14 26l2-18 12 10h8l12-10 2 18c4 6 4 18-4 24-6 4-22 4-28 0-8-6-8-18-4-24z', '#f2b829'], ['M24 32m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M40 32m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', '#3b2a30'], ['M30 39h4l-2 3z', '#e88a8a'], 'M32 42c-2 3-6 3-8 1M32 42c2 3 6 3 8 1', 'M6 38l12 2M6 44l12-1M58 38l-12 2M58 44l-12-1'],
  燈泡: [['M32 6a16 16 0 0 0-10 28c3 3 4 6 4 10h12c0-4 1-7 4-10A16 16 0 0 0 32 6z', '#ffe08a'], ['M26 44h12v8H26z', '#d9d2cc'], 'M28 56h8', 'M28 30l4-6 4 6'],
  城堡: [['M10 24h8v-6h4v6h4v-6h12v6h4v-6h4v6h8v32H10z', '#fff'], ['M26 56V46a6 6 0 0 1 12 0v10z', '#d9a86c'], ['M15 32h6v6h-6zM43 32h6v6h-6z', '#c9e7ff'], 'M32 18V6', ['M32 6l10 4-10 4z', '#e8506a']],
  鴿子: [['M10 36c6-12 20-14 30-8l10-6-2 10c2 10-8 18-20 18-8 0-14-4-18-14z', '#fff'], ['M24 30c4-10 12-16 20-16-2 8-8 14-16 18z', '#fff'], ['M50 22l8-2-6 6z', '#f2b829'], ['M45 27m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0', '#3b2a30'], ['M6 46c4 0 8-2 10-6 0 4 2 8 6 8', '#9fdc8c']],
  天秤: ['M32 10v42', ['M20 52h24v6H20z', '#d9a86c'], 'M12 18h40', 'M12 18l-7 16M12 18l7 16M52 18l-7 16M52 18l7 16', ['M4 34h16a8 8 0 0 1-16 0zM44 34h16a8 8 0 0 1-16 0z', '#f2b829'], ['M32 10m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', '#f2b829']],
  商店: [['M10 26h44v30H10z', '#fff'], ['M8 26l4-14h40l4 14z', '#e8506a'], 'M19 12l-2 14M27 12l-1 14M37 12l1 14M45 12l2 14', ['M16 34h14v10H16z', '#c9e7ff'], ['M36 34h12v22H36z', '#d9a86c']],
  雕像: [['M32 18m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0', '#fff'], ['M20 44c0-10 6-16 12-16s12 6 12 16z', '#fff'], ['M16 44h32v6H16zM20 50h24v6H20z', '#d9d2cc']],
  鐵塔: ['M32 4v8', ['M28 12h8l10 44H18z', '#d9a86c'], 'M22 40h20M25 27h14', ['M26 56c0-8 12-8 12 0z', '#fff']],
  高山: [['M4 54l18-30 10 14 10-20 18 36z', '#9fdc8c'], ['M42 18l-6 12 4-2 4 4 4-4z', '#fff']],
  企鵝: [['M32 6c10 0 14 10 14 22s4 20-2 26H20c-6-6-2-14-2-26S22 6 32 6z', '#3b2a30'], ['M32 20c6 0 8 8 8 16s0 14-8 14-8-6-8-14 2-16 8-16z', '#fff'], ['M27 15m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M37 15m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', '#fff'], ['M29 21h6l-3 4z', '#f2b829'], ['M20 54h9l-4 5zM35 54h9l-4 5z', '#f2b829']],
  禮帽: [['M20 8h24v32H20z', '#3b2a30'], ['M8 40h48v6H8z', '#3b2a30'], ['M20 32h24v6H20z', '#e8506a'], ['M24 52l8 4 8-4v8l-8-4-8 4z', '#e8506a']],
  蠟燭: [['M24 26h16v30H24z', '#fff'], ['M32 6c6 6 6 12 0 16-6-4-6-10 0-16z', '#f2b829'], 'M32 22v4', ['M18 56h28v4H18z', '#d9a86c']],
  禮物: [['M10 26h44v10H10z', '#e8506a'], ['M14 36h36v20H14z', '#ff8fab'], 'M32 26v30', ['M32 26c-4-10-16-10-14-2 2 4 10 2 14 2zM32 26c4-10 16-10 14-2-2 4-10 2-14 2z', '#f2b829']],
  紅綠燈: [['M22 6h20v44H22z', '#3b2a30'], ['M32 15m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', '#e8506a'], ['M32 28m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', '#f2b829'], ['M32 41m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', '#3fbf7a'], 'M32 50v10'],
  禁止: [['M32 32m-22 0a22 22 0 1 0 44 0a22 22 0 1 0-44 0', '#e8506a'], ['M32 32m-15 0a15 15 0 1 0 30 0a15 15 0 1 0-30 0', '#fff'], ['M19 23l4-4 22 22-4 4z', '#e8506a']],
  冰箱: [['M16 6h32v52H16z', '#e4f4ff'], 'M16 24h32', 'M22 12v6M22 30v10'],
  對話框: [['M8 12h48v28H28l-12 12V40H8z', '#fff'], 'M18 22h28M18 30h18'],
};
// 圖案後面的圓形底色
const ICON_BG = { 功夫: '#ffe08a', 吉他: '#c9e7ff', 鍵盤: '#e3d6ff', 麥克風: '#ffd3e0', 書: '#fff2c9', 畫筆: '#ffe3ea', 教師: '#c9f0d2', 科學: '#d6f3ff', 地球: '#e4f4ff', 火箭: '#e3d6ff', 運動: '#c9f0d2', 電影: '#ffe3c9', 愛心: '#ffe3ea', 花: '#fff2c9', 樹: '#dff5d8', 旗子: '#ffe3ea', 蛋糕: '#fff2c9', 星星: '#fff2c9',
  皇冠: '#fff2c9', 帆船: '#d6f3ff', 木筏: '#d6f3ff', 獅子: '#ffe3c9', 聲波: '#e3d6ff', 留聲機: '#ffe3ea', 望遠鏡: '#e4f4ff', 放大鏡: '#dff5d8', 鋼筆: '#e3d6ff', 草帽: '#c9f0d2', 鎖頭: '#ffe08a', 電腦: '#e4f4ff',
  獎盃: '#fff2c9', 音符: '#e3d6ff', 貓: '#ffe3c9', 燈泡: '#fff2c9', 城堡: '#e4f4ff', 鴿子: '#d6f3ff', 天秤: '#ffe3c9', 商店: '#fff2c9', 雕像: '#e3d6ff', 鐵塔: '#e4f4ff', 高山: '#d6f3ff', 企鵝: '#d6f3ff', 禮帽: '#ffe3ea', 蠟燭: '#ffe3ea', 禮物: '#c9f0d2', 紅綠燈: '#e4f4ff', 禁止: '#fff2c9', 冰箱: '#dff5d8', 對話框: '#ffd3e0',
};

/** 祝賀畫面的橋（拱橋＋水＋星星） */
function bridgeArt() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', '84');
  svg.setAttribute('height', '84');
  svg.setAttribute('aria-hidden', 'true');
  const parts = [
    ['M4 44c8-14 48-14 56 0', 'none', '#b07a4f', 3], ['M6 40h52', 'none', '#b07a4f', 4],
    ['M12 40v-8M22 40v-12M32 40v-13M42 40v-12M52 40v-8', 'none', '#b07a4f', 2.5],
    ['M2 52c6-3 10 3 16 0s10-3 16 0 10 3 16 0 10-3 12 0', 'none', '#5fb8dc', 3],
    ['M32 6l2.5 5 5.5.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.5-.8z', '#ffd34d', '#3b2a30', 2],
  ];
  for (const [d, fillC, stroke, w] of parts) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', fillC); p.setAttribute('stroke', stroke);
    p.setAttribute('stroke-width', String(w)); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    svg.append(p);
  }
  return svg;
}

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
const BOOK = ['M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2z', 'M9 8h6M9 12h6'];
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
export function createCalendar(root, host, { text = {}, config = {}, fetchText, now = () => Date.now(), onDayChange } = {}) {
  const T = text;
  const tz = config.timeZone || 'Asia/Taipei';
  const folder = typeof config.folder === 'string' && /^[\w./-]*$/.test(config.folder) ? config.folder : 'content/calendar/';
  const books = new Map(); // 月-日 → { people, days }（讀過就記著）
  let shownKey = '';
  let todayKey = ''; // 真正的今天（換日、日記看這個）
  let offset = 0; // 往前往後看了幾天（0 = 今天）
  let dialog = null;
  let lastFocus = null;
  let info = null;
  let diary = { title: '', entries: [], fresh: '' }; // 日記：{ title, entries: [{ id, day: '2026-11-27', line }]（全部的日子）, fresh 剛寫進去、要閃一下的 id }
  let onDialogClose = null;

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

  /** 往前（-1）往後（+1）翻一頁；0 = 回到今天 */
  function go(step) {
    offset = step === 0 ? 0 : Math.max(-366, Math.min(366, offset + step));
    render();
    root.querySelector(step < 0 ? '.cal-prev' : step > 0 ? '.cal-next' : '.cal-prev')?.focus();
  }
  function navButton(cls, label, glyph, step) {
    const b = el('button', 'cal-nav-btn ' + cls, glyph);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', () => go(step));
    return b;
  }

  function render() {
    // 中午 12 點算，往前往後翻日子時不會被夏令時間之類的事影響
    todayKey = calendarDay(now(), { timeZone: tz, holidays: {} }).key;
    info = calendarDay(now() + offset * 86400000, { timeZone: tz, holidays: config.holidays || {} });
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
    // 左右箭頭：往前往後看別天（沒有那一天的 .md 檔，就只顯示日曆，不顯示名人和紀念日）
    const nav = el('div', 'cal-nav');
    nav.append(navButton('cal-prev', T.prevDay || '前一天', '◀', -1));
    if (offset) {
      const back = el('button', 'cal-today', T.backToday || '回到今天');
      back.type = 'button';
      back.addEventListener('click', () => go(0));
      nav.append(back);
    } else nav.append(el('span', 'cal-is-today', T.isToday || '今天'));
    nav.append(navButton('cal-next', T.nextDay || '後一天', '▶', 1));
    page.append(head, month, nav, body);
    if (offset) page.classList.add('other-day');
    const foot = el('div', 'cal-foot');
    foot.hidden = true;
    // 日記：翻到哪一天就放那一天的
    page.append(foot, renderDiary());
    root.replaceChildren(page);
    root.setAttribute('aria-label', fill(T.label, { date: info.rocText + info.monthZh + info.day + '日' + info.weekdayZh }));
    const key = info.key;
    bookOf(key).then((b) => { if (shownKey === key) renderFoot(foot, b); });
  }

  /** 現在顯示的那一天：'2026-11-27'（和日記的 day 一樣的寫法） */
  const shownDay = () => (info ? info.year + '-' + String(info.month).padStart(2, '0') + '-' + String(info.day).padStart(2, '0') : '');
  /** 日曆最下面的日記（橫線紙）：顯示的那一天完成的里程碑 */
  function renderDiary() {
    const box = el('div', 'cal-diary');
    if (!diary.title) { box.hidden = true; return box; }
    const t = el('div', 'cal-diary-title');
    t.append(smallIcon(BOOK), el('span', '', diary.title));
    box.append(t);
    const day = shownDay();
    const list = diary.entries.filter((e) => !e.day || e.day === day);
    if (!list.length) box.append(el('p', 'cal-diary-empty', offset ? (T.diaryEmptyOther || T.diaryEmpty) : T.diaryEmpty));
    for (const e of list) box.append(el('p', 'cal-diary-line' + (e.id === diary.fresh ? ' fresh' : ''), e.line));
    return box;
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

  function openDialog(nodes, label, opts = {}) {
    closeDialog(false);
    lastFocus = document.activeElement;
    onDialogClose = opts.onClose || null;
    const back = el('div', 'cal-back' + (opts.cls ? ' ' + opts.cls + '-back' : ''));
    const box = el('section', 'cal-dialog' + (opts.cls ? ' ' + opts.cls : ''));
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', label);
    const close = el('button', opts.closeCls || 'cal-close', opts.closeLabel || T.close);
    close.type = 'button';
    close.addEventListener('click', () => closeDialog());
    box.append(...nodes, close);
    if (opts.confetti) {
      // 彩帶：幾條彩色紙片從上面飄下來
      const colors = ['#ff7fa8', '#f5c842', '#7fd4f5', '#9fdc8c', '#d7c2ff'];
      for (let i = 0; i < 14; i++) {
        const c = el('span', 'cel-conf');
        c.style.left = (4 + i * 7) + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDelay = ((i * 0.37) % 2.4).toFixed(2) + 's';
        back.append(c);
      }
    }
    back.append(box);
    back.addEventListener('click', (e) => { if (e.target === back && !opts.modal) closeDialog(); });
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
    const done = onDialogClose;
    onDialogClose = null;
    done?.();
  }

  /** 祝賀畫面：m = { title, body, line }；按「寫進日記」（或 Esc）後呼叫 onDone */
  function celebrate(m, onDone) {
    const badge = el('div', 'cel-badge');
    badge.append(m.art === 'login' ? iconSvg('星星', 84) : bridgeArt());
    const note = el('div', 'cel-note');
    note.append(smallIcon(BOOK), el('span', '', T.willWrite), el('b', '', m.line));
    openDialog([badge, el('p', 'cel-kicker', T.milestone), el('h2', '', m.title), el('p', 'cel-body', m.body), note], m.title,
      { cls: 'cel', closeLabel: T.write, closeCls: 'btn cel-write', confetti: true, modal: true, onClose: onDone });
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
    if (k !== todayKey) { offset = 0; if (!dialog?.querySelector('.cel')) closeDialog(false); render(); onDayChange?.(); }
  }, 60000);

  return {
    render,
    celebrate,
    /** 日曆最下面的日記：title 例如「姐姐的日記」；entries 全部日子的 [{ id, day: '2026-11-27', line }]（只顯示翻到的那一天）；fresh 剛寫進去的 id（閃一下） */
    setDiary(title, entries, fresh = '') {
      diary = { title: title || '', entries: Array.isArray(entries) ? entries : [], fresh };
      const old = root.querySelector('.cal-diary');
      if (old) old.replaceWith(renderDiary());
    },
    isOpen: () => !!dialog,
    close: () => closeDialog(),
    /** 真正的今天（日記用；翻到別天也一樣是今天） */
    today: () => calendarDay(now(), { timeZone: tz, holidays: config.holidays || {} }),
    /** 現在顯示的那一天（檢查用） */
    shown: () => info,
    /** 往前往後翻：step = -1、1，0 = 回到今天 */
    go,
    stop: () => clearInterval(timer),
  };
}
