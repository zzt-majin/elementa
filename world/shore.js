// world/shore.js
// 沙灘邊的海浪和沙灘上的足跡。數字都在 config/world.json 的 shore、footprints。
//   海浪：每座島外圍有幾圈白色浪花，一圈一圈從沙灘邊往外推、慢慢變淡，像浪打上岸又退回去。
//   足跡：小公主走在沙灘上，每走一小步留下一個腳印（左右交替），停留幾秒後慢慢消失。
import * as THREE from 'three';

export const SHORE_DEFAULTS = { rings: 3, period: 3.6, push: 0.09, width: 0.9, opacity: 0.6, color: '#ffffff', height: 0.22, segments: 72 };
export const FOOTPRINT_DEFAULTS = { stride: 0.55, side: 0.13, stay: 3, fade: 1.5, max: 70, size: [0.12, 0.2], color: '#c9a66b', opacity: 0.75 };

/** 海浪：build(島的清單, world.json 的 island) 蓋一次；update(t) 每一格呼叫 */
export function createShoreWaves(scene, raw) {
  const cfg = { ...SHORE_DEFAULTS, ...(raw || {}) };
  const group = new THREE.Group();
  group.name = 'shore-waves';
  scene.add(group);
  const rings = [];
  return {
    build(islands, island) {
      group.clear();
      rings.length = 0;
      const base = island?.radius || 5.2;
      for (const def of islands || []) {
        const r = base * (def.size || 1);
        for (let i = 0; i < cfg.rings; i++) {
          const geo = new THREE.RingGeometry(r * 0.995, r * 0.995 + cfg.width, cfg.segments);
          const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
          const m = new THREE.Mesh(geo, mat);
          m.rotation.x = -Math.PI / 2;
          m.position.set(def.position[0], cfg.height, def.position[1]);
          m.raycast = () => {}; // 不擋點擊
          m.renderOrder = 2;
          group.add(m);
          // 每一圈錯開一點時間，每座島也錯開，才不會整齊得像機器
          rings.push({ m, mat, phase: i / cfg.rings + (def.position[0] * 0.013 + def.position[1] * 0.007) });
        }
      }
    },
    update(t) {
      for (const w of rings) {
        const k = ((t / cfg.period + w.phase) % 1 + 1) % 1; // 0 → 1：從沙灘邊推出去
        const s = 1 + cfg.push * k;
        w.m.scale.set(s, s, 1);
        // 一開始很快變亮（浪打上來），然後慢慢變淡
        w.mat.opacity = cfg.opacity * (k < 0.15 ? k / 0.15 : (1 - k) / 0.85);
      }
    },
  };
}

/** 足跡：step(位置, 面向, 在不在沙灘上走, 地面高度) 每一格呼叫；update(t) 讓舊的慢慢消失 */
export function createFootprints(scene, raw) {
  const cfg = { ...FOOTPRINT_DEFAULTS, ...(raw || {}) };
  const group = new THREE.Group();
  group.name = 'footprints';
  scene.add(group);
  const geo = new THREE.CircleGeometry(1, 12);
  const pool = [];
  let next = 0;
  let now = 0;
  let last = null; // 上一個腳印的位置
  let left = true;
  for (let i = 0; i < cfg.max; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.scale.set(cfg.size[0], cfg.size[1], 1);
    m.visible = false;
    m.raycast = () => {};
    group.add(m);
    pool.push({ m, mat, born: -1 });
  }
  return {
    step(p, heading, active, y) {
      if (!active) { last = null; return; }
      if (last && Math.hypot(p.x - last.x, p.z - last.z) < cfg.stride) return;
      last = { x: p.x, z: p.z };
      // 左右腳交替：往面向的左邊或右邊偏一點
      const sx = Math.cos(heading) * cfg.side * (left ? 1 : -1);
      const sz = -Math.sin(heading) * cfg.side * (left ? 1 : -1);
      left = !left;
      const f = pool[next];
      next = (next + 1) % pool.length;
      f.m.position.set(p.x + sx, y + 0.012, p.z + sz);
      f.m.rotation.z = heading; // 腳印長的那一邊朝走的方向
      f.m.visible = true;
      f.born = now;
      f.mat.opacity = cfg.opacity;
    },
    update(t) {
      now = t;
      for (const f of pool) {
        if (f.born < 0) continue;
        const age = t - f.born;
        if (age <= cfg.stay) continue;
        const k = (age - cfg.stay) / cfg.fade;
        if (k >= 1) { f.m.visible = false; f.born = -1; f.mat.opacity = 0; continue; }
        f.mat.opacity = cfg.opacity * (1 - k);
      }
    },
    clear() { for (const f of pool) { f.m.visible = false; f.born = -1; } last = null; },
    /** 檢查用：現在看得到幾個腳印 */
    count: () => pool.filter((f) => f.born >= 0).length,
  };
}
