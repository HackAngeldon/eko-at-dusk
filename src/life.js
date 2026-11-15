import * as THREE from 'three';
import { MeshBuilder, makeRng, col, cable, TAU } from './util.js';
import { shoreX, sandHeight, swellAt, WL } from './ocean.js';
import { canoe } from './beach.js';
import { applyWind, uTime } from './wind.js';
import { S } from './city.js';

// Things that move on and around the beach: gulls, flags and bunting in the sea breeze,
// smoke from the suya grill, sand blowing low over the ground, fishing canoes riding the swell,
// and cargo ships waiting at anchor offshore (as Lagos always has).
export function buildLife(T, beach) {
  const r = makeRng(777), R = (a = 0, b = 1) => a + (b - a) * r();
  const group = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // ---------- Gulls: glide, bank, and flap now and then ----------
  const gb = new MeshBuilder(), white = [0.92, 0.92, 0.9], grey = [0.55, 0.57, 0.6], tip = [0.08, 0.08, 0.09];
  gb.box(0, -0.05, 0, 0.12, 0.1, 0.38, white); gb.box(0, -0.02, -0.22, 0.08, 0.08, 0.1, white); gb.box(0, -0.04, -0.29, 0.03, 0.02, 0.06, [0.85, 0.6, 0.1]);
  gb.box(0, -0.04, 0.24, 0.1, 0.02, 0.12, white);
  for (const s of [-1, 1]) {
    gb.quad([s * 0.05, 0, -0.08], [s * 0.45, 0, -0.06], [s * 0.45, 0, 0.1], [s * 0.05, 0, 0.12], grey, [0, 0, 1, 1], [0, 1, 0]);
    gb.quad([s * 0.45, 0, -0.06], [s * 0.82, 0, 0.0], [s * 0.82, 0, 0.08], [s * 0.45, 0, 0.1], tip, [0, 0, 1, 1], [0, 1, 0]);
  }
  const gullMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  gullMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.31;
        float ax = abs(position.x);
        float flap = sin(uTime * 9.0 + ph) * smoothstep(0.1, 0.6, sin(uTime * 0.55 + ph * 1.3));
        transformed.y += smoothstep(0.05, 0.45, ax) * 0.1 - smoothstep(0.45, 0.82, ax) * 0.06 + flap * ax * 0.6;`);
  };
  const gulls = [];
  for (let i = 0; i < 26; i++) gulls.push({ cx: R(-170, -85), cy: R(7, 24), cz: R(-260, 50), rad: R(8, 26), w: R(0.12, 0.3) * (r() < 0.5 ? -1 : 1), a: R(0, TAU) });
  const gullIM = new THREE.InstancedMesh(gb.build(), gullMat, gulls.length);
  gullIM.frustumCulled = false; group.add(gullIM);

  // ---------- Ships at anchor offshore ----------
  const sb = new MeshBuilder(), lamp = new MeshBuilder();
  for (let i = 0; i < 5; i++) {
    const x = R(-680, -570), z = -650 + i * 190 + R(-40, 40), L = R(140, 210), Bm = R(20, 30), hull = col(['#3a3f44', '#5a2a22', '#2d3a4a', '#41443f'][i % 4]);
    sb.box(x, WL - 3, z, Bm, 10, L, hull);
    sb.box(x, WL + 7, z + L * 0.38, Bm * 0.8, 14, 16, col('#d8d6d0'));
    sb.box(x, WL + 21, z + L * 0.4, 3, 8, 3, col('#3a3a3a'));
    for (let k = 0; k < 4; k++) { const cz = z - L * 0.35 + k * L * 0.18; sb.box(x, WL + 7, cz, 2, 12, 2, col('#c9a23a')); sb.box(x + 6, WL + 18, cz, 14, 1.2, 1.2, col('#c9a23a')); }
    if (r() < 0.6) for (let k = 0; k < 10; k++) sb.box(x + R(-Bm / 3, Bm / 3), WL + 7, z - L * 0.3 + k * L * 0.06, 5, 2.6 * Math.ceil(R(1, 3)), 6, col(['#b3261e', '#1f5fa0', '#2e7d32', '#d08a1d'][k % 4]));
    for (const lz of [-L / 2, L / 2, L * 0.38]) lamp.box(x, WL + (lz === L * 0.38 ? 23 : 12), z + lz, 0.8, 0.8, 0.8, [8, 7, 5]);
  }
  group.add(new THREE.Mesh(sb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  group.add(new THREE.Mesh(lamp.build(), new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })));

  // ---------- Fishing canoes riding the swell ----------
  const boats = [];
  for (const z of [-45, -175, -300]) {
    const b = new MeshBuilder(); canoe(b, 0, -0.2, 0, Math.PI / 2 + R(-0.4, 0.4), [['#1d4fa0', '#f2c418', '#c0262d'], ['#2e8b3e', '#f4f1e8', '#1d1d1d'], ['#c0262d', '#f4f1e8', '#1d4fa0']][boats.length]);
    b.cyl(0.5, 0.1, 0, 0.02, 2.2, col('#6a5030'), 5);
    const mesh = new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
    mesh.position.set(shoreX(z) - R(50, 90), WL, z); group.add(mesh); boats.push(mesh);
  }

  // ---------- Flags and bunting ----------
  const flagC = document.createElement('canvas'); flagC.width = 96; flagC.height = 48;
  const fg = flagC.getContext('2d'); fg.fillStyle = '#008751'; fg.fillRect(0, 0, 96, 48); fg.fillStyle = '#ffffff'; fg.fillRect(32, 0, 32, 48);
  const flagT = new THREE.CanvasTexture(flagC); flagT.colorSpace = THREE.SRGBColorSpace;
  const flagMat = new THREE.MeshStandardMaterial({ map: flagT, side: THREE.DoubleSide, roughness: 0.85 });
  flagMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = modelMatrix[3].z * 0.13;
        transformed.z += (sin(uv.x * 7.0 - uTime * 8.5 + ph) * 0.13 + sin(uv.x * 15.0 - uTime * 13.0 + ph) * 0.04) * uv.x;
        transformed.y -= uv.x * uv.x * 0.08 * (1.0 + sin(uTime * 0.7 + ph));`);
  };
  const poles = new MeshBuilder(), flagSpots = [beach.huts[0], beach.huts[1], new THREE.Vector3(-46, 0, S.pathZ + 3)];
  for (const f of flagSpots) {
    const y = sandHeight(f.x, f.z);
    poles.cyl(f.x, y - 0.2, f.z, 0.04, 6.4, col('#cfcfcf'), 6);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9, 14, 4).translate(0.9, 0, 0), flagMat);
    flag.position.set(f.x + 0.04, y + 5.7, f.z); group.add(flag);
  }
  group.add(new THREE.Mesh(poles.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.4 })));
  const bunt = new MeshBuilder(), rope = [];
  const cols = ['#d7262e', '#f2c418', '#1d63b8', '#2e8b3e', '#f28c1e', '#ffffff'].map((h) => col(h));
  for (const [a, b] of [[beach.huts[0], beach.huts[1]], [beach.huts[0], beach.huts[2]], [beach.huts[1], beach.huts[3]]]) {
    const n = Math.floor(a.distanceTo(b) / 0.55);
    cable(rope, [a.x, a.y + 1.2, a.z], [b.x, b.y + 1.2, b.z], 0.9, 24);
    for (let i = 1; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.7) / n, P = (t) => [a.x + (b.x - a.x) * t, a.y + 1.2 + (b.y - a.y) * t - 0.9 * 4 * t * (1 - t), a.z + (b.z - a.z) * t];
      const p0 = P(t0), p1 = P(t1), tipP = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 0.32, (p0[2] + p1[2]) / 2];
      bunt.tri(p0, p1, tipP, cols[i % cols.length]);
    }
  }
  group.add(new THREE.Mesh(bunt.build(), applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), 'cloth')));
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
  group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x2a2520 })));

  // ---------- Grill smoke ----------
  const NS = 60, sp = new Float32Array(NS * 3), sl = new Float32Array(NS), seeds = [];
  for (let i = 0; i < NS; i++) { sl[i] = i / NS; seeds.push([R(-0.3, 0.3), R(0.7, 1.3), R(0, TAU)]); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aLife', new THREE.BufferAttribute(sl, 1));
  const smoke = new THREE.Points(sg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { map: { value: T.glow } },
    vertexShader: 'attribute float aLife; varying float vL; void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (0.5 + aLife * 2.6) * 520.0 / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying float vL; void main(){ float a = texture2D(map, gl_PointCoord).g * (1.0 - vL) * smoothstep(0.0, 0.08, vL) * 0.3; gl_FragColor = vec4(vec3(0.62, 0.6, 0.58) * (1.0 - vL * 0.3), a); }',
  }));
  smoke.frustumCulled = false; group.add(smoke);

  // ---------- Sand blowing low over the beach ----------
  const ND = 500, dp = new Float32Array(ND * 3), dv = [];
  for (let i = 0; i < ND; i++) dv.push([R(-25, 25), R(0.02, 0.4), R(-25, 25), R(3, 7)]);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const drift = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x8c7a60, size: 0.022, transparent: true, opacity: 0.45, depthWrite: false }));
  drift.frustumCulled = false; group.add(drift);

  function update(t, dt, player) {
    gulls.forEach((g, i) => {
      g.a += g.w * dt;
      const x = g.cx + Math.cos(g.a) * g.rad, z = g.cz + Math.sin(g.a) * g.rad, y = g.cy + Math.sin(g.a * 0.7 + i) * 1.6;
      const vx = -Math.sin(g.a) * g.w, vz = Math.cos(g.a) * g.w;
      q.setFromEuler(e.set(Math.sin(t * 0.8 + i) * 0.06, Math.atan2(-vx, -vz), Math.sign(g.w) * 0.38));
      gullIM.setMatrixAt(i, m4.compose(p.set(x, y, z), q, one));
    });
    gullIM.instanceMatrix.needsUpdate = true;
    for (const b of boats) {
      const s = swellAt(b.position.x, b.position.z, t);
      b.position.y = WL + s - 0.05;
      b.rotation.z = Math.sin(t * 1.1 + b.position.z) * 0.06; b.rotation.x = Math.cos(t * 0.9 + b.position.z) * 0.04;
    }
    const gp = beach.grill, gust = 0.6 + 0.4 * Math.sin(t * 0.31);
    for (let i = 0; i < NS; i++) {
      sl[i] += dt * 0.16 * seeds[i][1];
      if (sl[i] > 1) sl[i] -= 1;
      const l = sl[i];
      sp.set([gp.x + seeds[i][0] + l * 5.5 * gust + l * l * 3, gp.y + l * 3.2 * seeds[i][1], gp.z + Math.sin(l * 6 + seeds[i][2]) * 0.4 * l], i * 3);
    }
    sg.attributes.position.needsUpdate = true; sg.attributes.aLife.needsUpdate = true;
    drift.visible = player.x < -42;
    if (drift.visible) {
      for (let i = 0; i < ND; i++) {
        const v = dv[i];
        v[0] += v[3] * dt * gust;
        if (v[0] > 25) { v[0] -= 50; v[2] = R(-25, 25); }
        const x = player.x + v[0], z = player.z + v[2];
        dp.set([x, sandHeight(x, z) + v[1], z], i * 3);
      }
      dg.attributes.position.needsUpdate = true;
    }
  }
  return { group, update };
}
