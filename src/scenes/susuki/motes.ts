import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";
import { EYE_SCREEN, groundY, POND } from "./layout";

// Motes of moonlight drifting up over the grass, and a few late fireflies
// blinking low by the pond. Additive sprites in the fx pass, depth-tested
// against the G-buffer so the grass and the hall hide them.

const vert = /* glsl */ `
${common}
attribute vec4 aHome;   // xyz, wander radius
attribute vec4 aSeed;   // phase, speed, kind (0 mote, 1 firefly), size
uniform float uTime;
uniform float uPxAngle;
varying vec2 vQ;
varying float vViewZ;
varying float vKind;
varying float vBlink;
void main() {
  float t = uTime * aSeed.y;
  float ph = aSeed.x * 6.2831;
  vec3 p = aHome.xyz;
  p.x += (sin(t * 0.31 + ph) + 0.5 * sin(t * 0.73 + ph * 2.1)) * aHome.w;
  p.z += (cos(t * 0.27 + ph * 1.3) + 0.5 * sin(t * 0.61 + ph * 0.7)) * aHome.w;
  p.y += sin(t * 0.47 + ph * 1.7) * 0.35 * aHome.w;
  // motes rise slowly and loop
  if (aSeed.z < 0.5) p.y += mod(uTime * 0.12 * aSeed.y + aSeed.x * 7.0, 7.0) - 1.0;
  vec4 vp = viewMatrix * vec4(p, 1.0);
  float depth = max(-vp.z, 0.01);
  float size = max(aSeed.w, depth * uPxAngle * (aSeed.z > 0.5 ? 3.0 : 2.2));
  vp.xy += position.xy * size;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  vViewZ = depth;
  vKind = aSeed.z;
  // fireflies pulse; motes twinkle gently and fade at the ends of their loop
  float blink = aSeed.z > 0.5 ? pow(max(0.0, sin(uTime * (1.1 + aSeed.y) + ph)), 3.0) : 0.55 + 0.45 * sin(uTime * 2.3 * aSeed.y + ph);
  if (aSeed.z < 0.5) {
    float lp = mod(uTime * 0.12 * aSeed.y + aSeed.x * 7.0, 7.0) / 7.0;
    blink *= smoothstep(0.0, 0.15, lp) * smoothstep(1.0, 0.8, lp);
  }
  vBlink = blink;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
uniform vec3 uMote;
uniform vec3 uFly;
uniform float uIntensity;
varying vec2 vQ;
varying float vViewZ;
varying float vKind;
varying float vBlink;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float r = length(vQ);
  float core = smoothstep(0.35, 0.0, r);
  float halo = exp(-r * r * 6.0) * 0.45;
  float a = (core + halo) * vBlink;
  if (a < 0.003) discard;
  vec3 c = vKind > 0.5 ? uFly : uMote;
  gl_FragColor = vec4(c * a * uIntensity * vis, 1.0);
}`;

export class Motes {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(density: number) {
    const rand = rng(777);
    const homes: number[] = [];
    const seeds: number[] = [];
    const nMotes = Math.round(70 * (0.5 + 0.5 * density));
    const nFlies = Math.round(26 * (0.5 + 0.5 * density));
    const D = Math.PI / 180;
    for (let i = 0; i < nMotes; i++) {
      // over the field in front of the viewer, toward the hall
      const az = (-10 + rand() * 70) * D;
      const d = 6 + Math.pow(rand(), 0.7) * 70;
      const x = EYE_SCREEN[0] + Math.sin(az) * d;
      const z = EYE_SCREEN[2] - Math.cos(az) * d;
      homes.push(x, groundY(x, z) + 1.2 + rand() * 4.5, z, 0.8 + rand() * 2.2);
      seeds.push(rand(), 0.5 + rand() * 0.8, 0, 0.05 + rand() * 0.05);
    }
    for (let i = 0; i < nFlies; i++) {
      // low over the pond and its banks
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand());
      const u = Math.cos(a) * (POND.rx + 3) * r;
      const v = Math.sin(a) * (POND.rz + 3) * r;
      const c = Math.cos(POND.yaw);
      const s = Math.sin(POND.yaw);
      const x = POND.x + u * c + v * s;
      const z = POND.z - u * s + v * c;
      homes.push(x, Math.max(POND.level, groundY(x, z)) + 0.35 + rand() * 1.4, z, 0.4 + rand() * 1.2);
      seeds.push(rand(), 0.6 + rand() * 0.9, 1, 0.03 + rand() * 0.02);
    }
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aHome", new THREE.InstancedBufferAttribute(new Float32Array(homes), 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4));
    g.instanceCount = homes.length / 4;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...fxShared,
        uTime: env.uTime,
        uPxAngle: { value: 0.001 },
        uMote: { value: new THREE.Color(0.7, 0.93, 1.0).multiplyScalar(1.6) },
        uFly: { value: new THREE.Color(1.0, 0.93, 0.5).multiplyScalar(2.6) },
        uIntensity: { value: 1 },
      },
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
