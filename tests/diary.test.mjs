// 用 Node 跑：node tests/diary.test.mjs
// 日記：從蓋橋紀錄算出「哪一天蓋了第幾座橋」，照台灣時間記在那一天。
import { readFileSync } from 'node:fs';
import { milestones, nthZh } from '../engine/diary.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };
const text = JSON.parse(readFileSync(new URL('../config/text.json', import.meta.url), 'utf8')).calendar;
const plan = [{ key: 'math-chinese', from: 'math', to: 'chinese' }, { key: 'math-english', from: 'math', to: 'english' }];
const names = { math: '數學島', chinese: '國語島', english: '英語島' };
const at = (iso) => Date.parse(iso);

const list = milestones({
  builds: [
    { id: 'b2', at: at('2026-12-01T16:30:00Z'), kind: 'bridge', key: 'math-english', coins: 240, gems: {} }, // 台灣 12/2 00:30
    { id: 'b1', at: at('2026-11-27T13:00:00Z'), kind: 'bridge', key: 'math-chinese', coins: 120, gems: {} },
    { id: 'b1x', at: at('2026-11-28T13:00:00Z'), kind: 'bridge', key: 'math-chinese', coins: 120, gems: {} }, // 別台重複蓋，不算
  ],
  plan, names, text,
});
ok(list.length === 2, '兩座橋兩筆（重複的不算）');
ok(list[0].line === '11/27 蓋了第一座橋！', '第一筆：' + list[0].line);
ok(list[0].title === '恭喜完成第一座橋！', '祝賀標題：' + list[0].title);
ok(list[0].body === '數學島和國語島連起來了，小公主可以走過去探險囉！', '祝賀內容：' + list[0].body);
ok(list[0].day === '2026-11-27' && list[0].id === 'bridge-1', '記在 11/27');
ok(list[1].day === '2026-12-02' && list[1].line === '12/2 蓋了第二座橋！', '照台灣時間：UTC 12/1 16:30 是 12/2');
ok(milestones({ builds: [], plan, names, text }).length === 0, '沒蓋橋就沒有日記');
ok(milestones({ builds: [{ id: 'r', at: 1, kind: 'road', key: 'road-1', coins: 1, gems: {} }], plan, names, text }).length === 0, '公路不算橋');
ok(nthZh(1) === '一' && nthZh(4) === '四' && nthZh(10) === '十' && nthZh(12) === '十二' && nthZh(20) === '二十' && nthZh(23) === '二十三', '國字數字');

console.log(`diary: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
