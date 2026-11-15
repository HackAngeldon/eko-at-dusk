import * as THREE from 'three';
import { MeshBuilder, rand, randi, pick, chance, col, shade, cable, clamp } from './util.js';
import { SIGN_COUNT, WALL_COUNT, SIGN_BUSSTOP, SIGN_BANNER, SIGN_BEACH, SIGN_WAY, SIGN_MUSIC } from './textures.js';
import { groundAO } from './atmosphere.js';
import { windowMaterial, balusterGeo, dishGeo, acGeo, tankGeo, instances } from './facade.js';

// Street layout in metres. The road runs along z; vehicles keep right. The beach path leaves the
// left-hand side at pathZ.
export const S = {
  half: 220, road: 7.6, gutter: 8.4, front: 12.5, lanes: [2.3, 5.7], okadaX: 4.0, hawkerX: 0.95,
  bridgeZ: -40, deckTop: 6.0, busStopZ: 34, floorH: 3.1, pathZ: -120, pathHalf: 2.2,
};
const STEP_RUN = 0.27, STEP_RISE = 0.2, STEPS = 30;
const FACADES = ['#e2d3b5', '#e8d58e', '#a9c9a4', '#a3c3d3', '#dba48e', '#d9a8b6', '#ece8de', '#a19c92', '#cf9f5f', '#bdc56f', '#f0c9a0', '#8fb3a0'];
const GATES = ['#1f3d2b', '#5a1a14', '#1c1c1c', '#1d3557', '#4a4a4a'];

export function buildCity(T) {
  const B = () => new MeshBuilder();
  const walls = B(), blocks = B(), tiles = B(), roofs = B(), road = B(), ground = B(), props = B(), metal = B(), lamps = B();
  const win = B(), shopB = B(), signs = B(), litSigns = B(), boards = B(), glows = B(), water = B(), streaks = B();
  const breeze = B(), shutters = B(), skyline = B();
  const wires = [], generators = [], slabs = new Set(), inst = { bal: [], dish: [], ac: [], tank: [] }, vendors = [];
  // Solid things on the walkways and median, as circles, so people (and you) walk around them.
  const obstacles = [], ob = (x, z, r) => obstacles.push({ x, z, r });
  let music = null;
  const W = [1, 1, 1], H = S.half + 40, PZ = S.pathZ;
  const glow = (x, z, y, r, c) => glows.flat(x - r, z - r, x + r, z + r, y, shade(c, 0.45));
  const streak = (x, y, z, w, h, fx) => streaks.plane(x, y - h / 2, z, w, h, fx, 0, W, [0, 0, Math.max(1, w / 1.5), 1]);

  // ---------- Road, median, lane paint, gutters, walkways ----------
  road.flat(-S.road, -H, S.road, H, 0, W, [-S.road / 6, -H / 6, S.road / 6, H / 6]);
  for (let z = -H; z < H; z += 2) walls.box(0, 0, z + 1, 1.0, 0.25, 2, col((z / 2) % 2 ? '#d8b11c' : '#1c1c1c'), { uv: 2 });
  for (const s of [-1, 1]) for (let z = -H; z < H; z += 10) if (chance(0.75)) walls.flat(s * S.okadaX - 0.08, z, s * S.okadaX + 0.08, z + 3, 0.006, col('#d9d4c4'));
  for (const s of [-1, 1]) {
    walls.quad([s * S.road, -0.6, -H], [s * S.road, -0.6, H], [s * S.road, 0, H], [s * S.road, 0, -H], col('#8d867a'), [0, 0, 2 * H / 3, 0.2], [s, 0, 0]);
    walls.quad([s * S.gutter, -0.6, -H], [s * S.gutter, -0.6, H], [s * S.gutter, 0.15, H], [s * S.gutter, 0.15, -H], col('#8d867a'), [0, 0, 2 * H / 3, 0.25], [-s, 0, 0]);
    walls.flat(Math.min(s * S.road, s * S.gutter), -H, Math.max(s * S.road, s * S.gutter), H, -0.6, col('#2a241c'));
    water.flat(Math.min(s * S.road, s * S.gutter), -H, Math.max(s * S.road, s * S.gutter), H, -0.46, W);
    ground.box(s * 11.2, -0.6, 0, 5.6, 0.75, 2 * H, W, { uv: 4, skip: s > 0 ? 'b nx' : 'b px' });
    walls.box(s * (S.gutter + 0.06), 0, 0, 0.12, 0.2, 2 * H, col('#a49d90'), { skip: 'b pz nz' });
    for (let z = -H; z < H; z += rand(4, 9)) if (chance(0.55)) {
      walls.box(s * 8.0, -0.02, z, 1.0, 0.14, 1.2, col('#9a9387', 1));
      for (let k = -1; k <= 1; k++) slabs.add(Math.round(z * 2) / 2 + k * 0.5 + (s > 0 ? 10000 : -10000));
    }
    ground.flat(s > 0 ? 14 : -40, -H - 60, s > 0 ? 160 : -14, H + 60, 0.0, W, [0, 0, 36, 140]);
  }

  // ---------- Buildings ----------
  let signIdx = 0;
  const nextSign = () => (signIdx++ * 7) % SIGN_COUNT;
  for (const s of [-1, 1]) {
    let z = -H + 10;
    while (z < H - 10) {
      let w = rand(7, 15);
      if (s < 0 && z < PZ + 3.4 && z + w > PZ - 3.4) { // keep the beach path open
        if (PZ - 3.4 - z > 5) w = PZ - 3.4 - z; else { z = PZ + 3.4; continue; }
      }
      if (chance(0.08)) { const gw = rand(4, 7); walls.box(s * 34, 0, z + gw / 2, 14, rand(3, 7), gw + 8, col(pick(FACADES), 1)); z += gw; continue; }
      building(s, z, w);
      z += w + (chance(0.3) ? rand(0.3, 1.2) : 0);
    }
  }
  for (let z2 = -H; z2 < H; z2 += rand(10, 22)) skyline.box(rand(40, 80), 0, z2, rand(10, 18), rand(6, 26), rand(8, 16), col(pick(['#9a8f82', '#b9ab98', '#8a8580']), 1), { uv: 6 });

  function building(s, z0, w) {
    const zc = z0 + w / 2, fence = chance(0.16), setback = fence ? rand(3.5, 5) : chance(0.3) ? rand(0, 1.2) : 0;
    const front = S.front + setback, depth = rand(9, 15), floors = pick([1, 1, 2, 2, 2, 3, 3, 4]), FH = S.floorH, Ht = floors * FH;
    const raw = floors >= 2 && chance(0.2), Wb = raw ? blocks : walls;
    const c = raw ? col('#ffffff', 1) : col(pick(FACADES), 1), trimC = raw ? col('#9a958c') : shade(c, 0.86);
    const xc = s * (front + depth / 2), fx = -s, xf = s * front, frame = chance(0.7) ? 0 : 1;
    Wb.box(xc, 0, zc, depth, Ht, w, c, { uv: raw ? 1.8 : 3, uo: rand(0, 3) });
    if (!raw) walls.box(xc, 0, zc, depth + 0.08, 0.6, w + 0.08, col(pick(['#7a4a34', '#5e5a55', '#8a3b2b'])));
    for (let f = 1; f < floors; f++) walls.box(xc, f * FH - 0.18, zc, depth + 0.18, 0.22, w + 0.18, trimC);
    for (const dz of [-w / 2 + 0.18, w / 2 - 0.18]) Wb.box(s * (front - 0.06), 0.6, zc + dz, 0.12, Ht - 0.6, 0.36, shade(c, 0.94), { uv: raw ? 1.8 : 3 });
    if (chance(0.5)) props.cyl(xf - s * 0.1, 0.1, z0 + 0.42, 0.05, Ht + 0.2, col(pick(['#3a3a3a', '#d9d4c8', '#2f4f6f'])), 6, { caps: false });
    if (chance(0.3)) inst.dish.push({ x: xc + rand(-depth / 3, depth / 3), y: Ht + 0.05, z: zc + rand(-w / 3, w / 3), ry: rand(2.4, 3.6) });

    if (fence) { // walled compound with a steel gate and breeze-block top
      const fw = w - 0.3, fc = shade(c, 0.95), gc = col(pick(GATES));
      walls.box(s * S.front, 0.15, zc - fw / 4 - 0.8, 0.22, 1.85, fw / 2 - 1.6, fc);
      walls.box(s * S.front, 0.15, zc + fw / 4 + 0.8, 0.22, 1.85, fw / 2 - 1.6, fc);
      for (const sz of [-1, 1]) breeze.plane(s * S.front, 2.25, zc + sz * (fw / 4 + 0.8), fw / 2 - 1.6, 0.4, -s, 0, W, [0, 0, (fw / 2 - 1.6) / 0.8, 0.5]);
      for (const sz of [-1, 1]) walls.box(s * S.front, 2.45, zc + sz * (fw / 4 + 0.8), 0.26, 0.08, fw / 2 - 1.6, fc);
      metal.box(s * S.front, 0.15, zc, 0.08, 2.05, 3.2, gc);
      for (let q = -1.45; q <= 1.46; q += 0.16) metal.box(s * (S.front - 0.05), 1.3, zc + q, 0.03, 0.85, 0.03, shade(gc, 0.8));
      for (let q = -1.5; q <= 1.5; q += 0.25) metal.box(s * S.front, 2.2, zc + q, 0.03, 0.18, 0.03, col('#222'));
      for (const dz of [-1.7, 1.7]) walls.box(s * S.front, 0.15, zc + dz, 0.35, 2.4, 0.35, trimC);
      if (chance(0.5)) signs.plane(s * (S.front - 0.12), 1.15, zc - fw / 4 - 0.8, Math.min(fw / 2 - 1.8, 3.2), Math.min(fw / 2 - 1.8, 3.2) / 4, fx, 0, W, T.signs.uv(SIGN_COUNT + randi(0, WALL_COUNT - 1)));
    } else {
      // Ground-floor shops: lintel, open front with goods, shutter, framed sign, banner or lightbox
      const n = clamp(Math.round(w / 4.5), 1, 3), uw = w / n;
      const tiled = raw || chance(0.3);
      for (let i = 0; i <= n; i++) (tiled ? tiles : walls).box(s * (front - 0.08), 0, z0 + uw * i + (i === 0 ? 0.2 : i === n ? -0.2 : 0), 0.18, 2.75, 0.36, tiled ? col('#ffffff') : shade(c, 0.9), { uv: tiled ? 1.2 : 3 });
      for (let i = 0; i < n; i++) {
        const uz = z0 + uw * (i + 0.5);
        if (!chance(0.86)) { signs.plane(xf - s * 0.02, 1.3, uz, Math.min(uw - 0.3, 3.4), Math.min(uw - 0.3, 3.4) / 4, fx, 0, W, T.signs.uv(SIGN_COUNT + randi(0, WALL_COUNT - 1))); continue; }
        walls.box(s * (front - 0.09), 2.6, uz, 0.18, 0.32, uw - 0.3, trimC);
        shopB.plane(xf - s * 0.02, 1.32, uz, uw - 0.7, 2.5, fx, 0, W, T.shops.uv(randi(0, 3)));
        if (chance(0.45)) {
          const sh = rand(0.4, 1.5);
          shutters.plane(xf - s * 0.05, 2.58 - sh / 2, uz, uw - 0.7, sh, fx, 0, W, [0, 0, (uw - 0.7) / 1.5, sh / 1.5]);
          metal.box(s * (front - 0.14), 2.42, uz, 0.22, 0.2, uw - 0.6, col('#6a6d70'));
        }
        const k = nextSign(), roll = rand(0, 1), sw = Math.min(uw - 0.4, 3.6), sh = sw / 4, y0 = 2.82;
        if (k === SIGN_MUSIC && !music) music = new THREE.Vector3(xf - s * 1.5, 1.5, uz);
        if (roll < 0.55) { // framed metal signboard on stand-offs, with gooseneck lamps
          metal.box(s * (front - 0.07), y0 - 0.05, uz, 0.1, sh + 0.1, sw + 0.1, col('#2b2b2b'));
          signs.plane(xf - s * 0.125, y0 + sh / 2, uz, sw, sh, fx, 0, W, T.signs.uv(k));
          for (const [yy, hh] of [[y0 - 0.06, 0.05], [y0 + sh + 0.01, 0.05]]) metal.box(s * (front - 0.14), yy, uz, 0.05, hh, sw + 0.12, col('#3a3a3a'));
          streak(xf - s * 0.012, y0 - 0.05, uz, sw * 0.9, 1.0, fx);
          if (chance(0.5)) for (const dz of [-sw / 4, sw / 4]) {
            metal.box(s * (front - 0.35), y0 + sh + 0.12, uz + dz, 0.6, 0.03, 0.03, col('#222'));
            metal.box(s * (front - 0.62), y0 + sh + 0.06, uz + dz, 0.14, 0.08, 0.18, col('#222'));
            lamps.box(s * (front - 0.62), y0 + sh + 0.03, uz + dz, 0.1, 0.02, 0.12, [6, 4.5, 2.6]);
          }
        } else if (roll < 0.8) { // printed flex banner, tied at the corners, sagging a little
          const segs = 8, bx = xf - s * 0.1;
          for (let q = 0; q < segs; q++) {
            const t0 = q / segs, t1 = (q + 1) / segs, [u0, v0, u1, v1] = T.signs.uv(k);
            const U = (t) => u0 + (u1 - u0) * (s > 0 ? t : 1 - t);
            const z1 = uz - sw / 2 + sw * t0, z2 = uz - sw / 2 + sw * t1;
            const o = (t) => s * (0.035 * Math.sin(t * Math.PI * 3) + 0.02), sag = (t) => 0.04 * Math.sin(t * Math.PI);
            signs.quad([bx - o(t0), y0 - sag(t0), z1], [bx - o(t1), y0 - sag(t1), z2], [bx - o(t1), y0 + sh, z2], [bx - o(t0), y0 + sh, z1], W, [U(t0), v0, U(t1), v1], [fx, 0, 0]);
          }
          for (const dz of [-sw / 2, sw / 2]) for (const yy of [y0, y0 + sh]) cable(wires, [bx, yy, uz + dz], [xf, yy + 0.1, uz + dz * 1.06], 0.02, 2);
        } else { // backlit lightbox
          metal.box(s * (front - 0.12), y0 - 0.05, uz, 0.2, sh + 0.1, sw + 0.1, col('#d8d8d8'));
          litSigns.plane(xf - s * 0.225, y0 + sh / 2, uz, sw, sh, fx, 0, W, T.signs.uv(k));
          glow(xf - s * 1.0, uz, 0.17, 2.0, [0.3, 0.3, 0.3]);
        }
        if (chance(0.3)) { // blade sign sticking out over the walkway
          const bz = uz + uw / 2 - 0.35, bk = nextSign();
          metal.box(s * (front - 0.6), 3.62, bz, 1.1, 0.04, 0.04, col('#222'));
          metal.box(s * (front - 0.72), 3.12, bz, 1.04, 0.36, 0.05, col('#2b2b2b'));
          for (const sz of [-1, 1]) signs.plane(s * (front - 0.72), 3.3, bz + sz * 0.03, 1.0, 0.25, 0, sz, W, T.signs.uv(bk));
        }
        if (chance(0.35)) metal.box(s * (front - 0.08), 1.4, uz + uw / 2 - 0.5, 0.12, 0.38, 0.26, col('#8a8f88'));
        if (chance(0.55)) { // corrugated awning
          const ya = 2.62, yb = 2.32, o = 2.1, z1 = uz - uw / 2 + 0.1, z2 = uz + uw / 2 - 0.1, rc = chance(0.3) ? col(pick(['#7a1f1f', '#1f4f7a', '#2f6b3a'])) : W;
          roofs.quad([xf, ya, z1], [xf, ya, z2], [xf - s * o, yb, z2], [xf - s * o, yb, z1], rc, [0, 0, uw / 2, 1], [0, 1, 0]);
          roofs.quad([xf, ya - 0.02, z1], [xf, ya - 0.02, z2], [xf - s * o, yb - 0.02, z2], [xf - s * o, yb - 0.02, z1], shade(rc, 0.6), [0, 0, uw / 2, 1], [0, -1, 0]);
          for (const zz of [z1 + 0.2, z2 - 0.2]) { props.cyl(xf - s * (o - 0.1), 0.15, zz, 0.035, yb - 0.15, col('#5a4a3a'), 5, { caps: false }); ob(xf - s * (o - 0.1), zz, 0.12); }
        }
        if (chance(0.7)) {
          const warm = chance(0.6), lc = warm ? [6, 3.6, 1.6] : [3.2, 4.2, 4.6];
          if (warm) lamps.box(xf - s * 0.9, 2.2, uz, 0.12, 0.14, 0.12, lc); else lamps.box(xf - s * 0.1, 2.48, uz, 0.06, 0.05, 1.2, lc);
          glow(xf - s * 1.2, uz, 0.17, 2.6, warm ? [0.5, 0.3, 0.12] : [0.25, 0.32, 0.36]);
        }
      }
    }

    // Floors with fake-room windows, sills, lintels, rain stains, balconies, AC units
    for (let f = fence ? 0 : 1; f < floors; f++) {
      const nw = Math.max(1, Math.floor(w / 2.7)), rw = w / nw;
      for (let k = 0; k < nw; k++) {
        const wz = z0 + rw * (k + 0.5), wy = f * FH + 1.5;
        win.attr = [wz, f * FH, rw, rand(0, 1000)];
        win.plane(xf - s * 0.02, wy, wz, 1.3, 1.35, fx, 0, W, T.frames.uv(frame));
        walls.box(xf - s * 0.08, f * FH + 0.74, wz, 0.18, 0.08, 1.56, shade(c, raw ? 0.7 : 0.95));
        walls.box(xf - s * 0.05, f * FH + 2.2, wz, 0.12, 0.12, 1.5, trimC);
        for (const dz of [-0.7, 0.7]) Wb.box(xf - s * 0.04, f * FH + 0.82, wz + dz, 0.09, 1.38, 0.1, shade(c, 0.93), { uv: raw ? 1.8 : 3 });
        if (chance(0.65)) streak(xf - s * 0.012, f * FH + 0.74, wz, 1.5, rand(0.8, 1.8), fx);
        if (f > 0 && chance(0.12)) inst.ac.push({ x: xf - s * 0.2, y: f * FH + 0.35, z: wz + 1.0, ry: -s * Math.PI / 2 });
      }
      if (f > 0 && chance(0.35)) { // balcony with turned balusters
        const bl = w * rand(0.4, 0.75), bc = shade(c, raw ? 0.75 : 0.95);
        walls.box(s * (front - 0.65), f * FH - 0.06, zc, 1.3, 0.16, bl, trimC);
        walls.box(s * (front - 1.22), f * FH + 0.9, zc, 0.18, 0.1, bl + 0.1, bc);
        for (let bz = zc - bl / 2 + 0.12; bz < zc + bl / 2 - 0.05; bz += 0.21) inst.bal.push({ x: s * (front - 1.22), y: f * FH + 0.1, z: bz, c: raw ? [0.75, 0.73, 0.68] : bc });
        for (const dz of [-bl / 2, bl / 2]) walls.box(s * (front - 1.22), f * FH + 0.1, zc + dz, 0.22, 0.82, 0.22, bc);
        if (chance(0.5)) for (let q = 0; q < 4; q++) props.plane(s * (front - 1.0), f * FH + 1.45, zc - bl / 2 + 0.5 + q * 0.7, 0.55, 0.75, fx, 0, col(pick(['#d33', '#36c', '#fd3', '#fff', '#3a3', '#f6a'])));
      }
    }

    // Roof: rusty zinc, unfinished columns with rebar, or a flat roof with parapet, tanks and billboards
    if ((floors === 1 && chance(0.8)) || chance(0.18)) {
      roofs.gable(xc, Ht, zc, depth + 1.0, w + 0.8, rand(1.1, 1.9), chance(0.25) ? col(pick(['#8a2a22', '#2a5a8a', '#3a7a4a'])) : W, { gableColor: c });
      metal.box(xf - s * 0.45, Ht - 0.12, zc, 0.12, 0.1, w + 0.8, col('#4a4a4a'));
    } else if (floors >= 2 && chance(0.22)) {
      for (const dx of [-depth / 2 + 0.3, 0, depth / 2 - 0.3]) for (const dz of [-w / 2 + 0.3, w / 2 - 0.3]) {
        walls.box(xc + dx, Ht, zc + dz, 0.35, 2.4, 0.35, col('#9a958c'));
        for (const q of [-0.1, 0.1]) props.box(xc + dx + q, Ht + 2.4, zc + dz + q, 0.03, 1.1, 0.03, col('#4a2a1a'));
      }
    } else {
      walls.box(xc, Ht - 0.12, zc, depth + 0.36, 0.26, w + 0.36, trimC);
      const brz = chance(0.35);
      for (const [dx, dz, sx, sz] of [[0, -w / 2 + 0.08, depth, 0.16], [0, w / 2 - 0.08, depth, 0.16], [-depth / 2 + 0.08, 0, 0.16, w], [depth / 2 - 0.08, 0, 0.16, w]]) {
        if (brz && sz === w) { Wb.box(xc + dx, Ht + 0.14, zc + dz, sx, 0.2, sz, c); breeze.plane(xc + dx, Ht + 0.6, zc + dz, w, 0.6, Math.sign(dx), 0, W, [0, 0, w / 0.8, 0.75]); Wb.box(xc + dx, Ht + 0.9, zc + dz, 0.2, 0.08, sz, trimC); }
        else Wb.box(xc + dx, Ht + 0.14, zc + dz, sx, 0.8, sz, c, { uv: raw ? 1.8 : 3 });
      }
      streak(xf - s * 0.012, Ht - 0.25, zc, w - 0.3, rand(1.2, 2.4), fx);
      for (let t = 0; t < randi(1, 2); t++) inst.tank.push({ x: xc + rand(-depth / 3, depth / 3), y: Ht + 0.14, z: zc + rand(-w / 3, w / 3), ry: rand(0, 6) });
      if (floors >= 2 && chance(0.15)) {
        const bx = s * (front + 2), by = Ht + 4.6, bw = 8, bh = 4;
        for (const dz of [-2.5, 2.5]) metal.box(bx + s * 0.3, Ht, zc + dz, 0.25, 3.0, 0.25, col('#2f2f2f'));
        metal.box(bx + s * 0.18, by - bh / 2 - 0.1, zc, 0.15, bh + 0.2, bw + 0.2, col('#2f2f2f'));
        boards.plane(bx, by, zc, bw, bh, fx, 0, W, T.billboards.uv(randi(0, 3)));
        for (const dz of [-2.6, 0, 2.6]) { metal.box(bx - s * 0.8, by + bh / 2 + 0.15, zc + dz, 1.6, 0.04, 0.04, col('#222')); lamps.box(bx - s * 1.55, by + bh / 2 + 0.08, zc + dz, 0.2, 0.06, 0.3, [6, 5, 3.5]); }
      }
    }
    if (chance(0.3)) {
      const gz = zc + rand(-w / 3, w / 3);
      props.box(xf - s * 0.7, 0.15, gz, 0.7, 0.65, 1.0, col(pick(['#b3261e', '#e3b505', '#2e7d32', '#e65100'])));
      generators.push(new THREE.Vector3(xf - s * 0.7, 0.5, gz)); ob(xf - s * 0.7, gz, 0.6);
    }
  }

  // ---------- Power poles and tangled wires ----------
  for (const s of [-1, 1]) {
    let prev = null;
    for (let z = -H; z < H; z += rand(26, 34)) {
      if (s < 0 && Math.abs(z - PZ) < 4) continue;
      const px = s * 9.0;
      walls.box(px, 0.15, z, 0.26, 9, 0.26, col('#928d84')); ob(px, z, 0.25);
      metal.box(px, 8.5, z, 2.2, 0.14, 0.14, col('#3a3532'));
      for (const o of [-0.9, 0, 0.9]) props.cyl(px + o, 8.57, z, 0.04, 0.12, col('#ddd8cc'), 6);
      if (chance(0.15)) { props.box(px + s * 0.4, 5.6, z, 0.8, 1.2, 1.0, col('#5f6b5d')); props.cyl(px + s * 0.4, 6.8, z, 0.3, 0.6, col('#5f6b5d'), 8); }
      if (prev !== null) for (const o of [-0.9, 0, 0.9]) cable(wires, [px + o, 8.7, prev], [px + o, 8.7, z], rand(0.5, 1.1));
      for (let k = 0; k < randi(1, 3); k++) cable(wires, [px + rand(-0.9, 0.9), 8.6, z], [s * S.front, rand(3.5, 6), z + rand(-14, 14)], rand(0.3, 0.9), 8);
      if (chance(0.25)) cable(wires, [px, 8.6, z], [-px, 8.6, z + rand(-6, 6)], rand(1.2, 2.2), 14);
      prev = z;
    }
  }

  // ---------- Solar streetlights on the median ----------
  for (let z = -H + 10; z < H; z += 36) {
    if (Math.abs(z - S.bridgeZ) < 6) continue;
    walls.box(0, 0.25, z, 0.2, 7.8, 0.2, col('#8f8a82')); ob(0, z, 0.2);
    metal.box(0, 7.95, z, 5.0, 0.1, 0.1, col('#4a4a4a'));
    props.box(0, 8.3, z, 1.0, 0.06, 0.7, col('#1d2a4a'));
    for (const s of [-1, 1]) {
      const on = chance(0.65), lc = chance(0.5) ? [5, 3.6, 2] : [3.6, 4, 4.4];
      (on ? lamps : metal).box(s * 2.4, 7.82, z, 0.55, 0.1, 0.28, on ? lc : col('#333'));
      if (on) glow(s * 3.0, z, 0.02, 6, shade(lc, 0.07));
    }
  }

  // ---------- Pedestrian bridge ----------
  const zb = S.bridgeZ, dt = S.deckTop, green = col('#2f6b3a');
  walls.box(0, dt - 0.4, zb, 24.2, 0.4, 2.6, col('#9c968c'), { skip: '' });
  for (const sz of [-1, 1]) {
    walls.box(0, dt, zb + sz * 1.25, 24.2, 0.22, 0.08, green);
    metal.box(0, dt + 1.05, zb + sz * 1.25, 24.2, 0.07, 0.1, col('#1f4a28'));
    for (let x = -12; x <= 12; x += 0.3) if (Math.abs(x) > 2.3) metal.box(x, dt + 0.22, zb + sz * 1.25, 0.04, 0.83, 0.04, green);
    walls.box(0, dt + 0.22, zb + sz * 1.25, 4.6, 0.85, 0.06, green);
    signs.plane(0, dt + 0.62, zb + sz * 1.29, 3.2, 0.8, 0, sz, W, T.signs.uv(SIGN_BANNER));
  }
  for (const x of [-9.2, 0, 9.2]) { walls.box(x, 0, zb, 0.5, dt - 0.4, 0.5, col('#9c968c')); ob(x, zb, 0.4); }
  for (const s of [-1, 1]) for (let i = 0; i < STEPS; i += 3) ob(s * 11.3, zb + 1.3 + i * STEP_RUN, 0.85);
  for (const s of [-1, 1]) for (let i = 0; i < STEPS; i++) walls.box(s * 11.3, 0, zb + 1.3 + i * STEP_RUN + STEP_RUN / 2, 1.6, dt - i * STEP_RISE, STEP_RUN, col('#9c968c'), { uv: 2 });

  // ---------- Bus stop ----------
  const zs = S.busStopZ;
  walls.box(10.6, 2.6, zs, 2.2, 0.12, 5, col('#2b5fa8'), { skip: '' });
  for (const [dx, dz] of [[-0.9, -2.3], [0.9, -2.3], [-0.9, 2.3], [0.9, 2.3]]) metal.box(10.6 + dx, 0.15, zs + dz, 0.08, 2.45, 0.08, col('#555'));
  props.box(11.2, 0.15, zs, 0.45, 0.45, 3.5, col('#6b4b2a'));
  for (const dz of [-1.3, 0, 1.3]) ob(11.2, zs + dz, 0.32);
  for (const [dx, dz] of [[-0.9, -2.3], [0.9, -2.3], [-0.9, 2.3], [0.9, 2.3]]) ob(10.6 + dx, zs + dz, 0.1);
  ob(9.0, zs + 3, 0.1);
  metal.box(9.0, 0.15, zs + 3, 0.08, 2.6, 0.08, col('#555'));
  for (const sz of [-1, 1]) signs.plane(9.0, 2.6, zs + 3 + sz * 0.05, 2.4, 0.6, 0, sz, W, T.signs.uv(SIGN_BUSSTOP));

  // ---------- The way to the beach ----------
  ground.flat(-40, PZ - S.pathHalf, -13.9, PZ + S.pathHalf, 0.012, col('#d8c3a0'), [0, 0, 6, 1]);
  for (const sz of [-1, 1]) metal.box(-13.6, 0.15, PZ + sz * 2.3, 0.1, 3.6, 0.1, col('#3a3a3a'));
  metal.box(-13.6, 3.0, PZ, 0.08, 0.95, 4.2, col('#2b2b2b'));
  for (const sx of [-1, 1]) signs.plane(-13.6 + sx * 0.05, 3.47, PZ, 3.6, 0.9, sx, 0, W, T.signs.uv(SIGN_BEACH));
  // Blue direction signs on both walkways, counting down the distance from either end of the street
  const waySign = (x, z, fz, k) => {
    metal.box(x, 0.15, z, 0.09, 3.2, 0.09, col('#5a5f63')); ob(x, z, 0.12);
    metal.box(x, 2.38, z + fz * 0.03, 2.48, 0.68, 0.04, col('#2b2b2b'));
    signs.plane(x, 2.72, z + fz * 0.06, 2.4, 0.6, 0, fz, W, T.signs.uv(SIGN_WAY + k));
  };
  for (const sx of [-1, 1]) {
    [50, 100, 150, 200, 250].forEach((dz, k) => waySign(sx * 9.7, PZ + dz, 1, k));
    [50, 100].forEach((dz, k) => waySign(sx * 9.7, PZ - dz, -1, k));
    waySign(sx * 9.7, PZ + 9, 1, 5); waySign(sx * 9.7, PZ - 9, -1, 6);
  }
  // A banner strung across the road at the turning, readable from both directions
  for (const sx of [-1, 1]) { walls.box(sx * 8.9, 0.15, PZ + 5, 0.25, 7.2, 0.25, col('#928d84')); ob(sx * 8.9, PZ + 5, 0.22); }
  for (const sz of [-1, 1]) ob(-13.6, PZ + sz * 2.3, 0.12);
  cable(wires, [-8.9, 6.9, PZ + 5], [8.9, 6.9, PZ + 5], 0.4, 12);
  metal.box(0, 6.67, PZ + 5, 6.5, 0.05, 0.05, col('#222'));
  for (const sz of [-1, 1]) signs.plane(0, 5.85, PZ + 5 + sz * 0.02, 6.4, 1.6, 0, sz, W, T.signs.uv(SIGN_WAY + (sz > 0 ? 5 : 6)));

  // ---------- Street trade: umbrellas, tyre stacks, container shops ----------
  for (const s of [-1, 1]) for (let z = -H + 5; z < H - 5; z += rand(5, 10)) {
    if (Math.abs(z - zb) < 10 || (s > 0 && Math.abs(z - zs) < 5) || (s < 0 && Math.abs(z - PZ) < 5) || !chance(0.5)) continue;
    const x = s * rand(9.4, 10.3), roll = rand(0, 1);
    if (roll < 0.62) {
      umbrella(x, z, rand(1.1, 1.5), pick([['#d7262e', '#f4f1e8'], ['#1d63b8', '#f2c418'], ['#2e8b3e', '#f4f1e8'], ['#f28c1e', '#2a2a7a']]));
      props.box(x, 0.15, z, 0.8, 0.72, 1.2, col('#6b4b2a', 1));
      for (let q = 0; q < 6; q++) props.box(x + rand(-0.3, 0.3), 0.87, z + rand(-0.5, 0.5), 0.16, 0.12, 0.16, col(pick(['#d32f2f', '#f9a825', '#43a047', '#ef6c00', '#f5f5f5', '#6d4c41'])));
      props.cyl(x + s * 0.75, 0.15, z, 0.17, 0.47, col(pick(['#1565c0', '#d32f2f', '#f5f5f5'])), 8);
      ob(x, z - 0.35, 0.5); ob(x, z + 0.35, 0.5);
      vendors.push({ x: x + s * 0.75, z, yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
      if (chance(0.3)) glow(x, z, 0.17, 1.8, [0.4, 0.26, 0.1]);
    } else if (roll < 0.8) {
      for (let q = 0; q < randi(3, 6); q++) props.cyl(x, 0.15 + q * 0.22, z, 0.34, 0.2, col('#151515'), 10);
      ob(x, z, 0.4);
    } else if (roll < 0.86) {
      const cx = s * 11.3;
      props.box(cx, 0.15, z + 3, 2.3, 2.6, 6, col(pick(['#1f5fa0', '#a8322d', '#2f7d4a', '#d08a1d']), 1));
      for (const dz of [0.9, 2.3, 3.7, 5.1]) ob(cx, z + dz, 1.2);
      signs.plane(cx - s * 1.17, 2.2, z + 3, 3.2, 0.8, -s, 0, W, T.signs.uv(nextSign()));
      z += 7;
    }
  }
  function umbrella(x, z, r, [a, b]) {
    props.cyl(x, 0.15, z, 0.03, 2.35, col('#555'), 5, { caps: false });
    const seg = 10, top = [x, 2.62, z];
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, cc = col(i % 2 ? a : b);
      const p0 = [x + Math.cos(a0) * r, 2.2, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, 2.2, z + Math.sin(a1) * r];
      props.tri(top, p0, p1, cc, [0, 1, 0]); props.tri(top, p1, p0, shade(cc, 0.7), [0, -1, 0]);
    }
  }

  // ---------- Materials and meshes ----------
  const group = new THREE.Group();
  const add = (b, mat, cast = true, recv = true) => {
    if (b.empty) return null;
    const m = new THREE.Mesh(b.build(), mat); m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m;
  };
  const std = (o) => new THREE.MeshStandardMaterial(o);
  add(walls, groundAO(std({ map: T.plaster.map, normalMap: T.plaster.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), vertexColors: true, roughness: 0.92 })));
  add(blocks, groundAO(std({ map: T.blocks.map, normalMap: T.blocks.normalMap, vertexColors: true, roughness: 0.96 })));
  add(tiles, groundAO(std({ map: T.tiles.map, normalMap: T.tiles.normalMap, roughnessMap: T.tiles.roughnessMap, vertexColors: true, roughness: 1 })));
  add(skyline, std({ map: T.plaster.map, vertexColors: true, roughness: 1 }), false, false);
  add(roofs, std({ map: T.roof.map, normalMap: T.roof.normalMap, vertexColors: true, roughness: 0.55, metalness: 0.45 }));
  add(road, groundAO(std({ map: T.asphalt.map, normalMap: T.asphalt.normalMap, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.86 })), false);
  add(ground, groundAO(std({ map: T.dirt, vertexColors: true, roughness: 1 })), false);
  add(props, groundAO(std({ vertexColors: true, roughness: 0.7, metalness: 0.1 })));
  add(metal, std({ vertexColors: true, roughness: 0.45, metalness: 0.6 }));
  add(win, windowMaterial(T.frames), false);
  add(shopB, new THREE.MeshBasicMaterial({ map: T.shops.map, color: 0x6e6152 }), false, false);
  add(signs, std({ map: T.signs.map, emissiveMap: T.signs.map, emissive: 0xffffff, emissiveIntensity: 0.15, alphaTest: 0.5, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }), true);
  add(litSigns, std({ map: T.signs.map, emissiveMap: T.signs.map, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.3 }), false);
  add(boards, std({ map: T.billboards.map, emissiveMap: T.billboards.map, emissive: 0xffffff, emissiveIntensity: 0.75, roughness: 0.5 }), false);
  add(breeze, std({ map: T.breeze, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 }));
  add(shutters, std({ map: T.shutter.map, normalMap: T.shutter.normalMap, roughness: 0.5, metalness: 0.5 }), false);
  add(lamps, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }), false, false);
  add(water, std({ color: 0x2c2a1d, roughness: 0.06, metalness: 0.2 }), false);
  const st = add(streaks, std({ color: 0x2a1d12, alphaMap: T.streaks, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, roughness: 1 }), false);
  if (st) st.renderOrder = 1;
  const g = add(glows, new THREE.MeshBasicMaterial({ map: T.glow, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 }), false, false);
  if (g) g.renderOrder = 2;
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x141210 })));
  const kit = std({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
  group.add(instances(balusterGeo(), std({ map: T.plaster.map, roughness: 0.9 }), inst.bal));
  group.add(instances(dishGeo(), kit, inst.dish), instances(acGeo(), kit, inst.ac), instances(tankGeo(), std({ vertexColors: true, roughness: 0.65 }), inst.tank));

  // Walkable height at (x, z). Stairs and the bridge deck count only when you are already up there.
  function groundHeight(x, z, y = 0) {
    const ax = Math.abs(x);
    let h;
    if (ax < 0.5) h = 0.25;
    else if (ax < S.road) h = 0;
    else if (ax < S.gutter) h = slabs.has(Math.round(z * 2) / 2 + (x > 0 ? 10000 : -10000)) ? 0.12 : -0.45;
    else h = 0.15;
    const sz = z - (zb + 1.3);
    if (ax > 10.5 && ax < 12.1 && sz >= 0 && sz < STEPS * STEP_RUN) h = Math.max(h, dt - Math.floor(sz / STEP_RUN) * STEP_RISE);
    if (Math.abs(z - zb) < 1.2 && ax < 12.1 && y > 3.5) h = dt;
    return h;
  }
  return { group, generators, music, groundHeight, vendors, obstacles };
}
