import * as THREE from "three";
import { FullscreenPass, passMaterial } from "../engine/fsq";
import { common, skyMath } from "../engine/glsl";
import { G } from "./atmos";

// Sky background: twilight gradient (with the pink anti-twilight belt the
// clip shows opposite the sun), sun, a small bright moon with halo, thin
// cirrus, and the volumetric cloud layer composited on top. Drawn first into
// the scene target; geometry then renders over it.

export const skyFunctions = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uMoonDir;
uniform float uMoon;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uFogColor;
uniform vec3 uHorizonBank;
uniform float uTime;

vec3 skyGradient(vec3 d) {
  float h = max(d.y, 0.0);
  vec2 hs = normalize(uSunDir.xz + 1e-5);
  vec2 hd = normalize(d.xz + 1e-5);
  float toward = dot(hd, hs) * 0.5 + 0.5; // 1 toward the sun
  vec3 horizon = mix(uHorizon, uGlow, pow(saturate(toward), 2.5) * 0.9);
  float t1 = smoothstep(0.0, 0.42, pow(h, 0.55));
  float t2 = smoothstep(0.2, 0.5, h);
  vec3 c = mix(horizon, uMid, t1);
  c = mix(c, uZenith, t2);
  // Distant cloud banks in shadow along the horizon line.
  float bank = exp(-h * 150.0) * (1.0 - exp(-h * 1500.0));
  c = mix(c, uHorizonBank, bank * 0.75);
  // Sun aureole (only matters while the sun is up and in view).
  float mu = dot(d, uSunDir);
  c += uSunColor * (hgPhase(mu, 0.86) * 0.025 + hgPhase(mu, 0.6) * 0.02) * smoothstep(-0.05, 0.05, uSunDir.y);
  // Below the horizon: the haze the water fades into.
  if (d.y < 0.0) c = mix(horizon, uFogColor, saturate(-d.y * 30.0));
  return c;
}

vec3 moonDisk(vec3 d, float radius) {
  vec3 m = uMoonDir;
  float mu = dot(d, m);
  float ang = acos(clamp(mu, -1.0, 1.0));
  vec3 col = vec3(0.0);
  // Halo: tight bloom + wide aureole.
  col += vec3(0.55, 0.66, 0.9) * (exp(-ang * 55.0) * 0.9 + exp(-ang * 9.0) * 0.07 + exp(-ang * 2.2) * 0.012);
  if (ang < radius) {
    vec3 up = abs(m.y) < 0.99 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    vec3 tx = normalize(cross(up, m));
    vec3 ty = cross(m, tx);
    vec2 q = vec2(dot(d, tx), dot(d, ty)) / radius; // -1..1 on the disk
    float r2 = dot(q, q);
    float z = sqrt(max(0.0, 1.0 - r2));
    vec3 n = vec3(q, z);
    float maria = fbm2(q * 2.3 + 3.1, 5);
    float crater = pow(fbm2(q * 9.0 + 7.0, 4), 3.0);
    float alb = 0.82 - smoothstep(0.42, 0.62, maria) * 0.3 + crater * 0.25;
    float limb = 0.72 + 0.28 * z;
    float edge = smoothstep(1.0, 0.94, sqrt(r2));
    col = mix(col, vec3(1.0, 0.97, 0.9) * alb * limb * 7.5, edge);
  }
  return col * uMoon;
}

float cirrus(vec3 d) {
  if (d.y <= 0.01) return 0.0;
  vec2 p = d.xz / (d.y + 0.08) * 1.6;
  p = mat2(0.94, -0.34, 0.34, 0.94) * p;
  p.x *= 0.35;
  float n = fbm2(p + vec2(uTime * 0.004, 0.0), 6);
  float streak = smoothstep(0.52, 0.8, n) * smoothstep(0.04, 0.25, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
  return streak;
}
`;

const skyFrag = /* glsl */ `
${common}
${skyMath}
${skyFunctions}
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform sampler2D tClouds;
uniform sampler2D tPano;
uniform float uUsePano;
uniform float uCloudAmount;
uniform vec3 uCloudSun;
uniform vec3 uCloudAmbTop;
uniform float uMoonRadius;
uniform float uCirrus;
varying vec2 vUv;

vec4 panoClouds(vec3 d) {
  float az = atan(d.x, -d.z);
  float el = asin(clamp(d.y, 0.0, 1.0));
  vec2 uv = vec2(az / TAU + 0.5, sqrt(el / (PI * 0.5)));
  return texture(tPano, uv);
}

void main() {
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  vec3 col = skyGradient(d);
  col += moonDisk(d, uMoonRadius);
  float ci = cirrus(d) * uCirrus;
  col = mix(col, uCloudSun * 0.16 + uCloudAmbTop * 0.9, ci * 0.45);
  if (uCloudAmount > 0.0 && d.y > -0.02) {
    vec4 cl = uUsePano > 0.5 ? panoClouds(d) : texture(tClouds, vUv);
    cl = mix(vec4(0.0, 0.0, 0.0, 1.0), cl, uCloudAmount);
    col = col * cl.a + cl.rgb;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  readonly pass: FullscreenPass;
  readonly material: THREE.ShaderMaterial;
  cloudAmount = 1;

  constructor() {
    this.material = passMaterial(skyFrag, {
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uMoonDir: G.uMoonDir,
      uMoon: G.uMoon,
      uZenith: G.uZenith,
      uMid: G.uMid,
      uHorizon: G.uHorizon,
      uGlow: G.uGlow,
      uFogColor: G.uFogColor,
      uHorizonBank: G.uHorizonBank,
      uTime: G.uTime,
      uCloudSun: G.uCloudSun,
      uCloudAmbTop: G.uCloudAmbTop,
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      tClouds: { value: null },
      tPano: { value: null },
      uUsePano: { value: 0 },
      uCloudAmount: { value: 1 },
      uMoonRadius: { value: 0.0145 },
      uCirrus: { value: 1 },
    });
    this.pass = new FullscreenPass(this.material);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, clouds: THREE.Texture | null, pano: THREE.Texture | null, usePano: boolean) {
    const u = this.material.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld).setPosition(0, 0, 0);
    u.tClouds.value = clouds;
    u.tPano.value = pano;
    u.uUsePano.value = usePano ? 1 : 0;
    u.uCloudAmount.value = (usePano ? pano : clouds) ? this.cloudAmount : 0;
    this.pass.render(renderer, target);
  }
}
