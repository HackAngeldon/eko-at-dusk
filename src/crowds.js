import { makeRng, TAU } from './util.js';
import { POSE } from './humans.js';
import { S } from './city.js';
import { sandHeight, shoreX } from './ocean.js';

// Who is where, what they are doing, and how they move through each other.
// Movement uses a "social force" model: everyone heads where they want to go, while nearby people,
// stalls, poles, chairs, palms, canoes and you push them away, more strongly when the thing is ahead.
// They sidestep early, slow down or stop when boxed in, turn to face where they actually move, and a
// final pass makes sure nobody ever overlaps anything solid. You collide with people and props too.
export function createCrowds(humans, city, beach, traffic) {
  const r = makeRng(99), R = (a = 0, b = 1) => a + (b - a) * r(), PICK = (a) => a[Math.floor(r() * a.length)];
  const A = humans.appearance, H = S.half - 4, PZ = S.pathZ;
  const wrapZ = (z) => (z > H ? z - 2 * H : z < -H ? z + 2 * H : z);
  const seatY = (a, top) => top + 0.08 - 0.51 * a.h;
  const groundAt = (x, z) => (Math.abs(x) <= 12.3 ? city.groundHeight(x, z, 0) : x > -40.5 ? 0.05 + (sandHeight(-40.5, z) - 0.05) * ((-x - 12.2) / 28.3) : sandHeight(x, z));

  // ---------- Spatial grids ----------
  const CELL = 3, key = (ix, iz) => (ix + 5000) * 100000 + (iz + 5000);
  const makeGrid = () => {
    const m = new Map();
    return {
      clear() { m.clear(); },
      add(o) { const k = key(Math.floor(o.x / CELL), Math.floor(o.z / CELL)); let c = m.get(k); if (!c) m.set(k, (c = [])); c.push(o); },
      near(x, z, fn) { const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = m.get(key(ix + a, iz + b)); if (c) for (const o of c) fn(o); } },
    };
  };
  const statics = makeGrid(), movers = makeGrid();
  for (const o of [...(city.obstacles || []), ...(beach.obstacles || [])]) statics.add({ ...o, solid: true });

  // ---------- People who stay put (they are obstacles for everyone else) ----------
  const still = [];
  const vendors = (city.vendors || []).map((v) => ({ a: A({ female: r() < 0.65 }), ...v, gest: PICK([0, 0, 1, 3, 4]), pose: POSE.sit, y: seatY, top: 0.62 }));
  const waiting = [];
  for (let i = 0; i < 9; i++) waiting.push({ a: A(), x: R(9.4, 10.6), z: S.busStopZ + R(-2.8, 2.8), yaw: Math.PI / 2 + R(-0.5, 0.5), gest: PICK([0, 1, 2, 3, 4, 1]), pose: POSE.stand });
  const seated = (beach.chairs || []).filter(() => r() < 0.62).map((c) => ({ a: A({ beach: true }), x: c.x, z: c.z, top: c.y + 0.46, yaw: c.ry + Math.PI, gest: r() < 0.4 ? 1 : 0, pose: POSE.sit, y: seatY, beach: true }));
  const bar = [];
  beach.huts.forEach((h, i) => {
    bar.push({ a: A({ beach: true, female: i % 2 === 0 }), x: h.x - 1.0, z: h.z + R(-0.8, 0.8), yaw: Math.PI / 2, gest: 1, pose: POSE.stand, beach: true });
    for (let k = 0; k < 3; k++) bar.push({ a: A({ beach: true }), x: h.x - R(3.5, 8), z: h.z + R(-4, 4), yaw: R(0, TAU), gest: PICK([0, 1, 1, 2, 3, 4]), pose: POSE.stand, beach: true });
  });
  const waders = [];
  for (let i = 0; i < 7; i++) { const z = R(-240, -20); waders.push({ a: A({ beach: true }), x: shoreX(z) - R(2, 9), z, yaw: Math.PI / 2 + R(-0.6, 0.6) + (r() < 0.5 ? Math.PI : 0), gest: 0, pose: POSE.wade, beach: true }); }
  still.push(...vendors, ...waiting, ...seated, ...bar, ...waders);
  for (const p of still) statics.add({ x: p.x, z: p.z, r: p.pose === POSE.sit ? 0.38 : 0.3, solid: true, person: true });

  // ---------- People on the move ----------
  const movers_ = [];
  const mover = (o) => { const m = { vx: 0, vz: 0, r: o.kid ? 0.22 : 0.27, yaw: 0, ph: R(0, TAU), ...o }; movers_.push(m); return m; };
  for (const s of [-1, 1]) for (let i = 0; i < 40; i++) {
    const home = R(10.6, 12.0);
    mover({ kind: 'walk', a: A(), s, home, x: s * home, z: R(-H, H), dir: r() < 0.5 ? 1 : -1, sp: R(1.0, 1.45), mode: 0, tx: 0 });
  }
  for (const s of [-1, 1]) for (let i = 0; i < 5; i++) mover({ kind: 'hawk', a: A({ tray: true, female: r() < 0.7 }), s, x: s * S.hawkerX, z: R(-150, 150), dir: r() < 0.5 ? 1 : -1, sp: R(0.5, 0.8), pause: 0 });
  for (let i = 0; i < 6; i++) mover({ kind: 'path', a: A(), x: R(-60, -14), z: PZ, off: R(-1.3, 1.3), dir: r() < 0.5 ? 1 : -1, sp: R(0.9, 1.3) });
  for (let i = 0; i < 18; i++) { const z = R(-320, 50), off = R(2.5, 13); mover({ kind: 'shore', a: A({ beach: true }), off, x: shoreX(z) + off, z, dir: r() < 0.5 ? 1 : -1, sp: R(0.9, 1.3) }); }
  for (let i = 0; i < 5; i++) { const z = R(-200, -40), base = R(-3, 4); mover({ kind: 'kid', kid: true, a: A({ beach: true, kid: true }), base, x: shoreX(z) + base, z, tgt: 1, sp: R(2.4, 3.2) }); }

  // ---------- Drivers and conductors ride with the traffic ----------
  traffic.onDraw = (v, m, f, yaw, bob, cam) => {
    const dx = v.x - cam.x, dz = v.z - cam.z;
    if (dx * dx + dz * dz > 75 * 75) return;
    if (m.driver) { v.driver ||= A({ female: r() < 0.08 }); const [lx, ly, lz] = m.driver; humans.draw(v.driver, v.x + lx * f, seatY(v.driver, ly) + bob, v.z + lz * f, yaw, POSE.drive, 0, 0, false); }
    if (m.door) { v.cond ||= A({ female: false }); const [lx, ly, lz] = m.door; humans.draw(v.cond, v.x + lx * f, ly + bob, v.z + lz * f, yaw, POSE.hang, 0, 0, false); }
  };

  // ---------- Social force step ----------
  function steer(m, dvx, dvz, dt, keep) {
    const want = Math.hypot(dvx, dvz), hx = want > 1e-3 ? dvx / want : Math.sin(m.yaw) * -1, hz = want > 1e-3 ? dvz / want : -Math.cos(m.yaw);
    let fx = 0, fz = 0;
    const push = (o, A0, B0) => {
      if (o === m) return;
      const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz) || 1e-3;
      if (d > 2.6) return;
      const nx = dx / d, nz = dz / d, rr = m.r + o.r, f = A0 * Math.exp((rr - d) / B0);
      const ahead = -(nx * hx + nz * hz), w = 0.3 + 0.7 * (1 + ahead) / 2;
      fx += nx * f * w; fz += nz * f * w;
      if (ahead > 0.55 && d < 2.4 && want > 0.2) { // go round it: sidestep away from the side it is on
        const lat = dx * -hz + dz * hx, side = lat >= 0 ? 1 : -1;
        fx += -hz * side * f * 0.7; fz += hx * side * f * 0.7;
      }
    };
    statics.near(m.x, m.z, (o) => push(o, o.person ? 2.4 : 3.2, 0.24));
    movers.near(m.x, m.z, (o) => push(o, o.isPlayer ? 3.4 : 2.0, o.isPlayer ? 0.35 : 0.3));
    let vx = dvx + fx * 0.55, vz = dvz + fz * 0.55;
    const sp = Math.hypot(vx, vz), cap = want * 1.3 + 0.25;
    if (sp > cap) { vx *= cap / sp; vz *= cap / sp; }
    const k = Math.min(1, dt * 5);
    m.vx += (vx - m.vx) * k; m.vz += (vz - m.vz) * k;
    m.x += m.vx * dt; m.z += m.vz * dt;
    // Stay where you belong, then never overlap anything solid (two passes settle crowded spots).
    const solve = (o) => { if (o === m) return; const dx = m.x - o.x, dz = m.z - o.z, d = Math.hypot(dx, dz), rr = m.r + o.r; if (d < rr && d > 1e-4) { m.x += (dx / d) * (rr - d); m.z += (dz / d) * (rr - d); } };
    for (let it = 0; it < 2; it++) { keep(m); statics.near(m.x, m.z, solve); movers.near(m.x, m.z, solve); }
    const speed = Math.hypot(m.vx, m.vz);
    if (speed > 0.15) { const target = Math.atan2(-m.vx, -m.vz); let d = target - m.yaw; d -= Math.round(d / TAU) * TAU; m.yaw += d * Math.min(1, dt * 6); }
    m.ph += speed * dt * (m.kid ? 5.6 : 4.6);
    return speed;
  }

  // Where each kind of person is allowed to be: walkways, the path, the beach.
  function keep(m) {
    if (m.kind === 'walk' && m.mode === 0) { m.x = m.s * Math.min(12.25, Math.max(9.7, Math.abs(m.x))); m.z = wrapZ(m.z); }
    else if (m.kind === 'path') m.z = Math.max(PZ - 1.9, Math.min(PZ + 1.9, m.z));
    else if (m.kind === 'shore' || m.kind === 'kid') m.x = Math.max(shoreX(m.z) - 1.5, Math.min(-45, m.x));
  }
  const seen = (cam, view, x, z, far = 85) => { const dx = x - cam.x, dz = z - cam.z; return dx * dx + dz * dz < far * far && dx * view.x + dz * view.z > -5; };
  const playerBody = { x: 0, z: 0, r: 0.35, isPlayer: true };
  const roadPeople = [];
  function update(t, dt, cam, view) {
    dt = Math.min(dt, 1 / 20);
    roadPeople.length = 0;
    movers.clear();
    for (const m of movers_) movers.add(m);
    playerBody.x = cam.x; playerBody.z = cam.z; movers.add(playerBody);
    for (const m of movers_) {
      let dvx = 0, dvz = 0;
      if (m.kind === 'walk') {
        if (m.mode === 0) {
          dvx = Math.max(-0.5, Math.min(0.5, (m.s * m.home - m.x) * 0.7)); dvz = m.dir * m.sp;
          if (r() < dt * 0.008 && Math.abs(m.z - S.bridgeZ) > 12) { m.mode = 1; m.tx = -m.s * R(10.6, 11.8); }
        } else dvx = Math.sign(m.tx - m.x) * m.sp * 1.15;
      } else if (m.kind === 'hawk') {
        if (m.pause > 0) m.pause -= dt; else { dvx = (m.s * S.hawkerX - m.x) * 1.0; dvz = m.dir * m.sp; if (Math.abs(m.z) > 150) m.dir = -Math.sign(m.z); if (r() < dt * 0.06) m.pause = R(2, 6); }
      } else if (m.kind === 'path') {
        dvx = m.dir * m.sp; dvz = (PZ + m.off - m.z) * 0.8;
        if (m.x > -14) m.dir = -1; if (m.x < -66) m.dir = 1;
      } else if (m.kind === 'shore') {
        dvx = (shoreX(m.z) + m.off - m.x) * 0.6; dvz = m.dir * m.sp;
        if (m.z > 60) m.dir = -1; if (m.z < -330) m.dir = 1;
      } else if (m.kind === 'kid') {
        const goal = shoreX(m.z) + m.base + m.tgt * 6;
        if (Math.abs(goal - m.x) < 0.5) m.tgt = -m.tgt;
        dvx = Math.sign(goal - m.x) * m.sp;
      }
      const speed = steer(m, dvx, dvz, dt, keep);
      if (m.kind === 'walk') {
        if (m.mode === 1 && Math.abs(m.tx - m.x) < 0.15) { m.mode = 0; m.s = -m.s; m.x = m.tx; }
        if (m.mode === 1 && Math.abs(m.x) < 8.0) roadPeople.push({ x: m.x, z: m.z });
      }
      m.moving = speed > 0.15;
    }
    const onBeach = cam.x < -38;
    for (const m of movers_) {
      const beachSide = m.kind === 'shore' || m.kind === 'kid';
      if ((beachSide && cam.x > -20) || (!beachSide && m.kind !== 'path' && onBeach)) continue;
      if (!seen(cam, view, m.x, m.z)) continue;
      const pose = m.kind === 'hawk' ? (m.moving ? POSE.carry : POSE.stand) : m.moving ? POSE.walk : POSE.stand;
      humans.draw(m.a, m.x, groundAt(m.x, m.z), m.z, m.yaw, pose, m.ph, m.a.phone && m.kind === 'walk' ? 4 : 0);
    }
    for (const p of still) {
      if ((p.beach && cam.x > -20) || (!p.beach && onBeach) || !seen(cam, view, p.x, p.z)) continue;
      const y = p.pose === POSE.sit ? seatY(p.a, p.top) : groundAt(p.x, p.z);
      humans.draw(p.a, p.x, y, p.z, p.yaw, p.pose, 0, p.gest);
    }
    return roadPeople;
  }

  // You bump into people and props instead of walking through them.
  function pushOut(p, rad = 0.35) {
    const solve = (o) => { if (o.isPlayer) return; const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz), rr = rad + o.r; if (d < rr && d > 1e-4) { p.x += (dx / d) * (rr - d); p.z += (dz / d) * (rr - d); } };
    statics.near(p.x, p.z, solve); movers.near(p.x, p.z, solve);
  }
  // For checking the simulation: overlaps with solid things and how fast people are really moving.
  function stats() {
    let overlaps = 0, speed = 0;
    for (const m of movers_) {
      speed += Math.hypot(m.vx, m.vz);
      statics.near(m.x, m.z, (o) => { if (Math.hypot(m.x - o.x, m.z - o.z) < m.r + o.r - 0.05) overlaps++; });
      for (const o of movers_) if (o !== m && Math.hypot(m.x - o.x, m.z - o.z) < m.r + o.r - 0.05) overlaps++;
    }
    return { people: movers_.length, overlaps, avgSpeed: +(speed / movers_.length).toFixed(2) };
  }
  return { update, pushOut, stats };
}
