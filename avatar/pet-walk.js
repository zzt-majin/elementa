// avatar/pet-walk.js
// 寵物（狗狗）自己在島上亂跑的規則：停一下、挑一個附近的地方跑過去，有時候過橋到別的島。
// 肚子餓（歐巴幣是負的）時坐著不動。純計算，不用 three.js，可以用 node 測試。
// area 和小公主的一樣（avatar/walk.js），但只放自己走得到的島和蓋好的橋，不放公路和姐妹的群島，
// 所以狗狗走到公路口就過不去，會轉回來。
import { groundsOf } from './walk.js';

/** 這個點在不在地上（島的圓裡，或橋上） */
function onLand(p, grounds, margin) {
  for (const g of grounds) {
    if (g.type === 'strip') {
      const len = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1e-9;
      const t = ((p.x - g.ax) * (g.bx - g.ax) + (p.z - g.az) * (g.bz - g.az)) / len;
      const side = Math.abs(-(p.x - g.ax) * (g.bz - g.az) + (p.z - g.az) * (g.bx - g.ax)) / len;
      if (t >= 0 && t <= len && side <= g.half - margin) return true;
    } else if (Math.hypot(p.x - g.cx, p.z - g.cz) <= g.r - margin) return true;
  }
  return false;
}

/**
 * 挑下一個要跑去的地方：大多在附近（range 公尺內），有 hop 的機會跑到別座島（會自己過橋）。
 * rand 是 0～1 的亂數。回傳 { x, z }
 */
export function pickSpot(area, from, { range = 14, hop = 0.2, margin = 0.6, rand = Math.random } = {}) {
  const grounds = groundsOf(area);
  const circles = grounds.filter((g) => g.type !== 'strip');
  if (!circles.length) return { x: from.x, z: from.z };
  if (circles.length > 1 && rand() < hop) {
    const c = circles[Math.floor(rand() * circles.length) % circles.length];
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * (c.r - margin) * 0.9;
    return { x: c.cx + Math.cos(a) * d, z: c.cz + Math.sin(a) * d };
  }
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const d = range * (0.25 + 0.75 * rand());
    const p = { x: from.x + Math.cos(a) * d, z: from.z + Math.sin(a) * d };
    if (onLand(p, grounds, margin)) return p;
  }
  // 附近都是海：往最近的島中間跑
  let best = circles[0];
  for (const c of circles) if (Math.hypot(from.x - c.cx, from.z - c.cz) < Math.hypot(from.x - best.cx, from.z - best.cz)) best = c;
  const d = Math.hypot(from.x - best.cx, from.z - best.cz) || 1;
  const k = Math.min(d, (best.r - margin) * 0.5) / d;
  return { x: best.cx + (from.x - best.cx) * k, z: best.cz + (from.z - best.cz) * k };
}

/**
 * 一隻寵物的腦袋：walker 是 avatar/walk.js 的 createWalker。
 * update(dt, area, hungry) 每一格呼叫；回傳 { resting }。
 */
export function createPetBrain(walker, { rest = [1.5, 4.5], range = 14, hop = 0.2, rand = Math.random } = {}) {
  const [r0, r1] = Array.isArray(rest) && rest.length === 2 ? rest.map(Number) : [1.5, 4.5];
  const nextRest = () => r0 + (r1 - r0) * rand();
  let wait = nextRest() * 0.5;
  return {
    update(dt, area, hungry) {
      if (!area) return { resting: true };
      if (hungry) {
        // 肚子餓：停下來坐著
        if (walker.target) walker.stop();
        walker.update(dt, null, area);
        wait = nextRest();
        return { resting: true };
      }
      if (walker.target) { walker.update(dt, null, area); return { resting: false }; }
      wait -= dt;
      if (wait <= 0) {
        walker.goTo(pickSpot(area, walker, { range, hop, rand }), area);
        wait = nextRest();
      }
      walker.update(dt, null, area);
      return { resting: !walker.target };
    },
    /** 檢查用：還要停幾秒 */
    get wait() { return wait; },
  };
}
