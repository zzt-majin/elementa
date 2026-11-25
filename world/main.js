// world/main.js
// 把設定、關卡、測驗引擎和 3D 場景接在一起。index.html 只呼叫 startWorld()。
import * as THREE from 'three';
import { loadLevels, kidsIn, levelsFor, timeLimitMinutes } from '../engine/levels.js';
import { quizSettings, resultSummary, mmss } from '../engine/quiz.js';
import { createProgress, localStorageStorage } from '../engine/progress.js';
import { createScene } from './scene.js';
import { createCameraRig } from './camera.js';
import { buildIsland, whatWasHit } from './islands.js';
import { createHud } from './hud.js';
import { createMusicBox } from './music.js';
import { createQuizUI } from './quiz-ui.js';
import { createCardsUI } from './cards-ui.js';
import { cardSettings, ruleFor, cardState } from '../engine/cards.js';
import { materialize, mixLevel } from '../engine/generate.js';

const store = {
  get(k) { try { return localStorage.getItem('elementa.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('elementa.' + k, v); } catch { /* 沒有也沒關係 */ } },
};

const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(url + ' 讀不到（' + res.status + '）');
  return res.json();
}

/**
 * hooks（都可以不給）：登入／雲端進度、歐巴幣、錯題小怪模組從這裡接上，不用改這個檔案。
 *   onReady(world)：群島畫好後呼叫一次。world = { progress, text, kids, kid(), refresh() }
 *     refresh()：成績從別處合併進來後呼叫，打開中的測驗塔清單會重畫。
 *   onKidChange(kid)：切換小孩時呼叫。
 *   onResult(summary, info)：每次交卷後呼叫。summary 是 resultSummary() 的精簡紀錄，info 是 progress.record() 的回傳。
 *   settingsOf(kid)：家長在試算表「設定」填的規則（登入模組提供）；沒有就用 config 的預設。
 */
export async function startWorld({ canvas, hudRoot, quizRoot, cardsRoot, configPath = 'config/', levelsPath = 'content/levels/', hooks = {} }) {
  const [subjects, theme, world, text, quizConfig, cardsConfig, mixConfig] = await Promise.all([
    ...['subjects', 'theme', 'world', 'text'].map((n) => getJSON(configPath + n + '.json')),
    getJSON(configPath + 'quiz.json').catch(() => ({})), // 沒有 quiz.json 就用引擎預設
    getJSON(configPath + 'cards.json').catch(() => ({})), // 沒有 cards.json 就用引擎預設
    getJSON(configPath + 'mix.json').catch(() => ({})),
  ]);
  const presets = (Array.isArray(mixConfig?.presets) ? mixConfig.presets : [])
    .map((p) => ({ count: Math.round(Number(p.count)), minutes: Number(p.minutes) }))
    .filter((p) => p.count >= 1 && p.count <= 60 && p.minutes > 0);
  const settings = quizSettings(quizConfig);
  const cardConf = cardSettings(cardsConfig);
  const hud = createHud(hudRoot, text);
  const loading = hudRoot.querySelector('#loading');
  loading.textContent = text.loading;

  if (!webglOK()) { loading.textContent = text.noWebGL; return; }

  let levels = [];
  const loadErrors = [];
  const genCfg = {};
  try {
    const r = await loadLevels(levelsPath);
    loadErrors.push(...r.errors);
    // 出題模組的數字範圍：config/generators/<島的代號>.json（例如 math.json），只讀有出題關卡的科目
    const need = new Set(r.levels.filter((l) => l.meta.make).map((l) => l.meta.subject));
    await Promise.all(subjects.islands.filter((i) => need.has(i.subject)).map(async (i) => {
      genCfg[i.subject] = await getJSON(configPath + 'generators/' + i.code + '.json').catch(() => ({}));
    }));
    // 有 make 的關卡先出一份題目，題數、學習卡、搶答賽題庫才算得出來；每次開始測驗會再出新的
    for (const l of r.levels) {
      try { levels.push(materialize(l, { cfg: genCfg[l.meta.subject] })); } catch (err) { loadErrors.push({ file: l.file, message: err.message }); }
    }
  } catch (err) {
    loadErrors.push({ file: 'index.json', message: err.message });
  }
  hud.showErrors(loadErrors);

  // 等字型載好再畫島名，避免先出現系統字
  await Promise.race([
    document.fonts ? document.fonts.load('700 48px "LXGW WenKai TC"') : Promise.resolve(),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});

  const princessKey = store.get('princess') || theme.defaultPrincess;
  const princess = theme.princesses[princessKey] || Object.values(theme.princesses)[0];
  const colors = { ...theme.scene, ...princess };
  document.documentElement.style.setProperty('--main', princess.main);
  document.documentElement.style.setProperty('--soft', princess.soft);
  document.documentElement.style.setProperty('--deep', princess.deep);

  const view = createScene(canvas, theme.scene, world);
  const rig = createCameraRig(view.camera, canvas, world.camera);
  const islandsGroup = new THREE.Group();
  view.scene.add(islandsGroup);

  const kids = kidsIn(levels);
  let kid = kids.includes(store.get('kid')) ? store.get('kid') : kids[0] || null;
  let focused = null;
  let lastBuilding = null;

  // 成績：先存在這台裝置；登入模組做好後由 hooks 同步到試算表
  const progress = createProgress(localStorageStorage('elementa.progress'));
  const minutesOf = (l) => timeLimitMinutes(l, settings.minutesPerQuestion);

  let paused = false;
  const overlayChange = (open) => {
    paused = open; // 作答、看卡時 3D 場景不畫，平板比較省電
    hudRoot.hidden = open;
    canvas.hidden = open;
  };
  const quiz = createQuizUI(quizRoot, {
    text,
    settings,
    refresh: (l) => freshen(l), // 「整關再挑戰」出新題目
    onOpenChange: overlayChange,
    onResult(result, level) {
      const info = progress.record(level.meta.kid, level.meta.id, result);
      try { hooks.onResult?.(resultSummary(result, level), info); } catch (err) { console.error(err); }
      return info;
    },
    onClose() {
      if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind);
    },
  });

  // 學習屋：開放時機照試算表「設定」（hooks.settingsOf），沒有就照 config/cards.json
  const cardsUI = cardsRoot ? createCardsUI(cardsRoot, {
    text,
    settings: cardConf,
    onOpenChange: overlayChange,
    onClose() { if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind); },
  }) : null;
  const cardRule = () => {
    let sheet = null;
    try { sheet = hooks.settingsOf?.(kid) || null; } catch (err) { console.error(err); }
    return ruleFor(sheet, cardConf);
  };

  function rebuild() {
    islandsGroup.clear();
    for (const def of subjects.islands) {
      const info = levelsFor(levels, { kid, subject: def.subject });
      const g = buildIsland(def, colors, {
        radius: world.island.radius,
        levelCount: info.count,
        labels: { construction: text.construction, count: text.islandCount },
      });
      g.userData.phase = def.position[0] * 0.3 + def.position[1] * 0.2;
      islandsGroup.add(g);
    }
    hud.setKids(kids, kid, (k) => {
      kid = k; store.set('kid', k); rebuild(); if (focused) openIsland(focused);
      try { hooks.onKidChange?.(k); } catch (err) { console.error(err); }
    });
  }
  rebuild();

  const byCode = (code) => subjects.islands.find((i) => i.code === code);
  const groupOf = (code) => islandsGroup.children.find((g) => g.userData.island === code);

  function openIsland(code) {
    const def = byCode(code);
    if (!def) return;
    focused = code;
    lastBuilding = null;
    const g = groupOf(code);
    rig.focus(g.position, def.size || 1);
    hud.showIsland(def, levelsFor(levels, { kid, subject: def.subject }), subjects.buildings, (kind) => openBuilding(code, kind), backToAll);
  }

  function openBuilding(code, kind) {
    const def = byCode(code);
    const info = levelsFor(levels, { kid, subject: def.subject });
    if (!info.count) { openIsland(code); return; }
    focused = code;
    lastBuilding = { code, kind };
    const g = groupOf(code);
    rig.focus(g.position, (def.size || 1) * 0.8);
    const choiceCount = info.groups.flatMap((x) => x.items).reduce((s, l) => s + l.questions.filter((q) => q.type === '選擇').length, 0);
    hud.showBuilding(def, kind, subjects.buildings[kind], info, {
      choiceCount,
      minutes: minutesOf,
      mmss,
      best: (l) => progress.get(l.meta.kid, l.meta.id),
      // 從學習屋去寫測驗：交卷後回到學習屋，剛打開的學習卡馬上看得到
      onStart: (l) => startQuiz(l, { backLabel: kind === 'house' ? text.cards.leave : '' }),
      mix: kind === 'tower' && presets.length ? mixExtra(def, info) : null,
      house: kind === 'house' && cardsUI ? houseExtra(code) : null,
    }, () => openIsland(code));
  }

  function houseExtra(code) {
    const { rule, from } = cardRule();
    const T = text.cards;
    return {
      ruleText: fill(T.ruleLine, { rule: T.ruleNames[rule] || rule }) + (from === 'sheet' ? T.ruleFromSheet : T.ruleFromDefault),
      state: (l) => cardState(l, progress.get(l.meta.kid, l.meta.id), rule),
      onCards: (l) => {
        // 打開前再檢查一次，避免清單畫好後規則變了
        if (cardState(l, progress.get(l.meta.kid, l.meta.id), cardRule().rule).open) cardsUI.open(safeFresh(l) || l); // 每次看到新的例題
        else openBuilding(code, 'house');
      },
    };
  }

  // ---------- 出題 ----------

  /** 同一關出一份新題目（關卡檔有 make 的才會變；綜合練習照原本勾的單元重抽） */
  function freshen(l) {
    if (l.meta.mix) return buildMix(l.meta.mixUnits, l.meta.mixPreset, l.meta.subject);
    return materialize(l, { cfg: genCfg[l.meta.subject] });
  }
  function safeFresh(l) {
    try { return freshen(l); } catch (err) { console.error(err); hud.showErrors([{ file: l.meta.id, message: err.message }]); return null; }
  }
  function startQuiz(l, opts) {
    const fresh = safeFresh(l);
    if (fresh) quiz.start(fresh, opts);
  }

  /** 綜合練習的代號：同一張考卷的關卡代號去掉最後的「-來源-序號」，例如 jie-6a-math-mix-10 */
  const mixId = (sample, count) => sample.meta.id.replace(/-[a-z]+-\d+$/, '') + '-mix-' + count;

  function buildMix(unitNames, preset, subject) {
    const all = levels.filter((l) => l.meta.kid === kid && l.meta.subject === subject && l.meta.unit && l.meta.make);
    const units = unitNames.map((u) => ({ unit: u, levels: all.filter((l) => l.meta.unit === u) })).filter((u) => u.levels.length);
    if (!units.length) throw new Error(text.mix.none);
    const sample = units[0].levels[0];
    return mixLevel(units, {
      count: preset.count,
      cfg: genCfg[subject],
      meta: {
        id: mixId(sample, preset.count),
        kid: sample.meta.kid,
        grade: sample.meta.grade,
        subject,
        source: text.mix.title,
        name: fill(text.mix.name, { n: preset.count }),
        why: fill(text.mix.why, { units: units.map((u) => u.unit).join('、') }),
        minutes: preset.minutes,
        mixUnits: units.map((u) => u.unit),
        mixPreset: preset,
      },
    });
  }

  /** 測驗塔最下面的綜合練習：勾單元、選題數 */
  function mixExtra(def, info) {
    const units = info.groups.filter((g) => g.items.some((l) => l.meta.unit && l.meta.make)).map((g) => g.title);
    if (!units.length) return null;
    const key = 'mix.' + kid + '.' + def.code;
    let saved = null;
    try { saved = JSON.parse(store.get(key) || 'null'); } catch { saved = null; }
    const selected = new Set(Array.isArray(saved) ? saved.filter((u) => units.includes(u)) : units);
    const sample = info.groups.flatMap((g) => g.items).find((l) => l.meta.unit && l.meta.make);
    return {
      units,
      selected,
      presets,
      best: (p) => progress.get(kid, mixId(sample, p.count)),
      toggle(u, on) {
        if (on) selected.add(u); else selected.delete(u);
        store.set(key, JSON.stringify([...selected]));
      },
      start(p) {
        const chosen = units.filter((u) => selected.has(u));
        if (!chosen.length) return false;
        let lv;
        try { lv = buildMix(chosen, p, def.subject); } catch (err) { hud.showErrors([{ file: text.mix.title, message: err.message }]); return true; }
        quiz.start(lv, { backLabel: '' });
        return true;
      },
    };
  }

  function backToAll() {
    focused = null;
    lastBuilding = null;
    hud.close();
    rig.overview();
  }

  // 點擊：按下和放開位置差不多才算點，拖曳不算
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  function hitAt(e) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    const hits = raycaster.intersectObjects(islandsGroup.children, true);
    for (const h of hits) { const w = whatWasHit(h.object); if (w) return w; }
    return null;
  }
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    const w = hitAt(e);
    if (!w) return;
    if (w.building) openBuilding(w.island, w.building);
    else openIsland(w.island);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    canvas.style.cursor = hitAt(e) ? 'pointer' : 'grab';
  });

  // 音樂：第一次點畫面才開始（瀏覽器規定）
  const music = createMusicBox(world.music, { muted: store.get('muted') === '1' });
  const startGate = hudRoot.querySelector('#start');
  const startText = document.createElement('span');
  startText.textContent = text.tapToStart;
  startGate.replaceChildren(startText);
  startGate.hidden = false;
  startGate.addEventListener('click', () => { startGate.hidden = true; music.start(); }, { once: true });
  const syncMute = () => hud.setMute(music.muted, () => {
    music.setMuted(!music.muted);
    store.set('muted', music.muted ? '1' : '0');
    music.start();
    syncMute();
  });
  syncMute();

  loading.hidden = true;
  rig.overview();

  const api = {
    progress,
    text,
    kids,
    kid: () => kid,
    refresh() {
      if (quizRoot.hidden === false || cardsUI?.isOpen) return; // 作答、看卡中不動，關掉後會自己重畫
      if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind);
    },
  };
  try { hooks.onReady?.(api); } catch (err) { console.error(err); }

  // 動畫
  const clock = new THREE.Clock();
  const bob = world.island;
  view.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (paused) return;
    const t = clock.elapsedTime;
    view.update(t);
    for (const g of islandsGroup.children) {
      g.position.y = Math.sin(t * bob.bobSpeed + g.userData.phase) * bob.bobAmount;
      g.traverse((o) => { if (o.name === 'flag') o.rotation.y = Math.sin(t * 3 + g.userData.phase) * 0.35; });
    }
    rig.update(dt);
    view.render();
  });

  return { ...api, openIsland, backToAll, quiz, cards: cardsUI };
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
