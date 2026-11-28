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
import { createWalker, screenToGround, nearestDoor, surfaceAt, groundAt as groundUnder } from '../avatar/walk.js';
import { createShoreWaves, createFootprints } from './shore.js';
import { bridgeConfig, bridgeLine, bridgeStrip, makeBridge, makeBridgeSite, makeMist } from './bridges.js';
import { bridgePlan, reachable, canStart, createBuildBook, bridgePrice, roadPrice, ROAD_KEY } from '../engine/build.js';
import { textTexture } from './buildings.js';
import { createHud } from './hud.js';
import { createMusicBox } from './music.js';
import { clockText, msToNextMinute } from './clock.js';
import { createCalendar } from './calendar.js';
import { createPhoneUi } from './phone.js';
import { milestones } from '../engine/diary.js';
import { petRules, ownedPets, feeSpends, shopState, petRecord, dailyFee, isHungry, pendingGift, giftRecord } from '../engine/pets.js';
import { loginRules, loginSummary, loginRecord, loginKey, nextReward } from '../engine/login.js';
import { makePet } from '../avatar/pet.js';
import { createPetBrain } from '../avatar/pet-walk.js';
import { createShop } from './shop.js';
import { createPetVoice } from './pet-voice.js';
import { createQuizUI } from './quiz-ui.js';
import { createCardsUI } from './cards-ui.js';
import { cardSettings, ruleFor, cardState } from '../engine/cards.js';
import { materialize, mixLevel, levelCfg } from '../engine/generate.js';
import { loadBanks } from '../engine/words.js';
import { createSpeaker } from './speech.js';
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
 *     公路兩人共有：家裡其他小孩的建設也合併進 world.builds（world.kids 是全部的小孩），再呼叫 world.refreshBuilds()。
 *   公路（世界設定第 5 步）：姐妹的群島放在 world.json 的 road.offset，蓋好公路才能走過去；
 *     在她的島上寫測驗、看學習卡、玩搶答賽都不記成績、不給歐巴幣和寶石，也不呼叫 onResult。
 */
export async function startWorld({ canvas, hudRoot, quizRoot, cardsRoot, gameRoot, configPath = 'config/', levelsPath = 'content/levels/', wordsPath = 'content/words/', hooks = {} }) {
  const [subjects, theme, world, text, quizConfig, cardsConfig, mixConfig, gameConfig, economyConfig, familyConfig, musicLoaded, calendarConfig, petsConfig, speechConfig] = await Promise.all([
    ...['subjects', 'theme', 'world', 'text'].map((n) => getJSON(configPath + n + '.json')),
    getJSON(configPath + 'quiz.json').catch(() => ({})), // 沒有 quiz.json 就用引擎預設
    getJSON(configPath + 'cards.json').catch(() => ({})), // 沒有 cards.json 就用引擎預設
    getJSON(configPath + 'mix.json').catch(() => ({})),
    getJSON(configPath + 'game.json').catch(() => ({})), // 沒有 game.json 就用搶答賽預設
    getJSON(configPath + 'economy.json').catch(() => ({})), // 歐巴幣、寶石、建設價格
    getJSON(configPath + 'family.json').catch(() => ({})), // 家裡有哪些小孩（還沒有關卡的也能登入）
    getJSON(configPath + 'music.json').catch(() => ({})), // 背景音樂的歌單和時鐘的時區
    getJSON(configPath + 'calendar.json').catch(() => ({})), // 左上角的日曆：國定假日、每天的名人和紀念日放哪
    getJSON(configPath + 'pets.json').catch(() => ({})), // 商店的寵物：價錢、每天的費用
    getJSON(configPath + 'speech.json').catch(() => ({})), // 英語朗讀：語言、速度
  ]);
  // 綜合練習的題數和限時：mix.json 的 bySubject 有這一科就用它（英語 4 題 4 分…），沒有就用 presets
  const cleanPresets = (list) => (Array.isArray(list) ? list : [])
    .map((p) => ({ count: Math.round(Number(p.count)), minutes: Number(p.minutes) }))
    .filter((p) => p.count >= 1 && p.count <= 60 && p.minutes > 0);
  const basePresets = cleanPresets(mixConfig?.presets);
  const presetsFor = (subject) => {
    const own = cleanPresets(mixConfig?.bySubject?.[subject]);
    return own.length ? own : basePresets;
  };
  const speaker = createSpeaker(speechConfig || {});
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
    onDayChange: () => { refreshDiary(); showWallet(); }, // 過了半夜：日記換一天、寵物的費用多扣一天
  }) : { isOpen: () => false, close() {}, setDiary() {}, celebrate(m, done) { done?.(); }, today: () => null };
  // 手機版：日曆、姐妹切換、時鐘收起來，點了才打開（world/phone.js；電腦和平板不受影響）
  createPhoneUi(hudRoot, { text: text.phone || {}, today: () => calendar.today?.(), canvas });
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
    // 英語的教材檔（content/words/<關卡檔 bank 欄位>.md）：放進那一科的出題參數，出題和學習卡都讀它
    const fetchText = async (url) => { const res = await fetch(url, { cache: 'no-cache' }); if (!res.ok) throw new Error(url + ' 讀不到（' + res.status + '）'); return res.text(); };
    const b = await loadBanks(r.levels, wordsPath, fetchText);
    loadErrors.push(...b.errors);
    for (const subj of Object.keys(genCfg)) genCfg[subj] = { ...genCfg[subj], banks: b.banks };
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
  const bridgesGroup = new THREE.Group(); // 蓋好的橋、還沒蓋的虛線和浮標
  view.scene.add(bridgesGroup);
  const mistGroup = new THREE.Group(); // 還沒連上的島周圍的淡霧
  view.scene.add(mistGroup);
  // 姐妹的群島（世界設定第 5 步）：放在 world.json 的 road.offset，公路從自己的數學島接過去
  const visitRoot = new THREE.Group();
  view.scene.add(visitRoot);
  const visitIslands = new THREE.Group(); // 她的島
  const visitBridges = new THREE.Group(); // 她蓋好的橋
  const visitMist = new THREE.Group(); // 她還沒連上的島周圍的淡霧
  visitRoot.add(visitIslands, visitBridges, visitMist);
  const roadGroup = new THREE.Group(); // 公路（還沒蓋：虛線和浮標）
  view.scene.add(roadGroup);
  const roadRaw = world.road || {};
  const [roadOx, roadOz] = Array.isArray(roadRaw.offset) && roadRaw.offset.length === 2 ? roadRaw.offset.map(Number) : [0, 150];
  const visitDefs = subjects.islands.map((d) => ({ ...d, position: [d.position[0] + roadOx, d.position[1] + roadOz] }));

  // 小孩：config/family.json 列的，加上關卡檔裡出現的（還沒有關卡的小孩也能登入，看到建造中的島）
  const familyKids = (Array.isArray(familyConfig?.kids) ? familyConfig.kids : []).filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim());
  const kids = [...new Set([...familyKids, ...kidsIn(levels)])];
  let kid = kids.includes(store.get('kid')) ? store.get('kid') : kids[0] || null;
  /** 公路通到誰的群島：家裡另一個小孩（只有一個小孩就沒有公路） */
  const otherKid = () => kids.find((k) => k !== kid) || null;
  const hasVisit = kids.length > 1;
  waves.build(hasVisit ? [...subjects.islands, ...visitDefs] : subjects.islands, world.island);
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
  // 寵物（商店）：買的價錢記在建設本；每天的飼料和清潔費照買的那一天到今天過了幾天算（engine/pets.js）
  const petConf = petRules(petsConfig);
  const calTz = typeof calendarConfig?.timeZone === 'string' && calendarConfig.timeZone ? calendarConfig.timeZone : 'Asia/Taipei';
  // 每日登入獎勵、累計登入成就：那一天有來玩記在建設本（kind login），獎勵照 config/economy.json 的 login 算（engine/login.js）
  const loginConf = loginRules(economyConfig?.login);
  const walletOf = (k) => {
    const list = builds.effective(k);
    const bonuses = loginSummary({ builds: list, rules: loginConf, timeZone: calTz }).bonuses;
    return computeWallet({ history: ledger.history(k), spends: [...list, ...feeSpends({ builds: list, rules: petConf, now: Date.now(), timeZone: calTz })], bonuses, rules: econ, islandOf });
  };
  /**
   * 今天有來玩（小公主走動、點島或建築）：每個小孩每天記一次，給每日登入獎勵，
   * 下方提示「每日登入第 3 天，+10 歐巴幣！」；剛好累計 50、100…天就跳祝賀、寫日記。
   */
  let activeMark = '';
  function markActive() {
    if (!kid || !started) return;
    const now = Date.now();
    const key = loginKey(now, calTz);
    if (activeMark === kid + '|' + key) return;
    activeMark = kid + '|' + key;
    if (builds.built(kid).has(key)) return;
    const rec = loginRecord({ id: newEntryId(now), at: now, timeZone: calTz });
    if (!builds.add(kid, rec)) return;
    try { hooks.onBuild?.(kid, { ...rec }); } catch (err) { console.error(err); }
    const sum = loginSummary({ builds: builds.effective(kid), rules: loginConf, timeZone: calTz });
    const today = sum.days.find((d) => d.key === key);
    showWallet();
    if (today) {
      const L = text.dailyLogin || {};
      hud.flash(fill(L.flash, { n: today.n, coins: today.coins, coin: econ.currencyName || '歐巴幣', next: nextReward(today.n, loginConf) }), 7000);
    }
    refreshDiary();
    setTimeout(checkCelebrate, 600);
  }
  let hungry = false; // 歐巴幣是負的：寵物肚子餓，不走動、哭哭
  function showWallet() {
    if (!kid) { hud.setWallet(null); return; }
    const w = walletOf(kid);
    // 有關卡的島、或已經有寶石的島，才顯示那一種寶石
    const shown = subjects.islands.filter((i) => econ.gems[i.code] && (levelsFor(levels, { kid, subject: i.subject }).count || w.gems[i.code]))
      .map((i) => ({ code: i.code, name: econ.gems[i.code].name, color: econ.gems[i.code].color, n: w.gems[i.code] || 0 }));
    hud.setWallet({ coins: w.coins, gems: shown });
    const h = isHungry(w.coins);
    if (h !== hungry) { hungry = h; for (const p of petViews.values()) setPetTag(p); }
  }
  /** 記進帳本，回傳交卷畫面要顯示的「獲得 …」 */
  function earn(k, summary, kind) {
    const island = islandOfSubject(summary.subject);
    const entry = { id: summary.id, at: Date.parse(summary.at) || Date.now(), level: summary.level, island, score: summary.score, total: summary.total, kind };
    if (kind !== 'game') { entry.timeUp = !!summary.timeUp; entry.blanks = summary.blanks; }
    ledger.add(k, entry);
    const ev = walletOf(k).events.find((x) => x.id === summary.id);
    showWallet();
    if (!ev || kind === 'retry') return '';
    const T = text.economy || {};
    const parts = [];
    if (ev.coins) parts.push(fill(T.coins, { n: ev.coins, name: econ.currencyName || '歐巴幣' }));
    for (const [code, n] of Object.entries(ev.gems)) parts.push(fill(T.gems, { n, name: econ.gems[code]?.name || '' }));
    // 錯太多題又沒寫完就交卷：告訴小孩下次寫完再交也有歐巴幣
    const early = kind === 'level' && !ev.coins && summary.blanks > 0 && !summary.timeUp && summary.total - summary.score >= econ.wrongRates.length;
    const hint = early ? fill(RW().earlyHint, { n: econ.manyWrong.done, coin: coinName() }) : '';
    const line = parts.length ? fill(T.reward, { items: parts.join('、') }) : (early ? '' : (T.noReward || ''));
    return [line, hint].filter(Boolean).join(' ');
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
    // 作答畫面最上面的歐巴幣規則（錯題重練、在姐妹的島上不顯示）
    ruleNote: () => (visitActivity ? '' : fill(RW().quizNote, { w: econ.wrongRates.length, coin: coinName(), ...econ.manyWrong })),
    refresh: (l) => freshen(l), // 「整關再挑戰」出新題目
    onOpenChange: overlayChange,
    speaker,
    onResult(result, level) {
      // 在姐妹的島上：不記成績、不給歐巴幣和寶石、不送到試算表
      if (visitActivity) return { rewardText: visitResultText() };
      const info = progress.record(level.meta.kid, level.meta.id, result);
      const summary = { ...resultSummary(result, level), id: newEntryId() };
      const rewardText = earn(summary.kid, summary, result.retry ? 'retry' : 'level');
      try { hooks.onResult?.(summary, info); } catch (err) { console.error(err); }
      return { ...info, rewardText };
    },
    onClose() {
      if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind, lastBuilding.visit);
    },
  });

  // 學習屋：開放時機照試算表「設定」（hooks.settingsOf），沒有就照 config/cards.json
  const cardsUI = cardsRoot ? createCardsUI(cardsRoot, {
    text,
    settings: cardConf,
    speaker,
    onOpenChange: overlayChange,
    onClose() { if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind, lastBuilding.visit); },
  }) : null;
  // subject：科目；試算表沒填時照 config/cards.json 的 bySubject（英語一開始就打開）
  const cardRule = (subject = '') => {
    let sheet = null;
    try { sheet = hooks.settingsOf?.(kid) || null; } catch (err) { console.error(err); }
    return ruleFor(sheet, cardConf, subject);
  };

  // 遊戲帳篷（搶答賽）：秒數、扣秒、題目來源照試算表「設定」（hooks.settingsOf），沒有就照 config/game.json
  const raceUI = gameRoot ? createRaceUI(gameRoot, {
    text,
    settings: raceConf,
    onOpenChange: overlayChange,
    onClose() { if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind, lastBuilding.visit); },
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
    for (const p of petViews.values()) { p.placed = false; p.prints.clear(); }
    door = null;
    hud.setEnter(null);
  }

  // ---------- 寵物（商店買的狗狗）：在自己的島上亂跑、會過自己的橋、不走公路 ----------
  const pw = world.pets || {};
  const petViews = new Map(); // 小孩|key → { pet, model, walker, brain, prints, tag, tagText, placed }
  const petPrints = new Map(); // 種類 → 足跡（換小孩時重複用，不用一直加到場景裡）
  const ST = () => text.shop || {};
  function setPetTag(p) {
    // 剛叫完：頭上先寫叫聲（「汪汪！」），一下子再換回名字
    const want = p.sayUntil > performance.now() && p.look.say ? p.look.say : hungry ? (ST().hungryBubble || '') : p.pet.name;
    if (p.tagText === want) return;
    p.tagText = want;
    if (p.tag) { p.model.group.remove(p.tag); p.tagMat?.map?.dispose?.(); p.tagMat?.dispose?.(); }
    if (!want) { p.tag = null; return; }
    const tex = textTexture(want, { fg: hungry ? '#2f5f8a' : (colors.label || '#4a3343'), bg: 'rgba(255,255,255,0.92)', w: 360, h: 96, size: 50, round: true, border: hungry ? '#5aa9e6' : colors.main });
    const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false });
    const tag = new THREE.Sprite(mat);
    p.tagMat = mat;
    tag.scale.set(1.5, 0.4, 1);
    tag.position.set(0, 1.05 * (p.look.size || 1) * (Number(pw.scale) || 1), 0);
    tag.raycast = () => {};
    tag.renderOrder = 8;
    p.model.group.add(tag);
    p.tag = tag;
  }
  /** 照這個小孩買過的寵物，加上新的、拿掉別人的（換小孩、雲端合併、剛買都會叫） */
  function syncPets() {
    const owned = kid ? ownedPets(builds.effective(kid), petConf) : [];
    const want = new Map(owned.map((p) => [kid + '|' + p.key + '|' + p.name, p]));
    for (const [k, v] of petViews) {
      if (want.has(k)) continue;
      view.scene.remove(v.model.group);
      v.prints.clear();
      petViews.delete(k);
    }
    for (const [k, pet] of want) {
      if (petViews.has(k)) continue;
      const look = pet.look || petConf.breeds[0] || { look: 'tudog', size: 1, colors: { body: '#e0a85a', dark: '#8a5a2b', light: '#f6dfb4', eye: '#3b2a30' } };
      const model = makePet(look, Number(pw.scale) || 1);
      model.group.userData.petKey = k; // 點到寵物：從打到的那一塊往上找到這個
      view.scene.add(model.group);
      const pwalker = createWalker({ x: 0, z: 0, heading: 0 }, { speed: Number(pw.speed) || 2.6, body: Number(pw.body) || 0.28 });
      const brain = createPetBrain(pwalker, { rest: pw.rest, range: Number(pw.range) || 14 });
      if (!petPrints.has(pet.code)) petPrints.set(pet.code, createFootprints(view.scene, pw.footprints));
      const v = { pet, look, model, walker: pwalker, brain, prints: petPrints.get(pet.code), tag: null, tagText: null, placed: false, sayUntil: 0, nextBark: performance.now() / 1000 + barkGap() };
      setPetTag(v);
      petViews.set(k, v);
    }
  }
  /** 每一格：狗狗亂跑（肚子餓就坐著）、留腳印 */
  function stepPets(dt, t) {
    let i = 0;
    for (const p of petViews.values()) {
      i += 1;
      const pa = area?.pets;
      if (!pa) { p.model.group.visible = false; continue; }
      p.model.group.visible = true;
      if (!p.placed) {
        // 出現在小公主出生點旁邊，每隻錯開一點
        const a = i * 2.1;
        p.walker.place({ x: area.spawn.x + Math.cos(a) * 2.2, z: area.spawn.z + Math.sin(a) * 2.2, heading: a });
        p.placed = true;
      }
      if (!growing) p.brain.update(dt, pa, hungry);
      const ground = surfaceAt(p.walker, pa, area.top);
      const y = p.model.group.position.y;
      p.model.group.position.set(p.walker.x, Math.abs(y - ground.y) > 0.6 ? ground.y : y + (ground.y - y) * Math.min(1, dt * 12), p.walker.z);
      p.model.group.rotation.y = p.walker.heading;
      p.prints.step(p.walker, p.walker.heading, ground.beach && p.walker.moving > 0.2, ground.y);
      p.model.animate(dt, p.walker.moving, hungry);
      if (p.tagText !== null && p.sayUntil && p.sayUntil <= performance.now()) { p.sayUntil = 0; setPetTag(p); }
      // 偶爾自己叫一聲：只在小公主附近、沒有打開面板、肚子不餓的時候；越遠越小聲
      const now = performance.now() / 1000;
      if (now >= p.nextBark) {
        p.nextBark = now + barkGap();
        const d = Math.hypot(p.walker.x - walker.x, p.walker.z - walker.z);
        if (started && !hungry && !hud.isOpen() && !paused && quizRoot.hidden !== false && d <= petSound.hear) bark(p, Math.max(0.15, 1 - d / petSound.hear));
      }
    }
    for (const f of petPrints.values()) f.update(t);
  }
  // ---------- 寵物的叫聲（world/pet-voice.js）：點寵物叫一聲，平常每 30～60 秒自己叫一聲 ----------
  const petSound = petConf.sound;
  const voice = createPetVoice({ volume: petSound.volume, muted: () => music.muted });
  const barkGap = () => petSound.every[0] + (petSound.every[1] - petSound.every[0]) * Math.random();
  /** 叫一聲：出聲、跳一下、頭上寫「汪汪！」 */
  function bark(p, level = 1) {
    const len = voice.play(p.look.voice, level);
    p.model.hop?.();
    p.sayUntil = performance.now() + Math.max(1.2, len + 0.6) * 1000;
    setPetTag(p);
    p.nextBark = performance.now() / 1000 + barkGap();
    return len;
  }
  /** 點畫面時有沒有點到寵物：回傳那一隻（petViews 的值）或 null */
  function petAt(e) {
    const groups = [...petViews.values()].filter((p) => p.model.group.visible).map((p) => p.model.group);
    if (!groups.length) return null;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, view.camera);
    for (const h of raycaster.intersectObjects(groups, true)) {
      for (let o = h.object; o; o = o.parent) if (o.userData?.petKey && petViews.has(o.userData.petKey)) return petViews.get(o.userData.petKey);
    }
    return null;
  }

  // ---------- 商店（時鐘左邊）：寵物商店 ----------
  const shop = createShop({ button: hudRoot.querySelector('#shop'), root: hudRoot, hud, text: ST(), onOpen: () => openShop() });
  function shopNow() {
    const w = kid ? walletOf(kid) : { coins: 0 };
    const owned = kid ? ownedPets(builds.effective(kid), petConf) : [];
    return {
      kid,
      coins: w.coins,
      coin: econ.currencyName || '歐巴幣',
      breeds: petConf.breeds,
      owned,
      nameMax: petConf.nameMax,
      maxOwned: petConf.maxOwned,
      hungry,
      totalFee: owned.reduce((n, p) => n + p.fee, 0),
      fee: (b) => dailyFee(b.price, petConf),
      shopState: (b) => shopState(b, { kid, coins: w.coins, owned, max: petConf.maxOwned }),
      onBuy: (b, name) => buyPet(b.code, name),
    };
  }
  function openShop() {
    if (paused || growing) return;
    focused = null;
    lastBuilding = null;
    walker.stop();
    door = null;
    hud.setEnter(null);
    shop.show(shopNow(), backToAll);
  }
  /** 真的買下去：記到建設本（會存到試算表），狗狗出現在小公主旁邊，跳「恭喜有了新朋友！」 */
  function buyPet(code, name) {
    const b = petConf.breeds.find((x) => x.code === code);
    if (!kid || !b) return false;
    if (shopState(b, { kid, coins: walletOf(kid).coins, owned: ownedPets(builds.effective(kid), petConf), max: petConf.maxOwned }).state !== 'ready') { openShop(); return false; }
    const rec = petRecord({ id: newEntryId(), at: Date.now(), breed: b, name, rules: petConf });
    if (!rec || !builds.add(kid, rec)) { openShop(); return false; }
    try { hooks.onBuild?.(kid, { ...rec }); } catch (err) { console.error(err); }
    showWallet();
    hud.close();
    syncPets();
    const v = petViews.get(kid + '|' + rec.key + '|' + rec.name);
    if (v) { v.walker.place({ x: walker.x + 1.2, z: walker.z + 0.6, heading: walker.heading }); v.placed = true; }
    hud.flash(fill(ST().done, { name: rec.name }), 5000);
    setTimeout(checkCelebrate, 400);
    return true;
  }
  // ---------- 送的寵物（config/pets.json 的 gift）：跳視窗，按「領取」、取好名字才拿到；關掉的話這次不再問，下次刷新或登入再問 ----------
  const giftLater = new Set(); // 這次打開網站按過「等一下再領」的小孩
  let giftOpen = false;
  /** 有沒有要送的寵物還沒領：有就跳視窗，回傳 true（祝賀畫面等它關掉再跳） */
  function checkGift() {
    if (giftOpen) return true;
    if (!started || !kid || paused || growing || giftLater.has(kid) || calendar.isOpen() || hudRoot.querySelector('.intro-back')) return false;
    const b = pendingGift(builds.effective(kid), petConf);
    if (!b) return false;
    giftOpen = true;
    walker.stop();
    const who = kid;
    shop.showGift({ breed: b, coin: econ.currencyName || '歐巴幣', fee: dailyFee(b.price, petConf), nameMax: petConf.nameMax, maxOwned: petConf.maxOwned },
      (name) => { giftOpen = false; if (who === kid) claimGift(name); },
      () => { giftOpen = false; giftLater.add(who); setTimeout(checkCelebrate, 300); });
    return true;
  }
  /** 領取：記到建設本（會存到試算表，coins 0），寵物出現在小公主旁邊，跳「恭喜有了新朋友！」 */
  function claimGift(name) {
    const b = kid ? pendingGift(builds.effective(kid), petConf) : null;
    if (!b) return false;
    const rec = giftRecord({ id: newEntryId(), at: Date.now(), breed: b, name, rules: petConf });
    if (!rec || !builds.add(kid, rec)) return false;
    try { hooks.onBuild?.(kid, { ...rec }); } catch (err) { console.error(err); }
    showWallet();
    syncPets();
    const v = petViews.get(kid + '|' + rec.key + '|' + rec.name);
    if (v) { v.walker.place({ x: walker.x + 1.2, z: walker.z + 0.6, heading: walker.heading }); v.placed = true; setTimeout(() => bark(v), 300); }
    hud.flash(fill(ST().done, { name: rec.name }), 5000);
    refreshDiary();
    setTimeout(checkCelebrate, 400);
    return true;
  }

  // ---------- 橋（世界設定第 4 步）----------
  const bcfg = bridgeConfig(world.bridge);
  const plan = bridgePlan(subjects, homeCode); // 可以蓋哪些橋：[{ key, from, to }]
  const isl = (code) => subjects.islands.find((i) => i.code === code);
  const lineOf = (b) => bridgeLine(isl(b.from), isl(b.to), world.island, bcfg);
  const B = () => text.bridge || {};
  let reach = new Set([homeCode]); // 現在走得到的島
  const bridgeViews = new Map(); // key → { b, line, kind: 'built'|'site', view }
  let growing = null; // 正在蓋的橋或公路：{ key, t, view, line, b, road }
  // ---------- 公路和拜訪（世界設定第 5 步）----------
  const rcfg = bridgeConfig(roadRaw);
  const roadFast = Math.max(1, Number(roadRaw.fast) || 1);
  const visitIsl = (code) => visitDefs.find((i) => i.code === code);
  const visitLineOf = (b) => bridgeLine(visitIsl(b.from), visitIsl(b.to), world.island, bcfg);
  const roadLine = hasVisit ? bridgeLine(isl(homeCode), visitIsl(homeCode), world.island, rcfg) : null;
  const R = () => text.road || {};
  let roadView = null; // { kind: 'built'|'site', view }
  let roadInfo = null; // 公路蓋好了：{ kid（誰蓋的）, build }
  let visitReach = new Set(); // 她的群島上走得到的島（她的數學島＋她蓋好的橋連過去的）
  let onVisit = false; // 小公主現在站在她的群島上
  /** 這座島上要留給橋的路（不種樹）：島自己的座標裡的方向。visit = 姐妹群島上的島（公路從北邊接過來） */
  function pathsFor(code, visit = false) {
    const out = [];
    if (roadLine && code === homeCode) out.push(visit ? { x: -roadLine.u.x, z: -roadLine.u.z, half: rcfg.width / 2 } : { x: roadLine.u.x, z: roadLine.u.z, half: rcfg.width / 2 });
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
  const breedNames = Object.fromEntries(petConf.breeds.map((b) => [b.code, b.name]));
  const allMilestones = () => (kid ? milestones({ builds: builds.list(kid), plan, names: islandNames, text: CT(), timeZone: calTz, other: otherKid() || '', breeds: breedNames, login: loginConf }) : []);
  function todayKey() {
    const t = calendar.today?.();
    return t ? t.year + '-' + String(t.month).padStart(2, '0') + '-' + String(t.day).padStart(2, '0') : '';
  }
  /** 日曆下面的日記：全部日子都給日曆，日曆只顯示翻到的那一天。今天還在等祝賀的，按了「寫進日記」才出現 */
  function refreshDiary(fresh = '') {
    if (!kid) { calendar.setDiary('', []); return; }
    const done = celebrated();
    const today = todayKey();
    const list = allMilestones().filter((m) => m.day !== today || done.has(m.id)).map((m) => ({ id: m.id, day: m.day, line: m.line }));
    calendar.setDiary(fill(CT().diaryTitle, { kid }), list, fresh);
  }
  /** 有還沒祝賀的里程碑就跳出來（一次一個，按了再跳下一個） */
  function checkCelebrate() {
    if (!started || !kid || paused || growing || calendar.isOpen()) return;
    if (checkGift()) return; // 送的寵物先問，領了或關掉再跳祝賀
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
    drawVisit();
    syncPets();
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
    const obstacles = parts.flatMap((p) => p.obstacles);
    // 寵物能走的地方：自己走得到的島＋蓋好的橋（不放公路和姐妹的群島，走到公路口就過不去）
    const pets = { grounds: grounds.slice(), obstacles: obstacles.slice() };
    if (roadLine && roadInfo) {
      // 公路蓋好了：公路（走起來比較快）＋她的群島上走得到的島和她蓋好的橋
      if (growing?.key !== ROAD_KEY) grounds.push({ ...bridgeStrip(roadLine), road: true, fast: roadFast });
      const vparts = visitIslands.children.filter((g) => visitReach.has(g.userData.island)).map((g) => walkAreaOf(g));
      for (const p of vparts) {
        grounds.push({ type: 'circle', cx: p.cx, cz: p.cz, r: p.radius, grassR: p.grassR, slopeR: p.slopeR, sandTop: p.sandTop, island: p.island, visit: true });
        obstacles.push(...p.obstacles);
        doors.push(...p.doors.map((d) => ({ ...d, visit: true, id: 'visit:' + d.island + ':' + d.kind })));
      }
      const o = otherKid();
      const vbuilt = o ? builds.built(o) : new Set();
      for (const b of plan) if (vbuilt.has(b.key)) grounds.push({ ...bridgeStrip(visitLineOf(b)), visit: true });
    } else if (roadLine && roadView?.kind === 'site') {
      // 公路的路口：數學島南邊的草地邊上
      const u = roadLine.u;
      doors.push({ kind: 'road', key: ROAD_KEY, id: 'road', x: roadLine.a.x - u.x * 0.8, z: roadLine.a.z - u.z * 0.8, face: Math.atan2(u.x, u.z), reach: Math.max(doorDistance, rcfg.width) });
    }
    return { grounds, obstacles, doors, spawn: home.spawn, top: home.top, pets };
  }

  /** 公路和姐妹的群島：她蓋好的橋、淡霧、公路（還沒蓋就是虛線和浮標） */
  function drawVisit() {
    roadGroup.clear();
    visitBridges.clear();
    visitMist.clear();
    roadView = null;
    roadInfo = null;
    visitReach = new Set();
    const o = otherKid();
    if (!o || !roadLine) return;
    roadInfo = builds.road(kids);
    const vbuilt = builds.built(o);
    visitReach = reachable(plan, vbuilt, homeCode);
    for (const b of plan) {
      if (!vbuilt.has(b.key)) continue;
      const v = makeBridge(visitLineOf(b), colors, bcfg, b.key);
      visitBridges.add(v.group);
    }
    for (const def of visitDefs) if (!visitReach.has(def.code)) visitMist.add(makeMist(def, world.island, bcfg));
    if (roadInfo) {
      const v = makeBridge(roadLine, colors, rcfg, ROAD_KEY);
      roadGroup.add(v.group);
      roadView = { kind: 'built', view: v };
    } else {
      const v = makeBridgeSite(roadLine, colors, rcfg, ROAD_KEY, R().signTitle || '', roadPriceText(roadPrice(econ.build.road), ' '));
      roadGroup.add(v.group);
      roadView = { kind: 'site', view: v };
    }
  }
  /** 「150 歐巴幣＋60 鑽石」 */
  function roadPriceText(p, sep) {
    const parts = [];
    if (p.coins) parts.push(p.coins + ' ' + (econ.currencyName || '歐巴幣'));
    for (const [code, n] of Object.entries(p.gems || {})) parts.push(n + ' ' + (econ.gems[code]?.name || code));
    return parts.join(sep ?? (R().joiner || '＋'));
  }
  /** 「200 歐巴幣、70 鑽石」：現在有多少（只列公路要用到的） */
  function haveText(w, p) {
    const parts = [(w.coins || 0) + ' ' + (econ.currencyName || '歐巴幣')];
    for (const code of Object.keys(p.gems || {})) parts.push((w.gems[code] || 0) + ' ' + (econ.gems[code]?.name || code));
    return parts.join('、');
  }

  /** 點公路的浮標、虛線，或站在路口按「蓋公路」：打開建設面板 */
  function openRoad() {
    const o = otherKid();
    if (!o || !roadLine) return;
    focused = null;
    lastBuilding = null;
    walker.stop();
    const T = R();
    const price = roadPrice(econ.build.road);
    const w = kid ? walletOf(kid) : { coins: 0, gems: {} };
    const pay = canAfford(w, price);
    const state = roadInfo || growing?.key === ROAD_KEY ? 'built' : !kid ? 'locked' : pay.ok ? 'ready' : 'short';
    const vals = {
      other: o,
      coin: econ.currencyName || '歐巴幣',
      price: roadPriceText(price),
      have: haveText(w, price),
      short: roadPriceText(pay.short, '、'),
      who: roadInfo ? (roadInfo.kid === kid ? '你' : roadInfo.kid) : '',
    };
    if (mode === 'map') rig.focus(new THREE.Vector3(roadLine.mid.x, 0, roadLine.mid.z), 1.2);
    hud.showBridge({
      title: fill(T.title, vals),
      body: fill(T.body, vals),
      note: fill(T.note, vals),
      price: fill(T.price, vals),
      have: fill(T.have, vals),
      short: fill(T.short, vals),
      state,
      builtText: fill(T.built, vals),
      lockedText: '',
      buildLabel: fill(T.build, vals),
      confirmLabel: fill(T.confirm, vals),
      nthText: '',
      whyLabel: '',
      onBuild: () => buildRoad(),
    }, backToAll);
  }

  /** 真的蓋公路：錢從蓋的人扣，蓋好兩個人都能走 */
  function buildRoad() {
    if (!kid || !roadLine || !otherKid() || roadInfo || growing || roadView?.kind !== 'site') return false;
    const price = roadPrice(econ.build.road);
    if (!canAfford(walletOf(kid), price).ok) { openRoad(); return false; }
    const rec = { id: newEntryId(), at: Date.now(), kind: 'road', key: ROAD_KEY, coins: price.coins, gems: price.gems };
    if (!builds.add(kid, rec)) { openRoad(); return false; }
    try { hooks.onBuild?.(kid, { ...rec, name: (isl(homeCode)?.name || '') + '—' + fill(R().archipelago, { other: otherKid() }) }); } catch (err) { console.error(err); }
    showWallet();
    hud.close();
    door = null;
    hud.setEnter(null);
    roadInfo = { kid, build: rec };
    roadGroup.remove(roadView.view.group);
    const nb = makeBridge(roadLine, colors, rcfg, ROAD_KEY);
    nb.grow(0);
    roadGroup.add(nb.group);
    roadView = { kind: 'built', view: nb };
    growing = { key: ROAD_KEY, t: 0, view: nb, line: roadLine, road: true };
    rig.flyTo(new THREE.Vector3(roadLine.mid.x, 1, roadLine.mid.z), roadLine.len * 0.75 + 12, roadLine.len * 0.5 + 10);
    return true;
  }
  /** 現在在不在姐妹的群島那一邊（地圖要看哪一邊） */
  const visitSide = () => !!(roadLine && onVisit);
  const overviewAt = () => (visitSide() ? { x: (world.camera?.overviewCenter?.[0] || 0) + roadOx, z: (world.camera?.overviewCenter?.[1] || 0) + roadOz } : null);
  const visitNote = () => fill(R().visitPanel, { other: otherKid() || '', coin: econ.currencyName || '歐巴幣' });
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
    growing.t += dt / Math.max(0.2, (growing.road ? rcfg : bcfg).growSeconds);
    growing.view.grow(growing.t);
    const to = growing.road ? '' : otherEnd(growing.b);
    const mist = growing.road ? null : mistGroup.children.find((m) => m.userData.mist === to);
    if (mist) mist.material.opacity = bcfg.mist.opacity * Math.max(0, 1 - growing.t);
    if (growing.t < 1.25) return; // 長好後停一下再回去
    const done = growing;
    const toName = done.road ? '' : isl(to)?.name || '';
    drawBridges(); // 重新算走得到的島（新的島上的橋頭、淡霧也一起更新）
    area = computeArea();
    if (mode === 'walk') rig.follow(playerPoint); else rig.focus(new THREE.Vector3(done.line.mid.x, 0, done.line.mid.z), 0.7);
    hud.flash(done.road ? fill(R().done, { other: otherKid() || '' }) : fill(B().done, { to: toName }), 5000);
    setTimeout(checkCelebrate, 300); // 橋（公路）長好了：恭喜完成第幾座橋
  }
  const showLabels = () => { for (const g of [...islandsGroup.children, ...visitIslands.children]) if (g.userData.label) g.userData.label.visible = mode === 'map'; };

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
    // 姐妹的群島：照她的關卡蓋村子；島名寫「妹妹的數學島」；上空一個大牌子「妹妹的群島」
    visitIslands.clear();
    const o = otherKid();
    if (o && roadLine) {
      for (const def of visitDefs) {
        const info = levelsFor(levels, { kid: o, subject: def.subject });
        const g = buildIsland({ ...def, name: fill(R().islandName, { other: o, name: def.name }) }, colors, {
          island: world.island,
          village: world.village,
          levelCount: info.count,
          labels: { construction: text.construction, count: text.islandCount },
          paths: pathsFor(def.code, true),
        });
        g.userData.phase = def.position[0] * 0.3 + def.position[1] * 0.2;
        g.userData.visit = true;
        visitIslands.add(g);
      }
      const home = visitIsl(homeCode);
      const tex = textTexture(fill(R().archipelago, { other: o }), { fg: colors.label || '#4a3343', bg: 'rgba(255,255,255,0.95)', w: 640, h: 180, size: 96, round: true, border: colors.main });
      const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
      sign.scale.set(18, 18 * (180 / 640), 1);
      sign.position.set(home.position[0], 22, home.position[1]);
      sign.raycast = () => {};
      sign.renderOrder = 9;
      visitIslands.add(sign);
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

  /** visit = 姐妹群島上的島：照她的關卡，島名寫「妹妹的數學島」 */
  const shownDef = (def, visit) => (visit ? { ...def, name: fill(R().islandName, { other: otherKid() || '', name: def.name }) } : def);
  const whose = (visit) => (visit ? otherKid() : kid);
  const visitGroupOf = (code) => visitIslands.children.find((g) => g.userData.island === code);

  function openIsland(code, visit = false) {
    const def = byCode(code);
    if (!def || (visit && !otherKid())) return;
    markActive();
    focused = code;
    lastBuilding = null;
    const g = visit ? visitGroupOf(code) : groupOf(code);
    if (mode === 'map' && g) rig.focus(g.position, def.size || 1);
    hud.showIsland(shownDef(def, visit), levelsFor(levels, { kid: whose(visit), subject: def.subject }), subjects.buildings, (kind) => openBuilding(code, kind, visit), backToAll, visit ? visitNote() : '');
  }

  function openBuilding(code, kind, visit = false) {
    const def = byCode(code);
    if (!def || (visit && !otherKid())) return;
    markActive();
    const who = whose(visit);
    const info = levelsFor(levels, { kid: who, subject: def.subject });
    if (!info.count) { openIsland(code, visit); return; }
    focused = code;
    lastBuilding = { code, kind, visit };
    const g = visit ? visitGroupOf(code) : groupOf(code);
    if (mode === 'map' && g) rig.focus(g.position, (def.size || 1) * 0.8);
    hud.showBuilding(shownDef(def, visit), kind, subjects.buildings[kind], info, {
      minutes: minutesOf,
      mmss,
      // 在姐妹的島上：不顯示她的成績，也不寫能拿多少歐巴幣
      best: (l) => (visit ? null : progress.get(l.meta.kid, l.meta.id)),
      // 從學習屋去寫測驗：交卷後回到學習屋，剛打開的學習卡馬上看得到
      // 從遊戲帳篷去寫測驗：交卷後回到帳篷，這一關的選擇題馬上放進題庫
      onStart: (l) => gate(visit, () => startQuiz(l, { backLabel: kind === 'house' ? text.cards.leave : kind === 'tent' ? text.race.leave : '' })),
      mix: kind === 'tower' && presetsFor(def.subject).length ? mixExtra(def, info, visit) : null,
      towerReward: kind === 'tower' && !visit ? towerReward(def) : null,
      house: kind === 'house' && cardsUI ? houseExtra(code, visit, def.subject) : null,
      tent: kind === 'tent' && raceUI ? tentExtra(def, info, visit) : null,
      visitNote: visit ? visitNote() : '',
    }, () => (mode === 'walk' ? backToAll() : openIsland(code, visit))); // 走路模式按返回：回到小公主
  }

  /**
   * 開始一個活動（測驗、學習卡、搶答賽）。在姐妹的島上先跳出提醒「這裡的活動不記成績、不拿歐巴幣和寶石」，按「我知道了，開始」才開始。
   * visitActivity：現在這個活動是不是在她的島上（交卷時看這個決定存不存）。
   */
  let visitActivity = false;
  function gate(visit, go) {
    if (!visit) { visitActivity = false; go(); return; }
    const T = R();
    const vals = { other: otherKid() || '', coin: econ.currencyName || '歐巴幣' };
    hud.showNotice({ title: fill(T.visitTitle, vals), tag: T.visitTag, body: fill(T.visitBody, vals), ok: T.visitGo, cancel: T.visitCancel }, () => { visitActivity = true; go(); });
  }
  const visitResultText = () => fill(R().visitResult, { other: otherKid() || '', coin: econ.currencyName || '歐巴幣' });

  function houseExtra(code, visit = false, subject = '') {
    // 在姐妹的島上：學習卡全部打開
    const { rule, from } = visit ? { rule: 'always', from: 'visit' } : cardRule(subject);
    const T = text.cards;
    return {
      ruleText: fill(T.ruleLine, { rule: T.ruleNames[rule] || rule }) + (from === 'visit' ? '' : from === 'sheet' ? T.ruleFromSheet : T.ruleFromDefault),
      state: (l) => cardState(l, progress.get(l.meta.kid, l.meta.id), rule),
      onCards: (l) => {
        // 打開前再檢查一次，避免清單畫好後規則變了
        if (visit || cardState(l, progress.get(l.meta.kid, l.meta.id), cardRule(subject).rule).open) gate(visit, () => cardsUI.open(safeFresh(l) || l)); // 每次看到新的例題
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
      rule: fill(T.towerRule, { coin: coinName(), first, per, ex: first + per * 7, list, none: rates.length, daily: econ.levelRepeatPerfectDaily, ...econ.manyWrong }),
      /** 這一關（或綜合練習）現在交卷：全對、錯 1 題、錯 2 題…各會拿多少 */
      coinLine(levelId, total) {
        const vals = rates.map((_, w) => (total - w >= 0 ? preview({ level: levelId, island: def.code, score: total - w, total, kind: 'level', blanks: 0 }).coins : 0));
        const many = total >= rates.length ? preview({ level: levelId, island: def.code, score: total - rates.length, total, kind: 'level', blanks: 0 }).coins : 0;
        if (vals.every((v) => !v) && !many) return T.levelDone;
        const items = [...vals.map((n, w) => (w ? fill(T.wrongItem, { w, n }) : fill(T.perfectItem, { n }))), ...(total >= rates.length ? [fill(T.manyItem, { w: rates.length, n: many })] : [])].join('・');
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

  function tentExtra(def, info, visit = false) {
    const T = text.race;
    // 在姐妹的島上：題目用她全部的關卡
    const visitRules = () => ({ ...raceRules(), pool: 'always', from: 'visit' });
    const rules = visit ? visitRules() : raceRules();
    const all = info.groups.flatMap((g) => g.items);
    const recordOf = (l) => progress.get(l.meta.kid, l.meta.id);
    const id = raceId(def.code, raceConf);
    const pool = buildPool(all, recordOf, rules.pool);
    return {
      ruleText: fill(T.tentRules, { s: rules.seconds, p: rules.penalty, pool: T.poolNames[rules.pool] || rules.pool }) + (rules.from === 'visit' ? '' : rules.from === 'sheet' ? T.fromSheet : T.fromDefault),
      poolCount: pool.levels.length,
      best: visit ? null : progress.get(kid, id),
      reward: visit ? null : tentReward(def, id, progress.get(kid, id)),
      state: (l) => poolState(l, recordOf(l), rules.pool),
      onStart() {
        // 按下去那一刻再算一次，避免清單畫好後成績或設定變了
        const r = visit ? visitRules() : raceRules();
        const p = buildPool(all, recordOf, r.pool);
        if (!p.sources.length) { openBuilding(def.code, 'tent', visit); return; }
        const shown = shownDef(def, visit);
        gate(visit, () => {
          raceMeta = { id, kid: visit ? otherKid() : kid, visit, subject: def.subject, grade: p.levels[0].meta.grade || '', name: fill(T.levelName, { island: shown.name }), source: T.title };
          raceUI.open({
            title: fill(T.screenTitle, { island: shown.name }),
            rules: r,
            poolLevels: p.levels.length,
            best: () => (visit ? null : progress.get(raceMeta.kid, id)),
            makeDrawer: () => createDrawer(p.sources, { cfgOf: (s, src) => levelCfg({ meta: { bank: src?.bank } }, genCfg[s] || {}) }),
          });
        });
      },
    };
  }

  /** 一場搶答賽結束：記最高紀錄（progress 的 game-<島>），再交給 hooks（雲端、日後的歐巴幣） */
  function raceDone(result) {
    const m = raceMeta;
    if (m?.visit) return { saved: false, note: visitResultText() }; // 在姐妹的島上：不記成績、不給資源
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
    if (l.meta.mix) return buildMix(l.meta.mixUnits, l.meta.mixPreset, l.meta.subject, l.meta.kid);
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

  function buildMix(unitNames, preset, subject, who = kid) {
    const all = levels.filter((l) => l.meta.kid === who && l.meta.subject === subject && l.meta.unit && l.meta.make);
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
  function mixExtra(def, info, visit = false) {
    const units = info.groups.filter((g) => g.items.some((l) => l.meta.unit && l.meta.make)).map((g) => g.title);
    if (!units.length) return null;
    const who = visit ? otherKid() : kid;
    const key = 'mix.' + kid + (visit ? '.visit' : '') + '.' + def.code;
    let saved = null;
    try { saved = JSON.parse(store.get(key) || 'null'); } catch { saved = null; }
    const selected = new Set(Array.isArray(saved) ? saved.filter((u) => units.includes(u)) : units);
    const sample = info.groups.flatMap((g) => g.items).find((l) => l.meta.unit && l.meta.make);
    return {
      units,
      selected,
      presets: presetsFor(def.subject),
      best: (p) => (visit ? null : progress.get(kid, mixId(sample, p.count))),
      coinLine: visit ? null : (p) => towerReward(def).coinLine(mixId(sample, p.count), p.count),
      toggle(u, on) {
        if (on) selected.add(u); else selected.delete(u);
        store.set(key, JSON.stringify([...selected]));
      },
      start(p) {
        const chosen = units.filter((u) => selected.has(u));
        if (!chosen.length) return false;
        let lv;
        try { lv = buildMix(chosen, p, def.subject, who); } catch (err) { hud.showErrors([{ file: text.mix.title, message: err.message }]); return true; }
        gate(visit, () => quiz.start(lv, { backLabel: '' }));
        return true;
      },
    };
  }

  function backToAll() {
    focused = null;
    lastBuilding = null;
    hud.close();
    if (mode === 'map') rig.overview(overviewAt());
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
    if (m === 'map') rig.overview(overviewAt()); else rig.follow(playerPoint);
    hud.setMap(m === 'map', () => setMode(mode === 'map' ? 'walk' : 'map'));
    hud.setHint(m === 'map' ? (W.hintMap || text.hint) : touch ? (W.hintTouch || text.hint) : text.hint);
  }

  /** 走到門口後按「進入」或空白鍵 */
  function enterDoor() {
    if (mode !== 'walk' || !door || hud.isOpen() || paused) return;
    walker.stop();
    if (door.kind === 'bridge') openBridge(door.key);
    else if (door.kind === 'road') openRoad();
    else openBuilding(door.island, door.kind, !!door.visit);
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
    const hits = raycaster.intersectObjects([...islandsGroup.children, ...bridgesGroup.children, ...visitIslands.children, ...visitBridges.children, ...roadGroup.children], true);
    for (const h of hits) { const w = whatWasHit(h.object); if (w) return { ...w, visit: isUnder(h.object, visitRoot), point: h.point || null }; }
    return null;
  }
  function isUnder(o, root) { for (let x = o; x; x = x.parent) if (x === root) return true; return false; }
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
    if (w && w.bridge === ROAD_KEY && !w.visit) {
      if (roadView?.kind === 'site') { openRoad(); return; }
    } else if (w && w.visit) {
      // 姐妹的群島：還沒蓋公路就打開公路的建設面板；走不到的島直接打開清單；建築就走到門口
      if (!roadInfo) { openRoad(); return; }
      if (w.island && !visitReach.has(w.island)) { openIsland(w.island, true); return; }
      if (w.building) {
        const d = area.doors.find((x) => x.visit && x.kind === w.building && x.island === w.island);
        if (d) { walker.goTo(d, area, d.face); return; }
      }
    } else if (w && w.bridge) {
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
    // 點到寵物：叫一聲（走路模式和地圖模式都一樣），不走過去
    if (!hud.isOpen() || mode === 'walk') { const p = petAt(e); if (p) { bark(p); return; } }
    if (mode === 'walk') { tapWalk(e); return; }
    const w = hitAt(e);
    if (!w) return;
    if (w.bridge === ROAD_KEY && !w.visit) { if (roadView?.kind === 'site') openRoad(); return; }
    if (w.visit) {
      if (!roadInfo) { openRoad(); return; }
      if (w.bridge) return;
      if (w.building) openBuilding(w.island, w.building, true); else openIsland(w.island, true);
      return;
    }
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
      if ((k !== kid && k !== otherKid()) || growing) { showWallet(); return; }
      drawBridges();
      area = computeArea();
      showWallet();
    },
    wallet: (k = kid) => walletOf(k),
    refresh() {
      if (quizRoot.hidden === false || cardsUI?.isOpen || raceUI?.isOpen) return; // 作答、看卡中不動，關掉後會自己重畫
      if (lastBuilding) openBuilding(lastBuilding.code, lastBuilding.kind, lastBuilding.visit);
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
    if (roadView?.view.buoy) roadView.view.buoy.position.y = Math.sin(t * 1.4) * 0.15;
    for (const g of visitIslands.children) g.traverse((o) => { if (o.name === 'flag') o.rotation.y = Math.sin(t * 3 + (g.userData.phase || 0)) * 0.35; });
    stepGrowing(dt);
    stepPrincess(dt);
    stepPets(dt, t);
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
      if (walker.moving > 0.2) markActive(); // 今天有來玩（一天只記一次）
    }
    princessModel.animate(dt, walker.moving);
    // 站在姐妹的群島上：上方中間「拜訪中・不記成績」
    const nowVisit = !!(area && roadInfo && groundUnder(walker, area)?.visit);
    if (nowVisit !== onVisit) { onVisit = nowVisit; hud.setVisit(onVisit ? R().visitTag : ''); }
    const want = free && area ? nearestDoor(walker, area.doors, doorDistance) : null;
    if ((want?.id || null) !== (door?.id || null)) {
      door = want;
      let label = null;
      if (want?.kind === 'road') {
        label = fill(R().door, { other: otherKid() || '' });
      } else if (want?.kind === 'bridge') {
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
    ...api, openIsland, openBuilding, backToAll, setMode, mode: () => mode, quiz, cards: cardsUI, race: raceUI, openBridge, openRoad, calendar, openShop, buyPet,
    /** 檢查用（自動測試讀小公主在哪、走得到哪些島）；網站本身不用 */
    debug: { footprints: () => footprints.count(), walker, area: () => area, reach: () => [...reach], mist: () => mistGroup.children.map((m) => m.userData.mist), bridges: () => [...bridgeViews].map(([k, v]) => k + ':' + v.kind), growing: () => !!growing, road: () => roadView?.kind || null, roadOwner: () => roadInfo?.kid || null, visitReach: () => [...visitReach], onVisit: () => onVisit, roadLine: () => roadLine, visitRoot,
      pets: () => [...petViews.values()].map((p) => ({ key: p.pet.key, name: p.pet.name, gift: !!p.pet.gift, look: p.look.look, voice: p.look.voice, x: p.walker.x, z: p.walker.z, moving: p.walker.moving, tag: p.tagText, target: !!p.walker.target })),
      petGroup: (key) => [...petViews.values()].find((p) => p.pet.key === key)?.model.group || null,
      barked: () => voice.played, barkSoon: () => { for (const p of petViews.values()) p.nextBark = 0; },
      giftPending: () => (kid ? pendingGift(builds.effective(kid), petConf)?.code || '' : ''), claimGift,
      petArea: () => area?.pets || null, hungry: () => hungry, petPrints: () => [...petPrints.values()].reduce((n, f) => n + f.count(), 0) },
  };
}

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
