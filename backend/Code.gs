// 考卷補分站：進度後台（貼到 Google 試算表的 Apps Script 裡）
// 五個工作表：「帳號」放小孩名字和密碼，「設定」是爸媽可以調整的規則，
// 「進度」是每一關的最佳成績，「作答紀錄」是每一次作答（測驗和搶答賽），
// 「建設」是蓋了哪些橋和公路、買了哪些寵物、花了多少歐巴幣（第一次有人蓋橋時會自動建立）。
// 寵物的「名稱」欄是小孩取的名字；每天的飼料和清潔費由網站從買的那一天算，不另外記。

const ACCOUNTS = '帳號';
const SETTINGS = '設定';
const PROGRESS = '進度';
const LOG = '作答紀錄';
const BUILDS = '建設';
const BUILD_HEADERS = ['時間', '小孩', '類型', '代號', '名稱', '歐巴幣', '寶石', '編號'];
// 建設的「類型」對應網站的 kind
const BUILD_KINDS = { '橋': 'bridge', '公路': 'road', '寵物': 'pet' };
const LOG_HEADERS = ['時間', '小孩', '關卡代號', '關卡名稱', '答對', '題數', '用時（秒）', '時間到', '類型', '編號'];
// 作答紀錄的「類型」對應網站帳本的 kind（歐巴幣、寶石照這個算）
const KINDS = { '整關': 'level', '錯題重練': 'retry', '搶答賽': 'game' };

// 設定項目：程式用的代號、表上的名稱、預設值、可以填的值
const SETTING_DEFS = [
  { key: 'cards', label: '學習卡開放', def: '測驗後', allowed: ['一開始', '測驗後', '全對後'] },
  { key: 'gamePool', label: '搶答賽題目', def: '測驗後', allowed: ['一開始', '測驗後', '全對後'] },
  { key: 'gameSeconds', label: '搶答賽秒數', def: 60, min: 30, max: 300 },
  { key: 'wrongPenalty', label: '搶答答錯扣秒', def: 3, min: 0, max: 10 }
];

// 第一次使用時手動執行一次：建立工作表（重複執行不會覆蓋已填的內容）
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const a = sheet_(ss, ACCOUNTS, ['小孩', '密碼（爸媽在這一欄設定）']);
  a.getRange('B:B').setNumberFormat('@');
  if (a.getLastRow() < 2) a.getRange(2, 1, 2, 1).setValues([['姐姐'], ['妹妹']]);
  const s = sheet_(ss, SETTINGS, ['設定', '姐姐', '妹妹', '可以填的值']);
  if (s.getLastRow() < 2) {
    s.getRange(2, 1, SETTING_DEFS.length, 4).setValues(SETTING_DEFS.map(function (d) {
      const hint = d.allowed ? d.allowed.join('／') : d.min + '～' + d.max;
      return [d.label, d.def, d.def, hint];
    }));
  }
  sheet_(ss, PROGRESS, ['小孩', '關卡代號', '關卡名稱', '最佳答對', '題數', '最佳用時（秒）', '挑戰次數', '最後作答時間']);
  const log = sheet_(ss, LOG, LOG_HEADERS);
  if (!String(log.getRange(1, 10).getValue())) log.getRange(1, 10).setValue('編號'); // 舊的表補上第 10 欄
  sheet_(ss, BUILDS, BUILD_HEADERS);
  secret_();
}

// 讀出某個小孩的設定；欄位空白或填錯就用預設值
function settings_(name) {
  const out = {};
  SETTING_DEFS.forEach(function (d) { out[d.key] = d.def; });
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS);
  if (!sh) return out;
  const rows = sh.getDataRange().getDisplayValues();
  const col = rows[0].map(function (h) { return String(h).trim(); }).indexOf(name);
  if (col < 0) return out;
  for (let i = 1; i < rows.length; i++) {
    const d = SETTING_DEFS.filter(function (x) { return x.label === String(rows[i][0]).trim(); })[0];
    if (!d) continue;
    const v = String(rows[i][col]).trim();
    if (d.allowed) {
      if (d.allowed.indexOf(v) >= 0) out[d.key] = v;
    } else {
      const n = Number(v);
      if (v !== '' && isFinite(n) && n >= d.min && n <= d.max) out[d.key] = Math.round(n);
    }
  }
  return out;
}

function doGet() {
  return ContentService.createTextOutput('考卷補分站的進度後台運作中');
}

function doPost(e) {
  let out;
  try {
    out = handle_(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { ok: false, error: 'bad' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(d) {
  const name = String(d.name || '').trim();
  const pw = password_(name);
  if (pw === null) {
    Utilities.sleep(500);
    return { ok: false, error: 'auth' };
  }
  if (!pw) return { ok: false, error: 'nopw' };
  const tok = token_(name, pw);

  if (d.action === 'login') {
    if (String(d.password || '') !== pw) {
      Utilities.sleep(500);
      return { ok: false, error: 'auth' };
    }
    return { ok: true, token: tok, progress: progress_(name), settings: settings_(name), history: history_(name), builds: builds_(name), family: familyBuilds_(name) };
  }
  if (d.token !== tok) return { ok: false, error: 'auth' };
  if (d.action === 'load') return { ok: true, progress: progress_(name), settings: settings_(name), history: history_(name), builds: builds_(name), family: familyBuilds_(name) };
  if (d.action === 'save') return save_(name, d);
  if (d.action === 'build') return build_(name, d);
  return { ok: false, error: 'bad' };
}

function save_(name, d) {
  const level = String(d.level || '');
  const score = Math.floor(Number(d.score));
  const total = Math.floor(Number(d.total));
  const used = Math.floor(Number(d.used));
  if (!/^[a-z0-9-]{1,60}$/.test(level)) return { ok: false, error: 'bad' };
  if (!(total >= 1 && total <= 200 && score >= 0 && score <= total && used >= 0 && used <= 36000)) {
    return { ok: false, error: 'bad' };
  }
  const levelName = clean_(d.levelName);
  const game = d.kind === 'game';
  if (game !== /^game-/.test(level)) return { ok: false, error: 'bad' };
  const retry = !game && d.retry === true;
  const kind = game ? '搶答賽' : retry ? '錯題重練' : '整關';
  const id = /^[\w-]{1,40}$/.test(String(d.id || '')) ? String(d.id) : '';
  const now = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const log = ss.getSheetByName(LOG);
    // 同一個編號已經存過（例如上次其實存好了、但網路斷了沒收到回覆）就不再存一次
    if (id && log.getLastRow() > 1 && log.getRange(2, 10, log.getLastRow() - 1, 1).getDisplayValues().some(function (r) { return r[0] === id; })) {
      return { ok: true, progress: progress_(name), history: history_(name) };
    }
    log.appendRow([now, name, level, levelName, score, total, used, d.timeUp === true ? '是' : '', kind, id]);
    if (!retry) {
      const sh = ss.getSheetByName(PROGRESS);
      const rows = sh.getDataRange().getValues();
      let at = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][0]) === name && String(rows[i][1]) === level) { at = i; break; }
      }
      if (at < 0) {
        sh.appendRow([name, level, levelName, score, total, used, 1, now]);
      } else {
        const best = Number(rows[at][3]) || 0;
        const bestUsed = Number(rows[at][5]) || 0;
        const tries = (Number(rows[at][6]) || 0) + 1;
        const better = score > best || (score === best && used < bestUsed);
        const row = better
          ? [name, level, levelName, score, total, used, tries, now]
          : [name, level, rows[at][2], best, rows[at][4], bestUsed, tries, now];
        sh.getRange(at + 1, 1, 1, 8).setValues([row]);
      }
    }
  } finally {
    lock.releaseLock();
  }
  return { ok: true, progress: progress_(name), history: history_(name), builds: builds_(name), family: familyBuilds_(name) };
}

// 蓋橋、蓋公路、買寵物：記到「建設」工作表。同一個編號、或同一個小孩已經蓋過同一個代號，就不再記
// （兩台裝置都按了蓋同一座橋，只算一次）。餘額由網站從作答紀錄算，這裡只記花了多少。
function build_(name, d) {
  const kind = String(d.kind || '');
  const type = Object.keys(BUILD_KINDS).filter(function (k) { return BUILD_KINDS[k] === kind; })[0];
  const key = String(d.key || '');
  const coins = Math.floor(Number(d.coins));
  const id = String(d.id || '');
  if (!type || !/^[a-z0-9-]{1,60}$/.test(key) || !/^[\w-]{1,40}$/.test(id) || !(coins >= 0 && coins <= 100000)) return { ok: false, error: 'bad' };
  const gems = {};
  const raw = d.gems && typeof d.gems === 'object' ? d.gems : {};
  Object.keys(raw).slice(0, 10).forEach(function (k) {
    const n = Math.floor(Number(raw[k]));
    if (/^[a-z0-9-]{1,30}$/.test(k) && n > 0 && n <= 100000) gems[k] = n;
  });
  const at = Number(d.at);
  const when = isFinite(at) && at > 0 ? new Date(at) : new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(ss, BUILDS, BUILD_HEADERS);
    const rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 8).getDisplayValues() : [];
    // 公路是兩人共有，但照樣記在蓋的人名下：兩台裝置沒連網時兩個人都蓋了，兩筆都記（兩個人都扣錢，和網站上看到的一樣）
    const dup = rows.some(function (r) { return r[7] === id || (r[1] === name && r[3] === key); });
    if (!dup) sh.appendRow([when, name, type, key, clean_(d.keyName), coins, Object.keys(gems).length ? JSON.stringify(gems) : '', id]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, builds: builds_(name), family: familyBuilds_(name) };
}

// 某個小孩蓋過的東西，給網站畫橋、扣歐巴幣
function builds_(name) {
  return buildRows_(function (who) { return who === name; })[name] || [];
}

// 家裡其他小孩蓋過的東西（公路是兩人共有，對方的橋要畫在對方的群島上）。
// 只回傳建設本身（蓋了哪座橋、花多少），不回傳成績和密碼。回傳 { 妹妹: [...] }
function familyBuilds_(name) {
  return buildRows_(function (who) { return who !== name; });
}

function buildRows_(want) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BUILDS);
  if (!sh || sh.getLastRow() < 2) return {};
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 8).getValues();
  const all = {};
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const who = String(r[1]);
    if (!who || !want(who)) continue;
    const out = all[who] || (all[who] = []);
    const kind = BUILD_KINDS[String(r[2])];
    const at = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
    if (!kind || !isFinite(at)) continue;
    let gems = {};
    try { gems = r[6] ? JSON.parse(String(r[6])) : {}; } catch (err) { gems = {}; }
    const item = { id: String(r[7] || '') || 'row-' + at + '-' + r[3], at: at, kind: kind, key: String(r[3]), coins: Number(r[5]) || 0, gems: gems };
    if (kind === 'pet') item.name = String(r[4] || '').slice(0, 40); // 寵物的名字
    out.push(item);
  }
  return all;
}

// 某個小孩的每一次作答，給網站算歐巴幣和寶石。沒有編號的舊紀錄用「時間＋關卡」當編號
function history_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[1]) !== name) continue;
    const kind = KINDS[String(r[8])];
    const at = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
    if (!kind || !isFinite(at)) continue;
    out.push({ id: String(r[9] || '') || 'row-' + at + '-' + r[2], at: at, level: String(r[2]), score: Number(r[4]) || 0, total: Number(r[5]) || 0, kind: kind });
  }
  return out;
}

function progress_(name) {
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROGRESS).getDataRange().getValues();
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === name) {
      out[String(rows[i][1])] = { best: Number(rows[i][3]) || 0, total: Number(rows[i][4]) || 0, used: Number(rows[i][5]) || 0 };
    }
  }
  return out;
}

// 找不到這個小孩回傳 null；找到但還沒設定密碼回傳空字串
function password_(name) {
  if (!name) return null;
  const rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNTS).getDataRange().getDisplayValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === name) return String(rows[i][1]).trim();
  }
  return null;
}

function token_(name, pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, name + '|' + pw + '|' + secret_(), Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let v = p.getProperty('SECRET');
  if (!v) {
    v = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('SECRET', v);
  }
  return v;
}

function sheet_(ss, name, headers) {
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  if (s.getLastRow() === 0) {
    s.appendRow(headers);
    s.setFrozenRows(1);
  }
  return s;
}

// 寫進試算表前先整理文字，避免被當成公式
function clean_(v) {
  return String(v || '').slice(0, 80).replace(/^[=+\-@\s]+/, '');
}
