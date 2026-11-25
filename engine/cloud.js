// engine/cloud.js
// 和進度後台（Google Apps Script，見 backend/Code.gs）溝通：登入、讀進度、存成績。
// 純邏輯，不碰畫面、不含網址和小孩資料：網址從 config/backend.json 來，
// fetch 和存放位置都由外面傳進來（瀏覽器用 fetch＋localStorage，測試用假的）。
//
// 成績先排進「待存清單」再送出：沒網路、還沒登入、後台忙的時候都不會掉，
// 下次登入或連上網路時會自動補存。

export const DEFAULTS = {
  api: '',
  timeoutMs: 15000,
  queueMax: 200,
};

/** 只接受 Google Apps Script 網頁應用程式的網址，避免把成績送到別的地方 */
export function validApi(url) {
  return typeof url === 'string' && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url.trim());
}

export function cloudSettings(raw = {}) {
  const s = { ...DEFAULTS };
  if (raw && validApi(raw.api)) s.api = raw.api.trim();
  const n = (v, min, max, d) => (Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : d);
  s.timeoutMs = n(raw?.timeoutMs, 2000, 60000, DEFAULTS.timeoutMs);
  s.queueMax = n(raw?.queueMax, 10, 1000, DEFAULTS.queueMax);
  return s;
}

/**
 * store：{ get(key) → 物件或 null, set(key, 物件) }
 * fetchFn：和瀏覽器 fetch 一樣的函式
 * onStatus(kid, status, extra)：狀態改變時呼叫，status 是
 *   'saving' 正在存、'saved' 已存好、'offline' 連不上、'relogin' 密碼改過要重新登入、
 *   'rejected' 後台不收這筆（只留在這台裝置）
 * onProgress(kid, progress, settings)：後台回傳進度時呼叫，外面拿去合併
 */
export function createCloud({ settings, store, fetchFn, onStatus = () => {}, onProgress = () => {}, now = () => Date.now() }) {
  const enabled = !!settings.api;
  const SES = 'session', QUE = 'queue', SET = 'settings';
  let flushing = null;

  const sessions = () => obj(store.get(SES));
  const queue = () => (Array.isArray(store.get(QUE)) ? store.get(QUE) : []);

  async function call(body) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), settings.timeoutMs) : null;
    try {
      // 不加 Content-Type：瀏覽器用 text/plain 送，Apps Script 才不會擋跨網域
      const res = await fetchFn(settings.api, { method: 'POST', body: JSON.stringify(body), redirect: 'follow', signal: ctrl?.signal });
      const r = await res.json();
      return r && typeof r === 'object' ? r : { ok: false, error: 'net' };
    } catch {
      return { ok: false, error: 'net' };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function setSession(kid, token) {
    const s = sessions();
    if (token) s[kid] = token; else delete s[kid];
    store.set(SES, s);
  }

  function got(kid, r) {
    if (r.settings && typeof r.settings === 'object') {
      const all = obj(store.get(SET));
      all[kid] = r.settings;
      store.set(SET, all);
    }
    if (r.progress && typeof r.progress === 'object') onProgress(kid, r.progress, r.settings || null);
  }

  const api = {
    enabled,
    loggedIn: (kid) => enabled && !!sessions()[kid],
    /** 家長在試算表「設定」填的規則（學習卡開放時機、搶答賽秒數…），還沒登入過就是 null */
    settingsOf: (kid) => obj(store.get(SET))[kid] || null,
    pending: (kid) => queue().filter((x) => x.kid === kid).length,

    /** 回傳 { ok } 或 { ok:false, error:'auth'|'nopw'|'net'|'off' } */
    async login(kid, password) {
      if (!enabled) return { ok: false, error: 'off' };
      const r = await call({ action: 'login', name: kid, password: String(password || '') });
      if (r.ok && typeof r.token === 'string') {
        setSession(kid, r.token);
        got(kid, r);
        api.flush();
        return { ok: true };
      }
      return { ok: false, error: ['auth', 'nopw'].includes(r.error) ? r.error : 'net' };
    },

    logout(kid) { setSession(kid, null); },

    /** 重新讀一次試算表的進度（換裝置、別台寫過的成績會合併回來） */
    async load(kid) {
      const token = sessions()[kid];
      if (!enabled || !token) return { ok: false, error: 'off' };
      const r = await call({ action: 'load', name: kid, token });
      if (r.ok) { got(kid, r); return { ok: true }; }
      if (r.error === 'auth') { setSession(kid, null); onStatus(kid, 'relogin'); }
      return { ok: false, error: r.error === 'auth' ? 'auth' : 'net' };
    },

    /** 交卷後呼叫，summary 是 resultSummary() 的格式 */
    enqueue(summary) {
      if (!enabled || !/^[a-z0-9-]{1,60}$/.test(summary.level || '')) return false;
      // 搶答賽（kind: 'game'）的代號一定是 game- 開頭，後台也這樣檢查
      const game = summary.kind === 'game';
      if (game !== /^game-/.test(summary.level)) return false;
      const item = {
        t: now() + '-' + Math.random().toString(36).slice(2, 8),
        kid: summary.kid,
        level: summary.level,
        levelName: summary.levelName || '',
        score: summary.score,
        total: summary.total,
        used: summary.used,
        timeUp: !!summary.timeUp,
        retry: !game && !!summary.retry,
        ...(game ? { kind: 'game' } : {}),
      };
      store.set(QUE, [...queue(), item].slice(-settings.queueMax));
      api.flush();
      return true;
    },

    /** 一筆一筆送出已登入小孩的待存成績。同時只會跑一個。 */
    flush() {
      if (!enabled) return Promise.resolve();
      if (!flushing) flushing = run().finally(() => { flushing = null; });
      return flushing;
    },
  };

  async function run() {
    const skip = new Set();
    for (;;) {
      const s = sessions();
      const item = queue().find((x) => s[x.kid] && !skip.has(x.kid));
      if (!item) return;
      onStatus(item.kid, 'saving');
      const { t, kid, ...rest } = item;
      const r = await call({ action: 'save', name: kid, token: s[kid], ...rest });
      if (r.ok) {
        drop(t);
        got(kid, r);
        if (!queue().some((x) => x.kid === kid)) onStatus(kid, 'saved');
      } else if (r.error === 'auth') {
        setSession(kid, null);
        skip.add(kid);
        onStatus(kid, 'relogin');
      } else if (r.error === 'bad') {
        drop(t);
        onStatus(kid, 'rejected');
      } else {
        onStatus(kid, 'offline');
        return; // 連不上就先停，等下次再試
      }
    }
  }

  function drop(t) { store.set(QUE, queue().filter((x) => x.t !== t)); }

  return api;
}

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }

/** 瀏覽器用：存在 localStorage，鍵名加上 prefix；不能用時退回記憶體 */
export function localStore(prefix) {
  const mem = {};
  return {
    get(k) {
      try { const s = globalThis.localStorage.getItem(prefix + k); if (s) return JSON.parse(s); } catch { /* 用記憶體 */ }
      return mem[k] ?? null;
    },
    set(k, v) {
      mem[k] = v;
      try { globalThis.localStorage.setItem(prefix + k, JSON.stringify(v)); } catch { /* 只留在記憶體 */ }
    },
  };
}

export function memoryStore() {
  const d = {};
  return { get: (k) => (k in d ? JSON.parse(JSON.stringify(d[k])) : null), set: (k, v) => { d[k] = JSON.parse(JSON.stringify(v)); } };
}
