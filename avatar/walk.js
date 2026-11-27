// avatar/walk.js
// 小公主走路的規則：只在草地上走、不能穿過建築和樹、碰到會沿著邊滑開；門口判斷；
// 畫面方向（上下左右）換成地面方向。純計算，不用 three.js，可以用 node 測試。
//
// area：可以走的地方和擋路的圓，都是世界座標。兩種寫法：
//   一座島：{ cx, cz, radius, obstacles: [{ x, z, r }] }
//   好幾塊地（島＋橋）：{ grounds: [{ type: 'circle', cx, cz, r } | { type: 'strip', ax, az, bx, bz, half }], obstacles }
//   strip 是橋：從 (ax, az) 到 (bx, bz) 的長條，寬度是 half × 2。兩頭要伸進島裡一點，才接得起來。

/** 可以走的地（圓和長條）的清單 */
export function groundsOf(area) {
  if (Array.isArray(area.grounds)) return area.grounds;
  return [{ type: 'circle', cx: area.cx, cz: area.cz, r: area.radius }];
}

/** p 在不在這塊地上（離邊至少 body） */
function onGround(p, g, body) {
  if (g.type === 'strip') {
    const q = stripLocal(p, g);
    return q.t >= 0 && q.t <= q.len && Math.abs(q.side) <= Math.max(0, g.half - body);
  }
  return Math.hypot(p.x - g.cx, p.z - g.cz) <= Math.max(0, g.r - body);
}

/** 這塊地上離 p 最近的點 */
function clampOnto(p, g, body) {
  if (g.type === 'strip') {
    const q = stripLocal(p, g);
    const t = Math.max(0, Math.min(q.len, q.t));
    const m = Math.max(0, g.half - body);
    const side = Math.max(-m, Math.min(m, q.side));
    return { x: g.ax + q.ux * t - q.uz * side, z: g.az + q.uz * t + q.ux * side };
  }
  const max = Math.max(0, g.r - body);
  const dx = p.x - g.cx;
  const dz = p.z - g.cz;
  const d = Math.hypot(dx, dz);
  if (d <= max) return { x: p.x, z: p.z };
  if (d < 1e-9) return { x: g.cx, z: g.cz };
  return { x: g.cx + (dx / d) * max, z: g.cz + (dz / d) * max };
}

/** 長條的座標：t 沿著橋走了多遠、side 偏左右多少 */
function stripLocal(p, g) {
  const len = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1e-9;
  const ux = (g.bx - g.ax) / len;
  const uz = (g.bz - g.az) / len;
  const dx = p.x - g.ax;
  const dz = p.z - g.az;
  return { t: dx * ux + dz * uz, side: -dx * uz + dz * ux, len, ux, uz };
}

/** 把一個點推回可以走的地方：先推出擋路的圓，再拉回最近的地（做幾輪，處理夾在中間的情況） */
export function resolve(p, area, body = 0.35) {
  let x = p.x;
  let z = p.z;
  const grounds = groundsOf(area);
  for (let round = 0; round < 3; round++) {
    for (const o of area.obstacles || []) {
      const dx = x - o.x;
      const dz = z - o.z;
      const min = o.r + body;
      const d = Math.hypot(dx, dz);
      if (d < min) {
        if (d < 1e-6) { x = o.x + min; continue; } // 剛好在正中間：往右推
        x = o.x + (dx / d) * min;
        z = o.z + (dz / d) * min;
      }
    }
    const cur = { x, z };
    if (grounds.some((g) => onGround(cur, g, body))) continue;
    let best = null;
    let bestD = Infinity;
    for (const g of grounds) {
      const c = clampOnto(cur, g, body);
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (best) { x = best.x; z = best.z; }
  }
  return { x, z };
}

/** 站在哪一塊地上（回傳 grounds 裡那一塊，例如看小公主在哪座島）；都不在就回傳最近的 */
export function groundAt(p, area) {
  const grounds = groundsOf(area);
  let best = null;
  let bestD = Infinity;
  for (const g of grounds) {
    const c = clampOnto(p, g, 0);
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d < bestD - 1e-9 || (d <= bestD + 1e-9 && g.type === 'circle' && best?.type !== 'circle')) { best = g; bestD = d; }
  }
  return best;
}

/**
 * 從 from 走到 to 要經過哪些點：在不同的島上時，先走到橋頭，再走到橋尾（可以連過好幾座橋）。
 * 同一塊地或找不到路就回傳 []（直接走過去）。
 */
export function routeVia(from, to, area) {
  const grounds = groundsOf(area);
  const circles = grounds.filter((g) => g.type === 'circle');
  const strips = grounds.filter((g) => g.type === 'strip');
  if (!strips.length) return [];
  const inCircle = (x, z) => circles.find((c) => Math.hypot(x - c.cx, z - c.cz) <= c.r);
  const startG = groundAt(from, area);
  const endG = groundAt(to, area);
  const start = startG?.type === 'strip' ? null : startG;
  const goal = endG?.type === 'strip' ? null : endG;
  if (!start || !goal || start === goal) return [];
  // 每條橋連起兩座島：島 → [{ 到哪座島, 經過的兩個點 }]
  const links = new Map();
  for (const b of strips) {
    const ca = inCircle(b.ax, b.az);
    const cb = inCircle(b.bx, b.bz);
    if (!ca || !cb || ca === cb) continue;
    const A = { x: b.ax, z: b.az };
    const B = { x: b.bx, z: b.bz };
    if (!links.has(ca)) links.set(ca, []);
    if (!links.has(cb)) links.set(cb, []);
    links.get(ca).push({ to: cb, pts: [A, B] });
    links.get(cb).push({ to: ca, pts: [B, A] });
  }
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    if (c === goal) break;
    for (const l of links.get(c) || []) if (!prev.has(l.to)) { prev.set(l.to, { from: c, pts: l.pts }); queue.push(l.to); }
  }
  if (!prev.has(goal)) return [];
  const out = [];
  for (let c = goal; prev.get(c); c = prev.get(c).from) out.unshift(...prev.get(c).pts);
  return out;
}

/**
 * 腳下的高度：草地 top（0.9），草地邊緣往外是小坡，再外面是沙灘 sandTop（0.6）；橋上和草地一樣高。
 * 回傳 { y, beach（是不是走在沙灘上） }
 */
export function surfaceAt(p, area, top = 0.9) {
  const grounds = groundsOf(area);
  for (const g of grounds) {
    if (g.type !== 'strip') continue;
    const dx = p.x - g.ax; const dz = p.z - g.az;
    const len = Math.hypot(g.bx - g.ax, g.bz - g.az) || 1e-9;
    const t = (dx * (g.bx - g.ax) + dz * (g.bz - g.az)) / len;
    const side = Math.abs(-dx * (g.bz - g.az) + dz * (g.bx - g.ax)) / len;
    if (t >= 0 && t <= len && side <= g.half + 1e-6) {
      // 橋頭還在草地上的那一段照草地算；離開草地以後是橋面
      const c = grounds.find((x) => x.type === 'circle' && x.grassR && Math.hypot(p.x - x.cx, p.z - x.cz) <= x.grassR);
      if (!c) return { y: top, beach: false };
    }
  }
  let best = null;
  let bestD = Infinity;
  for (const g of grounds) {
    if (g.type !== 'circle') continue;
    const d = Math.hypot(p.x - g.cx, p.z - g.cz);
    if (d - g.r < bestD) { bestD = d - g.r; best = { g, d }; }
  }
  if (!best || !best.g.grassR) return { y: top, beach: false };
  const { g, d } = best;
  const sand = g.sandTop ?? top;
  if (d <= g.grassR) return { y: top, beach: false };
  if (d >= g.slopeR) return { y: sand, beach: true };
  const k = (d - g.grassR) / Math.max(1e-6, g.slopeR - g.grassR);
  return { y: top + (sand - top) * k, beach: k > 0.5 };
}

/**
 * 走在這裡快幾倍：站在有 fast 的長條（公路）上、而且不在草地上時是 fast，其他地方是 1。
 * grounds 的長條寫 { type: 'strip', …, fast: 1.8 }。
 */
export function speedFactor(p, area) {
  const grounds = groundsOf(area);
  let k = 1;
  for (const g of grounds) {
    if (g.type !== 'strip' || !(g.fast > 1)) continue;
    const q = stripLocal(p, g);
    if (q.t < 0 || q.t > q.len || Math.abs(q.side) > g.half + 1e-6) continue;
    if (grounds.some((c) => c.type === 'circle' && Math.hypot(p.x - c.cx, p.z - c.cz) <= (c.grassR ?? c.r))) continue;
    k = Math.max(k, g.fast);
  }
  return k;
}

/** 從 p 往 dir（會先變成長度 1）走 dist 這麼遠，回傳走完的位置 */
export function step(p, dir, dist, area, body = 0.35) {
  const len = Math.hypot(dir.x, dir.z);
  if (!len || !dist) return resolve(p, area, body);
  // 一次走太遠會穿過細的東西，拆成小步
  const n = Math.max(1, Math.ceil(dist / 0.25));
  let cur = { x: p.x, z: p.z };
  for (let i = 0; i < n; i++) {
    cur = resolve({ x: cur.x + (dir.x / len) * (dist / n), z: cur.z + (dir.z / len) * (dist / n) }, area, body);
  }
  return cur;
}

/** 點到的地方如果不能走（海裡、建築裡），換成最近可以走的點 */
export function clampTarget(t, area, body = 0.35) {
  return resolve(t, area, body);
}

/** 離 p 最近、在 maxDist 以內的門；沒有就回傳 null。doors = [{ kind, x, z, reach? }]，有 reach 的門用自己的距離（例如橋頭比較寬） */
export function nearestDoor(p, doors, maxDist) {
  let best = null;
  let bestD = Infinity;
  for (const d of doors || []) {
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist <= (d.reach ?? maxDist) && dist < bestD) { best = d; bestD = dist; }
  }
  return best;
}

/**
 * 畫面方向 → 地面方向。ax：右 +1、左 -1；ay：上 +1、下 -1。
 * yaw：相機在目標的哪個方位（相機位置 = 目標 + (sin yaw, cos yaw) × 距離）。
 * 畫面的「上」就是從相機看向目標的方向。
 */
export function screenToGround(ax, ay, yaw) {
  const up = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const x = right.x * ax + up.x * ay;
  const z = right.z * ax + up.z * ay;
  const len = Math.hypot(x, z);
  return len ? { x: x / len, z: z / len } : { x: 0, z: 0 };
}

/** 面向 dir 的角度（three.js 的 rotation.y；模型原本面向 +z） */
export function headingOf(dir) {
  return Math.atan2(dir.x, dir.z);
}

/** 角度慢慢轉向目標，走最短的方向；k 是 0～1 */
export function turnToward(from, to, k) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

/**
 * 一個會走路的角色：鍵盤直接走，或點地面後自己走過去，卡住會停下來。
 * opts = { speed, body, arrive }
 */
export function createWalker(start, opts = {}) {
  const speed = opts.speed ?? 4;
  const body = opts.body ?? 0.35;
  const arrive = opts.arrive ?? 0.15;
  const s = { x: start.x, z: start.z, heading: start.heading ?? Math.PI, target: null, via: [], stuck: 0, moving: 0 };
  return {
    get x() { return s.x; },
    get z() { return s.z; },
    get heading() { return s.heading; },
    /** 這一格每秒走了多遠（動畫用） */
    get moving() { return s.moving; },
    get target() { return s.target; },
    place(p) { s.x = p.x; s.z = p.z; if (p.heading !== undefined) s.heading = p.heading; s.target = null; s.via = []; s.moving = 0; },
    /** 點地面：走過去。face：到了以後要面向哪裡（例如門口要面向建築） */
    goTo(t, area, face) {
      const c = clampTarget(t, area, body);
      const via = routeVia(s, c, area); // 在別的島：先走到橋頭、過橋
      s.via = [...via.map((p) => ({ x: p.x, z: p.z })), { x: c.x, z: c.z, face }];
      s.target = s.via.shift();
      s.stuck = 0;
    },
    stop() { s.target = null; s.via = []; },
    /** dir：鍵盤給的地面方向（長度 0 表示沒按）；回傳 { arrived } */
    update(dt, dir, area) {
      let move = null;
      let arrived = false;
      if (dir && (dir.x || dir.z)) {
        s.target = null;
        s.via = [];
        move = dir;
      } else if (s.target) {
        const dx = s.target.x - s.x;
        const dz = s.target.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d <= (s.via.length ? Math.max(arrive, 0.6) : arrive)) {
          if (s.via.length) { s.target = s.via.shift(); s.stuck = 0; return { arrived }; } // 到了橋頭，接著走下一段
          if (s.target.face !== undefined) s.heading = s.target.face;
          s.target = null;
          arrived = true;
        } else {
          move = { x: dx / d, z: dz / d };
          const want = Math.min(d, speed * speedFactor(s, area) * dt);
          const next = step(s, move, want, area, body);
          const got = Math.hypot(next.x - s.x, next.z - s.z);
          s.stuck = got < want * 0.3 ? s.stuck + dt : 0;
          if (s.stuck > 0.4) { s.target = null; s.via = []; } // 被擋住走不過去，就停下來
          s.moving = dt ? got / dt : 0;
          if (got > 1e-4) s.heading = turnToward(s.heading, headingOf(move), Math.min(1, dt * 12));
          s.x = next.x; s.z = next.z;
          return { arrived };
        }
      }
      if (!move) {
        const fixed = resolve(s, area, body); // 換島或地形變了，確保站在能走的地方
        s.x = fixed.x; s.z = fixed.z;
        s.moving = 0;
        return { arrived };
      }
      const next = step(s, move, speed * speedFactor(s, area) * dt, area, body);
      s.moving = dt ? Math.hypot(next.x - s.x, next.z - s.z) / dt : 0;
      s.heading = turnToward(s.heading, headingOf(move), Math.min(1, dt * 12));
      s.x = next.x; s.z = next.z;
      return { arrived };
    },
  };
}
