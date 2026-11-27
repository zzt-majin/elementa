// world/main.js
// 把設定、關卡、測驗引擎和 3D 場景接在一起。index.html 只呼叫 startWorld()。
import * as THREE from 'three';
import { loadLevels, kidsIn, levelsFor, timeLimitMinutes } from '../engine/levels.js';
import { quizSettings, resultSummary, mmss } from '../engine/quiz.js';
import { createProgress, localStorageStorage } from '../engine/progress.js';
import { createScene } from './scene.js';
import { createCameraRig } from './camera.js';
import { buildIsland, whatWasHit, walkAreaOf } from './islands.js';
import { createControls } from './controls.js';
import { makePrincess } from '../avatar/princess.js';
import { createWalker, screenToGround, nearestDoor, surfaceAt } from '../avatar/walk.js';
import { createShoreWaves, createFootprints } from './shore.js';
import { bridgeConfig, bridgeLine, bridgeStrip, makeBridge, makeBridgeSite, makeMist } from './bridges.js';
import { bridgePlan, reachable, canStart, createBuildBook, bridgePrice } from '../engine/build.js';
import { createHud } from './hud.js';
import { createMusicBox } from './music.js';
import { clockText, msToNextMinute } from './clock.js';
import { createCalendar } from './calendar.js';
import { milestones } from '../engine/diary.js';
import { createQuizUI } from './quiz-ui.js';
import { createCardsUI } from './cards-ui.js';
import { cardSettings, ruleFor, cardState } from '../engine/cards.js';
import { materialize, mixLevel } from '../engine/generate.js';
import { raceSettings, rulesFor, raceId, poolState, buildPool, createDrawer, raceSummary, shouldRecord } from '../games/quiz-race/race.js';
import { createRaceUI } from '../games/quiz-race/race-ui.js';
import { economyRules, computeWallet, createLedger, newEntryId, previewEarn, canAfford } from '../engine/economy.js';

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
 *   onReady(world)：群島畫好後呼叫一次。world = { progress, text, kids, kid(), refresh(), ledger, refreshWallet(), wallet(kid) }
 *     refresh()：成績從別處合併進來後呼叫，打開中的測驗塔清單會重畫。
 *   onKidChange(kid)：切換小孩時呼叫。
 *   onResult(summary, info)：每次交卷後呼叫。summary 是 resultSummary() 的精簡紀錄，info 是 progress.record() 的回傳。
 *   settingsOf(kid)：家長在試算表「設定」填的規則（登入模組提供）；沒有就用 config 的預設。
 *     學習屋用 cards，遊戲帳篷用 gameSeconds、wrongPenalty、gamePool。
 *   搶答賽結束也會呼叫 onResult，summary.kind 是 'game'，關卡代號是 game-<島的代號>。
 *   summary.id 是這筆作答的編號，送到試算表時一起存，帳本靠它合併本機和雲端的紀錄。
 *   world.ledger.merge(kid, history)＋world.refreshWallet()：雲端回傳作答紀錄時，合併後重算歐巴幣和寶石。
 *   onBuild(kid, build)：蓋好一座橋時呼叫（存到試算表「建設」），build 的格式見 engine/build.js。
 *   world.builds.merge(kid, builds)＋world.refreshBuilds(kid)：雲端回傳建設時，合併後重畫橋、重算歐巴幣。
 */
export async function startWorld({ canvas, hudRoot, quizRoot, cardsRoot, gameRoot, configPath = 'config/', levelsPath = 'content/levels/', hooks = {} }) {
  const [subjects, theme, world, text, quizConfig, cardsConfig, mixConfig, gameConfig, economyConfig, familyConfig, musicLoaded, calendarConfig] = await Promise.all([
    ...['subjects', 'theme', 'world', 'text'].map((n) => getJSON(configPath + n + '.json')),
    getJSON(configPath + 'quiz.json').catch(() => ({})), // 沒有 quiz.json 就用引擎預設
    getJSON(configPath + 'cards.json').catch(() => ({})), // 沒有 cards.json 就用引擎預設
    getJSON(configPath + 'mix.json').catch(() => ({})),
    getJSON(configPath + 'game.json').catch(() => ({})), // 沒有 game.json 就用搶答賽預設
    getJSON(configPath + 'economy.json').catch(() => ({})), // 歐巴幣、寶石、建設價格
    getJSON(configPath + 'family.json').catch(() => ({})), // 家裡有哪些小孩（還沒有關卡的也能登入）
    getJSON(configPath + 'music.json').catch(() => ({})), // 背景音樂的歌單和時鐘的時區
    getJSON(configPath + 'calendar.json').catch(() => ({})), // 左上角的日曆：國定假日、每天的名人和紀念日放哪
  ]);
  const presets = (Array.isArray(mixConfig?.presets) ? mixConfig.presets : [])
    .map((p) => ({ count: Math.round(Number(p.count)), minutes: Number(p.minutes) }))
    .filter((p) => p.count >= 1 && p.count <= 60 && p.minutes > 0);
  const settings = quizSettings(quizConfig);
  const cardConf = cardSettings(cardsConfig);
  const raceConf = raceSettings(gameConfig);
  const hud = createHud(hudRoot, text);
  // 左上角的日曆（傳統臺灣撕日曆）：點人名或節日跳出介紹；每天的資料讀 content/calendar/月-日.md
  const calendarRoot = hudRoot.querySelector('#calendar');
  const calendar = calendarRoot ? createCalendar(calendarRoot, hudRoot, {
    text: text.calendar || {},
    config: calendarConfig || {},
    fetchText: async (url) => { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? r.text() : null; },
    onDayChange: () => refreshDiary(),
  }) : { isOpen: () => false, close() {}, setDiary() {}, celebrate(m, done) { done?.(); }, today: () => null };
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
  // 沙灘邊的海浪（一圈一圈白色浪花往外推）和小公主在沙灘上的足跡（3 秒後慢慢消失）
  const waves = createShoreWaves(view.scene, world.shore);
  const footprints = createFootprints(view.scene, world.footprints);
  waves.build(subjects.islands, world.island);
  const bridgesGroup = new THREE.Group(); // 蓋好的橋、還沒蓋的虛線和浮標
  view.scene.add(bridgesGroup);
  const mistGroup = new THREE.Group(); // 還沒連上的島周圍的淡霧
  view.scene.add(mistGroup);

  // 小孩：config/family.json 列的，加上關卡檔裡出現的（還沒有關卡的小孩也能登入，看到建造中的島）
  const familyKids = (Array.isArray(familyConfig?.kids) ? familyConfig.kids : []).filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim());
  const kids = [...new Set([...familyKids, ...kidsIn(levels)])];
  let kid = kids.includes(store.get('kid')) ? store.get('kid') : kids[0] || null;
  let focused = null;
  let lastBuilding = null;

  // 成績：先存在這台裝置；登入模組做好後由 hooks 同步到試算表
  const progress = createProgress(localStorageStorage('elementa.progress'));
  const minutesOf = (l) => timeLimitMinutes(l, settings.minutesPerQuestion);

  // 歐巴幣和寶石：不記餘額，每次從作答紀錄照 config/economy.json 重算（engine/economy.js）
  const econ = { ...economyRules(economyConfig), currencyName: economyConfig?.currencyName || '' };
  const ledger = createLedger(localStorageStorage('elementa.ledger'));
  // 蓋了哪些橋：每個小孩一份（engine/build.js）；花掉的歐巴幣從餘額扣
  const builds = createBuildBook(localStorageStorage('elementa.builds'));
  const islandOfSubject = (s) => subjects.islands.find((i) => i.subject === s)?.code || '';
  /** 試算表來的紀錄沒有科目：從關卡代號找（一般關卡、綜合練習 xxx-mix-10、搶答賽 game-<島>） */
  function islandOf(e) {
    const m = /^game-([a-z0-9-]+)$/.exec(e.level);
    if (m) return subjects.islands.some((i) => i.code === m[1]) ? m[1] : '';
    const l = levels.find((x) => x.meta.id === e.level);
    if (l) return islandOfSubject(l.meta.subject);
    const mix = /^(.*)-mix-\d+$/.exec(e.level);
    if (mix) { const s = levels.find((x) => x.meta.id.startsWith(mix[1] + '-')); if (s) return islandOfSubject(s.meta.subject); }
    return '';
  }
  const walletOf = (k) => computeWallet({ history: ledger.history(k), spends: builds.effective(k), rules: econ, islandOf });
  function showWallet() {
    if (!kid) { hud.setWallet(null); return; }
    const w = walletOf(kid);
    // 有關卡的島、或已經有寶石的島，才顯示那一種寶石
    const shown = subjects.islands.filter((i) => econ.gems[i.code] && (levelsFor(levels, { kid, subject: i.subject }).count || w.gems[i.code]))
      .map((i) => ({ code: i.code, name: econ.gems[i.code].name, color: econ.gems[i.code].color, n: w.gems[i.code] || 0 }));
    hud.setWallet({ coins: w.coins, gems: shown });
  }
  /** 記進帳本，回傳交卷畫面要顯示的「獲得 …」 */
  function earn(k, summary, kind) {
    const island = islandOfSubject(summary.subject);
    ledger.add(k, { id: summary.id, at: Date.parse(summary.at) || Date.now(), level: summary.level, island, score: summary.score, total: summary.total, kind });
    const ev = walletOf(k).events.find((x) => x.id === summary.id);
    showWallet();
    if (!ev || kind === 'retry') return '';
    const T = text.economy || {};
    const parts = [];
    if (ev.coins) parts.push(fill(T.coins, { n: ev.coins, name: econ.currencyName || '歐巴幣' }));
    for (const [code, n] of Object.entries(ev.gems)) parts.push(fill(T.gems, { n, name: econ.gems[code]?.name || '' }));
    return parts.length ? fill(T.reward, { items: parts.join('、') }) : (T.noReward || '');
  }

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
      const summary = { ...resultSummary(result, level), id: newEntryId() };
      const rewardText = earn(summary.kid, summary, result.retry ? 'retry' : 'level');
      try { hooks.onResult?.(summary, info); } catch (err) { console.error(err); }
      return { ...info, rewardText };
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

  // 遊戲帳篷（搶答賽）：秒數、扣秒、題目來源照試算表「設定」（hooks.settingsOf），沒有就照 config/game.json
  const raceUI = gameRoot ? createRaceUI(gameRoot, {
    text,
    settings: raceConf,
    onOpenChange: overlayChange,
    onClose() { if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind); },
    onResult: (result) => raceDone(result),
  }) : null;
  let raceMeta = null; // 正在比的這一場：哪個小孩、哪座島
  const raceRules = () => {
    let sheet = null;
    try { sheet = hooks.settingsOf?.(kid) || null; } catch (err) { console.error(err); }
    return rulesFor(sheet, raceConf);
  };

  // ---------- 3D 小公主（avatar/）----------
  // mode：'walk' 鏡頭跟著小公主，方向鍵／點地面走路，走到門口進建築；'map' 拉遠看全部的島，點島打開清單
  const av = world.avatar || {};
  const W = text.walk || {};
  const homeCode = subjects.islands.some((i) => i.code === av.homeIsland) ? av.homeIsland : subjects.islands[0]?.code;
  const princessModel = makePrincess(princess, av);
  view.scene.add(princessModel.group);
  const walker = createWalker({ x: 0, z: 0, heading: 0 }, { speed: av.speed, body: av.body });
  const doorDistance = world.village?.doorDistance ?? 1.6;
  const touch = !!window.matchMedia?.('(pointer: coarse)').matches;
  let mode = 'walk';
  let area = null; // 小公主能走的地方（世界座標）：數學島＋蓋好的橋連過去的島和橋
  let door = null; // 現在站在哪一個門口（建築或橋頭）
  const playerPoint = () => princessModel.group.position;
  /** 回到自己數學島的出生點（一開始、切換姐姐／妹妹） */
  function placeAtHome() {
    area = computeArea();
    if (area) walker.place({ x: area.spawn.x, z: area.spawn.z, heading: 0 });
    princessModel.group.position.set(walker.x, area ? surfaceAt(walker, area, area.top).y : 0.9, walker.z);
    footprints.clear();
    princessModel.group.rotation.y = walker.heading;
    door = null;
    hud.setEnter(null);
  }

  // ---------- 橋（世界設定第 4 步）----------
  const bcfg = bridgeConfig(world.bridge);
  const plan = bridgePlan(subjects, homeCode); // 可以蓋哪些橋：[{ key, from, to }]
  const isl = (code) => subjects.islands.find((i) => i.code === code);
  const lineOf = (b) => bridgeLine(isl(b.from), isl(b.to), world.island, bcfg);
  const B = () => text.bridge || {};
  let reach = new Set([homeCode]); // 現在走得到的島
  const bridgeViews = new Map(); // key → { b, line, kind: 'built'|'site', view }
  let growing = null; // 正在蓋的橋：{ key, t, view }
  /** 這座島上要留給橋的路（不種樹）：島自己的座標裡的方向 */
  function pathsFor(code) {
    const out = [];
    for (const b of plan) {
      if (b.from !== code && b.to !== code) continue;
      const u = lineOf(b).u;
      out.push(b.from === code ? { x: u.x, z: u.z, half: bcfg.width / 2 } : { x: -u.x, z: -u.z, half: bcfg.width / 2 });
    }
    return out;
  }
  // ---------- 日記（里程碑）：日曆最下面記今天完成的事；完成時先跳出「恭喜完成…」 ----------
  const islandNames = Object.fromEntries(subjects.islands.map((i) => [i.code, i.name]));
  const CT = () => text.calendar || {};
  let started = false; // 按過「點一下出發」才跳祝賀（不然會被蓋住）
  const celebratedKey = () => 'celebrated.' + kid;
  function celebrated() {
    try { const a = JSON.parse(store.get(celebratedKey()) || '[]'); return new Set(Array.isArray(a) ? a : []); } catch { return new Set(); }
  }
  const allMilestones = () => (kid ? milestones({ builds: builds.list(kid), plan, names: islandNames, text: CT(), timeZone: calendarConfig?.timeZone || 'Asia/Taipei' }) : []);
  function todayKey() {
    const t = calendar.today?.();
    return t ? t.year + '-' + String(t.month).padStart(2, '0') + '-' + String(t.day).padStart(2, '0') : '';
  }
  /** 日曆下面的日記：只放今天、已經祝賀過的（還在等祝賀的，按了「寫進日記」才出現） */
  function refreshDiary(fresh = '') {
    if (!kid) { calendar.setDiary('', []); return; }
    const done = celebrated();
    const today = todayKey();
    const list = allMilestones().filter((m) => m.day === today && done.has(m.id)).map((m) => ({ id: m.id, line: m.line }));
    calendar.setDiary(fill(CT().diaryTitle, { kid }), list, fresh);
  }
  /** 有還沒祝賀的里程碑就跳出來（一次一個，按了再跳下一個） */
  function checkCelebrate() {
    if (!started || !kid || paused || growing || calendar.isOpen()) return;
    const done = celebrated();
    const next = allMilestones().find((m) => !done.has(m.id));
    if (!next) return;
    const who = kid;
    calendar.celebrate(next, () => {
      const set = celebrated();
      set.add(next.id);
      store.set('celebrated.' + who, JSON.stringify([...set]));
      if (who === kid) refreshDiary(next.id);
      setTimeout(checkCelebrate, 400);
    });
  }

  /** 已經蓋好幾座橋（同一座只算一次） */
  const bridgesBuilt = () => (kid ? builds.effective(kid).filter((x) => x.kind === 'bridge').length : 0);
  /** 下一座橋要多少（第 n 座 = 120 × n，數字在 config/economy.json 的 build.bridge） */
  const nextPrice = () => bridgePrice(econ.build.bridge, bridgesBuilt());
  const priceText = () => fill(B().signSub, { n: nextPrice().coins, coin: econ.currencyName || '歐巴幣' });
  /** 「橋越蓋越貴囉！」說明：蓋好第 1 座以後第一次打開建設面板跳出一次（每個小孩記在這台裝置），之後按「為什麼變貴了？」再看 */
  function bridgeIntro(onDone) {
    const T = B();
    const coin = econ.currencyName || '歐巴幣';
    const done = bridgesBuilt();
    const rule = econ.build.bridge || {};
    const rows = plan.map((_, i) => ({
      n: i + 1,
      coins: bridgePrice(rule, i).coins,
      state: i < done ? 'done' : i === done ? 'now' : 'later',
    }));
    hud.showIntro({
      title: T.introTitle,
      lead: done === 1 ? T.introDone1 : fill(T.introDoneN, { done }),
      rule: fill(T.introRule, { step: rule.step || 0, coin }),
      rows,
      labels: { done: T.introBuilt, now: T.introNow, nth: T.introNth },
      unit: fill(T.introUnit, { coin }),
      tipTitle: T.introTipTitle,
      tip: fill(T.introTip, { coin }),
      ok: T.introOk,
    }, onDone);
  }
  /** 畫橋、虛線、淡霧（照這個小孩蓋過的） */
  function drawBridges() {
    bridgesGroup.clear();
    mistGroup.clear();
    bridgeViews.clear();
    growing = null;
    const built = kid ? builds.built(kid) : new Set();
    reach = reachable(plan, built, homeCode);
    for (const b of plan) {
      const line = lineOf(b);
      if (built.has(b.key)) {
        const v = makeBridge(line, colors, bcfg, b.key);
        bridgesGroup.add(v.group);
        bridgeViews.set(b.key, { b, line, kind: 'built', view: v });
      } else if (canStart(b, reach)) {
        const v = makeBridgeSite(line, colors, bcfg, b.key, B().signTitle || '', priceText());
        bridgesGroup.add(v.group);
        bridgeViews.set(b.key, { b, line, kind: 'site', view: v });
      }
    }
    for (const def of subjects.islands) if (!reach.has(def.code)) mistGroup.add(makeMist(def, world.island, bcfg));
    refreshDiary();
    setTimeout(checkCelebrate, 0); // 換小孩、雲端合併進來別台蓋的橋，也看看要不要祝賀
  }
  /** 小公主能走的地方：走得到的島＋蓋好的橋；門口：那些島上的建築＋還沒蓋的橋頭 */
  function computeArea() {
    const groups = islandsGroup.children.filter((g) => reach.has(g.userData.island));
    if (!groups.length) return null;
    const parts = groups.map((g) => walkAreaOf(g));
    const home = parts.find((p) => p.island === homeCode) || parts[0];
    const grounds = parts.map((p) => ({ type: 'circle', cx: p.cx, cz: p.cz, r: p.radius, grassR: p.grassR, slopeR: p.slopeR, sandTop: p.sandTop, island: p.island }));
    const doors = parts.flatMap((p) => p.doors.map((d) => ({ ...d, id: d.island + ':' + d.kind })));
    for (const [key, v] of bridgeViews) {
      if (v.kind === 'built' && growing?.key !== key) grounds.push({ ...bridgeStrip(v.line), bridge: key });
      if (v.kind === 'site') {
        // 橋頭：站在走得到的那一頭的草地邊上
        const fromSide = reach.has(v.b.from);
        const end = fromSide ? v.line.a : v.line.b;
        const dir = fromSide ? v.line.u : { x: -v.line.u.x, z: -v.line.u.z };
        doors.push({ kind: 'bridge', key, id: 'bridge:' + key, x: end.x - dir.x * 0.8, z: end.z - dir.z * 0.8, face: Math.atan2(dir.x, dir.z), reach: Math.max(doorDistance, bcfg.width) });
      }
    }
    return { grounds, obstacles: parts.flatMap((p) => p.obstacles), doors, spawn: home.spawn, top: home.top };
  }
  const otherEnd = (b) => (reach.has(b.from) ? b.to : b.from);

  /** 點浮標、虛線，或站在橋頭按「蓋橋」：打開建設面板 */
  function openBridge(key) {
    const v = bridgeViews.get(key);
    const b = v?.b || plan.find((x) => x.key === key);
    if (!b) return;
    focused = null;
    lastBuilding = null;
    walker.stop();
    const T = B();
    const coin = econ.currencyName || '歐巴幣';
    const fromName = isl(reach.has(b.to) && !reach.has(b.from) ? b.to : b.from)?.name || '';
    const toName = isl(otherEnd(b))?.name || '';
    const price = nextPrice();
    const w = kid ? walletOf(kid) : { coins: 0, gems: {} };
    const pay = canAfford(w, price);
    const step = econ.build.bridge?.step || 0;
    const raised = step > 0 && price.nth >= 2; // 已經蓋過，價錢開始往上加
    const built = v?.kind === 'built' || growing?.key === key;
    const state = built ? 'built' : !canStart(b, reach) ? 'locked' : pay.ok ? 'ready' : 'short';
    const target = isl(otherEnd(b));
    const hasLevels = target && levelsFor(levels, { kid, subject: target.subject }).count > 0;
    if (mode === 'map' && v) rig.focus(new THREE.Vector3(v.line.mid.x, 0, v.line.mid.z), 0.7);
    hud.showBridge({
      title: fill(T.title, { to: toName }),
      body: fill(T.body, { from: fromName, to: toName }) + (hasLevels ? '' : ' ' + fill(T.emptyIsland, { to: toName })),
      note: hasLevels && !built ? fill(T.learnNote, { to: toName }) : '',
      price: fill(T.price, { n: price.coins, coin }),
      have: fill(T.have, { n: w.coins, coin }),
      short: fill(T.short, { n: pay.short.coins, coin }),
      state,
      builtText: T.built,
      lockedText: fill(T.locked, { from: fromName }),
      buildLabel: fill(T.build, { n: price.coins, coin }),
      confirmLabel: fill(T.confirm, { n: price.coins, coin }),
      nthText: raised && state !== 'built' ? fill(T.nth, { n: price.nth }) : '',
      whyLabel: raised && state !== 'built' ? T.why : '',
      onWhy: () => bridgeIntro(() => openBridge(key)),
      onBuild: () => buildBridge(key),
    }, backToAll);
    // 蓋好第 1 座以後，第一次打開建設面板：先跳出說明
    const seenKey = 'bridgeIntro.' + kid;
    if (raised && state !== 'built' && kid && store.get(seenKey) !== '1') {
      store.set(seenKey, '1');
      bridgeIntro(null);
    }
  }

  /** 真的蓋下去：記帳、存到試算表、木板一片一片長出來，蓋好後才能走 */
  function buildBridge(key) {
    const v = bridgeViews.get(key);
    if (!kid || !v || v.kind !== 'site' || growing) return false;
    const price = nextPrice();
    if (!canAfford(walletOf(kid), price).ok || !canStart(v.b, reach)) { openBridge(key); return false; }
    const rec = { id: newEntryId(), at: Date.now(), kind: 'bridge', key, coins: price.coins, gems: price.gems || {} };
    if (!builds.add(kid, rec)) { openBridge(key); return false; }
    try { hooks.onBuild?.(kid, { ...rec, name: isl(v.b.from)?.name + '—' + isl(v.b.to)?.name }); } catch (err) { console.error(err); }
    showWallet();
    hud.close();
    door = null;
    hud.setEnter(null);
    // 虛線換成正在長的橋
    bridgesGroup.remove(v.view.group);
    const nb = makeBridge(v.line, colors, bcfg, key);
    nb.grow(0);
    bridgesGroup.add(nb.group);
    bridgeViews.set(key, { ...v, kind: 'built', view: nb });
    growing = { key, t: 0, view: nb, line: v.line, b: v.b };
    // 鏡頭飛去看橋長出來
    rig.flyTo(new THREE.Vector3(v.line.mid.x, 1, v.line.mid.z), v.line.len * 0.9 + 12, v.line.len * 0.55 + 10);
    return true;
  }
  /** 每一格：橋長出來；長好了就能走、霧散掉、鏡頭回到小公主 */
  function stepGrowing(dt) {
    if (!growing) return;
    growing.t += dt / Math.max(0.2, bcfg.growSeconds);
    growing.view.grow(growing.t);
    const to = otherEnd(growing.b);
    const mist = mistGroup.children.find((m) => m.userData.mist === to);
    if (mist) mist.material.opacity = bcfg.mist.opacity * Math.max(0, 1 - growing.t);
    if (growing.t < 1.25) return; // 長好後停一下再回去
    const done = growing;
    const toName = isl(to)?.name || '';
    drawBridges(); // 重新算走得到的島（新的島上的橋頭、淡霧也一起更新）
    area = computeArea();
    if (mode === 'walk') rig.follow(playerPoint); else rig.focus(new THREE.Vector3(done.line.mid.x, 0, done.line.mid.z), 0.7);
    hud.flash(fill(B().done, { to: toName }), 5000);
    setTimeout(checkCelebrate, 300); // 橋長好了：恭喜完成第幾座橋
  }
  const showLabels = () => { for (const g of islandsGroup.children) if (g.userData.label) g.userData.label.visible = mode === 'map'; };

  function rebuild() {
    islandsGroup.clear();
    for (const def of subjects.islands) {
      const info = levelsFor(levels, { kid, subject: def.subject });
      const g = buildIsland(def, colors, {
        island: world.island,
        village: world.village,
        levelCount: info.count,
        labels: { construction: text.construction, count: text.islandCount },
        paths: pathsFor(def.code),
      });
      g.userData.phase = def.position[0] * 0.3 + def.position[1] * 0.2;
      islandsGroup.add(g);
    }
    drawBridges();
    showWallet();
    placeAtHome();
    showLabels();
    hud.setKids(kids, kid, (k) => {
      kid = k; store.set('kid', k); rebuild();
      // 每人一份群島：小公主回到自己的數學島
      if (mode === 'map' && focused) openIsland(focused);
      else { focused = null; lastBuilding = null; hud.close(); if (mode === 'walk') rig.follow(playerPoint, { snap: true }); }
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
    if (mode === 'map') rig.focus(g.position, def.size || 1);
    hud.showIsland(def, levelsFor(levels, { kid, subject: def.subject }), subjects.buildings, (kind) => openBuilding(code, kind), backToAll);
  }

  function openBuilding(code, kind) {
    const def = byCode(code);
    const info = levelsFor(levels, { kid, subject: def.subject });
    if (!info.count) { openIsland(code); return; }
    focused = code;
    lastBuilding = { code, kind };
    const g = groupOf(code);
    if (mode === 'map') rig.focus(g.position, (def.size || 1) * 0.8);
    hud.showBuilding(def, kind, subjects.buildings[kind], info, {
      minutes: minutesOf,
      mmss,
      best: (l) => progress.get(l.meta.kid, l.meta.id),
      // 從學習屋去寫測驗：交卷後回到學習屋，剛打開的學習卡馬上看得到
      // 從遊戲帳篷去寫測驗：交卷後回到帳篷，這一關的選擇題馬上放進題庫
      onStart: (l) => startQuiz(l, { backLabel: kind === 'house' ? text.cards.leave : kind === 'tent' ? text.race.leave : '' }),
      mix: kind === 'tower' && presets.length ? mixExtra(def, info) : null,
      towerReward: kind === 'tower' ? towerReward(def) : null,
      house: kind === 'house' && cardsUI ? houseExtra(code) : null,
      tent: kind === 'tent' && raceUI ? tentExtra(def, info) : null,
    }, () => (mode === 'walk' ? backToAll() : openIsland(code))); // 走路模式按返回：回到小公主
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

  /** 遊戲帳篷：規則、題庫、最高紀錄、開始 */
  // ---------- 畫面上的獎賞說明（數字都照 config/economy.json，現在能拿多少照作答紀錄試算） ----------
  const RW = () => text.reward || {};
  const coinName = () => econ.currencyName || '歐巴幣';
  // 還沒到歸零時間時，照歸零後算（不然畫面會全部寫 0）
  const preview = (entry) => previewEarn({ history: kid ? ledger.history(kid) : [], rules: econ, islandOf, entry, now: Math.max(Date.now(), econ.coinsResetAt || 0) });
  /** 0.9 → 9 折、0.85 → 85 折、0 → 沒有 */
  const discountName = (r) => {
    const n = Math.round(r * 100);
    if (n <= 0) return RW().none || '0';
    return (n % 10 === 0 ? n / 10 : n) + ' 折';
  };

  /** 測驗塔上方：歐巴幣怎麼拿（錯幾題打幾折） */
  function towerReward(def) {
    const T = RW();
    const rates = econ.wrongRates;
    const list = rates.slice(1).map((r, i) => fill(T.wrongRate, { w: i + 1, rate: discountName(r) })).join('、');
    const first = econ.levelFirstSubmit;
    const per = econ.levelFirstPerfectPerQuestion;
    return {
      title: T.towerTitle,
      rule: fill(T.towerRule, { coin: coinName(), first, per, ex: first + per * 7, list, none: rates.length, daily: econ.levelRepeatPerfectDaily }),
      /** 這一關（或綜合練習）現在交卷：全對、錯 1 題、錯 2 題…各會拿多少 */
      coinLine(levelId, total) {
        const vals = rates.map((_, w) => (total - w >= 0 ? preview({ level: levelId, island: def.code, score: total - w, total, kind: 'level' }).coins : 0));
        if (vals.every((v) => !v)) return T.levelDone;
        const items = vals.map((n, w) => (w ? fill(T.wrongItem, { w, n }) : fill(T.perfectItem, { n }))).join('・');
        return fill(T.levelLine, { items, coin: coinName() });
      },
    };
  }

  /** 遊戲帳篷：答對的獎賞、今天還能拿多少、最高紀錄的目標 */
  function tentReward(def, id, best) {
    const T = RW();
    const coin = coinName();
    const gem = econ.gems[def.code]?.name || '';
    const p = raceRules().penalty ?? 0;
    const lines = [fill(T.perCorrect, { n: econ.quizGamePerCorrect, coin })];
    if (econ.quizGameNewRecord) lines.push(fill(T.record, { n: econ.quizGameNewRecord, coin }));
    if (gem && econ.gemGameEvery) lines.push(fill(T.gemEvery, { n: econ.gemGameEvery, gem }));
    lines.push(fill(p ? T.wrong : T.wrongNoPenalty, { coin, p }));
    const caps = [];
    if (econ.quizGameDailyCap) caps.push(fill(T.capCoins, { cap: econ.quizGameDailyCap, coin }));
    if (gem && econ.gemDailyCapPerIsland) caps.push(fill(T.capGems, { gcap: econ.gemDailyCapPerIsland, gem }));
    if (caps.length) lines.push(caps.join('；'));
    const k = Number(T.exampleCorrect) || 12;
    const a = k * econ.quizGamePerCorrect;
    const g = gem && econ.gemGameEvery ? Math.floor(k / econ.gemGameEvery) : 0;
    const gemPart = g ? fill(T.exampleGem, { g, gem }) : '';
    let example = fill(T.example, { k, a, coin, gems: gemPart });
    if (econ.quizGameNewRecord) example += fill(T.exampleRecord, { b: a + econ.quizGameNewRecord, coin, gems: gemPart });
    let today = '';
    if (econ.quizGameDailyCap) {
      const left = preview({ level: id, island: def.code, score: 1000, total: 1, kind: 'game' }).coins;
      today = left > 0 ? fill(T.todayLeft, { n: left, coin }) : fill(gem ? T.todayFull : T.todayFullNoGem, { coin, gem });
    }
    const bestText = best && econ.quizGameNewRecord ? fill(T.bestTarget, { n: best.best, m: best.best + 1, bonus: econ.quizGameNewRecord, coin }) : '';
    return { title: T.tentTitle, lines, example, today, bestText };
  }

  function tentExtra(def, info) {
    const T = text.race;
    const rules = raceRules();
    const all = info.groups.flatMap((g) => g.items);
    const recordOf = (l) => progress.get(l.meta.kid, l.meta.id);
    const id = raceId(def.code, raceConf);
    const pool = buildPool(all, recordOf, rules.pool);
    return {
      ruleText: fill(T.tentRules, { s: rules.seconds, p: rules.penalty, pool: T.poolNames[rules.pool] || rules.pool }) + (rules.from === 'sheet' ? T.fromSheet : T.fromDefault),
      poolCount: pool.levels.length,
      best: progress.get(kid, id),
      reward: tentReward(def, id, progress.get(kid, id)),
      state: (l) => poolState(l, recordOf(l), rules.pool),
      onStart() {
        // 按下去那一刻再算一次，避免清單畫好後成績或設定變了
        const r = raceRules();
        const p = buildPool(all, recordOf, r.pool);
        if (!p.sources.length) { openBuilding(def.code, 'tent'); return; }
        raceMeta = { id, kid, subject: def.subject, grade: p.levels[0].meta.grade || '', name: fill(T.levelName, { island: def.name }), source: T.title };
        raceUI.open({
          title: fill(T.screenTitle, { island: def.name }),
          rules: r,
          poolLevels: p.levels.length,
          best: () => progress.get(raceMeta.kid, id),
          makeDrawer: () => createDrawer(p.sources, { cfgOf: (s) => genCfg[s] || {} }),
        });
      },
    };
  }

  /** 一場搶答賽結束：記最高紀錄（progress 的 game-<島>），再交給 hooks（雲端、日後的歐巴幣） */
  function raceDone(result) {
    const m = raceMeta;
    if (!m || !shouldRecord(result)) return { saved: false };
    const info = progress.record(m.kid, m.id, result);
    const summary = { ...raceSummary(result, m), id: newEntryId() };
    const rewardText = earn(m.kid, summary, 'game');
    try { hooks.onResult?.(summary, info); } catch (err) { console.error(err); }
    return { ...info, rewardText };
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
      coinLine: (p) => towerReward(def).coinLine(mixId(sample, p.count), p.count),
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
    if (mode === 'map') rig.overview();
  }

  /** 切換「跟著小公主」和「地圖」 */
  function setMode(m) {
    mode = m;
    focused = null;
    lastBuilding = null;
    hud.close();
    walker.stop();
    door = null;
    hud.setEnter(null);
    showLabels();
    if (m === 'map') rig.overview(); else rig.follow(playerPoint);
    hud.setMap(m === 'map', () => setMode(mode === 'map' ? 'walk' : 'map'));
    hud.setHint(m === 'map' ? (W.hintMap || text.hint) : touch ? (W.hintTouch || text.hint) : text.hint);
  }

  /** 走到門口後按「進入」或空白鍵 */
  function enterDoor() {
    if (mode !== 'walk' || !door || hud.isOpen() || paused) return;
    walker.stop();
    if (door.kind === 'bridge') openBridge(door.key);
    else openBuilding(door.island, door.kind);
  }

  const controls = createControls({
    enabled: () => mode === 'walk' && !paused && !hud.isOpen() && !calendar.isOpen(),
    onAction: enterDoor,
    onEscape() {
      if (paused) return; // 作答、看卡時交給那個畫面自己處理
      if (calendar.isOpen()) { calendar.close(); return; }
      if (hud.isOpen()) backToAll();
      else if (mode === 'map') setMode('walk');
    },
  });

  // 點擊：按下和放開位置差不多才算點，拖曳不算
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  function hitAt(e) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    const hits = raycaster.intersectObjects([...islandsGroup.children, ...bridgesGroup.children], true);
    for (const h of hits) { const w = whatWasHit(h.object); if (w) return { ...w, point: h.point || null }; }
    return null;
  }
  /** 點到海上：和草地同高的平面上的那一點（hitAt 之後呼叫，用同一條射線） */
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.9);
  function groundAt() {
    const p = new THREE.Vector3();
    return raycaster.ray.intersectPlane(ground, p) ? p : null;
  }
  /** 走路模式點畫面：點建築就走到它的門口，點地面就走過去（點海裡會走到岸邊） */
  function tapWalk(e) {
    if (!area) return;
    if (hud.isOpen()) backToAll();
    const w = hitAt(e);
    if (w && w.bridge) {
      if (bridgeViews.get(w.bridge)?.kind === 'site') { openBridge(w.bridge); return; }
    } else if (w && w.island && !reach.has(w.island)) {
      openIsland(w.island); // 還沒蓋橋的島：直接打開清單（沒蓋橋也能學）
      return;
    } else if (w && w.building) {
      const d = area.doors.find((x) => x.kind === w.building && x.island === w.island);
      if (d) { walker.goTo(d, area, d.face); return; }
    }
    const p = (w && w.point) || groundAt();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.z)) walker.goTo({ x: p.x, z: p.z }, area);
  }
  canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    if (paused) return;
    if (mode === 'walk') { tapWalk(e); return; }
    const w = hitAt(e);
    if (!w) return;
    if (w.bridge) { if (bridgeViews.get(w.bridge)?.kind === 'site') openBridge(w.bridge); return; }
    if (w.building) openBuilding(w.island, w.building);
    else openIsland(w.island);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    canvas.style.cursor = mode === 'walk' || hitAt(e) ? 'pointer' : 'grab';
  });

  // 音樂：第一次點畫面才開始（瀏覽器規定）。右上角：時鐘（24 小時制，config/music.json 的 timeZone，預設台灣時間）＋換歌＋關掉音樂
  const musicConfig = musicLoaded || {};
  const music = createMusicBox(musicConfig, { muted: store.get('muted') === '1', song: Number(store.get('song')) || 0 });
  const tz = typeof musicConfig.timeZone === 'string' && musicConfig.timeZone ? musicConfig.timeZone : 'Asia/Taipei';
  hud.startClock((ms) => clockText(ms, tz), text.music?.clockLabel, msToNextMinute);
  const showMusic = (flash = false) => hud.setMusic({ muted: music.muted, index: music.index, count: music.count, name: music.name, flash }, {
    prev() { music.prev(); store.set('song', String(music.index)); showMusic(true); },
    next() { music.next(); store.set('song', String(music.index)); showMusic(true); },
    toggle() {
      music.setMuted(!music.muted);
      store.set('muted', music.muted ? '1' : '0');
      music.start();
      showMusic();
    },
  });
  showMusic();
  const startGate = hudRoot.querySelector('#start');
  const startText = document.createElement('span');
  startText.textContent = text.tapToStart;
  startGate.replaceChildren(startText);
  startGate.hidden = false;
  startGate.addEventListener('click', () => { startGate.hidden = true; music.start(); started = true; checkCelebrate(); }, { once: true });

  loading.hidden = true;
  setMode('walk');
  rig.follow(playerPoint, { snap: true });

  const api = {
    progress,
    text,
    kids,
    kid: () => kid,
    ledger,
    /** 雲端合併作答紀錄後呼叫，重算畫面上的歐巴幣和寶石 */
    refreshWallet: () => showWallet(),
    builds,
    /** 雲端合併建設後呼叫：重畫橋、重算走得到的島和歐巴幣 */
    refreshBuilds(k = kid) {
      if (k !== kid || growing) { showWallet(); return; }
      drawBridges();
      area = computeArea();
      showWallet();
    },
    wallet: (k = kid) => walletOf(k),
    refresh() {
      if (quizRoot.hidden === false || cardsUI?.isOpen || raceUI?.isOpen) return; // 作答、看卡中不動，關掉後會自己重畫
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
    for (const g of islandsGroup.children) {
      g.position.y = Math.sin(t * bob.bobSpeed + g.userData.phase) * (bob.bobAmount || 0);
      g.traverse((o) => { if (o.name === 'flag') o.rotation.y = Math.sin(t * 3 + g.userData.phase) * 0.35; });
    }
    for (const v of bridgeViews.values()) if (v.view.buoy) v.view.buoy.position.y = Math.sin(t * 1.6 + v.line.len) * 0.15;
    stepGrowing(dt);
    stepPrincess(dt);
    waves.update(t);
    footprints.update(t);
    rig.update(dt);
    view.update(t, rig.target);
    view.render();
  });

  /** 每一格：小公主走路、動畫、門口按鈕 */
  function stepPrincess(dt) {
    const free = mode === 'walk' && !hud.isOpen() && !growing; // 蓋橋動畫時先不能走
    if (area) {
      const ax = controls.axis();
      const dir = free ? screenToGround(ax.x, ax.y, rig.yaw()) : { x: 0, z: 0 };
      if (free || (walker.target && !growing)) walker.update(dt, dir, area);
      const ground = surfaceAt(walker, area, area.top);
      // 走下沙灘時慢慢降下去，不會一下子掉下去
      const y = princessModel.group.position.y;
      princessModel.group.position.set(walker.x, Math.abs(y - ground.y) > 0.6 ? ground.y : y + (ground.y - y) * Math.min(1, dt * 12), walker.z);
      footprints.step(walker, walker.heading, ground.beach && walker.moving > 0.2, ground.y);
      princessModel.group.rotation.y = walker.heading;
    }
    princessModel.animate(dt, walker.moving);
    const want = free && area ? nearestDoor(walker, area.doors, doorDistance) : null;
    if ((want?.id || null) !== (door?.id || null)) {
      door = want;
      let label = null;
      if (want?.kind === 'bridge') {
        const b = bridgeViews.get(want.key)?.b;
        label = b ? fill(B().door, { to: isl(otherEnd(b))?.name || '' }) : null;
      } else if (want) {
        const b = subjects.buildings[want.kind];
        label = b ? fill(W.enter || '{name}', { name: b.label }) : null;
      }
      hud.setEnter(label, enterDoor);
    }
  }

  return {
    ...api, openIsland, backToAll, setMode, mode: () => mode, quiz, cards: cardsUI, race: raceUI, openBridge, calendar,
    /** 檢查用（自動測試讀小公主在哪、走得到哪些島）；網站本身不用 */
    debug: { footprints: () => footprints.count(), walker, area: () => area, reach: () => [...reach], mist: () => mistGroup.children.map((m) => m.userData.mist), bridges: () => [...bridgeViews].map(([k, v]) => k + ':' + v.kind), growing: () => !!growing },
  };
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
