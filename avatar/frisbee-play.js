// avatar/frisbee-play.js
// 丟飛盤的規則：飛盤落在哪裡（要掉進海裡就停在沙灘邊）、海邊女神出現在哪、哪些狗狗會去追。
// 純計算，不用 three.js，可以用 node 測試。area 和小公主的一樣（avatar/walk.js）。
import { groundsOf, resolve } from './walk.js';

/** 這個點在不在地上（島的圓裡，或橋、公路上），離邊至少 margin */
export function onLand(p, area, margin = 0) {
  if (!area) return false;
  for (const g of groundsOf(area)) {
    if (g.type === 'strip') {
      const len = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1e-9;
      const t = ((p.x - g.ax) * (g.bx - g.ax) + (p.z - g.az) * (g.bz - g.az)) / len;
      const side = Math.abs(-(p.x - g.ax) * (g.bz - g.az) + (p.z - g.az) * (g.bx - g.ax)) / len;
      if (t >= 0 && t <= len && side <= g.half - margin) return true;
    } else if (Math.hypot(p.x - g.cx, p.z - g.cz) <= g.r - margin) return true;
  }
  return false;
}

/** 面向 heading（three.js 的 rotation.y）的方向 */
export const dirOf = (heading) => ({ x: Math.sin(heading), z: Math.cos(heading) });

/**
 * 從 from 往 heading 丟 dist 公尺，飛盤落在哪裡。
 * 一路上碰到海（離開地面）就停在最後還在地上的地方（沙灘邊），sea = true。
 * 落在建築或樹裡面就推到旁邊。回傳 { x, z, sea, dist（實際飛了多遠） }
 */
export function landingOf(from, heading, dist, area, { step = 0.25, margin = 0.35 } = {}) {
  const d = dirOf(heading);
  const total = Math.max(0, Number(dist) || 0);
  let last = { x: from.x, z: from.z };
  let flown = 0;
  let sea = false;
  for (let t = step; t <= total + 1e-9; t += step) {
    const p = { x: from.x + d.x * t, z: from.z + d.z * t };
    if (!onLand(p, area, margin)) { sea = true; break; }
    last = p;
    flown = t;
  }
  if (!sea && flown < total) {
    // 最後一小段（不到一步）
    const p = { x: from.x + d.x * total, z: from.z + d.z * total };
    if (onLand(p, area, margin)) { last = p; flown = total; } else sea = true;
  }
  const fixed = area ? resolve(last, area, margin) : last;
  return { x: fixed.x, z: fixed.z, sea, dist: flown };
}

/**
 * 海邊女神在哪裡浮出來：飛盤外面 out 公尺的海上（從最近的島中間往外的方向；橋上就照丟的方向）。
 * 回傳 { x, z, face（女神面向飛盤） }
 */
export function goddessSpot(spot, area, heading, out = 3.2) {
  let dir = dirOf(heading);
  let best = null;
  let bestD = Infinity;
  for (const g of area ? groundsOf(area) : []) {
    if (g.type === 'strip') continue;
    const d = Math.abs(Math.hypot(spot.x - g.cx, spot.z - g.cz) - g.r);
    if (d < bestD) { bestD = d; best = g; }
  }
  if (best && bestD < 3) {
    const dx = spot.x - best.cx;
    const dz = spot.z - best.cz;
    const len = Math.hypot(dx, dz);
    if (len > 1e-6) dir = { x: dx / len, z: dz / len };
  }
  const x = spot.x + dir.x * out;
  const z = spot.z + dir.z * out;
  return { x, z, face: Math.atan2(spot.x - x, spot.z - z) };
}

/**
 * 哪些狗狗去追：dogs = [{ id, x, z, cat, hungry, area }]（area 是那隻狗能走的地方）。
 * 貓不追、肚子餓的不追、離小公主超過 range 的不追、飛盤落在牠走不到的地方也不追。
 * 回傳 id 的清單，離落點近的在前面。
 */
export function pickChasers(dogs, princess, landing, { range = 15 } = {}) {
  return (Array.isArray(dogs) ? dogs : [])
    .filter((d) => d && !d.cat && !d.hungry)
    .filter((d) => Math.hypot(d.x - princess.x, d.z - princess.z) <= range)
    .filter((d) => onLand(landing, d.area, 0))
    .sort((a, b) => Math.hypot(a.x - landing.x, a.z - landing.z) - Math.hypot(b.x - landing.x, b.z - landing.z))
    .map((d) => d.id);
}

/** 誰先碰到飛盤：chasers = [{ id, x, z }]，回傳最近而且在 radius 內的那一隻的 id，沒有就 null */
export function firstCatch(chasers, disc, radius = 0.9) {
  let best = null;
  let bestD = Infinity;
  for (const c of chasers || []) {
    const d = Math.hypot(c.x - disc.x, c.z - disc.z);
    if (d <= radius && d < bestD) { best = c.id; bestD = d; }
  }
  return best;
}

/**
 * 飛盤飛到一半在哪裡：t 是 0～1，從 from（含 y）飛到 to（含 y），中間拱起 height。
 * 回傳 { x, y, z }
 */
export function flightAt(from, to, t, height = 1.4) {
  const k = Math.max(0, Math.min(1, t));
  // 一開始快、最後慢一點落下
  const e = 1 - (1 - k) * (1 - k) * 0.35 - 0.65 * (1 - k);
  const s = Math.max(0, Math.min(1, e));
  return {
    x: from.x + (to.x - from.x) * s,
    z: from.z + (to.z - from.z) * s,
    y: from.y + (to.y - from.y) * s + Math.sin(Math.PI * s) * height,
  };
}
