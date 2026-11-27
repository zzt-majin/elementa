// engine/daybook.js
// 讀每一天的名人生日和紀念日檔案（content/calendar/11-27.md），格式見 docs/日曆資料格式.md。
// 純文字處理，不碰畫面，可以用 node 測試。

export const ICONS = ['功夫', '吉他', '鍵盤', '麥克風', '書', '畫筆', '教師', '科學', '地球', '火箭', '運動', '電影', '愛心', '花', '樹', '旗子', '蛋糕', '星星',
  '皇冠', '帆船', '木筏', '獅子', '聲波', '留聲機', '望遠鏡', '放大鏡', '鋼筆', '草帽', '鎖頭', '電腦'];
/** 別的寫法也認得：「書本」就是「書」 */
export const ICON_ALIASES = { 書本: '書', 書籍: '書', 筆: '鋼筆', 船: '帆船', 王冠: '皇冠', 音波: '聲波', 筆電: '電腦' };

const FIELDS = { 外文名: 'foreign', 出生: 'born', 過世: 'died', 身分: 'role', 國家: 'country', 地方: 'place', 圖案: 'icon', 介紹: 'text', 小知識: 'fact' };
const MAX = { name: 30, foreign: 60, born: 10, died: 10, role: 40, country: 40, place: 60, icon: 10, text: 400, fact: 200 };

/** 檔案文字 → { people: [...], days: [...] }。看不懂的行跳過，不會出錯 */
export function parseDaybook(src, { maxPeople = 6, maxDays = 4 } = {}) {
  const people = [];
  const days = [];
  let cur = null;
  const lines = String(src || '').replace(/^﻿/, '').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const head = /^##\s*(生日|紀念日)[\s:：]+(.+)$/.exec(line);
    if (head) {
      cur = { kind: head[1] === '生日' ? 'birthday' : 'day', name: clip(head[2], MAX.name) };
      (cur.kind === 'birthday' ? people : days).push(cur);
      continue;
    }
    if (line.startsWith('#')) { cur = /^##\s/.test(line) ? null : cur; continue; }
    const kv = /^([^:：]{1,6})[:：]\s*(.*)$/.exec(line);
    if (!cur || !kv) continue;
    const key = FIELDS[kv[1].trim()];
    if (key) cur[key] = clip(kv[2], MAX[key]);
  }
  const fix = (x) => { const icon = ICON_ALIASES[x.icon] || x.icon; return { ...x, icon: ICONS.includes(icon) ? icon : '星星' }; };
  return {
    people: people.filter((p) => p.name && p.text).slice(0, maxPeople).map(fix),
    days: days.filter((d) => d.name && d.text).slice(0, maxDays).map(fix),
  };
}

/** 小視窗名字下面那行小字 */
export function subtitleOf(item, month, day) {
  if (item.kind === 'birthday') {
    const parts = [];
    const born = /^\d{1,4}$/.test(item.born || '') ? item.born : '';
    const died = /^\d{1,4}$/.test(item.died || '') ? item.died : '';
    if (born) parts.push(died ? born + '–' + died : born + ' 年 ' + month + ' 月 ' + day + ' 日生日');
    if (died) parts.push(month + ' 月 ' + day + ' 日生日');
    if (item.country) parts.push(item.country);
    if (item.role) parts.push(item.role);
    return parts.join('・');
  }
  return [item.place, month + ' 月 ' + day + ' 日'].filter(Boolean).join('・');
}

function clip(s, n) { return String(s).trim().slice(0, n); }
