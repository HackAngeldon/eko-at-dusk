import * as THREE from 'three';
import { SUN, HAZE, SUN_HAZE, FOG_DENSITY } from './atmosphere.js';
import { S } from './city.js';
import { makeRng } from './util.js';
import { normalFrom } from './textures.js';

// The beach lies west of the street (negative x). Sea level, the curving shoreline and the shape of
// the sand are shared by JavaScript (walking, placing things) and the water shader (depth, foam).
export const WL = -1.3;
export const PERIOD = 8.5, WAVELENGTH = 24;
export const shoreX = (z) => -125 + 6 * Math.sin(z * 0.012) + 3 * Math.sin(z * 0.031 + 1.3);
export function baseSand(x, z) {
  const d = x - shoreX(z);
  return d > 0 ? WL + Math.min(d, 30) * 0.03 + Math.max(d - 30, 0) * 0.0075 : WL + d * 0.04;
}
const SHORE_GLSL = `
  float shoreX(float z) { return -125.0 + 6.0 * sin(z * 0.012) + 3.0 * sin(z * 0.031 + 1.3); }
  float baseSand(vec2 p) { float d = p.x - shoreX(p.y); return d > 0.0 ? ${WL.toFixed(2)} + min(d, 30.0) * 0.03 + max(d - 30.0, 0.0) * 0.0075 : ${WL.toFixed(2)} + d * 0.04; }`;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi) + (hash(xi + 1, zi) - hash(xi, zi)) * u, b = hash(xi, zi + 1) + (hash(xi + 1, zi + 1) - hash(xi, zi + 1)) * u;
  return a + (b - a) * v;
}
// Full sand height, with low grassy dunes at the back of the beach and a flattened footpath.
export function sandHeight(x, z) {
  let h = baseSand(x, z);
  const m = smooth(-86, -64, x) * smooth(-40, -48, x) * (1 - smooth(6, 2.6, Math.abs(z - S.pathZ)));
  h += m * (0.15 + 0.75 * (vnoise(x * 0.08, z * 0.05) * 0.7 + vnoise(x * 0.2, z * 0.17) * 0.3));
  return h + (vnoise(x * 0.7, z * 0.7) - 0.5) * 0.04;
}
// Open-water swell height in JavaScript (for boats bobbing offshore).
export const swellAt = (x, z, t) => 0.22 * Math.sin((x * 0.984 + z * 0.177) * 0.12 - t * 1.05) + 0.12 * Math.sin((x * 0.93 - z * 0.36) * 0.21 - t * 1.4 + 1.7);

const f = (n) => n.toFixed(5), v3 = (v) => `vec3(${f(v.x ?? v.r)}, ${f(v.y ?? v.g)}, ${f(v.z ?? v.b)})`;
const SKY_GLSL = `
  vec3 skyCol(vec3 d) {
    float h = max(d.y, 0.0), mu = dot(d, ${v3(SUN)});
    vec3 c = mix(vec3(0.78, 0.5, 0.42), vec3(0.035, 0.06, 0.16), pow(h, 0.42));
    c += vec3(1.0, 0.42, 0.16) * pow(max(mu, 0.), 5.) * 0.55 * (1.0 - h);
    c += vec3(1.0, 0.66, 0.38) * pow(max(mu, 0.), 60.) * 1.6;
    float fogI = 1.0 - exp(-${f(FOG_DENSITY)} * 0.7 / (0.055 * max(d.y, 0.0015)));
    return mix(c, mix(${v3(HAZE)}, ${v3(SUN_HAZE)}, pow(max(mu, 0.), 6.) * 0.85), fogI);
  }`;
// Surf: an open-sea swell, plus sets of waves that grow as the sea bed rises, break about 25 m out
// with a steep face, roll in as a foaming bore, and finally surge up the sand and drain back.
const WAVES_GLSL = `
  const float PER = ${PERIOD.toFixed(1)}, LAM = ${WAVELENGTH.toFixed(1)};
  float vn(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
    float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5), b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5);
    float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5), d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y); }
  float swell(vec2 p, float t) {
    return 0.22 * sin(dot(p, vec2(0.984, 0.177)) * 0.12 - t * 1.05)
         + 0.12 * sin(dot(p, vec2(0.93, -0.36)) * 0.21 - t * 1.4 + 1.7)
         + 0.05 * sin(dot(p, vec2(0.6, 0.8)) * 0.45 - t * 2.1);
  }
  // Phase of the breaking waves: w = 0 at a crest, crests travel toward the shore.
  float phaseW(vec2 p, float t, out float d, out float off) {
    d = p.x - shoreX(p.y);
    off = 0.09 * sin(p.y * 0.031 + 1.0) + 0.05 * sin(p.y * 0.083 + 2.0) + 0.03 * sin(p.y * 0.19);
    return fract(t / PER - d / LAM + off);
  }
  float crestShape(float w) { return max(pow(max(1.0 - w * 1.7, 0.0), 2.0), smoothstep(0.86, 1.0, w)); }
  float seaHeight(vec2 p, float t) {
    float d, off, w = phaseW(p, t, d, off);
    float depth0 = ${WL.toFixed(2)} - baseSand(p);
    float shoal = smoothstep(-95.0, -26.0, d), broken = smoothstep(-28.0, -20.0, d);
    float H = mix(0.16, 0.8, shoal) * (1.0 - broken * 0.7) * smoothstep(0.0, 0.9, depth0);
    float h = crestShape(w) * H + swell(p, t) * (1.0 - shoal * 0.85);
    float w0 = fract(t / PER + off);
    float run = 0.32 * smoothstep(0.0, 0.1, w0) * exp(-max(w0 - 0.1, 0.0) * 3.4);
    return h + run * smoothstep(-22.0, 0.0, d);
  }`;

// Tileable ripple normal map from integer-frequency waves (no visible seams when it repeats).
function rippleMap() {
  const r = makeRng(55), N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), img = g.createImageData(N, N), waves = [];
  for (let i = 0; i < 14; i++) { const k = 2 + Math.floor(r() * 12), a = r() * Math.PI * 2; waves.push([Math.round(Math.cos(a) * k), Math.round(Math.sin(a) * k), r() * 6.3, 1 / k]); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let h = 0; for (const [kx, ky, ph, amp] of waves) h += amp * Math.sin(((kx * x + ky * y) / N) * Math.PI * 2 + ph);
    const v = 128 + h * 120, i = (y * N + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return normalFrom(c, 2.2);
}

export function buildOcean() {
  const xs = [], zs = [];
  for (let x = -92; x > -260; x -= 1.0) xs.push(x);
  for (let x = -260, st = 2; x > -1500; st *= 1.12, x -= st) xs.push(x);
  for (let z = -1500, st = 60; z < -440; st = Math.max(2, st / 1.12), z += st) zs.push(z);
  for (let z = -440; z < 180; z += 1.6) zs.push(z);
  for (let z = 180, st = 2; z < 1500; st *= 1.12, z += st) zs.push(z);
  const nx = xs.length, nz = zs.length, pos = new Float32Array(nx * nz * 3), idx = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) pos.set([xs[i], 0, zs[j]], (j * nx + i) * 3);
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, nMap: { value: null } }]);
  uniforms.nMap.value = rippleMap();
  const mat = new THREE.ShaderMaterial({
    uniforms, fog: true, transparent: true,
    vertexShader: `uniform float time; varying vec3 vW; varying float vSand;
      #include <fog_pars_vertex>
      ${SHORE_GLSL} ${WAVES_GLSL}
      void main() {
        vec2 p = position.xz;
        vec3 transformed = vec3(p.x, ${WL.toFixed(2)} + seaHeight(p, time), p.y);
        vW = transformed; vSand = baseSand(p);
        gl_Position = projectionMatrix * viewMatrix * vec4(transformed, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float time; uniform sampler2D nMap; varying vec3 vW; varying float vSand;
      #include <fog_pars_fragment>
      ${SHORE_GLSL} ${WAVES_GLSL} ${SKY_GLSL}
      void main() {
        vec2 p = vW.xz; float e = 0.35, h0 = seaHeight(p, time);
        vec3 n = normalize(vec3(-(seaHeight(p + vec2(e, 0.0), time) - h0) / e, 1.0, -(seaHeight(p + vec2(0.0, e), time) - h0) / e));
        vec3 n1 = texture2D(nMap, p * 0.09 + time * vec2(0.016, 0.006)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(nMap, p * 0.31 - time * vec2(0.009, -0.027)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(nMap, p * 1.1 + time * vec2(-0.05, 0.04)).xyz * 2.0 - 1.0;
        vec2 rip = n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.2;
        vec3 V = normalize(cameraPosition - vW);
        float dist = length(cameraPosition - vW);
        n = normalize(n + vec3(rip.x, 0.0, rip.y) * mix(0.75, 0.25, smoothstep(30.0, 300.0, dist)));
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        vec3 refl = skyCol(R) * 0.92;
        float sd = max(dot(R, ${v3(SUN)}), 0.0);
        vec3 spec = vec3(1.0, 0.8, 0.55) * (pow(sd, 1400.0) * 110.0 + pow(sd, 140.0) * 1.4);
        float depth = vW.y - vSand;
        vec3 body = mix(vec3(0.045, 0.2, 0.17), vec3(0.006, 0.035, 0.05), 1.0 - exp(-depth * 0.35));
        body = mix(vec3(0.48, 0.38, 0.27), body, 1.0 - exp(-depth * 2.4));
        float d, off, w = phaseW(p, time, d, off);
        float crest = crestShape(w);
        float sss = pow(max(dot(-V, ${v3(SUN)}), 0.0), 3.0) * crest * smoothstep(-95.0, -26.0, d) * (1.0 - smoothstep(-26.0, -14.0, d));
        body += vec3(0.07, 0.33, 0.26) * sss * 1.6;
        vec3 c = mix(body * vec3(1.0, 0.86, 0.76), refl, fres) + spec;
        float tx = vn(p * 1.1 + vec2(time * 0.35, 0.0)) * 0.5 + vn(p * 2.9 - vec2(0.0, time * 0.45)) * 0.33 + vn(p * 7.3 + time * 0.3) * 0.17;
        float breaking = smoothstep(-29.0, -21.0, d) * (1.0 - smoothstep(-1.0, 2.0, d));
        float bore = (smoothstep(0.84, 0.99, w) + exp(-w * 10.0)) * breaking;
        float trail = exp(-w * 2.6) * breaking;
        float edge = smoothstep(0.09, 0.0, depth) * smoothstep(-0.01, 0.02, depth);
        float lace = smoothstep(0.55, 0.78, tx) * smoothstep(-32.0, -4.0, d) * 0.4;
        float foam = clamp(bore * smoothstep(0.22, 0.55, tx) + trail * smoothstep(0.48, 0.8, tx) * 0.8 + edge * smoothstep(0.25, 0.6, tx) + lace, 0.0, 1.0);
        vec3 foamC = vec3(0.86, 0.83, 0.78) * (0.62 + 0.38 * max(dot(n, ${v3(SUN)}), 0.0));
        c = mix(c, foamC, foam * 0.94);
        float alpha = smoothstep(0.0, 0.1, depth) * (0.82 + 0.18 * foam);
        gl_FragColor = vec4(c, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2;
  return { mesh, uniforms };
}

// Sand textures: grains, broken shell and wind ripples.
function sandTextures() {
  const r = makeRng(31), R = (a = 0, b = 1) => a + (b - a) * r();
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#d2bd98'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) { g.fillStyle = ['#a68e6a', '#efe0c4', '#8a7558', '#c9b48e'][i % 4]; g.globalAlpha = R(0.25, 0.7); g.fillRect(R(0, 512), R(0, 512), R(0.6, 2), R(0.6, 2)); }
  for (let i = 0; i < 70; i++) { g.fillStyle = '#f6efe2'; g.globalAlpha = R(0.5, 0.9); g.beginPath(); g.ellipse(R(0, 512), R(0, 512), R(1, 3), R(0.8, 2), R(0, 3), 0, 7); g.fill(); }
  g.globalAlpha = 1;
  const h = document.createElement('canvas'); h.width = h.height = 256; const hg = h.getContext('2d'), img = hg.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const v = 0.5 + 0.18 * Math.sin(x * 0.42 + Math.sin(y * 0.09) * 3 + vnoise(x * 0.05, y * 0.05) * 4) + 0.2 * (hash(x, y) - 0.5), i = (y * 256 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255; img.data[i + 3] = 255;
  }
  hg.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8;
  return { map, h };
}

// The beach surface. Shadows from palms and huts are baked into the vertices once (the sun never moves).
export function buildSand(occluders) {
  const { map, h } = sandTextures(), normalMap = normalFrom(h, 2.5);
  const x0 = -240, x1 = -40, z0 = -360, z1 = 90, dx = 1.25, dz = 1.5;
  const nx = Math.round((x1 - x0) / dx) + 1, nz = Math.round((z1 - z0) / dz) + 1;
  const pos = new Float32Array(nx * nz * 3), colr = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2), sun = new Float32Array(nx * nz), idx = [];
  const dry = new THREE.Color('#e3cfa8'), wet = new THREE.Color('#8a7459'), under = new THREE.Color('#6a5a44'), drift = new THREE.Color('#6f5f4c'), cc = new THREE.Color();
  const sx = SUN.x, sy = SUN.y, sz = SUN.z;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * dx, z = z0 + j * dz, y = sandHeight(x, z), k = j * nx + i, d = x - shoreX(z);
    pos.set([x, y, z], k * 3); uv.set([x / 4, z / 4], k * 2);
    cc.copy(dry).multiplyScalar(0.92 + 0.12 * vnoise(x * 0.3, z * 0.3));
    cc.lerp(wet, 1 - smooth(4, 15, d));
    if (d < 0) cc.lerp(under, Math.min(1, -d / 6));
    const line = Math.exp(-((d - 16 - 3 * vnoise(z * 0.1, 3)) ** 2) / 3) * smooth(0.45, 0.7, vnoise(x * 0.9, z * 0.9));
    cc.lerp(drift, line * 0.8);
    colr.set([cc.r, cc.g, cc.b], k * 3);
    let vis = 1;
    for (const o of occluders) {
      const ox = o.x - x, oy = o.y - y, oz = o.z - z, t = ox * sx + oy * sy + oz * sz;
      if (t <= 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 < o.r * o.r) vis *= 1 - o.k * smooth(o.r, o.r * 0.45, Math.sqrt(d2));
    }
    sun[k] = vis;
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c2 = a + nx, d2 = c2 + 1; idx.push(a, c2, b, b, c2, d2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSun', new THREE.BufferAttribute(sun, 1));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.11, 0.11), vertexColors: true, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSun; varying float vSunV; varying vec3 vSandW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSunV = aSun; vSandW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vSunV; varying vec3 vSandW; ${SHORE_GLSL}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat wetS = 1.0 - smoothstep(2.0, 13.0, vSandW.x - shoreX(vSandW.z)); roughnessFactor = mix(roughnessFactor, 0.12, wetS);')
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directDiffuse *= vSunV; reflectedLight.directSpecular *= vSunV;');
  };
  return new THREE.Mesh(geo, mat);
}
