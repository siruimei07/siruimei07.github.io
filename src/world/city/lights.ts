import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { flyCurve, mulberry32, SHORE_Z, terrainHeight, type Building } from "./layout";

// Thousands of small lights that make the hillside read as "万家灯火":
// street lamps between the houses, and strings of red-orange chōchin hung
// across the streets along the flight path. Camera-facing glow sprites with
// a minimum on-screen size (energy-conserving, so far lights dim instead of
// growing).

const vert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iPos;  // xyz, world radius
attribute vec4 iCol;  // rgb, flicker phase
uniform float uTime;
uniform vec2 uRes;
uniform float uPx;
uniform vec3 uCamPos;
uniform float uFogDist;
varying vec2 vQ;
varying vec3 vCol;
varying float vI;
void main() {
  vec3 w = iPos.xyz;
  // Lanterns on strings sway a little.
  w.x += sin(uTime * 1.3 + iCol.w * 40.0) * 0.06 * step(0.5, fract(iCol.w * 3.0));
  vec4 c = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (c.w < 0.3) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float px = iPos.w * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
  float draw = max(px, uPx);
  float energy = min(1.0, (px * px) / (draw * draw) * 1.0 + 0.08);
  c.xy += q * draw * 2.4 / uRes * c.w;
  gl_Position = c;
  float fl = 0.85 + 0.15 * sin(uTime * (3.0 + iCol.w * 4.0) + iCol.w * 60.0);
  float dist = length(w - uCamPos);
  float fog = exp(-dist / uFogDist);
  vCol = iCol.rgb;
  vI = energy * fl * (0.35 + 0.65 * fog);
}`;

const frag = /* glsl */ `
uniform float uGain;
varying vec2 vQ;
varying vec3 vCol;
varying float vI;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 7.0);
  float halo = exp(-r2 * 2.2) * 0.25;
  gl_FragColor = vec4(vCol * (core + halo) * vI * uGain, 1.0);
}`;

export class CityLights {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(list: Building[], density: number) {
    const rng = mulberry32(99);
    const pos: number[] = [];
    const col: number[] = [];
    const warm = (k: number) => {
      const t = rng();
      if (k === 0) return [1.0, 0.62 + t * 0.2, 0.3 + t * 0.12]; // street lamp
      return [1.0, 0.36 + t * 0.12, 0.2 + t * 0.06]; // chōchin red-orange
    };
    // Street lamps: around buildings, at doorways and corners.
    for (const b of list) {
      const n = b.kind === 2 ? 1 : 1 + Math.floor(rng() * 2.5 * density);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const r = Math.max(b.w, b.d) * (0.6 + rng() * 0.4);
        const x = b.x + Math.cos(a) * r;
        const z = b.z + Math.sin(a) * r;
        pos.push(x, terrainHeight(x, z) + 1.5 + rng() * 2.5, z, 0.35 + rng() * 0.25);
        col.push(...warm(0), rng());
      }
    }
    // Chōchin strings across the streets along the flight path.
    const N = Math.round(90 * Math.max(0.5, density));
    for (let i = 0; i < N; i++) {
      const t = i / N;
      const p = flyCurve.getPointAt(t);
      if (p.z > SHORE_Z - 12) continue;
      const tan = flyCurve.getTangentAt(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      const ground = terrainHeight(p.x, p.z);
      const span = 13 + rng() * 5;
      const count = 9 + Math.floor(rng() * 5);
      const h = ground + 7 + rng() * 2;
      for (let k = 0; k <= count; k++) {
        const u = k / count - 0.5;
        const sag = (1 - 4 * u * u) * 1.6;
        const q = p.clone().addScaledVector(side, u * span);
        pos.push(q.x, h - sag, q.z, 0.3);
        col.push(...warm(1), 0.66 + rng() * 0.33);
      }
    }
    // A thin necklace of lights along the shore promenade.
    for (let x = -520; x <= 520; x += 4.5) {
      const z = SHORE_Z - 14 + Math.sin(x * 0.02) * 3;
      pos.push(x, terrainHeight(x, z) + 2.2, z, 0.35);
      col.push(...warm(0), rng());
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 4));
    geo.setAttribute("iCol", new THREE.InstancedBufferAttribute(new Float32Array(col), 4));
    geo.instanceCount = pos.length / 4;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: G.uTime,
        uRes: G.uRes,
        uPx: { value: 1.6 },
        uCamPos: G.uCamPos,
        uFogDist: { value: 1600 },
        uGain: { value: 2.6 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }
}
