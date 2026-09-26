import * as THREE from "three";
import { FullscreenPass, passMaterial } from "../engine/fsq";

// Tileable 3D noise for the volumetric clouds, generated once on the GPU:
//   shape  128³ RGBA: R = Perlin-Worley, GBA = Worley fBm at 3 frequencies
//   detail  32³ RGB : Worley fBm at 3 higher frequencies
// Both wrap on every axis so the raymarcher can scroll them freely.

const noiseLib = /* glsl */ `
precision highp float;
vec3 h33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}
// Tileable Worley: distance to the nearest feature point, inverted (1 = at a point).
float worley(vec3 uv, float freq) {
  vec3 id = floor(uv * freq);
  vec3 p = fract(uv * freq);
  float d = 1e4;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(x, y, z);
    vec3 h = h33(mod(id + o, vec3(freq))) + o;
    vec3 v = p - h;
    d = min(d, dot(v, v));
  }
  return 1.0 - sqrt(d);
}
float gnoise(vec3 x, float freq) {
  vec3 p = floor(x);
  vec3 w = fract(x);
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 ga = h33(mod(p + vec3(0, 0, 0), freq)) * 2.0 - 1.0;
  vec3 gb = h33(mod(p + vec3(1, 0, 0), freq)) * 2.0 - 1.0;
  vec3 gc = h33(mod(p + vec3(0, 1, 0), freq)) * 2.0 - 1.0;
  vec3 gd = h33(mod(p + vec3(1, 1, 0), freq)) * 2.0 - 1.0;
  vec3 ge = h33(mod(p + vec3(0, 0, 1), freq)) * 2.0 - 1.0;
  vec3 gf = h33(mod(p + vec3(1, 0, 1), freq)) * 2.0 - 1.0;
  vec3 gg = h33(mod(p + vec3(0, 1, 1), freq)) * 2.0 - 1.0;
  vec3 gh = h33(mod(p + vec3(1, 1, 1), freq)) * 2.0 - 1.0;
  float va = dot(ga, w - vec3(0, 0, 0));
  float vb = dot(gb, w - vec3(1, 0, 0));
  float vc = dot(gc, w - vec3(0, 1, 0));
  float vd = dot(gd, w - vec3(1, 1, 0));
  float ve = dot(ge, w - vec3(0, 0, 1));
  float vf = dot(gf, w - vec3(1, 0, 1));
  float vg = dot(gg, w - vec3(0, 1, 1));
  float vh = dot(gh, w - vec3(1, 1, 1));
  return va + u.x * (vb - va) + u.y * (vc - va) + u.z * (ve - va) + u.x * u.y * (va - vb - vc + vd) + u.y * u.z * (va - vc - ve + vg) + u.z * u.x * (va - vb - ve + vf) + u.x * u.y * u.z * (-va + vb + vc - vd + ve - vf - vg + vh);
}
float perlinFbm(vec3 p, float freq, int oct) {
  float G = exp2(-0.85);
  float amp = 1.0;
  float n = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    n += amp * gnoise(p * freq, freq);
    freq *= 2.0;
    amp *= G;
  }
  return n;
}
float worleyFbm(vec3 p, float freq) {
  return worley(p, freq) * 0.625 + worley(p, freq * 2.0) * 0.25 + worley(p, freq * 4.0) * 0.125;
}
float remap(float x, float a, float b, float c, float d) { return c + (x - a) / (b - a) * (d - c); }
`;

const shapeFrag = /* glsl */ `
${noiseLib}
uniform float uZ;
varying vec2 vUv;
void main() {
  vec3 p = vec3(vUv, uZ);
  float freq = 4.0;
  float pfbm = mix(1.0, perlinFbm(p, 4.0, 7), 0.5);
  pfbm = abs(pfbm * 2.0 - 1.0);
  float w0 = worleyFbm(p, freq);
  float w1 = worleyFbm(p, freq * 2.0);
  float w2 = worleyFbm(p, freq * 4.0);
  float pw = remap(pfbm, 0.0, 1.0, w0, 1.0);
  gl_FragColor = vec4(clamp(pw, 0.0, 1.0), w0, w1, w2);
}`;

const detailFrag = /* glsl */ `
${noiseLib}
uniform float uZ;
varying vec2 vUv;
void main() {
  vec3 p = vec3(vUv, uZ);
  gl_FragColor = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), 1.0);
}`;

// Weather map (2D, tileable): R coverage, G cloud height/type, B detail mask.
const weatherFrag = /* glsl */ `
${noiseLib}
varying vec2 vUv;
void main() {
  vec3 p = vec3(vUv, 0.37);
  float cov = perlinFbm(p, 5.0, 5) * 0.5 + 0.5;
  float clump = worleyFbm(p, 6.0);
  cov = clamp(remap(cov * 0.55 + clump * 0.65, 0.55, 1.05, 0.0, 1.0), 0.0, 1.0);
  float typ = perlinFbm(p + 0.5, 3.0, 4) * 0.5 + 0.5;
  float det = worley(p, 16.0);
  gl_FragColor = vec4(cov, clamp(typ, 0.0, 1.0), det, 1.0);
}`;

export type CloudNoise = {
  shape: THREE.Data3DTexture;
  detail: THREE.Data3DTexture;
  weather: THREE.Texture;
};

function make3D(renderer: THREE.WebGLRenderer, size: number, frag: string) {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const tex = rt.texture as unknown as THREE.Data3DTexture;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.NoColorSpace;
  const mat = passMaterial(frag, { uZ: { value: 0 } });
  const pass = new FullscreenPass(mat);
  for (let z = 0; z < size; z++) {
    mat.uniforms.uZ.value = (z + 0.5) / size;
    pass.render(renderer, rt as unknown as THREE.WebGLRenderTarget, z);
  }
  mat.dispose();
  return tex;
}

export function createCloudNoise(renderer: THREE.WebGLRenderer): CloudNoise {
  const prev = renderer.getRenderTarget();
  const shape = make3D(renderer, 128, shapeFrag);
  const detail = make3D(renderer, 32, detailFrag);
  const wrt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.UnsignedByteType, depthBuffer: false, generateMipmaps: false });
  const wm = passMaterial(weatherFrag, {});
  new FullscreenPass(wm).render(renderer, wrt);
  wm.dispose();
  const weather = wrt.texture;
  weather.wrapS = weather.wrapT = THREE.RepeatWrapping;
  weather.minFilter = weather.magFilter = THREE.LinearFilter;
  renderer.setRenderTarget(prev);
  return { shape, detail, weather };
}
