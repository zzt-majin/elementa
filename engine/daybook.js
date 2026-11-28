// engine/daybook.js
// 讀每一天的名人生日和紀念日檔案（content/calendar/11-27.md），格式見 docs/日曆資料格式.md。
// 純文字處理，不碰畫面，可以用 node 測試。

export const ICONS = ['功夫', '吉他', '鍵盤', '麥克風', '書', '畫筆', '教師', '科學', '地球', '火箭', '運動', '電影', '愛心', '花', '樹', '旗子', '蛋糕', '星星',
  '皇冠', '帆船', '木筏', '獅子', '聲波', '留聲機', '望遠鏡', '放大鏡', '鋼筆', '草帽', '鎖頭', '電腦',
  '獎盃', '音符', '貓', '燈泡', '城堡', '鴿子', '天秤', '商店', '雕像', '鐵塔', '高山', '企鵝', '禮帽', '蠟燭', '禮物', '紅綠燈', '禁止', '冰箱', '對話框'];
/** 別的寫法也認得：「書本」就是「書」 */
export const ICON_ALIASES = { 書本: '書', 書籍: '書', 筆: '鋼筆', 船: '帆船', 王冠: '皇冠', 音波: '聲波', 筆電: '電腦',
  小提琴: '音符', 鋼琴: '音符', 耳機: '音符', 獎章: '獎盃', 電影場記板: '電影', 電影膠捲: '電影', 攝影機: '電影', 舞台: '電影', 羽毛筆: '鋼筆', 毛筆: '鋼筆', 百科全書: '書', 童話書: '書', 筆記本: '書', 古書卷軸: '書', 書架: '書', 晶片: '電腦', 大腦晶片: '電腦', 程式碼: '電腦', 滑鼠: '電腦', 遊戲手把: '電腦', 黃色花朵: '花', 花朵: '花', 康乃馨: '花', 幼苗: '樹', 綠葉地球: '地球', 地球樹葉: '地球', 地球對話: '地球', 愛心地球: '地球', 旗幟: '旗子', 國旗: '旗子', 綠星旗: '旗子', 探險旗幟: '旗子', 籃球: '運動', 溜冰鞋: '運動', 拳擊手套: '運動', 頭盔: '運動', 靴子: '運動', 原子: '科學', 顯微鏡: '科學', 疫苗針筒: '科學', 化石: '科學', 太空探測器: '火箭', 飛機: '火箭', 無線電波: '聲波', 調色盤: '畫筆', 畫框: '畫筆', 紅絲帶: '愛心', 握手: '愛心', 貓咪: '貓', 機器貓: '貓', 和平鴿: '鴿子', 高禮帽: '禮帽', 領結: '禮帽', 禮物襪: '禮物', 禁止標誌: '禁止', 棉花糖: '蛋糕', 餅乾: '蛋糕' };

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
