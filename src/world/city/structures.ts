import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { BRIDGE, GATE_Z, PLATFORM } from "./layout";

// The arrival platform, the long bridge to the shore and their lanterns,
// built from boxes into one merged mesh. A per-vertex material id selects
// the look: 0 weathered deck planks · 1 vermilion lacquer · 2 dark timber ·
// 3 stone · 4 lantern paper (emissive) · 5 teal light strip (emissive) ·
// 6 black lacquer.

type Kit = { pos: number[]; nrm: number[]; mat: number[] };

function newKit(): Kit {
  return { pos: [], nrm: [], mat: [] };
}

// Oriented box: centre c, half extents h, rotation about Y (yaw) then X (pitch).
const FACES: [number[], number[], number[]][] = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];
const CORNERS = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];
function box(k: Kit, c: THREE.Vector3, h: THREE.Vector3, mat: number, yaw = 0, pitch = 0, roll = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, "YXZ"));
  const p = new THREE.Vector3();
  const nn = new THREE.Vector3();
  for (const [n, t1, t2] of FACES) {
    nn.set(n[0], n[1], n[2]).applyQuaternion(q);
    for (const [a, b] of CORNERS) {
      p.set(
        (n[0] + t1[0] * a + t2[0] * b) * h.x,
        (n[1] + t1[1] * a + t2[1] * b) * h.y,
        (n[2] + t1[2] * a + t2[2] * b) * h.z,
      )
        .applyQuaternion(q)
        .add(c);
      k.pos.push(p.x, p.y, p.z);
      k.nrm.push(nn.x, nn.y, nn.z);
      k.mat.push(mat);
    }
  }
}

function build(k: Kit) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(k.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(k.nrm, 3));
  g.setAttribute("mat", new THREE.Float32BufferAttribute(k.mat, 1));
  g.computeBoundingSphere();
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function bridgeY(z: number) {
  const t = (z - BRIDGE.z0) / (BRIDGE.z1 - BRIDGE.z0);
  if (t <= 0) return PLATFORM.y;
  if (t >= 1) return BRIDGE.y0 + 1.0;
  return BRIDGE.y0 + BRIDGE.rise * Math.sin(Math.PI * t) + t * 1.0;
}

export type LanternSpot = { pos: THREE.Vector3; size: number };

export function buildStructures() {
  const k = newKit();
  const lamps: LanternSpot[] = [];
  const P = PLATFORM;
  // --- platform deck + edge beams + posts
  box(k, V((P.x0 + P.x1) / 2, P.y - 0.3, (P.z0 + P.z1) / 2), V((P.x1 - P.x0) / 2, 0.3, (P.z1 - P.z0) / 2), 0);
  box(k, V((P.x0 + P.x1) / 2, P.y - 0.75, P.z0), V((P.x1 - P.x0) / 2, 0.25, 0.3), 2);
  box(k, V((P.x0 + P.x1) / 2, P.y - 0.75, P.z1), V((P.x1 - P.x0) / 2, 0.25, 0.3), 2);
  for (let x = P.x0 + 2; x <= P.x1 - 2; x += 8) {
    for (let z = P.z0 + 2; z <= P.z1 - 2; z += 9) box(k, V(x, P.y / 2 - 2.5, z), V(0.35, P.y / 2 + 2.5, 0.35), 2);
  }
  // --- platform railing (open toward the bridge and behind the gate)
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, y1 = y) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const pitch = -Math.atan2(y1 - y, len);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const cy = (y + y1) / 2;
    box(k, V(cx, cy + 1.12, cz), V(0.13, 0.1, len / 2 + 0.1), 1, yaw, pitch);
    box(k, V(cx, cy + 0.62, cz), V(0.08, 0.07, len / 2), 1, yaw, pitch);
    box(k, V(cx, cy + 0.08, cz), V(0.12, 0.08, len / 2), 6, yaw, pitch);
    const n = Math.max(1, Math.round(len / 2.2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      const yy = y + (y1 - y) * t;
      box(k, V(x, yy + 0.62, z), V(0.12, 0.62, 0.12), 1, yaw);
    }
  };
  const Y = P.y;
  rail(P.x0, P.z1, P.x0, P.z0, Y);
  rail(P.x1, P.z0, P.x1, P.z1, Y);
  rail(P.x0, P.z0, -BRIDGE.width / 2, P.z0, Y);
  rail(BRIDGE.width / 2, P.z0, P.x1, P.z0, Y);
  // --- stone lanterns (tōrō) on the platform
  const toro = (x: number, z: number, s = 1) => {
    box(k, V(x, Y + 0.25 * s, z), V(0.7 * s, 0.25 * s, 0.7 * s), 3);
    box(k, V(x, Y + 1.2 * s, z), V(0.22 * s, 0.7 * s, 0.22 * s), 3);
    box(k, V(x, Y + 2.05 * s, z), V(0.55 * s, 0.15 * s, 0.55 * s), 3);
    box(k, V(x, Y + 2.55 * s, z), V(0.38 * s, 0.35 * s, 0.38 * s), 4);
    box(k, V(x, Y + 3.05 * s, z), V(0.8 * s, 0.13 * s, 0.8 * s), 3);
    box(k, V(x, Y + 3.3 * s, z), V(0.35 * s, 0.14 * s, 0.35 * s), 3);
    lamps.push({ pos: V(x, Y + 2.55 * s, z), size: 1.6 * s });
  };
  toro(-20, -14, 1.2);
  toro(20, -14, 1.2);
  toro(-20, 6, 1.2);
  toro(20, 6, 1.2);

  // --- bridge: arched deck, piers, railings, lantern posts
  const B = BRIDGE;
  const seg = 4;
  for (let z = B.z0; z > B.z1; z -= seg) {
    const za = z;
    const zb = Math.max(B.z1, z - seg);
    const ya = bridgeY(za);
    const yb = bridgeY(zb);
    const pitch = Math.atan2(yb - ya, za - zb);
    box(k, V(0, (ya + yb) / 2 - 0.25, (za + zb) / 2), V(B.width / 2, 0.25, (za - zb) / 2 + 0.02), 0, 0, pitch);
    box(k, V(-B.width / 2 - 0.1, (ya + yb) / 2 - 0.6, (za + zb) / 2), V(0.2, 0.35, (za - zb) / 2), 2, 0, pitch);
    box(k, V(B.width / 2 + 0.1, (ya + yb) / 2 - 0.6, (za + zb) / 2), V(0.2, 0.35, (za - zb) / 2), 2, 0, pitch);
  }
  for (let z = B.z0 - 16; z > B.z1 + 4; z -= 16) {
    const y = bridgeY(z);
    for (const x of [-B.width / 2 + 0.6, B.width / 2 - 0.6]) box(k, V(x, (y - 4) / 2 - 1, z), V(0.45, (y + 4) / 2, 0.45), 2);
    box(k, V(0, y - 1.1, z), V(B.width / 2 + 0.3, 0.3, 0.5), 2);
  }
  for (const side of [-1, 1]) {
    const x = (side * B.width) / 2;
    for (let z = B.z0; z > B.z1; z -= seg) {
      const zb = Math.max(B.z1, z - seg);
      rail(x, z, x, zb, bridgeY(z), bridgeY(zb));
    }
    // Lantern posts: vermilion post, dark hood, glowing paper box.
    for (let z = B.z0 - 10; z > B.z1 + 4; z -= 20) {
      const y = bridgeY(z);
      box(k, V(x, y + 1.6, z), V(0.2, 1.6, 0.2), 1);
      box(k, V(x, y + 3.45, z), V(0.36, 0.32, 0.36), 4);
      box(k, V(x, y + 3.9, z), V(0.55, 0.1, 0.55), 6);
      lamps.push({ pos: V(x, y + 3.45, z), size: 1.4 });
    }
  }

  // --- teal light strips on the great gate (the torii of torii.ts, scaled):
  // down the front of each pillar (following its lean and taper) and along
  // the edges of the nuki and the shimaki.
  const s = GATE_SCALE;
  const gz = GATE_Z;
  const base = P.y;
  const nukiY = 16.25 * 0.76;
  for (const side of [-1, 1]) {
    // Pillar axis: x(t) = side*6 - side*0.22*t, radius 0.74 -> 0.6 over y -2..16.25.
    const y0 = 0.3;
    const y1 = nukiY - 0.6;
    const at = (y: number) => {
      const t = (y + 2) / 18.25;
      return { x: side * (6 - 0.22 * t), r: 0.74 - 0.14 * t };
    };
    for (const off of [-0.55, 0.55]) {
      const a = at(y0);
      const b = at(y1);
      const xa = (a.x + off * a.r) * s;
      const xb = (b.x + off * b.r) * s;
      const za = gz - Math.sqrt(Math.max(0, 1 - off * off)) * a.r * s - 0.02;
      const zb = gz - Math.sqrt(Math.max(0, 1 - off * off)) * b.r * s - 0.02;
      const len = Math.hypot(xb - xa, (y1 - y0) * s);
      const roll = -Math.atan2(xb - xa, (y1 - y0) * s);
      const pitch = Math.atan2(za - zb, (y1 - y0) * s);
      box(k, V((xa + xb) / 2, base + ((y0 + y1) / 2) * s, (za + zb) / 2), V(0.07, len / 2, 0.07), 5, 0, pitch, roll);
    }
  }
  const zn = gz - 0.37 * s - 0.03;
  box(k, V(0, base + (nukiY - 0.575) * s + 0.06, zn), V(10.6 * s, 0.08, 0.08), 5);
  box(k, V(0, base + (nukiY + 0.575) * s - 0.06, zn), V(10.6 * s, 0.08, 0.08), 5);
  box(k, V(0, base + 16.25 * s + 0.1, gz - 0.53 * s - 0.03), V(10.9 * s, 0.09, 0.09), 5);

  return { geometry: build(k), lamps };
}

export const GATE_SCALE = 2.2;

const vert = /* glsl */ `
attribute float mat;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vMat = mat;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${common}
uniform vec3 uCamPos;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uFogDist;
uniform float uTime;
uniform float uStrip;
uniform vec4 uLamps[24]; // nearest lanterns: xyz, intensity
varying vec3 vWorld;
varying vec3 vNormal;
varying float vMat;
void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCamPos - vWorld);
  float m = vMat;
  vec3 alb;
  float rough = 0.6;
  if (m < 0.5) {
    // Deck planks along z, weathered.
    float plank = fract(vWorld.x / 0.9);
    float seam = smoothstep(0.02, 0.0, plank) + smoothstep(0.98, 1.0, plank);
    float grain = fbm2(vec2(vWorld.x * 3.0, vWorld.z * 0.25), 3);
    alb = vec3(0.16, 0.12, 0.1) * (0.7 + grain * 0.5) * (1.0 - seam * 0.6);
    rough = 0.45;
  } else if (m < 1.5) {
    alb = vec3(0.4, 0.05, 0.035) * (0.85 + 0.3 * fbm2(vWorld.xy * 2.0 + vWorld.z, 3));
    rough = 0.4;
  } else if (m < 2.5) {
    alb = vec3(0.06, 0.045, 0.04);
  } else if (m < 3.5) {
    alb = vec3(0.16, 0.16, 0.15) * (0.7 + 0.5 * fbm2(vWorld.xz * 1.5 + vWorld.y, 3));
  } else if (m < 4.5) {
    float fl = 0.9 + 0.1 * sin(uTime * 7.0 + vWorld.z) * sin(uTime * 3.1 + vWorld.x);
    gl_FragColor = vec4(vec3(1.0, 0.66, 0.32) * 3.2 * fl, 1.0);
    return;
  } else if (m < 5.5) {
    // Teal light strip, with a slow pulse travelling up.
    float pulse = 0.75 + 0.25 * sin(vWorld.y * 0.35 - uTime * 1.6);
    gl_FragColor = vec4(vec3(0.25, 1.0, 0.86) * 4.0 * pulse * uStrip, 1.0);
    return;
  } else {
    alb = vec3(0.02, 0.018, 0.02);
    rough = 0.3;
  }
  vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
  vec3 col = alb * (amb * 1.3 + uMoonColor * saturate(dot(N, uMoonDir)) * 1.8);
  // Moon sheen on lacquer and wet planks.
  vec3 H = normalize(V + uMoonDir);
  col += uMoonColor * pow(saturate(dot(N, H)), mix(120.0, 20.0, rough)) * (1.0 - rough) * 0.8;
  // Nearby lanterns: small warm point lights.
  for (int i = 0; i < 24; i++) {
    vec4 L = uLamps[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - vWorld;
    float r2 = dot(d, d);
    float ndl = saturate(dot(N, d * inversesqrt(r2)) * 0.8 + 0.2);
    col += alb * vec3(1.0, 0.6, 0.28) * L.w * ndl * 9.0 / (1.0 + r2);
  }
  float dist = length(uCamPos - vWorld);
  col = mix(col, uFogColor, (1.0 - exp(-dist / uFogDist)) * 0.8);
  gl_FragColor = vec4(col, 1.0);
}`;

export function structuresMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uCamPos: G.uCamPos,
      uMoonDir: G.uMoonDir,
      uMoonColor: G.uMoonColor,
      uAmbTop: G.uAmbTop,
      uAmbBottom: G.uAmbBottom,
      uFogColor: G.uFogColor,
      uFogDist: { value: 1400 },
      uTime: G.uTime,
      uStrip: { value: 1 },
      uLamps: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) },
    },
    side: THREE.DoubleSide,
  });
}
