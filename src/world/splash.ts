import * as THREE from "three";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// Spray thrown up around the camera as it breaks the surface: ballistic
// droplets (bright beads catching the dusk light), a few big out-of-focus
// ones right in front of the lens.

const vert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iP; // offset x, z from the anchor, launch delay, seed
attribute vec4 iV; // vx, vy, vz, radius
uniform float uAge;
uniform vec3 uAnchor;
uniform vec2 uRes;
varying vec2 vQ;
varying float vA;
varying float vBlur;
void main() {
  float t = uAge - iP.z;
  if (t < 0.0 || t > 2.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 p = uAnchor + vec3(iP.x, 0.0, iP.y) + iV.xyz * t + vec3(0.0, -4.9 * t * t, 0.0);
  if (p.y < -0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (c.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float px = iV.w * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
  // Very close drops are out of focus: larger, softer, dimmer.
  float blur = smoothstep(1.2, 0.25, c.w);
  vBlur = blur;
  px = max(px * (1.0 + blur * 3.0), 1.2);
  c.xy += q * px * 2.0 / uRes * c.w;
  gl_Position = c;
  vA = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(1.4, 2.2, t)) * mix(1.0, 0.35, blur);
}`;

const frag = /* glsl */ `
uniform vec3 uLight;
varying vec2 vQ;
varying float vA;
varying float vBlur;
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float soft = mix(smoothstep(1.0, 0.8, r), smoothstep(1.0, 0.0, r) * 0.8, vBlur);
  float spec = smoothstep(0.45, 0.0, length(vQ - vec2(-0.3, 0.35))) * (1.0 - vBlur);
  float rim = smoothstep(0.6, 1.0, r) * (1.0 - vBlur) * 0.6;
  vec3 col = uLight * (0.25 + rim + spec * 2.5) + uLight * vBlur * 0.4;
  gl_FragColor = vec4(col * soft * vA, soft * vA * 0.5);
}`;

export class Splash {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  age = -1;
  readonly anchor = new THREE.Vector3();

  constructor(count: number, rng: () => number) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const p = new Float32Array(count * 4);
    const v = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = 0.2 + Math.pow(rng(), 0.8) * 3.6;
      const x = Math.cos(a) * r * 1.3;
      const z = Math.sin(a) * r * 0.7 - 1.8; // mostly in front of the lens
      p.set([x, z, rng() * 0.18, rng()], i * 4);
      const up = 1.8 + rng() * 3.6;
      v.set([x * 0.35 + (rng() - 0.5) * 1.5, up, (rng() - 0.5) * 1.5, 0.005 + Math.pow(rng(), 3) * 0.04], i * 4);
    }
    geo.setAttribute("iP", new THREE.InstancedBufferAttribute(p, 4));
    geo.setAttribute("iV", new THREE.InstancedBufferAttribute(v, 4));
    geo.instanceCount = count;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uAge: { value: -1 },
        uAnchor: { value: this.anchor },
        uRes: G.uRes,
        uLight: { value: new THREE.Color(3.2, 2.9, 2.95) },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  update() {
    this.material.uniforms.uAge.value = this.age;
    this.mesh.visible = this.age >= 0 && this.age < 2.5;
  }
}
