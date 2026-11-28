// engine/login.js
// 每日登入獎勵和累計登入成就。純計算，不碰畫面、不含小孩名字。
//
// 那一天有沒有來玩（小公主走動、點島或建築）記成建設本的一筆 { kind: 'login', key: 'login-20261128', coins: 0 }，
// 和橋、寵物一樣存到試算表「建設」工作表（類型「登入」），換裝置也看得到；同一天只記一筆。
// 歐巴幣不另外記：每次都從這些紀錄照 config/economy.json 的 login 重新算。
//
// 每日獎勵（2026-11-28 家長定）：一輪 7 天，第 1～5 天各 10、第 6 天 50、第 7 天 100，然後再從第 1 天開始。
//   中間有一天沒來，就從第 1 天重來。
// 累計登入成就：有來玩的天數加總（斷掉不歸零）。50 天、100 天、200 天，之後每 100 天一次，
//   跳出祝賀、寫進日記、給歐巴幣（50 天 100，之後每次 200）。
import { localDate } from './lunar.js';

export const LOGIN_PREFIX = 'login-';

export const LOGIN_DEFAULTS = {
  cycle: [10, 10, 10, 10, 10, 50, 100],
  milestones: [{ days: 50, coins: 100 }, { days: 100, coins: 200 }],
  every: 100,
  everyCoins: 200,
};

/** 把 config/economy.json 的 login 讀成規則；數字不合理就用預設 */
export function loginRules(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const D = LOGIN_DEFAULTS;
  const n = (v, min, max) => (v !== '' && v !== null && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : null);
  const cycle = Array.isArray(r.cycle) && r.cycle.length >= 1 && r.cycle.length <= 31 && r.cycle.every((v) => n(v, 0, 10000) !== null)
    ? r.cycle.map((v) => n(v, 0, 10000)) : D.cycle.slice();
  let milestones = Array.isArray(r.milestones)
    ? r.milestones.map((m) => ({ days: n(m?.days, 1, 100000), coins: n(m?.coins, 0, 100000) })).filter((m) => m.days !== null && m.coins !== null)
    : null;
  if (!milestones || !milestones.length) milestones = D.milestones.map((m) => ({ ...m }));
  milestones.sort((a, b) => a.days - b.days);
  milestones = milestones.filter((m, i) => i === 0 || m.days !== milestones[i - 1].days);
  return {
    cycle,
    milestones,
    every: n(r.every, 0, 100000) ?? D.every, // 0 = 最後一個成就以後就沒有了
    everyCoins: n(r.everyCoins, 0, 100000) ?? D.everyCoins,
  };
}

const pad = (v) => String(v).padStart(2, '0');
/** 某個時間是哪一天：{ day: '2026-11-28', num: 從 1970-01-01 起第幾天, m, d } */
function dayOf(ms, timeZone) {
  const d = localDate(ms, timeZone);
  return { day: d.year + '-' + pad(d.month) + '-' + pad(d.day), num: Math.round(Date.UTC(d.year, d.month - 1, d.day) / 86400000), m: d.month, d: d.day };
}

/** 那一天的代號：login-20261128 */
export function loginKey(ms, timeZone = 'Asia/Taipei') {
  return LOGIN_PREFIX + dayOf(ms, timeZone).day.replace(/-/g, '');
}

/** 今天來玩的紀錄（放進建設本） */
export function loginRecord({ id, at, timeZone = 'Asia/Taipei' }) {
  return { id, at, kind: 'login', key: loginKey(at, timeZone), coins: 0, gems: {} };
}

/** 累計第幾天要給成就：回傳 { days, coins } 或 null */
export function milestoneAt(count, rules) {
  const r = rules || loginRules({});
  const m = r.milestones.find((x) => x.days === count);
  if (m) return { days: m.days, coins: m.coins };
  const last = r.milestones[r.milestones.length - 1];
  if (r.every > 0 && last && count > last.days && (count - last.days) % r.every === 0) return { days: count, coins: r.everyCoins };
  return null;
}

/**
 * builds：這個小孩的建設紀錄（只看 kind 'login'）。
 * 回傳 {
 *   days: [{ id, key, day, at, n 這一輪第幾天, coins 每日獎勵 }]（照日期排）,
 *   count 累計來玩幾天, streak 最後一天是這一輪第幾天,
 *   milestones: [{ id: 'login-50', days, coins, day, at, m, d }],
 *   coins 全部獎勵加起來, bonuses: [{ id, coins }]（給 economy.computeWallet）
 * }
 */
export function loginSummary({ builds = [], rules, timeZone = 'Asia/Taipei' } = {}) {
  const r = rules || loginRules({});
  const seen = new Map(); // 同一天只算最早的一筆
  for (const b of Array.isArray(builds) ? builds : []) {
    if (!b || b.kind !== 'login' || !Number.isFinite(Number(b.at))) continue;
    const at = Number(b.at);
    const d = dayOf(at, timeZone);
    const old = seen.get(d.day);
    if (!old || at < old.at) seen.set(d.day, { id: String(b.id || ''), at, ...d });
  }
  const list = [...seen.values()].sort((a, b) => a.num - b.num);
  const days = [];
  const milestones = [];
  const bonuses = [];
  let n = 0;
  let prev = null;
  for (const x of list) {
    n = prev !== null && x.num === prev + 1 ? (n % r.cycle.length) + 1 : 1; // 斷掉一天就從第 1 天重來
    prev = x.num;
    const coins = r.cycle[n - 1] || 0;
    days.push({ id: x.id, key: LOGIN_PREFIX + x.day.replace(/-/g, ''), day: x.day, at: x.at, n, coins });
    bonuses.push({ id: 'login-day-' + x.day, coins });
    const ms = milestoneAt(days.length, r);
    if (ms) {
      milestones.push({ id: 'login-' + ms.days, days: ms.days, coins: ms.coins, day: x.day, at: x.at, m: x.m, d: x.d });
      bonuses.push({ id: 'login-' + ms.days, coins: ms.coins });
    }
  }
  return {
    days,
    count: days.length,
    streak: n,
    milestones,
    coins: bonuses.reduce((s, b) => s + b.coins, 0),
    bonuses,
  };
}

/** 明天再來會拿多少（今天是這一輪第 n 天） */
export function nextReward(n, rules) {
  const r = rules || loginRules({});
  return r.cycle[(Math.max(0, n) % r.cycle.length)] || 0;
}
