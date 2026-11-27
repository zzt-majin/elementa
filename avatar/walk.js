// avatar/walk.js
// 小公主走路的規則：只在草地上走、不能穿過建築和樹、碰到會沿著邊滑開；門口判斷；
// 畫面方向（上下左右）換成地面方向。純計算，不用 three.js，可以用 node 測試。
//
// area = { cx, cz, radius, obstacles: [{ x, z, r }] }：可以走的圓（草地）和擋路的圓，都是世界座標。
// 之後蓋橋時，再加上「橋」這種可以走的長條地。

/** 把一個點推回可以走的地方：先推出擋路的圓，再拉回草地圓內（做兩輪，處理夾在中間的情況） */
export function resolve(p, area, body = 0.35) {
  let x = p.x;
  let z = p.z;
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
    const max = Math.max(0, area.radius - body);
    const dx = x - area.cx;
    const dz = z - area.cz;
    const d = Math.hypot(dx, dz);
    if (d > max) {
      x = area.cx + (dx / d) * max;
      z = area.cz + (dz / d) * max;
    }
  }
  return { x, z };
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

/** 離 p 最近、在 maxDist 以內的門；沒有就回傳 null。doors = [{ kind, x, z }] */
export function nearestDoor(p, doors, maxDist) {
  let best = null;
  let bestD = Infinity;
  for (const d of doors || []) {
    const dist = Math.hypot(p.x - d.x, p.z - d.z);
    if (dist <= maxDist && dist < bestD) { best = d; bestD = dist; }
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
  const s = { x: start.x, z: start.z, heading: start.heading ?? Math.PI, target: null, stuck: 0, moving: 0 };
  return {
    get x() { return s.x; },
    get z() { return s.z; },
    get heading() { return s.heading; },
    /** 這一格每秒走了多遠（動畫用） */
    get moving() { return s.moving; },
    get target() { return s.target; },
    place(p) { s.x = p.x; s.z = p.z; if (p.heading !== undefined) s.heading = p.heading; s.target = null; s.moving = 0; },
    /** 點地面：走過去。face：到了以後要面向哪裡（例如門口要面向建築） */
    goTo(t, area, face) { const c = clampTarget(t, area, body); s.target = { x: c.x, z: c.z, face }; s.stuck = 0; },
    stop() { s.target = null; },
    /** dir：鍵盤給的地面方向（長度 0 表示沒按）；回傳 { arrived } */
    update(dt, dir, area) {
      let move = null;
      let arrived = false;
      if (dir && (dir.x || dir.z)) {
        s.target = null;
        move = dir;
      } else if (s.target) {
        const dx = s.target.x - s.x;
        const dz = s.target.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d <= arrive) {
          if (s.target.face !== undefined) s.heading = s.target.face;
          s.target = null;
          arrived = true;
        } else {
          move = { x: dx / d, z: dz / d };
          const want = Math.min(d, speed * dt);
          const next = step(s, move, want, area, body);
          const got = Math.hypot(next.x - s.x, next.z - s.z);
          s.stuck = got < want * 0.3 ? s.stuck + dt : 0;
          if (s.stuck > 0.4) s.target = null; // 被擋住走不過去，就停下來
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
      const next = step(s, move, speed * dt, area, body);
      s.moving = dt ? Math.hypot(next.x - s.x, next.z - s.z) / dt : 0;
      s.heading = turnToward(s.heading, headingOf(move), Math.min(1, dt * 12));
      s.x = next.x; s.z = next.z;
      return { arrived };
    },
  };
}
