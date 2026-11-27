// world/camera.js
// 相機有兩種模式：
//   follow（跟著小公主）：斜上方固定角度，小公主一直在畫面中間；拖曳可以小轉角度，滾輪或雙指小幅拉近拉遠。
//   free（地圖）：繞著一個點轉，拖曳轉方向、滾輪拉遠近、點島時飛過去，放著不動會慢慢轉。
import * as THREE from 'three';

export function createCameraRig(camera, dom, cfg) {
  const fc = { distance: 11, height: 8, lookHeight: 1.2, yaw: 0, maxTurnDegrees: 35, smooth: 5, minZoom: 0.7, maxZoom: 1.4, ...(cfg.follow || {}) };
  const maxTurn = (fc.maxTurnDegrees * Math.PI) / 180;
  const target = new THREE.Vector3();
  const state = { angle: 0.6, distance: cfg.overviewDistance, height: cfg.overviewHeight, zoom: 1 };
  let mode = 'free';
  let followPoint = null; // 回傳 { x, y, z } 的函式
  let turn = 0; // 跟隨模式下拖曳轉了多少
  let fly = null;
  let dragging = false;
  let lastX = 0;
  let idle = 0;
  const pointers = new Map();
  let pinchStart = 0;

  dom.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, e.clientX);
    dragging = true;
    lastX = e.clientX;
    idle = 0;
    if (pointers.size === 2) pinchStart = pinchSpan() || 0;
  });
  dom.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (pointers.size >= 2) {
      pointers.set(e.pointerId, e.clientX);
      const span = pinchSpan();
      if (pinchStart && span) setZoom(state.zoom * (pinchStart / span));
      pinchStart = span;
      return;
    }
    const dx = (e.clientX - lastX) * cfg.dragSpeed;
    if (mode === 'follow') turn = Math.max(-maxTurn, Math.min(maxTurn, turn - dx));
    else state.angle -= dx;
    lastX = e.clientX;
    idle = 0;
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) dragging = false;
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY > 0 ? 1.08 : 0.93));
  }, { passive: false });

  function pinchSpan() {
    const xs = [...pointers.values()];
    return xs.length >= 2 ? Math.abs(xs[0] - xs[1]) : 0;
  }
  function setZoom(z) {
    const [lo, hi] = mode === 'follow' ? [fc.minZoom, fc.maxZoom] : [0.55, 1.6];
    state.zoom = Math.min(hi, Math.max(lo, z));
  }

  /** 飛到某個點，distance／height 是相機離目標多遠多高（地圖模式用） */
  function flyTo(point, distance, height) {
    mode = 'free';
    fly = {
      t: 0,
      from: { x: target.x, y: target.y, z: target.z, d: state.distance, h: state.height },
      to: { x: point.x, y: point.y, z: point.z, d: distance, h: height },
    };
    state.zoom = 1;
  }

  function update(dt) {
    if (mode === 'follow' && followPoint) {
      const p = followPoint();
      const k = 1 - Math.exp(-fc.smooth * dt);
      target.x += (p.x - target.x) * k;
      target.y += (p.y + fc.lookHeight - target.y) * k;
      target.z += (p.z - target.z) * k;
      state.distance += (fc.distance - state.distance) * k;
      state.height += (fc.height - state.height) * k;
      state.angle += shortest(state.angle, fc.yaw + turn) * k;
    } else {
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / cfg.flySeconds);
        const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
        target.set(lerp(fly.from.x, fly.to.x, k), lerp(fly.from.y, fly.to.y, k), lerp(fly.from.z, fly.to.z, k));
        state.distance = lerp(fly.from.d, fly.to.d, k);
        state.height = lerp(fly.from.h, fly.to.h, k);
        if (fly.t >= 1) fly = null;
      }
      idle += dt;
      if (!dragging && idle > 4) state.angle += cfg.autoSpinPerSecond * dt;
    }
    const d = state.distance * state.zoom;
    camera.position.set(target.x + Math.sin(state.angle) * d, target.y + state.height * state.zoom, target.z + Math.cos(state.angle) * d);
    camera.lookAt(target);
  }

  const center = cfg.overviewCenter || [0, 0];
  return {
    update,
    flyTo,
    /** 地圖：拉遠看全部的島。at = { x, z } 換一個中心（例如在姐妹的群島上時看她的群島） */
    overview(at = null) { const c = at || { x: center[0], z: center[1] }; flyTo(new THREE.Vector3(c.x, 0, c.z), cfg.overviewDistance, cfg.overviewHeight); },
    /** 地圖模式點一座島：飛過去（scale 是島的 size） */
    focus(point, scale = 1) { flyTo(new THREE.Vector3(point.x, 1.5, point.z), cfg.focusDistance * scale, cfg.focusHeight * scale); },
    /** 跟著小公主。snap = true 時直接跳過去（一開始、換小孩） */
    follow(getPoint, { snap = false } = {}) {
      mode = 'follow';
      fly = null;
      followPoint = getPoint;
      state.zoom = 1;
      if (snap) {
        const p = getPoint();
        target.set(p.x, p.y + fc.lookHeight, p.z);
        state.distance = fc.distance;
        state.height = fc.height;
        turn = 0;
        state.angle = fc.yaw;
      }
    },
    get mode() { return mode; },
    /** 相機現在的方位（方向鍵換成地面方向用） */
    yaw() { return state.angle; },
    /** 鏡頭看的地方（太陽、陰影跟過去） */
    target,
  };
}

function lerp(a, b, k) { return a + (b - a) * k; }
/** 從 a 轉到 b 最短要轉多少 */
function shortest(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
