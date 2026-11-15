import * as THREE from 'three';
import { ANKARA_GLSL } from './humans.js';

// Real cloth for the skirts, wrappers, dresses and kaftans of the people nearest to you.
// Each garment is a net of particles (22 around x 9 down) joined by stretch, shear and bend links,
// stepped with Verlet integration. The waistband is pinned to the hips; everything below hangs
// under gravity, keeps its momentum when the wearer speeds up, slows or turns, catches the breeze,
// and is pushed out of the thighs, shins and hips, off a chair seat when sitting, and off the ground.
// A small spatial hash stops the fabric passing through itself, so it folds instead.
const NA = 20, NR = 9, N = NA * NR, MAX = 6;
const SK = [[0.34, 0.25, 0.2, 0], [0.45, 0.24, 0.19, 0], [0.6, 0.23, 0.18, 0], [0.73, 0.215, 0.165, 0.005], [0.85, 0.2, 0.15, 0.01], [1.0, 0.17, 0.13, 0.01]];
const ring = (y) => { for (let i = 0; i < SK.length - 1; i++) if (y <= SK[i + 1][0]) { const t = (y - SK[i][0]) / (SK[i + 1][0] - SK[i][0]); return SK[i].slice(1).map((v, k) => v + (SK[i + 1][k + 1] - v) * t); } return SK[SK.length - 1].slice(1); };
const ROWY = (r) => 1.0 - r * (0.66 / (NR - 1));
const idx = (r, c) => r * NA + ((c + NA) % NA);

// Leg joints in the wearer's hip frame, using the same gait as the body shader.
function pose(a, pose, ph, t) {
  const amp = a.stride, fem = Math.floor(a.top[3] / 2) % 2, tt = t + a.skin[3] * 37;
  let hL = 0, hR = 0, kL = -0.05, kR = -0.05, rY = 0, rZ = 0; const off = [0, 0, 0];
  if (pose === 0 || pose === 5) {
    const s = Math.sin(ph), c = Math.cos(ph);
    hL = amp * s; hR = -amp * s;
    kL = -(0.07 + 1.55 * amp * Math.pow(Math.max(c, 0), 1.4) + 0.25 * amp * Math.max(-c, 0) * Math.max(s, 0));
    kR = -(0.07 + 1.55 * amp * Math.pow(Math.max(-c, 0), 1.4) + 0.25 * amp * Math.max(c, 0) * Math.max(-s, 0));
    off[0] = 0.022 * c * (1 + fem); off[1] = -0.045 * amp * Math.cos(2 * ph) - 0.01; rY = 0.13 * amp * s; rZ = 0.05 * c * (0.6 + fem);
  } else if (pose === 1) {
    const w = Math.sin(tt * 0.45);
    rZ = 0.025 * w; off[0] = 0.022 * w; kL = -0.05 - 0.07 * Math.max(w, 0); kR = -0.05 - 0.07 * Math.max(-w, 0); hL = 0.03 * Math.max(w, 0); hR = 0.03 * Math.max(-w, 0);
  } else if (pose === 2) { hL = 1.5; hR = 1.45; kL = -1.45; kR = -1.5; off[1] = -0.42; }
  else if (pose === 6) { rZ = 0.04 * Math.sin(tt * 0.8); off[0] = 0.03 * Math.sin(tt * 0.8); }
  const leg = (x, h, k) => {
    const hip = [x, 0.93, 0], knee = [x, 0.93 - 0.43 * Math.cos(h), -0.43 * Math.sin(h)];
    return [hip, knee, [x, knee[1] - 0.415 * Math.cos(h + k), knee[2] - 0.415 * Math.sin(h + k)]];
  };
  return { legs: [leg(-0.095, hL, kL), leg(0.095, hR, kR)], rY, rZ, off, sit: pose === 2 };
}

export function createCloth(scene) {
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.88 });
  const pool = [];
  for (let k = 0; k < MAX; k++) {
    const g = new THREE.BufferGeometry(), pos = new Float32Array((NA + 1) * NR * 3), uv = [], ix = [];
    for (let r = 0; r < NR; r++) for (let c = 0; c <= NA; c++) uv.push(c / NA, 1 - r / (NR - 1));
    for (let r = 0; r < NR - 1; r++) for (let c = 0; c < NA; c++) { const a = r * (NA + 1) + c, b = a + 1, d = a + NA + 1, e = d + 1; ix.push(a, d, b, b, d, e); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCUv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix);
    const m = mat.clone();
    m.userData.u = { uC: { value: new THREE.Color() }, uSeed: { value: 0 }, uPat: { value: 0 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, m.userData.u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCUv; varying vec2 vCUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCUv = aCUv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uC; uniform float uSeed; uniform float uPat; varying vec2 vCUv;\n' + ANKARA_GLSL)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = uPat > 0.5 ? ankara(uC, vCUv, uSeed) : uC;');
    };
    m.customProgramCacheKey = () => 'cloth-v1';
    const mesh = new THREE.Mesh(g, m); mesh.matrixAutoUpdate = false; mesh.frustumCulled = false; mesh.visible = false; mesh.receiveShadow = true;
    scene.add(mesh);
    pool.push({ mesh, g, p: new Float32Array(N * 3), q: new Float32Array(N * 3), rest: new Float32Array(N * 3), owner: null, v: [0, 0, 0], yaw: 0 });
  }
  // Links: stretch (around and down), shear (diagonals) and bend (every other particle).
  const links = [];
  const restOf = (r, c) => { const y = ROWY(r), [rx, rz, cz] = ring(y), an = (c / NA) * Math.PI * 2; return [rx * Math.sin(an), y, cz + rz * Math.cos(an)]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (let r = 0; r < NR; r++) for (let c = 0; c < NA; c++) {
    const add = (r2, c2, k) => { if (r2 < NR) links.push([idx(r, c), idx(r2, c2), dist(restOf(r, c), restOf(r2, c2 % NA)), k]); };
    add(r, c + 1, 1); add(r + 1, c, 1); add(r + 1, c + 1, 0.7); add(r + 1, c - 1 + NA, 0.7); add(r + 2, c, 0.35); add(r, c + 2, 0.35);
  }

  function assign(s, cand) {
    s.owner = cand.a; cand.a.clothSim = s;
    for (let r = 0; r < NR; r++) for (let c = 0; c < NA; c++) { const v = restOf(r, c), i = idx(r, c) * 3; s.rest.set(v, i); s.p.set(v, i); s.q.set(v, i); }
    const a = cand.a, kind = a.bot[3] % 10, top = kind > 2.5;
    s.mesh.material.userData.u.uC.value.setRGB(...(top ? a.top : a.bot).slice(0, 3));
    s.mesh.material.userData.u.uSeed.value = a.skin[3] + (top ? 0 : 0.3);
    s.mesh.material.userData.u.uPat.value = top ? a.top[3] % 2 : 1;
    s.v = [0, 0, 0]; s.yaw = cand.yaw; s.px = cand.x; s.pz = cand.z;
  }

  const tmp = new THREE.Matrix4(), rootM = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  function simulate(s, cand, dt, t, far) {
    const a = cand.a, P = pose(a, cand.pose, cand.phase, t), p = s.p, q = s.q, scale = a.h;
    // How the wearer moved since last frame, felt as inertia in the hip frame, plus air and breeze.
    const vx = (cand.x - s.px) / dt, vz = (cand.z - s.pz) / dt, ax = (vx - s.v[0]) / dt, az = (vz - s.v[2]) / dt;
    s.px = cand.x; s.pz = cand.z; s.v = [vx, 0, vz];
    const cs = Math.cos(-cand.yaw), sn = Math.sin(-cand.yaw), toLocal = (x, z) => [x * cs + z * sn, -x * sn + z * cs];
    const [alx, alz] = toLocal(Math.max(-15, Math.min(15, ax)), Math.max(-15, Math.min(15, az)));
    const breeze = cand.x < -40 ? 2.2 + 1.2 * Math.sin(t * 0.31) : 0.5;
    const [awx, awz] = toLocal(breeze - vx, -vz);
    let dyaw = cand.yaw - s.yaw; dyaw -= Math.round(dyaw / (Math.PI * 2)) * Math.PI * 2; s.yaw = cand.yaw;
    if (Math.abs(dyaw) > 0.001) { const c = Math.cos(-dyaw * 0.8), sN = Math.sin(-dyaw * 0.8); for (let i = 0; i < N; i++) { const x = q[i * 3], z = q[i * 3 + 2]; q[i * 3] = x * c + z * sN; q[i * 3 + 2] = -x * sN + z * c; } }
    const sub = far ? 1 : 2, iters = far ? 3 : 5, h = Math.min(dt, 1 / 30) / sub, gy = -9.8 / scale, ground = -P.off[1] + 0.012;
    for (let st = 0; st < sub; st++) {
      for (let i = 0; i < N; i++) {
        const k = i * 3, r = Math.floor(i / NA);
        if (r === 0) { p[k] = q[k] = s.rest[k]; p[k + 1] = q[k + 1] = s.rest[k + 1]; p[k + 2] = q[k + 2] = s.rest[k + 2]; continue; }
        const x = p[k], y = p[k + 1], z = p[k + 2];
        const vlx = (x - q[k]) / h, vly = (y - q[k + 1]) / h, vlz = (z - q[k + 2]) / h, drag = 1.6;
        const fx = -alx + drag * (awx - vlx), fy = gy + drag * (0 - vly) * 0.3, fz = -alz + drag * (awz - vlz) + 0.6 * Math.sin(t * 7 + i);
        p[k] = x + (x - q[k]) * 0.985 + fx * h * h; p[k + 1] = y + (y - q[k + 1]) * 0.985 + fy * h * h; p[k + 2] = z + (z - q[k + 2]) * 0.985 + fz * h * h;
        q[k] = x; q[k + 1] = y; q[k + 2] = z;
      }
      for (let it = 0; it < iters; it++) {
        for (const [i, j, L, k] of links) {
          const a3 = i * 3, b3 = j * 3, dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
          const pinA = i < NA, pinB = j < NA, w = (d - L) / d * k * (pinA || pinB ? 1 : 0.5);
          if (!pinA) { p[a3] += dx * w; p[a3 + 1] += dy * w; p[a3 + 2] += dz * w; }
          if (!pinB) { p[b3] -= dx * w; p[b3 + 1] -= dy * w; p[b3 + 2] -= dz * w; }
        }
        tether(p, s.rest);
        collide(p, P, ground);
      }
      selfCollide(p);
    }
    // Draw it where the body is: instance transform x hip motion.
    rootM.makeRotationFromEuler(e4.set(0, P.rY, P.rZ, 'YXZ'));
    const R0 = new THREE.Vector3(0, 0.95, 0), tr = R0.clone().sub(R0.clone().applyMatrix4(rootM)).add(new THREE.Vector3(...P.off));
    rootM.setPosition(tr);
    q4.setFromEuler(e4.set(0, cand.yaw, 0)); tmp.compose(pv.set(cand.x, cand.y, cand.z), q4, sv.set(a.girth * a.h, a.h, a.girth * a.h));
    s.mesh.matrix.multiplyMatrices(tmp, rootM); s.mesh.matrixWorldNeedsUpdate = true;
    const pos = s.g.attributes.position.array;
    for (let r = 0; r < NR; r++) for (let c = 0; c <= NA; c++) { const i = idx(r, c) * 3, o = (r * (NA + 1) + c) * 3; pos[o] = p[i]; pos[o + 1] = p[i + 1]; pos[o + 2] = p[i + 2]; }
    s.g.attributes.position.needsUpdate = true; s.g.computeVertexNormals();
    s.mesh.visible = true;
  }
  // Fabric stiffness at garment scale: each point may wander from where it hangs at rest, more toward
  // the hem, and is gently drawn back, so a dress keeps its shape but still swings and flares.
  function tether(p, rest) {
    for (let i = NA; i < N; i++) {
      const k = i * 3, row = Math.floor(i / NA) / (NR - 1), maxD = 0.025 + 0.17 * Math.pow(row, 1.4);
      const dx = rest[k] - p[k], dy = rest[k + 1] - p[k + 1], dz = rest[k + 2] - p[k + 2], d = Math.hypot(dx, dy, dz);
      const f = (d > maxD ? 1 - maxD / d : 0) + 0.03;
      p[k] += dx * f; p[k + 1] += dy * f; p[k + 2] += dz * f;
    }
  }
  function collide(p, P, ground) {
    for (let i = NA; i < N; i++) {
      const k = i * 3; let x = p[k], y = p[k + 1], z = p[k + 2];
      if (y > 0.8) { const ex = x / 0.19, ez = (z - 0.015) / 0.135, e = ex * ex + ez * ez; if (e < 1) { const f = 1 / Math.sqrt(e || 1e-6); x *= f; z = 0.015 + (z - 0.015) * f; } }
      for (const leg of P.legs) for (let sgm = 0; sgm < 2; sgm++) {
        const A = leg[sgm], B = leg[sgm + 1], r0 = sgm ? 0.058 : 0.095, r1 = sgm ? 0.045 : 0.06;
        const bx = B[0] - A[0], by = B[1] - A[1], bz = B[2] - A[2], l2 = bx * bx + by * by + bz * bz;
        const tt = Math.max(0, Math.min(1, ((x - A[0]) * bx + (y - A[1]) * by + (z - A[2]) * bz) / l2));
        const cx = A[0] + bx * tt, cy = A[1] + by * tt, cz = A[2] + bz * tt, dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz), rr = r0 + (r1 - r0) * tt + 0.034; // margin covers the gaps between cloth points
        if (d < rr && d > 1e-6) { x = cx + dx / d * rr; y = cy + dy / d * rr; z = cz + dz / d * rr; }
      }
      if (P.sit && Math.abs(x) < 0.3 && z > -0.5 && z < 0.28 && y < 0.855) y = 0.855;
      if (y < ground) y = ground;
      p[k] = x; p[k + 1] = y; p[k + 2] = z;
    }
  }
  const cell = new Map();
  function selfCollide(p) {
    cell.clear();
    const C = 0.035, key = (x, y, z) => ((Math.floor(x / C) + 512) * 1024 + (Math.floor(y / C) + 512)) * 1024 + (Math.floor(z / C) + 512);
    for (let i = NA; i < N; i++) { const k = key(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); let a = cell.get(k); if (!a) cell.set(k, (a = [])); a.push(i); }
    for (const list of cell.values()) for (let u = 0; u < list.length; u++) for (let w = u + 1; w < list.length; w++) {
      const i = list[u], j = list[w], ri = Math.floor(i / NA), rj = Math.floor(j / NA), ci = i % NA, cj = j % NA;
      if (Math.abs(ri - rj) <= 1 && Math.min(Math.abs(ci - cj), NA - Math.abs(ci - cj)) <= 1) continue;
      const a3 = i * 3, b3 = j * 3, dx = p[b3] - p[a3], dy = p[b3 + 1] - p[a3 + 1], dz = p[b3 + 2] - p[a3 + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
      if (d < 0.024) { const f = (0.024 - d) / d * 0.5; p[a3] -= dx * f; p[a3 + 1] -= dy * f; p[a3 + 2] -= dz * f; p[b3] += dx * f; p[b3 + 1] += dy * f; p[b3 + 2] += dz * f; }
    }
  }

  // Each frame: the nearest garments get a simulator, the rest go back to the body's built-in skirt.
  function update(cands, cam, dt, t) {
    if (!(dt > 0)) return;
    cands.sort((a, b) => ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2) - ((b.x - cam.x) ** 2 + (b.z - cam.z) ** 2));
    const chosen = cands.slice(0, MAX), keepSet = new Set(chosen.map((c) => c.a));
    for (const s of pool) if (s.owner && !keepSet.has(s.owner)) { s.owner.clothSim = null; s.owner = null; s.mesh.visible = false; }
    for (const c of chosen) {
      let s = c.a.clothSim;
      if (!s) { s = pool.find((x) => !x.owner); if (!s) continue; assign(s, c); }
      simulate(s, c, dt, t, (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 > 64); // beyond 8 m: fewer, cheaper steps
    }
  }
  return { update };
}
