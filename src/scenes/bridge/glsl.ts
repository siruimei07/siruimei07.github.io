import { BAY, DECK_Y, GATE_Z, NBAYS, RAIL_X, TORII_H, TORII_HALF, TORII_Z, Z_FAR, Z_NEAR } from "./layout";

// GLSL shared by the bridge's materials: the bridge's constants, the rail
// lanterns (periodic along both railings, so any fragment can sum the few
// nearest in O(1)), and analytic "what does this ray see" helpers for the
// wet deck's reflections (railing, torii, gate, city light map, moon).

const f = (v: number) => v.toFixed(4);

export const bridgeDefs = /* glsl */ `
#define DECK_Y ${f(DECK_Y)}
#define RAIL_X ${f(RAIL_X)}
#define BAY ${f(BAY)}
#define Z_NEAR ${f(Z_NEAR)}
#define Z_FAR ${f(Z_FAR)}
#define NBAYS ${f(NBAYS)}
#define TORII_Z ${f(TORII_Z)}
#define TORII_HALF ${f(TORII_HALF)}
#define TORII_H ${f(TORII_H)}
#define GATE_Z ${f(GATE_Z)}
`;

/** Needs `uTime` and `common`. */
export const lanternGlsl = /* glsl */ `
float lanternFlick(float k, float s) {
  float h = hash11(k * 7.31 + s * 3.7 + 11.0);
  return 0.84 + 0.09 * sin(uTime * (6.0 + h * 5.0) + h * 40.0) + 0.07 * sin(uTime * (13.0 + h * 7.0) + h * 13.0);
}
// Warm light from the rail lanterns reaching P (the nearest three per side).
float lanternLight(vec3 P, float radius) {
  float acc = 0.0;
  float u = (Z_NEAR - P.z) / BAY - 0.5;
  float k0 = floor(u + 0.5);
  for (int si = 0; si < 2; si++) {
    float s = si == 0 ? -1.0 : 1.0;
    if (abs(P.x - s * RAIL_X) > radius) continue;
    for (int j = -1; j <= 1; j++) {
      float k = k0 + float(j);
      if (k < 0.0 || k > NBAYS - 1.0) continue;
      vec3 L = vec3(s * RAIL_X, DECK_Y + 0.68, Z_NEAR - (k + 0.5) * BAY);
      float d = length(L - P);
      float fall = saturate(1.0 - d / radius);
      acc += fall * fall * lanternFlick(k, s);
    }
  }
  return acc;
}
`;

/** Ray-vs-scene helpers for reflections; needs bridgeDefs, common, lanternGlsl. */
export const reflectGlsl = /* glsl */ `
float bandS(float h, float a, float b, float bl) { return smoothstep(a - bl, a + bl, h) * (1.0 - smoothstep(b - bl, b + bl, h)); }
float nearS(float d, float r, float bl) { return 1.0 - smoothstep(r - bl, r + bl, d); }

// The railing in its own plane: coverage at height h above the deck and z.
float railCover(float h, float z, float blH, float blZ, out float lant, out float glow) {
  float u = (Z_NEAR - z) / BAY;
  lant = 0.0;
  glow = 0.0;
  if (u < 0.0 || u > NBAYS) return 0.0;
  float dPost = abs(fract(u) - 0.0);
  dPost = min(dPost, 1.0 - dPost) * BAY;
  float dStrut = abs(fract(u * 2.0) - 0.5) * BAY * 0.5;
  float dLant = abs(fract(u) - 0.5) * BAY;
  float s = bandS(h, -1.0, 0.17, blH);
  s = max(s, bandS(h, 0.47, 0.57, blH));
  s = max(s, bandS(h, 0.94, 1.06, blH));
  s = max(s, nearS(dPost, 0.095, blZ) * bandS(h, 0.0, 1.17, blH));
  float gh = saturate((h - 1.17) / 0.33);
  float gr = 0.13 * sin(3.1416 * pow(gh, 0.75)) + 0.03;
  s = max(s, nearS(dPost, gr, blZ) * bandS(h, 1.17, 1.5, blH));
  s = max(s, nearS(dStrut, 0.035, blZ) * bandS(h, 0.17, 0.94, blH));
  lant = nearS(dLant, 0.065, blZ) * bandS(h, 0.57, 0.78, blH);
  glow = exp(-dLant * dLant * 1.1);
  return max(s, lant);
}

// The torii seen in its plane z = TORII_Z at (x, h above the deck).
float toriiCover(float x, float h, float bl, out float black) {
  float ax = abs(x);
  float pil = nearS(abs(ax - TORII_HALF), 0.45, bl) * bandS(h, -3.0, TORII_H, bl);
  float lift = 0.9 * pow(saturate(ax / 8.0), 2.5);
  float kas = nearS(ax, 8.0, bl) * bandS(h, TORII_H + 0.5 + lift * 0.5, TORII_H + 1.25 + lift, bl);
  float shi = nearS(ax, 7.1, bl) * bandS(h, TORII_H, TORII_H + 0.5, bl);
  float nuk = nearS(ax, 6.9, bl) * bandS(h, 9.1, 9.65, bl);
  float gak = nearS(ax, 0.32, bl) * bandS(h, 9.65, TORII_H, bl);
  black = max(kas, pil * (1.0 - smoothstep(1.1, 1.4, h)));
  return max(max(pil, kas), max(max(shi, nuk), gak));
}

// The gate hall and its corridors, flattened into the plane z = GATE_Z.
vec4 gateLook(float x, float h, float bl, vec3 warm) {
  float ax = abs(x);
  float low = nearS(ax, 11.0, bl) * bandS(h, -3.0, 6.8, bl);
  float roof1 = nearS(ax, 14.5 - max(0.0, h - 7.0) * 1.6, bl) * bandS(h, 6.6, 9.8, bl);
  float up = nearS(ax, 8.0, bl) * bandS(h, 9.8, 13.2, bl);
  float roof2 = nearS(ax, 12.5 - max(0.0, h - 13.2) * 1.5, bl) * bandS(h, 13.0, 19.5, bl);
  float cor = bandS(ax, 11.0, 72.0, bl) * bandS(h, -3.0, 4.2, bl);
  float corRoof = bandS(ax, 11.0, 74.0, bl) * bandS(h, 4.1, 6.8, bl);
  float lit = max(low, max(up, cor));
  float dark = max(max(roof1, roof2), corRoof);
  vec3 c = warm * (0.35 * low + 0.5 * up + 0.22 * cor);
  c += warm * 1.2 * nearS(ax, 2.2, bl) * bandS(h, -1.0, 4.6, bl) * low;
  c = mix(c, vec3(0.01, 0.012, 0.028), dark);
  return vec4(c, max(lit, dark));
}
`;

/** The angular light map of the far city (built on the CPU from the buildings). */
export const cityMapGlsl = /* glsl */ `
uniform sampler2D tCity;
uniform vec4 uMap;    // az0, az1, el0, el1 (rad)
uniform vec3 uEye;    // the map's viewpoint
uniform float uMapGain;
// rgb: light, a: solid (hill/buildings) vs sky
vec4 cityMap(vec3 P, vec3 R, float blur) {
  float dist = mix(300.0, 1200.0, smoothstep(0.0, 0.32, R.y));
  vec3 Q = P + R * (dist / max(0.15, length(R.xz)));
  vec3 d = Q - uEye;
  float az = atan(d.x, -d.z);
  float el = atan(d.y, length(d.xz));
  vec2 uv = vec2((az - uMap.x) / (uMap.y - uMap.x), (el - uMap.z) / (uMap.w - uMap.z));
  vec2 dv = vec2(0.0, blur / (uMap.w - uMap.z));
  vec4 c = texture2D(tCity, uv) * 0.4 + texture2D(tCity, uv + dv) * 0.3 + texture2D(tCity, uv - dv) * 0.3;
  return vec4(c.rgb * uMapGain, c.a);
}
`;
