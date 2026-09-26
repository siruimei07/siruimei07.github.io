import * as THREE from "three";
import { FullscreenPass, hdrTarget, passMaterial } from "../engine/fsq";
import { common, skyMath } from "../engine/glsl";
import type { Tier } from "../engine/Quality";
import { G } from "./atmos";
import type { CloudNoise } from "./noiseTextures";

// Volumetric cumulus. A curved-earth cloud shell is raymarched at reduced
// resolution with jittered starts; a resolve pass accumulates frames with
// rotation-only reprojection (the clouds are kilometres away, so camera
// translation is negligible) and a neighbourhood clamp against ghosting.
// A small equirect panorama of the same clouds feeds water reflections.
//
// Units inside the shader are kilometres; the planet centre is (0, -R, 0).

export type CloudLayout = {
  bottom: number; // km
  top: number; // km
  coverage: number; // global multiplier
  density: number; // extinction scale
  weatherScale: number; // km per weather tile
  ringInner: number; // km: clear sky inside this radius
  ringOuter: number;
  anchors: { az: number; dist: number; radius: number; strength: number; type: number }[];
};

const MAX_ANCHORS = 8;
const BAYER = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
];

const cloudLib = /* glsl */ `
${common}
${skyMath}
precision highp sampler3D;
uniform sampler3D tShape;
uniform sampler3D tDetail;
uniform sampler2D tWeather;
uniform vec3 uSunDir;
uniform vec3 uCloudSun;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uCloudAmbTop;
uniform vec3 uCloudAmbBottom;
uniform vec3 uFogColor;
uniform vec3 uHorizon;
uniform vec3 uCityGlow;
uniform vec3 uMsTint;
uniform vec3 uCloudFill;
uniform float uDetail;
uniform float uBottom;
uniform float uTop;
uniform float uCoverage;
uniform float uDensity;
uniform float uWeatherScale;
uniform float uRingInner;
uniform float uRingOuter;
uniform vec2 uWind;
uniform vec3 uShapeWind;
uniform vec4 uAnchors[${MAX_ANCHORS}]; // xz km, radius km, strength
uniform float uAnchorType[${MAX_ANCHORS}];
uniform int uSteps;
uniform int uLightSteps;
uniform float uFrame;
uniform vec3 uCamKm;

const float R = 6360.0;

// Distance along rd from ro (inside the sphere) to the sphere of radius r.
float shellExit(vec3 ro, vec3 rd, float r) {
  vec3 oc = ro - vec3(0.0, -R, 0.0);
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return -1.0;
  return -b + sqrt(h);
}

float heightFrac(vec3 p) {
  return (length(p - vec3(0.0, -R, 0.0)) - R - uBottom) / (uTop - uBottom);
}

// Background coverage (x) and type (y) at a horizontal position: small
// scattered cumulus from the weather map, kept clear near the viewer.
vec2 weather(vec2 xz) {
  vec4 w = textureLod(tWeather, (xz + uWind) / uWeatherScale, 0.0);
  float d = length(xz);
  float ring = smoothstep(uRingInner, uRingInner * 2.2 + 2.0, d);
  float cov = w.r * ring * uCoverage;
  cov *= 1.0 - smoothstep(uRingOuter, uRingOuter * 1.4, d);
  return vec2(saturate(cov), w.g);
}

float heightGradient(float h, float typ) {
  float top = mix(0.28, 1.0, typ);
  return smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(top * 0.45, top, h));
}

// Cumulus heaps. Each anchor is a cluster of rounded turrets (ellipsoids):
// taller toward the middle, flat-bottomed at the condensation level. Returns
// 1 at a turret's core, 0 on its surface, negative outside.
float heapField(vec3 p) {
  float alt = length(p - vec3(0.0, -R, 0.0)) - R;
  float best = -1.0;
  for (int i = 0; i < ${MAX_ANCHORS}; i++) {
    vec4 a = uAnchors[i];
    if (a.w <= 0.0) continue;
    vec2 q = p.xz - a.xy;
    if (dot(q, q) > a.z * a.z * 3.2) continue;
    float tall = uAnchorType[i];
    for (int k = 0; k < 11; k++) {
      vec3 h = hash31(float(i * 17 + k) * 1.37 + 0.71);
      float ang = h.x * TAU;
      float rad = sqrt(h.y) * a.z;
      vec2 c = a.xy + vec2(cos(ang), sin(ang)) * rad;
      float centreness = 1.0 - rad / a.z;
      float top = uBottom + (uTop - uBottom) * a.w * tall * (0.35 + 0.65 * centreness) * mix(0.7, 1.0, h.z);
      float rr = a.z * (0.42 + 0.28 * h.z) * (0.75 + 0.25 * centreness);
      // A rounded dome on a straight column down to the flat base.
      float domeH = min(rr * 0.9, (top - uBottom) * 0.6);
      float cy = top - domeH;
      float dy = alt > cy ? (alt - cy) / domeH : max(0.0, (uBottom + 0.15 - alt) / 0.15);
      vec2 dxz = (p.xz - c) / rr;
      best = max(best, 1.0 - dot(dxz, dxz) - dy * dy);
    }
  }
  return best;
}

// Same field plus the gradient of the winning turret (km^-1).
float heapFieldG(vec3 p, out vec3 grad) {
  float alt = length(p - vec3(0.0, -R, 0.0)) - R;
  float best = -1.0;
  grad = vec3(0.0, -1.0, 0.0);
  for (int i = 0; i < ${MAX_ANCHORS}; i++) {
    vec4 a = uAnchors[i];
    if (a.w <= 0.0) continue;
    vec2 q = p.xz - a.xy;
    if (dot(q, q) > a.z * a.z * 3.2) continue;
    float tall = uAnchorType[i];
    for (int k = 0; k < 11; k++) {
      vec3 h = hash31(float(i * 17 + k) * 1.37 + 0.71);
      float ang = h.x * TAU;
      float rad = sqrt(h.y) * a.z;
      vec2 c = a.xy + vec2(cos(ang), sin(ang)) * rad;
      float centreness = 1.0 - rad / a.z;
      float top = uBottom + (uTop - uBottom) * a.w * tall * (0.35 + 0.65 * centreness) * mix(0.7, 1.0, h.z);
      float rr = a.z * (0.42 + 0.28 * h.z) * (0.75 + 0.25 * centreness);
      float domeH = min(rr * 0.9, (top - uBottom) * 0.6);
      float cy = top - domeH;
      bool dome = alt > cy;
      float dy = dome ? (alt - cy) / domeH : max(0.0, (uBottom + 0.15 - alt) / 0.15);
      vec2 dxz = (p.xz - c) / rr;
      float v = 1.0 - dot(dxz, dxz) - dy * dy;
      if (v > best) {
        best = v;
        float gy = dome ? -2.0 * dy / domeH : 2.0 * dy / 0.15;
        grad = vec3(-2.0 * dxz.x / rr, gy, -2.0 * dxz.y / rr);
      }
    }
  }
  return best;
}

// Gradient of the billow noise that erodes the heaps (forward differences).
vec3 billowGrad(vec3 p, float e) {
  vec3 q = p * (1.0 / 9.0) + uShapeWind;
  float k = e / 9.0;
  vec3 w = vec3(0.45, 0.4, 0.15);
  float b0 = dot(textureLod(tShape, q, 0.0).gba, w);
  float bx = dot(textureLod(tShape, q + vec3(k, 0.0, 0.0), 0.0).gba, w);
  float by = dot(textureLod(tShape, q + vec3(0.0, k, 0.0), 0.0).gba, w);
  float bz = dot(textureLod(tShape, q + vec3(0.0, 0.0, k), 0.0).gba, w);
  return vec3(bx - b0, by - b0, bz - b0) / e;
}

float cloudDensity(vec3 p, float h, vec2 wt, bool detail, float lodDist) {
  vec3 q = p * (1.0 / 9.0) + uShapeWind;
  vec4 n = textureLod(tShape, q, 0.0);
  // Background clouds.
  float bg = 0.0;
  if (wt.x > 0.02) {
    float wf = n.g * 0.625 + n.b * 0.25 + n.a * 0.125;
    float shape = remap(n.r, wf - 1.0, 1.0, 0.0, 1.0) * heightGradient(h, wt.y);
    bg = saturate(remap(shape, 1.0 - wt.x, 1.0, 0.0, 1.0)) * wt.x;
    bg = saturate(bg * 2.2 - 0.02);
  }
  // Heaps, eroded by inverted Worley noise so the surface bulges into
  // cauliflower billows at several scales.
  float hv = heapField(p);
  float heap = 0.0;
  if (hv > -0.6) {
    float bill = n.g * 0.4 + n.b * 0.35 + n.a * 0.25;
    float hd = hv - (1.0 - bill) * 0.8 + 0.26;
    heap = smoothstep(0.0, 0.14, hd);
  }
  float base = max(bg, heap);
  if (!detail || base <= 0.0) return base;
  float df = 1.0 - smoothstep(18.0, 60.0, lodDist);
  if (df <= 0.0) return base;
  vec3 dn = textureLod(tDetail, p * (1.0 / 1.4) + uShapeWind * 3.0, 0.0).rgb;
  float dfbm = dn.r * 0.625 + dn.g * 0.25 + dn.b * 0.125;
  float m = mix(dfbm, 1.0 - dfbm, saturate(h * 4.0));
  return saturate(remap(base, m * 0.35 * df * uDetail, 1.0, 0.0, 1.0));
}

float lightDepth(vec3 p, vec3 ld, vec2 wt0) {
  float od = 0.0;
  float step = 0.06;
  vec3 q = p;
  for (int i = 0; i < 8; i++) {
    if (i >= uLightSteps) break;
    q += ld * step;
    float h = heightFrac(q);
    if (h > 1.0 || h < 0.0) break;
    vec2 wt = i < 3 ? wt0 : weather(q.xz);
    od += cloudDensity(q, h, wt, i < 2, 0.0) * step;
    step *= 2.2;
  }
  return od;
}

// Returns scattered light (rgb, linear) and transmittance (a).
// Coarse steps through empty sky; on touching a cloud, back up one step and
// continue with fine steps so shading is sampled near the lit surface.
vec4 marchClouds(vec3 ro, vec3 rd, int steps, float jitter, float maxDist) {
  if (rd.y < -0.02) return vec4(0.0, 0.0, 0.0, 1.0);
  float t0 = shellExit(ro, rd, R + uBottom);
  float t1 = min(shellExit(ro, rd, R + uTop), maxDist);
  if (t0 < 0.0 || t1 <= t0) return vec4(0.0, 0.0, 0.0, 1.0);

  float muS = dot(rd, uSunDir);
  float muM = dot(rd, uMoonDir);
  // Dual-lobe phase, softened so front-lit banks stay bright (as in the clip).
  float phS = mix(hgPhase(muS, 0.72), hgPhase(muS, -0.22), 0.55) * 4.0 * PI;
  float phM = mix(hgPhase(muM, 0.72), hgPhase(muM, -0.22), 0.55) * 4.0 * PI;
  vec3 sunL = uCloudSun;
  vec3 moonL = uMoonColor * 0.26;
  bool moonOn = uMoonColor.b > 0.001;
  bool sunOn = uCloudSun.r > 0.001;

  float len = t1 - t0;
  float dtC = len / float(steps) * 1.6;
  float t = t0 + dtC * jitter;
  vec3 scat = vec3(0.0);
  float T = 1.0;
  float hitDist = 0.0;
  float hitW = 0.0;
  float sigma = 48.0 * uDensity; // km^-1 at density 1
  bool fine = false;
  int empty = 0;
  float fineUntil = 0.0;
  for (int i = 0; i < 220; i++) {
    if (t > t1 || T < 0.04) break;
    vec3 p = ro + rd * t;
    float h = heightFrac(p);
    vec2 wt = weather(p.xz);
    if (!fine) {
      if (h >= 0.0 && h <= 1.0 && cloudDensity(p, h, wt, false, t) > 0.0) {
        fine = true;
        empty = 0;
        fineUntil = t + dtC * 0.5;
        t = max(t0, t - dtC);
        continue;
      }
      t += dtC;
      continue;
    }
    float dtF = clamp(t * 0.0065, 0.05, 0.4);
    float d = (h >= 0.0 && h <= 1.0) ? cloudDensity(p, h, wt, true, t) : 0.0;
    if (d > 0.003) {
      empty = 0;
      float se = d * sigma;
      // Hybrid lighting: a surface normal from the density gradient gives the
      // sculpted, painterly lobes of the clip; a light march started just
      // outside the surface adds the large shadows one lobe casts on another.
      float e = clamp(t * 0.012, 0.18, 0.7) * (sunOn ? 1.0 : 3.0);
      vec3 gh;
      float hv = heapFieldG(p, gh);
      vec3 g = 0.8 * billowGrad(p, e) + (hv > -0.6 ? gh : vec3(0.0, -0.4, 0.0));
      vec3 N = -g / max(length(g), 1e-5);
      // Bias toward "up" and toward the viewer where the gradient is weak.
      N = normalize(mix(N, normalize(vec3(0.0, 1.0, 0.0) - rd * 0.6), 0.18 + 0.5 * (1.0 - smoothstep(0.1, 0.6, length(g)))));
      // Moonlight is soft: smooth the billows so the night bank stays calm.
      if (!sunOn) N = normalize(mix(N, normalize(vec3(0.0, 1.0, 0.0) - rd * 0.8), 0.9));
      vec3 S = vec3(0.0);
      if (sunOn) {
        float ndl = dot(N, uSunDir);
        float lit = smoothstep(-0.25, 0.75, ndl);
        float od = lightDepth(p + N * e * 1.5 + uSunDir * 0.04, uSunDir, wt) * sigma * 0.15;
        float sh = exp(-od);
        S += sunL * lit * sh * (0.75 + 0.25 * phS);
        // Warm light bleeding through the shadow side and the terminator.
        S += uCloudFill * (0.6 + 0.4 * sh) * (1.0 - lit * sh * 0.6);
      }
      if (moonOn) {
        float ndl = dot(N, uMoonDir);
        float lit = smoothstep(-0.3, 0.8, ndl);
        float od = lightDepth(p + N * e * 1.5 + uMoonDir * 0.04, uMoonDir, wt) * sigma * 0.22;
        float sh = exp(-od);
        // Silver lining: thin edges facing the moon glow.
        // Silver lining only on the thin edges right around the moon.
        float rim = pow(saturate(muM), 40.0) * (1.0 - saturate(d * 3.0)) * 3.0;
        S += moonL * (lit * sh * 0.55 + rim) * (0.7 + 0.3 * phM);
      }
      // Sky light on upward faces, water / city light on downward faces.
      float up = N.y * 0.5 + 0.5;
      vec3 amb = mix(uCloudAmbBottom + uCityGlow * (1.0 - h) * 1.5, uCloudAmbTop, up * 0.8 + h * 0.2);
      float sunLit = sunOn ? smoothstep(-0.25, 0.75, dot(N, uSunDir)) : 0.0;
      S += amb * (1.0 - sunLit * 0.55);
      float tr = exp(-se * dtF);
      scat += T * S * (1.0 - tr);
      hitDist += t * T * (1.0 - tr);
      hitW += T * (1.0 - tr);
      T *= tr;
    } else if (++empty > 6 && t > fineUntil) {
      fine = false;
    }
    t += dtF;
  }
  // Aerial perspective toward the horizon haze.
  float dist = hitW > 0.0 ? hitDist / hitW : t1;
  float haze = 1.0 - exp(-dist / 80.0);
  haze = haze * 0.8 + (1.0 - smoothstep(0.0, 0.06, rd.y)) * 0.25;
  scat = mix(scat, uFogColor * (1.0 - T), saturate(haze));
  // Treat the leftover after early exit as fully absorbed.
  if (T < 0.04) { scat /= (1.0 - T); T = 0.0; }
  return vec4(scat, T);
}
`;

// Renders one pixel of every 2x2 block of the cloud buffer per frame.
const marchFrag = /* glsl */ `
${cloudLib}
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform float uMaxDist;
uniform vec2 uFullRes;
uniform vec2 uOffset;
varying vec2 vUv;
void main() {
  vec2 full = floor(gl_FragCoord.xy) * 2.0 + uOffset;
  vec2 uv = (full + 0.5) / uFullRes;
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  float j = fract(ign(full) + uFrame * 0.618034);
  gl_FragColor = marchClouds(uCamKm, rd, uSteps, j, uMaxDist);
}`;

const panoFrag = /* glsl */ `
${cloudLib}
uniform float uMaxDist;
varying vec2 vUv;
void main() {
  float az = (vUv.x - 0.5) * TAU;
  float el = vUv.y * vUv.y * (PI * 0.5);
  vec3 rd = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  float j = ign(gl_FragCoord.xy + uFrame * 7.0);
  gl_FragColor = marchClouds(uCamKm, rd, uSteps, j, uMaxDist);
}`;

// Rebuilds the full cloud buffer: freshly marched pixels are blended in,
// the other three of each 2x2 block come from the reprojected history,
// clamped to the neighbourhood of this frame's samples.
const resolveFrag = /* glsl */ `
uniform sampler2D tCur;
uniform sampler2D tHist;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform mat4 uPrevViewProj;
uniform vec2 uCurSize;
uniform vec2 uOffset;
uniform float uBlend;
uniform float uReset;
varying vec2 vUv;
void main() {
  vec2 px = floor(gl_FragCoord.xy);
  vec2 block = floor(px * 0.5);
  bool fresh = all(equal(px - block * 2.0, uOffset));
  vec4 cur = texelFetch(tCur, ivec2(block), 0);
  vec2 cuv = (px * 0.5 + 0.25) / uCurSize;
  vec4 up = texture(tCur, cuv);
  vec4 mn = cur, mx = cur;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec4 sm = texelFetch(tCur, clamp(ivec2(block) + ivec2(x, y), ivec2(0), ivec2(uCurSize) - 1), 0);
    mn = min(mn, sm);
    mx = max(mx, sm);
  }
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize((uCamWorld * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
  vec4 pc = uPrevViewProj * vec4(rd, 0.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  bool ok = pc.w > 0.0 && all(greaterThan(puv, vec2(0.0))) && all(lessThan(puv, vec2(1.0))) && uReset < 0.5;
  if (!ok) { gl_FragColor = fresh ? cur : up; return; }
  vec4 hist = texture(tHist, puv);
  vec4 ext = (mx - mn) * 0.3 + 0.02;
  hist = clamp(hist, mn - ext, mx + ext);
  gl_FragColor = fresh ? mix(hist, cur, uBlend) : mix(hist, up, 0.04);
}`;

export class Clouds {
  cur!: THREE.WebGLRenderTarget;
  hist: THREE.WebGLRenderTarget[] = [];
  histIndex = 0;
  readonly pano: THREE.WebGLRenderTarget;
  private march: FullscreenPass;
  private panoPass: FullscreenPass;
  private resolve: FullscreenPass;
  private prevViewProj = new THREE.Matrix4();
  private frame = 0;
  private w = 0;
  private h = 0;
  private reset = true;
  enabled = true;
  /** km of accumulated wind (weather map scroll). */
  wind = new THREE.Vector2(0, 0);
  shapeWind = new THREE.Vector3(0, 0, 0);
  blend = 0.55;

  constructor(noise: CloudNoise, layout: CloudLayout) {
    const shared = {
      tShape: { value: noise.shape },
      tDetail: { value: noise.detail },
      tWeather: { value: noise.weather },
      uSunDir: G.uSunDir,
      uCloudSun: G.uCloudSun,
      uMoonDir: G.uMoonDir,
      uMoonColor: G.uMoonColor,
      uCloudAmbTop: G.uCloudAmbTop,
      uCloudAmbBottom: G.uCloudAmbBottom,
      uFogColor: G.uFogColor,
      uHorizon: G.uHorizon,
      uCityGlow: G.uCityGlow,
      uMsTint: { value: new THREE.Color(1, 0.62, 0.48) },
      uCloudFill: G.uCloudFill,
      uDetail: G.uCloudDetail,
      uBottom: { value: 0 },
      uTop: { value: 0 },
      uCoverage: { value: 1 },
      uDensity: { value: 1 },
      uWeatherScale: { value: 40 },
      uRingInner: { value: 3 },
      uRingOuter: { value: 90 },
      uWind: { value: this.wind },
      uShapeWind: { value: this.shapeWind },
      uAnchors: { value: Array.from({ length: MAX_ANCHORS }, () => new THREE.Vector4()) },
      uAnchorType: { value: new Array(MAX_ANCHORS).fill(0) },
      uSteps: { value: 64 },
      uLightSteps: { value: 5 },
      uFrame: { value: 0 },
      uCamKm: { value: new THREE.Vector3() },
      uMaxDist: { value: 120 },
    };
    this.march = new FullscreenPass(
      passMaterial(marchFrag, {
        ...shared,
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uFullRes: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2() },
      }),
    );
    this.panoPass = new FullscreenPass(passMaterial(panoFrag, { ...shared }));
    this.resolve = new FullscreenPass(
      passMaterial(resolveFrag, {
        tCur: { value: null },
        tHist: { value: null },
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uCurSize: { value: new THREE.Vector2(1, 1) },
        uOffset: { value: new THREE.Vector2() },
        uBlend: { value: 0.5 },
        uReset: { value: 1 },
      }),
    );
    this.pano = hdrTarget(512, 144);
    this.setLayout(layout);
  }

  setLayout(layout: CloudLayout) {
    for (const m of [this.march.material, this.panoPass.material]) {
      const u = m.uniforms;
      u.uBottom.value = layout.bottom;
      u.uTop.value = layout.top;
      u.uCoverage.value = layout.coverage;
      u.uDensity.value = layout.density;
      u.uWeatherScale.value = layout.weatherScale;
      u.uRingInner.value = layout.ringInner;
      u.uRingOuter.value = layout.ringOuter;
      const arr = u.uAnchors.value as THREE.Vector4[];
      const typ = u.uAnchorType.value as number[];
      for (let i = 0; i < MAX_ANCHORS; i++) {
        const a = layout.anchors[i];
        if (!a) {
          arr[i].set(0, 0, 1, 0);
          typ[i] = 0;
          continue;
        }
        const az = THREE.MathUtils.degToRad(a.az);
        arr[i].set(Math.sin(az) * a.dist, -Math.cos(az) * a.dist, a.radius, a.strength);
        typ[i] = a.type;
      }
    }
    this.reset = true;
  }

  get texture() {
    return this.hist[this.histIndex]?.texture ?? null;
  }

  resize(renderW: number, renderH: number, tier: Tier) {
    const w = Math.max(2, Math.round(renderW * tier.cloudScale));
    const h = Math.max(2, Math.round(renderH * tier.cloudScale));
    for (const m of [this.march.material]) {
      m.uniforms.uSteps.value = tier.cloudSteps;
      m.uniforms.uLightSteps.value = tier.cloudLightSteps;
    }
    this.panoPass.material.uniforms.uSteps.value = Math.max(24, Math.round(tier.cloudSteps * 0.5));
    this.panoPass.material.uniforms.uLightSteps.value = Math.max(2, tier.cloudLightSteps - 2);
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.cur?.dispose();
    for (const t of this.hist) t.dispose();
    this.cur = hdrTarget(Math.ceil(w / 2), Math.ceil(h / 2));
    this.hist = [hdrTarget(w, h), hdrTarget(w, h)];
    this.march.material.uniforms.uFullRes.value.set(w, h);
    this.resolve.material.uniforms.uCurSize.value.set(this.cur.width, this.cur.height);
    this.reset = true;
  }

  invalidate() {
    this.reset = true;
  }

  update(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, panorama = true) {
    if (!this.enabled) return;
    this.frame++;
    const camKm = new THREE.Vector3().copy(camera.position).multiplyScalar(0.001);
    // Keep the camera just above sea level in cloud space (it never flies into the layer).
    const mu = this.march.material.uniforms;
    mu.uFrame.value = this.frame % 1024;
    mu.uCamKm.value.copy(camKm);
    mu.uInvProj.value.copy(camera.projectionMatrixInverse);
    mu.uCamWorld.value.copy(camera.matrixWorld).setPosition(0, 0, 0);
    const o = BAYER[this.frame % 4];
    mu.uOffset.value.set(o[0], o[1]);
    this.march.render(renderer, this.cur);

    const ru = this.resolve.material.uniforms;
    const src = this.hist[this.histIndex];
    const dst = this.hist[1 - this.histIndex];
    ru.tCur.value = this.cur.texture;
    ru.tHist.value = src.texture;
    ru.uInvProj.value.copy(camera.projectionMatrixInverse);
    ru.uCamWorld.value.copy(mu.uCamWorld.value);
    ru.uPrevViewProj.value.copy(this.prevViewProj);
    ru.uOffset.value.copy(mu.uOffset.value);
    ru.uBlend.value = this.blend;
    ru.uReset.value = this.reset ? 1 : 0;
    this.resolve.render(renderer, dst);
    this.histIndex = 1 - this.histIndex;
    this.reset = false;

    // Rotation-only view-projection for next frame's reprojection.
    const view = new THREE.Matrix4().copy(camera.matrixWorldInverse).setPosition(0, 0, 0);
    this.prevViewProj.multiplyMatrices(camera.projectionMatrix, view);

    if (panorama) {
      const pu = this.panoPass.material.uniforms;
      pu.uFrame.value = this.frame % 1024;
      pu.uCamKm.value.copy(camKm);
      this.panoPass.render(renderer, this.pano);
    }
  }
}
