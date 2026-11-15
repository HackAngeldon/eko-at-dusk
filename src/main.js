import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import * as TX from './textures.js';
import { buildCity, S } from './city.js';
import { createTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { patchFog, makeSky, SUN, HAZE, FOG_DENSITY, GradeShader, SanitizeShader } from './atmosphere.js';
import { buildBeach } from './beach.js';
import { buildLife } from './life.js';
import { createHumans } from './humans.js';
import { createCrowds } from './crowds.js';
import { createCloth } from './cloth.js';
import { shoreX, WL } from './ocean.js';
import { clamp } from './util.js';

const $ = (id) => document.getElementById(id);
const doc = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
let quality = store.get('eko.quality') || (coarse ? 'low' : 'high');
// Let the loading bar paint between steps; fall back to a timer so loading continues in a background tab.
const frameYield = () => new Promise((r) => { let done = false; const go = () => { if (!done) { done = true; setTimeout(r, 0); } }; requestAnimationFrame(go); setTimeout(go, 150); });
async function step(msg, p) { $('status').textContent = msg; $('bar').style.transform = `scaleX(${p})`; await frameYield(); }

patchFog();
try { await boot(); } catch (e) {
  console.error(e);
  $('status').textContent = 'This street could not load: ' + (e.message || e) + '. A browser with WebGL 2 is needed.';
  doc.dataset.state = 'error';
}

async function boot() {
  // ---------- Renderer, sky, haze, light ----------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, FOG_DENSITY);
  scene.background = HAZE;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 700);
  camera.rotation.order = 'YXZ';

  const skyMat = makeSky();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat);
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat));
  scene.environment = pmrem.fromScene(skyScene, 0, 0.1, 1000).texture;
  scene.environmentIntensity = 0.9;

  scene.add(new THREE.HemisphereLight('#aab8d8', '#5a4334', 0.35));
  const sun = new THREE.DirectionalLight('#ffb27c', 3.2);
  sun.castShadow = true; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);

  // ---------- Build the street ----------
  await step('Mixing the paint…', 0.05);
  await Promise.race([Promise.all(['64px Bungee', '32px Archivo', '800 32px Archivo', '900 32px Archivo', '40px "Permanent Marker"'].map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  await step('Painting the signboards…', 0.15);
  const T = {
    plaster: TX.plaster(), asphalt: TX.asphalt(), dirt: TX.dirt(), roof: TX.roof(), windows: TX.windows(), shops: TX.shops(),
    signs: TX.signAtlas(), billboards: TX.billboards(), glow: TX.glow(),
    blocks: TX.blocks(), tiles: TX.tiles(), breeze: TX.breeze(), streaks: TX.streaks(), frames: TX.windowFrames(), shutter: TX.shutter(),
  };
  await step('Raising the buildings…', 0.3);
  const city = buildCity(T); scene.add(city.group);
  await step('Planting the coconut palms…', 0.45);
  const beach = buildBeach(T); scene.add(beach.group);
  const life = buildLife(T, beach); scene.add(life.group);
  await step('Panel-beating the danfos…', 0.62);
  const traffic = createTraffic(scene, T);
  await step('Filling the walkways…', 0.75);
  const humans = createHumans(scene);
  const cloth = createCloth(scene);
  const crowds = createCrowds(humans, city, beach, traffic);
  const audio = createAudio();

  // Dust hanging in the evening light
  const DUST = 700, dustGeo = new THREE.BufferGeometry(), dp = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = Math.random() * 50 - 25; dp[i * 3 + 1] = Math.random() * 8; dp[i * 3 + 2] = Math.random() * 50 - 25; }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: T.glow, color: 0xffc890, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; scene.add(dust);

  // ---------- Shadows: the sun never moves, so the whole street's shadows are drawn once ----------
  function fitShadow() {
    const high = quality === 'high';
    sun.position.copy(SUN).multiplyScalar(400); sun.target.position.set(0, 0, 0);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    const view = new THREE.Matrix4().lookAt(sun.position, sun.target.position, new THREE.Vector3(0, 1, 0)).setPosition(sun.position).invert();
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], p = new THREE.Vector3();
    for (const x of [-34, 34]) for (const y of [0, 26]) for (const z of [-S.half - 40, S.half + 40]) {
      p.set(x, y, z).applyMatrix4(view);
      p.toArray().forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); });
    }
    const cam = sun.shadow.camera;
    Object.assign(cam, { left: lo[0], right: hi[0], bottom: lo[1], top: hi[1], near: -hi[2] - 5, far: -lo[2] + 5 });
    cam.updateProjectionMatrix();
    const size = high ? 4096 : 2048, aspect = (hi[0] - lo[0]) / (hi[1] - lo[1]);
    sun.shadow.mapSize.set(aspect >= 1 ? size : Math.round(size * aspect), aspect >= 1 ? Math.round(size / aspect) : size);
    sun.shadow.map?.dispose(); sun.shadow.map = null;
    renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.shadowMap.needsUpdate = true;
  }

  // ---------- Post: bloom, tone mapping, then a camera grade (vignette, fringing, grain) ----------
  let composer = null, bloom = null, grade = null, resScale = 1;
  const basePR = () => Math.min(devicePixelRatio, quality === 'high' ? 1.5 : 1);
  function buildComposer() {
    composer?.dispose();
    const high = quality === 'high';
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass(SanitizeShader));
    bloom =new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 0.95); bloom.enabled = high;
    composer.addPass(bloom); composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader); composer.addPass(grade);
  }
  function applyQuality() {
    fitShadow(); buildComposer();
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    document.querySelectorAll('#quality button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.q === quality));
    resize();
  }
  function resize() {
    const w = innerWidth, h = innerHeight, pr = basePR() * resScale;
    renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = coarse && h > w ? 72 : 60; camera.updateProjectionMatrix();
    composer.setPixelRatio(pr); composer.setSize(w, h);
    grade.uniforms.res.value.set(w * pr, h * pr);
  }
  addEventListener('resize', resize);
  applyQuality();

  // ---------- Player ----------
  const VIEWS = [
    { x: 10.6, y: 0.15, z: 70, yaw: 0, pitch: 0.02 },
    { x: 4.5, y: S.deckTop, z: S.bridgeZ - 0.6, yaw: 0.15, pitch: -0.2 },
    { x: -4.5, y: S.deckTop, z: S.bridgeZ + 0.6, yaw: Math.PI + 0.15, pitch: -0.2 },
    { x: 9.0, y: 0.15, z: S.busStopZ + 9, yaw: 0.3, pitch: 0 },
    { x: 0, y: 0.25, z: 16, yaw: 0, pitch: 0 },
    { x: -38, y: 0.2, z: S.pathZ, yaw: Math.PI / 2, pitch: -0.03 },
    { x: shoreX(-60) + 14, y: 0, z: -60, yaw: 0.8, pitch: -0.04 },
  ];
  // Where you can stand: the street, then the path and the beach (null = you can't go there).
  const heightAt = (x, z, y) => (Math.abs(x) <= 12.2 && Math.abs(z) <= S.half ? city.groundHeight(x, z, y) : beach.heightAt(x, z));
  const player = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, vy: 0, bob: 0, inGutter: false };
  const goto = (i) => { Object.assign(player, VIEWS[i], { vy: 0 }); player.y = heightAt(player.x, player.z, player.y) ?? player.y; };
  goto(0);
  const keys = new Set(), move = { x: 0, y: 0, run: false };
  let state = 'loading', look = { dx: 0, dy: 0 }, dragging = false;

  function setState(s) {
    state = s; doc.dataset.state = s;
    $('start').textContent = s === 'paused' ? 'Back to the street' : 'Start walking';
    if (s === 'playing') audio.suspend(false);
  }
  let greeted = false;
  function play() {
    audio.start(city, shoreX, beach.huts[1]);
    if (!greeted) { greeted = true; setTimeout(() => toast('Eko Beach: follow the blue signs. About 190 m ahead, on your left.'), 600); }
    setState('playing');
    if (!coarse) canvas.requestPointerLock?.()?.catch?.(() => {});
  }
  $('start').addEventListener('click', play);
  $('pause').addEventListener('click', () => setState('paused'));
  document.querySelectorAll('#quality button').forEach((b) => b.addEventListener('click', () => { quality = b.dataset.q; store.set('eko.quality', quality); resScale = 1; applyQuality(); }));
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'playing') setState('paused'); });
  document.addEventListener('visibilitychange', () => audio.suspend(document.hidden));

  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && state === 'playing' && !document.pointerLockElement) setState('paused');
    if (state !== 'playing') return;
    keys.add(e.code);
    if (/^Digit[1-7]$/.test(e.code)) goto(+e.code.slice(5) - 1);
    if (e.code === 'KeyM') toast(audio.toggleMute() ? 'Sound off' : 'Sound on');
    if (e.code === 'KeyH') $('stats').hidden = !$('stats').hidden;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousedown', () => { dragging = true; });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (state !== 'playing' || !(document.pointerLockElement || dragging)) return;
    look.dx += e.movementX; look.dy += e.movementY;
  });

  // Touch: left thumb walks, right thumb looks.
  const touches = new Map();
  canvas.addEventListener('touchstart', (e) => {
    if (state !== 'playing') return;
    for (const t of e.changedTouches) touches.set(t.identifier, { x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY, left: t.clientX < innerWidth / 2 });
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const s = touches.get(t.identifier); if (!s) continue;
      if (!s.left) { look.dx += (t.clientX - s.x) * 2.2; look.dy += (t.clientY - s.y) * 2.2; }
      s.x = t.clientX; s.y = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const endTouch = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); };
  canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);

  let toastTimer = 0;
  function toast(msg) { $('toast').textContent = msg; $('toast').hidden = false; toastTimer = 2.8; }

  function updatePlayer(dt) {
    player.yaw -= look.dx * 0.0022; player.pitch = clamp(player.pitch - look.dy * 0.0022, -1.2, 1.2); look.dx = look.dy = 0;
    move.x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    move.y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    move.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    for (const s of touches.values()) if (s.left) {
      const dx = (s.x - s.x0) / 60, dy = (s.y - s.y0) / 60, m = Math.hypot(dx, dy);
      if (m > 0.1) { move.x = dx / Math.max(1, m); move.y = -dy / Math.max(1, m); move.run = m > 1.4; }
    }
    const len = Math.hypot(move.x, move.y);
    if (len > 0) {
      const sp = (move.run ? 4.2 : 1.7) / Math.max(1, len), sn = Math.sin(player.yaw), cs = Math.cos(player.yaw);
      const vx = (-sn * move.y + cs * move.x) * sp * dt, vz = (-cs * move.y - sn * move.x) * sp * dt;
      tryMove(player.x + vx, player.z + vz) || tryMove(player.x + vx, player.z) || tryMove(player.x, player.z + vz);
      player.bob += dt * (move.run ? 11 : 7.5);
    }
    if (Math.abs(player.x) < 12.3) traffic.pushOut(player, 0.35);
    const bx = player.x, bz = player.z; // bump into people and props, but never get pushed somewhere you can't stand
    crowds.pushOut(player, 0.35);
    if (heightAt(player.x, player.z, player.y) == null) { player.x = bx; player.z = bz; }
    const gh = heightAt(player.x, player.z, player.y) ?? player.y;
    if (gh >= player.y) { player.y = gh; player.vy = 0; }
    else { player.vy -= 9.8 * dt; player.y = Math.max(gh, player.y + player.vy * dt); }
    const g = Math.abs(player.x) < 12.3 && gh < -0.2;
    if (g && !player.inGutter) toast('Careful o! Lagos gutters are open.');
    player.inGutter = g;
    const wet = player.x < -60 && gh < WL + 0.05;
    if (wet && !player.wet) toast('The Atlantic is warm, but mind the current.');
    player.wet = wet;
  }
  function tryMove(nx, nz) {
    const gh = heightAt(nx, nz, player.y);
    if (gh === null || gh === undefined) return false;
    if (gh - player.y > 0.45) return false;
    if (player.y > 3 && gh < player.y - 1) return false;
    player.x = nx; player.z = nz; return true;
  }
  traffic.onHorn = (x, y, z, type, angry) => audio.horn(x, y, z, type, angry);

  // ---------- Loop ----------
  await step('Waiting for the sun to go down…', 0.9);
  renderer.compile(scene, camera);
  await step('Ready', 1);
  setState('ready');
  let last = performance.now(), t = 0, fpsAcc = 0, fpsN = 0, avg = 16, lastAdjust = performance.now();
  const fwd = new THREE.Vector3(), obstacles = [{ x: 0, z: 0 }];
  function frame(now) {
    requestAnimationFrame(frame);
    renderer.info.reset();
    const raw = (now - last) / 1000, dt = Math.min(raw, 0.05); last = now; t += dt;
    if (state === 'playing') updatePlayer(dt);
    humans.beginFrame(player, t, dt);
    const walkersInRoad = crowds.update(t, dt, player, fwd);
    obstacles.length = 1; obstacles[0].x = player.x; obstacles[0].z = player.z;
    for (const o of walkersInRoad) obstacles.push(o);
    traffic.update(dt, t, obstacles, player, fwd);
    humans.end();
    cloth.update(humans.cands, player, dt, t);
    beach.update(t); life.update(t, dt, player);
    // The haze thins out over the open beach, so the sea stays readable.
    const fogTarget = player.x < -40 ? 0.0029 : FOG_DENSITY;
    scene.fog.density += (fogTarget - scene.fog.density) * Math.min(1, dt * 0.8);
    skyMat.uniforms.fogD.value = scene.fog.density;

    const moving = state === 'playing' && Math.hypot(move.x, move.y) > 0;
    camera.position.set(player.x, player.y + 1.65 + (moving ? Math.sin(player.bob) * 0.03 : 0), player.z);
    camera.rotation.set(player.pitch, player.yaw, moving ? Math.sin(player.bob * 0.5) * 0.004 : 0);
    if (state !== 'playing') camera.rotation.y += Math.sin(t * 0.08) * 0.06;
    sky.position.copy(camera.position);
    dust.position.set(Math.floor(player.x / 50) * 50, 0, Math.floor(player.z / 50) * 50);
    for (let i = 0; i < DUST; i++) dp[i * 3 + 1] = (dp[i * 3 + 1] + dt * 0.08) % 8;
    dustGeo.attributes.position.needsUpdate = true;
    camera.getWorldDirection(fwd); audio.update(camera.position, fwd, dt);
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').hidden = true;

    grade.uniforms.time.value = t;
    composer.render(dt);

    // Adaptive resolution: trade pixels for a steady frame rate.
    if (raw < 0.1 && !document.hidden) avg = avg * 0.95 + raw * 1000 * 0.05;
    if (now - lastAdjust > 2000) {
      lastAdjust = now;
      if (avg > 24 && resScale > 0.7) { resScale = Math.max(0.7, resScale - 0.1); resize(); }
      else if (avg < 15 && resScale < 1) { resScale = Math.min(1, resScale + 0.1); resize(); }
    }
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 0.5 && !$('stats').hidden) {
      const i = renderer.info.render;
      $('stats').textContent = `${Math.round(fpsN / fpsAcc)} fps · ${i.calls} draw calls · ${(i.triangles / 1000).toFixed(0)}k triangles · ${quality} detail · ${Math.round(resScale * 100)}% resolution`;
      fpsAcc = 0; fpsN = 0;
    }
  }
  requestAnimationFrame(frame);

  // Development only (never on the published page): capture a frame from a viewpoint.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__eko = {
    scene, humans, player,
    simulate(frames, dt = 1 / 30) { // run the crowd on its own and report how it behaves
      const look = { x: 0, y: 0, z: -1 };
      for (let i = 0; i < frames; i++) { humans.beginFrame(player, t + i * dt, dt); crowds.update(t + i * dt, dt, player, look); humans.end(); cloth.update(humans.cands, player, dt, t + i * dt); }
      return crowds.stats();
    },
    async shot(name, view, o = {}) {
      goto(view); Object.assign(player, o);
      for (let i = 0; i < (o.steps ?? 60); i++) traffic.update(1 / 30, t + i / 30, obstacles, player);
      const look = { x: -Math.sin(player.yaw), y: 0, z: -Math.cos(player.yaw) };
      humans.beginFrame(player, t + 5, 1 / 30); crowds.update(t + 5, 1 / 30, player, look); traffic.update(1 / 60, t + 2, obstacles, player, look); humans.end();
      beach.update(t + 5); life.update(t + 5, 0.016, player);
      if (o.fog) { scene.fog.density = o.fog; skyMat.uniforms.fogD.value = o.fog; }
      camera.position.set(player.x, player.y + 1.65, player.z); camera.rotation.set(player.pitch, player.yaw, 0);
      sky.position.copy(camera.position);
      const hide = [];
      if (o.hide) __eko.scene.traverse((m) => { if (m.visible && o.hide(m)) { m.visible = false; hide.push(m); } });
      const bl = bloom.enabled; if (o.noBloom) bloom.enabled = false;
      renderer.info.reset(); composer.render(0.016);
      bloom.enabled = bl; hide.forEach((m) => { m.visible = true; });
      const url = canvas.toDataURL('image/jpeg', 0.85), info = { ...renderer.info.render };
      await fetch('/shot?name=' + name, { method: 'POST', body: url });
      return info;
    },
  };
}
