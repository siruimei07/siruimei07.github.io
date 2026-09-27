import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";

// Things drifting in the air of the old town: warm embers and floating paper
// lanterns rising out of the street, soft green light-motes (the film's
// bokeh), and sakura petals falling from the temple trees. One instanced,
// additive, depth-tested draw; motion is computed in the vertex shader.

export type ParticleVolume = { min: THREE.Vector3; max: THREE.Vector3; count: number; type: number };

const vert = /* glsl */ `
${common}
attribute vec4 aSeed;     // x, y, z (0..1 in the volume), speed/size jitter
attribute vec4 aVol0;     // volume min xyz, type
attribute vec3 aVol1;     // volume max xyz
uniform float uTime;
uniform float uPxAngle;
varying vec2 vQ;
varying float vType;
varying float vViewZ;
varying float vSeed;
varying float vFade;
void main() {
  float type = aVol0.w;
  vec3 lo = aVol0.xyz;
  vec3 hi = aVol1;
  vec3 ext = hi - lo;
  float j = aSeed.w;
  vec3 p = lo + aSeed.xyz * ext;
  float t = uTime;
  float size;
  // rise (embers, lanterns), drift (motes) or fall (petals); wrap in the volume
  if (type < 0.5) {
    float v = 0.5 + j * 0.9;
    p.y = lo.y + mod(aSeed.y * ext.y + t * v, ext.y);
    p.x += sin(t * 0.7 + j * 20.0) * 0.6 + sin(t * 1.9 + j * 7.0) * 0.2;
    p.z += cos(t * 0.5 + j * 13.0) * 0.6;
    size = 0.06 + 0.07 * j;
  } else if (type < 1.5) {
    float v = 0.35 + j * 0.35;
    p.y = lo.y + mod(aSeed.y * ext.y + t * v, ext.y);
    p.x += sin(t * 0.2 + j * 20.0) * 2.0 + t * 0.25;
    p.x = lo.x + mod(p.x - lo.x, ext.x);
    p.z += cos(t * 0.17 + j * 13.0) * 2.0;
    size = 0.45 + 0.25 * j;
  } else if (type < 2.5) {
    p += vec3(sin(t * 0.13 + j * 30.0), sin(t * 0.21 + j * 11.0) * 0.6, cos(t * 0.11 + j * 17.0)) * 1.5;
    size = 0.07 + 0.06 * j;
  } else {
    float v = 0.7 + j * 0.6;
    p.y = hi.y - mod(aSeed.y * ext.y + t * v, ext.y);
    float fl = t * (1.5 + j * 2.0) + j * 40.0;
    p.x += sin(fl * 0.5) * 0.8 + t * 0.6;
    p.x = lo.x + mod(p.x - lo.x, ext.x);
    p.z += cos(fl * 0.37) * 0.8;
    size = 0.035 + 0.025 * j;
  }
  // fade at the top and bottom of the volume so wrapping never pops
  float h = (p.y - lo.y) / ext.y;
  vFade = smoothstep(0.0, 0.08, h) * smoothstep(1.0, 0.85, h);
  vec4 vp = viewMatrix * vec4(p, 1.0);
  float depth = max(-vp.z, 0.01);
  // nothing drifts right in front of the lens
  vFade *= smoothstep(3.0, 8.0, depth);
  float minPx = type < 0.5 ? 1.6 : type < 1.5 ? 2.5 : type < 2.5 ? 1.8 : 1.3;
  size = max(size, depth * uPxAngle * minPx);
  // petals tumble: squash the quad along a turning axis
  vec2 q = position.xy;
  if (type > 2.5) {
    float a = t * (2.0 + j * 3.0) + j * 9.0;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * (q * vec2(1.0, 0.45 + 0.55 * abs(sin(a * 0.7))));
  }
  if (type > 0.5 && type < 1.5) q.y *= 1.25;
  vp.xy += q * size;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  vType = type;
  vViewZ = depth;
  vSeed = j;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
uniform float uTime;
uniform float uGain;
varying vec2 vQ;
varying float vType;
varying float vViewZ;
varying float vSeed;
varying float vFade;
void main() {
  float vis = sceneVisible(vViewZ) * uGain;
  if (vis <= 0.0) discard;
  float r = length(vQ);
  vec3 c;
  if (vType < 0.5) {
    float tw = 0.7 + 0.3 * sin(uTime * (4.0 + vSeed * 6.0) + vSeed * 50.0);
    c = vec3(1.0, 0.45, 0.12) * (exp(-r * r * 9.0) * 2.2 + exp(-r * r * 40.0) * 3.0) * tw;
  } else if (vType < 1.5) {
    // floating paper lantern: a glowing box with dark rims, and its halo
    vec2 q = abs(vQ);
    float box = step(q.x, 0.52) * step(q.y, 0.7);
    float rim = box * (step(0.58, q.y) + step(0.46, q.x) * 0.6);
    float body = box * (1.0 - rim);
    float grad = 1.0 - 0.45 * (vQ.y + 0.7) / 1.4;
    c = vec3(1.0, 0.42, 0.12) * body * 2.6 * grad + vec3(0.25, 0.08, 0.03) * rim;
    c += vec3(1.0, 0.4, 0.12) * exp(-r * r * 2.2) * 0.35;
  } else if (vType < 2.5) {
    float disc = smoothstep(1.0, 0.86, r);
    float ring = smoothstep(0.7, 0.95, r) * disc;
    c = vec3(0.35, 1.0, 0.45) * (disc * 0.22 + ring * 0.25);
  } else {
    float petal = smoothstep(1.0, 0.7, r);
    c = vec3(1.0, 0.55, 0.72) * petal * 0.75;
  }
  gl_FragColor = vec4(c * vis * vFade, 1.0);
}`;

export function buildParticles(volumes: ParticleVolume[], density: number) {
  const rand = rng(4242);
  const total = volumes.reduce((a, v) => a + Math.round(v.count * density), 0);
  const quad = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  const seed = new Float32Array(total * 4);
  const v0 = new Float32Array(total * 4);
  const v1 = new Float32Array(total * 3);
  let i = 0;
  for (const v of volumes) {
    const n = Math.round(v.count * density);
    for (let k = 0; k < n; k++, i++) {
      seed.set([rand(), rand(), rand(), rand()], i * 4);
      v0.set([v.min.x, v.min.y, v.min.z, v.type], i * 4);
      v1.set([v.max.x, v.max.y, v.max.z], i * 3);
    }
  }
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute("aVol0", new THREE.InstancedBufferAttribute(v0, 4));
  g.setAttribute("aVol1", new THREE.InstancedBufferAttribute(v1, 3));
  g.instanceCount = total;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...fxShared, uTime: env.uTime, uPxAngle: { value: 0.001 }, uGain: { value: 1 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera: THREE.PerspectiveCamera, heightPx: number) {
      mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
    },
    gain(v: number) {
      mat.uniforms.uGain.value = v;
    },
  };
}
