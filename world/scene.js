// world/scene.js
// 天空、海、光線、相機。所有數字從 config/world.json 和 config/theme.json 來。
import * as THREE from 'three';

export function createScene(canvas, sceneColors, cfg) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.quality.maxPixelRatio));
  renderer.shadowMap.enabled = !!cfg.quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = skyTexture(sceneColors.skyTop, sceneColors.skyBottom);
  scene.fog = new THREE.Fog(sceneColors.skyBottom, cfg.fog?.near ?? 70, cfg.fog?.far ?? 170);

  const camera = new THREE.PerspectiveCamera(cfg.camera.fov, 1, 0.1, cfg.camera.far || 400);

  scene.add(new THREE.HemisphereLight(sceneColors.skyTop, sceneColors.sand, 1.6));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.2);
  // 太陽跟著鏡頭看的地方移動，陰影只畫附近（島很大，整片都畫陰影會太糊、太慢）
  const SUN = new THREE.Vector3(25, 40, 18);
  sun.position.copy(SUN);
  sun.castShadow = !!cfg.quality.shadows;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  const half = cfg.shadow?.size || 35;
  sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 140;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  const sea = makeSea(sceneColors, cfg.sea);
  scene.add(sea.mesh);

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    renderer, scene, camera,
    /** focus：鏡頭看的地方（太陽和陰影跟過去） */
    update(t, focus) {
      sea.update(t);
      if (focus) {
        sun.target.position.set(focus.x, 0, focus.z);
        sun.position.set(focus.x + SUN.x, SUN.y, focus.z + SUN.z);
      }
    },
    render() { renderer.render(scene, camera); },
  };
}

function skyTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSea(colors, cfg) {
  const geo = new THREE.PlaneGeometry(cfg.size, cfg.size, cfg.segments || 70, cfg.segments || 70);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const material = new THREE.MeshStandardMaterial({ color: colors.sea, roughness: 0.35, metalness: 0, flatShading: true, transparent: true, opacity: 0.94 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  // 遠處的深色海
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(cfg.size * 3, cfg.size * 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: colors.seaDeep }));
  deep.position.y = -1.2;
  mesh.add(deep);
  return {
    mesh,
    update(t) {
      const s = t * cfg.waveSpeed;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        pos.array[i * 3 + 1] = Math.sin(x * 0.16 + s) * Math.cos(z * 0.13 + s * 0.8) * cfg.waveHeight;
      }
      pos.needsUpdate = true;
    },
  };
}
