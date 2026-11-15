import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { danfoLivery, brtLivery, carLivery, decalAtlas } from './livery.js';

// Vehicles start from side profiles (outline with wheel arches) extruded across the width with rounded
// edges. The body is then bent: the roof leans in (tumblehome), the sides bulge slightly and the
// corners round off in plan, and smooth "creased" normals keep the bevels soft but the edges crisp.
// On top: rubber window seals, see-through tinted glass with seats behind it, lathe-turned tyres and
// rims with wheel nuts, wipers, gutters, door handles, mud flaps, exhausts, plates and windscreen slogans.
// Material slots: 0 paint, 1 glass, 2 black rubber/plastic, 3 metal, 4 coloured parts, 5 decals.
const PAINT = 0, GLASS = 1, TRIM = 2, METAL = 3, CARGO = 4, DECAL = 5;
const V2 = (x, y) => new THREE.Vector2(x, y);
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function prep(geo, color = [1, 1, 1]) {
  if (geo.index) geo = geo.toNonIndexed();
  const n = geo.attributes.position.count;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nr = geo.attributes.normal; // bevels can leave zero-length normals, which turn into NaN pixels
  for (let i = 0; i < n; i++) { const x = nr.getX(i), y = nr.getY(i), z = nr.getZ(i), l = Math.hypot(x, y, z); if (!(l > 1e-6)) nr.setXYZ(i, 0, 1, 0); else nr.setXYZ(i, x / l, y / l, z / l); }
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = new Float32Array(n * 3); for (let i = 0; i < n; i++) c.set(color, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  geo.clearGroups();
  return geo;
}
function deform(geo, s) {
  const p = geo.attributes.position, hw = s.W / 2, hl = s.L / 2;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i); const y = p.getY(i);
    x *= (1 - s.tumble * sm(s.belt, s.H, y)) * (1 + 0.022 * Math.sin(Math.PI * Math.min(1, Math.max(0, (y - 0.3) / (s.belt - 0.3)))));
    z -= Math.sign(z) * sm(hl - 0.8, hl + 0.05, Math.abs(z)) * s.round * Math.min(1, (x / hw) ** 2);
    p.setXYZ(i, x, y, z);
  }
  return geo;
}
function extrude(shape, w, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 7 });
  g.rotateY(Math.PI / 2); g.translate(-(w - 2 * bevel) / 2, 0, 0);
  return g;
}
function sideUV(g, lh, hm) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, Math.abs(n.getX(i)) > 0.55 ? ((p.getZ(i) + lh) / (2 * lh)) * 0.9 : 0.96, p.getY(i) / hm);
}
const shapeOf = (pts) => new THREE.Shape(pts.map(([x, y]) => V2(x, y)));
function rrect(x0, y0, x1, y1, r = 0.06) {
  const s = new THREE.Shape();
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.quadraticCurveTo(x1, y0, x1, y0 + r); s.lineTo(x1, y1 - r);
  s.quadraticCurveTo(x1, y1, x1 - r, y1); s.lineTo(x0 + r, y1); s.quadraticCurveTo(x0, y1, x0, y1 - r); s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function grow(shape, d) { // slightly larger copy of a window, for its rubber seal
  const pts = shape.getPoints(6), c = pts.reduce((a, p) => a.add(p), V2(0, 0)).divideScalar(pts.length);
  const rad = pts.reduce((a, p) => a + p.distanceTo(c), 0) / pts.length, k = 1 + d / rad;
  return new THREE.Shape(pts.map((p) => p.clone().sub(c).multiplyScalar(k).add(c)));
}
function sideGlass(shape, w, side, off) {
  const g = new THREE.ShapeGeometry(shape, 4);
  g.rotateY(Math.PI / 2); g.translate(side * (w / 2 + off), 0, 0);
  return g;
}
// A quad laid along a sloped edge of the profile (windscreens, back windows, slogan bands).
function screen([ax, ay], [bx, by], t0, t1, hw, out, uv) {
  const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy), nx = dy / l, ny = -dx / l;
  const p0 = [ax + dx * t0 + nx * out, ay + dy * t0 + ny * out], p1 = [ax + dx * t1 + nx * out, ay + dy * t1 + ny * out];
  const P = [[-hw, p0[1], -p0[0]], [hw, p0[1], -p0[0]], [hw, p1[1], -p1[0]], [-hw, p1[1], -p1[0]]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]], 3));
  if (uv) { const [u0, v0, u1, v1] = uv, front = nx > 0; const a = front ? [u1, u0] : [u0, u1]; g.setAttribute('uv', new THREE.Float32BufferAttribute([a[0], v0, a[1], v0, a[1], v1, a[0], v0, a[1], v1, a[0], v1], 2)); }
  g.computeVertexNormals();
  return g;
}
const box = (sx, sy, sz, x, y, z) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z);
function plate(x, y, z, facing, uv) {
  const g = new THREE.PlaneGeometry(0.52, 0.13), a = g.attributes.uv, [u0, v0, u1, v1] = uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, u0 + a.getX(i) * (u1 - u0), v0 + a.getY(i) * (v1 - v0));
  if (facing < 0) g.rotateY(Math.PI);
  return g.translate(x, y, z);
}
function wheel(parts, z, r, w, x) {
  for (const sd of [-1, 1]) {
    const tp = [[0.62, -0.5], [0.9, -0.5], [0.98, -0.4], [1, -0.22], [1, 0.22], [0.98, 0.4], [0.9, 0.5], [0.62, 0.5]].map(([a, b]) => V2(a * r, b * w));
    parts[TRIM].push(prep(new THREE.LatheGeometry(tp, 16).rotateZ(Math.PI / 2).translate(sd * x, r, z)));
    const rp = [[0.62, 0.42 * sd], [0.58, -0.05 * sd], [0.3, -0.32 * sd], [0.12, -0.36 * sd], [0.0, -0.36 * sd]].map(([a, b]) => V2(a * r, b * w)); // lathe y becomes -x
    parts[METAL].push(prep(new THREE.LatheGeometry(rp, 12).rotateZ(Math.PI / 2).translate(sd * x, r, z)));
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; parts[METAL].push(prep(box(0.02, 0.025, 0.025, sd * (x + w * 0.38), r + Math.cos(a) * r * 0.17, z + Math.sin(a) * r * 0.17))); }
  }
}

function assemble(spec, decals) {
  const parts = [[], [], [], [], [], []], D = (g) => deform(g, spec);
  for (const b of spec.bodies) {
    let g = D(extrude(b.shape, b.w, b.bevel ?? 0.05));
    g = toCreasedNormals(g, 0.6); sideUV(g, spec.lh, spec.hm);
    parts[PAINT].push(prep(g));
    for (const win of b.windows || []) for (const sd of [-1, 1]) {
      parts[GLASS].push(prep(D(sideGlass(win, b.w, sd, 0.006))));
      parts[TRIM].push(prep(D(sideGlass(grow(win, 0.035), b.w, sd, 0.003))));
    }
  }
  for (const [a, b2, t0, t1, hw, out] of spec.screens) {
    parts[GLASS].push(prep(D(screen(a, b2, t0, t1, hw, out))));
    parts[TRIM].push(prep(D(screen(a, b2, t0 - 0.02, t1 + 0.02, hw + 0.035, out - 0.004))));
  }
  for (const [sx, sy, sz, x, y, z, grp = TRIM, c] of spec.boxes) parts[grp].push(prep(D(box(sx, sy, sz, x, y, z)), c));
  for (const [z, r, w, x] of spec.wheels) wheel(parts, z, r, w, x);
  for (const [x, y, z, f] of spec.plates || []) parts[DECAL].push(prep(D(plate(x, y, z, f, decals.plate(Math.floor(Math.random() * 16))))));
  for (const [a, b2, t0, t1, hw, out, k] of spec.slogans || []) parts[DECAL].push(prep(D(screen(a, b2, t0, t1, hw, out, decals.slogan(k)))));
  for (const g of spec.extra || []) parts[g.grp].push(prep(D(g.geo), g.c));
  const used = [], geos = [];
  parts.forEach((list, i) => { if (list.length) { used.push(i); geos.push(mergeGeometries(list)); } });
  const geo = mergeGeometries(geos);
  geo.clearGroups();
  let start = 0;
  geos.forEach((g, k) => { const n = g.attributes.position.count; geo.addGroup(start, n, used[k]); start += n; });
  geo.computeBoundingSphere();
  return geo;
}

// Interior: bench rows, a dashboard and a steering wheel (left-hand drive, as in Nigeria).
function cabin(spec, rows, seatW, dashZ, wheelZ, y0) {
  const out = [], seat = [0.24, 0.17, 0.14];
  for (const z of rows) {
    out.push([seatW, 0.12, 0.45, 0, y0, z, CARGO, seat], [seatW, 0.5, 0.08, 0, y0 + 0.1, z + 0.22, CARGO, seat]);
  }
  out.push([spec.W - 0.3, 0.22, 0.35, 0, y0 + 0.3, dashZ, TRIM]);
  return out;
}
function steering(spec, z, y0) {
  spec.extra = [{ grp: TRIM, geo: new THREE.TorusGeometry(0.19, 0.025, 6, 16).rotateX(-1.15).translate(-spec.W * 0.24, y0 + 0.55, z) }];
  spec.driver = [-spec.W * 0.24, y0 + 0.06, z + 0.45]; // seat top, behind the wheel
  return spec;
}

// --- Profiles ---------------------------------------------------------------------------
function t3() { // boxy VW-style danfo
  const s = new THREE.Shape();
  s.moveTo(-2.25, 0.34); s.lineTo(-1.88, 0.34); s.absarc(-1.45, 0.34, 0.43, Math.PI, 0, true);
  s.lineTo(1.02, 0.34); s.absarc(1.45, 0.34, 0.43, Math.PI, 0, true);
  s.lineTo(2.2, 0.34); s.quadraticCurveTo(2.28, 0.34, 2.28, 0.44); s.lineTo(2.28, 0.98); s.lineTo(2.18, 1.7);
  s.quadraticCurveTo(2.14, 1.88, 1.95, 1.88); s.lineTo(-2.02, 1.88); s.quadraticCurveTo(-2.25, 1.88, -2.25, 1.66); s.lineTo(-2.25, 0.34);
  const W = 1.86, wy = [1.18, 1.68], ws = [2.28, 0.98], we = [2.18, 1.7], rs = [-2.25, 1.66], re = [-2.25, 0.34];
  const spec = {
    L: 4.66, W, H: 1.95, lh: 2.4, hm: 2.2, belt: 1.15, tumble: 0.07, round: 0.12, door: [W / 2 + 0.14, 0.3, -0.85],
    bodies: [{ shape: s, w: W, windows: [rrect(1.5, wy[0], 1.98, wy[1]), rrect(-2.0, wy[0], -1.05, wy[1]), rrect(-0.95, wy[0], 0.1, wy[1]), rrect(0.2, wy[0], 1.38, wy[1])] }],
    screens: [[ws, we, 0.12, 0.95, W / 2 - 0.1, 0.058], [rs, re, 0.04, 0.36, W / 2 - 0.14, 0.058]],
    slogans: [[ws, we, 0.8, 0.94, W / 2 - 0.16, 0.05, 0], [rs, re, 0.27, 0.35, W / 2 - 0.2, 0.05, 1]],
    plates: [[0, 0.55, -2.395, -1], [0, 0.64, 2.355, 1]],
    wheels: [[-1.45, 0.33, 0.21, W / 2 - 0.15], [1.45, 0.33, 0.21, W / 2 - 0.15]],
    lamps: [[0.62, 0.72, -2.36, 0.19, 0.19, 'head', 'round'], [-0.62, 0.72, -2.36, 0.19, 0.19, 'head', 'round'], [0.8, 0.95, 2.31, 0.12, 0.22, 'tail'], [-0.8, 0.95, 2.31, 0.12, 0.22, 'tail']],
  };
  spec.boxes = [
    [W - 0.04, 0.16, 0.12, 0, 0.4, -2.39], [W - 0.04, 0.16, 0.1, 0, 0.4, 2.35], [1.1, 0.1, 0.02, 0, 0.82, -2.34],
    [W - 0.14, 0.42, 0.86, 0, 0.56, -1.45], [W - 0.14, 0.42, 0.86, 0, 0.56, 1.45],
    [0.05, 0.18, 0.12, 1.02, 1.3, -1.98], [0.05, 0.18, 0.12, -1.02, 1.3, -1.98], [0.16, 0.03, 0.03, 0.95, 1.24, -1.98], [0.16, 0.03, 0.03, -0.95, 1.24, -1.98],
    [0.55, 0.02, 0.025, 0.36, 1.06, -2.33], [0.55, 0.02, 0.025, -0.36, 1.06, -2.33],
    [0.03, 0.03, 4.1, W / 2 - 0.04, 1.86, 0], [0.03, 0.03, 4.1, -W / 2 + 0.04, 1.86, 0],
    [0.24, 0.05, 0.9, W / 2 - 0.1, 0.3, -0.62], [0.32, 0.3, 0.02, 0.72, 0.18, 1.98], [0.32, 0.3, 0.02, -0.72, 0.18, 1.98],
    [0.06, 0.06, 0.32, -0.55, 0.24, 2.3, METAL], [0.03, 0.04, 0.14, W / 2 + 0.01, 1.04, -1.35, METAL], [0.03, 0.04, 0.14, -W / 2 - 0.01, 1.04, -1.35, METAL], [0.03, 0.04, 0.16, W / 2 + 0.01, 1.0, -0.15, METAL],
    [0.24, 0.24, 0.03, 0.62, 0.72, -2.345, METAL], [0.24, 0.24, 0.03, -0.62, 0.72, -2.345, METAL],
    [0.04, 0.04, 3.3, 0.72, 2.0, 0.1], [0.04, 0.04, 3.3, -0.72, 2.0, 0.1], [1.48, 0.04, 0.04, 0, 2.0, -1.3], [1.48, 0.04, 0.04, 0, 2.0, 0], [1.48, 0.04, 0.04, 0, 2.0, 1.3],
    [0.7, 0.34, 0.9, 0.25, 2.18, 0.5, CARGO, [0.18, 0.28, 0.55]], [0.55, 0.26, 0.6, -0.3, 2.14, -0.5, CARGO, [0.82, 0.78, 0.7]], [0.4, 0.3, 0.4, -0.35, 2.16, 1.1, CARGO, [0.08, 0.08, 0.08]],
    ...cabin({ W }, [-0.9, -0.05, 0.8, 1.6], W - 0.4, -1.95, -1.72, 0.55),
  ];
  return steering(spec, -1.72, 0.55);
}

function hiace() { // korope: newer minibus with a sloped nose
  const s = new THREE.Shape();
  s.moveTo(-2.3, 0.36); s.lineTo(-1.95, 0.36); s.absarc(-1.52, 0.36, 0.43, Math.PI, 0, true);
  s.lineTo(1.12, 0.36); s.absarc(1.55, 0.36, 0.43, Math.PI, 0, true);
  s.lineTo(2.25, 0.36); s.quadraticCurveTo(2.36, 0.36, 2.36, 0.5); s.lineTo(2.34, 0.92); s.quadraticCurveTo(2.32, 1.03, 2.22, 1.07);
  s.lineTo(1.72, 1.84); s.quadraticCurveTo(1.6, 1.96, 1.4, 1.96); s.lineTo(-2.08, 1.96); s.quadraticCurveTo(-2.3, 1.96, -2.3, 1.74); s.lineTo(-2.3, 0.36);
  const W = 1.82, wy = [1.2, 1.76], ws = [2.22, 1.07], we = [1.72, 1.84], rs = [-2.3, 1.74], re = [-2.3, 0.36];
  const spec = {
    L: 4.76, W, H: 2.0, lh: 2.45, hm: 2.2, belt: 1.18, tumble: 0.06, round: 0.18, door: [W / 2 + 0.14, 0.32, -0.5],
    bodies: [{ shape: s, w: W, windows: [shapeOf([[1.2, wy[0]], [1.82, wy[0]], [1.55, 1.7], [1.2, 1.7]]), rrect(-2.05, wy[0], -1.1, wy[1]), rrect(-1.0, wy[0], 0.05, wy[1]), rrect(0.15, wy[0], 1.1, wy[1])] }],
    screens: [[ws, we, 0.08, 0.93, W / 2 - 0.1, 0.058], [rs, re, 0.03, 0.4, W / 2 - 0.14, 0.058]],
    slogans: [[ws, we, 0.8, 0.92, W / 2 - 0.16, 0.05, 2], [rs, re, 0.3, 0.39, W / 2 - 0.2, 0.05, 3]],
    plates: [[0, 0.62, -2.435, -1], [0, 0.66, 2.385, 1]],
    wheels: [[-1.55, 0.33, 0.21, W / 2 - 0.15], [1.52, 0.33, 0.21, W / 2 - 0.15]],
    lamps: [[0.68, 0.84, -2.39, 0.28, 0.12, 'head'], [-0.68, 0.84, -2.39, 0.28, 0.12, 'head'], [0.82, 0.95, 2.36, 0.12, 0.28, 'tail'], [-0.82, 0.95, 2.36, 0.12, 0.28, 'tail']],
  };
  spec.boxes = [
    [W, 0.18, 0.14, 0, 0.44, -2.42], [W - 0.04, 0.16, 0.1, 0, 0.42, 2.38], [0.9, 0.12, 0.02, 0, 0.72, -2.41],
    [W - 0.14, 0.42, 0.86, 0, 0.58, -1.55], [W - 0.14, 0.42, 0.86, 0, 0.58, 1.52],
    [0.05, 0.2, 0.12, 1.0, 1.36, -1.6], [0.05, 0.2, 0.12, -1.0, 1.36, -1.6], [0.18, 0.03, 0.03, 0.93, 1.28, -1.6], [0.18, 0.03, 0.03, -0.93, 1.28, -1.6],
    [0.55, 0.02, 0.025, 0.35, 1.12, -2.25], [0.55, 0.02, 0.025, -0.35, 1.12, -2.25],
    [0.03, 0.03, 3.8, W / 2 - 0.04, 1.94, -0.2], [0.03, 0.03, 3.8, -W / 2 + 0.04, 1.94, -0.2],
    [0.32, 0.3, 0.02, 0.72, 0.2, 2.0], [0.32, 0.3, 0.02, -0.72, 0.2, 2.0], [0.06, 0.06, 0.3, -0.55, 0.26, 2.32, METAL],
    [0.03, 0.04, 0.14, W / 2 + 0.01, 1.08, -1.0, METAL], [0.03, 0.04, 0.14, -W / 2 - 0.01, 1.08, -1.0, METAL], [0.03, 0.04, 0.16, W / 2 + 0.01, 1.02, 0.0, METAL],
    [0.04, 0.04, 2.6, 0.7, 2.04, -0.2], [0.04, 0.04, 2.6, -0.7, 2.04, -0.2],
    [0.5, 0.3, 0.7, 0.2, 2.11, 0.3, CARGO, [0.75, 0.2, 0.15]], [0.6, 0.22, 0.5, -0.25, 2.07, -0.6, CARGO, [0.85, 0.83, 0.78]],
    ...cabin({ W }, [-0.85, 0.0, 0.85, 1.65], W - 0.4, -2.0, -1.8, 0.58),
  ];
  return steering(spec, -1.8, 0.58);
}
function brt() {
  const s = new THREE.Shape();
  s.moveTo(-5.95, 0.36); s.lineTo(-3.75, 0.36); s.absarc(-3.2, 0.36, 0.56, Math.PI, 0, true);
  s.lineTo(2.99, 0.36); s.absarc(3.55, 0.36, 0.56, Math.PI, 0, true);
  s.lineTo(5.9, 0.36); s.quadraticCurveTo(6.02, 0.36, 6.02, 0.5); s.lineTo(6.02, 2.85); s.quadraticCurveTo(6.0, 3.1, 5.75, 3.1);
  s.lineTo(-5.75, 3.1); s.quadraticCurveTo(-5.95, 3.1, -5.95, 2.9); s.lineTo(-5.95, 0.36);
  const W = 2.5, wy = [1.42, 2.78], fs = [6.02, 0.5], fe = [6.02, 2.85], rs = [-5.95, 2.9], re = [-5.95, 0.36];
  const panes = [[-5.6, -4.35], [-4.25, -3.0], [-2.9, -1.65], [-1.55, -1.0], [0.4, 1.65], [1.75, 3.0], [3.1, 4.0], [4.25, 5.2]];
  const spec = {
    L: 12.1, W, H: 3.15, lh: 6.15, hm: 3.3, belt: 1.4, tumble: 0.03, round: 0.25, driver: [-0.7, 1.02, -5.1],
    bodies: [{ shape: s, w: W, bevel: 0.07, windows: panes.map(([a, b]) => rrect(a, wy[0], b, wy[1], 0.05)) }],
    screens: [[fs, fe, 0.22, 0.95, W / 2 - 0.12, 0.078], [rs, re, 0.05, 0.38, W / 2 - 0.18, 0.078]],
    plates: [[0, 0.62, -6.11, -1], [0, 0.7, 6.04, 1]],
    wheels: [[-3.55, 0.5, 0.3, W / 2 - 0.2], [3.2, 0.5, 0.3, W / 2 - 0.2]],
    lamps: [[0.95, 0.75, -6.11, 0.32, 0.14, 'head'], [-0.95, 0.75, -6.11, 0.32, 0.14, 'head'], [1.05, 0.95, 6.05, 0.14, 0.35, 'tail'], [-1.05, 0.95, 6.05, 0.14, 0.35, 'tail'], [0, 2.95, -6.11, 1.6, 0.18, 'amber']],
    boxes: [
      [W - 0.02, 0.24, 0.14, 0, 0.46, -6.1], [W - 0.02, 0.24, 0.14, 0, 0.46, 6.03],
      [W - 0.16, 0.6, 1.1, 0, 0.62, -3.55], [W - 0.16, 0.6, 1.1, 0, 0.62, 3.2],
      [0.06, 0.32, 0.16, 1.38, 2.25, -5.9], [0.06, 0.32, 0.16, -1.38, 2.25, -5.9], [0.3, 0.04, 0.04, 1.25, 2.5, -6.0], [0.3, 0.04, 0.04, -1.25, 2.5, -6.0],
      [0.9, 0.02, 0.03, 0.5, 1.0, -6.07], [0.9, 0.02, 0.03, -0.5, 1.0, -6.07],
      [1.6, 0.3, 1.4, 0, 3.25, 2.5, METAL], [0.08, 0.08, 0.4, -0.9, 0.3, 6.0, METAL],
    ],
  };
  for (let z = -4.6; z < 5.2; z += 0.85) if (z < -1.1 || z > 0.3) for (const x of [-0.72, 0.72]) spec.boxes.push([0.9, 0.12, 0.45, x, 0.95, z, CARGO, [0.12, 0.2, 0.4]], [0.9, 0.55, 0.08, x, 1.05, z + 0.22, CARGO, [0.12, 0.2, 0.4]]);
  return spec;
}
function sedan() {
  const lo = new THREE.Shape();
  lo.moveTo(-2.25, 0.34); lo.lineTo(-1.76, 0.34); lo.absarc(-1.4, 0.34, 0.36, Math.PI, 0, true);
  lo.lineTo(0.99, 0.34); lo.absarc(1.35, 0.34, 0.36, Math.PI, 0, true);
  lo.lineTo(2.18, 0.34); lo.quadraticCurveTo(2.3, 0.34, 2.3, 0.5); lo.lineTo(2.26, 0.72); lo.quadraticCurveTo(2.2, 0.82, 2.0, 0.84);
  lo.lineTo(1.0, 0.9); lo.lineTo(-1.45, 0.94); lo.lineTo(-2.12, 0.95); lo.quadraticCurveTo(-2.25, 0.94, -2.27, 0.8); lo.lineTo(-2.25, 0.34);
  const cab = shapeOf([[1.05, 0.86], [0.42, 1.33], [0.15, 1.39], [-0.72, 1.38], [-1.45, 0.92], [-1.45, 0.86]]);
  const W = 1.78, CW = W - 0.26, fs = [1.05, 0.86], fe = [0.42, 1.33];
  const spec = {
    L: 4.6, W, H: 1.42, lh: 2.4, hm: 1.6, car: true, belt: 0.88, tumble: 0.1, round: 0.22,
    bodies: [{ shape: lo, w: W, bevel: 0.06 }, { shape: cab, w: CW, bevel: 0.04, windows: [shapeOf([[0.93, 0.93], [0.43, 1.29], [-0.12, 1.32], [-0.12, 0.93]]), shapeOf([[-0.22, 0.93], [-0.22, 1.32], [-0.68, 1.32], [-1.28, 0.96]])] }],
    screens: [[fs, fe, 0.06, 0.9, CW / 2 - 0.06, 0.048], [[-0.72, 1.38], [-1.45, 0.92], 0.1, 0.88, CW / 2 - 0.08, 0.048]],
    plates: [[0, 0.5, -2.37, -1], [0, 0.62, 2.33, 1]],
    wheels: [[-1.35, 0.31, 0.2, W / 2 - 0.13], [1.4, 0.31, 0.2, W / 2 - 0.13]],
    lamps: [[0.62, 0.68, -2.3, 0.3, 0.1, 'head'], [-0.62, 0.68, -2.3, 0.3, 0.1, 'head'], [0.7, 0.8, 2.28, 0.28, 0.1, 'tail'], [-0.7, 0.8, 2.28, 0.28, 0.1, 'tail']],
  };
  spec.boxes = [
    [W, 0.14, 0.1, 0, 0.42, -2.33], [W, 0.14, 0.1, 0, 0.42, 2.3], [W - 0.18, 0.36, 0.7, 0, 0.5, -1.35], [W - 0.18, 0.36, 0.7, 0, 0.5, 1.4], [0.6, 0.1, 0.02, 0, 0.62, -2.315],
    [0.05, 0.08, 0.14, W / 2 + 0.02, 1.0, -0.9], [0.05, 0.08, 0.14, -W / 2 - 0.02, 1.0, -0.9],
    [0.5, 0.015, 0.02, 0.3, 0.9, -1.02], [0.5, 0.015, 0.02, -0.3, 0.9, -1.02],
    [0.03, 0.03, 0.12, W / 2 + 0.005, 0.8, -0.3, METAL], [0.03, 0.03, 0.12, -W / 2 - 0.005, 0.8, -0.3, METAL], [0.03, 0.03, 0.12, W / 2 + 0.005, 0.8, 0.55, METAL], [0.03, 0.03, 0.12, -W / 2 - 0.005, 0.8, 0.55, METAL],
    [0.06, 0.06, 0.25, -0.55, 0.28, 2.25, METAL],
    ...cabin({ W }, [-0.35, 0.55], W - 0.45, -0.95, -0.7, 0.4),
  ];
  return steering(spec, -0.7, 0.4);
}
function suv() {
  const lo = new THREE.Shape();
  lo.moveTo(-2.32, 0.42); lo.lineTo(-1.85, 0.42); lo.absarc(-1.45, 0.42, 0.4, Math.PI, 0, true);
  lo.lineTo(1.05, 0.42); lo.absarc(1.45, 0.42, 0.4, Math.PI, 0, true);
  lo.lineTo(2.25, 0.42); lo.quadraticCurveTo(2.36, 0.42, 2.36, 0.56); lo.lineTo(2.36, 0.98); lo.quadraticCurveTo(2.32, 1.1, 2.1, 1.1);
  lo.lineTo(1.15, 1.14); lo.lineTo(-2.25, 1.16); lo.quadraticCurveTo(-2.38, 1.12, -2.38, 1.0); lo.lineTo(-2.32, 0.42);
  const cab = shapeOf([[1.18, 1.1], [0.55, 1.7], [0.35, 1.78], [-2.02, 1.78], [-2.22, 1.6], [-2.28, 1.1]]);
  const W = 1.9, CW = W - 0.16;
  const spec = {
    L: 4.8, W, H: 1.8, lh: 2.45, hm: 1.9, car: true, belt: 1.12, tumble: 0.07, round: 0.2,
    bodies: [{ shape: lo, w: W, bevel: 0.06 }, { shape: cab, w: CW, bevel: 0.04, windows: [shapeOf([[1.07, 1.17], [0.57, 1.66], [-0.2, 1.7], [-0.2, 1.17]]), rrect(-1.3, 1.17, -0.3, 1.7, 0.03), shapeOf([[-1.4, 1.17], [-1.4, 1.7], [-2.05, 1.68], [-2.16, 1.22]])] }],
    screens: [[[1.18, 1.1], [0.55, 1.7], 0.06, 0.9, CW / 2 - 0.06, 0.048], [[-2.22, 1.6], [-2.28, 1.1], 0.0, 0.85, CW / 2 - 0.1, 0.048]],
    plates: [[0, 0.62, -2.49, -1], [0, 0.7, 2.47, 1]],
    wheels: [[-1.45, 0.37, 0.24, W / 2 - 0.15], [1.45, 0.37, 0.24, W / 2 - 0.15]],
    lamps: [[0.7, 0.9, -2.4, 0.32, 0.12, 'head'], [-0.7, 0.9, -2.4, 0.32, 0.12, 'head'], [0.82, 1.0, 2.38, 0.12, 0.22, 'tail'], [-0.82, 1.0, 2.38, 0.12, 0.22, 'tail']],
  };
  spec.boxes = [
    [W + 0.02, 0.2, 0.14, 0, 0.5, -2.42], [W, 0.18, 0.12, 0, 0.5, 2.4], [W - 0.16, 0.42, 0.8, 0, 0.6, -1.45], [W - 0.16, 0.42, 0.8, 0, 0.6, 1.45], [1.0, 0.18, 0.02, 0, 0.82, -2.415],
    [0.04, 0.04, 2.2, 0.7, 1.84, -0.4], [0.04, 0.04, 2.2, -0.7, 1.84, -0.4], [W + 0.04, 0.06, 2.6, 0, 0.45, 0],
    [0.05, 0.09, 0.15, W / 2 + 0.02, 1.25, -1.0], [0.05, 0.09, 0.15, -W / 2 - 0.02, 1.25, -1.0],
    [0.03, 0.03, 0.13, W / 2 + 0.005, 1.02, -0.4, METAL], [0.03, 0.03, 0.13, -W / 2 - 0.005, 1.02, -0.4, METAL], [0.03, 0.03, 0.13, W / 2 + 0.005, 1.02, 0.6, METAL], [0.03, 0.03, 0.13, -W / 2 - 0.005, 1.02, 0.6, METAL],
    [0.06, 0.06, 0.25, -0.6, 0.35, 2.4, METAL],
    ...cabin({ W }, [-0.4, 0.6], W - 0.45, -1.0, -0.78, 0.6),
  ];
  return steering(spec, -0.78, 0.6);
}

export function createModels() {
  const decals = decalAtlas();
  const glass = new THREE.MeshStandardMaterial({ color: 0x0c1014, roughness: 0.04, metalness: 0.0, envMapIntensity: 1.8, transparent: true, opacity: 0.62, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x7a7a78, roughness: 0.32, metalness: 0.9, side: THREE.DoubleSide });
  const cargo = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const decal = new THREE.MeshStandardMaterial({ map: decals.map, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  // Paint colour comes from a per-instance attribute that only the paint uses, so glass, rubber,
  // plates and chrome are never tinted by a car's colour.
  const paint = (lv, o = {}) => {
    const m = new THREE.MeshPhysicalMaterial({ map: lv.map, roughnessMap: lv.roughnessMap, roughness: 1, metalness: o.metal ?? 0.05, clearcoat: o.clearcoat ?? 0.35, clearcoatRoughness: o.ccRough ?? 0.45 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aPaint; varying vec3 vPaint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPaint;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vPaint;');
    };
    return m;
  };
  const mats = (p) => [p, glass, trim, metal, cargo, decal];
  const t = t3(), h = hiace(), b = brt(), c = sedan(), u = suv();
  const dArgs = (s, patched, isT) => ({
    lh: s.lh, hm: s.hm, patched,
    stripes: isT ? [[0.95, 1.03], [1.07, 1.11]] : [[0.97, 1.05], [1.09, 1.13]],
    arches: isT ? [s.lh - 1.45, s.lh + 1.45] : [s.lh - 1.55, s.lh + 1.52],
    doors: isT ? [[0.32, 1.12], [1.3, 2.3]] : [[0.62, 1.32], [1.45, 2.5]],
  });
  const tGeo = assemble(t, decals), hGeo = assemble(h, decals);
  return {
    danfo: { ...t, geo: tGeo, mats: mats(paint(danfoLivery(dArgs(t, false, true)))) },
    danfoB: { ...t, geo: tGeo, mats: mats(paint(danfoLivery(dArgs(t, true, true)))) },
    korope: { ...h, geo: hGeo, mats: mats(paint(danfoLivery(dArgs(h, false, false)), { clearcoat: 0.6 })) },
    koropeB: { ...h, geo: hGeo, mats: mats(paint(danfoLivery(dArgs(h, true, false)))) },
    brt: { ...b, geo: assemble(b, decals), mats: mats(paint(brtLivery(), { clearcoat: 0.8, ccRough: 0.25 })) },
    car: { ...c, geo: assemble(c, decals), mats: mats(paint(carLivery({ lh: c.lh, hm: c.hm, doors: [1.15, 2.2, 3.15] }), { metal: 0.55, clearcoat: 1, ccRough: 0.12 })) },
    suv: { ...u, geo: assemble(u, decals), mats: mats(paint(carLivery({ lh: u.lh, hm: u.hm, doors: [1.25, 2.4, 3.4] }), { metal: 0.5, clearcoat: 1, ccRough: 0.12 })) },
  };
}
