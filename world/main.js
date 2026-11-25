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

const store = {
  get(k) { try { return localStorage.getItem('elementa.' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('elementa.' + k, v); } catch { /* 沒有也沒關係 */ } },
};

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
 */
export async function startWorld({ canvas, hudRoot, quizRoot, configPath = 'config/', levelsPath = 'content/levels/', hooks = {} }) {
  const [subjects, theme, world, text, quizConfig] = await Promise.all([
    ...['subjects', 'theme', 'world', 'text'].map((n) => getJSON(configPath + n + '.json')),
    getJSON(configPath + 'quiz.json').catch(() => ({})), // 沒有 quiz.json 就用引擎預設
  ]);
  const settings = quizSettings(quizConfig);
  const hud = createHud(hudRoot, text);
  const loading = hudRoot.querySelector('#loading');
  loading.textContent = text.loading;

  if (!webglOK()) { loading.textContent = text.noWebGL; return; }

  let levels = [];
  try {
    const r = await loadLevels(levelsPath);
    levels = r.levels;
    hud.showErrors(r.errors);
  } catch (err) {
    hud.showErrors([{ file: 'index.json', message: err.message }]);
  }

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
  const quiz = createQuizUI(quizRoot, {
    text,
    settings,
    onOpenChange(open) {
      paused = open; // 作答時 3D 場景不畫，平板比較省電
      hudRoot.hidden = open;
      canvas.hidden = open;
    },
    onResult(result, level) {
      const info = progress.record(level.meta.kid, level.meta.id, result);
      try { hooks.onResult?.(resultSummary(result, level), info); } catch (err) { console.error(err); }
      return info;
    },
    onClose() {
      if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind);
    },
  });

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
      onStart: (l) => quiz.start(l),
    }, () => openIsland(code));
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
      if (quizRoot.hidden === false) return; // 作答中不動，關掉後會自己重畫
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

  return { ...api, openIsland, backToAll, quiz };
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
