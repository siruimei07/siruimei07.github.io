import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env } from "../../engine/toon";

// The sky of 月見の野: a copy of common/sky.ts, tuned for this scene. The moon
// is the protagonist of the calendar and shows the real phase of the day, so
// its dark side must read too: a deep navy disc in earthshine (the maria
// faintly visible) with a thin pale rim, and the glow around it follows the
// lit fraction. The sky itself is the film's cyan-blue night.

const vert = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}`;

const frag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uMoonDir;
uniform float uMoonR;      // angular radius (rad)
uniform float uPxPerRad;
uniform float uTime;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uMoonLit;
uniform vec3 uMoonMare;
uniform float uMoonGain;
uniform float uStars;
uniform float uPhase;
uniform float uLitFrac;
uniform vec3 uMoonDark;
uniform vec3 uEarth;
uniform float uHalo;
varying vec2 vNdc;

float ellipse(vec2 p, vec2 c, vec2 r, float rot) {
  vec2 d = p - c;
  float s = sin(rot), co = cos(rot);
  d = mat2(co, -s, s, co) * d;
  return length(d / r);
}

float maria(vec2 p) {
  vec2 w = vec2(fbm2(p * 2.3 + 2.0, 4), fbm2(p * 2.3 - 4.0, 4)) - 0.5;
  vec2 q = p + w * 0.3;
  q += (vec2(fbm2(p * 7.0, 3), fbm2(p * 7.0 + 3.3, 3)) - 0.5) * 0.1;
  float m = 1e3;
  m = min(m, ellipse(q, vec2(-0.30, 0.40), vec2(0.27, 0.22), 0.3));
  m = min(m, ellipse(q, vec2(0.17, 0.39), vec2(0.15, 0.13), 0.0));
  m = min(m, ellipse(q, vec2(0.33, 0.10), vec2(0.2, 0.16), -0.4));
  m = min(m, ellipse(q, vec2(0.67, 0.28), vec2(0.1, 0.085), 0.2));
  m = min(m, ellipse(q, vec2(0.52, -0.2), vec2(0.11, 0.16), 0.3));
  m = min(m, ellipse(q, vec2(0.30, -0.28), vec2(0.08, 0.075), 0.0));
  m = min(m, ellipse(q, vec2(-0.6, 0.06), vec2(0.2, 0.38), 0.3));
  m = min(m, ellipse(q, vec2(-0.44, -0.12), vec2(0.16, 0.14), 0.0));
  m = min(m, ellipse(q, vec2(-0.19, -0.37), vec2(0.16, 0.11), 0.1));
  m = min(m, ellipse(q, vec2(-0.47, -0.36), vec2(0.08, 0.08), 0.0));
  m = min(m, ellipse(q, vec2(-0.05, 0.72), vec2(0.44, 0.06), 0.08));
  m = min(m, ellipse(q, vec2(0.02, 0.19), vec2(0.075, 0.06), 0.0));
  m = min(m, ellipse(q, vec2(-0.26, 0.04), vec2(0.12, 0.09), 0.0));
  m = min(m, ellipse(q, vec2(0.78, -0.02), vec2(0.05, 0.1), 0.0));
  return m;
}

vec3 moonSurface(vec2 p, out float mare) {
  float r = length(p);
  float m = maria(p);
  mare = smoothstep(1.02, 0.98, m);
  float core = smoothstep(0.62, 0.4, m);
  vec3 col = mix(uMoonLit, uMoonMare, mare);
  col = mix(col, uMoonMare * 0.95, core * 0.4);
  float mott = fbm2(p * 11.0 + 5.0, 3);
  col *= 1.0 + (mott - 0.5) * 0.08 * (1.0 - mare);
  vec2 g = p * 13.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash12(id + 7.0);
  float crater = 0.0;
  if (h < 0.28 && p.y < 0.2) {
    vec2 c = (hash22(id) - 0.5) * 0.5;
    float rr = 0.12 + 0.18 * hash12(id + 3.0);
    float d = length(f - c);
    crater = smoothstep(rr, rr * 0.7, d) - smoothstep(rr * 0.75, rr * 0.45, d) * 0.7;
  }
  col = mix(col, uMoonLit * 1.08, crater * 0.35 * (1.0 - mare));
  vec2 ty = vec2(-0.11, -0.73);
  vec2 d = p - ty;
  float ang = atan(d.y, d.x);
  float rays = pow(saturate(sin(ang * 11.0 + 1.3) * 0.5 + 0.5), 16.0) + pow(saturate(sin(ang * 7.0 - 0.4) * 0.5 + 0.5), 22.0);
  float rayFall = smoothstep(0.95, 0.05, length(d));
  col = mix(col, uMoonLit * 1.06, rays * rayFall * 0.5);
  float cr = 0.0;
  cr += smoothstep(0.045, 0.03, length(d)) - smoothstep(0.03, 0.018, length(d)) * 0.6;
  cr += smoothstep(0.045, 0.03, length(p - vec2(-0.3, 0.12))) * 0.8;
  cr += smoothstep(0.028, 0.018, length(p - vec2(-0.55, 0.14))) * 0.7;
  col = mix(col, uMoonLit * 1.1, saturate(cr));
  col *= mix(1.0, 0.9, smoothstep(0.6, 1.0, r));
  col = mix(col, col * 0.9, step(0.955, r));
  return col;
}

vec3 stars(vec3 dir, float moonDist) {
  float el = asin(clamp(dir.y, -1.0, 1.0));
  if (el < 0.0) return vec3(0.0);
  float az = atan(dir.x, -dir.z);
  vec3 acc = vec3(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float density = layer == 0 ? 90.0 : 34.0;
    vec2 g = vec2(az * density / TAU * 6.0, el * density / (PI * 0.5) * 1.6);
    g.x *= cos(el) * 0.8 + 0.2;
    vec2 id = floor(g);
    vec2 f = fract(g);
    float h = hash12(id + float(layer) * 31.7);
    float keep = layer == 0 ? 0.2 : 0.07;
    if (h < keep) {
      vec2 c = vec2(0.2 + 0.6 * hash12(id + 1.3), 0.2 + 0.6 * hash12(id + 7.1));
      vec2 cellPx = vec2(TAU / (density * 6.0) * (cos(el) * 0.8 + 0.2), (PI * 0.5) / (density * 1.6)) * uPxPerRad;
      vec2 dpx = (f - c) * cellPx;
      float big = layer == 1 ? 1.0 : 0.0;
      float size = mix(0.9, 1.7, hash12(id + 4.2)) + big * 0.8;
      float tw = 0.65 + 0.35 * sin(uTime * (1.3 + h * 5.0) + h * 80.0);
      float s = smoothstep(size, size * 0.3, length(dpx));
      if (big > 0.5) {
        float cross = smoothstep(7.0, 0.0, abs(dpx.x)) * smoothstep(1.1, 0.0, abs(dpx.y)) + smoothstep(7.0, 0.0, abs(dpx.y)) * smoothstep(1.1, 0.0, abs(dpx.x));
        s += cross * 0.55 * tw;
      }
      float b = mix(0.5, 1.4, hash12(id + 9.9)) * tw;
      acc += vec3(0.9, 0.97, 1.0) * s * b * (1.0 + big * 1.2);
    }
  }
  float fade = smoothstep(0.12, 0.45, el) * smoothstep(uMoonR * 1.3, uMoonR * 5.0, moonDist);
  return acc * fade * uStars;
}

void main() {
  vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  float el = dir.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.3, el));
  col = mix(col, uZenith, smoothstep(0.26, 0.9, el));
  float md = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
  // glow around the moon; a thin moon glows less
  float gk = 0.3 + 0.7 * uLitFrac;
  float glow = exp(-md / (uMoonR * 3.6)) * 0.7 + exp(-md / (uMoonR * 1.1)) * 0.8;
  col += uGlow * glow * gk;
  col += uGlow * 0.14 * uHalo * gk * exp(-pow((md - uMoonR * 2.3) / (uMoonR * 0.1), 2.0));
  col += stars(dir, md);
  col = mix(col, uHorizon * 0.8, smoothstep(0.0, -0.06, el));
  if (md < uMoonR * 1.04) {
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(right, uMoonDir);
    vec2 p = vec2(dot(dir, right), dot(dir, up)) / sin(uMoonR);
    float r = length(p);
    float mare;
    vec3 m = moonSurface(p, mare) * uMoonGain;
    if (abs(uPhase - 0.5) > 0.004) {
      float k = cos(uPhase * TAU);
      float xt = k * sqrt(max(0.0, 1.0 - p.y * p.y));
      float s = uPhase < 0.5 ? p.x - xt : -xt - p.x;
      float aa = 1.5 / (uMoonR * uPxPerRad);
      float lit = smoothstep(-aa, aa, s);
      // the unlit part in earthshine: deep navy, the maria a shade darker,
      // a thin pale limb
      vec3 dark = uMoonDark * (1.0 - 0.22 * mare);
      float limb = smoothstep(0.84, 0.99, r);
      dark += uEarth * limb * limb;
      m = mix(dark, m, lit);
    }
    float a = smoothstep(1.0, 1.0 - 2.0 / (uMoonR * uPxPerRad), r);
    col = mix(col, m, a);
  }
  float d = ign(gl_FragCoord.xy) - 0.5;
  col += d * 0.004;
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0);
}`;

export type MoonSkyOptions = {
  /** Angular radius of the moon disc, degrees. */
  moonRadius?: number;
  zenith?: THREE.ColorRepresentation;
  mid?: THREE.ColorRepresentation;
  horizon?: THREE.ColorRepresentation;
  glow?: THREE.ColorRepresentation;
  moonLit?: THREE.ColorRepresentation;
  moonMare?: THREE.ColorRepresentation;
  moonGain?: number;
  stars?: number;
  /** 0 new … 0.5 full … 1 new. */
  phase?: number;
  /** The dark side of a partial moon, and its earthshine limb. */
  moonDark?: THREE.ColorRepresentation;
  earthshine?: THREE.ColorRepresentation;
  halo?: number;
};

export class MoonSky {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(o: MoonSkyOptions = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uMoonDir: env.uMoonDir,
        uMoonR: { value: THREE.MathUtils.degToRad(o.moonRadius ?? 5) },
        uPxPerRad: { value: 1000 },
        uTime: env.uTime,
        uZenith: { value: new THREE.Color(o.zenith ?? 0x1f6ef0) },
        uMid: { value: new THREE.Color(o.mid ?? 0x3d9be6) },
        uHorizon: { value: new THREE.Color(o.horizon ?? 0x7fd3f2) },
        uGlow: { value: new THREE.Color(o.glow ?? 0xc9f4ff) },
        uMoonLit: { value: new THREE.Color(o.moonLit ?? 0xfbfdff) },
        uMoonMare: { value: new THREE.Color(o.moonMare ?? 0xd6e3f2) },
        uMoonGain: { value: o.moonGain ?? 2.6 },
        uStars: { value: o.stars ?? 0.6 },
        uPhase: { value: 0.5 },
        uLitFrac: { value: 1 },
        uMoonDark: { value: new THREE.Color(o.moonDark ?? 0x173a78) },
        uEarth: { value: new THREE.Color(o.earthshine ?? 0x3f7fc8) },
        uHalo: { value: o.halo ?? 1 },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.phase = o.phase ?? 0.5;
  }

  /** Angular radius of the moon (rad). */
  get moonRadius(): number {
    return this.material.uniforms.uMoonR.value;
  }

  get phase(): number {
    return this.material.uniforms.uPhase.value;
  }

  set phase(p: number) {
    const u = this.material.uniforms;
    u.uPhase.value = p;
    u.uLitFrac.value = (1 - Math.cos(p * 2 * Math.PI)) / 2;
  }

  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    const u = this.material.uniforms;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uPxPerRad.value = heightPx / THREE.MathUtils.degToRad(camera.fov);
  }
}
