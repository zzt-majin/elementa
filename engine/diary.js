// engine/diary.js
// 日記：小孩完成里程碑的那一天記一筆。現在的里程碑是「蓋好第幾座橋」「蓋好公路」「買了寵物」「累計登入 50、100…天」，直接從建設本算出來
// （哪一天蓋了第幾座），所以不用另外存：建設本已經會存到試算表，換裝置也看得到。
// 之後別的里程碑（例如打倒魔王）也在這裡加一種。純計算，不碰畫面。
import { effectiveBuilds } from './build.js';
import { localDate } from './lunar.js';
import { loginSummary } from './login.js';

const NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
/** 1 → 一、12 → 十二 */
export function nthZh(n) {
  if (n <= 10) return NUM[n] || String(n);
  if (n < 20) return '十' + NUM[n - 10];
  if (n < 100) return NUM[Math.floor(n / 10)] + '十' + (n % 10 ? NUM[n % 10] : '');
  return String(n);
}

const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

/**
 * builds：這個小孩的建設紀錄；plan：bridgePlan()（找兩頭的島）；names：島代號 → 島名；
 * text：config/text.json 的 calendar（bridgeTitle、bridgeBody、bridgeDiary）。
 * other：公路通到誰的群島（姐妹的稱呼）；breeds：寵物種類代號 → 名字（臺灣土狗），pet 開頭的文字是買寵物的。
 * 回傳 [{ id, day: '2026-11-27', title, body, line }]，照時間排好
 */
export function milestones({ builds = [], plan = [], names = {}, text = {}, timeZone = 'Asia/Taipei', other = '', breeds = {}, login = null }) {
  const out = [];
  // 累計登入 50、100、200…天（login 是 engine/login.js 的 loginRules()；沒給就不算）
  if (login) {
    for (const m of loginSummary({ builds, rules: login, timeZone }).milestones) {
      const vals = { m: m.m, d: m.d, n: m.days, coins: m.coins };
      out.push({ id: m.id, day: m.day, at: m.at, art: 'login', title: fill(text.loginTitle, vals), body: fill(text.loginBody, vals), line: fill(text.loginDiary, vals) });
    }
  }
  let n = 0;
  const dayOf = (d) => d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0');
  for (const b of effectiveBuilds(builds)) {
    if (b.kind === 'pet') {
      // 買了寵物：「11/28 買了臺灣土狗小黃！」
      const d = localDate(b.at, timeZone);
      const code = b.key.replace(/^pet-/, '');
      const vals = { m: d.month, d: d.day, breed: breeds[code] || '', name: b.name || '' };
      out.push({ id: b.key, day: dayOf(d), at: b.at, title: fill(text.petTitle, vals), body: fill(text.petBody, vals), line: fill(text.petDiary, vals) });
      continue;
    }
    if (b.kind === 'road') {
      // 公路（連到姐妹的群島）：other 是對方的稱呼
      const d = localDate(b.at, timeZone);
      const vals = { m: d.month, d: d.day, other };
      out.push({
        id: 'road',
        at: b.at,
        day: d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0'),
        title: fill(text.roadTitle, vals),
        body: fill(text.roadBody, vals),
        line: fill(text.roadDiary, vals),
      });
      continue;
    }
    if (b.kind !== 'bridge') continue;
    n += 1;
    const d = localDate(b.at, timeZone);
    const p = plan.find((x) => x.key === b.key) || {};
    const vals = { nth: nthZh(n), m: d.month, d: d.day, from: names[p.from] || '', to: names[p.to] || '' };
    out.push({
      id: 'bridge-' + n,
      at: b.at,
      day: d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0'),
      title: fill(text.bridgeTitle, vals),
      body: fill(text.bridgeBody, vals),
      line: fill(text.bridgeDiary, vals),
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
