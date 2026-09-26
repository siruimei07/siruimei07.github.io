import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import type { Tier } from "./quality.ts";
import type { Part } from "./World.ts";

// A koi body: head at +x, tail at -x. `aAlong` (0 head → 1 tail) drives the
// swim bend; `aFin` marks translucent fins.
function koiGeometry() {
  const pos: number[] = [];
  const nor: number[] = [];
  const along: number[] = [];
  const fin: number[] = [];
  const idx: number[] = [];
  const L = 16;
  const R = 10;
  const radius = (s: number) => 0.125 * Math.pow(Math.sin(Math.PI * Math.min(s * 1.08, 0.985)), 0.62) + 0.012;
  for (let i = 0; i <= L; i++) {
    const s = (i / L) * 0.86;
    const x = 0.5 - s;
    const r = radius(s);
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * Math.PI * 2;
      const cy = Math.cos(a);
      const cz = Math.sin(a);
      pos.push(x, cy * r * 1.05, cz * r * 0.82);
      nor.push(0, cy, cz);
      along.push(s);
      fin.push(0);
    }
  }
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j;
      const b = a + R + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const tri = (verts: number[][], s: number[]) => {
    const start = pos.length / 3;
    verts.forEach((v, k) => {
      pos.push(v[0], v[1], v[2]);
      nor.push(0, 0, 1);
      along.push(s[k]);
      fin.push(1);
    });
    idx.push(start, start + 1, start + 2);
  };
  // Caudal fin (two lobes), dorsal fin, pectoral fins.
  tri([[-0.34, 0, 0], [-0.62, 0.2, 0], [-0.52, 0, 0]], [0.84, 1.12, 1.02]);
  tri([[-0.34, 0, 0], [-0.52, 0, 0], [-0.62, -0.2, 0]], [0.84, 1.02, 1.12]);
  tri([[0.12, 0.12, 0], [-0.2, 0.2, 0], [-0.22, 0.1, 0]], [0.38, 0.7, 0.72]);
  for (const side of [-1, 1]) {
    tri([[0.26, -0.06, side * 0.08], [0.12, -0.14, side * 0.24], [0.08, -0.07, side * 0.1]], [0.24, 0.38, 0.42]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("aAlong", new THREE.Float32BufferAttribute(along, 1));
  g.setAttribute("aFin", new THREE.Float32BufferAttribute(fin, 1));
  g.setIndex(idx);
  return g;
}

type School = { center: [number, number, number]; radius: number; count: number; height: number; scale: number };

const SCHOOLS: School[] = [
  { center: [0, 6, -22], radius: 13, count: 16, height: 3, scale: 1.6 }, // just beyond the gate
  { center: [-46, 8, -74], radius: 12, count: 18, height: 4, scale: 1.5 }, // around the pine island
  { center: [60, 26, -100], radius: 24, count: 12, height: 4, scale: 2.0 }, // above the great lanterns
  { center: [-30, 16, -200], radius: 34, count: 16, height: 8, scale: 2.0 },
  { center: [0, 22, -320], radius: 26, count: 16, height: 8, scale: 1.8 }, // before the moon
];

export function createKoi(): Part {
  const rnd = mulberry32(11);
  const base = koiGeometry();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setIndex(base.index);
  for (const k of ["position", "normal", "aAlong", "aFin"]) geo.setAttribute(k, base.attributes[k]);

  const orbits: number[] = [];
  const motion: number[] = [];
  const style: number[] = [];
  for (const s of SCHOOLS) {
    const dir = rnd() < 0.5 ? -1 : 1;
    for (let i = 0; i < s.count; i++) {
      orbits.push(s.center[0] + (rnd() - 0.5) * 4, s.center[1] + (rnd() - 0.5) * s.height, s.center[2] + (rnd() - 0.5) * 4, s.radius * (0.65 + rnd() * 0.7));
      motion.push(dir * (0.07 + rnd() * 0.05) * (14 / s.radius), rnd() * Math.PI * 2, 1 + rnd() * 2, rnd());
      style.push(s.scale * (0.7 + rnd() * 0.6), Math.floor(rnd() * 4), rnd(), 0);
    }
  }
  const total = orbits.length / 4;
  geo.setAttribute("aOrbit", new THREE.InstancedBufferAttribute(new Float32Array(orbits), 4));
  geo.setAttribute("aMotion", new THREE.InstancedBufferAttribute(new Float32Array(motion), 4));
  geo.setAttribute("aStyle", new THREE.InstancedBufferAttribute(new Float32Array(style), 4));
  geo.instanceCount = total;

  const material = new THREE.ShaderMaterial({
    uniforms: globals,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute float aAlong;
      attribute float aFin;
      attribute vec4 aOrbit;  // center xyz, radius
      attribute vec4 aMotion; // angular speed, phase, bob, wobble seed
      attribute vec4 aStyle;  // scale, palette, pattern seed, giant
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;
      varying float vFin;
      varying float vAlong;
      varying vec4 vStyle;

      vec3 orbitPos(float th) {
        float r = aOrbit.w * (1.0 + 0.12 * sin(th * 3.0 + aMotion.w * 6.28));
        return aOrbit.xyz + vec3(cos(th) * r, sin(th * 2.0 + aMotion.y) * aMotion.z, sin(th) * r * 0.7);
      }

      void main() {
        float th = aMotion.y + uTime * aMotion.x;
        vec3 c = orbitPos(th);
        vec3 ahead = orbitPos(th + sign(aMotion.x) * 0.02);
        vec3 F = normalize(ahead - c);
        vec3 R = normalize(cross(F, vec3(0.0, 1.0, 0.0)));
        vec3 U = cross(R, F);
        float giant = aStyle.w;
        c += rayPush(c, 6.0, 4.0) * (1.0 - giant);
        float g;
        c += shockPush(c, g) * (1.0 - giant);

        // Swim: a travelling wave whose amplitude grows toward the tail.
        vec3 p = position;
        float speed = abs(aMotion.x) * aOrbit.w;
        float w = sin(aAlong * 5.5 - uTime * (4.0 + speed * 0.8) + aMotion.w * 20.0);
        p.z += w * 0.09 * (0.15 + aAlong * aAlong * 1.3);
        vec3 lp = p * aStyle.x;
        vec3 wp = c + F * lp.x + U * lp.y + R * lp.z;
        vWorld = wp;
        vNormal = normalize(F * normal.x + U * normal.y + R * normal.z);
        vLocal = position;
        vFin = aFin;
        vAlong = aAlong;
        vStyle = aStyle;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vLocal;
      varying float vFin;
      varying float vAlong;
      varying vec4 vStyle;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - abs(dot(normalize(vNormal), V)), 2.2);
        float pal = vStyle.y;
        // Koi patterns: kohaku (red/white), gold, sky-blue, sakura.
        float spots = smoothstep(0.46, 0.54, texture2D(uNoise, vLocal.xy * vec2(3.2, 5.0) + vec2(vLocal.z * 3.0, 0.0) + vStyle.z * 7.0).r);
        // Moon-silver bodies with pale gold or muted vermilion markings.
        vec3 a = vec3(0.78, 0.84, 0.95);
        vec3 b = pal < 1.5 ? vec3(0.95, 0.42, 0.26) : pal < 2.5 ? vec3(1.0, 0.8, 0.5) : vec3(0.75, 0.85, 1.0);
        vec3 body = mix(a * 0.5, b * 0.8, spots);
        // Faint spine and ribs seen through the translucent body.
        float spine = exp(-pow(vLocal.y / 0.018, 2.0)) * step(vFin, 0.5);
        float ribs = pow(0.5 + 0.5 * cos(vAlong * 70.0), 6.0) * exp(-pow(vLocal.y / 0.07, 2.0)) * step(0.15, vAlong) * step(vAlong, 0.7);
        vec3 rimCol = mix(vec3(0.8, 0.86, 1.0), b, 0.3);
        vec3 col = body * (0.04 + fres * 0.4) + rimCol * pow(fres, 2.2) * 0.9;
        col += vec3(0.9, 0.92, 1.0) * (spine * 0.6 + ribs * 0.2) * (1.0 - vFin);
        // Fins: veil-like and faint.
        col = mix(col, b * (0.15 + vAlong * 0.35), vFin * 0.7);
        col *= mix(0.3, 1.0, uWorld);
        float fog = 1.0 - exp(-length(vWorld - cameraPosition) * uFogDensity * 0.9);
        gl_FragColor = vec4(col * (1.0 - fog), 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.layers.enable(REFLECT_LAYER);

  return {
    object: mesh,
    setQuality(tier: Tier) {
      geo.instanceCount = tier.particles < 0.6 ? Math.round(total * 0.6) : total;
    },
  };
}
