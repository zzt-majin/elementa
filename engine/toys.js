// engine/toys.js
// 寶箱和裝備（飛盤）：純邏輯，不碰畫面、不含小孩名字。
// 拿到的裝備記在建設本（engine/build.js，kind 'item'，key 'item-<代號>'，coins 0），會存到試算表「建設」工作表，
// 換裝置也看得到。寶箱在不在：蓋好第一座橋、還沒拿過寶箱裡的東西，就在。
// 「拿在手上」（使用中）只記在這台裝置，不上傳。
import { effectiveBuilds } from './build.js';

export const ITEM_PREFIX = 'item-';

const num = (v, def, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : def;
};
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

/** 把 config/toys.json 讀成規則；數字不合理就用預設 */
export function toyRules(raw = {}) {
  const r = isObj(raw) ? raw : {};
  const c = isObj(r.chest) ? r.chest : {};
  const f = isObj(r.frisbee) ? r.frisbee : {};
  const g = isObj(r.goddess) ? r.goddess : {};
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter((i) => isObj(i) && /^[a-z0-9-]{1,30}$/.test(String(i.code || '')))
    .map((i) => ({ code: i.code, name: String(i.name || i.code), blurb: String(i.blurb || ''), colors: isObj(i.colors) ? { ...i.colors } : {} }));
  const minD = num(f.minDistance, 3, 0.5, 100);
  return {
    slots: Math.round(num(r.slots, 4, 1, 12)),
    items,
    chest: {
      item: items.some((i) => i.code === c.item) ? c.item : items[0]?.code || '',
      afterBridges: Math.round(num(c.afterBridges, 1, 1, 20)),
      forward: num(c.forward, 1.8, 0, 20),
      side: num(c.side, 2.6, -20, 20),
      reach: num(c.reach, 2.2, 0.5, 10),
      openSeconds: num(c.openSeconds, 1.6, 0.2, 10),
    },
    frisbee: {
      chargeSeconds: num(f.chargeSeconds, 1.5, 0.1, 10),
      minDistance: minD,
      maxDistance: Math.max(minD, num(f.maxDistance, 20, 0.5, 200)),
      flySpeed: num(f.flySpeed, 13, 1, 100),
      height: num(f.height, 1.4, 0, 20),
      dogRange: num(f.dogRange, 15, 0, 200),
      catchRadius: num(f.catchRadius, 0.9, 0.1, 5),
      returnDistance: num(f.returnDistance, 1.1, 0.2, 5),
      pickupRadius: num(f.pickupRadius, 1, 0.2, 5),
      giveUp: num(f.giveUp, 8, 1, 60),
    },
    goddess: {
      bubbleSeconds: num(g.bubbleSeconds, 0.4, 0, 10),
      riseSeconds: num(g.riseSeconds, 0.6, 0.05, 10),
      talkSeconds: num(g.talkSeconds, 1.5, 0.1, 20),
      sinkSeconds: num(g.sinkSeconds, 0.6, 0.05, 10),
      rippleSeconds: num(g.rippleSeconds, 0.6, 0, 10),
      out: num(g.out, 3.2, 0.5, 30),
      size: num(g.size, 1.15, 0.2, 5),
      colors: isObj(g.colors) ? { ...g.colors } : {},
    },
  };
}

/** 裝備的代號 → 建設本的 key：frisbee → item-frisbee */
export const itemKey = (code) => ITEM_PREFIX + code;

/** 收下寶箱裡的東西：建設本的一筆（coins 0） */
export function itemRecord({ id, at, code }) {
  if (!/^[a-z0-9-]{1,30}$/.test(String(code || ''))) return null;
  return { id, at, kind: 'item', key: itemKey(code), coins: 0, gems: {} };
}

/** 這個小孩有哪些裝備（代號，照拿到的順序） */
export function ownedItems(builds) {
  return effectiveBuilds(builds).filter((b) => b.kind === 'item' && b.key.startsWith(ITEM_PREFIX)).map((b) => b.key.slice(ITEM_PREFIX.length));
}

/**
 * 寶箱在不在：蓋好 rules.chest.afterBridges 座橋、還沒拿過寶箱裡的東西。
 * 回傳 { show, bridge（第一座橋的建設紀錄，放寶箱用）, item }
 */
export function chestState(builds, rules) {
  const list = effectiveBuilds(builds);
  const bridges = list.filter((b) => b.kind === 'bridge');
  const item = rules?.chest?.item || '';
  const have = item && list.some((b) => b.kind === 'item' && b.key === itemKey(item));
  const show = !!item && !have && bridges.length >= (rules?.chest?.afterBridges || 1);
  return { show, bridge: bridges[0] || null, item };
}

/**
 * 寶箱放哪裡：line 是第一座橋（world/bridges.js 的 bridgeLine，a 在數學島那一頭、b 在另一頭、u 從 a 指向 b），
 * reachFrom 是那座橋有沒有從 a 那一頭走過去（一般是 true）。下橋往前 forward、往右邊 side，箱子面向橋。
 * 回傳 { x, z, face }
 */
export function chestSpot(line, rules, fromA = true) {
  const c = rules?.chest || {};
  const end = fromA ? line.b : line.a;
  const u = fromA ? line.u : { x: -line.u.x, z: -line.u.z };
  const right = { x: u.z, z: -u.x };
  const x = end.x + u.x * (c.forward ?? 1.8) + right.x * (c.side ?? 2.6);
  const z = end.z + u.z * (c.forward ?? 1.8) + right.z * (c.side ?? 2.6);
  return { x, z, face: Math.atan2(-u.x, -u.z) };
}

/** 按住 T 幾秒 → 蓄力（0～1） */
export function chargeOf(held, rules) {
  const s = rules?.frisbee?.chargeSeconds || 1.5;
  return Math.max(0, Math.min(1, (Number(held) || 0) / s));
}

/** 蓄力 → 丟多遠（公尺） */
export function throwDistance(charge, rules) {
  const f = rules?.frisbee || {};
  const lo = f.minDistance ?? 3;
  const hi = f.maxDistance ?? 20;
  const k = Math.max(0, Math.min(1, Number(charge) || 0));
  return lo + (hi - lo) * k;
}
