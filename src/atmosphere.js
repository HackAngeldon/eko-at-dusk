import * as THREE from 'three';

// Realism tricks that cost almost nothing per frame:
//  - one fixed low sun (so shadows can be baked once),
//  - height fog that thins with altitude and glows toward the sun,
//  - a sky that blends into exactly the same haze at the horizon,
//  - darkening where walls meet the ground (fake ambient occlusion),
//  - a camera "grade": vignette, faint lens fringing and film grain.
export const SUN = new THREE.Vector3(-0.21, 0.23, -0.95).normalize();
export const HAZE = new THREE.Color('#9c7a66');
export const SUN_HAZE = new THREE.Color('#ffa45e');
export const FOG_DENSITY = 0.0043;
const FALLOFF = 0.055;

const f = (n) => n.toFixed(5);
const v3 = (v) => `vec3(${f(v.x ?? v.r)}, ${f(v.y ?? v.g)}, ${f(v.z ?? v.b)})`;

export function patchFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex = `#ifdef USE_FOG
    vec4 fogW = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      fogW = instanceMatrix * fogW;
    #endif
    vFogWorld = ( modelMatrix * fogW ).xyz;
  #endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear; uniform float fogFar;
      #define fogDensity 0.01
    #endif
  #endif`;
  C.fog_fragment = `#ifdef USE_FOG
    vec3 fRay = vFogWorld - cameraPosition;
    float fDist = length( fRay );
    vec3 fDir = fRay / max( fDist, 1e-3 );
    float fK = ${f(FALLOFF)};
    float fDy = fRay.y * fK;
    float fInt = abs( fDy ) > 1e-3 ? ( 1.0 - exp( -fDy ) ) / fDy : 1.0;
    float fAmt = fogDensity * exp( -max( cameraPosition.y, 0.0 ) * fK ) * fDist * fInt;
    float fogFactor = 1.0 - exp( -fAmt );
    float fSun = pow( max( dot( fDir, ${v3(SUN)} ), 0.0 ), 6.0 );
    vec3 fCol = mix( fogColor, ${v3(SUN_HAZE)}, fSun * 0.85 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fCol, fogFactor );
  #endif`;
}

export function makeSky() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { haze: { value: HAZE }, fogD: { value: FOG_DENSITY } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 haze; uniform float fogD; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = max(d.y, 0.0); vec3 S = ${v3(SUN)};
        float mu = dot(d, S);
        vec3 zen = vec3(0.035, 0.06, 0.16), hor = vec3(0.78, 0.5, 0.42);
        vec3 c = mix(hor, zen, pow(h, 0.42));
        c += vec3(1.0, 0.42, 0.16) * pow(max(mu, 0.), 5.) * 0.55 * (1.0 - h);
        c += vec3(1.0, 0.66, 0.38) * pow(max(mu, 0.), 60.) * 1.6;
        c += vec3(1.0, 0.86, 0.62) * smoothstep(0.99955, 0.9998, mu) * 28.0;
        float camH = max(cameraPosition.y, 0.0);
        float fogI = 1.0 - exp(-fogD * exp(-camH * ${f(FALLOFF)}) / (${f(FALLOFF)} * max(d.y, 0.0015)));
        vec3 fCol = mix(haze, ${v3(SUN_HAZE)}, pow(max(mu, 0.), 6.) * 0.85);
        c = mix(c, fCol, fogI);
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Darkens vertical surfaces near the ground and the ground near kerbs and walls.
export function groundAO(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAoPos; varying vec3 vAoNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAoPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vAoNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vAoPos; varying vec3 vAoNrm;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float ax = abs(vAoPos.x);
        float base = ax < 7.6 ? 0.0 : ax < 8.4 ? -0.6 : 0.15;
        float vert = 1.0 - abs(vAoNrm.y);
        float aoV = mix(0.42, 1.0, smoothstep(0.0, 1.4, vAoPos.y - base));
        float aoH = mix(0.6, 1.0, smoothstep(0.0, 0.9, abs(ax - 12.5))) * mix(0.7, 1.0, smoothstep(0.0, 0.45, abs(ax - 8.4)));
        float ao = mix(aoH, aoV, step(0.5, vert));
        reflectedLight.indirectDiffuse *= ao;
        reflectedLight.indirectSpecular *= ao;
        reflectedLight.directDiffuse *= mix(1.0, ao, 0.35);`);
  };
  return mat;
}

// Safety net before bloom: a single NaN or infinite pixel from any shader would otherwise be
// smeared by the blur into a large black block. Bad pixels become black and very bright ones are capped.
export const SanitizeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); bool bad = any(isnan(c)) || any(isinf(c)); gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : min(c, vec4(60.0)); }`,
};

// Final camera grade, applied after tone mapping.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec2 off = c * r2 * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = clamp(col, 0.0, 1.0);
      float l0 = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l0), col, 1.18);                       // a little more colour
      col = clamp((col - 0.5) * 1.12 + 0.5, 0.0, 1.0);      // and contrast
      col *= 1.0 - smoothstep(0.08, 0.6, r2) * 0.42;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.92, 1.0, 1.08), (1.0 - smoothstep(0.0, 0.35, l)) * 0.5);
      float n = fract(sin(dot(vUv * res + fract(time) * 917.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
