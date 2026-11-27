// engine/diary.js
// 日記：小孩完成里程碑的那一天記一筆。現在的里程碑是「蓋好第幾座橋」，直接從建設本算出來
// （哪一天蓋了第幾座），所以不用另外存：建設本已經會存到試算表，換裝置也看得到。
// 之後別的里程碑（例如打倒魔王）也在這裡加一種。純計算，不碰畫面。
import { effectiveBuilds } from './build.js';
import { localDate } from './lunar.js';

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
 * 回傳 [{ id, day: '2026-11-27', title, body, line }]，照時間排好
 */
export function milestones({ builds = [], plan = [], names = {}, text = {}, timeZone = 'Asia/Taipei' }) {
  const out = [];
  let n = 0;
  for (const b of effectiveBuilds(builds)) {
    if (b.kind !== 'bridge') continue;
    n += 1;
    const d = localDate(b.at, timeZone);
    const p = plan.find((x) => x.key === b.key) || {};
    const vals = { nth: nthZh(n), m: d.month, d: d.day, from: names[p.from] || '', to: names[p.to] || '' };
    out.push({
      id: 'bridge-' + n,
      day: d.year + '-' + String(d.month).padStart(2, '0') + '-' + String(d.day).padStart(2, '0'),
      title: fill(text.bridgeTitle, vals),
      body: fill(text.bridgeBody, vals),
      line: fill(text.bridgeDiary, vals),
    });
  }
  return out;
}
