import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import type { Tier } from "./quality.ts";
import type { Part } from "./World.ts";

// Whales drawn in starlight: point clouds sampled over a humpback-like body
// (head at +x). All motion — the swim undulation, the long orbit across the
// sky and the trailing stardust — is computed in the vertex shader.

type Whale = { points: number; trail: number; length: number; orbit: [number, number, number, number, number]; phase: number; speed: number };

const WHALES: Whale[] = [
  // orbit: center x, center y, center z, radius x, radius z
  { points: 5200, trail: 900, length: 70, orbit: [0, 118, -300, 520, 330], phase: 0.6, speed: 0.0105 },
  { points: 2600, trail: 500, length: 34, orbit: [0, 104, -300, 520, 330], phase: 0.52, speed: 0.0105 },
];

// Body half-thickness along the length (s: 0 = snout, 1 = fluke tips).
function girth(s: number) {
  if (s > 0.86) return 0.012;
  return 0.02 + 0.1 * Math.pow(Math.sin(Math.PI * Math.min(s / 0.88, 1) ** 0.8), 0.9) * (s < 0.12 ? 0.8 + s * 1.6 : 1);
}

function sampleWhale(count: number, trail: number, rnd: () => number) {
  const pos: number[] = [];
  const attr: number[] = []; // s, seed, brightness, kind (0 body, 1 trail)
  const push = (x: number, y: number, z: number, s: number, b: number, kind = 0) => {
    pos.push(x, y, z);
    attr.push(s, rnd(), b, kind);
  };
  let n = 0;
  while (n < count) {
    const r = rnd();
    if (r < 0.62) {
      // Body surface (area-weighted by girth).
      const s = rnd() * 0.88;
      if (rnd() > girth(s) / 0.12) continue;
      const a = rnd() * Math.PI * 2;
      const g = girth(s);
      const y = Math.cos(a) * g * 0.85;
      const z = Math.sin(a) * g;
      // Throat pleats: brighter parallel lines along the underside.
      const pleat = Math.cos(a) < -0.3 && s < 0.45 && Math.abs(Math.sin(a * 9)) < 0.18;
      push(0.5 - s, y, z, s, pleat ? 1.4 : 0.8 + rnd() * 0.4);
    } else if (r < 0.78) {
      // Long pectoral fins, swept back and down.
      const side = rnd() < 0.5 ? -1 : 1;
      const u = rnd();
      const w = (1 - u) * 0.035 * (rnd() * 2 - 1);
      const s = 0.26 + u * 0.12;
      push(0.5 - s + w, -0.05 - u * 0.1, side * (0.08 + u * 0.3), s, u > 0.92 ? 1.5 : 0.9);
    } else if (r < 0.92) {
      // Flukes: a wide horizontal tail with a notch; edges drawn brighter.
      const side = rnd() < 0.5 ? -1 : 1;
      const u = rnd();
      const spanZ = u * 0.2;
      const back = 0.86 + 0.08 * u + (rnd() * 0.06) * (1 - u * 0.5);
      const edge = rnd() < 0.35;
      const sx = edge ? 0.86 + 0.09 * u + 0.05 * (1 - Math.abs(u - 0.7)) : back;
      push(0.5 - sx, 0, side * spanZ, sx, edge ? 1.5 : 0.8);
    } else {
      // Outline along the spine and belly for a crisper silhouette.
      const s = rnd() * 0.88;
      const top = rnd() < 0.55;
      push(0.5 - s, (top ? 1 : -1) * girth(s) * 0.85, (rnd() - 0.5) * 0.01, s, 1.3);
    }
    n++;
  }
  // Eye.
  push(0.43, 0.01, 0.07, 0.07, 3.0);
  push(0.43, 0.01, -0.07, 0.07, 3.0);
  // Stardust trail left behind the flukes: kind = 1, s holds the time lag.
  for (let i = 0; i < trail; i++) push((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.3, rnd(), 0.6 + rnd() * 0.6, 1);
  return { pos: new Float32Array(pos), attr: new Float32Array(attr) };
}

export function createWhales(): Part {
  const group = new THREE.Group();
  const rnd = mulberry32(77);
  const all: { points: THREE.Points; geo: THREE.BufferGeometry; body: number }[] = [];

  for (const w of WHALES) {
    const { pos, attr } = sampleWhale(w.points, w.trail, rnd);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aAttr", new THREE.BufferAttribute(attr, 4));
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...globals,
        uLength: { value: w.length },
        uOrbit: { value: new THREE.Vector4(w.orbit[0], w.orbit[1], w.orbit[2], w.orbit[3]) },
        uOrbitZ: { value: w.orbit[4] },
        uPhase: { value: w.phase },
        uSpeed: { value: w.speed },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute vec4 aAttr; // s, seed, brightness, kind
        uniform float uLength;
        uniform vec4 uOrbit;
        uniform float uOrbitZ;
        uniform float uPhase;
        uniform float uSpeed;
        varying vec3 vColor;

        vec3 path(float t) {
          float th = uPhase * 6.28318 + t * uSpeed * 6.28318;
          return vec3(uOrbit.x + cos(th) * uOrbit.w,
                      uOrbit.y + sin(th * 2.0) * 16.0 + sin(th * 3.0 + 1.0) * 6.0,
                      uOrbit.z + sin(th) * uOrbitZ);
        }

        void main() {
          float t = uTime;
          float kind = aAttr.w;
          float s = aAttr.x;
          vec3 local = position;
          float lag = 0.0;
          if (kind > 0.5) {
            // Trail: sample the path in the past, behind the flukes.
            lag = 2.0 + s * 26.0;
            local.x -= 0.5;
            local *= 1.0 + s * 6.0;
          } else {
            // Swim: a vertical wave that grows toward the flukes.
            float wave = sin(s * 5.2 - t * 1.1);
            local.y += wave * 0.055 * s * s;
            local.x += cos(s * 5.2 - t * 1.1) * 0.006 * s;
          }
          vec3 c = path(t - lag);
          vec3 F = normalize(path(t - lag + 0.5) - c);
          vec3 R = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
          vec3 U = cross(R, F);
          vec3 lp = local * uLength;
          vec3 wp = c + F * lp.x + U * lp.y + R * lp.z;
          if (kind > 0.5) wp.y += sin(t * 0.7 + aAttr.y * 40.0) * 0.8 - s * 6.0;

          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          float tw = 0.6 + 0.4 * sin(t * (0.8 + aAttr.y * 2.2) + aAttr.y * 50.0);
          float fade = kind > 0.5 ? pow(1.0 - s, 1.6) * 0.5 : 1.0;
          vec3 tint = mix(vec3(0.72, 0.82, 1.0), vec3(1.0, 0.88, 0.66), step(0.84, aAttr.y));
          float fog = exp(-depth * uFogDensity * 0.5);
          vColor = tint * aAttr.z * tw * fade * fog * mix(0.28, 1.0, uWorld) * 0.9;
          gl_PointSize = clamp((kind > 0.5 ? 0.45 : 0.32) * uLength / 70.0 * uPointScale / depth * (0.8 + aAttr.z * 0.3), 1.0, 6.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          gl_FragColor = vec4(vColor * (exp(-r2 * 4.0) + exp(-r2 * 24.0) * 0.8), 1.0);
        }
      `,
    });
    const points = new THREE.Points(geo, material);
    points.frustumCulled = false;
    points.renderOrder = 4;
    points.layers.enable(REFLECT_LAYER);
    group.add(points);
    all.push({ points, geo, body: pos.length / 3 });
  }

  return {
    object: group,
    setQuality(tier: Tier) {
      // Trail points are last in each buffer; low tiers thin the whole cloud.
      for (const w of all) w.geo.setDrawRange(0, Math.round(w.body * Math.max(0.55, tier.particles)));
    },
  };
}
