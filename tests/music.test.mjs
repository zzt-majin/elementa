// 用 Node 跑：node tests/music.test.mjs
// 背景音樂和時鐘：歌單（config/music.json）都合格、至少 20 首、換歌繞一圈、台灣時間 24 小時制。
import { readFileSync } from 'node:fs';
import { songList, noteLengths, wrapIndex, noteToHz, INSTRUMENTS } from '../world/music.js';
import { clockText, msToNextMinute } from '../world/clock.js';

let pass = 0;
const fail = [];
const ok = (cond, name) => { if (cond) pass++; else fail.push(name); };

const raw = JSON.parse(readFileSync(new URL('../config/music.json', import.meta.url), 'utf8'));
const songs = songList(raw);
ok(raw.songs.length >= 20, '至少 20 首（現在 ' + raw.songs.length + ' 首）');
ok(songs.length === raw.songs.length, '每一首都合格（沒有被跳過）');
ok(new Set(songs.map((s) => s.name)).size === songs.length && songs.every((s) => s.name), '每首都有名字，不重複');
ok(raw.songs.every((s) => INSTRUMENTS[s.instrument]), '樂器都認得');
ok(new Set(raw.songs.map((s) => s.instrument)).size >= 6, '至少 6 種音色');
ok(raw.songs.every((s) => s.notes.every((n) => n === '-' || noteToHz(n) > 0) && s.bass.every((n) => noteToHz(n) > 0)), '每個音都寫對');
ok(raw.songs.every((s) => s.notes.length % s.stepsPerBar === 0), '每首都是完整的小節');
ok(raw.songs.every((s) => s.notes[0] !== '-'), '第一格就有音（換歌馬上聽得到）');
// 音域：旋律在 F#3～D#7 之間（太低太高平板喇叭聽不清楚）
const midi = (n) => Math.round(69 + 12 * Math.log2(noteToHz(n) / 440));
ok(raw.songs.every((s) => s.notes.filter((n) => n !== '-').every((n) => midi(n) >= 54 && midi(n) <= 99)), '旋律音域合理');
ok(raw.songs.every((s) => s.bass.every((n) => midi(n) >= 40 && midi(n) <= 64)), '低音音域合理');
// 一首大約 30～70 秒
ok(raw.songs.every((s) => { const sec = s.notes.length * 30 / s.beatsPerMinute; return sec >= 25 && sec <= 75; }), '每首 25～75 秒');
ok(typeof raw.timeZone === 'string' && raw.timeZone, '有時區');

// 音符長度（笛子照這個吹）
ok(JSON.stringify(noteLengths(['C5', '-', '-', 'E5', 'G5', '-'])) === '[3,0,0,1,2,0]', '音符延長幾格');
ok(JSON.stringify(noteLengths(['C5', '-', 'E5', '-'])) === '[2,0,2,0]', '最後一個音延長到結尾');
// 不合格的歌跳過、壞掉的音當休止
ok(songList({ songs: [{ name: 'x', notes: [] }, { notes: ['-'] }, { name: 'y', notes: ['C5', 'H9', '-'] }] }).length === 1, '空的歌跳過');
ok(songList({ songs: [{ name: 'y', notes: ['C5', 'H9'] }] })[0].notes[1] === '-', '寫錯的音當作休止');
ok(songList({ notes: ['C5', 'E5'], beatsPerMinute: 90 }).length === 1, '舊的只有一首的格式也能讀');
// 換歌繞一圈
ok(wrapIndex(23, 23) === 0 && wrapIndex(-1, 23) === 22 && wrapIndex(5, 23) === 5 && wrapIndex(3, 0) === 0, '上一首、下一首繞一圈');

// 時鐘：台灣時間 24 小時制
const at = (iso) => Date.parse(iso);
ok(clockText(at('2026-11-27T13:05:00Z')) === '21:05', 'UTC 13:05 = 台灣 21:05');
ok(clockText(at('2026-11-27T16:30:59Z')) === '00:30', '半夜 00:30（不是 24:30）');
ok(clockText(at('2026-11-27T04:07:00Z')) === '12:07', '中午 12:07');
ok(clockText(at('2026-11-27T13:05:00Z'), 'Not/AZone') === '21:05', '時區寫錯就用 +8 自己算');
ok(clockText(at('2026-11-27T13:05:00Z'), 'Asia/Tokyo') === '22:05', '可以換時區');
ok(msToNextMinute(at('2026-11-27T13:05:40Z')) === 20020, '換分鐘時才更新');

console.log(`music: ${pass} 通過` + (fail.length ? `，${fail.length} 失敗：\n- ` + fail.join('\n- ') : ''));
if (fail.length) process.exit(1);
