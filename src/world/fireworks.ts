import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import type { FrameContext, Part } from "./World.ts";

const N = 520; // stars per shell
const TRAIL = 4; // copies per star, lagging in time, to draw streaks
const POOL = 6;

type Pattern = 0 | 1 | 2 | 3; // sphere, ring, willow, heart

// Traditional hanabi colours: gold, silver, soft red and pale moon-white.
const PAIRS: [number, number][] = [
  [0xffd08a, 0xff9a4a],
  [0xf2f4ff, 0xffd08a],
  [0xff7a5c, 0xffc98a],
  [0xfff1d6, 0xb8c8ff],
  [0xffb86b, 0xffe2b0],
];

function shellGeometry() {
  const count = N * TRAIL;
  const sphere = new Float32Array(count * 3);
  const flat = new Float32Array(count * 3); // ring direction (x, y)
  const heart = new Float32Array(count * 3);
  const rand = new Float32Array(count * 4);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    const s = [Math.cos(th) * r, y, Math.sin(th) * r];
    const a = (i / N) * Math.PI * 2;
    const f = [Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.08];
    const hx = 16 * Math.pow(Math.sin(a), 3);
    const hy = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    const h = [hx / 17, hy / 17 + 0.15, (Math.random() - 0.5) * 0.05];
    const rj = [Math.random(), Math.random(), 0, Math.random()];
    for (let k = 0; k < TRAIL; k++) {
      const j = i * TRAIL + k;
      sphere.set(s, j * 3);
      flat.set(f, j * 3);
      heart.set(h, j * 3);
      rand.set([rj[0], rj[1], k, rj[3]], j * 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(sphere, 3));
  g.setAttribute("aFlat", new THREE.BufferAttribute(flat, 3));
  g.setAttribute("aHeart", new THREE.BufferAttribute(heart, 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
  return g;
}

const VERT = /* glsl */ `
  ${COMMON}
  attribute vec3 aFlat;
  attribute vec3 aHeart;
  attribute vec4 aRand; // speed jitter, life jitter, trail index, rocket selector
  uniform vec3 uOrigin;
  uniform vec3 uCenter;
  uniform float uT0;
  uniform float uRise;
  uniform float uPattern;
  uniform float uScale;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform mat3 uBasis; // camera-facing basis for ring and heart shells
  varying vec3 vColor;

  void main() {
    float lag = aRand.z * 0.045;
    float age = uTime - uT0 - lag;
    vec3 p = vec3(0.0);
    vec3 col = vec3(0.0);
    float size = 0.0;
    if (age >= 0.0 && age < uRise) {
      if (aRand.w < 0.035) {
        float k = age / uRise;
        float e = 1.0 - pow(1.0 - k, 2.2);
        p = mix(uOrigin, uCenter, e) + vec3(sin(age * 30.0 + aRand.x * 9.0), 0.0, cos(age * 27.0)) * 0.25;
        col = vec3(1.0, 0.75, 0.45) * 3.0 * (1.0 - aRand.z * 0.25);
        size = 0.9;
      }
    } else if (age >= uRise) {
      float tb = age - uRise;
      bool willow = uPattern > 1.5 && uPattern < 2.5;
      float life = (willow ? 3.6 : 2.3) + aRand.y * 0.9;
      if (tb < life) {
        vec3 dir = position;
        if (uPattern > 0.5 && uPattern < 1.5) dir = uBasis * aFlat;
        if (uPattern > 2.5) dir = uBasis * aHeart;
        float speed = uScale * (0.88 + 0.24 * aRand.x) * (uPattern > 0.5 && uPattern < 1.5 ? 1.1 : 1.0);
        float drag = willow ? 2.4 : 1.7;
        vec3 disp = dir * speed * (1.0 - exp(-drag * tb)) / drag;
        disp.y -= (willow ? 5.5 : 3.2) * tb * tb * 0.5;
        p = uCenter + disp;
        float fade = 1.0 - smoothstep(life * 0.55, life, tb);
        float crackle = tb > life * 0.5 ? step(0.45, fract(sin(floor(uTime * 24.0) + aRand.x * 91.0) * 43758.5)) : 1.0;
        float flash = exp(-tb * 7.0) * 3.0;
        vec3 c = mix(uColorA, uColorB, smoothstep(0.1, 0.9, tb / life));
        col = c * (3.2 * fade * crackle + flash) * (1.0 - aRand.z * 0.24);
        size = (willow ? 0.75 : 0.95) * (1.0 - aRand.z * 0.18) * (0.6 + fade * 0.4);
      }
    }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float fog = exp(-(-mv.z) * uFogDensity * 0.5);
    vColor = col * fog;
    gl_PointSize = size <= 0.0 ? 0.0 : clamp(size * uPointScale / -mv.z, 1.0, 22.0);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0 || dot(vColor, vColor) < 1e-6) discard;
    gl_FragColor = vec4(vColor * (exp(-r2 * 4.0) + exp(-r2 * 30.0)), 1.0);
  }
`;

type Shell = {
  points: THREE.Points;
  u: Record<string, THREE.IUniform>;
  burstAt: number;
  flashed: boolean;
  color: THREE.Color;
};

export class Fireworks implements Part {
  object = new THREE.Group();
  private shells: Shell[] = [];
  private next = 0;
  private autoAt = 3;
  // Off by default: the night stays quiet unless the visitor asks for fireworks.
  auto = false;
  onBurst?: (pos: THREE.Vector3, strength: number) => void;
  onLaunch?: () => void;

  constructor() {
    const geo = shellGeometry();
    for (let i = 0; i < POOL; i++) {
      const u: Record<string, THREE.IUniform> = {
        ...globals,
        uOrigin: { value: new THREE.Vector3() },
        uCenter: { value: new THREE.Vector3() },
        uT0: { value: -100 },
        uRise: { value: 1 },
        uPattern: { value: 0 },
        uScale: { value: 30 },
        uColorA: { value: new THREE.Color() },
        uColorB: { value: new THREE.Color() },
        uBasis: { value: new THREE.Matrix3() },
      };
      const points = new THREE.Points(
        geo,
        new THREE.ShaderMaterial({
          uniforms: u,
          vertexShader: VERT,
          fragmentShader: FRAG,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      points.frustumCulled = false;
      points.visible = false;
      points.renderOrder = 11;
      points.layers.enable(REFLECT_LAYER);
      this.object.add(points);
      this.shells.push({ points, u, burstAt: -1, flashed: true, color: new THREE.Color() });
    }
  }

  launch(target: THREE.Vector3, camera: THREE.Camera, pattern?: Pattern) {
    const s = this.shells[this.next];
    this.next = (this.next + 1) % POOL;
    const now = globals.uTime.value;
    // Chrysanthemum (sphere) and willow mostly; the occasional ring.
    const pat: Pattern = pattern ?? (([0, 0, 0, 2, 2, 2, 1] as Pattern[])[Math.floor(Math.random() * 7)]);
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const rise = 1.1 + Math.min(target.y, 160) / 110;
    s.u.uOrigin.value.set(target.x + (Math.random() - 0.5) * 20, 0, target.z + (Math.random() - 0.5) * 20);
    s.u.uCenter.value.copy(target);
    s.u.uT0.value = now;
    s.u.uRise.value = rise;
    s.u.uPattern.value = pat;
    s.u.uScale.value = 26 + Math.random() * 18;
    s.u.uColorA.value.set(pair[0]).convertSRGBToLinear();
    s.u.uColorB.value.set(pair[1]).convertSRGBToLinear();
    const m = new THREE.Matrix4().extractRotation(camera.matrixWorld);
    const basis = s.u.uBasis.value as THREE.Matrix3;
    basis.setFromMatrix4(m);
    s.burstAt = now + rise;
    s.flashed = false;
    s.color.copy(s.u.uColorA.value);
    s.points.visible = true;
    this.onLaunch?.();
  }

  update(ctx: FrameContext) {
    const now = ctx.time;
    for (const s of this.shells) {
      if (!s.flashed && now >= s.burstAt) {
        s.flashed = true;
        const d = s.u.uCenter.value.distanceTo(ctx.camera.position);
        const k = THREE.MathUtils.clamp(260 / d, 0.15, 1.2);
        globals.uFlash.value.add(new THREE.Vector3(s.color.r, s.color.g, s.color.b).multiplyScalar(0.55 * k));
        this.onBurst?.(s.u.uCenter.value, k);
      }
      if (s.points.visible && now > s.burstAt + 5) s.points.visible = false;
    }
    if (this.auto && now > this.autoAt) {
      this.autoAt = now + 4.5 + Math.random() * 5;
      const cam = ctx.camera;
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      fwd.y = 0;
      fwd.normalize();
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const dist = 240 + Math.random() * 220;
      const target = cam.position.clone().addScaledVector(fwd, dist).addScaledVector(side, (Math.random() - 0.5) * dist * 0.9);
      target.y = 70 + Math.random() * 80;
      this.launch(target, cam);
    }
  }
}
