import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshBuilder, makeRng, col, shade, TAU } from './util.js';
import { normalFrom, SIGN_BEACH } from './textures.js';
import { S } from './city.js';
import { WL, shoreX, sandHeight, buildOcean, buildSand } from './ocean.js';
import { applyWind, uTime } from './wind.js';

const r = makeRng(2024);
const R = (a = 0, b = 1) => a + (b - a) * r();
const PICK = (a) => a[Math.floor(r() * a.length)];
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
const tex = (c, srgb = true, rep = true) => {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};

// ---------- Painted textures: palm trunk rings, fronds, thatch, dune grass ----------
function trunkTex() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#6f6253'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 2600; i++) { g.fillStyle = PICK(['#5a4e42', '#8a7c6a', '#4a4036']); g.globalAlpha = R(0.2, 0.6); g.fillRect(R(0, 128), R(0, 256), R(1, 2), R(3, 10)); }
  g.globalAlpha = 1;
  for (let y = 0; y < 256; y += 32) { g.fillStyle = '#3d342b'; g.fillRect(0, y + R(-2, 2), 128, R(3, 6)); g.fillStyle = 'rgba(160,145,125,0.5)'; g.fillRect(0, y + 7, 128, 4); }
  return { map: tex(c), normalMap: normalFrom(c, 4) };
}
function frondTex() {
  const [c, g] = canvas(256, 512);
  g.lineCap = 'round';
  for (let y = 500; y > 8; y -= 5) {
    const s = 1 - y / 512, len = 122 * Math.sin(Math.PI * Math.pow(Math.min(1, s * 1.05), 0.65)) + 4;
    for (const side of [-1, 1]) {
      const dry = r() < 0.07;
      g.strokeStyle = dry ? PICK(['#9a7a3a', '#7a5a2a']) : PICK(['#2f5a1f', '#3d6a24', '#4f7a2a', '#28501a', '#5e8a30']);
      g.lineWidth = R(2.2, 4);
      g.beginPath(); g.moveTo(128, y); g.quadraticCurveTo(128 + side * len * 0.5, y - 10, 128 + side * len, y - R(18, 34)); g.stroke();
    }
  }
  g.strokeStyle = '#6a6a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(128, 512); g.lineTo(128, 0); g.stroke();
  return tex(c, true, false);
}
function thatchTex() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8a6a3a'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    g.strokeStyle = PICK(['#b08a4a', '#c9a35e', '#6a5030', '#9a7a44', '#d8b878']); g.globalAlpha = R(0.4, 0.9); g.lineWidth = R(1, 2.2);
    const x = R(0, 256), y = R(-20, 256); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-6, 6), y + R(30, 70)); g.stroke();
  }
  g.globalAlpha = 1;
  return { map: tex(c), normalMap: normalFrom(c, 3) };
}
function grassTex() {
  const [c, g] = canvas(128, 128);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = PICK(['#7a8a3a', '#9a9a4a', '#b8a070', '#5f7a2e', '#c2b07a']); g.lineWidth = R(1, 2.4);
    const x = R(20, 108); g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + R(-14, 14), 70, x + R(-40, 40), R(4, 60)); g.stroke();
  }
  return tex(c, true, false);
}

// ---------- Geometry ----------
function palmGeo(Hh, lean) {
  const rings = 16, seg = 8, pos = [], uv = [], idx = [];
  const P = (t) => [lean * Math.pow(t, 1.7) * Hh * 0.22, t * Hh, 0];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, c = P(t), rad = 0.2 * (1 - t) + 0.13 * t + Math.max(0, 0.12 - t) * 1.2;
    for (let k = 0; k <= seg; k++) { const a = (k / seg) * TAU; pos.push(c[0] + Math.cos(a) * rad, c[1], c[2] + Math.sin(a) * rad); uv.push(k / seg, (t * Hh) / 0.5); }
  }
  for (let i = 0; i < rings; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(b, a, c, b, c, d); }
  const trunk = new THREE.BufferGeometry();
  trunk.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); trunk.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  trunk.setIndex(idx); trunk.computeVertexNormals();
  const C = P(1), fp = [], fu = [], fi = [];
  const n = 13;
  for (let f = 0; f < n; f++) {
    const phi = (f / n) * TAU + R(-0.2, 0.2), e0 = R(0.05, 0.85), L = R(3.2, 4.4), Wf = R(0.75, 1.0);
    const h = [Math.cos(phi), 0, Math.sin(phi)], side = [-h[2], 0, h[0]], base = fp.length / 3, N = 10;
    for (let k = 0; k <= N; k++) {
      const s = k / N, w = Wf * Math.sin(Math.PI * Math.pow(Math.max(s, 0.02), 0.6)) * (1 - 0.3 * s);
      const sp = [C[0] + h[0] * L * s * 0.95, C[1] + L * (s * Math.sin(e0) - 0.55 * s * s), C[2] + h[2] * L * s * 0.95];
      for (const [o, u] of [[-1, 0], [0, 0.5], [1, 1]]) { fp.push(sp[0] + side[0] * w * o, sp[1] - Math.abs(o) * w * 0.38, sp[2] + side[2] * w * o); fu.push(u, s); }
      if (k < N) { const a = base + k * 3; fi.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
    }
  }
  const fronds = new THREE.BufferGeometry();
  fronds.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fronds.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
  fronds.setIndex(fi); fronds.computeVertexNormals();
  const fnrm = fronds.attributes.normal; // the frond tips pinch to a point; never leave a zero normal there
  for (let i = 0; i < fnrm.count; i++) if (!(Math.hypot(fnrm.getX(i), fnrm.getY(i), fnrm.getZ(i)) > 1e-5)) fnrm.setXYZ(i, 0, 1, 0);
  const nuts = [];
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; nuts.push(new THREE.IcosahedronGeometry(0.13, 1).translate(C[0] + Math.cos(a) * 0.24, C[1] - 0.28 + R(-0.05, 0.05), C[2] + Math.sin(a) * 0.24)); }
  const clean = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  // Icosahedrons come unindexed, so everything is unindexed before merging.
  return { geo: mergeGeometries([clean(trunk.toNonIndexed()), clean(fronds.toNonIndexed()), clean(mergeGeometries(nuts))], true), crown: C };
}
function chairGeo() {
  const parts = [[0.44, 0.04, 0.42, 0, 0.44, 0], [0.44, 0.46, 0.04, 0, 0.7, -0.21], [0.04, 0.44, 0.04, 0.19, 0.22, 0.18], [0.04, 0.44, 0.04, -0.19, 0.22, 0.18], [0.04, 0.9, 0.04, 0.19, 0.45, -0.2], [0.04, 0.9, 0.04, -0.19, 0.45, -0.2]];
  return mergeGeometries(parts.map(([a, b, c, x, y, z]) => new THREE.BoxGeometry(a, b, c).translate(x, y, z)));
}
function tableGeo() { return mergeGeometries([new THREE.CylinderGeometry(0.42, 0.42, 0.03, 18).translate(0, 0.72, 0), new THREE.CylinderGeometry(0.04, 0.05, 0.72, 8).translate(0, 0.36, 0), new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12).translate(0, 0.01, 0)]); }
function rockGeo() {
  const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.35 * Math.abs(Math.sin(p.getX(i) * 3.1 + p.getY(i) * 5.3 + p.getZ(i) * 2.7)); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
// Painted dugout fishing canoe, 7 m long, with a dark wooden inside.
export function canoe(b, x, y, z, rot, colors) {
  const L = 7, Wc = 0.62, D = 0.5, NU = 16, NV = 8, cs = Math.cos(rot), sn = Math.sin(rot);
  const P = (u, th, k) => {
    const w = Wc * Math.pow(Math.max(0.02, 1 - Math.pow(Math.abs(2 * u - 1), 2.2)), 0.5) * k;
    const lx = Math.sin(th) * w, ly = D * (1 - Math.cos(th) * k) + Math.pow(Math.abs(2 * u - 1), 3) * 0.35, lz = (u - 0.5) * L;
    return [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  };
  for (const [k, inside] of [[1, false], [0.9, true]]) for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const u0 = i / NU, u1 = (i + 1) / NU, t0 = -1.25 + (j / NV) * 2.5, t1 = -1.25 + ((j + 1) / NV) * 2.5;
    const band = Math.abs((t0 + t1) / 2), cc = inside ? col('#4a3020') : col(band > 0.95 ? colors[0] : band > 0.55 ? colors[1] : colors[2]);
    const q = [P(u0, t0, k), P(u1, t0, k), P(u1, t1, k), P(u0, t1, k)];
    const mid = P((u0 + u1) / 2, (t0 + t1) / 2, k), ctr = [x, y + D * 1.4, z];
    const hint = [mid[0] - ctr[0], mid[1] - ctr[1], mid[2] - ctr[2]];
    b.quad(...q, cc, [0, 0, 1, 1], inside ? hint.map((v) => -v) : hint);
  }
}

export function buildBeach(T) {
  const group = new THREE.Group(), occluders = [], obstacles = [], ob = (x, z, r) => obstacles.push({ x, z, r });
  const PZ = S.pathZ;

  // Palms, kept off the footpath and away from the huts
  const huts = [[-80, -133], [-81, -107], [-92, -152], [-93, -86]];
  const palms = [];
  for (let i = 0; i < 400 && palms.length < 52; i++) {
    const x = R(-100, -48), z = R(-345, 75);
    if (Math.abs(z - PZ) < 6 && x > -75) continue;
    if (huts.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 5)) continue;
    if (palms.some((p) => Math.hypot(p.x - x, p.z - z) < 4.5)) continue;
    palms.push({ x, z, ry: R(0, TAU), s: R(0.85, 1.15), v: Math.floor(R(0, 3)) });
  }
  for (const p of palms) ob(p.x, p.z, 0.32);
  const trunkT = trunkTex(), frond = frondTex();
  const sway = (m) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
          #else
            float ph = 0.0;
          #endif
          float bend = uv.y * uv.y;
          transformed.x += sin(uTime * 1.3 + ph + position.z * 0.2) * 0.22 * bend;
          transformed.z += cos(uTime * 1.1 + ph * 1.7 + position.x * 0.2) * 0.16 * bend;
          transformed.y += sin(uTime * 2.0 + ph + position.x) * 0.05 * bend;`);
    };
    return m;
  };
  const palmMats = [
    applyWind(new THREE.MeshStandardMaterial({ map: trunkT.map, normalMap: trunkT.normalMap, roughness: 0.95 }), 'palm'),
    applyWind(new THREE.MeshStandardMaterial({ map: frond, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), 'frond'),
    applyWind(new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.7 }), 'palm'),
  ];
  const variants = [palmGeo(9.5, 1.2), palmGeo(11.5, 0.6), palmGeo(7.5, 1.8)];
  variants.forEach((pv, vi) => {
    const list = palms.filter((p) => p.v === vi);
    const im = new THREE.InstancedMesh(pv.geo, palmMats, Math.max(1, list.length));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), cv = new THREE.Vector3();
    list.forEach((p, i) => {
      const y = sandHeight(p.x, p.z) - 0.1;
      q.setFromEuler(e.set(0, p.ry, 0)); m.compose(p3.set(p.x, y, p.z), q, s3.setScalar(p.s)); im.setMatrixAt(i, m);
      cv.set(...pv.crown).multiplyScalar(p.s).applyQuaternion(q).add(p3);
      occluders.push({ x: cv.x, y: cv.y - 0.6, z: cv.z, r: 3.4 * p.s, k: 0.7 });
      for (let t = 0.15; t < 0.9; t += 0.12) occluders.push({ x: p.x + (cv.x - p.x) * t, y: y + (cv.y - y) * t, z: p.z + (cv.z - p.z) * t, r: 0.32, k: 0.5 });
    });
    im.count = list.length; im.castShadow = true; group.add(im);
  });

  // Beach bars: bamboo posts, thatched roofs, counters, crates, signs and string lights
  const wood = new MeshBuilder(), thatch = new MeshBuilder(), lights = new MeshBuilder(), boards = new MeshBuilder(), cloth = new MeshBuilder(), hulls = new MeshBuilder(), wall = new MeshBuilder();
  const chairs = [], tables = [];
  huts.forEach(([hx, hz], i) => {
    const y = sandHeight(hx, hz), w = 4.2, d = 3.4, ph = 2.5;
    for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) wood.cyl(hx + dx, y - 0.2, hz + dz, 0.07, ph + 0.2, col('#8a6a3a', 1), 7);
    const top = [hx, y + ph + 1.7, hz], E = [[hx - w / 2 - 0.6, hz - d / 2 - 0.6], [hx + w / 2 + 0.6, hz - d / 2 - 0.6], [hx + w / 2 + 0.6, hz + d / 2 + 0.6], [hx - w / 2 - 0.6, hz + d / 2 + 0.6]];
    for (let k = 0; k < 4; k++) {
      const [ax, az] = E[k], [bx, bz] = E[(k + 1) % 4], ey = y + ph - 0.05;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, hint = [mx - hx, 0.8, mz - hz];
      thatch.quad([ax, ey, az], [bx, ey, bz], top, top, W(), [0, 0, 2.2, 1.2], hint);
      thatch.quad([ax, ey - 0.02, az], [bx, ey - 0.02, bz], top, top, shade(W(), 0.55), [0, 0, 2.2, 1.2], hint.map((v, j) => (j === 1 ? -1 : -v)));
      thatch.quad([ax, ey - 0.35, az], [bx, ey - 0.35, bz], [bx, ey, bz], [ax, ey, az], W(), [0, 0, 2.2, 0.3], [mx - hx, 0, mz - hz]);
      for (let q = 0; q <= 8; q++) { const t = q / 8; lights.box(ax + (bx - ax) * t, ey - 0.4, az + (bz - az) * t, 0.05, 0.05, 0.05, PICK([[6, 1, 0.6], [1, 5, 1], [6, 5, 1.2], [1, 2, 6]])); }
    }
    wood.box(hx - w / 2 + 0.5, y, hz, 0.6, 1.1, d - 0.4, col('#7a5a34', 1));
    wood.box(hx - w / 2 + 0.5, y + 1.1, hz, 0.75, 0.06, d - 0.2, col('#5a4026'));
    for (let q = 0; q < 6; q++) wood.box(hx - w / 2 + 0.25 + R(0, 0.5), y + 1.16, hz + R(-1.2, 1.2), 0.08, R(0.22, 0.3), 0.08, col(PICK(['#2a6a2a', '#7a1a12', '#c9a23a', '#3a2a1a'])));
    for (let q = 0; q < 3; q++) wood.box(hx + w / 2 - 0.4, y + q * 0.3, hz + d / 2 - 0.5, 0.45, 0.3, 0.35, col(PICK(['#c62828', '#1565c0', '#f9a825'])));
    boards.plane(hx - w / 2 - 0.05, y + 2.1, hz, 2.4, 0.6, -1, 0, [1, 1, 1], T.signs.uv(SIGN_BEACH + 1 + (i % 2)));
    occluders.push({ x: hx, y: y + ph + 0.6, z: hz, r: 3.0, k: 0.8 });
    for (const [dx, dz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) ob(hx + dx, hz + dz, 0.15);
    for (let cz = -d / 2 + 0.4; cz <= d / 2 - 0.4; cz += 0.55) ob(hx - w / 2 + 0.5, hz + cz, 0.38);
    ob(hx + w / 2 - 0.4, hz + d / 2 - 0.5, 0.35);
    for (let q = 0; q < 3; q++) {
      const tx = hx - R(6, 11), tz = hz + R(-4, 4), ty = sandHeight(tx, tz);
      tables.push({ x: tx, y: ty, z: tz });
      for (let c = 0; c < 3; c++) { const a = R(0, TAU); chairs.push({ x: tx + Math.cos(a) * 0.75, y: sandHeight(tx + Math.cos(a) * 0.75, tz + Math.sin(a) * 0.75), z: tz + Math.sin(a) * 0.75, ry: -a - Math.PI / 2, c: PICK([[0.92, 0.92, 0.9], [0.92, 0.92, 0.9], [0.75, 0.12, 0.1], [0.12, 0.3, 0.7]]) }); }
    }
  });
  function W() { return [1, 1, 1]; }
  for (let i = 0; i < 9; i++) { // beach umbrellas
    const z = R(-230, -20), x = shoreX(z) + R(22, 34), y = sandHeight(x, z), rr = R(1.2, 1.5), [a, b] = PICK([['#d7262e', '#f4f1e8'], ['#1d63b8', '#f2c418'], ['#2e8b3e', '#f4f1e8'], ['#f28c1e', '#2a2a7a']]);
    wood.cyl(x, y - 0.3, z, 0.03, 2.65, col('#ccc'), 5, { caps: false });
    const top = [x, y + 2.55, z];
    for (let k = 0; k < 10; k++) {
      const a0 = (k / 10) * TAU, a1 = ((k + 1) / 10) * TAU, cc = col(k % 2 ? a : b);
      const p0 = [x + Math.cos(a0) * rr, y + 2.15, z + Math.sin(a0) * rr], p1 = [x + Math.cos(a1) * rr, y + 2.15, z + Math.sin(a1) * rr];
      cloth.tri(top, p0, p1, cc, [0, 1, 0]); cloth.tri(top, p1, p0, shade(cc, 0.7), [0, -1, 0]);
    }
    occluders.push({ x, y: y + 2.3, z, r: rr, k: 0.75 }); ob(x, z, 0.15);
    for (let c = 0; c < 2; c++) chairs.push({ x: x + R(-1, 1), y: sandHeight(x, z), z: z + R(-1, 1), ry: R(0, TAU), c: [0.92, 0.92, 0.9] });
  }
  for (let i = 0; i < 6; i++) { // fishing canoes pulled up above the waterline
    const z = R(-280, -10), x = shoreX(z) + R(16, 24);
    const rot = R(-0.3, 0.3) + Math.PI / 2 * (r() < 0.5 ? 1 : 0.9);
    for (const lz of [-3, -1.5, 0, 1.5, 3]) ob(x + lz * Math.sin(rot), z + lz * Math.cos(rot), 0.55);
    canoe(hulls, x, sandHeight(x, z) - 0.12, z, rot, PICK([['#1d4fa0', '#f2c418', '#c0262d'], ['#2e8b3e', '#f4f1e8', '#1d1d1d'], ['#c0262d', '#f4f1e8', '#1d4fa0']]));
  }
  // Rock groynes at both ends of the beach, running into the sea
  const rocks = [];
  for (const gz of [-350, 82]) for (let x = -96; x > -215; x -= R(1.2, 2.0)) for (let k = 0; k < 2; k++) {
    const z = gz + R(-3, 3), s = R(0.9, 2.2), y = Math.max(sandHeight(x, z), WL - 1.5) + s * 0.25;
    rocks.push({ x, y, z, ry: R(0, TAU), s, c: shade([0.36, 0.33, 0.3], R(0.7, 1.1)) });
    occluders.push({ x, y, z, r: s * 0.9, k: 0.9 });
  }
  // Boundary wall behind the beach, open where the path comes through
  for (const [za, zb] of [[-358, PZ - S.pathHalf - 0.2], [PZ + S.pathHalf + 0.2, 88]]) {
    const len = zb - za, zc = (za + zb) / 2;
    wall.box(-41.2, -0.3, zc, 0.24, 1.7, len, [1, 1, 1], { uv: 1.8 });
    for (let z = za; z < zb; z += 3) wall.box(-41.2, -0.3, z, 0.36, 1.85, 0.36, col('#d9d2c4'));
  }
  // Dune grass
  const grass = [];
  for (let i = 0; i < 1400 && grass.length < 900; i++) {
    const x = R(-84, -43), z = R(-355, 85);
    if (Math.abs(z - PZ) < 3 && x > -70) continue;
    if (Math.sin(x * 0.21 + z * 0.13) + Math.sin(z * 0.07 - x * 0.05) < 0.3) continue;
    grass.push({ x, y: sandHeight(x, z) - 0.02, z, ry: R(0, TAU), s: R(0.6, 1.3) });
  }

  // ---------- Materials and meshes ----------
  const th = thatchTex();
  const add = (b, mat, cast = true) => { if (b.empty) return; const m = new THREE.Mesh(b.build(), mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); };
  add(wood, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  add(thatch, new THREE.MeshStandardMaterial({ map: th.map, normalMap: th.normalMap, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  add(lights, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  add(boards, new THREE.MeshStandardMaterial({ map: T.signs.map, alphaTest: 0.5, roughness: 0.6, side: THREE.DoubleSide }));
  add(cloth, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  add(hulls, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  add(wall, new THREE.MeshStandardMaterial({ map: T.blocks.map, normalMap: T.blocks.normalMap, vertexColors: true, roughness: 0.95 }));
  const inst = (geo, mat, list, cast = true) => {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    list.forEach((o, i) => { q.setFromEuler(e.set(0, o.ry || 0, 0)); m.compose(p.set(o.x, o.y, o.z), q, s.setScalar(o.s || 1)); im.setMatrixAt(i, m); if (o.c) im.setColorAt(i, new THREE.Color(...o.c)); });
    im.count = list.length; im.castShadow = cast; im.receiveShadow = true; group.add(im); return im;
  };
  inst(chairGeo(), new THREE.MeshStandardMaterial({ roughness: 0.4 }), chairs);
  inst(tableGeo(), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4 }), tables);
  inst(rockGeo(), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), rocks);
  const gGeo = mergeGeometries([new THREE.PlaneGeometry(0.9, 0.7).translate(0, 0.35, 0), new THREE.PlaneGeometry(0.9, 0.7).translate(0, 0.35, 0).rotateY(Math.PI / 2)]);
  inst(gGeo, applyWind(new THREE.MeshStandardMaterial({ map: grassTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), 'grass'), grass, false);

  // A suya grill smoking beside the first bar
  const [gx, gz] = [huts[0][0] - 3.2, huts[0][1] + 2.4], gy = sandHeight(gx, gz);
  const grillB = new MeshBuilder();
  grillB.cyl(gx, gy, gz, 0.4, 0.75, col('#2a2622'), 12);
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) grillB.box(gx + dx, gy - 0.2, gz + dz, 0.04, 0.3, 0.04, col('#222'));
  add(grillB, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  const coals = new MeshBuilder(); coals.flat(gx - 0.32, gz - 0.32, gx + 0.32, gz + 0.32, gy + 0.76, [5, 1.6, 0.3]);
  add(coals, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false);
  const grill = new THREE.Vector3(gx, gy + 0.8, gz); ob(gx, gz, 0.48);

  for (const t of tables) ob(t.x, t.z, 0.45);
  for (const c of chairs) ob(c.x, c.z, 0.25);
  for (const k of rocks) ob(k.x, k.z, k.s * 0.9);
  group.add(buildSand(occluders, normalFrom));
  const ocean = buildOcean(); group.add(ocean.mesh);

  // Where you can stand: the path from the street, then the beach down to knee-deep water.
  function heightAt(x, z) {
    if (x > -40.5 && x <= -12.2 && Math.abs(z - PZ) < S.pathHalf - 0.3) { const t = (x + 40.5) / 28.3; return sandHeight(-40.5, z) * (1 - t) + 0.05 * t; }
    if (x <= -40.5 && x > -240 && z > -352 && z < 80 && !(x > -42 && Math.abs(z - PZ) > S.pathHalf - 0.3)) {
      const h = sandHeight(x, z);
      return h < WL - 0.75 ? null : h;
    }
    return null;
  }
  function update(t) { uTime.value = t; ocean.uniforms.time.value = t; }
  return { group, heightAt, update, huts: huts.map(([x, z]) => new THREE.Vector3(x, sandHeight(x, z) + 1.5, z)), grill, chairs, obstacles };
}
