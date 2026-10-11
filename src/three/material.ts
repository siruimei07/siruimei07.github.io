// Frosted acrylic for the archive plates. A small custom shader instead of
// physical transmission: wrap light from the upper left, a soft fresnel rim,
// brighter end faces and the cassette's front-face detailing drawn from
// object-space position, all faint. Colours stay in sRGB so fogged plates
// melt into the page's own background gradient exactly.

import { ShaderMaterial, Vector2, Vector3, FrontSide } from "three";

export type Palette = {
  shade: string;
  lit: string;
  rim: string;
  edge: string;
  ink: string;
  amber: string;
  faceAlpha: number;
  sideAlpha: number;
  looseAlpha: number;
};

export const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    shade: "#a8927b",
    lit: "#eadfcf",
    rim: "#fdf8f0",
    edge: "#f5e8d6",
    ink: "#6e5f4d",
    amber: "#e3913f",
    faceAlpha: 0.8,
    sideAlpha: 0.9,
    looseAlpha: 0.5,
  },
  dark: {
    shade: "#3a4447",
    lit: "#76848a",
    rim: "#c9d8dc",
    edge: "#8e9ca0",
    ink: "#c3cfd2",
    amber: "#c5a16b",
    faceAlpha: 0.72,
    sideAlpha: 0.85,
    looseAlpha: 0.45,
  },
};

/** "#rrggbb" or "rgb(…)" → sRGB 0..1 (no colour management on purpose). */
export function srgb(css: string, out = new Vector3()): Vector3 {
  const s = css.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(s);
  if (rgb) return out.set(Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255);
  return out;
}

const vertex = /* glsl */ `
attribute vec4 aInst; // tone, fade, glow, tube
varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vV;
varying float vDepth;
varying vec4 vInst;
varying vec3 vAxis;

void main() {
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
  vV = -mv.xyz;
  vDepth = -mv.z;
  vAxis = mat3(modelViewMatrix) * mat3(instanceMatrix) * vec3(1.0, 0.0, 0.0);
  vObj = position;
  vObjN = normal;
  vInst = aInst;
  gl_Position = projectionMatrix * mv;
}
`;

const fragment = /* glsl */ `
uniform vec3 uShade;
uniform vec3 uLit;
uniform vec3 uRim;
uniform vec3 uEdge;
uniform vec3 uInk;
uniform vec3 uAmber;
uniform vec3 uBgHi;
uniform vec3 uBg;
uniform vec3 uBgLo;
uniform vec2 uRes;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFaceAlpha;
uniform float uSideAlpha;
uniform float uLooseAlpha;
uniform vec3 uLight;
uniform float uWrap;
uniform float uRimK;
uniform float uBorder;
uniform float uAO;
uniform float uAOFrom;

varying vec3 vObj;
varying vec3 vObjN;
varying vec3 vN;
varying vec3 vV;
varying float vDepth;
varying vec4 vInst;
varying vec3 vAxis;
uniform vec3 uPlaneN;

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// anti-aliased line of half-width w along the zero set of d
float stroke(float d, float w) {
  float f = fwidth(d) + 1e-4;
  return 1.0 - smoothstep(w - f, w + f, abs(d));
}
float fill(float d) {
  float f = fwidth(d) + 1e-4;
  return 1.0 - smoothstep(-f, f, d);
}
// 1 inside the angular window centred on a (half-width h)
float arcMask(vec2 c, float a, float h) {
  float ang = atan(c.y, c.x);
  float d = abs(atan(sin(ang - a), cos(ang - a)));
  return 1.0 - smoothstep(h - 0.06, h, d);
}
float screw(vec2 q) {
  float r = length(q);
  float slot = stroke((q.x + q.y) * 0.7071, 0.012) * fill(r - 0.07);
  return fill(r - 0.075) * 0.6 + stroke(r - 0.12, 0.012) + slot * 0.6;
}

// the page background: radial-gradient(120% 90% at 50% 40%, hi 0, bg 55%, lo 120%)
vec3 paper() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 d = vec2((uv.x - 0.5) / 1.2, ((1.0 - uv.y) - 0.4) / 0.9);
  float r = length(d);
  return r < 0.55 ? mix(uBgHi, uBg, r / 0.55) : mix(uBg, uBgLo, clamp((r - 0.55) / 0.65, 0.0, 1.0));
}

void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  vec3 L = normalize(uLight);
  float ndv = abs(dot(N, V));

  float wrap = clamp((dot(N, L) + uWrap) / (1.0 + uWrap), 0.0, 1.0);
  // in the ∞ every plate is also lit as a slice of one round tube, which gives
  // the ribbon its soft volume (light above, shadow under)
  if (vInst.w > 0.0) {
    vec3 A = normalize(vAxis);
    vec3 Bv = normalize((viewMatrix * vec4(uPlaneN, 0.0)).xyz);
    Bv = normalize(Bv - A * dot(Bv, A));
    float s = clamp(vObj.x / 2.5, -1.0, 1.0);
    vec3 nt = normalize(A * s + Bv * sqrt(1.0 - s * s));
    float tube = clamp((dot(nt, L) + uWrap) / (1.0 + uWrap), 0.0, 1.0);
    wrap = mix(wrap, tube, vInst.w);
  }
  float face = smoothstep(0.55, 0.92, abs(vObjN.z));
  float fres = pow(1.0 - ndv, 3.0);

  vec3 col = mix(uShade, uLit, wrap);
  // end faces: brighter ivory with a warm cast, like lit acrylic edges
  vec3 side = mix(uEdge, uRim, wrap * 0.55);
  col = mix(side, col, face);
  col = mix(col, uRim, fres * uRimK);
  // loose plates (the chain) are seen alone against the paper: paler, glassier
  float loose = 1.0 - vInst.w;
  col = mix(col, mix(uLit, uRim, 0.5), loose * 0.4 * face);

  // packed into the ∞ the plates read as one solid body; loose ones stay glassy
  float alpha = mix(uSideAlpha, mix(uLooseAlpha, uFaceAlpha, vInst.w), face) + fres * 0.18;

  // cassette detailing on both large faces (mirrored on the back, so it reads the same way round)
  vec2 p = vec2(vObj.x * sign(vObjN.z + 1e-4), vObj.y);
  // thick acrylic darkens toward its rim, which separates overlapping plates
  float rimD = -sdBox(p, vec2(2.5, 1.85));
  float border = (1.0 - smoothstep(0.0, 0.45, rimD)) * face;
  float borderK = uBorder + loose * 0.32;
  col = mix(col, uShade, border * borderK);
  // in the dense ∞ only the top strip of each face shows; it darkens toward
  // the edge of the plate stacked over it
  float ao = (1.0 - smoothstep(uAOFrom, 1.85, vObj.y)) * face * vInst.w;
  col = mix(col, uShade * 0.92, ao * uAO);
  alpha += border * borderK * 0.3;
  // fade the detailing out once it would shrink below a couple of pixels
  vec2 fw = fwidth(p);
  float detail = face * (1.0 - smoothstep(0.03, 0.075, max(fw.x, fw.y))) * (1.0 + loose * 1.2);
  if (detail > 0.01) {
    vec2 b = vec2(2.5, 1.85);
    float frameD = sdBox(p, b - vec2(0.28));
    float groove = stroke(frameD, 0.018);
    float grooveHi = stroke(frameD + 0.055, 0.012);

    float labD = sdBox(p - vec2(-1.42, 1.1), vec2(0.6, 0.29));
    float label = fill(labD);
    float labLine = stroke(labD, 0.011) + stroke(sdBox(p - vec2(-1.42, 0.98), vec2(0.48, 0.0)), 0.01) * 0.6;

    vec2 c1 = p - vec2(-0.42, -0.24);
    float r1 = length(c1);
    float rings1 = stroke(r1 - 1.04, 0.014) + stroke(r1 - 0.88, 0.01) + stroke(r1 - 0.62, 0.016) + stroke(r1 - 0.48, 0.01);
    float band1 = fill(r1 - 0.88) * (1.0 - fill(r1 - 0.62));
    float arc1 = stroke(r1 - 0.95, 0.035) * arcMask(c1, -2.2, 0.75);

    vec2 c2 = p - vec2(1.45, 0.6);
    float r2 = length(c2);
    float rings2 = stroke(r2 - 0.56, 0.012) + stroke(r2 - 0.42, 0.01) + stroke(r2 - 0.24, 0.012);
    float band2 = fill(r2 - 0.42) * (1.0 - fill(r2 - 0.24));
    float arc2 = stroke(r2 - 0.33, 0.04) * arcMask(c2, 2.6, 0.9);

    float screws = screw(p - vec2(2.18, 1.53)) + screw(p - vec2(-2.18, -1.53));
    float chip = fill(sdBox(p - vec2(-2.12, 1.5), vec2(0.13)));

    float ink = groove * 0.16 + labLine * 0.14 + rings1 * 0.12 + rings2 * 0.12 + band1 * 0.05 + band2 * 0.05 + screws * 0.16;
    float hi = grooveHi * 0.22 + label * 0.28;
    float amber = clamp(arc1 * 0.5 + arc2 * 0.55 + chip * 0.7, 0.0, 1.0);

    col = mix(col, uInk, min(1.0, ink * detail));
    col = mix(col, uRim, min(1.0, hi * detail));
    col = mix(col, uAmber, min(1.0, amber * detail));
    alpha += (ink * 0.25 + hi * 0.12 + amber * 0.25) * detail;
  }

  // per-plate variation and the navigation pulse
  // tone < 1 darkens toward the warm shade rather than toward grey
  col = mix(col, uShade, clamp((1.0 - vInst.x) * 2.0, 0.0, 1.0));
  col = mix(col, uRim, vInst.z * 0.35);

  float fog = smoothstep(uFogNear, uFogFar, vDepth);
  col = mix(col, paper(), fog);
  alpha = clamp(alpha, 0.0, 1.0) * (1.0 - fog) * vInst.y;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
}
`;

export function createPlateMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: FrontSide,
    uniforms: {
      uShade: { value: new Vector3() },
      uLit: { value: new Vector3() },
      uRim: { value: new Vector3() },
      uEdge: { value: new Vector3() },
      uInk: { value: new Vector3() },
      uAmber: { value: new Vector3() },
      uBgHi: { value: new Vector3() },
      uBg: { value: new Vector3() },
      uBgLo: { value: new Vector3() },
      uRes: { value: new Vector2(1, 1) },
      uFogNear: { value: 100 },
      uFogFar: { value: 200 },
      uFaceAlpha: { value: 0.5 },
      uSideAlpha: { value: 0.8 },
      uLooseAlpha: { value: 0.4 },
      uLight: { value: new Vector3(-0.4, 0.85, 0.45) },
      uWrap: { value: 0.4 },
      uRimK: { value: 0.55 },
      uBorder: { value: 0.08 },
      uAO: { value: 0.45 },
      uAOFrom: { value: 0.1 },
      uPlaneN: { value: new Vector3(0, 0.5, 0.86) },
    },
  });
}

/** Load a palette plus the page background (read from CSS) into the material. */
export function applyPalette(m: ShaderMaterial, theme: "light" | "dark", bg: { hi: string; bg: string; lo: string }) {
  const p = PALETTES[theme];
  const u = m.uniforms;
  srgb(p.shade, u.uShade.value);
  srgb(p.lit, u.uLit.value);
  srgb(p.rim, u.uRim.value);
  srgb(p.edge, u.uEdge.value);
  srgb(p.ink, u.uInk.value);
  srgb(p.amber, u.uAmber.value);
  srgb(bg.hi, u.uBgHi.value);
  srgb(bg.bg, u.uBg.value);
  srgb(bg.lo, u.uBgLo.value);
  u.uFaceAlpha.value = p.faceAlpha;
  u.uSideAlpha.value = p.sideAlpha;
  u.uLooseAlpha.value = p.looseAlpha;
}
