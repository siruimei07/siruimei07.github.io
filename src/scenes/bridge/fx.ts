import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";
import { DECK_Y } from "./layout";

// Additive effects for the fx pass: searchlight beams rising from the city,
// the warm haze of light over its heart, and motes of lantern light and
// stray petals drifting over the bridge. All test against the G-buffer.

// ---------------------------------------------------------------- searchlights

export type Beam = { base: THREE.Vector3; az: number; el: number; sweep: number; color: THREE.ColorRepresentation; len: number; width: number };

const beamVert = /* glsl */ `
attribute vec3 aBase;
attribute vec4 aDir;    // az, el (rad), sweep (rad), phase
attribute vec4 aCol;    // rgb, width
attribute float aLen;
uniform float uTime;
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
void main() {
  float az = aDir.x + sin(uTime * 0.09 + aDir.w) * aDir.z;
  float el = aDir.y + sin(uTime * 0.061 + aDir.w * 1.7) * aDir.z * 0.35;
  vec3 dir = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  vec3 P = aBase + dir * aLen * position.y;
  vec3 toCam = normalize(cameraPosition - P);
  vec3 side = normalize(cross(dir, toCam));
  float w = aCol.w * (1.0 + position.y * 12.0);
  P += side * position.x * w;
  vec4 vp = viewMatrix * vec4(P, 1.0);
  vViewZ = -vp.z;
  vQ = position.xy;
  vC = aCol.rgb;
  gl_Position = projectionMatrix * vp;
}`;

const beamFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform float uIntensity;
uniform float uTime;
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float x = vQ.x;
  float y = vQ.y;
  float core = exp(-x * x * 18.0);
  float soft = exp(-x * x * 3.0);
  float a = (core * 0.7 + soft * 0.3) * pow(1.0 - y, 2.2) * smoothstep(0.0, 0.02, y);
  // faint drifting haze in the beam
  a *= 0.8 + 0.2 * vnoise(vec2(x * 3.0, y * 40.0 - uTime * 0.6));
  gl_FragColor = vec4(vC * a * vis * uIntensity, 1.0);
}`;

export function buildSearchlights(beams: Beam[]): THREE.Mesh {
  const quad = new THREE.PlaneGeometry(2, 1, 1, 1);
  quad.translate(0, 0.5, 0);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  const n = beams.length;
  const base = new Float32Array(n * 3);
  const dir = new Float32Array(n * 4);
  const col = new Float32Array(n * 4);
  const len = new Float32Array(n);
  const c = new THREE.Color();
  beams.forEach((b, i) => {
    base.set([b.base.x, b.base.y, b.base.z], i * 3);
    dir.set([THREE.MathUtils.degToRad(b.az), THREE.MathUtils.degToRad(b.el), THREE.MathUtils.degToRad(b.sweep), i * 1.93], i * 4);
    c.set(b.color);
    col.set([c.r, c.g, c.b, b.width], i * 4);
    len[i] = b.len;
  });
  g.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 3));
  g.setAttribute("aDir", new THREE.InstancedBufferAttribute(dir, 4));
  g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 4));
  g.setAttribute("aLen", new THREE.InstancedBufferAttribute(len, 1));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    uniforms: { ...fxShared, uTime: env.uTime, uIntensity: { value: 0.32 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- city haze

const hazeVert = /* glsl */ `
uniform vec3 uCenter;
uniform vec2 uSize;
varying vec2 vQ;
varying float vViewZ;
void main() {
  vec3 fwd = normalize(uCenter - cameraPosition);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 P = uCenter + right * position.x * uSize.x + up * position.y * uSize.y;
  vec4 vp = viewMatrix * vec4(P, 1.0);
  vViewZ = -vp.z;
  vQ = position.xy;
  gl_Position = projectionMatrix * vp;
}`;

const hazeFrag = /* glsl */ `
${common}
uniform sampler2D tAux;
uniform vec2 uRes;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform float uIntensity;
uniform float uMinDepth;
varying vec2 vQ;
varying float vViewZ;
void main() {
  // only over the far city, the forest band and the sky — not over the bridge or the torii
  float sz = texture2D(tAux, gl_FragCoord.xy / uRes).z;
  float farM = sz <= 0.0 ? 1.0 : smoothstep(uMinDepth * 0.8, uMinDepth, sz);
  if (farM <= 0.0) discard;
  vec2 q = vQ;
  float r = length(q * vec2(1.0, 1.35));
  float core = exp(-r * r * 9.0);
  float wide = exp(-r * r * 2.2);
  // denser low down, thinning upward
  float lowK = smoothstep(0.55, -0.35, q.y);
  vec3 c = uWarm * core * (0.6 + 0.6 * lowK) + uCool * wide * 0.5 * lowK;
  gl_FragColor = vec4(c * uIntensity * farM, 1.0);
}`;

export function buildHaze(center: THREE.Vector3, size: THREE.Vector2, warm: THREE.Color, cool: THREE.Color, intensity: number, minDepth: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    vertexShader: hazeVert,
    fragmentShader: hazeFrag,
    uniforms: {
      tAux: fxShared.tAux,
      uRes: fxShared.uRes,
      uCenter: { value: center },
      uSize: { value: size },
      uWarm: { value: warm },
      uCool: { value: cool },
      uIntensity: { value: intensity },
      uMinDepth: { value: minDepth },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- motes and petals

const moteVert = /* glsl */ `
${common}
attribute vec4 aSeed;
uniform float uTime;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
uniform float uPxAngle;
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
varying float vPetal;
void main() {
  float t = uTime;
  vec3 s = aSeed.xyz;
  float petal = step(0.7, aSeed.w);
  // drift: rise slowly (motes) or fall and tumble (petals), wrap inside the box
  vec3 p = s * uBoxSize;
  p.y += t * mix(0.18 + 0.2 * s.x, -0.35 - 0.2 * s.z, petal);
  p.x += t * mix(0.08, 0.5, petal) + sin(t * (0.5 + s.y) + s.z * 20.0) * 0.7;
  p.z += cos(t * (0.4 + s.x) + s.y * 15.0) * 0.6;
  p = mod(p, uBoxSize) + uBoxMin;
  vec4 vp = viewMatrix * vec4(p, 1.0);
  float depth = max(-vp.z, 0.01);
  float size = mix(0.035, 0.06, s.y);
  size = max(size, depth * uPxAngle * 1.6);
  float ang = petal * (t * (1.5 + s.x * 2.0) + s.z * 6.0);
  vec2 q = position.xy;
  vec2 r = vec2(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y);
  vp.xy += r * size * vec2(1.0, mix(1.0, 0.55, petal));
  gl_Position = projectionMatrix * vp;
  vQ = q;
  vViewZ = depth;
  vPetal = petal;
  float tw = 0.6 + 0.4 * sin(t * (2.0 + s.x * 3.0) + s.y * 40.0);
  vC = mix(vec3(1.0, 0.72, 0.4) * 2.2 * tw, vec3(1.0, 0.62, 0.82) * 0.9, petal);
}`;

const moteFrag = /* glsl */ `
${fxDepthTest}
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
varying float vPetal;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float r = length(vQ);
  float a = mix(exp(-r * r * 4.0), smoothstep(1.0, 0.6, r), vPetal);
  gl_FragColor = vec4(vC * a * vis, 1.0);
}`;

export class Motes {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  constructor(count: number, boxMin: THREE.Vector3, boxSize: THREE.Vector3, seed = 99) {
    const rand = rng(seed);
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    const a = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) a.set([rand(), rand(), rand(), rand()], i * 4);
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(a, 4));
    g.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      uniforms: { ...fxShared, uTime: env.uTime, uBoxMin: { value: boxMin }, uBoxSize: { value: boxSize }, uPxAngle: { value: 0.001 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }
  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    this.mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }
}

export const MOTE_BOX = { min: new THREE.Vector3(-18, DECK_Y + 0.3, -80), size: new THREE.Vector3(36, 10, 96) };
