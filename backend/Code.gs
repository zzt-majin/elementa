// 考卷補分站：進度後台（貼到 Google 試算表的 Apps Script 裡）
// 四個工作表：「帳號」放小孩名字和密碼，「設定」是爸媽可以調整的規則，
// 「進度」是每一關的最佳成績，「作答紀錄」是每一次作答（測驗和搶答賽）。

const ACCOUNTS = '帳號';
const SETTINGS = '設定';
const PROGRESS = '進度';
const LOG = '作答紀錄';

// 設定項目：程式用的代號、表上的名稱、預設值、可以填的值
const SETTING_DEFS = [
  { key: 'cards', label: '學習卡開放', def: '測驗後', allowed: ['一開始', '測驗後', '全對後'] },
  { key: 'gamePool', label: '搶答賽題目', def: '測驗後', allowed: ['一開始', '測驗後', '全對後'] },
  { key: 'gameSeconds', label: '搶答賽秒數', def: 60, min: 30, max: 300 },
  { key: 'wrongPenalty', label: '搶答答錯扣秒', def: 3, min: 0, max: 10 }
];

// 第一次使用時手動執行一次：建立四個工作表（重複執行不會覆蓋已填的內容）
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
  sheet_(ss, LOG, ['時間', '小孩', '關卡代號', '關卡名稱', '答對', '題數', '用時（秒）', '時間到', '類型']);
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
    return { ok: true, token: tok, progress: progress_(name), settings: settings_(name) };
  }
  if (d.token !== tok) return { ok: false, error: 'auth' };
  if (d.action === 'load') return { ok: true, progress: progress_(name), settings: settings_(name) };
  if (d.action === 'save') return save_(name, d);
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
  const now = new Date();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ss.getSheetByName(LOG).appendRow([now, name, level, levelName, score, total, used, d.timeUp === true ? '是' : '', kind]);
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
  return { ok: true, progress: progress_(name) };
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
