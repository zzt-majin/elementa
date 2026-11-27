// world/controls.js
// 鍵盤：方向鍵和 WASD 走路（照畫面方向），空白鍵（或 Enter）＝畫面下方的「進入」按鈕，Esc 關掉面板。
// enabled() 回傳 false 時（作答、看卡、面板打開、地圖模式）不攔鍵盤，方向鍵照常捲動頁面。
const KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1],
  ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};

export function createControls({ enabled = () => true, onAction = () => {}, onEscape = () => {} } = {}) {
  const down = new Set();
  const typing = (e) => {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  };
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    if (e.code === 'Escape') { onEscape(); return; }
    if (!enabled()) { down.clear(); return; }
    if (KEYS[e.code]) {
      e.preventDefault();
      down.add(e.code);
      return;
    }
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
      // 焦點在按鈕上時，讓按鈕自己處理（不然會按兩次）
      if (e.target && e.target.tagName === 'BUTTON') return;
      e.preventDefault();
      onAction();
    }
  });
  window.addEventListener('keyup', (e) => { down.delete(e.code); });
  window.addEventListener('blur', () => down.clear());
  document.addEventListener('visibilitychange', () => { if (document.hidden) down.clear(); });

  return {
    /** 畫面方向：{ x：右 +1、左 -1, y：上 +1、下 -1 } */
    axis() {
      if (!enabled()) { down.clear(); return { x: 0, y: 0 }; }
      let x = 0;
      let y = 0;
      for (const k of down) { x += KEYS[k][0]; y += KEYS[k][1]; }
      return { x: Math.sign(x), y: Math.sign(y) };
    },
  };
}
