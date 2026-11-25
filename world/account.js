// world/account.js
// 3D 群島的登入和雲端進度。只透過 startWorld 的 hooks 接上，main.js 不用知道它存在：
//   const account = createAccount({ hudRoot, configPath });
//   startWorld({ ..., hooks: account.hooks });
// 連線、排隊補存在 engine/cloud.js；網址和秒數在 config/backend.json；畫面文字在 config/text.json 的 login 區。
// config/backend.json 的 api 空白時，這個模組什麼都不做，成績只存在這台裝置。
import { cloudSettings, createCloud, localStore } from '../engine/cloud.js';

export function createAccount({ hudRoot, configPath = 'config/', fetchFn = globalThis.fetch?.bind(globalThis), storePrefix = 'elementa.cloud.' }) {
  let world = null;
  let cloud = null;
  let ui = null;
  const early = []; // 雲端還沒準備好之前交的卷，準備好再排進去
  const later = new Set(); // 這次打開網站時按過「先不登入」的小孩
  const status = {}; // 每個小孩最後的同步狀態
  const lastSettings = {}; // 每個小孩上次拿到的試算表「設定」，有變才重畫

  async function setup(w) {
    world = w;
    let raw = {};
    try {
      const res = await fetchFn(configPath + 'backend.json', { cache: 'no-cache' });
      if (res.ok) raw = await res.json();
    } catch { /* 沒有這個檔就當作不登入 */ }
    const settings = cloudSettings(raw);
    if (!settings.api) return;

    cloud = createCloud({
      settings,
      store: localStore(storePrefix),
      fetchFn,
      onStatus(kid, s) { status[kid] = s; ui?.render(); },
      onProgress(kid, progress, sheet) {
        const merged = world.progress.merge(kid, progress);
        // 家長改了試算表「設定」（例如學習卡開放時機），學習屋清單也要重畫
        const key = JSON.stringify(sheet || null);
        const settingsChanged = sheet && lastSettings[kid] !== key;
        if (sheet) lastSettings[kid] = key;
        if (merged || settingsChanged) world.refresh();
      },
    });
    ui = createLoginUI(hudRoot, world.text.login || {}, {
      kid: () => world.kid(),
      cloud,
      status,
      later,
    });
    for (const s of early.splice(0)) cloud.enqueue(s);
    ui.render();
    sync();

    globalThis.addEventListener?.('online', sync);
    globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  }

  function sync() {
    const kid = world?.kid();
    if (!cloud || !kid || !cloud.loggedIn(kid)) return;
    cloud.flush().then(() => cloud.load(kid)).then(() => ui?.render());
  }

  return {
    hooks: {
      onReady(w) { setup(w).catch((err) => console.error(err)); },
      onKidChange() { ui?.render(); sync(); },
      /** 學習屋、搶答賽讀家長在試算表「設定」填的規則；還沒登入過是 null，用 config 的預設 */
      settingsOf: (kid) => cloud?.settingsOf(kid) || null,
      onResult(summary) {
        if (cloud) { cloud.enqueue(summary); ui?.render(); }
        else early.push(summary);
      },
    },
    /** 給之後的學習屋、搶答賽讀家長在試算表「設定」填的規則 */
    settingsOf: (kid) => cloud?.settingsOf(kid) || null,
  };
}

function createLoginUI(hudRoot, t, { kid, cloud, status, later }) {
  const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));
  const el = (tag, cls, content) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  };

  // 上方列的小標籤：已登入／登入
  const chip = el('div', 'account');
  const top = hudRoot.querySelector('.top');
  top.insertBefore(chip, top.querySelector('#mute'));

  // 登入卡片：放在「點一下出發」前面，第一次點畫面仍然先開音樂
  const card = el('section', 'login-card');
  card.setAttribute('aria-label', t.title ? fill(t.title, { kid: '' }) : '');
  hudRoot.insertBefore(card, hudRoot.querySelector('#start'));

  let busy = false;
  let error = '';
  let confirmLogout = false;
  let cardFor = null; // 目前卡片是給哪個小孩的，換人時清掉錯誤訊息

  function render() {
    const k = kid();
    if (cardFor !== k) { cardFor = k; error = ''; confirmLogout = false; }
    if (!k) { chip.hidden = true; card.hidden = true; return; }
    const logged = cloud.loggedIn(k);
    renderChip(k, logged);
    if (logged || later.has(k)) { card.hidden = true; return; }
    renderCard(k);
  }

  function renderChip(k, logged) {
    chip.hidden = false;
    chip.replaceChildren();
    if (!logged) {
      if (!later.has(k)) { chip.hidden = true; return; }
      const b = el('button', 'btn small', t.chipLogin);
      b.type = 'button';
      b.addEventListener('click', () => { later.delete(k); render(); card.querySelector('input')?.focus(); });
      chip.append(b);
      const n = cloud.pending(k);
      if (n) chip.append(el('span', 'sync', fill(t.pending, { n })));
      return;
    }
    chip.append(el('span', 'who', fill(t.chipWho, { kid: k })));
    const n = cloud.pending(k);
    const s = status[k];
    const msg = s === 'saving' ? t.saving
      : s === 'offline' ? t.offline
      : s === 'rejected' ? t.rejected
      : n ? fill(t.pending, { n })
      : s === 'saved' ? t.saved : '';
    if (msg) chip.append(el('span', 'sync' + (s === 'offline' || s === 'rejected' ? ' warn' : ''), msg));
    const out = el('button', 'link', confirmLogout ? t.logoutConfirm : t.logout);
    out.type = 'button';
    out.addEventListener('click', () => {
      if (!confirmLogout) { confirmLogout = true; render(); return; }
      confirmLogout = false;
      cloud.logout(k);
      status[k] = '';
      later.delete(k);
      render();
    });
    chip.append(out);
  }

  function renderCard(k) {
    card.hidden = false;
    const form = el('form', 'login-form');
    const id = 'login-pw';
    const label = el('label', '', t.password);
    label.htmlFor = id;
    const input = el('input');
    input.type = 'password';
    input.id = id;
    input.autocomplete = 'current-password';
    input.disabled = busy;
    const go = el('button', 'btn', busy ? t.busy : t.submit);
    go.type = 'submit';
    go.disabled = busy;
    form.append(label, input, go);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = input.value;
      if (!pw || busy) return;
      busy = true; error = ''; render();
      const r = await cloud.login(k, pw);
      busy = false;
      error = r.ok ? '' : r.error === 'nopw' ? t.errNopw : r.error === 'auth' ? t.errAuth : t.errNet;
      render();
      if (!r.ok) card.querySelector('input')?.focus();
    });

    const skip = el('button', 'link', t.later);
    skip.type = 'button';
    skip.addEventListener('click', () => { later.add(k); render(); });

    const relogin = status[k] === 'relogin';
    card.replaceChildren(
      el('h2', '', fill(t.title, { kid: k })),
      el('p', 'muted', relogin ? t.relogin : t.body),
      form,
      ...(error ? [el('p', 'login-error', error)] : []),
      ...(cloud.pending(k) ? [el('p', 'muted', fill(t.pendingBeforeLogin, { n: cloud.pending(k) }))] : []),
      skip,
    );
  }

  return { render };
}
