// world/frisbee.js
// 丟飛盤：拿在手上 → 按住 T 蓄力（頭上的力量條）→ 放開往面對的方向丟 → 附近的狗狗去追、接住、咬回來還給小公主；
// 沒有狗：飛盤上方出現箭頭，小公主自己走過去撿。要掉進海裡就停在沙灘邊，海邊女神浮出來說話再沉回去。
// 規則（落點、誰去追）在 avatar/frisbee-play.js，數字在 config/toys.json，這裡管狀態和畫面。
import * as THREE from 'three';
import { makeDisc, makePowerBar, makeArrow, makeSpeech, makeSplash, makeGlow } from './toys3d.js';
import { makeGoddess } from '../avatar/goddess.js';
import { landingOf, goddessSpot, pickChasers, firstCatch, flightAt, dirOf } from '../avatar/frisbee-play.js';
import { chargeOf, throwDistance } from '../engine/toys.js';
import { surfaceAt } from '../avatar/walk.js';

const fill = (s, vals) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => String(vals[k] ?? ''));

/**
 * scene：three.js 場景；rules：engine/toys.js 的 toyRules()；item：飛盤的資料（colors）；text：config/text.json 的 toys。
 * princess：{ walker, model }（model.parts.armR 是右手）；area()：小公主能走的地方；
 * dogs()：[{ id, view, walker, group, area, cat, hungry, mouth: { y, z } }]（view 是 main.js 的寵物）；
 * bark(view)：叫一聲；flash(text)：畫面下方提示；onChange()：拿在手上／丟出去了（平板的 T 按鈕要不要顯示）。
 */
export function createFrisbeePlay({ scene, rules, item, text = {}, princess, area, dogs, bark = () => {}, flash = () => {}, onChange = () => {} }) {
  const F = rules.frisbee;
  const G = rules.goddess;
  const disc = makeDisc(item?.colors || {}, 0.27);
  disc.traverse((o) => { o.raycast = () => {}; });
  const hand = princess.model.parts?.armR || princess.model.group;
  const power = makePowerBar();
  scene.add(power.group); // 每一格移到小公主頭上
  const arrow = makeArrow();
  scene.add(arrow.group);
  const glow = makeGlow('rgba(255,240,150,0.9)', 1.6);
  scene.add(glow);
  // 海邊女神：平常藏在海底下
  const goddess = makeGoddess(G.colors, G.size);
  goddess.group.visible = false;
  goddess.group.traverse((o) => { o.raycast = () => {}; });
  scene.add(goddess.group);
  const speech = makeSpeech(text.goddess || '', 4.4);
  speech.visible = false;
  goddess.group.add(speech);
  speech.position.set(0, 2.25, 0);
  speech.scale.multiplyScalar?.(1 / (G.size || 1));
  const splash = makeSplash();
  scene.add(splash.group);

  let held = false; // 裝備裡按了「使用」
  // state：'hand' 拿在手上、'charging' 按住 T、'flying' 飛出去、'ground' 落在地上、'carried' 狗狗咬著
  let state = 'hand';
  let charge = 0;
  let fly = null; // { from, to, t, dur, sea, heading }
  let chasers = []; // 正在追的狗（dogs() 的那幾隻）
  let carrier = null; // 咬著飛盤的狗
  let chaseT = 0;
  let retarget = 0;
  let flashT = 0;
  let show = null; // 女神：{ t, x, z, face }
  const spot = { x: 0, y: 0, z: 0 }; // 飛盤在哪裡（世界座標）

  function toHand() {
    disc.parent?.remove(disc);
    if (!held) return;
    hand.add(disc);
    disc.position.set(0, -0.44, 0.08);
    disc.rotation.set(Math.PI / 2, 0, 0);
    disc.scale.setScalar(1);
  }
  function toWorld() {
    disc.parent?.remove(disc);
    scene.add(disc);
    disc.rotation.set(0, 0, 0);
  }
  function release(list) {
    for (const d of list) { if (d?.view) { d.view.busy = false; d.walker.stop(); } }
  }
  function backToHand() {
    release(chasers);
    if (carrier) release([carrier]);
    chasers = [];
    carrier = null;
    fly = null;
    state = 'hand';
    arrow.group.visible = false;
    toHand();
    onChange();
  }

  /** 按住 T：開始蓄力 */
  function press() {
    if (!held || state !== 'hand') return false;
    state = 'charging';
    charge = 0;
    power.set(0);
    power.group.visible = true;
    onChange();
    return true;
  }
  /** 放開 T：丟出去（cancel 就不丟，例如視窗失去焦點） */
  function letGo(cancel = false) {
    if (state !== 'charging') return false;
    power.group.visible = false;
    const a = area();
    if (cancel || !a) { state = 'hand'; onChange(); return false; }
    const w = princess.walker;
    const heading = w.heading;
    const dist = throwDistance(chargeOf(charge, rules), rules);
    const d = dirOf(heading);
    const from = { x: w.x + d.x * 0.35, z: w.z + d.z * 0.35, y: surfaceAt(w, a, a.top).y + 1.0 };
    const land = landingOf({ x: w.x, z: w.z }, heading, dist, a);
    const to = { x: land.x, z: land.z, y: surfaceAt(land, a, a.top).y + 0.05 };
    const len = Math.hypot(to.x - from.x, to.z - from.z);
    fly = { from, to, t: 0, dur: Math.max(0.35, len / F.flySpeed + 0.15), sea: land.sea, heading };
    state = 'flying';
    toWorld();
    disc.position.set(from.x, from.y, from.z);
    // 附近的狗狗一起跑去追
    const all = dogs();
    const ids = pickChasers(all.map((x) => ({ id: x.id, x: x.walker.x, z: x.walker.z, cat: x.cat, hungry: x.hungry, area: x.area })), w, to, { range: F.dogRange });
    chasers = ids.map((id) => all.find((x) => x.id === id)).filter(Boolean);
    for (const c of chasers) { c.view.busy = true; c.walker.goTo({ x: to.x, z: to.z }, c.area); }
    chaseT = 0;
    onChange();
    return true;
  }

  function landed() {
    state = 'ground';
    disc.position.set(fly.to.x, fly.to.y, fly.to.z);
    disc.rotation.set(0, disc.rotation.y, 0);
    if (fly.sea) {
      // 停在沙灘邊：閃一下，女神從海裡浮出來
      flashT = 0.6;
      const g = goddessSpot(fly.to, area(), fly.heading, G.out);
      show = { t: 0, ...g };
      goddess.group.position.set(g.x, -2.6 * G.size, g.z);
      goddess.group.rotation.y = g.face;
      goddess.group.visible = true;
      splash.group.position.set(g.x, 0, g.z);
      splash.group.visible = true;
    }
    if (!chasers.length) {
      arrow.group.visible = true;
      flash(text.pickHint || '');
    }
  }

  function stepGoddess(dt, t) {
    if (!show) return;
    show.t += dt;
    const b = G.bubbleSeconds;
    const r = b + G.riseSeconds;
    const k = r + G.talkSeconds;
    const s = k + G.sinkSeconds;
    const e = s + G.rippleSeconds;
    const tt = show.t;
    const low = -2.6 * G.size;
    let y = low;
    if (tt >= b && tt < r) y = low + (0 - low) * easeOut((tt - b) / G.riseSeconds);
    else if (tt >= r && tt < k) y = 0;
    else if (tt >= k && tt < s) y = low * easeIn((tt - k) / G.sinkSeconds);
    goddess.group.position.y = y;
    goddess.group.visible = tt >= b * 0.5 && tt < s;
    speech.visible = tt >= r && tt < k;
    goddess.animate(dt);
    const bubble = tt < r ? 1 : tt < s ? 0.4 : 0;
    const wave = tt < b ? tt / Math.max(0.01, b) : tt < s ? 1 : Math.max(0, 1 - (tt - s) / Math.max(0.01, G.rippleSeconds));
    splash.update(wave, bubble, t);
    if (tt >= e) {
      show = null;
      goddess.group.visible = false;
      speech.visible = false;
      splash.group.visible = false;
    }
  }

  /** 每一格。canAct：現在小公主能不能動（沒有打開面板、不是地圖模式） */
  function update(dt, t) {
    if (state === 'charging') {
      charge += dt;
      power.set(chargeOf(charge, rules));
      const p = princess.model.group.position;
      power.group.position.set(p.x, p.y + 2.35, p.z);
    }
    if (state === 'flying' && fly) {
      fly.t += dt / fly.dur;
      const p = flightAt(fly.from, fly.to, fly.t, F.height);
      disc.position.set(p.x, p.y, p.z);
      disc.rotation.y += dt * 18;
      disc.rotation.z = Math.sin(t * 3) * 0.12;
      if (fly.t >= 1) landed();
    }
    // 狗狗追：飛盤低下來或落地以後，最先碰到的接住
    if ((state === 'flying' && fly?.t > 0.75) || state === 'ground') {
      if (chasers.length) {
        chaseT += dt;
        const who = firstCatch(chasers.map((c) => ({ id: c.id, x: c.walker.x, z: c.walker.z })), { x: disc.position.x, z: disc.position.z }, F.catchRadius);
        if (who) {
          carrier = chasers.find((c) => c.id === who);
          release(chasers.filter((c) => c !== carrier));
          chasers = [];
          state = 'carried';
          fly = null;
          arrow.group.visible = false;
          carrier.view.busy = true;
          disc.parent?.remove(disc);
          carrier.group.add(disc);
          disc.position.set(0, carrier.mouth.y, carrier.mouth.z);
          disc.rotation.set(1.25, 0, 0);
          bark(carrier.view);
          retarget = 0;
          flash(fill(text.caught, { name: carrier.view.pet?.name || '' }));
        } else if (state === 'ground') {
          // 跑到了還是碰不到（被擋住）、或追太久：換小公主自己撿
          for (const c of chasers) if (!c.walker.target) c.walker.goTo({ x: disc.position.x, z: disc.position.z }, c.area);
          if (chaseT > F.giveUp) { release(chasers); chasers = []; arrow.group.visible = true; flash(text.pickHint || ''); }
        }
      }
    }
    if (state === 'ground') {
      const w = princess.walker;
      if (Math.hypot(w.x - disc.position.x, w.z - disc.position.z) <= F.pickupRadius) { backToHand(); flash(text.picked || ''); }
    }
    if (state === 'carried' && carrier) {
      const w = princess.walker;
      const d = dirOf(w.heading);
      const want = { x: w.x + d.x * 0.9, z: w.z + d.z * 0.9 };
      retarget -= dt;
      if (retarget <= 0 || !carrier.walker.target) { carrier.walker.goTo(want, carrier.area); retarget = 0.5; }
      chaseT += dt;
      const gap = Math.hypot(carrier.walker.x - w.x, carrier.walker.z - w.z);
      if (gap <= F.returnDistance + 0.6) {
        const name = carrier.view.pet?.name || '';
        backToHand();
        flash(fill(text.returned, { name }));
      } else if (chaseT > F.giveUp * 3) {
        // 一直走不到小公主旁邊（例如她走到狗狗去不了的地方）：飛盤放在狗狗腳邊，自己來撿
        const at = { x: carrier.walker.x, z: carrier.walker.z };
        release([carrier]);
        carrier = null;
        toWorld();
        const a = area();
        disc.position.set(at.x, a ? surfaceAt(at, a, a.top).y + 0.05 : 0.9, at.z);
        state = 'ground';
        arrow.group.visible = true;
      }
    }
    if (state === 'ground' && arrow.group.visible) {
      const bob = arrow.animate(t);
      arrow.group.position.set(disc.position.x, disc.position.y + 1.3 + bob, disc.position.z);
    }
    if (flashT > 0) {
      flashT = Math.max(0, flashT - dt);
      glow.position.set(disc.position.x, disc.position.y + 0.15, disc.position.z);
      glow.material.opacity = Math.sin((flashT / 0.6) * Math.PI) * 0.95;
      glow.scale.setScalar(1 + (0.6 - flashT) * 2.5);
    } else glow.material.opacity = 0;
    stepGoddess(dt, t);
  }

  return {
    /** 裝備裡按「使用」（true）或「收起來」（false） */
    setHeld(on) {
      held = !!on;
      if (!held) {
        power.group.visible = false;
        release(chasers);
        if (carrier) release([carrier]);
        chasers = []; carrier = null; fly = null;
        disc.parent?.remove(disc);
        arrow.group.visible = false;
        state = 'hand';
      } else if (state === 'hand') toHand();
      onChange();
    },
    get held() { return held; },
    /** 飛盤在手上（可以丟） */
    get ready() { return held && state === 'hand'; },
    get state() { return state; },
    get charging() { return state === 'charging'; },
    press,
    letGo,
    /** 換小孩、回到出生點：飛盤回到手上 */
    reset() { if (held) backToHand(); else { release(chasers); chasers = []; carrier = null; state = 'hand'; } },
    update,
    /** 檢查用 */
    debug: () => ({ state, held, charge, sea: !!fly?.sea, to: fly?.to || null, disc: { x: disc.position.x, y: disc.position.y, z: disc.position.z }, chasers: chasers.map((c) => c.id), carrier: carrier?.id || null, goddess: !!show, speech: speech.visible, arrow: arrow.group.visible }),
  };
}

const easeOut = (k) => 1 - (1 - Math.max(0, Math.min(1, k))) ** 2;
const easeIn = (k) => Math.max(0, Math.min(1, k)) ** 2;
