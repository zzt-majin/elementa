// engine/lunar.js
// 傳統臺灣日曆要的資料：西曆日期（照指定時區）、民國年、星期、農曆（用瀏覽器內建的農曆）、
// 年和日的干支、生肖、二十四節氣、國定假日（紅字）。純計算，不碰畫面，可以用 node 測試。

const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';
const ANIMALS = '鼠牛虎兔龍蛇馬羊猴雞狗豬';
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const WEEK_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTH_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const LUNAR_DAY = ['初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'];
const LUNAR_MONTH = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '臘月'];

// 二十四節氣（21 世紀公式：日 = floor(年尾兩位 × 0.2422 + C) − 閏年數），每個月兩個，從 1 月的小寒開始
const TERMS = [
  ['小寒', 5.4055], ['大寒', 20.12], ['立春', 3.87], ['雨水', 18.73], ['驚蟄', 5.63], ['春分', 20.646],
  ['清明', 4.81], ['穀雨', 20.1], ['立夏', 5.52], ['小滿', 21.04], ['芒種', 5.678], ['夏至', 21.37],
  ['小暑', 7.108], ['大暑', 22.83], ['立秋', 7.5], ['處暑', 23.13], ['白露', 7.646], ['秋分', 23.042],
  ['寒露', 8.318], ['霜降', 23.438], ['立冬', 7.438], ['小雪', 22.36], ['大雪', 7.18], ['冬至', 21.94],
];
// 公式算不準的年份（天文台實際日期）
const TERM_FIX = { '2019-0': -1, '2082-1': 1, '2026-3': -1, '2084-5': 1, '2008-9': 1, '2016-12': 1, '2002-14': 1, '2089-19': 1, '2089-20': 1, '2021-23': -1 };

/** 某年第 i 個節氣（0 = 小寒）是幾號；只算 2001～2099 年，其他年份回傳 0 */
export function termDay(year, i) {
  if (year < 2001 || year > 2099) return 0;
  const y = year % 100;
  const leaps = i < 4 ? Math.floor((y - 1) / 4) : Math.floor(y / 4);
  return Math.floor(y * 0.2422 + TERMS[i][1]) - leaps + (TERM_FIX[year + '-' + i] || 0);
}

/** 這一天的節氣：{ name 最近一個已經到的節氣, today 今天剛好是節氣嗎 } */
export function solarTerm(year, month, day) {
  for (let k = 0; k < 26; k++) {
    // 從這個月的第二個節氣往回找
    let idx = (month - 1) * 2 + 1 - k;
    let y = year;
    while (idx < 0) { idx += 24; y -= 1; }
    const m = Math.floor(idx / 2) + 1;
    const d = termDay(y, idx);
    if (!d) return null;
    if (y < year || m < month || (m === month && d <= day)) return { name: TERMS[idx][0], today: y === year && m === month && d === day };
  }
  return null;
}

/** 照時區拿到年月日、星期 */
export function localDate(ms, timeZone = 'Asia/Taipei', offsetHours = 8) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }).formatToParts(new Date(ms));
    const get = (t) => p.find((x) => x.type === t)?.value;
    const y = Number(get('year'));
    const m = Number(get('month'));
    const d = Number(get('day'));
    if (y && m && d) return { year: y, month: m, day: d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  } catch { /* 時區不認得：下面自己算 */ }
  const t = new Date(ms + offsetHours * 3600000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate(), weekday: t.getUTCDay() };
}

/** 農曆：{ month 1～12, leap 是不是閏月, day 1～30, yearName 干支（丙午） }；瀏覽器不支援農曆就回傳 null */
export function lunarOf(year, month, day) {
  try {
    const at = new Date(Date.UTC(year, month - 1, day, 4)); // 中午附近，不會跨日
    const num = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' }).formatToParts(at);
    const zh = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { timeZone: 'UTC', year: 'numeric', month: 'long' }).formatToParts(at);
    const mRaw = num.find((x) => x.type === 'month')?.value || '';
    const m = parseInt(mRaw, 10);
    const d = parseInt(num.find((x) => x.type === 'day')?.value || '', 10);
    const monthName = zh.find((x) => x.type === 'month')?.value || '';
    const yearName = zh.find((x) => x.type === 'yearName')?.value || '';
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 30)) return null;
    return { month: m, leap: /bis|閏/.test(mRaw + monthName), day: d, yearName };
  } catch {
    return null;
  }
}

/** 這一天的干支（用一個已知的日子往前往後數：2026-11-27 是乙巳日） */
export function dayGanzhi(year, month, day) {
  const diff = Math.round((Date.UTC(year, month - 1, day) - Date.UTC(2026, 10, 27)) / 86400000);
  const i = (((41 + diff) % 60) + 60) % 60;
  return STEMS[i % 10] + BRANCHES[i % 12];
}

/** 年的干支和生肖（農曆年；拿不到農曆就用西曆年粗算） */
export function yearGanzhi(year, lunar) {
  const name = lunar?.yearName && lunar.yearName.length === 2 ? lunar.yearName : (() => {
    const i = (((year - 4) % 60) + 60) % 60;
    return STEMS[i % 10] + BRANCHES[i % 12];
  })();
  return { name, animal: ANIMALS[BRANCHES.indexOf(name[1])] || '' };
}

/** 國定假日（放假的那一天，紅字）。holidays 是 config/calendar.json 的 holidays */
export function holidayOf(date, lunar, term, holidays = {}) {
  const md = String(date.month).padStart(2, '0') + '-' + String(date.day).padStart(2, '0');
  if (holidays.solar && holidays.solar[md]) return holidays.solar[md];
  if (term?.today && holidays.terms && holidays.terms[term.name]) return holidays.terms[term.name];
  if (lunar && !lunar.leap && holidays.lunar) {
    const lmd = String(lunar.month).padStart(2, '0') + '-' + String(lunar.day).padStart(2, '0');
    if (holidays.lunar[lmd]) return holidays.lunar[lmd];
    // 除夕和小年夜：明天、後天是不是正月初一（臘月有 29 天和 30 天兩種）
    const next = (n) => {
      const t = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
      return lunarOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    };
    if (lunar.month === 12 && lunar.day >= 28) {
      const n1 = next(1);
      if (n1 && n1.month === 1 && n1.day === 1 && !n1.leap && holidays.newYearsEve) return holidays.newYearsEve;
      const n2 = next(2);
      if (n2 && n2.month === 1 && n2.day === 1 && !n2.leap && holidays.dayBeforeEve) return holidays.dayBeforeEve;
    }
  }
  return '';
}

/** 日曆上要顯示的全部東西 */
export function calendarDay(ms, { timeZone = 'Asia/Taipei', holidays = {} } = {}) {
  const date = localDate(ms, timeZone);
  const lunar = lunarOf(date.year, date.month, date.day);
  const term = solarTerm(date.year, date.month, date.day);
  const yg = yearGanzhi(date.year, lunar);
  const holiday = holidayOf(date, lunar, term, holidays);
  return {
    ...date,
    key: String(date.month).padStart(2, '0') + '-' + String(date.day).padStart(2, '0'),
    roc: date.year - 1911,
    rocText: '中華民國' + numberZh(date.year - 1911) + '年',
    monthZh: MONTH_ZH[date.month - 1] + '月',
    monthEn: MONTH_EN[date.month - 1],
    weekdayZh: '星期' + WEEK[date.weekday],
    weekdayEn: WEEK_EN[date.weekday],
    lunarText: lunar ? '農曆' + (lunar.leap ? '閏' : '') + LUNAR_MONTH[lunar.month - 1] + LUNAR_DAY[lunar.day - 1] : '',
    yearGanzhi: yg.name,
    animal: yg.animal,
    dayGanzhi: dayGanzhi(date.year, date.month, date.day) + '日',
    term: term ? term.name : '',
    termToday: !!term?.today,
    holiday,
    red: date.weekday === 0 || date.weekday === 6 || !!holiday,
  };
}

/** 民國年用國字一個一個念：115 → 一一五（傳統日曆的寫法） */
export function numberZh(n) {
  const d = '〇一二三四五六七八九';
  return String(n).split('').map((c) => d[Number(c)] ?? c).join('');
}
