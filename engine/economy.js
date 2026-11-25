// engine/economy.js
// 歐巴幣和寶石的帳本。不另外記「餘額」：每次都從作答紀錄照 config/economy.json 的規則重新算出賺了多少，
// 再扣掉蓋橋、蓋公路花掉的。這樣平板、電腦算出來一定一樣，同一筆成績也不會被加兩次。
// 純邏輯，不碰畫面、不含小孩名字；作答紀錄存在哪裡由外面決定（createLedger 的 storage）。
//
// 一筆作答紀錄（entry）：
//   { id, at: 毫秒, level: 關卡代號, island: 島的代號（math…）, score, total, kind: 'level' | 'retry' | 'game' }
//   id 和送到試算表的編號一樣，本機和雲端的紀錄靠它合併。
// 一筆花費（spend）：{ id, at, coins, gems: { math: 60 } }

export const DEFAULTS = {
  firstLoginGift: 50,
  levelFirstSubmit: 10,
  levelFirstPerfectPerQuestion: 5,
  levelRepeatPerfectDaily: 5,
  quizGamePerCorrect: 1,
  quizGameNewRecord: 15,
  quizGameDailyCap: 50,
  gemPerCorrect: 1,
  gemFirstPerfectBonus: 5,
  gemGameEvery: 5,
  gemDailyCapPerIsland: 30,
};

/** 把 config/economy.json 讀成規則；數字不合理就用預設 */
export function economyRules(raw = {}) {
  const earn = obj(raw.earn);
  const gem = obj(raw.gemEarn);
  const n = (v, min, max, d) => (v !== '' && v !== null && Number.isFinite(Number(v)) && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : d);
  const D = DEFAULTS;
  const rules = {
    firstLoginGift: n(earn.firstLoginGift, 0, 10000, D.firstLoginGift),
    levelFirstSubmit: n(earn.levelFirstSubmit, 0, 1000, D.levelFirstSubmit),
    levelFirstPerfectPerQuestion: n(earn.levelFirstPerfectPerQuestion, 0, 1000, D.levelFirstPerfectPerQuestion),
    levelRepeatPerfectDaily: n(earn.levelRepeatPerfectDaily, 0, 1000, D.levelRepeatPerfectDaily),
    quizGamePerCorrect: n(earn.quizGamePerCorrect, 0, 100, D.quizGamePerCorrect),
    quizGameNewRecord: n(earn.quizGameNewRecord, 0, 1000, D.quizGameNewRecord),
    quizGameDailyCap: n(earn.quizGameDailyCap, 0, 10000, D.quizGameDailyCap),
    gemPerCorrect: n(gem.perCorrect, 0, 100, D.gemPerCorrect),
    gemFirstPerfectBonus: n(gem.firstPerfectBonus, 0, 1000, D.gemFirstPerfectBonus),
    gemGameEvery: n(gem.gameEveryCorrect, 0, 100, D.gemGameEvery), // 0 表示搶答賽不給寶石
    gemDailyCapPerIsland: n(gem.dailyCapPerIsland, 0, 10000, D.gemDailyCapPerIsland), // 0 表示沒有上限
  };
  // 寶石名稱：每座島一種（照 subjects.json 的島代號）
  rules.gems = {};
  for (const [code, g] of Object.entries(obj(raw.gems))) {
    if (/^[a-z0-9-]{1,30}$/.test(code) && g && typeof g.name === 'string') rules.gems[code] = { name: g.name, color: typeof g.color === 'string' ? g.color : '' };
  }
  // 建設價格
  rules.build = {};
  for (const [kind, p] of Object.entries(obj(raw.build))) {
    if (!/^[a-z0-9-]{1,30}$/.test(kind) || !p || typeof p !== 'object') continue; // 跳過 _說明
    const gems = {};
    for (const [code, v] of Object.entries(obj(p?.gems))) { const k = n(v, 0, 100000, 0); if (k) gems[code] = k; }
    rules.build[kind] = { coins: n(p?.coins, 0, 100000, 0), gems };
  }
  return rules;
}

/** 某個時間是哪一天（這台裝置的時區），例如 2026-11-25 */
export function localDay(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** 整理一筆作答紀錄；不合格回傳 null */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const at = Number(e.at);
  const total = Math.floor(Number(e.total));
  const score = Math.floor(Number(e.score));
  const kind = ['level', 'retry', 'game'].includes(e.kind) ? e.kind : null;
  if (!kind || !Number.isFinite(at) || !(total >= 1 && total <= 200) || !(score >= 0 && score <= (kind === 'game' ? 1000 : total))) return null;
  if (typeof e.id !== 'string' || !e.id || typeof e.level !== 'string' || !e.level) return null;
  return { id: e.id, at, level: e.level, island: typeof e.island === 'string' ? e.island : '', score, total, kind };
}

/**
 * 算出某個小孩現在有多少歐巴幣和寶石。
 * history：作答紀錄；spends：花費；rules：economyRules()；
 * islandOf(entry)：這筆是哪座島（紀錄本身有 island 就不用）
 * 回傳 { coins, gems: { math: 12 }, earned: { coins, gems }, spent: { coins, gems }, events: [{ id, coins, gems }] }
 * events 是每一筆作答各賺了多少，交卷畫面拿來顯示「獲得 +45 歐巴幣」。
 */
export function computeWallet({ history = [], spends = [], rules, islandOf = () => '', dayOf = localDay }) {
  const r = rules || economyRules({});
  const list = history.map(cleanEntry).filter(Boolean).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const levels = new Map(); // 關卡代號 → { perfect, repeatDay, gemDay, gemBest }
  const gameBest = new Map(); // 島 → 最高分
  const gameCoinsByDay = new Map();
  const gemsByDay = new Map(); // 島|日期 → 已拿幾顆
  const earned = { coins: r.firstLoginGift, gems: {} };
  const events = [];

  for (const e of list) {
    if (e.kind === 'retry') continue; // 錯題重練是訂正用的，不給資源（之後打錯題小怪另外算）
    const island = e.island || islandOf(e) || '';
    const day = dayOf(e.at);
    let coins = 0;
    let gems = 0;
    if (e.kind === 'game') {
      const prev = gameBest.get(island);
      let c = e.score * r.quizGamePerCorrect + (prev !== undefined && e.score > prev ? r.quizGameNewRecord : 0);
      const usedToday = gameCoinsByDay.get(day) || 0;
      c = Math.max(0, Math.min(c, r.quizGameDailyCap - usedToday));
      gameCoinsByDay.set(day, usedToday + c);
      coins += c;
      if (prev === undefined || e.score > prev) gameBest.set(island, e.score);
      if (r.gemGameEvery > 0) gems += Math.floor(e.score / r.gemGameEvery);
    } else {
      let s = levels.get(e.level);
      if (!s) { s = { perfect: false, repeatDay: '', gemDay: '', gemBest: 0 }; levels.set(e.level, s); coins += r.levelFirstSubmit; }
      const perfect = e.score >= e.total;
      if (perfect && !s.perfect) {
        s.perfect = true;
        s.repeatDay = day; // 第一次全對那天，再全對不另外給
        coins += r.levelFirstPerfectPerQuestion * e.total;
        gems += r.gemFirstPerfectBonus;
      } else if (perfect && s.repeatDay !== day) {
        s.repeatDay = day;
        coins += r.levelRepeatPerfectDaily;
      }
      // 寶石：每關每天只算當天最好的一次（多答對的題數才補給）
      if (s.gemDay !== day) { s.gemDay = day; s.gemBest = 0; }
      if (e.score > s.gemBest) { gems += (e.score - s.gemBest) * r.gemPerCorrect; s.gemBest = e.score; }
    }
    if (island && gems > 0 && r.gemDailyCapPerIsland > 0) {
      const key = island + '|' + day;
      const got = gemsByDay.get(key) || 0;
      gems = Math.max(0, Math.min(gems, r.gemDailyCapPerIsland - got));
      gemsByDay.set(key, got + gems);
    }
    if (!island) gems = 0; // 不知道是哪一科，不給寶石
    earned.coins += coins;
    if (gems) earned.gems[island] = (earned.gems[island] || 0) + gems;
    events.push({ id: e.id, coins, gems: gems ? { [island]: gems } : {} });
  }

  const spent = { coins: 0, gems: {} };
  for (const s of spends) {
    if (!s || typeof s !== 'object') continue;
    spent.coins += Math.max(0, Math.floor(Number(s.coins)) || 0);
    for (const [k, v] of Object.entries(obj(s.gems))) spent.gems[k] = (spent.gems[k] || 0) + Math.max(0, Math.floor(Number(v)) || 0);
  }
  const gems = {};
  for (const k of new Set([...Object.keys(earned.gems), ...Object.keys(spent.gems)])) gems[k] = (earned.gems[k] || 0) - (spent.gems[k] || 0);
  return { coins: earned.coins - spent.coins, gems, earned, spent, events };
}

/** 夠不夠付 price（{ coins, gems }）；回傳 { ok, short: { coins, gems } } 差多少 */
export function canAfford(wallet, price) {
  const short = { coins: Math.max(0, (price?.coins || 0) - wallet.coins), gems: {} };
  for (const [k, v] of Object.entries(obj(price?.gems))) {
    const lack = v - (wallet.gems[k] || 0);
    if (lack > 0) short.gems[k] = lack;
  }
  return { ok: short.coins === 0 && !Object.keys(short.gems).length, short };
}

/**
 * 某個小孩的作答紀錄本。storage 要有 load() / save(obj)（和 engine/progress.js 一樣）。
 * 資料格式：{ 小孩: [entry, …] }
 */
export function createLedger(storage) {
  let data = obj(storage.load());
  const listOf = (kid) => (Array.isArray(data[kid]) ? data[kid] : []);
  return {
    history: (kid) => listOf(kid).slice(),
    /** 這台裝置剛交的卷 */
    add(kid, entry) {
      const e = cleanEntry(entry);
      if (!kid || !e || listOf(kid).some((x) => x.id === e.id)) return false;
      data = { ...data, [kid]: [...listOf(kid), e] };
      storage.save(data);
      return true;
    },
    /** 合併試算表回傳的作答紀錄（同一個 id 只留一筆）。回傳有沒有多出新的 */
    merge(kid, remote) {
      if (!kid || !Array.isArray(remote)) return false;
      const have = new Set(listOf(kid).map((x) => x.id));
      const extra = [];
      for (const r of remote) {
        const e = cleanEntry(r);
        if (e && !have.has(e.id)) { have.add(e.id); extra.push(e); }
      }
      if (!extra.length) return false;
      data = { ...data, [kid]: [...listOf(kid), ...extra] };
      storage.save(data);
      return true;
    },
  };
}

/** 一筆作答的唯一編號（和送到試算表的一樣） */
export function newEntryId(now = Date.now(), rand = Math.random) {
  return now + '-' + rand().toString(36).slice(2, 8);
}

function obj(x) { return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; }
