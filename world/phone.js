// world/phone.js
// 手機版（螢幕窄，或手機橫放）：上方的日曆、姐妹切換、時鐘音樂預設收起來，點了才打開；
// 地圖、商店、音樂變成右邊直排的小圓鈕（只有圖示）；下方提示幾秒後淡出。
// 一次只打開一個；點 3D 畫面就全部收起。每次打開網站都是收起的（不記在裝置上，也不上傳）。
// 電腦和平板不受影響：所有手機版樣式都寫在 #hud.phone 底下（world/phone.css）。

export const PHONE_QUERY = '(max-width: 640px), (max-height: 500px) and (pointer: coarse)';
export const HINT_FADE_MS = 6000;

const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

/** 收起來的日曆只寫「幾月幾日」：info 是 calendar.today() 的結果 */
export function miniDate(info, tpl = '{m}月{d}日') {
  if (!info || !info.month || !info.day) return '';
  return fill(tpl, { m: info.month, d: info.day });
}

/** 下一個要打開的：再點一次同一個＝收起來 */
export function nextOpen(current, which) {
  return current === which ? '' : which;
}

export function createPhoneUi(hudRoot, { text = {}, today = () => null, canvas = null } = {}) {
  const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null;
  const top = hudRoot.querySelector('.top');
  const cal = hudRoot.querySelector('#calendar');
  const kidsBox = hudRoot.querySelector('#kids');
  const clock = hudRoot.querySelector('#clock');
  const hint = hudRoot.querySelector('#hint');
  let open = '';

  const mk = (cls, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.setAttribute('aria-expanded', 'false');
    if (label) b.setAttribute('aria-label', label);
    return b;
  };

  // 左上角：收起來的日曆（幾月幾日）
  const calBtn = mk('ph-only ph-cal');
  if (cal) { calBtn.setAttribute('aria-controls', cal.id); hudRoot.insertBefore(calBtn, cal); }
  const showDate = () => {
    const d = miniDate(today(), text.date);
    calBtn.textContent = d;
    calBtn.setAttribute('aria-label', fill(text.calendar || '日曆 {date}', { date: d }));
  };
  showDate();
  setInterval(showDate, 60 * 1000);   // 過了半夜換日期

  // 右邊直排：音樂（時鐘面板收在這顆裡面）
  const musicBtn = mk('btn small ph-only ph-music', text.music || '時鐘和音樂');
  if (clock) { musicBtn.setAttribute('aria-controls', clock.id); top.insertBefore(musicBtn, clock); }
  const showMusic = () => { musicBtn.textContent = clock && clock.classList.contains('off') ? '🔇' : '🎵'; };
  showMusic();
  if (clock && typeof MutationObserver === 'function') new MutationObserver(showMusic).observe(clock, { attributes: true, attributeFilter: ['class'] });

  function set(which) {
    open = which;
    hudRoot.classList.toggle('ph-cal-open', open === 'cal');
    hudRoot.classList.toggle('ph-kids-open', open === 'kids');
    hudRoot.classList.toggle('ph-clock-open', open === 'clock');
    calBtn.setAttribute('aria-expanded', String(open === 'cal'));
    musicBtn.setAttribute('aria-expanded', String(open === 'clock'));
  }
  const isPhone = () => hudRoot.classList.contains('phone');

  calBtn.addEventListener('click', () => set(nextOpen(open, 'cal')));
  musicBtn.addEventListener('click', () => set(nextOpen(open, 'clock')));

  // 姐妹切換：收起來時只看得到目前的人；點她 → 打開（另一個人和登入狀態才出現），再點別人就換人
  if (kidsBox) {
    kidsBox.addEventListener('click', (e) => {
      if (!isPhone()) return;
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const mine = chip.getAttribute('aria-pressed') === 'true';
      if (open !== 'kids' || mine) {
        e.stopPropagation();   // 在捕獲階段攔下：不會觸發換人
        set(open === 'kids' ? '' : 'kids');
        return;
      }
      set('');   // 點了另一個人：照原本的流程換人
    }, true);
  }

  // 點 3D 畫面：全部收起來
  if (canvas) canvas.addEventListener('pointerdown', () => { if (isPhone() && open) set(''); });

  // 下方提示：手機版幾秒後淡出；文字換了（例如走到門口）再出現
  let fadeTimer = null;
  const showHint = () => {
    if (!hint) return;
    hint.classList.remove('ph-fade');
    clearTimeout(fadeTimer);
    if (isPhone()) fadeTimer = setTimeout(() => hint.classList.add('ph-fade'), HINT_FADE_MS);
  };
  if (hint && typeof MutationObserver === 'function') new MutationObserver(showHint).observe(hint, { childList: true, characterData: true, subtree: true });

  function apply() {
    const on = !!(mq && mq.matches);
    hudRoot.classList.toggle('phone', on);
    set('');
    showHint();
  }
  apply();
  if (mq) {
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', apply);
    else if (typeof mq.addListener === 'function') mq.addListener(apply);
  }

  return { close: () => set(''), isOpen: () => !!open };
}
