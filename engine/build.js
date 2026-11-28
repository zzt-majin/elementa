// engine/build.js
// 建設帳本：蓋了哪些橋、公路，買了哪些寵物，各花了多少。純邏輯，不碰畫面、不含小孩名字。
// 歐巴幣餘額 = 作答紀錄賺的（engine/economy.js）− 這裡記的花費。
//
// 一筆建設（build）：{ id, at: 毫秒, kind: 'bridge', key: 'math-chinese', coins: 120, gems: { math: 0 } }
//   key 是「蓋在哪裡」：橋是「從哪座島-到哪座島」（subjects.json 的島代號）。
//   同一個 key 只算第一筆（兩台裝置沒連網時都按了蓋同一座橋，只扣一次錢）。
//   id 和送到試算表「建設」工作表的編號一樣，本機和雲端靠它合併。
// 寵物（商店）也記在這裡：{ kind: 'pet', key: 'pet-tudog', coins: 100, name: '小黃' }，同一種只能買一隻；
//   每天的飼料和清潔費不記在這裡，由 engine/pets.js 從買的那一天算。

// login：那一天有來玩（engine/login.js 照這個算每日登入獎勵），coins 一定是 0
export const KINDS = ['bridge', 'road', 'pet', 'login'];
/** 連到姐妹群島的公路只有一條，兩人共有：代號固定是 road */
export const ROAD_KEY = 'road';

/** 整理一筆建設；不合格回傳 null */
export function cleanBuild(b) {
  if (!b || typeof b !== 'object') return null;
  const at = Number(b.at);
  if (typeof b.id !== 'string' || !/^[\w-]{1,40}$/.test(b.id)) return null;
  if (!KINDS.includes(b.kind) || typeof b.key !== 'string' || !/^[a-z0-9-]{1,60}$/.test(b.key)) return null;
  const coins = Math.floor(Number(b.coins));
  if (!Number.isFinite(at) || !(coins >= 0 && coins <= 100000)) return null;
  const gems = {};
  for (const [k, v] of Object.entries(obj(b.gems))) {
    const n = Math.floor(Number(v));
    if (/^[a-z0-9-]{1,30}$/.test(k) && n > 0 && n <= 100000) gems[k] = n;
  }
  const out = { id: b.id, at, kind: b.kind, key: b.key, coins, gems };
  if (b.kind === 'pet') out.name = cleanName(b.name);
  return out;
}

/** 寵物的名字：去掉控制字元、前後空白，最多 max 個字（一個中文字、一個表情符號都算一個字） */
export function cleanName(v, max = 16) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, max).join('').trim();
}

/** 同一個 key 只留最早的一筆（依時間、再依編號），回傳照時間排好的清單 */
export function effectiveBuilds(list) {
  const sorted = (Array.isArray(list) ? list : []).map(cleanBuild).filter(Boolean)
    .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const seen = new Set();
  return sorted.filter((b) => (seen.has(b.key) ? false : (seen.add(b.key), true)));
}

/**
 * 可以蓋哪些橋。subjects.json 有 bridges（[{ from, to }]）就照它；
 * 沒有就是「家（數學島）到每一座別的島各一座」。回傳 [{ key, from, to }]
 */
export function bridgePlan(subjects, home) {
  const codes = new Set((subjects?.islands || []).map((i) => i.code));
  const raw = Array.isArray(subjects?.bridges) && subjects.bridges.length
    ? subjects.bridges
    : [...codes].filter((c) => c !== home).map((to) => ({ from: home, to }));
  const out = [];
  const keys = new Set();
  for (const b of raw) {
    if (!b || !codes.has(b.from) || !codes.has(b.to) || b.from === b.to) continue;
    const key = b.from + '-' + b.to;
    if (keys.has(key) || keys.has(b.to + '-' + b.from)) continue;
    keys.add(key);
    out.push({ key, from: b.from, to: b.to });
  }
  return out;
}

/** 從家走得到哪些島（家＋蓋好的橋連過去的）。built 是蓋好的 key 的 Set */
export function reachable(plan, built, home) {
  const got = new Set([home]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const b of plan) {
      if (!built.has(b.key)) continue;
      if (got.has(b.from) && !got.has(b.to)) { got.add(b.to); grew = true; }
      if (got.has(b.to) && !got.has(b.from)) { got.add(b.from); grew = true; }
    }
  }
  return got;
}

/**
 * 下一座橋要多少：第 1 座 rule.coins，之後每多蓋一座多 rule.step（第 n 座 = coins + step × (n − 1)）。
 * builtCount：這個小孩已經蓋好幾座橋。回傳 { coins, gems, nth（這是第幾座） }
 */
export function bridgePrice(rule, builtCount) {
  const k = Math.max(0, Math.floor(Number(builtCount)) || 0);
  const base = Math.max(0, Number(rule?.coins) || 0);
  const step = Math.max(0, Number(rule?.step) || 0);
  return { coins: base + step * k, gems: { ...(rule?.gems || {}) }, nth: k + 1 };
}

/** 這座橋現在能不能蓋：要有一頭已經走得到（從家開始一座一座連出去） */
export function canStart(bridge, reach) {
  return reach.has(bridge.from) || reach.has(bridge.to);
}

/**
 * 公路蓋好了沒（兩人共有）：看全部小孩的建設本，誰最早蓋的就算誰的。
 * lists：{ 小孩: [build, …] }。回傳 { kid, build } 或 null。
 * 兩台裝置沒連網時兩個人都蓋了：只算最早的那一個人，另一個人的花費也照樣扣（兩人都按了確定）。
 */
export function sharedRoad(lists) {
  let best = null;
  for (const [kid, list] of Object.entries(obj(lists))) {
    const r = effectiveBuilds(list).find((b) => b.kind === 'road' && b.key === ROAD_KEY);
    if (r && (!best || r.at < best.build.at || (r.at === best.build.at && r.id < best.build.id))) best = { kid, build: r };
  }
  return best;
}

/** 公路的價錢：config/economy.json 的 build.road（歐巴幣＋寶石） */
export function roadPrice(rule) {
  const gems = {};
  for (const [k, v] of Object.entries(obj(rule?.gems))) { const n = Math.floor(Number(v)); if (n > 0) gems[k] = n; }
  return { coins: Math.max(0, Math.floor(Number(rule?.coins)) || 0), gems };
}

/**
 * 每個小孩的建設本。storage 要有 load() / save(obj)（和 engine/progress.js 一樣）。
 * 資料格式：{ 小孩: [build, …] }
 */
export function createBuildBook(storage) {
  let data = obj(storage.load());
  const listOf = (kid) => (Array.isArray(data[kid]) ? data[kid] : []);
  return {
    /** 全部的紀錄（含重複的） */
    list: (kid) => listOf(kid).slice(),
    /** 算數用的：同一個 key 只留一筆 */
    effective: (kid) => effectiveBuilds(listOf(kid)),
    /** 蓋好的 key */
    built: (kid) => new Set(effectiveBuilds(listOf(kid)).map((b) => b.key)),
    /** 公路（兩人共有）：kids 裡誰最早蓋的，回傳 { kid, build } 或 null */
    road: (kids) => sharedRoad(Object.fromEntries((kids || []).map((k) => [k, listOf(k)]))),
    /** 這台裝置剛蓋的。同一個 key 已經蓋過就不收，回傳 false */
    add(kid, build) {
      const b = cleanBuild(build);
      if (!kid || !b) return false;
      if (effectiveBuilds(listOf(kid)).some((x) => x.key === b.key) || listOf(kid).some((x) => x.id === b.id)) return false;
      data = { ...data, [kid]: [...listOf(kid), b] };
      storage.save(data);
      return true;
    },
    /** 合併試算表回傳的建設（同一個 id 只留一筆）。回傳有沒有多出新的 */
    merge(kid, remote) {
      if (!kid || !Array.isArray(remote)) return false;
      const have = new Set(listOf(kid).map((x) => x.id));
      const extra = [];
      for (const r of remote) {
        const b = cleanBuild(r);
        if (b && !have.has(b.id)) { have.add(b.id); extra.push(b); }
      }
      if (!extra.length) return false;
      data = { ...data, [kid]: [...listOf(kid), ...extra] };
      storage.save(data);
      return true;
    },
  };
}

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
