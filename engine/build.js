// engine/build.js
// 建設帳本：蓋了哪些橋（之後的公路也放這裡）、各花了多少。純邏輯，不碰畫面、不含小孩名字。
// 歐巴幣餘額 = 作答紀錄賺的（engine/economy.js）− 這裡記的花費。
//
// 一筆建設（build）：{ id, at: 毫秒, kind: 'bridge', key: 'math-chinese', coins: 120, gems: { math: 0 } }
//   key 是「蓋在哪裡」：橋是「從哪座島-到哪座島」（subjects.json 的島代號）。
//   同一個 key 只算第一筆（兩台裝置沒連網時都按了蓋同一座橋，只扣一次錢）。
//   id 和送到試算表「建設」工作表的編號一樣，本機和雲端靠它合併。

export const KINDS = ['bridge', 'road'];

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
  return { id: b.id, at, kind: b.kind, key: b.key, coins, gems };
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

/** 這座橋現在能不能蓋：要有一頭已經走得到（從家開始一座一座連出去） */
export function canStart(bridge, reach) {
  return reach.has(bridge.from) || reach.has(bridge.to);
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
