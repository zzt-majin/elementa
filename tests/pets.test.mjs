// 用 Node 跑：node tests/pets.test.mjs
// 商店的寵物：每種一隻、每天費用從隔天開始算（台灣時間）、錢不夠變負的、日記、名字最多 16 個字。
import { readFileSync } from 'node:fs';
import { petRules, ownedPets, petFees, feeSpends, shopState, petRecord, dailyFee, dayNumber, isHungry } from '../engine/pets.js';
import { cleanBuild, createBuildBook, cleanName } from '../engine/build.js';
import { computeWallet, economyRules } from '../engine/economy.js';
import { milestones } from '../engine/diary.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const read = (p) => JSON.parse(readFileSync(new URL('../config/' + p, import.meta.url), 'utf8'));
const rules = petRules(read('pets.json'));
const text = read('text.json').calendar;
const at = (iso) => Date.parse(iso);
const B = (code) => rules.breeds.find((b) => b.code === code);

// 設定
ok(rules.breeds.map((b) => b.code + ':' + b.price).join() === 'tudog:100,shepherd:300,husky:500', '三種狗：100／300／500');
ok(rules.feeRate === 0.1 && rules.nameMax === 16, '每天 10%、名字 16 字');
ok(dailyFee(100, rules) === 10 && dailyFee(300, rules) === 30 && dailyFee(500, rules) === 50, '每天 10／30／50');
ok(petRules({ feeRate: 5, nameMax: 0, breeds: [{ code: 'X!', name: 'a', price: 1 }, { code: 'a', name: 'A', price: -1 }] }).breeds.length === 0 && petRules({ feeRate: 5 }).feeRate === 0.1, '不合理的設定用預設');

// 名字
ok(cleanName('  小黃  ') === '小黃', '去掉前後空白');
ok(Array.from(cleanName('一二三四五六七八九十一二三四五六七八')).length === 16, '最多 16 個字');
ok(cleanName('🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶🐶').length === 32, '表情符號一個算一個字');
ok(cleanName('<b>小黃</b>') === 'b小黃/b', '拿掉角括號');
ok(petRecord({ id: 'p1', at: 1, breed: B('tudog'), name: '   ', rules }) === null, '沒取名字不能買');
const rec = petRecord({ id: 'p1', at: at('2026-11-28T03:00:00Z'), breed: B('tudog'), name: '小黃', rules });
ok(rec && rec.key === 'pet-tudog' && rec.coins === 100 && rec.name === '小黃' && rec.kind === 'pet', '買的紀錄');
ok(cleanBuild(rec)?.name === '小黃', '建設本留著名字');
ok(cleanBuild({ ...rec, kind: 'bridge', key: 'math-chinese' }).name === undefined, '橋沒有名字欄');

// 每種一隻
const store = { d: {}, load() { return this.d; }, save(x) { this.d = x; } };
const book = createBuildBook(store);
ok(book.add('姐姐', rec) === true, '買土狗');
ok(book.add('姐姐', { ...rec, id: 'p2', name: '小白' }) === false, '同一種不能買第二隻');
ok(book.add('姐姐', petRecord({ id: 'p3', at: at('2026-11-29T15:30:00Z'), breed: B('husky'), name: '雪球', rules })) === true, '再買一隻哈士奇');
ok(ownedPets(book.effective('姐姐'), rules).map((p) => p.name + p.fee).join() === '小黃10,雪球50', '有兩隻');

// 每天的費用：買的那天不扣，隔天開始（台灣時間）
const tz = 'Asia/Taipei';
ok(dayNumber(at('2026-11-28T15:59:00Z'), tz) + 1 === dayNumber(at('2026-11-28T16:00:00Z'), tz), '台灣半夜 12 點換一天');
const list = book.effective('姐姐');
ok(petFees({ builds: list, rules, now: at('2026-11-28T15:59:00Z'), timeZone: tz }).total === 0, '買的那一天不扣');
ok(petFees({ builds: list, rules, now: at('2026-11-28T16:01:00Z'), timeZone: tz }).total === 10, '11/29 凌晨扣第一次 10');
// 哈士奇 11/29 23:30（台灣）買，11/30 開始扣
ok(petFees({ builds: list, rules, now: at('2026-11-29T15:59:00Z'), timeZone: tz }).total === 10, '11/29 只扣土狗');
ok(petFees({ builds: list, rules, now: at('2026-11-29T16:00:00Z'), timeZone: tz }).total === 20 + 50, '11/30 土狗 2 天＋哈士奇 1 天');
ok(petFees({ builds: list, rules, now: at('2026-12-04T04:00:00Z'), timeZone: tz }).pets.map((p) => p.days).join() === '6,5', '12/4：6 天、5 天');
ok(feeSpends({ builds: list, rules, now: at('2026-11-28T10:00:00Z'), timeZone: tz }).length === 0, '還沒扣就沒有花費');

// 接進錢包：買的價錢＋每天的費用；錢不夠變負的
const econ = economyRules({ earn: { firstLoginGift: 120 } });
const one = [rec];
const walletAt = (now) => computeWallet({ history: [], spends: [...one, ...feeSpends({ builds: one, rules, now, timeZone: tz })], rules: econ });
ok(walletAt(at('2026-11-28T10:00:00Z')).coins === 20, '見面禮 120 − 土狗 100 = 20');
ok(walletAt(at('2026-11-29T10:00:00Z')).coins === 10, '隔天 −10');
ok(walletAt(at('2026-12-01T10:00:00Z')).coins === -10, '錢不夠也照扣，變負的');
ok(isHungry(-10) && !isHungry(0), '負的才是肚子餓');

// 商店的狀態
const owned = ownedPets(one, rules);
ok(shopState(B('tudog'), { kid: '姐姐', coins: 999, owned }).state === 'owned', '已經有了');
ok(shopState(B('shepherd'), { kid: '姐姐', coins: 420, owned }).state === 'ready', '錢夠');
const s = shopState(B('husky'), { kid: '姐姐', coins: 420, owned });
ok(s.state === 'short' && s.short === 80, '還差 80');
ok(shopState(B('husky'), { kid: null, coins: 999, owned: [] }).state === 'locked', '沒登入');

// 日記
const m = milestones({ builds: [rec], text, timeZone: tz, breeds: { tudog: '臺灣土狗' } });
ok(m.length === 1 && m[0].line === '11/28 買了臺灣土狗小黃！', '日記：' + m[0]?.line);
ok(m[0].title === '恭喜有了新朋友！' && m[0].body === '臺灣土狗「小黃」來到你的島上了，牠會陪小公主到處玩！', '祝賀畫面');
ok(m[0].id === 'pet-tudog' && m[0].day === '2026-11-28', '記在 11/28');
const mixed = milestones({ builds: [rec, { id: 'b', at: 2, kind: 'bridge', key: 'math-chinese', coins: 1, gems: {} }], plan: [{ key: 'math-chinese', from: 'math', to: 'chinese' }], names: { math: '數學島', chinese: '國語島' }, text, timeZone: tz, breeds: { tudog: '臺灣土狗' } });
ok(mixed.find((x) => x.id === 'bridge-1')?.title === '恭喜完成第一座橋！', '寵物不算成第幾座橋');

console.log(`pets: ${pass} 項通過` + (fail.length ? `，${fail.length} 項失敗：\n  ` + fail.join('\n  ') : ''));
if (fail.length) process.exit(1);
