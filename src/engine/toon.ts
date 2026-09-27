import * as THREE from "three";
import { common, octa } from "./glsl";

// The "3D rendered as 2D" material family. Every opaque surface is shaded
// with a hard two-tone terminator against the moon, a designed shadow colour
// (not a darkened base), a moonlit rim, banded local lights and flat aerial
// perspective, and writes a second G-buffer target (view normal, view depth,
// ink id) from which the pipeline draws the ink lines.

/** Uniforms shared by every toon material; the world animates them. */
export const env = {
  uTime: { value: 0 },
  uMoonDir: { value: new THREE.Vector3(0.16, 0.12, -1).normalize() },
  /** Stylised key light used for the two-tone shading (moonlight "from above"). */
  uKeyDir: { value: new THREE.Vector3(-0.08, 1.0, -0.85).normalize() },
  uSkyAmb: { value: new THREE.Color(1.0, 1.0, 1.0) },
  uGroundAmb: { value: new THREE.Color(0.86, 0.88, 0.96) },
  uRimCol: { value: new THREE.Color(0.55, 0.72, 1.0) },
  uFogCol: { value: new THREE.Color(0.07, 0.15, 0.38) },
  uFogMoon: { value: new THREE.Color(0.16, 0.28, 0.62) },
  uFogDist: { value: new THREE.Vector3(350, 9000, 0.78) }, // start, end, max amount
  /** Rainbow light at the base of the gaming pole: xyz position, w radius. */
  uPoleLight: { value: new THREE.Vector4(0, 0, 0, 20) },
  uPoleCol: { value: new THREE.Color(1, 0.3, 0.8) },
  /** Up to four warm point lights (lamps, vending machine): xyz, w radius. */
  uLamps: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uLampCols: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()] },
  uWind: { value: new THREE.Vector3(1, 0, 0.3) }, // direction xz + gust phase in y
};

export type ToonOptions = {
  /** Lit colour. */
  color: THREE.ColorRepresentation;
  /** Shadow colour; defaults to a cool, darker version of `color`. */
  shade?: THREE.ColorRepresentation;
  /** Ink-line group; 0 disables lines on this surface. */
  ink?: number;
  rim?: number;
  emissive?: THREE.ColorRepresentation;
  /** Terminator position in N·L and its softness. */
  step?: number;
  soft?: number;
  /** Aerial perspective multiplier (0 = none). */
  fog?: number;
  /** How much the local lights reach this surface. */
  lights?: number;
  side?: THREE.Side;
  /** GLSL run in world space after the model matrix: may edit `wp` (vec4) and `nrm`. */
  vertex?: string;
  /** Extra vertex declarations (attributes, uniforms, varyings, functions). */
  vertexHead?: string;
  /** GLSL that may edit `base`, `shade`, `emis`, `n` (world normal) and `alpha` before lighting. */
  fragment?: string;
  fragmentHead?: string;
  uniforms?: Record<string, THREE.IUniform>;
  defines?: Record<string, string | number | boolean>;
  alphaToCoverage?: boolean;
  vertexColors?: boolean;
};

export const toonVertex = (o: Pick<ToonOptions, "vertex" | "vertexHead">) => /* glsl */ `
${common}
uniform float uTime;
uniform vec3 uWind;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying float vViewZ;
varying vec3 vTint;
varying vec2 vUv;
${o.vertexHead ?? ""}
void main() {
  vec3 nrm = normal;
  vTint = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
  vTint *= instanceColor;
#endif
#ifdef USE_COLOR
  vTint *= color.rgb;
#endif
  vUv = uv;
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec4 wp = m * vec4(position, 1.0);
  nrm = normalize(mat3(m) * nrm);
  ${o.vertex ?? ""}
  vWorldPos = wp.xyz;
  vWorldNormal = nrm;
  vec4 vp = viewMatrix * wp;
  vViewNormal = mat3(viewMatrix) * nrm;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

export const toonFragment = (o: Pick<ToonOptions, "fragment" | "fragmentHead">) => /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
${octa}
uniform float uTime;
uniform vec3 uBase;
uniform vec3 uShade;
uniform vec3 uEmissive;
uniform float uRim;
uniform float uStep;
uniform float uSoft;
uniform float uInk;
uniform float uFogMul;
uniform float uLights;
uniform vec3 uMoonDir;
uniform vec3 uKeyDir;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform vec3 uRimCol;
uniform vec3 uFogCol;
uniform vec3 uFogMoon;
uniform vec3 uFogDist;
uniform vec4 uPoleLight;
uniform vec3 uPoleCol;
uniform vec4 uLamps[4];
uniform vec3 uLampCols[4];
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying float vViewZ;
varying vec3 vTint;
varying vec2 vUv;
${o.fragmentHead ?? ""}

// Banded point light: three flat steps of falloff, like painted light pools.
vec3 pointLight(vec4 L, vec3 c, vec3 n, vec3 base) {
  vec3 d = L.xyz - vWorldPos;
  float dist = length(d);
  float f = saturate(1.0 - dist / max(L.w, 1e-3));
  f *= f;
  float wrap = saturate(dot(n, d / max(dist, 1e-3)) * 0.65 + 0.35);
  float v = f * wrap;
  v = floor(v * 3.0 + 0.35) / 3.0 + v * 0.18;
  return c * base * v;
}

void main() {
  vec3 n = normalize(vWorldNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 base = uBase * vTint;
  vec3 shade = uShade * vTint;
  vec3 emis = uEmissive;
  float alpha = 1.0;
  ${o.fragment ?? ""}
  float ndl = dot(n, uKeyDir);
  float lit = smoothstep(uStep - uSoft, uStep + uSoft, ndl);
  vec3 col = mix(shade, base, lit);
  col *= mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
  // curved surfaces still catch a little fresnel rim; the strong rim is screen-space (ink pass)
  float fres = 1.0 - saturate(dot(n, V));
  float curvy = saturate(length(fwidth(n)) * 40.0);
  col += uRimCol * smoothstep(0.62, 0.7, fres) * saturate(dot(n, uMoonDir) + 0.2) * uRim * 0.35 * curvy;
  if (uLights > 0.0) {
    vec3 lc = pointLight(uPoleLight, uPoleCol, n, base + 0.08);
    for (int i = 0; i < 4; i++) lc += pointLight(uLamps[i], uLampCols[i], n, base + 0.05);
    col += lc * uLights;
  }
  col += emis;
  vec3 toCam = vWorldPos - cameraPosition;
  float dist = length(toCam);
  float fog = smoothstep(uFogDist.x, uFogDist.y, dist) * uFogDist.z * uFogMul;
  float towardMoon = pow(saturate(dot(toCam / dist, uMoonDir) * 0.5 + 0.5), 6.0);
  vec3 fogC = mix(uFogCol, uFogMoon, towardMoon);
  col = mix(col, fogC + emis * 0.35, fog);
  gl_FragColor = vec4(col, alpha);
  vec3 vn = normalize(vViewNormal);
  if (!gl_FrontFacing) vn = -vn;
  gAux = vec4(octEncode(vn), vViewZ, uInk + (uInk > 0.5 ? clamp(uRim, 0.0, 1.0) * 0.45 : 0.0));
}`;

const shadeOf = (c: THREE.Color) => {
  // Anime night shadows: darker, cooler and a little more saturated.
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const out = new THREE.Color().setHSL(THREE.MathUtils.lerp(hsl.h, 0.64, 0.45), Math.min(1, hsl.s * 1.1 + 0.08), hsl.l * 0.52);
  return out;
};

export function toonMaterial(o: ToonOptions): THREE.ShaderMaterial {
  const base = new THREE.Color(o.color);
  const shade = o.shade !== undefined ? new THREE.Color(o.shade) : shadeOf(base);
  const mat = new THREE.ShaderMaterial({
    vertexShader: toonVertex(o),
    fragmentShader: toonFragment(o),
    uniforms: {
      ...env,
      uBase: { value: base },
      uShade: { value: shade },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000) },
      uRim: { value: o.rim ?? 0.6 },
      uStep: { value: o.step ?? 0.05 },
      uSoft: { value: o.soft ?? 0.04 },
      uInk: { value: o.ink ?? 1 },
      uFogMul: { value: o.fog ?? 1 },
      uLights: { value: o.lights ?? 1 },
      ...(o.uniforms ?? {}),
    },
    ...(o.defines ? { defines: o.defines } : {}),
    side: o.side ?? THREE.FrontSide,
    vertexColors: o.vertexColors ?? false,
  });
  if (o.alphaToCoverage) mat.alphaToCoverage = true;
  return mat;
}

/**
 * Transparent / additive effects render after the ink pass into the lit
 * buffer. They test against the G-buffer depth themselves.
 */
export const fxShared = {
  tAux: { value: null as THREE.Texture | null },
  uRes: { value: new THREE.Vector2(1, 1) },
};

export const fxDepthTest = /* glsl */ `
uniform sampler2D tAux;
uniform vec2 uRes;
// 1 when the fragment at view depth z is in front of the opaque scene.
float sceneVisible(float z) {
  float sz = texture2D(tAux, gl_FragCoord.xy / uRes).z;
  return sz <= 0.0 ? 1.0 : smoothstep(-0.6, 0.6, sz - z);
}`;
