// The sea breeze. It blows in from the ocean (toward +x, inland), in gusts that roll across the
// beach, so neighbouring palms move together but never in lockstep.
export const uTime = { value: 0 };
export const WIND_GLSL = `
  uniform float uTime;
  float gust(vec3 wp) {
    return 0.55 + 0.35 * sin(uTime * 0.31 - wp.x * 0.025 + wp.z * 0.006) * sin(uTime * 0.11 + wp.z * 0.013 + 1.0)
         + 0.18 * sin(uTime * 1.3 - wp.x * 0.08 + wp.z * 0.05);
  }`;

// kind: 'palm' (trunk bends, crown sways), 'frond' (also streams and flutters), 'grass', 'cloth'.
export function applyWind(mat, kind) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + WIND_GLSL)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz; mat3 im3 = mat3(instanceMatrix);
        #else
          vec3 ip = (modelMatrix * vec4(position, 1.0)).xyz; mat3 im3 = mat3(1.0);
        #endif
        float g = gust(ip);
        vec3 wl = normalize(transpose(im3) * vec3(1.0, 0.0, 0.22));
        vec3 side = normalize(cross(wl, vec3(0.0, 1.0, 0.0)));
        ${kind === 'grass' ? `
          float b = uv.y * uv.y;
          transformed += wl * b * (0.12 + 0.28 * g) + side * b * 0.05 * sin(uTime * 5.0 + ip.x * 3.0 + position.x * 9.0);
        ` : kind === 'cloth' ? `
          transformed += wl * uv.y * (0.1 + 0.12 * g) * (0.6 + 0.4 * sin(uTime * 9.0 + position.z * 4.0));
          transformed += side * uv.y * 0.05 * sin(uTime * 13.0 + position.z * 7.0);
        ` : `
          float hN = clamp(position.y / 10.0, 0.0, 1.4), bend = hN * hN;
          transformed += wl * bend * (0.22 + 0.4 * g) + wl * bend * 0.14 * sin(uTime * 1.05 + ip.x * 0.3 + ip.z * 0.2);
          ${kind === 'frond' ? `
            float s = uv.y, fl = s * s;
            transformed += wl * fl * (0.5 + 1.1 * g);
            transformed.y += fl * (0.08 + 0.1 * g) * sin(uTime * 6.5 + uv.x * 4.0 + position.x * 2.3 + ip.z);
            transformed += side * fl * 0.16 * g * sin(uTime * 2.7 + position.z * 1.7 + ip.x);
          ` : ''}
        `}`);
  };
  mat.customProgramCacheKey = () => 'wind-' + kind;
  return mat;
}
