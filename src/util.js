import * as THREE from 'three';

// Deterministic random numbers, so every visitor walks the same street.
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let R = makeRng(1960);
export const reseed = (s) => { R = makeRng(s); };
export const rnd = () => R();
export const rand = (a, b) => a + (b - a) * R();
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(R() * arr.length)];
export const chance = (p) => R() < p;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

const tmpC = new THREE.Color();
// sRGB hex -> linear [r,g,b], with optional random variation.
export function col(hex, jitter = 0) {
  tmpC.set(hex);
  if (jitter) tmpC.offsetHSL(rand(-1, 1) * jitter * 0.03, rand(-1, 1) * jitter * 0.12, rand(-1, 1) * jitter * 0.1);
  return [tmpC.r, tmpC.g, tmpC.b];
}
export const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// Collects triangles with normals, UVs and vertex colours, then builds one BufferGeometry.
export class MeshBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.ex = []; this.attr = null; }
  get empty() { return this.p.length === 0; }
  vert(v, nx, ny, nz, u, w, c) {
    this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(c[0], c[1], c[2]);
    if (this.attr) this.ex.push(...this.attr);
  }
  // a,b,c,d go round the quad; uv maps a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1).
  // `hint` is a rough outward direction; the winding is flipped to face it.
  quad(a, b, c, d, color, uv = [0, 0, 1, 1], hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const [u0, v0, u1, v1] = uv;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      this.vert(a, -nx, -ny, -nz, u0, v0, color); this.vert(c, -nx, -ny, -nz, u1, v1, color); this.vert(b, -nx, -ny, -nz, u1, v0, color);
      this.vert(a, -nx, -ny, -nz, u0, v0, color); this.vert(d, -nx, -ny, -nz, u0, v1, color); this.vert(c, -nx, -ny, -nz, u1, v1, color);
      return;
    }
    this.vert(a, nx, ny, nz, u0, v0, color); this.vert(b, nx, ny, nz, u1, v0, color); this.vert(c, nx, ny, nz, u1, v1, color);
    this.vert(a, nx, ny, nz, u0, v0, color); this.vert(c, nx, ny, nz, u1, v1, color); this.vert(d, nx, ny, nz, u0, v1, color);
  }
  tri(a, b, c, color, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    this.vert(a, nx, ny, nz, 0, 0, color); this.vert(b, nx, ny, nz, 1, 0, color); this.vert(c, nx, ny, nz, 0.5, 1, color);
  }
  // Box standing on y, centred on x/z, turned by o.rot around Y. UVs are in world metres / o.uv.
  // o.skip lists faces to leave out: px nx pz nz t b (bottom is skipped by default).
  box(x, y, z, w, h, d, color, o = {}) {
    const r = o.rot || 0, cs = Math.cos(r), sn = Math.sin(r), s = o.uv || 3, skip = o.skip ?? 'b';
    const hw = w / 2, hd = d / 2, uo = o.uo || 0, vo = (o.vo || 0) + y / s;
    const T = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const N = (lx, ly, lz) => [lx * cs + lz * sn, ly, -lx * sn + lz * cs];
    const side = [uo, vo, 0, vo + h / s];
    if (!skip.includes('px')) this.quad(T(hw, 0, hd), T(hw, 0, -hd), T(hw, h, -hd), T(hw, h, hd), color, [uo, vo, uo + d / s, vo + h / s], N(1, 0, 0));
    if (!skip.includes('nx')) this.quad(T(-hw, 0, -hd), T(-hw, 0, hd), T(-hw, h, hd), T(-hw, h, -hd), color, [uo, vo, uo + d / s, vo + h / s], N(-1, 0, 0));
    if (!skip.includes('pz')) this.quad(T(-hw, 0, hd), T(hw, 0, hd), T(hw, h, hd), T(-hw, h, hd), color, [uo, vo, uo + w / s, vo + h / s], N(0, 0, 1));
    if (!skip.includes('nz')) this.quad(T(hw, 0, -hd), T(-hw, 0, -hd), T(-hw, h, -hd), T(hw, h, -hd), color, [uo, vo, uo + w / s, vo + h / s], N(0, 0, -1));
    if (!skip.includes('t')) this.quad(T(-hw, h, hd), T(hw, h, hd), T(hw, h, -hd), T(-hw, h, -hd), color, [uo, 0, uo + w / s, d / s], [0, 1, 0]);
    if (!skip.includes('b')) this.quad(T(-hw, 0, -hd), T(hw, 0, -hd), T(hw, 0, hd), T(-hw, 0, hd), color, [uo, 0, uo + w / s, d / s], [0, -1, 0]);
    void side;
  }
  // Vertical plane centred at c, facing the horizontal direction (fx, fz).
  plane(cx, cy, cz, w, h, fx, fz, color, uv = [0, 0, 1, 1]) {
    const rx = fz, rz = -fx, hw = w / 2, hh = h / 2;
    this.quad([cx - rx * hw, cy - hh, cz - rz * hw], [cx + rx * hw, cy - hh, cz + rz * hw],
      [cx + rx * hw, cy + hh, cz + rz * hw], [cx - rx * hw, cy + hh, cz - rz * hw], color, uv, [fx, 0, fz]);
  }
  // Flat horizontal quad (decals, water, light pools).
  flat(x0, z0, x1, z1, y, color, uv = [0, 0, 1, 1]) {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color, uv, [0, 1, 0]);
  }
  // Cylinder along Y (axis 'y') or along X (axis 'x', for wheels), smooth sides.
  cyl(x, y, z, r, h, color, seg = 8, o = {}) {
    const r2 = o.r2 ?? r, ax = o.axis || 'y', caps = o.caps ?? true;
    const P = (a, t, rr) => {
      const c = Math.cos(a) * rr, s = Math.sin(a) * rr;
      return ax === 'y' ? [x + c, y + t, z + s] : [x + t - h / 2, y + c, z + s];
    };
    const Nn = (a) => (ax === 'y' ? [Math.cos(a), 0, Math.sin(a)] : [0, Math.cos(a), Math.sin(a)]);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
      const p0 = P(a0, 0, r), p1 = P(a1, 0, r), p2 = P(a1, h, r2), p3 = P(a0, h, r2);
      const n0 = Nn(a0), n1 = Nn(a1);
      const hint = [(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2, (n0[2] + n1[2]) / 2];
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      const fn = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
      const flip = fn[0] * hint[0] + fn[1] * hint[1] + fn[2] * hint[2] < 0;
      const A = [p0, n0, i / seg, 0], B = [p1, n1, (i + 1) / seg, 0], C = [p2, n1, (i + 1) / seg, 1], D = [p3, n0, i / seg, 1];
      const order = flip ? [A, C, B, A, D, C] : [A, B, C, A, C, D];
      for (const [p, n, u, v] of order) this.vert(p, n[0], n[1], n[2], u, v, color);
      if (caps) {
        const top = ax === 'y' ? [x, y + h, z] : [x + h / 2, y, z];
        this.tri(top, p2, p3, color, ax === 'y' ? [0, 1, 0] : [1, 0, 0]);
        if (o.bottom) this.tri(ax === 'y' ? [x, y, z] : [x - h / 2, y, z], p0, p1, color, ax === 'y' ? [0, -1, 0] : [-1, 0, 0]);
      }
    }
  }
  // Pitched roof with the ridge along local z. Sits on y, w across, d along the ridge, h tall.
  gable(x, y, z, w, d, h, color, o = {}) {
    const r = o.rot || 0, cs = Math.cos(r), sn = Math.sin(r), s = o.uv || 2;
    const T = (lx, ly, lz) => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
    const N = (lx, ly, lz) => [lx * cs + lz * sn, ly, -lx * sn + lz * cs];
    const hw = w / 2, hd = d / 2, slope = Math.hypot(hw, h) / s;
    this.quad(T(-hw, 0, hd), T(-hw, 0, -hd), T(0, h, -hd), T(0, h, hd), color, [0, 0, d / s, slope], N(-h, hw, 0));
    this.quad(T(hw, 0, -hd), T(hw, 0, hd), T(0, h, hd), T(0, h, -hd), color, [0, 0, d / s, slope], N(h, hw, 0));
    const g = o.gableColor || color;
    this.tri(T(-hw, 0, hd), T(hw, 0, hd), T(0, h, hd), g, N(0, 0, 1));
    this.tri(T(hw, 0, -hd), T(-hw, 0, -hd), T(0, h, -hd), g, N(0, 0, -1));
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    if (this.ex.length) g.setAttribute('aRoom', new THREE.Float32BufferAttribute(this.ex, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// Sagging cable between two points, as line-segment pairs appended to `out`.
export function cable(out, a, b, sag, steps = 10) {
  let prev = a;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = [lerp(a[0], b[0], t), lerp(a[1], b[1], t) - sag * 4 * t * (1 - t), lerp(a[2], b[2], t)];
    out.push(prev[0], prev[1], prev[2], p[0], p[1], p[2]);
    prev = p;
  }
}
