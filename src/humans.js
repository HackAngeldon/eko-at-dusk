import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, col } from './util.js';
import { uTime } from './wind.js';
import { SUN } from './atmosphere.js';
import { shadowCard } from './livery.js';

// People. Bodies are lofted from measured cross-sections and posed on the graphics card with a
// 13-bone skeleton whose joints blend smoothly. Close up, heads are sculpted (eye sockets, real
// eyeballs with irises that catch the light, brow ridge, nose, lips, chin) and come alive: people
// blink, talkers move their mouths and raise their brows, some smile. Hands have fingers that curl
// to grip a phone, a tray or a steering wheel. Clothes have physics: every person carries a few
// springs and pendulums driven by how they actually move (starting, stopping, turning, each step,
// the sea breeze), which swing wrapper skirts, dresses and kaftans, bags and braids.
const P_ = { skin: 0, top: 1, bottom: 2, shoe: 3, hair: 4, skirt: 5, cap: 6, gele: 7, tray: 8, bust: 9, upperArm: 10, forearm: 11, thigh: 12, shin: 13, face: 14, puff: 15, braids: 16, wig: 17, hem: 18, sleeve: 19, cuff: 20, bag: 21, phone: 22, sole: 23, eye: 24, finger: 25 };
export const POSE = { walk: 0, stand: 1, sit: 2, drive: 3, hang: 4, carry: 5, wade: 6 };
export const GEST = { none: 0, talk: 1, hips: 2, fold: 3, phone: 4 };
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

function loft(rings, seg, x0 = 0, z0 = 0, o = {}) {
  const pos = [], uv = [], idx = [], n = rings.length, [vy0, vy1] = o.vy || [rings[0][0], rings[n - 1][0]];
  const a0 = o.arc ? o.arc[0] : 0, a1 = o.arc ? o.arc[1] : Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const [y, rx, rz, cz = 0] = rings[i];
    for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * (a1 - a0); pos.push(x0 + rx * Math.sin(a), y, z0 + cz + rz * Math.cos(a)); uv.push(a / (Math.PI * 2), (y - vy0) / (vy1 - vy0)); }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, d, c, b); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const ell = (sx, sy, sz, x, y, z, seg = 10) => new THREE.SphereGeometry(1, seg, Math.max(4, seg - 4)).scale(sx, sy, sz).translate(x, y, z);

// ---------- The head: key cross-sections, a dense version for close-ups, and the sculpted face ----------
const HEAD = [[1.525, 0, 0, -0.068], [1.53, 0.022, 0.022, -0.066], [1.55, 0.05, 0.055, -0.035], [1.58, 0.068, 0.085, -0.012], [1.62, 0.074, 0.098, -0.002], [1.66, 0.078, 0.102, 0.003],
  [1.7, 0.074, 0.1, 0.008], [1.74, 0.058, 0.08, 0.01], [1.765, 0.03, 0.045, 0.012], [1.775, 0, 0, 0.012]];
function headRing(y) {
  for (let i = 0; i < HEAD.length - 1; i++) if (y <= HEAD[i + 1][0]) {
    const [y0, ...a] = HEAD[i], [y1, ...b] = HEAD[i + 1], t = (y - y0) / (y1 - y0);
    return a.map((v, k) => v + (b[k] - v) * t);
  }
  return HEAD[HEAD.length - 1].slice(1);
}
const frontZ = (x, y) => { const [rx, rz, cz] = headRing(y); return cz - rz * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2)); };
// [x, y, half-width, half-height, depth in metres]: sockets go in, brow/nose/lips/cheeks/chin come out.
const FACE = [[0.032, 1.648, 0.017, 0.011, -0.0075], [-0.032, 1.648, 0.017, 0.011, -0.0075], [0.031, 1.669, 0.022, 0.0075, 0.0035], [-0.031, 1.669, 0.022, 0.0075, 0.0035],
  [0, 1.638, 0.007, 0.016, 0.006], [0, 1.611, 0.011, 0.009, 0.017], [0.013, 1.603, 0.007, 0.006, 0.009], [-0.013, 1.603, 0.007, 0.006, 0.009],
  [0.05, 1.628, 0.018, 0.014, 0.004], [-0.05, 1.628, 0.018, 0.014, 0.004], [0, 1.584, 0.02, 0.0055, 0.0065], [0, 1.5715, 0.018, 0.0065, 0.0075],
  [0, 1.578, 0.022, 0.0016, -0.0035], [0, 1.548, 0.016, 0.012, 0.004]];
const EYE_Z = frontZ(0.032, 1.648) + 0.0095, EYE_R = 0.0115;
function sculptedHead(seg) {
  const rings = [];
  for (let y = 1.525; y < 1.776; y += y > 1.535 && y < 1.71 ? 0.005 : 0.012) rings.push([y, ...headRing(y)]);
  rings.push([1.775, 0, 0, 0.012]);
  const g = loft(rings, seg, 0, 0, { vy: [1.525, 1.775] }), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), [, , cz] = headRing(y), front = sm(0.02, -0.04, z - cz);
    if (front <= 0) continue;
    let d = 0; for (const [fx, fy, rx, ry, a] of FACE) d += a * Math.exp(-(((x - fx) / rx) ** 2) - ((y - fy) / ry) ** 2);
    const l = Math.hypot(x, z - cz) || 1;
    p.setXYZ(i, x + (x / l) * d * front, y, z + ((z - cz) / l) * d * front);
  }
  g.computeVertexNormals();
  return g;
}

function tag(g, bone, part, o = {}) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.index) { const n0 = g.attributes.position.count; g.setIndex([...Array(n0).keys()]); }
  const p = g.attributes.position, nr = g.attributes.normal, n = p.count, bps = new Float32Array(n * 3), bw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    bps[i * 3] = typeof bone === 'function' ? bone(y) : bone;
    bps[i * 3 + 1] = typeof part === 'function' ? part(y) : part;
    bps[i * 3 + 2] = o.seg ? (o.seg[0] - y) / o.seg[1] : 0;
    const [b2, w] = o.blend ? o.blend(y) : [0, 0];
    bw[i * 3] = b2; bw[i * 3 + 1] = w; bw[i * 3 + 2] = o.ao ? o.ao(x, y, z, nr.getX(i), nr.getY(i), nr.getZ(i)) : 1;
  }
  g.setAttribute('aHU', g.attributes.uv.clone()); g.setAttribute('aBPS', new THREE.BufferAttribute(bps, 3)); g.setAttribute('aBW', new THREE.BufferAttribute(bw, 3));
  return g;
}

function bodyGeometry(detail) {
  const S = detail ? 18 : 9, L = detail ? 12 : 7, Hd = detail ? 20 : 10, parts = [];
  const add = (g, bone, part, o) => parts.push(tag(g, bone, part, o));
  add(loft([[0.83, 0.1, 0.07, 0.01], [0.88, 0.165, 0.11, 0.015], [0.94, 0.176, 0.122, 0.022], [1.0, 0.158, 0.108, 0.006], [1.06, 0.145, 0.1, 0], [1.14, 0.152, 0.105, -0.005],
    [1.22, 0.17, 0.112, -0.012], [1.3, 0.18, 0.115, -0.01], [1.37, 0.186, 0.1, 0.002], [1.42, 0.17, 0.085, 0.012], [1.455, 0.09, 0.06, 0.012], [1.47, 0, 0, 0.012]], S),
    (y) => (y < 1.0 ? 0 : 1), (y) => (y < 0.985 ? P_.bottom : P_.top),
    { blend: (y) => (Math.abs(y - 1.0) < 0.04 ? [y < 1.0 ? 1 : 0, 0.5 * (1 - Math.abs(y - 1.0) / 0.04)] : [0, 0]), ao: (x, y) => (y < 0.87 ? 0.7 : Math.abs(x) > 0.14 && y > 1.24 && y < 1.38 ? 0.78 : 1) });
  for (const s of [-1, 1]) add(ell(0.058, 0.05, 0.038, s * 0.068, 1.272, -0.082, detail ? 10 : 6), 1, P_.bust, { ao: (x, y) => (y < 1.245 ? 0.82 : 1) });
  add(loft([[0.9, 0.192, 0.137, 0.014], [0.99, 0.168, 0.121, 0.008]], S), 0, P_.hem);
  add(loft([[1.4, 0.062, 0.06, 0.005], [1.47, 0.052, 0.05, 0.008], [1.555, 0.05, 0.05, 0.015]], L), 2, P_.skin,
    { blend: (y) => (y < 1.47 ? [1, 0.55 * sm(1.47, 1.41, y)] : [0, 0]), ao: (x, y, z) => (y > 1.5 && z < 0 ? 0.68 : 1) });
  if (detail) {
    add(sculptedHead(48), 2, P_.face, { ao: (x, y, z) => { const e = Math.min((x - 0.032) ** 2, (x + 0.032) ** 2) / 0.0004 + ((y - 1.648) / 0.014) ** 2; return z < 0 && e < 1 ? 0.72 + 0.28 * e : 1; } });
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(EYE_R, 12, 8).translate(s * 0.032, 1.648, EYE_Z), 2, P_.eye);
  } else {
    add(sculptedHead(22), 2, P_.face); // the same sculpted face at lower resolution, with painted eyes
  }
  for (const s of [-1, 1]) add(ell(0.011, 0.028, 0.019, s * 0.077, 1.635, 0.008, 6), 2, P_.skin);
  add(loft([[1.655, 0.081, 0.107, 0.008], [1.7, 0.079, 0.105, 0.01], [1.74, 0.063, 0.085, 0.012], [1.765, 0.035, 0.05, 0.013], [1.778, 0, 0, 0.013]], Hd), 2, P_.hair);
  add(ell(0.1, 0.08, 0.1, 0, 1.765, 0.035, detail ? 12 : 7), 2, P_.puff);
  add(loft([[1.655, 0.082, 0.108, 0.008], [1.7, 0.08, 0.106, 0.01], [1.74, 0.064, 0.086, 0.012], [1.765, 0.036, 0.051, 0.013], [1.779, 0, 0, 0.013]], Hd), 2, P_.braids);
  for (let k = 0; k < (detail ? 9 : 5); k++) { const x = -0.06 + (k / ((detail ? 9 : 5) - 1)) * 0.12; add(new THREE.CylinderGeometry(0.011, 0.008, 0.36, 5).translate(x * 1.15, 1.5, 0.1 + Math.abs(x) * 0.25), 2, P_.braids); }
  add(loft([[1.56, 0.088, 0.112, 0.022], [1.6, 0.09, 0.117, 0.016], [1.66, 0.089, 0.114, 0.01], [1.72, 0.079, 0.101, 0.01], [1.76, 0.05, 0.07, 0.012], [1.786, 0, 0, 0.012]], Hd, 0, 0, { arc: [Math.PI + 0.72, Math.PI * 3 - 0.72] }), 2, P_.wig);
  add(loft([[1.7, 0.085, 0.111, 0.01], [1.75, 0.081, 0.106, 0.01], [1.785, 0.06, 0.08, 0.01], [1.8, 0, 0, 0.01]], Hd), 2, P_.cap);
  add(loft([[1.64, 0.084, 0.108, 0.012], [1.68, 0.095, 0.118, 0.014], [1.73, 0.103, 0.124, 0.018], [1.775, 0.09, 0.11, 0.02], [1.8, 0.05, 0.065, 0.02], [1.806, 0, 0, 0.02]], Hd), 2, P_.gele);
  add(new THREE.SphereGeometry(1, 10, 6).scale(0.1, 0.075, 0.022).rotateX(-0.5).translate(0, 1.79, 0.075), 2, P_.gele);
  add(new THREE.CylinderGeometry(0.3, 0.27, 0.06, 16).translate(0, 1.83, 0), 2, P_.tray);
  for (let k = 0; k < 6; k++) add(new THREE.SphereGeometry(0.06, 8, 6).translate(Math.cos(k) * 0.15, 1.89, Math.sin(k) * 0.15), 2, P_.tray);
  for (const s of [-1, 1]) {
    const Lf = s < 0, sh = Lf ? 3 : 5, fo = Lf ? 4 : 6, th = Lf ? 7 : 10, sn = Lf ? 8 : 11, ft = Lf ? 9 : 12, ax = s * 0.19, lx = s * 0.095;
    const inner = (x, nx) => s * nx < -0.3;
    add(loft([[1.1, 0.036, 0.038, 0], [1.17, 0.04, 0.043, -0.002], [1.27, 0.046, 0.05, -0.004], [1.36, 0.053, 0.053, 0], [1.425, 0.05, 0.05, 0], [1.45, 0, 0, 0]], L, ax), sh, P_.upperArm,
      { seg: [1.4, 0.3], blend: (y) => (y > 1.36 ? [1, 0.55 * sm(1.36, 1.45, y)] : y < 1.16 ? [fo, 0.5 * sm(1.16, 1.1, y)] : [0, 0]), ao: (x, y, z, nx) => (inner(x, nx) && y > 1.24 ? 0.78 : 1) });
    add(loft([[1.21, 0.059, 0.061, 0], [1.3, 0.057, 0.059, 0], [1.4, 0.059, 0.059, 0], [1.46, 0.03, 0.03, 0]], L, ax), sh, P_.sleeve, { blend: (y) => (y > 1.36 ? [1, 0.55 * sm(1.36, 1.46, y)] : [0, 0]) });
    add(loft([[0.83, 0.022, 0.027, 0], [0.9, 0.026, 0.031, 0], [1.0, 0.034, 0.038, 0], [1.08, 0.036, 0.038, 0], [1.12, 0.035, 0.036, 0], [1.14, 0, 0, 0]], L, ax), fo, P_.forearm,
      { seg: [1.105, 0.27], blend: (y) => (y > 1.08 ? [sh, 0.5 * sm(1.08, 1.14, y)] : [0, 0]) });
    if (detail) { // palm, four fingers and a thumb
      add(loft([[0.742, 0.012, 0.038, -0.002], [0.75, 0.015, 0.041, -0.002], [0.78, 0.017, 0.043, -0.002], [0.81, 0.017, 0.035, 0], [0.835, 0.02, 0.028, 0]], L, ax), fo, P_.skin);
      [[-0.027, 0.07], [-0.009, 0.08], [0.009, 0.076], [0.026, 0.062]].forEach(([fz, len]) =>
        add(loft([[0.745 - len, 0, 0, 0], [0.75 - len, 0.0065, 0.0065, 0], [0.745 - len * 0.5, 0.0078, 0.0078, 0], [0.748, 0.0085, 0.0085, 0]], 6, ax, fz), fo, P_.finger));
      add(new THREE.CylinderGeometry(0.008, 0.0105, 0.055, 6).rotateX(0.4).translate(ax + s * 0.006, 0.775, -0.036), fo, P_.skin);
    } else {
      add(loft([[0.69, 0, 0, -0.004], [0.7, 0.008, 0.018, -0.004], [0.725, 0.013, 0.036, -0.004], [0.77, 0.017, 0.042, -0.002], [0.81, 0.017, 0.034, 0], [0.835, 0.02, 0.028, 0]], L, ax), fo, P_.skin);
    }
    add(new THREE.BoxGeometry(0.009, 0.075, 0.04).translate(ax - s * 0.012, 0.73, -0.03), fo, P_.phone);
    add(loft([[0.48, 0.05, 0.052, 0], [0.56, 0.057, 0.06, -0.004], [0.68, 0.068, 0.074, -0.008], [0.8, 0.079, 0.084, -0.004], [0.9, 0.088, 0.09, 0.004], [0.95, 0.08, 0.085, 0.006], [0.98, 0, 0, 0]], L, lx), th, P_.thigh,
      { seg: [0.93, 0.43], blend: (y) => (y > 0.88 ? [0, 0.5 * sm(0.88, 0.97, y)] : y < 0.56 ? [sn, 0.5 * sm(0.56, 0.48, y)] : [0, 0]), ao: (x, y) => ((x - lx) * s < -0.03 && y > 0.74 ? 0.72 : 1) });
    add(loft([[0.06, 0, 0, 0.003], [0.07, 0.03, 0.03, 0.003], [0.14, 0.034, 0.035, 0.006], [0.25, 0.044, 0.05, 0.014], [0.35, 0.051, 0.058, 0.016], [0.45, 0.048, 0.05, 0.006], [0.53, 0.05, 0.052, 0], [0.55, 0, 0, 0]], L, lx), sn, P_.shin,
      { seg: [0.51, 0.42], blend: (y) => (y > 0.45 ? [th, 0.5 * sm(0.45, 0.53, y)] : y < 0.12 ? [ft, 0.4 * sm(0.12, 0.07, y)] : [0, 0]) });
    add(loft([[0.07, 0.047, 0.049, 0.004], [0.13, 0.045, 0.047, 0.005]], L, lx), sn, P_.cuff);
    add(ell(0.048, 0.042, 0.125, lx, 0.048, -0.05, detail ? 10 : 6), ft, P_.shoe, { blend: (y) => (y > 0.07 ? [sn, 0.3] : [0, 0]) });
    add(new THREE.BoxGeometry(0.1, 0.014, 0.27).translate(lx, 0.007, -0.055), ft, P_.sole);
  }
  add(loft([[0.34, 0.25, 0.2, 0], [0.45, 0.24, 0.19, 0], [0.6, 0.23, 0.18, 0], [0.73, 0.215, 0.165, 0.005], [0.85, 0.2, 0.15, 0.01], [1.0, 0.17, 0.13, 0.01]], detail ? 24 : S), 0, P_.skirt);
  add(new THREE.BoxGeometry(0.24, 0.2, 0.07).translate(0.24, 0.98, 0.03), 0, P_.bag);
  add(new THREE.BoxGeometry(0.03, 0.66, 0.012).rotateZ(-0.62).translate(0.03, 1.2, -0.112), 1, P_.bag);
  return mergeGeometries(parts);
}

// Painted detail for the face: R darkens (brows, lash lines, nostrils, mouth line), G whites of the eyes
// (for distant faces without eyeballs), B tints the lips.
function faceTexture() {
  const N = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.fillStyle = g.strokeStyle = '#fff'; return [c, g]; };
  const X = (u) => u * N, Y = (v) => (1 - v) * N;
  const [rc, r] = mk(), [, gg] = mk(), [, b] = mk();
  for (const ex of [0.25, 0.75]) {
    gg.beginPath(); gg.ellipse(X(ex), Y(0.63), 15, 6.5, 0, 0, 7); gg.fill();
    r.globalAlpha = 1; r.beginPath(); r.arc(X(ex), Y(0.632), 5.5, 0, 7); r.fill();
    r.lineWidth = 3; r.beginPath(); r.ellipse(X(ex), Y(0.628), 16, 7, 0, Math.PI * 1.05, Math.PI * 1.95); r.stroke();
    r.globalAlpha = 0.85; r.lineWidth = 5; r.beginPath(); r.moveTo(X(ex - 0.09), Y(0.745)); r.quadraticCurveTo(X(ex), Y(0.8), X(ex + 0.09), Y(0.75)); r.stroke();
    r.globalAlpha = 0.25; r.beginPath(); r.ellipse(X(ex), Y(0.615), 22, 13, 0, 0, 7); r.fill();
  }
  r.globalAlpha = 0.8; for (const nx of [0.44, 0.56]) { r.beginPath(); r.ellipse(X(nx), Y(0.392), 4, 2.5, 0, 0, 7); r.fill(); }
  r.globalAlpha = 0.3; r.fillRect(X(0.38), Y(0.27), X(0.24), 13);
  r.globalAlpha = 0.9; r.lineWidth = 2.5; r.beginPath(); r.moveTo(X(0.38), Y(0.232)); r.quadraticCurveTo(X(0.5), Y(0.218), X(0.62), Y(0.232)); r.stroke();
  b.beginPath(); b.ellipse(X(0.5), Y(0.235), X(0.13), 9, 0, 0, 7); b.fill();
  const img = r.getImageData(0, 0, N, N), gd = gg.getImageData(0, 0, N, N).data, bd = b.getImageData(0, 0, N, N).data;
  for (let i = 0; i < img.data.length; i += 4) { img.data[i + 1] = gd[i]; img.data[i + 2] = bd[i]; img.data[i + 3] = 255; }
  r.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(rc); t.anisotropy = 4; return t;
}

const f5 = (n) => n.toFixed(5);
const VERT_COMMON = `
  attribute vec3 aBPS; attribute vec3 aBW; attribute vec2 aHU;
  attribute vec4 aSkin; attribute vec4 aTop; attribute vec4 aBot; attribute vec4 aHead; attribute vec4 aAnim; attribute vec4 aCloth;
  uniform float uTime;
  varying vec3 vHSkin; varying vec4 vHTop; varying vec4 vHBot; varying vec4 vHHead; varying float vHPart; varying float vHSeg; varying vec2 vHUv; varying vec3 vHMisc; varying vec3 vHP; varying float vHBlink;
  mat3 hRX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
  mat3 hRY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }
  mat3 hRZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
  mat3 gAnL, gAnR, gKnL, gKnR, gHL, gHR, gShL, gShR, gElL, gElR, gSp, gNk, gRoot; vec3 gOff;
  vec3 hRot(vec3 P, vec3 J, mat3 R, inout vec3 N) { N = R * N; return J + R * (P - J); }
  vec3 hFK(int b, vec3 P, inout vec3 N) {
    if (b == 9)  P = hRot(P, vec3(-0.095, 0.085, 0.), gAnL, N);
    if (b == 12) P = hRot(P, vec3( 0.095, 0.085, 0.), gAnR, N);
    if (b == 8 || b == 9)   P = hRot(P, vec3(-0.095, 0.5, 0.), gKnL, N);
    if (b == 11 || b == 12) P = hRot(P, vec3( 0.095, 0.5, 0.), gKnR, N);
    if (b >= 7 && b <= 9)   P = hRot(P, vec3(-0.095, 0.93, 0.), gHL, N);
    if (b >= 10)            P = hRot(P, vec3( 0.095, 0.93, 0.), gHR, N);
    if (b == 4) P = hRot(P, vec3(-0.19, 1.105, 0.), gElL, N);
    if (b == 6) P = hRot(P, vec3( 0.19, 1.105, 0.), gElR, N);
    if (b == 3 || b == 4) P = hRot(P, vec3(-0.19, 1.4, 0.), gShL, N);
    if (b == 5 || b == 6) P = hRot(P, vec3( 0.19, 1.4, 0.), gShR, N);
    if (b == 2) P = hRot(P, vec3(0., 1.46, 0.), gNk, N);
    if (b >= 1 && b <= 6) P = hRot(P, vec3(0., 1.0, 0.), gSp, N);
    return hRot(P, vec3(0., 0.95, 0.), gRoot, N) + gOff;
  }`;
const VERT_POSE = `
  float pt = aBPS.y; int ipt = int(pt + 0.5);
  float hPat = mod(aTop.w, 2.0), hFem = mod(floor(aTop.w / 2.0), 2.0), hSlv = mod(floor(aTop.w / 4.0), 2.0), hBag = mod(floor(aTop.w / 8.0), 2.0), hHeavy = floor(aTop.w / 16.0);
  float headK = mod(aHead.w, 8.0), hair = floor(aHead.w / 8.0), kind = mod(aBot.w, 10.0), simCloth = step(9.5, aBot.w);
  vHSkin = aSkin.rgb; vHTop = vec4(aTop.rgb, hPat); vHBot = vec4(aBot.rgb, kind); vHHead = vec4(aHead.rgb, hair); vHPart = pt; vHSeg = aBPS.z; vHUv = aHU; vHMisc = vec3(hSlv, aSkin.a, aBW.z); vHP = position;
  float ph = aAnim.x, pose = aAnim.y, gest = aAnim.z, amp = aAnim.w, tt = uTime + aSkin.a * 37.0;
  vHBlink = step(fract(tt * 0.23 + aSkin.a * 3.1), 0.03);
  float hL = 0., hR = 0., kL = -0.05, kR = -0.05, aL = 0., aR = 0., sL = 0.04, sR = 0.04, eL = 0.15, eR = 0.15, zL = -0.09, zR = 0.09, cL = 0.35, cR = 0.35;
  float sp = 0.015 * sin(tt * 1.5), spY = 0., spZ = 0., nk = 0., nkY = 0., rY = 0., rZ = 0.; vec3 off = vec3(0.);
  bool walking = pose < 0.5 || (pose > 4.5 && pose < 5.5);
  if (walking) {
    float s = sin(ph), c = cos(ph);
    hL = amp * s; hR = -amp * s;
    kL = -(0.07 + 1.55 * amp * pow(max(c, 0.), 1.4) + 0.25 * amp * max(-c, 0.) * max(s, 0.));
    kR = -(0.07 + 1.55 * amp * pow(max(-c, 0.), 1.4) + 0.25 * amp * max(c, 0.) * max(-s, 0.));
    aL = -hL * 0.45 - kL * 0.42 + 0.5 * amp * max(-s, 0.) * max(-c, 0.);
    aR = -hR * 0.45 - kR * 0.42 + 0.5 * amp * max(s, 0.) * max(c, 0.);
    sL = -0.85 * amp * sin(ph - 0.15); sR = 0.85 * amp * sin(ph - 0.15);
    eL = 0.2 + 0.55 * amp * max(-sin(ph - 0.5), 0.); eR = 0.2 + 0.55 * amp * max(sin(ph - 0.5), 0.);
    off.y = -0.045 * amp * cos(2.0 * ph) - 0.01; off.x = 0.022 * c * (1.0 + hFem);
    rY = 0.13 * amp * s; rZ = 0.05 * c * (0.6 + hFem); spY = -0.22 * amp * s; spZ = -rZ * 0.6; sp = 0.05; nk = -0.03; nkY = 0.12 * sin(tt * 0.27);
    cL = 0.3; cR = 0.3;
    if (pose > 4.5) { sR = 2.75; zR = 0.32; eR = 2.15; spZ = -0.03; cR = 0.9; }
    if (gest > 3.5) { sR = 0.55; zR = 0.12; eR = 1.95; nk = 0.32; cR = 1.0; }
  } else if (pose < 1.5) {
    float w = sin(tt * 0.45);
    rZ = 0.025 * w; off.x = 0.022 * w; kL = -0.05 - 0.07 * max(w, 0.); kR = -0.05 - 0.07 * max(-w, 0.); hL = 0.03 * max(w, 0.); hR = 0.03 * max(-w, 0.);
    nkY = 0.45 * sin(tt * 0.17) * sin(tt * 0.05 + 1.0); nk = 0.05 * sin(tt * 0.37);
    if (gest > 0.5 && gest < 1.5) { eR = 0.9 + 0.45 * sin(tt * 2.6); sR = 0.35 + 0.18 * sin(tt * 1.7); eL = 0.5 + 0.2 * sin(tt * 1.3); sL = 0.2; nkY = 0.25 * sin(tt * 0.6); cR = 0.15 + 0.3 * sin(tt * 1.9); }
    if (gest > 1.5 && gest < 2.5) { zL = -0.42; zR = 0.42; eL = 1.75; eR = 1.75; sL = -0.18; sR = -0.18; cL = 0.6; cR = 0.6; }
    if (gest > 2.5 && gest < 3.5) { sL = 0.55; sR = 0.55; eL = 1.7; eR = 1.7; zL = 0.25; zR = -0.25; cL = 0.9; cR = 0.9; }
    if (gest > 3.5) { sR = 0.55; zR = 0.12; eR = 1.95; nk = 0.35; nkY = 0.0; cR = 1.0; }
  } else if (pose < 2.5) {
    hL = 1.5; hR = 1.45; kL = -1.45; kR = -1.5; sp = -0.1 + 0.012 * sin(tt * 1.5); sL = 0.45; sR = 0.4; eL = 0.65; eR = 0.7; off.y = -0.42; nkY = 0.4 * sin(tt * 0.19); cL = 0.5; cR = 0.5;
    if (gest > 0.5 && gest < 3.5) { eR = 1.5 + 0.3 * sin(tt * 1.1); sR = 0.55 + 0.25 * sin(tt * 0.9); cR = 1.0; }
    if (gest > 3.5) { sR = 0.6; eR = 1.9; nk = 0.35; nkY = 0.0; cR = 1.0; }
  } else if (pose < 3.5) {
    hL = 1.45; hR = 1.45; kL = -1.3; kR = -1.3; sp = -0.14; sL = 1.0; sR = 1.0; eL = 0.55; eR = 0.55; zL = -0.12; zR = 0.12; off.y = -0.42; nkY = 0.2 * sin(tt * 0.25); cL = 1.15; cR = 1.15;
  } else if (pose < 4.5) {
    sR = 2.9; zR = 0.22; eR = 0.25; rZ = -0.12; spZ = -0.05; sL = 0.6 + 0.45 * sin(tt * 2.3); eL = 1.0 + 0.3 * sin(tt * 2.3); nkY = -0.6; kL = -0.25; hL = 0.15; cR = 1.25; cL = 0.2;
  } else {
    zL = -0.45; zR = 0.45; eL = 0.5; eR = 0.5; sL = 0.2; sR = 0.2; rZ = 0.04 * sin(tt * 0.8); off.x = 0.03 * sin(tt * 0.8); nkY = 0.3 * sin(tt * 0.2); cL = 0.15; cR = 0.15;
  }
  gAnL = hRX(aL); gAnR = hRX(aR); gKnL = hRX(kL); gKnR = hRX(kR); gHL = hRX(hL) * hRZ(-0.02); gHR = hRX(hR) * hRZ(0.02);
  gShL = hRZ(zL) * hRX(sL); gShR = hRZ(zR) * hRX(sR); gElL = hRX(eL); gElR = hRX(eR);
  gSp = hRY(spY) * hRX(sp) * hRZ(spZ); gNk = hRY(nkY) * hRX(nk); gRoot = hRY(rY) * hRZ(rZ); gOff = off;
  vec3 P0 = position, N0 = normal;
  if (ipt <= 2 || ipt == 9 || ipt == 18) {
    float y = P0.y;
    P0.x *= 1.0 + hFem * (0.11 * exp(-pow((y - 0.93) / 0.07, 2.0)) - 0.07 * exp(-pow((y - 1.07) / 0.05, 2.0)) - 0.07 * exp(-pow((y - 1.4) / 0.05, 2.0))) + hHeavy * 0.07 * exp(-pow((y - 1.08) / 0.12, 2.0));
    P0.z -= hHeavy * 0.055 * exp(-pow((y - 1.08) / 0.09, 2.0)) * smoothstep(0.02, -0.07, P0.z);
  }
  if (ipt == 14 && P0.z < 0.0) { // talking mouth, smiles, raised brows
    float talk = (gest > 0.5 && gest < 1.5 && pose > 0.5 && pose < 2.5) ? 1.0 : 0.0;
    float open = talk * 0.0055 * max(0.0, sin(tt * 11.0)) * (0.6 + 0.4 * sin(tt * 2.3)), mx = exp(-pow(P0.x / 0.028, 2.0));
    P0.y -= open * mx * smoothstep(1.579, 1.57, P0.y) * smoothstep(1.535, 1.56, P0.y);
    float smile = step(0.55, fract(aSkin.a * 5.7)) * (0.5 + 0.5 * sin(tt * 0.3));
    float cx = exp(-pow((abs(P0.x) - 0.022) / 0.008, 2.0) - pow((P0.y - 1.578) / 0.006, 2.0));
    P0.y += smile * 0.0022 * cx; P0.x += sign(P0.x) * smile * 0.0012 * cx;
    P0.y += talk * max(0.0, sin(tt * 1.7)) * 0.0022 * exp(-pow((abs(P0.x) - 0.031) / 0.02, 2.0) - pow((P0.y - 1.669) / 0.008, 2.0));
  }
  if (ipt == 25) { // fingers curl toward the palm
    float side = sign(P0.x); vec3 piv = vec3(side * 0.19, 0.745, P0.z);
    float f = clamp((0.745 - P0.y) / 0.075, 0.0, 1.0); mat3 Rf = hRZ(-side * (side < 0.0 ? cL : cR) * 1.6 * f);
    P0 = piv + Rf * (P0 - piv); N0 = Rf * N0;
  }
  if (ipt == 5) { // wrapper/dress: the legs push the fabric, it swings with the body and ripples at the hem
    float h = smoothstep(0.98, 0.34, P0.y), front = smoothstep(0.05, -0.12, P0.z);
    float hip = mix(hR, hL, smoothstep(0.06, -0.06, P0.x));
    P0.z -= hip * (0.1 + 0.12 * front) * h; P0.y += abs(hip) * 0.05 * h * front;
    P0.x += aCloth.x * 0.16 * pow(h, 1.5); P0.z += aCloth.y * 0.16 * pow(h, 1.5);
    float an = atan(P0.x, P0.z); P0.xz += normalize(P0.xz + vec2(1e-4)) * 0.012 * sin(an * 6.0 + ph * 2.0 + aSkin.a * 9.0) * h * h;
  }
  if (ipt == 18) { float h = smoothstep(0.99, 0.9, P0.y); P0.x += aCloth.x * 0.04 * h; P0.z += aCloth.y * 0.04 * h; }
  if (ipt == 21 && aBPS.x < 0.5) { vec3 piv = vec3(0.24, 1.08, 0.03); mat3 Rb = hRX(aCloth.z) * hRZ(aCloth.x * 0.6); P0 = piv + Rb * (P0 - piv); N0 = Rb * N0; }
  if (ipt == 16 && P0.y < 1.68) { vec3 piv = vec3(0.0, 1.68, 0.1); mat3 Rh = hRX(aCloth.w) * hRZ(aCloth.x * 1.2); P0 = piv + Rh * (P0 - piv); N0 = Rh * N0; }
  int b = int(aBPS.x + 0.5), b2 = int(aBW.x + 0.5);
  vec3 N = N0, N2 = N0;
  vec3 P = hFK(b, P0, N);
  if (aBW.y > 0.001) { vec3 Pb = hFK(b2, P0, N2); P = mix(P, Pb, aBW.y); N = normalize(mix(N, N2, aBW.y)); }
  bool hidden =
    (ipt == 4 && (hair > 0.5 || abs(headK - 2.) < 0.5)) || (ipt == 15 && (abs(hair - 1.) > 0.5 || headK > 0.5)) ||
    (ipt == 16 && (abs(hair - 2.) > 0.5 || abs(headK - 2.) < 0.5)) || (ipt == 17 && (abs(hair - 3.) > 0.5 || headK > 0.5)) ||
    (ipt == 6 && abs(headK - 1.) > 0.5) || (ipt == 7 && abs(headK - 2.) > 0.5) || (ipt == 8 && abs(headK - 3.) > 0.5) ||
    (ipt == 5 && (kind < 1.5 || simCloth > 0.5)) || (ipt == 9 && hFem < 0.5) || (ipt == 18 && kind > 2.5) || (ipt == 19 && (hSlv > 0.5 || kind > 2.5)) ||
    (ipt == 20 && kind > 0.5) || (ipt == 21 && hBag < 0.5) || (ipt == 22 && gest < 3.5);
  if (hidden) P = vec3(0., 1.1, 0.);
  vec3 objectNormal = N;
  #ifdef USE_TANGENT
    vec3 objectTangent = vec3(tangent.xyz);
  #endif`;
export const ANKARA_GLSL = `
  vec3 ankara(vec3 base, vec2 uv, float seed) {
    vec3 alt = mix(vec3(0.95, 0.75, 0.15), base.gbr, step(0.5, fract(seed * 13.0)));
    float kind = floor(fract(seed * 7.31) * 4.0);
    vec2 q = fract(vec2(uv.x * 16.0, uv.y * 22.0)) - 0.5; float d = length(q);
    if (kind < 0.5) { vec3 c = mix(base, alt, step(d, 0.26)); c = mix(c, base * 0.25, step(abs(d - 0.36), 0.045)); return mix(c, vec3(0.95), step(d, 0.08)); }
    if (kind < 1.5) { float dm = abs(q.x) + abs(q.y); vec3 c = mix(base, alt, step(dm, 0.32)); return mix(c, base * 0.2, step(abs(dm - 0.4), 0.04)); }
    if (kind < 2.5) { float w = sin(uv.y * 90.0 + sin(uv.x * 40.0) * 2.0); return mix(base, alt, step(0.4, w)) * (1.0 - 0.6 * step(0.92, w)); }
    float pet = abs(sin(atan(q.y, q.x) * 3.0)) * 0.22 + 0.12; vec3 c = mix(base, alt, step(d, pet)); return mix(c, vec3(0.08), step(d, 0.06));
  }`;
const FRAG_COMMON = `
  uniform sampler2D faceMap;
  varying vec3 vHSkin; varying vec4 vHTop; varying vec4 vHBot; varying vec4 vHHead; varying float vHPart; varying float vHSeg; varying vec2 vHUv; varying vec3 vHMisc; varying vec3 vHP; varying float vHBlink;
  vec3 ankaraOld(vec3 base, vec2 uv, float seed) {
    vec3 alt = mix(vec3(0.95, 0.75, 0.15), base.gbr, step(0.5, fract(seed * 13.0)));
    float kind = floor(fract(seed * 7.31) * 4.0);
    vec2 q = fract(vec2(uv.x * 16.0, uv.y * 22.0)) - 0.5; float d = length(q);
    if (kind < 0.5) { vec3 c = mix(base, alt, step(d, 0.26)); c = mix(c, base * 0.25, step(abs(d - 0.36), 0.045)); return mix(c, vec3(0.95), step(d, 0.08)); }
    if (kind < 1.5) { float dm = abs(q.x) + abs(q.y); vec3 c = mix(base, alt, step(dm, 0.32)); return mix(c, base * 0.2, step(abs(dm - 0.4), 0.04)); }
    if (kind < 2.5) { float w = sin(uv.y * 90.0 + sin(uv.x * 40.0) * 2.0); return mix(base, alt, step(0.4, w)) * (1.0 - 0.6 * step(0.92, w)); }
    float pet = abs(sin(atan(q.y, q.x) * 3.0)) * 0.22 + 0.12; vec3 c = mix(base, alt, step(d, pet)); return mix(c, vec3(0.08), step(d, 0.06));
  }`;
const FRAG_COLOR = `
  int hp = int(vHPart + 0.5); vec3 hc = vHSkin; float hRough = hp == 14 ? 0.36 : 0.44, sleeve = vHMisc.x, seed = vHMisc.y; bool cloth = false, skin = true, hairB = false;
  vec3 topC = vHTop.a > 0.5 ? ankara(vHTop.rgb, vHUv, seed) : vHTop.rgb;
  vec3 botC = vHBot.w > 1.5 ? ankara(vHBot.rgb, vHUv, seed + 0.3) : vHBot.rgb;
  if (hp == 1 || hp == 9 || hp == 18 || hp == 19) { hc = topC; cloth = true; }
  else if (hp == 2) { hc = vHBot.w > 2.5 ? topC : botC; cloth = true; }
  else if (hp == 10) { if (sleeve > 0.5 || vHSeg < 0.45) { hc = topC; cloth = true; } }
  else if (hp == 11) { if (sleeve > 0.5) { hc = topC; cloth = true; } }
  else if (hp == 12) { if (vHBot.w < 1.5) { hc = botC; cloth = true; } }
  else if (hp == 13 || hp == 20) { if (vHBot.w < 0.5) { hc = botC; cloth = true; } }
  else if (hp == 3) { hc = mix(vec3(0.03), vec3(0.3, 0.17, 0.08), step(0.5, fract(seed * 7.0))); hRough = 0.5; skin = false; }
  else if (hp == 23) { hc = vec3(0.04); hRough = 0.8; skin = false; }
  else if (hp == 4 || hp == 15 || hp == 16 || hp == 17) { hc = hp == 17 ? mix(vec3(0.03, 0.02, 0.015), vec3(0.18, 0.06, 0.04), step(0.6, fract(seed * 3.0))) : vec3(0.025, 0.02, 0.017); hRough = hp == 16 || hp == 17 ? 0.45 : 0.85; skin = false; hairB = true;
    hc *= 0.72 + 0.28 * fract(sin(dot(floor(vHP.xy * vec2(420.0, 160.0) + vHP.z * 90.0), vec2(12.9898, 78.233))) * 43758.5); // coils and strands
    if (hp == 16) hc *= 0.7 + 0.3 * step(0.5, fract(vHUv.x * 24.0)); }
  else if (hp == 5) { hc = vHBot.w > 2.5 ? topC : ankara(vHBot.rgb, vHUv, seed + 0.3); cloth = true; }
  else if (hp == 6) { hc = vHHead.rgb; cloth = true; }
  else if (hp == 7) { hc = ankara(vHHead.rgb, vHUv * 0.7, seed + 0.6); cloth = true; hRough = 0.6; }
  else if (hp == 8) { hc = vec3(0.9, 0.5, 0.12); hRough = 0.45; skin = false; }
  else if (hp == 21) { hc = mix(vec3(0.12, 0.07, 0.04), vec3(0.04), step(0.5, fract(seed * 5.0))); hRough = 0.5; skin = false; }
  else if (hp == 22) { hc = vec3(0.02); hRough = 0.2; skin = false; }
  else if (hp == 24) { // eyeball: white, brown iris, black pupil, wet highlight; the lid closes when blinking
    vec3 d = (vHP - vec3(sign(vHP.x) * 0.032, 1.648, ${f5(EYE_Z)})) / ${f5(EYE_R)};
    float fr = -d.z; hc = vec3(0.7, 0.66, 0.62); hRough = 0.08; skin = false;
    if (fr > 0.74) hc = vec3(0.12, 0.07, 0.035);
    if (fr > 0.93) hc = vec3(0.01);
    if (d.y > 0.4 || d.y < -0.62 || vHBlink > 0.5) { hc = vHSkin * 0.82; hRough = 0.45; } // upper and lower lids: an almond-shaped eye
  }
  else if (hp == 14) {
    vec2 fuv = vec2((vHUv.x - 0.36) / 0.28, (vHUv.y - 0.05) / 0.7);
    if (fuv.x > 0.0 && fuv.x < 1.0 && fuv.y > 0.0 && fuv.y < 1.0) {
      vec3 f = texture2D(faceMap, fuv).rgb;
      hc *= 1.0 - 0.72 * f.r; hc = mix(hc, vec3(0.8, 0.76, 0.72), f.g * (1.0 - f.r) * 0.6); hc = mix(hc, hc * vec3(0.78, 0.58, 0.58), f.b * 0.6);
    }
  }
  if (cloth) { hRough = 0.9; skin = false; }
  hc *= vHMisc.z;
  diffuseColor.rgb = hc;`;

export function createHumans(scene, cap = 900) {
  const faceMap = faceTexture();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime; sh.uniforms.faceMap = { value: faceMap };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_COMMON)
      .replace('#include <beginnormal_vertex>', VERT_POSE).replace('#include <begin_vertex>', 'vec3 transformed = P;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_COMMON + ANKARA_GLSL)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + FRAG_COLOR)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = hRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (cloth) { vec3 q = vHP * 34.0; normal = normalize(normal + 0.13 * vec3(sin(q.y * 1.3 + sin(q.x * 2.1) * 1.5), 0.6 * sin(q.x * 1.7 + q.z), cos(q.y * 0.9 + q.z * 1.4))); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 sunV = normalize((viewMatrix * vec4(${f5(SUN.x)}, ${f5(SUN.y)}, ${f5(SUN.z)}, 0.0)).xyz), toCam = normalize(vViewPosition);
        float ndl = dot(normal, sunV), facing = abs(dot(normal, toCam));
        if (skin) { // light scattering under the skin: soft terminator, warm rim, glow at the edges when backlit
          float wrap = max(0.0, (ndl + 0.5) / 1.5) - max(0.0, ndl), rim = pow(1.0 - facing, 3.0), back = pow(max(dot(-toCam, sunV), 0.0), 5.0);
          totalEmissiveRadiance += hc * (vec3(1.0, 0.42, 0.28) * (wrap * 0.7 + rim * 0.28) + vec3(1.0, 0.32, 0.18) * back * rim * 1.6);
        }
        if (cloth) totalEmissiveRadiance += hc * pow(1.0 - facing, 2.0) * 0.2; // fabric fuzz catches light at grazing angles
        if (hairB) totalEmissiveRadiance += vec3(0.09, 0.075, 0.06) * pow(max(0.0, 1.0 - abs(facing - 0.35) * 3.0), 4.0) * (hRough < 0.5 ? 1.0 : 0.35);`);
  };
  mat.customProgramCacheKey = () => 'humans-v3';
  const names = ['aSkin', 'aTop', 'aBot', 'aHead', 'aAnim', 'aCloth'];
  const lods = [bodyGeometry(true), bodyGeometry(false)].map((geo) => {
    const A = {};
    for (const n of names) { A[n] = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); A[n].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(n, A[n]); }
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false; mesh.count = 0; mesh.receiveShadow = true; scene.add(mesh);
    return { mesh, A, n: 0 };
  });

  const SHZ = -SUN.z / SUN.y, SHX = -SUN.x / SUN.y;
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5),
    new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadowCard(), transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), cap);
  shadows.frustumCulled = false; shadows.count = 0; shadows.renderOrder = 1; scene.add(shadows);

  const r = makeRng(4321), R = (a = 0, b = 1) => a + (b - a) * r(), PICK = (a) => a[Math.floor(r() * a.length)];
  const SKIN = ['#3a2217', '#4a2c1e', '#5a3824', '#6b4430', '#2e1b13', '#7a5038', '#55331f', '#3f2519'];
  const CLOTH = ['#d32f2f', '#f9a825', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#f5f5f2', '#00897b', '#c2185b', '#283593', '#4e342e', '#9e9d24', '#151515', '#e0e0e0', '#8d6e63', '#ffb300', '#ece3cf', '#7b1f2b'];
  const TROUSER = ['#1b1b20', '#26324a', '#4a4232', '#2e2e2e', '#6d5a42', '#1f3550', '#3a3f45', '#2b4a6e'];
  function appearance(o = {}) {
    const female = o.female ?? r() < 0.48, kid = !!o.kid;
    let kind;
    if (female) kind = r() < (o.beach ? 0.3 : 0.42) ? 2 : r() < 0.25 ? 3 : r() < 0.2 ? 1 : 0;
    else kind = r() < (o.beach ? 0.55 : 0.15) ? 1 : r() < 0.13 ? 3 : 0;
    const headKind = o.tray ? 3 : female ? (r() < (o.beach ? 0.08 : 0.26) ? 2 : 0) : r() < 0.18 ? 1 : 0;
    const hair = female ? PICK([1, 2, 2, 3, 3, 0]) : 0;
    const flags = (r() < 0.35 ? 1 : 0) + (female && !kid ? 2 : 0) + (kind === 3 || r() < 0.25 ? 4 : 0) + (!kid && r() < 0.18 ? 8 : 0) + (!kid && r() < 0.2 ? 16 : 0);
    return {
      h: kid ? R(0.55, 0.72) : female ? R(0.92, 1.01) : R(0.96, 1.09), girth: kid ? 0.92 : R(0.92, 1.12),
      skin: [...col(PICK(SKIN)), r()], top: [...col(PICK(CLOTH)), flags],
      bot: [...col(kind === 2 ? PICK(CLOTH) : PICK(TROUSER)), kind], head: [...col(PICK(CLOTH)), headKind + 8 * hair],
      stride: kind >= 2 ? R(0.24, 0.3) : R(0.32, 0.42), phone: !kid && r() < 0.12,
    };
  }

  // ---------- Cloth physics: springs and pendulums per person, driven by real motion ----------
  let cam = null, T = 0, DT = 1 / 60;
  const gust = (x, t) => (x < -40 ? 1 : 0.3) * (0.55 + 0.35 * Math.sin(t * 0.31 - x * 0.025) * Math.sin(t * 0.11 + 1) + 0.18 * Math.sin(t * 1.3 - x * 0.08));
  function cloth(a, x, z, yaw, walking, phase) {
    const s = a.phys || (a.phys = { x, z, vx: 0, vz: 0, sx: 0, sz: 0, svx: 0, svz: 0, b: 0, bv: 0, hw: 0, hv: 0, t: -1 });
    const dt = Math.min(DT, 1 / 30);
    if (T - s.t > 0.25 || dt <= 0) { s.x = x; s.z = z; s.vx = s.vz = 0; }
    const vx = (x - s.x) / dt, vz = (z - s.z) / dt, ax = Math.max(-20, Math.min(20, (vx - s.vx) / dt)), az = Math.max(-20, Math.min(20, (vz - s.vz) / dt));
    s.x = x; s.z = z; s.vx = vx; s.vz = vz; s.t = T;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const alx = ax * cs - az * sn, alz = ax * sn + az * cs, speed = Math.hypot(vx, vz);
    const w = gust(x, T), wlx = w * cs, wlz = w * sn;
    const fx = walking ? 1.1 * Math.cos(phase) : 0, fz = walking ? 0.6 * Math.sin(2 * phase) : 0;
    s.svx += (-38 * s.sx - 5 * s.svx - alx * 0.12 + fx + wlx * 0.7) * dt; s.sx += s.svx * dt;
    s.svz += (-38 * s.sz - 5 * s.svz - alz * 0.12 + fz + wlz * 0.7 + speed * 0.9) * dt; s.sz += s.svz * dt;
    s.bv += (-39 * Math.sin(s.b) - 2.5 * s.bv + alz * 3 + fz * 5) * dt; s.b += s.bv * dt;
    s.hv += (-30 * Math.sin(s.hw) - 2 * s.hv + alz * 2.5 + fz * 4 + speed * 2) * dt; s.hw += s.hv * dt;
    const c = (v, m) => Math.max(-m, Math.min(m, v));
    s.sx = c(s.sx, 0.5); s.sz = c(s.sz, 0.5); s.b = c(s.b, 0.9); s.hw = c(s.hw, 0.8);
    return [s.sx, s.sz, s.b, s.hw];
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const cands = [];
  function beginFrame(c, t = T, dt = DT) { cam = c || null; T = t; DT = dt; lods[0].n = 0; lods[1].n = 0; shadows.count = 0; cands.length = 0; }
  function draw(a, x, y, z, yaw, pose, phase = 0, gest = 0, shadow = true) {
    const d2 = cam ? (x - cam.x) ** 2 + (z - cam.z) ** 2 : 0, near = d2 < 40 * 40, L = lods[near ? 0 : 1];
    // Skirts, wrappers, dresses and kaftans close to you get real cloth (see cloth.js).
    if (shadow && a.bot[3] >= 2 && d2 < 18 * 18 && pose !== POSE.drive && pose !== POSE.hang) cands.push({ a, x, y, z, yaw, pose, phase });
    if (L.n >= cap) return;
    q.setFromEuler(e.set(0, yaw, 0)); m4.compose(p.set(x, y, z), q, sc.set(a.girth * a.h, a.h, a.girth * a.h));
    L.mesh.setMatrixAt(L.n, m4);
    const i = L.n * 4;
    L.A.aSkin.array.set(a.skin, i); L.A.aTop.array.set(a.top, i); L.A.aBot.array.set(a.bot, i); L.A.aHead.array.set(a.head, i);
    if (a.clothSim) L.A.aBot.array[i + 3] += 10; // the simulated garment replaces the built-in skirt
    L.A.aAnim.array.set([phase, pose, gest, a.stride], i);
    L.A.aCloth.array.set(cloth(a, x, z, yaw, pose === POSE.walk || pose === POSE.carry, phase), i);
    if (shadow && shadows.count < cap) {
      const tall = pose === POSE.sit ? 1.05 : 1.7 * a.h, len = 0.3 + tall * SHZ * 0.9;
      m4.set(0.42 * a.girth * a.h, 0, tall * SHX * 0.9, x, 0, 1, 0, y + 0.03, 0, 0, len, z - 0.15, 0, 0, 0, 1);
      shadows.setMatrixAt(shadows.count++, m4);
    }
    L.n++;
  }
  function end() {
    for (const L of lods) { L.mesh.count = L.n; L.mesh.instanceMatrix.needsUpdate = true; for (const k of names) L.A[k].needsUpdate = true; }
    shadows.instanceMatrix.needsUpdate = true;
  }
  return { appearance, beginFrame, draw, end, POSE, GEST, cands, get count() { return lods[0].n + lods[1].n; } };
}
