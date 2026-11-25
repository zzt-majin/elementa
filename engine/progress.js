// engine/progress.js
// 每個小孩每一關的最佳成績：{ best: 答對題數, used: 用了幾秒, perfectAt: 第一次全對的時間 }。
// 只管規則，不管存在哪裡：storage 由外面傳進來（這台裝置的 localStorage、
// 日後的 Google 試算表同步都可以接）。錯題重練不算進最佳成績，和清單版一樣。

const keyOf = (kid, levelId) => (kid || '') + ':' + levelId;

/** a 比 b 好嗎？答對多的好；一樣多時用時短的好 */
export function isBetter(a, b) {
  return !b || a.best > b.best || (a.best === b.best && a.used < b.used);
}

/**
 * storage 要有 load() 回傳物件、save(obj) 存起來。
 * 沒傳就只存在記憶體裡（重新整理就不見）。
 */
export function createProgress(storage = memoryStorage()) {
  let data = safe(storage.load());

  return {
    /** 某個小孩某一關的紀錄，沒有回傳 null */
    get(kid, levelId) { return data[keyOf(kid, levelId)] || null; },

    /**
     * 交卷後呼叫。回傳 { record, improved, firstTry, firstPerfect }，
     * 給日後發歐巴幣、打小怪的模組判斷用。
     */
    record(kid, levelId, result) {
      const k = keyOf(kid, levelId);
      const old = data[k] || null;
      const info = { record: old, improved: false, firstTry: !old, firstPerfect: false };
      if (result.retry) return info;
      const next = { best: result.score, used: result.used, total: result.total, perfectAt: old?.perfectAt || '' };
      if (result.perfect && !next.perfectAt) { next.perfectAt = result.at; info.firstPerfect = true; }
      if (isBetter(next, old)) { data[k] = next; info.improved = true; }
      else if (next.perfectAt && !old.perfectAt) data[k] = { ...old, perfectAt: next.perfectAt };
      info.record = data[k];
      storage.save(data);
      return info;
    },

    /**
     * 合併從別處（例如雲端試算表）來的紀錄，好的留下。回傳有沒有改到。
     * 試算表沒有記第一次全對的時間；雲端已經全對、這台裝置沒紀錄時，perfectAt 記成 'cloud'，
     * 這樣之後在這台再全對，不會被當成「第一次全對」重複發獎勵。
     */
    merge(kid, remote) {
      let changed = false;
      for (const [levelId, r] of Object.entries(remote || {})) {
        if (!r || typeof r !== 'object') continue;
        const v = { best: Number(r.best) || 0, used: Number(r.used) || 0, total: Number(r.total) || 0, perfectAt: r.perfectAt || '' };
        const perfect = v.total > 0 && v.best >= v.total;
        const k = keyOf(kid, levelId);
        const old = data[k];
        if (perfect && !v.perfectAt) v.perfectAt = old?.perfectAt || 'cloud';
        if (isBetter(v, old)) { data[k] = v; changed = true; }
        else if (perfect && !old.perfectAt) { data[k] = { ...old, perfectAt: v.perfectAt }; changed = true; }
      }
      if (changed) storage.save(data);
      return changed;
    },

    all() { return { ...data }; },
  };
}

function safe(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

export function memoryStorage(initial = {}) {
  let d = initial;
  return { load: () => d, save: (x) => { d = x; } };
}

/** 瀏覽器 localStorage 版本；不能用時（無痕模式等）自動退回記憶體 */
export function localStorageStorage(key) {
  const mem = memoryStorage();
  return {
    load() {
      try { const s = globalThis.localStorage.getItem(key); return s ? JSON.parse(s) : {}; } catch { return mem.load(); }
    },
    save(x) {
      mem.save(x);
      try { globalThis.localStorage.setItem(key, JSON.stringify(x)); } catch { /* 存不了就只留在記憶體 */ }
    },
  };
}
