// engine/economy.js
// 歐巴幣和寶石的帳本。不另外記「餘額」：每次都從作答紀錄照 config/economy.json 的規則重新算出賺了多少，
// 再扣掉蓋橋、蓋公路花掉的。這樣平板、電腦算出來一定一樣，同一筆成績也不會被加兩次。
// 純邏輯，不碰畫面、不含小孩名字；作答紀錄存在哪裡由外面決定（createLedger 的 storage）。
//
// 一筆作答紀錄（entry）：
//   { id, at: 毫秒, level: 關卡代號, island: 島的代號（math…）, score, total, kind: 'level' | 'retry' | 'game',
//     timeUp: 時間到自動交卷, blanks: 沒寫的題數（舊紀錄沒有） }
//   id 和送到試算表的編號一樣，本機和雲端的紀錄靠它合併。
// 一筆花費（spend）：{ id, at, coins, gems: { math: 60 } }
//
// 測驗的歐巴幣（2026-11-27 家長定）：一關的「完整歐巴幣」= 第一次交卷 + 每題 × 題數（7 題 = 45）。
// 全對拿完整；錯 1 題 9 折、錯 2 題 5 折（無條件捨去）。
// 錯 3 題以上（2026-11-28 家長改）：全部寫完 2 枚、時間到還沒寫完 1 枚、還沒寫完就自己交卷 0 枚（manyWrong）。
// 紀錄沒有記「沒寫幾題」（blanks）的舊作答，錯 3 題以上照舊 0 枚。
// 半分（英語句子只錯大寫或標點）：打折時半對算錯一題，寶石照分數取整數，要每一題都整題對才算全對。
// 之後寫得更好，補發差額（最多補到完整）。已全對過的關卡，每天再寫一次也照同樣的折扣給「每天再全對」那一份。
// coinsResetAt：這個時間以前的作答不算歐巴幣（也不給見面禮），以前寫過的關卡可以重新拿第一次的獎勵；寶石照算。
// 搶答賽「打破最高紀錄」照全部紀錄的最高分比（和畫面上的個人最高紀錄一樣），只是歸零以前的不給歐巴幣。

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
  wrongRates: [1, 0.9, 0.5],
  manyWrong: { done: 2, timeUp: 1, submitEarly: 0 },
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
  // 錯幾題拿幾成：[全對, 錯 1 題, 錯 2 題, …]，後面沒寫的都是 0
  const rates = Array.isArray(earn.wrongRates) ? earn.wrongRates : null;
  rules.wrongRates = rates && rates.length && rates.length <= 50 && rates.every((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1)
    ? rates.map(Number) : D.wrongRates.slice();
  // 錯太多題時給幾枚：寫完、時間到、沒寫完就交卷
  const mw = obj(earn.manyWrong);
  rules.manyWrong = {
    done: n(mw.done, 0, 1000, D.manyWrong.done),
    timeUp: n(mw.timeUp, 0, 1000, D.manyWrong.timeUp),
    submitEarly: n(mw.submitEarly, 0, 1000, D.manyWrong.submitEarly),
  };
  // 歐巴幣歸零的時間：ISO 時間字串，例如 2026-11-27T18:00:00+08:00；空白就不歸零
  const resetAt = typeof raw.coinsResetAt === 'string' && raw.coinsResetAt ? Date.parse(raw.coinsResetAt) : NaN;
  rules.coinsResetAt = Number.isFinite(resetAt) ? resetAt : 0;
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
    rules.build[kind] = { coins: n(p?.coins, 0, 100000, 0), step: n(p?.step, 0, 100000, 0), gems };
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
  // 測驗可以有半分（英語句子只錯大寫或標點），搶答賽是整數
  const score = e.kind === 'game' ? Math.floor(Number(e.score)) : Math.round(Number(e.score) * 2) / 2;
  const kind = ['level', 'retry', 'game'].includes(e.kind) ? e.kind : null;
  if (!kind || !Number.isFinite(at) || !(total >= 1 && total <= 200) || !(score >= 0 && score <= (kind === 'game' ? 1000 : total))) return null;
  if (typeof e.id !== 'string' || !e.id || typeof e.level !== 'string' || !e.level) return null;
  const out = { id: e.id, at, level: e.level, island: typeof e.island === 'string' ? e.island : '', score, total, kind };
  if (e.timeUp === true) out.timeUp = true;
  const blanks = e.blanks === '' || e.blanks === null || e.blanks === undefined ? NaN : Number(e.blanks);
  if (Number.isInteger(blanks) && blanks >= 0 && blanks <= Math.ceil(total - score)) out.blanks = blanks;
  return out;
}

/**
 * 錯太多題（超過 wrongRates）時這一次給幾枚：全部寫完 done、時間到還沒寫完 timeUp、沒寫完就交卷 submitEarly。
 * 沒有記 blanks 的舊紀錄給 0。
 */
export function manyWrongCoins(e, rules) {
  const m = rules?.manyWrong || DEFAULTS.manyWrong;
  if (!Number.isInteger(e?.blanks)) return 0;
  if (e.blanks === 0) return m.done;
  return e.timeUp ? m.timeUp : m.submitEarly;
}

/**
 * 算出某個小孩現在有多少歐巴幣和寶石。
 * history：作答紀錄；spends：花費；bonuses：其他獎勵 [{ id, coins }]（每日登入）；rules：economyRules()；
 * islandOf(entry)：這筆是哪座島（紀錄本身有 island 就不用）
 * 回傳 { coins, gems: { math: 12 }, earned: { coins, gems }, spent: { coins, gems }, events: [{ id, coins, gems }] }
 * events 是每一筆作答各賺了多少，交卷畫面拿來顯示「獲得 +45 歐巴幣」。
 */
export function computeWallet({ history = [], spends = [], bonuses = [], rules, islandOf = () => '', dayOf = localDay }) {
  const r = rules || economyRules({});
  const list = history.map(cleanEntry).filter(Boolean).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const levels = new Map(); // 關卡代號 → { gemDay, gemBest }（寶石）
  const coinLv = new Map(); // 關卡代號 → { paid 第一次的獎勵已給多少, perfect, perfectDay, day, dayPaid }（歐巴幣，歸零後才開始記）
  const gameBest = new Map(); // 島 → 最高分（照全部紀錄算，和畫面上的個人最高紀錄一樣）
  const gameCoinsByDay = new Map();
  const gemsByDay = new Map(); // 島|日期 → 已拿幾顆
  const reset = r.coinsResetAt || 0;
  const earned = { coins: reset ? 0 : r.firstLoginGift, gems: {} };
  const rates = r.wrongRates || DEFAULTS.wrongRates;
  // 錯幾題：半對的題目當成錯一題（7.5 / 10 → 錯 3 題）
  const rateOf = (score, total) => rates[Math.ceil(total - score)] ?? 0;
  /** 這一次照錯幾題應該拿到多少（full 是全對的數字）；錯太多題時照 manyWrong，但不超過 full */
  const dueOf = (e, full) => {
    if (e.score >= e.total) return full;
    const rate = rateOf(e.score, e.total);
    return rate > 0 ? Math.floor(full * rate) : Math.min(full, manyWrongCoins(e, r));
  };
  const events = [];

  for (const e of list) {
    if (e.kind === 'retry') continue; // 錯題重練是訂正用的，不給資源（之後打錯題小怪另外算）
    const island = e.island || islandOf(e) || '';
    const day = dayOf(e.at);
    let coins = 0;
    let gems = 0;
    const coinsCount = e.at >= reset; // 歸零以前的作答不算歐巴幣
    if (e.kind === 'game') {
      const prev = gameBest.get(island);
      if (coinsCount) {
        let c = e.score * r.quizGamePerCorrect + (prev !== undefined && e.score > prev ? r.quizGameNewRecord : 0);
        const usedToday = gameCoinsByDay.get(day) || 0;
        c = Math.max(0, Math.min(c, r.quizGameDailyCap - usedToday));
        gameCoinsByDay.set(day, usedToday + c);
        coins += c;
      }
      if (prev === undefined || e.score > prev) gameBest.set(island, e.score);
      if (r.gemGameEvery > 0) gems += Math.floor(e.score / r.gemGameEvery);
    } else {
      let s = levels.get(e.level);
      if (!s) { s = { perfect: false, gemDay: '', gemBest: 0 }; levels.set(e.level, s); }
      const perfect = e.score >= e.total;
      if (perfect && !s.perfect) { s.perfect = true; gems += r.gemFirstPerfectBonus; }
      if (coinsCount) {
        let c = coinLv.get(e.level);
        if (!c) { c = { paid: 0, perfect: false, perfectDay: '', day: '', dayPaid: 0 }; coinLv.set(e.level, c); }
        if (!c.perfect) {
          // 還沒全對過：完整 = 第一次交卷 + 每題 × 題數，照錯幾題打折，補發比之前多的部分
          const full = r.levelFirstSubmit + r.levelFirstPerfectPerQuestion * e.total;
          const due = dueOf(e, full);
          if (due > c.paid) { coins += due - c.paid; c.paid = due; }
          if (perfect) { c.perfect = true; c.perfectDay = day; } // 第一次全對那天，不再給「每天再全對」
        } else if (c.perfectDay !== day) {
          // 已全對過：每天一份「再全對」，一樣照錯幾題打折，當天寫更好就補差額
          if (c.day !== day) { c.day = day; c.dayPaid = 0; }
          const due = dueOf(e, r.levelRepeatPerfectDaily);
          if (due > c.dayPaid) { coins += due - c.dayPaid; c.dayPaid = due; }
        }
      }
      // 寶石：每關每天只算當天最好的一次（多答對的題數才補給）
      if (s.gemDay !== day) { s.gemDay = day; s.gemBest = 0; }
      // 寶石照分數取整數（7.5 分算 7 題）
      const whole = Math.floor(e.score);
      if (whole > s.gemBest) { gems += (whole - s.gemBest) * r.gemPerCorrect; s.gemBest = whole; }
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

  // 不是作答賺的歐巴幣（每日登入獎勵、累計登入成就，engine/login.js 算好的 [{ id, coins }]）
  for (const b of Array.isArray(bonuses) ? bonuses : []) earned.coins += Math.max(0, Math.floor(Number(b?.coins)) || 0);

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

/**
 * 如果現在交出 entry（{ level, island, score, total, kind }），會拿到多少？畫面上「這一關全對 +45」用。
 * 照 computeWallet 一樣的規則算（把它當成最新的一筆），所以補差額、每天上限、歸零都會算進去。
 */
export function previewEarn({ history = [], rules, islandOf = () => '', dayOf = localDay, entry, now = Date.now() }) {
  const id = '~preview';
  const w = computeWallet({ history: [...history, { ...entry, id, at: now }], rules, islandOf, dayOf });
  const ev = w.events.find((x) => x.id === id);
  return ev ? { coins: ev.coins, gems: ev.gems } : { coins: 0, gems: {} };
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
