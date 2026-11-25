// world/camera.js
// 相機繞著目標轉：手指或滑鼠拖曳可以轉方向，滾輪或雙指可以拉近拉遠，點島時飛過去。
import * as THREE from 'three';

export function createCameraRig(camera, dom, cfg) {
  const target = new THREE.Vector3();
  const state = { angle: 0.6, distance: cfg.overviewDistance, height: cfg.overviewHeight, zoom: 1 };
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
    if (pointers.size === 2) pinchStart = pinchSpan(e) || 0;
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
    state.angle -= (e.clientX - lastX) * cfg.dragSpeed;
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
  function setZoom(z) { state.zoom = Math.min(1.6, Math.max(0.55, z)); }

  /** 飛到某個點，distance／height 是相機離目標多遠多高 */
  function flyTo(point, distance, height) {
    fly = {
      t: 0,
      from: { x: target.x, y: target.y, z: target.z, d: state.distance, h: state.height },
      to: { x: point.x, y: point.y, z: point.z, d: distance, h: height },
    };
    state.zoom = 1;
  }

  function update(dt) {
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
    const d = state.distance * state.zoom;
    camera.position.set(target.x + Math.sin(state.angle) * d, target.y + state.height * state.zoom, target.z + Math.cos(state.angle) * d);
    camera.lookAt(target);
  }

  return {
    update,
    flyTo,
    overview() { flyTo(new THREE.Vector3(0, 0, 0), cfg.overviewDistance, cfg.overviewHeight); },
    focus(point, scale = 1) { flyTo(new THREE.Vector3(point.x, 1.5, point.z), cfg.focusDistance * scale, cfg.focusHeight * scale); },
  };
}

function lerp(a, b, k) { return a + (b - a) * k; }
