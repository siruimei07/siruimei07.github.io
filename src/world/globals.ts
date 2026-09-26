import * as THREE from "three";

// Uniform objects shared by reference across every material, so one write per
// frame reaches the whole scene.
export const globals = {
  uTime: { value: 0 },
  uNoise: { value: null as THREE.Texture | null },
  // High over the far city, small and bright (as in the reference films).
  uMoonDir: { value: new THREE.Vector3(0, Math.sin(0.34), -Math.cos(0.34)).normalize() },
  // Moonlight as it falls on things: cool silver. (The disc itself is ivory.)
  uMoonColor: { value: new THREE.Color(0.7, 0.79, 0.95) },
  uFogHorizon: { value: new THREE.Color(0.008, 0.034, 0.066) },
  uFogHigh: { value: new THREE.Color(0.002, 0.012, 0.035) },
  uFogDensity: { value: 0.00085 },
  uFlash: { value: new THREE.Vector3() },
  uBeat: { value: 0 },
  // Kept at 1: the world is alive everywhere (the old "wakes behind the gate" idea was dropped).
  uWorld: { value: 1 },
  // Time of day for the entry sequence: 1 = dusk, 0 = night (the resting state).
  uDusk: { value: 0 },
  // The setting sun sits behind the viewer, so the gate and clouds are front-lit.
  uSunDir: { value: new THREE.Vector3(0.34, Math.sin(0.07), 0.94).normalize() },
  uSunColor: { value: new THREE.Color(1.0, 0.6, 0.36) },
  // Star trails during nightfall: exposure time in seconds (trail length),
  // overall visibility, and how far the tails have faded (0 → 1).
  uTrail: { value: 0 },
  uTrailFade: { value: 0 },
  uTrailTail: { value: 0 },
  // The moon stays hidden through dusk and the star trails, then rises.
  uMoonK: { value: 1 },
  // Page reveal during the entry sequence (0 → 1); the avatar waits for it.
  uReveal: { value: 1 },
  // 1 while the water's mirror image is being drawn.
  uReflecting: { value: 0 },
  uRayOrigin: { value: new THREE.Vector3() },
  uRayDir: { value: new THREE.Vector3(0, 0, -1) },
  uRayOn: { value: 0 },
  uPointScale: { value: 800 },
  uPixelRatio: { value: 1 },
  uResolution: { value: new THREE.Vector2(1, 1) },
  uExposure: { value: 1 },
  uShocks: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, -999, 0, -99)) },
};

export const REFLECT_LAYER = 1;

// Declarations + helpers prepended to most shaders. `cameraPosition` is
// injected by three for every ShaderMaterial.
export const COMMON = /* glsl */ `
uniform float uTime;
uniform sampler2D uNoise;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uFogHorizon;
uniform vec3 uFogHigh;
uniform float uFogDensity;
uniform vec3 uFlash;
uniform float uBeat;
uniform float uWorld;
uniform float uDusk;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTrail;
uniform float uTrailFade;
uniform float uTrailTail;
uniform float uMoonK;
uniform float uReflecting;
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform float uRayOn;
uniform float uPointScale;
uniform float uPixelRatio;
uniform vec4 uShocks[4];

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

// Four octaves of tileable gradient noise live in the RGBA channels of one
// texture, so fbm costs a single fetch.
float fbm(vec2 uv) { return dot(texture2D(uNoise, uv), vec4(0.5333, 0.2667, 0.1333, 0.0667)); }

// Warm pink-amber light of the far city, low over the horizon behind the gate.
vec3 cityGlow(vec3 dir) {
  float az = atan(dir.x, -dir.z);
  return vec3(0.55, 0.2, 0.15) * 0.085 * exp(-max(dir.y, 0.0) * 9.0) * exp(-pow(az / 0.85, 2.0)) * (1.0 - 0.75 * uDusk);
}

// Night air: deep blue, brighter and slightly silver toward the moon.
vec3 fogTint(vec3 dir) {
  float up = clamp(dir.y, -0.1, 1.0);
  vec3 c = mix(uFogHorizon, uFogHigh, smoothstep(0.0, 0.4, up));
  float m = max(dot(dir, uMoonDir), 0.0);
  c += uMoonColor * (pow(m, 8.0) * 0.012 + pow(m, 60.0) * 0.06) * uMoonK;
  float sn = max(dot(dir, uSunDir), 0.0);
  c += uSunColor * (pow(sn, 5.0) * 0.35 + pow(sn, 40.0) * 0.8) * uDusk;
  // The city across the lake warms the haze low on the horizon.
  c += cityGlow(dir);
  c += uFlash * 0.18;
  return c;
}

vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-4);
  float hAvg = max(0.0, (wpos.y + cameraPosition.y) * 0.5);
  float dens = uFogDensity * exp(-hAvg * 0.012);
  float f = 1.0 - exp(-dist * dens);
  return mix(col, fogTint(dir), f);
}

// Moon-lit solid surface: blue ambient, cool moonlight, a back-rim when the
// moon is behind the object, and warm light bounced off the lanterns below.
vec3 shadeSolid(vec3 albedo, vec3 N, vec3 V, float gloss) {
  vec3 L = uMoonDir;
  float ndl = max(dot(N, L) * 0.6 + 0.4, 0.0);
  vec3 amb = mix(vec3(0.012, 0.018, 0.035), vec3(0.03, 0.045, 0.09), N.y * 0.5 + 0.5);
  // Dusk: bright sky light plus a low warm sun from behind the viewer.
  amb += mix(vec3(0.12, 0.08, 0.12), vec3(0.2, 0.2, 0.32), N.y * 0.5 + 0.5) * uDusk;
  vec3 col = albedo * (amb + uMoonColor * ndl * 0.2 * (1.0 - uDusk));
  col += albedo * uSunColor * max(dot(N, uSunDir), 0.0) * 1.3 * uDusk;
  float nv = max(dot(N, V), 0.0);
  float rim = pow(1.0 - nv, 6.0);
  float back = pow(max(dot(-V, L), 0.0), 4.0);
  col += uMoonColor * rim * (0.02 + 0.32 * back);
  vec3 H = normalize(L + V);
  col += uMoonColor * pow(max(dot(N, H), 0.0), 60.0) * gloss * 0.6;
  col += albedo * uFlash * 0.35;
  return col;
}

// Offset that pushes p away from the cursor ray (only in front of the camera).
vec3 rayPush(vec3 p, float radius, float strength) {
  vec3 w = p - uRayOrigin;
  float t = max(dot(w, uRayDir), 0.0);
  vec3 away = w - uRayDir * t;
  float d = length(away);
  float k = uRayOn * strength * (1.0 - smoothstep(0.0, radius, d));
  return away / max(d, 1e-3) * k;
}

// Click shockwaves travelling outward through particles.
vec3 shockPush(vec3 p, out float glow) {
  vec3 off = vec3(0.0);
  glow = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 s = uShocks[i];
    float age = uTime - s.w;
    if (age > 0.0 && age < 3.5) {
      vec3 d = p - s.xyz;
      float dist = length(d);
      float front = age * 22.0;
      float w = exp(-pow((dist - front) / 5.0, 2.0)) * exp(-age * 1.1);
      off += d / max(dist, 1e-3) * w * 3.0;
      glow += w;
    }
  }
  return off;
}
`;
