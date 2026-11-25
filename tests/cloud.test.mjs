// 用 Node 跑：node tests/cloud.test.mjs
// 檢查雲端進度：網址檢查、登入、存成績、沒網路時排隊補存、密碼改過、合併回進度。
// 用一個假的進度後台代替 Google Apps Script，規則照 backend 的 Code.gs。
import assert from 'node:assert/strict';
import { cloudSettings, createCloud, memoryStore, validApi } from '../engine/cloud.js';
import { createProgress, memoryStorage } from '../engine/progress.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; } catch (err) { console.error('✗ ' + name + '\n  ' + err.message); process.exitCode = 1; }
}

const API = 'https://script.google.com/macros/s/AKfy-test_123/exec';

/** 假後台：帳號、進度、作答紀錄都在記憶體；down=true 時模擬沒網路 */
function fakeBackend() {
  const b = { accounts: { 姐姐: 'pw1', 妹妹: '' }, progress: {}, log: [], down: false, calls: [] };
  const tok = (n) => 'tok-' + n + '-' + b.accounts[n];
  b.fetch = async (url, init) => {
    b.calls.push(JSON.parse(init.body));
    if (b.down || url !== API) throw new Error('network');
    const d = JSON.parse(init.body);
    const out = handle(d);
    return { json: async () => out };
  };
  function handle(d) {
    const name = d.name;
    if (!(name in b.accounts)) return { ok: false, error: 'auth' };
    const pw = b.accounts[name];
    if (!pw) return { ok: false, error: 'nopw' };
    const mine = () => b.progress[name] || {};
    const hist = () => b.log.filter((x) => x.name === name).map((x) => ({ id: x.id, at: x.at, level: x.level, score: x.score, total: x.total, kind: x.kind === 'game' ? 'game' : x.retry ? 'retry' : 'level' }));
    if (d.action === 'login') {
      if (d.password !== pw) return { ok: false, error: 'auth' };
      return { ok: true, token: tok(name), progress: mine(), settings: { cards: '測驗後' }, history: hist() };
    }
    if (d.token !== tok(name)) return { ok: false, error: 'auth' };
    if (d.action === 'load') return { ok: true, progress: mine(), settings: { cards: '測驗後' }, history: hist() };
    if (d.action === 'save') {
      if (!/^[a-z0-9-]{1,60}$/.test(d.level) || !(d.score <= d.total)) return { ok: false, error: 'bad' };
      if (d.id && b.log.some((x) => x.id === d.id)) return { ok: true, progress: mine(), history: hist() };
      b.log.push({ name, ...d, at: Date.now() });
      if (!d.retry) {
        const p = (b.progress[name] ||= {});
        const o = p[d.level];
        if (!o || d.score > o.best || (d.score === o.best && d.used < o.used)) p[d.level] = { best: d.score, total: d.total, used: d.used };
      }
      return { ok: true, progress: mine(), history: hist() };
    }
    return { ok: false, error: 'bad' };
  }
  return b;
}

function setup(backend, extra = {}) {
  const progress = createProgress(memoryStorage());
  const statuses = [];
  const histories = [];
  const store = extra.store || memoryStore();
  const cloud = createCloud({
    settings: cloudSettings({ api: API, timeoutMs: 5000 }),
    store,
    fetchFn: backend.fetch,
    onStatus: (kid, s) => statuses.push(kid + ':' + s),
    onProgress: (kid, p) => progress.merge(kid, p),
    onHistory: (kid, h) => histories.push([kid, h]),
  });
  return { cloud, progress, statuses, store, histories };
}

const summary = (over = {}) => ({ kid: '姐姐', level: 'jie-6a-math-quiz-01', levelName: '測試', score: 5, total: 7, used: 300, timeUp: false, retry: false, ...over });

await test('網址只接受 Apps Script 的 /exec', () => {
  assert.equal(validApi(API), true);
  assert.equal(validApi('https://evil.example.com/exec'), false);
  assert.equal(validApi('http://script.google.com/macros/s/x/exec'), false);
  assert.equal(validApi(''), false);
  assert.equal(cloudSettings({ api: 'https://evil.example.com' }).api, '');
  assert.equal(cloudSettings({ timeoutMs: 'abc' }).timeoutMs, 15000);
});

await test('api 空白時什麼都不送', async () => {
  const b = fakeBackend();
  const cloud = createCloud({ settings: cloudSettings({}), store: memoryStore(), fetchFn: b.fetch });
  assert.equal(cloud.enabled, false);
  assert.equal(cloud.enqueue(summary()), false);
  assert.deepEqual(await cloud.login('姐姐', 'pw1'), { ok: false, error: 'off' });
  assert.equal(b.calls.length, 0);
});

await test('密碼錯、沒設密碼、沒網路的訊息', async () => {
  const b = fakeBackend();
  const { cloud } = setup(b);
  assert.equal((await cloud.login('姐姐', 'nope')).error, 'auth');
  assert.equal((await cloud.login('妹妹', 'x')).error, 'nopw');
  b.down = true;
  assert.equal((await cloud.login('姐姐', 'pw1')).error, 'net');
  assert.equal(cloud.loggedIn('姐姐'), false);
});

await test('登入後把試算表的進度合併回來，好的留下', async () => {
  const b = fakeBackend();
  b.progress.姐姐 = { 'jie-6a-math-quiz-01': { best: 7, total: 7, used: 400 }, 'jie-6a-math-quiz-02': { best: 3, total: 7, used: 200 } };
  const { cloud, progress } = setup(b);
  progress.record('姐姐', 'jie-6a-math-quiz-02', { score: 6, total: 7, used: 350, perfect: false, at: 'x' });
  assert.equal((await cloud.login('姐姐', 'pw1')).ok, true);
  assert.equal(cloud.loggedIn('姐姐'), true);
  assert.equal(progress.get('姐姐', 'jie-6a-math-quiz-01').best, 7);
  assert.equal(progress.get('姐姐', 'jie-6a-math-quiz-01').perfectAt, 'cloud', '雲端全對要記下來，免得重複發第一次全對獎勵');
  assert.equal(progress.get('姐姐', 'jie-6a-math-quiz-02').best, 6, '這台比較好的不能被蓋掉');
  assert.deepEqual(cloud.settingsOf('姐姐'), { cards: '測驗後' });
  // 雲端全對後在這台再全對，不算第一次全對
  const info = progress.record('姐姐', 'jie-6a-math-quiz-01', { score: 7, total: 7, used: 300, perfect: true, at: 'y' });
  assert.equal(info.firstPerfect, false);
});

await test('登入前交的卷先排隊，登入後補存', async () => {
  const b = fakeBackend();
  const { cloud } = setup(b);
  cloud.enqueue(summary({ score: 4 }));
  cloud.enqueue(summary({ score: 6, retry: true }));
  await cloud.flush();
  assert.equal(b.log.length, 0);
  assert.equal(cloud.pending('姐姐'), 2);
  await cloud.login('姐姐', 'pw1');
  await cloud.flush();
  assert.equal(b.log.length, 2);
  assert.equal(b.log[1].retry, true);
  assert.equal(cloud.pending('姐姐'), 0);
  assert.equal(b.progress.姐姐['jie-6a-math-quiz-01'].best, 4, '錯題重練不算進最佳');
});

await test('沒網路時留著，連上後再送；不會重複送', async () => {
  const b = fakeBackend();
  const { cloud, statuses } = setup(b);
  await cloud.login('姐姐', 'pw1');
  b.down = true;
  cloud.enqueue(summary());
  await cloud.flush();
  assert.equal(cloud.pending('姐姐'), 1);
  assert.ok(statuses.includes('姐姐:offline'));
  b.down = false;
  await Promise.all([cloud.flush(), cloud.flush()]);
  assert.equal(b.log.length, 1);
  assert.equal(cloud.pending('姐姐'), 0);
  assert.equal(statuses.at(-1), '姐姐:saved');
});

await test('密碼改過：登出、要重新登入，成績留著', async () => {
  const b = fakeBackend();
  const { cloud, statuses } = setup(b);
  await cloud.login('姐姐', 'pw1');
  b.accounts.姐姐 = 'pw2';
  cloud.enqueue(summary());
  await cloud.flush();
  assert.equal(cloud.loggedIn('姐姐'), false);
  assert.ok(statuses.includes('姐姐:relogin'));
  assert.equal(cloud.pending('姐姐'), 1);
  await cloud.login('姐姐', 'pw2');
  await cloud.flush();
  assert.equal(cloud.pending('姐姐'), 0);
  assert.equal(b.log.length, 1);
});

await test('後台不收的紀錄丟掉，不會卡住後面的', async () => {
  const b = fakeBackend();
  const { cloud, statuses } = setup(b);
  await cloud.login('姐姐', 'pw1');
  cloud.enqueue(summary({ score: 9 })); // 9 > 7，後台回 bad
  cloud.enqueue(summary({ score: 3 }));
  await cloud.flush();
  assert.equal(cloud.pending('姐姐'), 0);
  assert.equal(b.log.length, 1);
  assert.ok(statuses.includes('姐姐:rejected'));
});

await test('關卡代號格式不對的不排隊；只送後台要的欄位', async () => {
  const b = fakeBackend();
  const { cloud } = setup(b);
  assert.equal(cloud.enqueue(summary({ level: '../x' })), false);
  await cloud.login('姐姐', 'pw1');
  cloud.enqueue({ ...summary(), items: [{ n: 1, given: '答案' }] });
  await cloud.flush();
  const sent = b.calls.find((c) => c.action === 'save');
  assert.deepEqual(Object.keys(sent).sort(), ['action', 'id', 'level', 'levelName', 'name', 'retry', 'score', 'timeUp', 'token', 'total', 'used']);
});

await test('換一台裝置：登入狀態和待存清單存在 store，重新開網頁還在', async () => {
  const b = fakeBackend();
  const store = memoryStore();
  const first = setup(b, { store });
  await first.cloud.login('姐姐', 'pw1');
  b.down = true;
  first.cloud.enqueue(summary());
  await first.cloud.flush();
  b.down = false;
  const again = setup(b, { store }); // 重新整理網頁
  assert.equal(again.cloud.loggedIn('姐姐'), true);
  await again.cloud.flush();
  assert.equal(b.log.length, 1);
  await again.cloud.load('姐姐');
  assert.equal(again.progress.get('姐姐', 'jie-6a-math-quiz-01').best, 5);
});

await test('待存清單有上限', async () => {
  const b = fakeBackend();
  const cloud = createCloud({ settings: cloudSettings({ api: API, queueMax: 10 }), store: memoryStore(), fetchFn: b.fetch });
  for (let i = 0; i < 15; i++) cloud.enqueue(summary({ score: i % 7 }));
  assert.equal(cloud.pending('姐姐'), 10);
});

await test('作答編號：用交卷時的 id 送出，後台回傳作答紀錄給帳本', async () => {
  const b = fakeBackend();
  const { cloud, histories } = setup(b);
  await cloud.login('姐姐', 'pw1');
  assert.deepEqual(histories.at(-1), ['姐姐', []]);
  cloud.enqueue(summary({ id: '1764000000000-abc123', score: 7 }));
  await cloud.flush();
  assert.equal(b.log[0].id, '1764000000000-abc123');
  const [kid, h] = histories.at(-1);
  assert.equal(kid, '姐姐');
  assert.equal(h.length, 1);
  assert.equal(h[0].id, '1764000000000-abc123');
  assert.equal(h[0].kind, 'level');
});

await test('同一個編號送兩次（上次其實存好了），後台只記一筆', async () => {
  const b = fakeBackend();
  const { cloud } = setup(b);
  await cloud.login('姐姐', 'pw1');
  cloud.enqueue(summary({ id: 'same-1' }));
  cloud.enqueue(summary({ id: 'same-1' }));
  await cloud.flush();
  assert.equal(b.log.length, 1);
});

await test('不合格的編號就自己編一個', async () => {
  const b = fakeBackend();
  const { cloud } = setup(b);
  await cloud.login('姐姐', 'pw1');
  cloud.enqueue(summary({ id: '<script>' }));
  await cloud.flush();
  assert.match(b.log[0].id, /^\d+-[a-z0-9]+$/);
});

console.log(passed + ' 項通過' + (process.exitCode ? '，有失敗' : ''));
