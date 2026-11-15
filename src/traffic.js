import * as THREE from 'three';
import { rand, pick, chance, col } from './util.js';
import { S } from './city.js';
import { createModels } from './vehicles.js';
import { shadowCard } from './livery.js';
import { SUN } from './atmosphere.js';

const RING = 2 * (S.half + 40);
const wrapZ = (z) => ((((z + RING / 2) % RING) + RING) % RING) - RING / 2;
const CAR_PAINT = ['#c9cdd2', '#1d1d1f', '#eeeeec', '#1f2f55', '#5a1a20', '#c8b79a', '#2d4a35', '#8a8f95', '#6b6f73', '#e8e4da'];
const OUTER = ['danfo', 'danfoB', 'korope', 'koropeB', 'danfo', 'danfoB', 'car', 'suv'];
const INNER = ['car', 'car', 'suv', 'danfo', 'korope', 'brt', 'car', 'danfoB', 'suv'];
// Sunset shadows run away from the sun: this far along z and x per metre of height.
const SHZ = -SUN.z / SUN.y, SHX = -SUN.x / SUN.y;

export function createTraffic(scene, T) {
  const models = createModels();
  const vehicles = [], lanes = new Map();
  const add = (type, d, track, x, z) => {
    const m = models[type];
    const v = {
      type, d, track, x, z, L: m.L, W: m.W, H: m.H, v: rand(0, 3), a: 0, v0: type === 'brt' ? rand(6, 8.5) : rand(4.5, 9),
      stop: 0, horn: rand(4, 40), phase: rand(0, 100), idx: vehicles.length, oneEyed: chance(0.12), called: false,
      color: m.car ? col(CAR_PAINT[Math.floor(rand(0, CAR_PAINT.length))]) : [1, 1, 1].map(() => 0),
    };
    if (!m.car) { const k = rand(0.8, 1.0); v.color = [k, k, k]; }
    vehicles.push(v);
    if (!lanes.has(track)) lanes.set(track, []);
    lanes.get(track).push(v);
  };
  for (const d of [-1, 1]) {
    const side = d > 0 ? -1 : 1; // vehicles keep right: moving +z uses x < 0
    S.lanes.forEach((lx, li) => {
      let z = -RING / 2;
      while (z < RING / 2 - 14) {
        const type = pick(li === 1 ? OUTER : INNER);
        add(type, d, `${d}:${li}`, side * lx, z + models[type].L / 2);
        z += models[type].L + rand(4, 15);
      }
    });
  }
  for (const list of lanes.values()) list.sort((a, b) => a.z * a.d - b.z * b.d);

  // One InstancedMesh per model (multi-material), lamps, headlight spill and soft shadow cards.
  const inst = {}, paints = {}, cnt = {};
  for (const type of Object.keys(models)) {
    const list = vehicles.filter((v) => v.type === type);
    if (!list.length) continue;
    const geo = models[type].geo.clone(), paintAttr = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3);
    list.forEach((v, i) => { v.slot = i; paintAttr.setXYZ(i, ...v.color); });
    geo.setAttribute('aPaint', paintAttr); paints[type] = paintAttr;
    const im = new THREE.InstancedMesh(geo, models[type].mats, list.length);
    im.receiveShadow = true; im.frustumCulled = false;
    inst[type] = im; scene.add(im);
  }
  const lampCount = vehicles.reduce((n, v) => n + models[v.type].lamps.length, 0);
  const lampMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), lampCount);
  lampMesh.frustumCulled = false; scene.add(lampMesh);
  const spill = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: T.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, color: 0x1c160f }), vehicles.length);
  spill.frustumCulled = false; spill.renderOrder = 3; scene.add(spill);
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowCard(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), vehicles.length);
  shadows.frustumCulled = false; shadows.renderOrder = 1; scene.add(shadows);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3(), eul = new THREE.Euler();
  const HEAD = new THREE.Color(5, 4.5, 3.4), DEAD = new THREE.Color(0.06, 0.05, 0.04), TAIL = new THREE.Color(1.5, 0.06, 0.04), BRAKE = new THREE.Color(5, 0.25, 0.15), AMBER = new THREE.Color(4, 2.1, 0.35);
  const api = { vehicles, onHorn: null };

  api.update = (dt, t, obstacles, player, view) => {
    dt = Math.min(dt, 0.05);
    const wave = (d) => 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.045 + d * 1.7));
    for (const list of lanes.values()) {
      const n = list.length;
      for (let i = 0; i < n; i++) {
        const v = list[i], lead = list[(i + 1) % n];
        let gap = ((((lead.z - v.z) * v.d) % RING) + RING) % RING - (lead.L + v.L) / 2;
        let dv = v.v - lead.v, blocked = false;
        for (const o of obstacles) {
          if (Math.abs(o.x - v.x) > v.W / 2 + 0.55) continue;
          const ahead = (o.z - v.z) * v.d - v.L / 2 - 0.9;
          if (ahead > -0.5 && ahead < gap) { gap = Math.max(ahead, 0.05); dv = v.v; blocked = true; }
        }
        let a;
        if (v.stop > 0) { v.stop -= dt; a = -3 * v.v; }
        else {
          const v0 = v.v0 * wave(v.d), ss = 1.4 + Math.max(0, v.v * 1.0 + (v.v * dv) / 3.7);
          a = 1.5 * (1 - (v.v / v0) ** 4 - (ss / Math.max(gap, 0.05)) ** 2);
        }
        v.a = Math.max(a, -8);
        v.v = Math.max(0, v.v + v.a * dt);
        if (v.v < 0.05 && v.a < 0) v.v = 0;
        v.z = wrapZ(v.z + v.v * v.d * dt);
        const bus = v.type.startsWith('danfo') || v.type.startsWith('korope');
        if (bus && v.track === '-1:1' && !v.called && v.z < S.busStopZ + 1 && v.z > S.busStopZ - 3) { v.called = true; if (chance(0.75)) v.stop = rand(6, 13); }
        if (Math.abs(v.z - S.busStopZ) > 20) v.called = false;
        if (bus && v.stop <= 0 && chance(dt * 0.004)) v.stop = rand(3, 7);
        v.horn -= dt * (blocked ? 6 : gap < 3 && v.v < 1 ? 1.6 : 0.4);
        if (v.horn < 0) {
          v.horn = rand(8, 45);
          const dz = v.z - player.z, dx = v.x - player.x;
          if (dx * dx + dz * dz < 90 * 90) api.onHorn?.(v.x, 1, v.z, bus ? 'danfo' : v.type === 'brt' ? 'brt' : 'car', blocked);
        }
      }
    }
    // Only vehicles you could actually see are drawn: within 230 m (the haze hides the rest),
    // and none at all once you are down on the beach behind the buildings.
    let li = 0, si = 0;
    for (const k in inst) cnt[k] = 0;
    for (const v of vehicles) {
      let dzp = v.z - player.z; dzp -= Math.round(dzp / RING) * RING;
      if (Math.abs(dzp) > 230 || player.x < -60) continue;
      if (view && (v.x - player.x) * view.x + dzp * view.z < -12) continue; // well behind the camera
      const f = v.d > 0 ? -1 : 1, m = models[v.type], slot = cnt[v.type]++;
      const rough = v.type === 'danfo' || v.type === 'danfoB' ? 0.014 : 0.006;
      const bob = Math.sin(t * 9 + v.phase) * rough * Math.min(1, v.v), pitch = -v.a * 0.004 * f;
      q.setFromEuler(eul.set(pitch, v.d > 0 ? Math.PI : 0, 0));
      m4.compose(pos.set(v.x, bob, v.z), q, sc);
      inst[v.type].setMatrixAt(slot, m4); paints[v.type].setXYZ(slot, v.color[0], v.color[1], v.color[2]);
      api.onDraw?.(v, m, f, v.d > 0 ? Math.PI : 0, bob, player);
      m.lamps.forEach(([lx, ly, lz, sx, sy, kind], k) => {
        m4.makeScale(sx, sy, 0.04); m4.setPosition(v.x + lx * f, ly + bob, v.z + lz * f);
        lampMesh.setMatrixAt(li, m4);
        lampMesh.setColorAt(li++, kind === 'head' ? (v.oneEyed && k === 0 ? DEAD : HEAD) : kind === 'amber' ? AMBER : v.a < -0.6 || v.stop > 0 ? BRAKE : TAIL);
      });
      m4.makeScale(v.W * 1.7, 1, 7); m4.setPosition(v.x, 0.02, v.z - f * (v.L / 2 + 3.4));
      spill.setMatrixAt(si, m4);
      const len = v.L + v.H * SHZ * 0.9;
      m4.set(v.W * 1.02, 0, v.H * SHX * 0.9, v.x, 0, 1, 0, 0.025, 0, 0, len, v.z - v.L / 2, 0, 0, 0, 1);
      shadows.setMatrixAt(si++, m4);
    }
    for (const k in inst) { inst[k].count = cnt[k]; inst[k].instanceMatrix.needsUpdate = true; paints[k].needsUpdate = true; }
    lampMesh.count = li; spill.count = si; shadows.count = si;
    lampMesh.instanceMatrix.needsUpdate = true; if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
    spill.instanceMatrix.needsUpdate = true; shadows.instanceMatrix.needsUpdate = true;
  };

  // Keeps the walker out of vehicle bodies.
  api.pushOut = (p, r) => {
    for (const v of vehicles) {
      const dx = p.x - v.x, dz = p.z - v.z;
      if (Math.abs(dz) > 7 || Math.abs(dx) > 2.5) continue;
      const ex = v.W / 2 + r - Math.abs(dx), ez = v.L / 2 + r - Math.abs(dz);
      if (ex > 0 && ez > 0) { if (ex < ez) p.x += Math.sign(dx || 1) * ex; else p.z += Math.sign(dz || 1) * ez; }
    }
  };
  return api;
}
