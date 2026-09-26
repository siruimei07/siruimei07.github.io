import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import type { Tier } from "./quality.ts";
import type { FrameContext, Part } from "./World.ts";

export const PALETTE = [
  new THREE.Color(1.0, 0.93, 0.8), // moonlight ivory
  new THREE.Color(1.0, 0.72, 0.38), // lantern gold
  new THREE.Color(0.7, 0.8, 1.0), // pale night blue
  new THREE.Color(1.0, 0.82, 0.55), // candle
  new THREE.Color(0.92, 0.95, 1.0), // silver
];

const SPRITE_FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float a = exp(-r2 * 5.0) + exp(-r2 * 40.0) * 0.8;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

// Drifting spirit motes filling the corridor. Everything is computed in the
// vertex shader from a seed, so the CPU never touches them after creation.
export function createMotes(max = 9000): Part {
  const rnd = mulberry32(5);
  const pos = new Float32Array(max * 3);
  const seed = new Float32Array(max * 4);
  const col = new Float32Array(max * 3);
  for (let i = 0; i < max; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    // Most motes hover low over the water, like fireflies; a few drift higher.
    const y = rnd() < 0.7 ? rnd() * 14 : rnd() * 60;
    pos.set([side * Math.pow(rnd(), 1.4) * 95, y, 70 - rnd() * 450], i * 3);
    seed.set([rnd() * 100, 0.15 + rnd() * 0.5, 0.04 + Math.pow(rnd(), 3) * 0.3, rnd()], i * 4);
    const c = PALETTE[Math.floor(rnd() * PALETTE.length)];
    const b = 0.4 + Math.pow(rnd(), 4) * 2.2;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));

  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute vec4 aSeed;
        attribute vec3 aColor;
        varying vec3 vColor;
        void main() {
          float t = uTime;
          vec3 p = position;
          p.y = mod(p.y + t * aSeed.y * 0.7, 70.0);
          p.x += sin(t * 0.31 * aSeed.y + aSeed.x) * 1.8;
          p.z += cos(t * 0.23 * aSeed.y + aSeed.x * 1.3) * 1.8;
          p += rayPush(p, 6.0, 4.0);
          float glow;
          p += shockPush(p, glow);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          float tw = 0.55 + 0.45 * sin(t * (1.0 + aSeed.w * 3.0) + aSeed.x);
          float fade = smoothstep(1.0, 5.0, depth) * smoothstep(0.0, 3.0, p.y) * (1.0 - smoothstep(60.0, 70.0, p.y));
          float fog = exp(-depth * uFogDensity * 1.4);
          vColor = aColor * tw * fade * fog * (1.0 + glow * 3.0) * mix(0.55, 1.0, uWorld);
          gl_PointSize = clamp(aSeed.z * uPointScale / depth, 1.0, 42.0);
        }
      `,
      fragmentShader: SPRITE_FRAG,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 9;
  return {
    object: points,
    setQuality(tier: Tier) {
      geo.setDrawRange(0, Math.round(max * tier.particles));
    },
  };
}

// Pooled CPU particles for things that need real physics: click bursts, the
// cursor trail, lantern embers. ~2k points uploaded per frame is negligible.
export class Sparks implements Part {
  object: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private vel: Float32Array;
  private col: Float32Array;
  private base: Float32Array;
  private size: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private phys: Float32Array; // gravity, drag
  private head = 0;
  private geo: THREE.BufferGeometry;

  constructor(max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.phys = new Float32Array(max * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.Points(
      this.geo,
      new THREE.ShaderMaterial({
        uniforms: globals,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          ${COMMON}
          attribute vec3 aColor;
          attribute float aSize;
          varying vec3 vColor;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            vColor = aColor;
            gl_PointSize = aSize <= 0.0 ? 0.0 : clamp(aSize * uPointScale / -mv.z, 1.5, 48.0);
          }
        `,
        fragmentShader: SPRITE_FRAG,
      }),
    );
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
    this.object.layers.enable(REFLECT_LAYER);
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, color: THREE.Color, brightness: number, size: number, life: number, gravity = -3, drag = 1.2) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r * brightness, color.g * brightness, color.b * brightness], i * 3);
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.phys[i * 2] = gravity;
    this.phys[i * 2 + 1] = drag;
  }

  burst(center: THREE.Vector3, count: number, speed: number, colors = PALETTE, brightness = 4, size = 0.28) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
      v.multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      v.y += speed * 0.25;
      const c = colors[Math.floor(Math.random() * colors.length)];
      this.emit(center, v, c, brightness * (0.5 + Math.random()), size * (0.6 + Math.random() * 0.8), 0.9 + Math.random() * 1.2);
    }
  }

  update(ctx: FrameContext) {
    const dt = ctx.dt;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      const drag = Math.exp(-this.phys[i * 2 + 1] * dt);
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag + this.phys[i * 2] * dt;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      const a = f * f * (0.75 + 0.25 * Math.sin(ctx.time * 30 + i));
      this.col[k] = this.base[k] * a;
      this.col[k + 1] = this.base[k + 1] * a;
      this.col[k + 2] = this.base[k + 2] * a;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    for (const name of ["position", "aColor", "aSize"]) this.geo.attributes[name].needsUpdate = true;
  }
}
