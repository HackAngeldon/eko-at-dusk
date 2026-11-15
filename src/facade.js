import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Interior mapping: behind every window pane the shader works out, per pixel, which wall, floor or
// ceiling of an imaginary room the view ray would hit. Rooms get their own paint, lights on or off,
// a fluorescent tube, a door, and curtains. The building stays a flat box; the rooms look 3D.
// Each window carries aRoom = (centre along the street, floor height, room width, random seed).
export function windowMaterial(frames) {
  const m = new THREE.MeshStandardMaterial({ map: frames.map, roughness: 0.55, metalness: 0, envMapIntensity: 1.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoom; varying vec4 vRoom; varying vec3 vWinPos; varying vec3 vWinNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoom = aRoom; vWinPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWinNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vRoom; varying vec3 vWinPos; varying vec3 vWinNrm;
        float wH(float n) { return fract(sin(n * 12.9898) * 43758.5453); }
        vec3 roomColor(vec3 P, vec3 V, vec3 inward, vec4 room) {
          float H = 3.1, D = 4.2, seed = room.w;
          vec3 p = vec3((P.z - room.x) / room.z + 0.5, (P.y - room.y) / H, 0.0);
          vec3 d = vec3(V.z / room.z, V.y / H, max(dot(V, inward), 1e-3) / D);
          d.xy = sign(d.xy + 1e-6) * max(abs(d.xy), vec2(1e-4)); // no divide-by-zero, so no NaN pixels
          vec3 tb = (step(0.0, d) - p) / d;
          float t = min(min(tb.x, tb.y), tb.z);
          vec3 h = p + d * t;
          float lit = step(0.42, wH(seed * 1.7));
          vec3 lc = wH(seed * 2.9) > 0.45 ? vec3(1.0, 0.7, 0.4) : vec3(0.82, 0.94, 1.0);
          vec3 wall = mix(vec3(0.62, 0.56, 0.46), vec3(0.5, 0.58, 0.6), wH(seed * 7.1)) * mix(0.75, 1.1, wH(seed * 3.3));
          vec3 c;
          if (t == tb.z) {
            c = wall;
            float dx = 0.12 + 0.55 * wH(seed * 5.7);
            if (h.x > dx && h.x < dx + 0.26 && h.y < 0.68) c = vec3(0.22, 0.13, 0.07);
            if (wH(seed * 8.3) > 0.5 && abs(h.x - 0.72) < 0.1 && abs(h.y - 0.55) < 0.08) c = vec3(0.6, 0.45, 0.3);
            if (h.y < 0.04) c *= 0.5;
          } else if (t == tb.y) {
            if (d.y > 0.0) {
              c = vec3(0.8, 0.78, 0.72);
              c += lit * 5.0 * smoothstep(0.06, 0.0, abs(h.z - 0.45)) * smoothstep(0.32, 0.26, abs(h.x - 0.5));
            } else c = mix(vec3(0.3, 0.2, 0.13), vec3(0.42, 0.4, 0.36), wH(seed * 9.1));
          } else c = wall * 0.82;
          float fall = mix(1.0, 0.4, h.z);
          vec3 col = c * (lit > 0.5 ? lc * 0.85 * fall : vec3(0.035, 0.032, 0.03) * (1.4 - h.z));
          if (wH(seed * 4.4) > 0.3) {
            float wx = (P.z - room.x) / 0.65, open = 0.2 + 0.6 * wH(seed * 6.6);
            if (abs(wx) > open || wH(seed * 7.7) > 0.85) {
              vec3 cc = mix(vec3(0.55, 0.12, 0.1), vec3(0.85, 0.75, 0.55), wH(seed * 3.9));
              cc = mix(cc, vec3(0.2, 0.3, 0.55), step(0.75, wH(seed * 2.2)));
              float fold = 0.75 + 0.25 * sin(wx * 38.0);
              col = cc * fold * (lit > 0.5 ? lc * 0.55 : vec3(0.06));
            }
          }
          return col;
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float glassM = 1.0 - diffuseColor.a; diffuseColor.a = 1.0;
        vec3 inwardW = -normalize(vWinNrm);
        vec3 Vd = normalize(vWinPos - cameraPosition);
        vec3 roomC = roomColor(vWinPos, Vd, inwardW, vRoom);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012), glassM);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.04, glassM);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fres = pow(1.0 - clamp(dot(-Vd, -inwardW), 0.0, 1.0), 4.0);
        totalEmissiveRadiance += roomC * glassM * (1.0 - fres * 0.85);`);
  };
  return m;
}

// --- Small things bolted to buildings, drawn as instances ------------------------------------
function colored(geo, c) {
  geo = geo.index ? geo.toNonIndexed() : geo;
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}
// Turned concrete baluster, 0.8 m tall.
export function balusterGeo() {
  const pts = [[0.07, 0], [0.07, 0.07], [0.042, 0.12], [0.076, 0.36], [0.036, 0.62], [0.07, 0.72], [0.07, 0.8], [0, 0.8]];
  return colored(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 6), [1, 1, 1]);
}
// Satellite dish on a bracket, facing +z before rotation.
export function dishGeo() {
  const dish = new THREE.LatheGeometry([0, 0.1, 0.2, 0.3, 0.36].map((r) => new THREE.Vector2(r, r * r * 0.7)), 16).rotateX(-Math.PI / 2 + 0.6).translate(0, 0.55, 0);
  const arm = new THREE.CylinderGeometry(0.015, 0.015, 0.45, 5).rotateX(1.1).translate(0, 0.62, 0.2);
  const lnb = new THREE.BoxGeometry(0.06, 0.06, 0.1).translate(0, 0.78, 0.38);
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6).translate(0, 0.27, 0);
  return mergeGeometries([colored(dish, [0.85, 0.85, 0.83]), colored(arm, [0.3, 0.3, 0.3]), colored(lnb, [0.2, 0.2, 0.2]), colored(pole, [0.35, 0.35, 0.35])]);
}
// Split air-conditioner outdoor unit with its fan.
export function acGeo() {
  const body = new THREE.BoxGeometry(0.8, 0.55, 0.3).translate(0, 0.275, 0);
  const fan = new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16).rotateX(Math.PI / 2).translate(-0.1, 0.28, 0.155);
  const grille = new THREE.TorusGeometry(0.2, 0.012, 4, 20).translate(-0.1, 0.28, 0.16);
  const legs = new THREE.BoxGeometry(0.04, 0.04, 0.4).translate(0, -0.02, -0.05);
  return mergeGeometries([colored(body, [0.82, 0.81, 0.78]), colored(fan, [0.08, 0.08, 0.08]), colored(grille, [0.6, 0.6, 0.6]), colored(legs, [0.25, 0.25, 0.25])]);
}
// Ribbed black plastic water tank on a steel stand.
export function tankGeo() {
  const prof = [];
  for (let i = 0; i <= 12; i++) prof.push(new THREE.Vector2(0.68 + (i % 2 ? 0.03 : 0), 1.0 + i * 0.12));
  prof.unshift(new THREE.Vector2(0.6, 1.0)); prof.push(new THREE.Vector2(0.4, 2.5), new THREE.Vector2(0.2, 2.56), new THREE.Vector2(0, 2.56));
  const tank = new THREE.LatheGeometry(prof, 18);
  const parts = [colored(tank, [0.06, 0.06, 0.06])];
  for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) parts.push(colored(new THREE.BoxGeometry(0.06, 1.0, 0.06).translate(x, 0.5, z), [0.2, 0.18, 0.16]));
  parts.push(colored(new THREE.BoxGeometry(1.3, 0.06, 1.3).translate(0, 0.98, 0), [0.22, 0.2, 0.18]));
  return mergeGeometries(parts);
}

// One InstancedMesh from a list of {x, y, z, ry, s, c}.
export function instances(geo, mat, list, shadow = true) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach((o, i) => {
    q.setFromEuler(e.set(0, o.ry || 0, 0)); m.compose(p.set(o.x, o.y, o.z), q, s.setScalar(o.s || 1));
    im.setMatrixAt(i, m);
    if (o.c) im.setColorAt(i, new THREE.Color(o.c[0], o.c[1], o.c[2]));
  });
  im.count = list.length; im.castShadow = shadow; im.receiveShadow = true;
  return im;
}
