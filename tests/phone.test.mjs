// 用 Node 跑：node tests/phone.test.mjs
// 手機版：收起來的日曆寫幾月幾日、再點一次收起來、樣式只套用在手機（#hud.phone），電腦版不受影響。
import { readFileSync } from 'node:fs';
import { miniDate, nextOpen, PHONE_QUERY } from '../world/phone.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

ok(miniDate({ month: 11, day: 28 }) === '11月28日', '幾月幾日');
ok(miniDate({ month: 1, day: 5 }, '{m}/{d}') === '1/5', '可以換格式');
ok(miniDate(null) === '' && miniDate({}) === '', '沒有日期就空白');
ok(nextOpen('', 'cal') === 'cal' && nextOpen('cal', 'cal') === '' && nextOpen('cal', 'clock') === 'clock', '一次只開一個，再點一次收起');
ok(PHONE_QUERY.includes('max-width: 640px') && PHONE_QUERY.includes('max-height: 500px'), '手機＝窄螢幕或手機橫放');

const text = JSON.parse(read('config/text.json'));
ok(text.phone && text.phone.date.includes('{m}') && text.phone.date.includes('{d}') && text.phone.music && text.phone.calendar, 'text.json 有手機版文字');
ok(read('index.html').includes('href="world/phone.css"'), 'index.html 有載入 phone.css');
ok(read('world/main.js').includes('createPhoneUi(hudRoot'), 'main.js 有啟動手機版');

// phone.css 每一條規則都只對手機（#hud.phone）或手機專用按鈕（.ph-only）生效
const css = read('world/phone.css').replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
ok(selectors.length > 10, '有讀到樣式');
ok(selectors.every((s) => s.split(',').every((x) => x.trim().startsWith('#hud.phone') || x.trim() === '.ph-only')), '樣式只限手機版');

console.log('PASS ' + pass + '，FAIL ' + fail.length);
if (fail.length) { console.log('沒通過：\n- ' + fail.join('\n- ')); process.exit(1); }
