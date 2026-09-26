import * as THREE from "three";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// Kongming lanterns: paper balloons glowing from a small flame, rising from
// the water on a slow wind, swaying, and fading far up. Positions are
// computed in the vertex shader from (spawn time, seed), so thousands cost
// nothing on the CPU; `release()` launches one from a clicked point.

function lanternGeo() {
  // Slightly tapered 8-sided paper body with a domed top; open bottom.
  const pos: number[] = [];
  const idx: number[] = [];
  const hgt: number[] = [];
  const seg = 8;
  const rows = [
    [0.0, 0.26],
    [0.25, 0.3],
    [0.62, 0.33],
    [0.86, 0.3],
    [0.97, 0.18],
    [1.0, 0.0],
  ];
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rows[r][1], rows[r][0], Math.sin(a) * rows[r][1]);
      hgt.push(rows[r][0]);
    }
  }
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < seg; i++) {
      const a = r * (seg + 1) + i;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Flame disc at the opening (hgt -1 marks it).
  const c = pos.length / 3;
  pos.push(0, 0.02, 0);
  hgt.push(-1);
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.12, 0.02, Math.sin(a) * 0.12);
    hgt.push(-1);
  }
  for (let i = 0; i < seg; i++) idx.push(c, c + 1 + i, c + 2 + i);
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("hgt", new THREE.Float32BufferAttribute(hgt, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const vert = /* glsl */ `
${common}
attribute float hgt;
attribute vec4 iSpawn; // x, z, spawn time, seed
uniform float uTime;
uniform vec2 uWind;
uniform float uLife;
uniform float uSize;
varying float vH;
varying float vGlow;
varying vec3 vN;
varying vec3 vWorld;
varying float vFade;
void main() {
  float age = uTime - iSpawn.z;
  if (age < 0.0 || age > uLife) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float seed = iSpawn.w;
  float rise = 0.55 + seed * 0.7;
  // Accelerates gently off the water, then a steady climb.
  float y = 0.4 + rise * (age - 1.2 * (1.0 - exp(-age / 1.2)));
  vec2 drift = uWind * age * (0.7 + 0.6 * fract(seed * 7.1)) + vec2(sin(age * 0.23 + seed * 20.0), cos(age * 0.19 + seed * 13.0)) * 2.5;
  vec3 base = vec3(iSpawn.x + drift.x, y, iSpawn.y + drift.y);
  float sw = sin(age * 0.9 + seed * 30.0) * 0.08;
  vec3 p = position * uSize * (0.85 + 0.35 * fract(seed * 3.7));
  // Sway (tilt about the bottom).
  p.xy = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p.xy;
  vec3 w = base + p;
  vWorld = w;
  vN = normal;
  vH = hgt;
  vGlow = 0.8 + 0.2 * sin(uTime * 9.0 + seed * 50.0) * sin(uTime * 3.7 + seed * 11.0);
  vFade = smoothstep(0.0, 1.5, age) * (1.0 - smoothstep(uLife * 0.75, uLife, age));
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const frag = /* glsl */ `
${common}
uniform vec3 uCamPos;
uniform float uIntensity;
uniform vec3 uFogColor;
varying float vH;
varying float vGlow;
varying vec3 vN;
varying vec3 vWorld;
varying float vFade;
void main() {
  vec3 flame = vec3(1.0, 0.62, 0.26);
  vec3 col;
  if (vH < -0.5) {
    col = vec3(1.0, 0.8, 0.5) * 6.0;
  } else {
    // Paper lit from inside: hottest just above the flame, a soft top.
    float inner = exp(-vH * 1.6) * 1.2 + 0.35;
    vec3 V = normalize(uCamPos - vWorld);
    float thin = 0.6 + 0.4 * (1.0 - abs(dot(normalize(vN), V))); // edges glow more (thinner paper seen edge-on)
    col = flame * inner * thin * 2.2;
    // Faint vertical ribs of the bamboo frame.
    float ribs = smoothstep(0.93, 1.0, abs(sin(atan(vWorld.z, vWorld.x) * 4.0)));
    col *= 1.0 - ribs * 0.0;
  }
  col *= uIntensity * vGlow * vFade * 1.6;
  float dist = length(uCamPos - vWorld);
  col = mix(col, uFogColor * 0.2, (1.0 - exp(-dist / 2500.0)) * 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyLanterns {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private spawn: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private readonly count: number;
  private readonly rng: () => number;
  time = 0;
  intensity = 0;

  constructor(count: number, rng: () => number, private area: { cx: number; cz: number; rx: number; rz: number; minDist: number }) {
    this.count = count;
    this.rng = rng;
    const geo = lanternGeo();
    const sp = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) sp.set([0, 0, -1e6, rng()], i * 4);
    this.spawn = new THREE.InstancedBufferAttribute(sp, 4);
    this.spawn.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("iSpawn", this.spawn);
    geo.instanceCount = count;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector2(0.35, -0.25) },
        uLife: { value: 190 },
        uSize: { value: 2.6 },
        uCamPos: G.uCamPos,
        uIntensity: { value: 0 },
        uFogColor: G.uFogColor,
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  /** Pre-fill the sky as if lanterns had been rising for `span` seconds. */
  prefill(n: number, span: number) {
    for (let i = 0; i < n; i++) this.launchRandom(this.time - this.rng() * span);
  }

  launchRandom(at = this.time) {
    const a = this.area;
    for (let tries = 0; tries < 8; tries++) {
      const x = a.cx + (this.rng() * 2 - 1) * a.rx;
      const z = a.cz + (this.rng() * 2 - 1) * a.rz;
      if (Math.hypot(x, z - 46) < a.minDist) continue;
      this.release(x, z, at);
      return;
    }
  }

  release(x: number, z: number, at = this.time) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.spawn.setXYZW(i, x, z, at, this.rng());
    this.spawn.needsUpdate = true;
  }

  update(dt: number, rate: number) {
    this.time += dt;
    // Poisson-ish trickle of new lanterns.
    if (rate > 0 && this.rng() < rate * dt) this.launchRandom();
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.001;
  }
}
