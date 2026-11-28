// 用 Node 跑：node tests/calendar.test.mjs
// 左上角的日曆：民國年、農曆、干支、節氣、國定假日（紅字）、讀每天的名人生日和紀念日檔案。
import { readFileSync } from 'node:fs';
import { calendarDay, termDay, numberZh } from '../engine/lunar.js';
import { parseDaybook, subtitleOf, ICONS } from '../engine/daybook.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const cfg = JSON.parse(readFileSync(new URL('../config/calendar.json', import.meta.url), 'utf8'));
const day = (iso, h = 4) => calendarDay(Date.parse(iso + 'T' + String(h).padStart(2, '0') + ':00:00Z'), { holidays: cfg.holidays });

// 2026-11-27（專案開始做日曆這天）
const d = day('2026-11-27');
ok(d.rocText === '中華民國一一五年' && d.roc === 115, '民國一一五年');
ok(d.yearGanzhi === '丙午' && d.animal === '馬', '丙午年屬馬');
ok(d.monthZh === '十一月' && d.monthEn === 'NOV', '十一月 NOV');
ok(d.weekdayZh === '星期五' && d.weekdayEn === 'FRIDAY', '星期五');
ok(d.lunarText === '農曆十月十九', '農曆十月十九：' + d.lunarText);
ok(d.dayGanzhi === '乙巳日', '乙巳日');
ok(d.term === '小雪' && !d.termToday, '小雪期間');
ok(!d.red && !d.holiday, '平日黑字');
ok(d.key === '11-27', '檔名 11-27');
// 台灣時間：UTC 11/27 17:00 已經是台灣 11/28
ok(day('2026-11-27', 17).day === 28, '照台灣時間換日');
// 週末、國定假日紅字
ok(day('2026-11-28').red, '星期六紅字');
ok(day('2026-10-10').holiday === '國慶日' && day('2026-10-10').red, '國慶日');
ok(day('2026-09-28').holiday === '教師節', '教師節 9/28 放假');
ok(day('2026-12-25').holiday === '行憲紀念日', '行憲紀念日');
ok(day('2026-02-16').holiday === '除夕' && day('2026-02-15').holiday === '小年夜', '2026 除夕 2/16、小年夜 2/15');
ok(day('2026-02-17').holiday === '春節' && day('2026-02-19').holiday === '春節' && !day('2026-02-20').holiday, '春節初一到初三');
ok(day('2026-06-19').holiday === '端午節' && day('2026-09-25').holiday === '中秋節', '端午 6/19、中秋 9/25');
ok(day('2026-04-05').holiday === '清明節' && day('2026-04-05').termToday, '清明 4/5');
ok(day('2027-02-06').holiday === '除夕' && day('2027-02-05').holiday === '小年夜', '2027 除夕 2/6（臘月三十）、小年夜 2/5');
ok(day('2025-07-25').lunarText === '農曆閏六月初一', '閏月');
// 節氣
ok(termDay(2026, 21) === 22 && termDay(2026, 20) === 7, '2026 小雪 11/22、立冬 11/7');
ok(termDay(2026, 3) === 18, '2026 雨水 2/18（公式要減 1 的年份）');
ok(termDay(2027, 23) === 22 && termDay(2026, 23) === 22, '冬至 12/22');
ok(day('2026-01-02').term === '冬至', '1 月初還在冬至期間（往回找到去年）');
ok(numberZh(115) === '一一五' && numberZh(120) === '一二〇', '民國年用國字');

// 每天的檔案
const book = parseDaybook(readFileSync(new URL('../content/calendar/11-27.md', import.meta.url), 'utf8'));
ok(book.people.map((p) => p.name).join('、') === '李小龍、吉米·罕醉克斯、小室哲哉', '11-27 三位生日');
ok(book.days.length === 1 && book.days[0].name === '教師節', '11-27 一個紀念日');
ok(book.people[0].icon === '功夫' && book.people[1].icon === '吉他' && book.days[0].icon === '教師', '圖案');
ok(book.people[0].text.startsWith('李小龍在美國出生') && book.people[0].fact, '介紹和小知識');
ok(subtitleOf(book.people[0], 11, 27) === '1940–1973・11 月 27 日生日・美國出生、香港長大・功夫明星', '有過世年：' + subtitleOf(book.people[0], 11, 27));
ok(subtitleOf(book.people[2], 11, 27) === '1958 年 11 月 27 日生日・日本・作曲家、音樂製作人', '還在世：' + subtitleOf(book.people[2], 11, 27));
ok(subtitleOf(book.days[0], 11, 27) === '西班牙、法國等歐洲國家・11 月 27 日', '紀念日小字');
// 容錯
const messy = parseDaybook('﻿# x\r\n## 生日：甲\r\n介紹:很好\r\n圖案：沒這個\r\n亂寫一行\r\n## 紀念日 乙\r\n地方：這裡\r\n## 其他東西\r\n介紹：不屬於任何一筆\r\n');
ok(messy.people.length === 1 && messy.people[0].icon === '星星' && messy.people[0].text === '很好', 'BOM、半形冒號、不認得的圖案');
ok(messy.days.length === 0, '沒有介紹的紀念日不顯示');
ok(parseDaybook('## 生日 A\n介紹：x\n'.repeat(9)).people.length === 6, '一天最多 6 位');
ok(parseDaybook('').people.length === 0 && parseDaybook(null).days.length === 0, '空檔案');
ok(parseDaybook('## 生日 A\n介紹：' + 'x'.repeat(900)).people[0].text.length === 400, '太長的字截斷');
ok(ICONS.length === 49, '49 種圖案');
ok(parseDaybook('## 生日 A\n圖案：書本\n介紹：x').people[0].icon === '書', '「書本」也認得（就是「書」）');
ok(parseDaybook('## 生日 A\n\n圖案：獅子\n\n介紹：x').people[0].icon === '獅子', '標題和欄位中間有空行也讀得到');
{
  // 家長寫的每一天（11-28～12-15）：每一筆的圖案都認得（不會變成星星）
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../content/calendar/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => /^\d\d-\d\d\.md$/.test(x))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    const raw = [...src.matchAll(/^圖案[:：]\s*(.+)$/gm)].map((m) => m[1].trim());
    const b = parseDaybook(src, { maxPeople: 6, maxDays: 4 });
    const got = [...b.people, ...b.days].map((x) => x.icon);
    ok(got.length === raw.length && got.every((i, k) => i !== '星星' || raw[k] === '星星'), f + ' 的圖案都認得：' + got.join('、'));
  }
}

console.log(`calendar: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
