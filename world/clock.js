// world/clock.js
// 右上角的時鐘：24 小時制，照設定的時區（config/music.json 的 timeZone，預設台灣 Asia/Taipei），
// 不管平板或電腦設定在哪個時區都一樣。純計算，可以用 node 測試。

/** 例如 21:05、00:30。timeZone 不認得就用 offsetHours（預設 +8）自己算 */
export function clockText(ms, timeZone = 'Asia/Taipei', offsetHours = 8) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const h = parts.find((p) => p.type === 'hour')?.value;
    const m = parts.find((p) => p.type === 'minute')?.value;
    if (h && m) return (h === '24' ? '00' : h.padStart(2, '0')) + ':' + m.padStart(2, '0');
  } catch { /* 時區不認得：下面自己算 */ }
  const d = new Date(ms + offsetHours * 3600000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}

/** 下一次分鐘改變還要幾毫秒（時鐘只在換分鐘時更新） */
export function msToNextMinute(ms) {
  return 60000 - (ms % 60000) + 20;
}
