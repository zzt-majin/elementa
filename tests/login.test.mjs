// 用 Node 跑：node tests/login.test.mjs
// 每日登入獎勵（一輪 10、10、10、10、10、50、100，斷掉從第 1 天重來）和累計登入成就（50 天 50，100、200、300…天 200）
import { readFileSync } from 'node:fs';
import { loginRules, loginSummary, loginRecord, loginKey, milestoneAt, nextReward } from '../engine/login.js';
import { computeWallet, economyRules } from '../engine/economy.js';
import { milestones } from '../engine/diary.js';
import { cleanBuild, effectiveBuilds } from '../engine/build.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const econRaw = JSON.parse(readFileSync(new URL('../config/economy.json', import.meta.url), 'utf8'));
const text = JSON.parse(readFileSync(new URL('../config/text.json', import.meta.url), 'utf8'));
const rules = loginRules(econRaw.login);
const DAY = 86400000;
// 台灣時間 2026-11-28 10:00 起，第 i 天
const t0 = Date.parse('2026-11-28T02:00:00Z');
const rec = (i, extra = 0) => loginRecord({ id: 'L' + i + '-' + extra, at: t0 + i * DAY + extra });
const days = (arr) => arr.map((i) => rec(i));

ok(rules.cycle.join() === '10,10,10,10,10,50,100', '設定檔的一輪：' + rules.cycle.join());
ok(loginKey(t0) === 'login-20261128', '代號照台灣日期');
ok(loginKey(Date.parse('2026-11-28T16:30:00Z')) === 'login-20261129', 'UTC 16:30 是台灣隔天');
ok(cleanBuild(rec(0)) !== null, '建設本收登入紀錄');

// 連續 7 天：10×5 + 50 + 100 = 200，第 8 天回到第 1 天
let s = loginSummary({ builds: days([0, 1, 2, 3, 4, 5, 6, 7]), rules });
ok(s.days.map((d) => d.n).join() === '1,2,3,4,5,6,7,1', '第 8 天從第 1 天開始：' + s.days.map((d) => d.n).join());
ok(s.days.map((d) => d.coins).join() === '10,10,10,10,10,50,100,10', '每天的獎勵');
ok(s.coins === 210, '連續 8 天共 210：' + s.coins);
ok(s.count === 8 && s.streak === 1, '累計 8 天、現在第 1 天');

// 斷掉：第 0～3 天來，第 4 天沒來，第 5 天回來 → 第 1 天
s = loginSummary({ builds: days([0, 1, 2, 3, 5, 6]), rules });
ok(s.days.map((d) => d.n).join() === '1,2,3,4,1,2', '斷一天從第 1 天重來：' + s.days.map((d) => d.n).join());
ok(s.coins === 60, '斷掉拿不到 50、100');

// 同一天兩筆只算一次
s = loginSummary({ builds: [rec(0), rec(0, 3600000), rec(1)], rules });
ok(s.count === 2 && s.coins === 20, '同一天只算一次');
// 別的種類不算
ok(loginSummary({ builds: [{ id: 'b', at: t0, kind: 'bridge', key: 'math-chinese', coins: 120 }], rules }).count === 0, '橋不算登入');

// 成就：50 天 50、100 天 200、200 天 200、300 天 200、400 天 200；150、250 天沒有
ok(milestoneAt(50, rules)?.coins === 50, "50 天 50");
ok(milestoneAt(100, rules)?.coins === 200, '100 天 200');
ok(milestoneAt(200, rules)?.coins === 200, '200 天 200');
ok(milestoneAt(300, rules)?.coins === 200 && milestoneAt(400, rules)?.coins === 200, '之後每 100 天 200');
ok(milestoneAt(150, rules) === null && milestoneAt(250, rules) === null && milestoneAt(49, rules) === null, '其他天數沒有');

// 累計不歸零：隔天來一次（每次都是第 1 天），50 次後拿到 50 天成就
const every2 = Array.from({ length: 50 }, (_, i) => i * 2);
s = loginSummary({ builds: days(every2), rules });
ok(s.count === 50 && s.milestones.length === 1 && s.milestones[0].days === 50, '斷斷續續也累計到 50 天');
ok(s.coins === 50 * 10 + 50, "50 次第 1 天＋成就 50：" + s.coins);
ok(s.milestones[0].day === s.days[49].day, '成就記在第 50 天那天');

// 連續 100 天：一輪 200，14 輪 = 2800，再 2 天 20，加上成就 50＋200
const hundred = Array.from({ length: 100 }, (_, i) => i);
s = loginSummary({ builds: days(hundred), rules });
ok(s.coins === 14 * 200 + 20 + 50 + 200, '連續 100 天：' + s.coins);
ok(s.milestones.map((m) => m.days).join() === '50,100', '兩個成就');

// 歐巴幣：bonuses 加進賺的
const econ = economyRules(econRaw);
const w0 = computeWallet({ history: [], spends: [], rules: econ });
const w1 = computeWallet({ history: [], spends: [], bonuses: loginSummary({ builds: days([0, 1, 2]), rules }).bonuses, rules: econ });
ok(w1.coins - w0.coins === 30, '登入 3 天多 30 枚');
// 登入紀錄 coins 是 0，當成花費也不扣錢
const list = effectiveBuilds(days([0, 1]));
ok(computeWallet({ history: [], spends: list, rules: econ }).coins === w0.coins, '登入紀錄不扣錢');

// 明天再來拿多少
ok(nextReward(1, rules) === 10 && nextReward(5, rules) === 50 && nextReward(6, rules) === 100 && nextReward(7, rules) === 10, '明天的獎勵');

// 日記：累計 50 天寫進日記
const m = milestones({ builds: days(every2), text: text.calendar, login: rules });
ok(m.length === 1 && m[0].id === 'login-50' && m[0].art === 'login', '日記有 50 天成就');
ok(m[0].title === '恭喜累計登入 50 天！', '祝賀標題：' + m[0].title);
ok(/^\d+\/\d+ 累計登入 50 天，拿到 50 歐巴幣！$/.test(m[0].line), '日記一行：' + m[0].line);
ok(milestones({ builds: days(every2), text: text.calendar }).length === 0, '沒給登入規則就不算');
// 和橋混在一起照時間排
const mixed = milestones({ builds: [...days(every2), { id: 'b', at: t0 + DAY, kind: 'bridge', key: 'math-chinese', coins: 120, gems: {} }], plan: [{ key: 'math-chinese', from: 'math', to: 'chinese' }], names: { math: '數學島', chinese: '國語島' }, text: text.calendar, login: rules });
ok(mixed.map((x) => x.id).join() === 'bridge-1,login-50', '照時間排：' + mixed.map((x) => x.id).join());

// 設定不合理用預設
ok(loginRules({ cycle: 'x', milestones: [] }).cycle.length === 7 && loginRules({}).milestones[0].days === 50, '壞設定用預設');
ok(text.dailyLogin?.flash.includes('{n}') && text.dailyLogin.flash.includes('{next}') && text.login && !text.login.flash, '提示文字（不蓋掉登入畫面的 login）');

if (fail.length) { console.log('login: 失敗', fail); process.exit(1); }
console.log('login: ' + pass + ' 項通過');
