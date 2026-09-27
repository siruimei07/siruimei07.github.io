import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared, toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { landY, mesaMask, RAIL } from "./layout";

// Cherry trees in full bloom on the slope under the stage — a band of
// blossom lit from below by lanterns, the undersides glowing amber, the tops
// pale in the moonlight — more groves among the roofs of the town, and petals
// drifting across the deck.

/** Blossom clusters as upright, camera-facing cards with a scalloped outline. */
export function buildSakura(density: number): THREE.Object3D {
  const rand = rng(3939);
  type C = { x: number; y: number; z: number; w: number; h: number; glow: number };
  const list: C[] = [];
  // the band right under the balustrade (their crowns reach the deck)
  for (let i = 0; i < Math.round(190 * (0.6 + 0.4 * density)); i++) {
    const x = -52 + rand() * 104;
    const z = RAIL.z - 2.5 - rand() * 14;
    const w = 3.2 + rand() * 3.6;
    const top = 1.6 + rand() * 2.2 - Math.max(0, Math.abs(x) - 20) * 0.03;
    list.push({ x, y: top - w * 0.36, z, w, h: w * 0.72, glow: 1 });
  }
  // lower on the slope (seen between the rails)
  for (let i = 0; i < Math.round(130 * (0.6 + 0.4 * density)); i++) {
    const x = -60 + rand() * 120;
    const z = RAIL.z - 14 - rand() * 30;
    const w = 5 + rand() * 5;
    const top = -0.5 - rand() * 4 - (RAIL.z - 14 - z) * 0.12;
    list.push({ x, y: top - w * 0.36, z, w, h: w * 0.7, glow: 1.1 });
  }
  // beside the stage, both sides
  for (let i = 0; i < Math.round(90 * (0.6 + 0.4 * density)); i++) {
    const s = rand() < 0.5 ? -1 : 1;
    const x = s * (RAIL.side + 2.5 + rand() * 26);
    const z = RAIL.z + 2 - rand() * 12 + (rand() < 0.5 ? 10 : 0);
    const w = 3.5 + rand() * 4.5;
    const top = 1.2 + rand() * 3.0 - (Math.abs(x) - RAIL.side) * 0.04;
    list.push({ x, y: top - w * 0.36, z, w, h: w * 0.72, glow: 0.9 });
  }
  // groves in the town
  for (let i = 0; i < Math.round(220 * (0.6 + 0.4 * density)); i++) {
    const az = THREE.MathUtils.degToRad(-75 + rand() * 190);
    const d = 170 + Math.pow(rand(), 1.6) * 2200;
    const x = Math.sin(az) * d;
    const z = -Math.cos(az) * d;
    if (mesaMask(x, z, 80) > 0.001) continue;
    const w = 14 + rand() * 18 + d * 0.006;
    list.push({ x, y: landY(x, z) + w * 0.18, z, w, h: w * 0.62, glow: 1.3 });
  }

  const geo = new THREE.PlaneGeometry(1, 1);
  const mat = toonMaterial({
    color: 0xffeef4,
    shade: 0xe8909c,
    ink: 0,
    rim: 0,
    step: 0.12,
    soft: 0.03,
    lights: 0,
    fog: 0.85,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
    vertexHead: /* glsl */ `
      attribute float aGlow;
      varying vec2 vP;
      varying float vSeedS;
      varying float vGlow;`,
    vertex: /* glsl */ `
      vec3 center = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float sx = length(m[0].xyz);
      float sy = length(m[1].xyz);
      vec3 toC = center - cameraPosition;
      vec3 camR = normalize(vec3(-toC.z, 0.0, toC.x));
      // breathe in the wind
      float br = 1.0 + 0.025 * sin(uTime * 0.9 + center.x * 0.3);
      wp = vec4(center + camR * position.x * sx * br + vec3(0.0, 1.0, 0.0) * position.y * sy, 1.0);
      wp.x += sin(uTime * 0.7 + center.z * 0.2) * 0.04 * sx * (position.y + 0.5);
      vP = position.xy * 2.0;
      vSeedS = hash13(center * 0.371);
      vGlow = aGlow;
      nrm = normalize(-toC);`,
    fragmentHead: /* glsl */ `
      varying vec2 vP;
      varying float vSeedS;
      varying float vGlow;`,
    fragment: /* glsl */ `
      vec2 p = vP;
      float s = vSeedS * 97.0;
      // a crown made of blossom clumps: union of lobes, scalloped by small flower clusters
      float d = 1e3;
      for (int k = 0; k < 7; k++) {
        float fk = float(k);
        vec2 c = (hash21(s + fk * 7.31) - 0.5) * vec2(1.2, 0.6) + vec2(0.0, fk < 3.0 ? 0.14 : -0.1);
        float r = 0.22 + 0.2 * hash11(s + fk * 3.17);
        d = min(d, length((p - c) * vec2(1.0, 1.2)) - r);
      }
      d += (vnoise(p * 6.0 + s) - 0.5) * 0.16;
      // scalloped rim: every flower cluster bulges it a little (irregular, two scales)
      d -= (vnoise(p * 12.0 + s * 3.3) - 0.5) * 0.09 + (vnoise(p * 26.0 - s * 1.7) - 0.5) * 0.05;
      // blossom clusters: jittered cells at two scales, some missing
      vec2 c1 = p * 8.0 + s;
      vec2 i1 = floor(c1);
      vec2 f1 = fract(c1) - 0.5 - (hash22(i1) - 0.5) * 0.7;
      float b1 = smoothstep(0.45, 0.12, length(f1)) * step(0.28, hash12(i1 + 5.0));
      vec2 c2 = p * 15.0 - s * 1.3;
      vec2 i2 = floor(c2);
      vec2 f2 = fract(c2) - 0.5 - (hash22(i2 + 9.0) - 0.5) * 0.7;
      float b2 = smoothstep(0.42, 0.1, length(f2)) * step(0.4, hash12(i2 + 2.0));
      float bump = max(b1, b2 * 0.75);
      // soft, spray-like rim: a noisy ramp that alpha-to-coverage dithers
      float aa = fwidth(d) * 0.75 + 1e-4;
      float spray = (vnoise(p * 55.0 + s * 7.0) - 0.5) * 0.06;
      alpha = smoothstep(aa + 0.03, -aa - 0.02, d + spray);
      if (alpha < 0.03) discard;
      // round the whole crown: the top turns to the moon, the belly to the lanterns
      vec3 fwd = normalize(cameraPosition - vWorldPos);
      vec3 rt = normalize(vec3(-fwd.z, 0.0, fwd.x));
      float zz = sqrt(saturate(1.0 - dot(p * 0.75, p * 0.75)));
      n = normalize(rt * p.x * 0.7 + vec3(0.0, 1.0, 0.0) * (p.y + 0.25) + fwd * zz);
      // blossom speckle: bright clusters over deeper pink shadow
      float cl = bump * (0.6 + 0.4 * hash12(i1 + 3.0));
      float deep = smoothstep(0.55, 0.2, vnoise(p * 4.0 - s)) * smoothstep(-0.04, -0.2, d);
      base *= 0.8 + 0.3 * cl - deep * 0.2;
      shade *= 0.78 + 0.35 * cl - deep * 0.25;
      float under = smoothstep(0.25, -1.0, p.y);
      float edge = smoothstep(-0.14, 0.0, d);
      emis += (vec3(1.0, 0.4, 0.18) * under * (1.6 + 0.9 * cl) + vec3(1.0, 0.64, 0.76) * (0.42 + 0.4 * cl)) * vGlow;
      emis += vec3(1.0, 0.92, 0.96) * edge * step(0.05, p.y) * 0.6 * vGlow;
      // single blossoms catching the light
      float sp = step(0.86, hash12(floor(p * 40.0 + s))) * step(-0.05, -d);
      emis += vec3(1.0, 0.95, 0.97) * sp * 0.5 * vGlow;`,
  });
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const glow = new Float32Array(list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  list.forEach((c, i) => {
    m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.w, c.h, 1));
    im.setMatrixAt(i, m);
    glow[i] = c.glow;
    col.setHSL(0.95 + rand() * 0.05, 0.9, 0.9 + rand() * 0.1);
    im.setColorAt(i, col);
  });
  im.geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glow, 1));
  im.frustumCulled = false;
  im.renderOrder = 8;
  return im;
}

const petalVert = /* glsl */ `
${common}
attribute vec4 aP;
attribute vec4 aQ;
uniform float uTime;
uniform vec3 uMin;
uniform vec3 uSize;
uniform vec3 uDrift;
varying vec2 vQ;
varying float vViewZ;
varying float vLight;
varying float vTint;
varying float vFade;
void main() {
  float t = uTime;
  vec3 p = aP.xyz * uSize;
  p += uDrift * t * (0.7 + 0.6 * aQ.x);
  p.y -= t * (0.28 + 0.3 * aQ.y);
  p.x += sin(t * 1.1 + aP.w * 6.28) * 0.45;
  p.z += cos(t * 0.8 + aP.w * 9.0) * 0.3;
  p = mod(p, uSize) + uMin;
  // tumbling
  float a1 = t * (1.2 + aQ.y * 2.2) + aP.w * 20.0;
  float a2 = t * (0.8 + aQ.x * 1.4) + aQ.z * 20.0;
  vec3 ax = normalize(vec3(cos(a1), sin(a1) * 0.7, sin(a1)));
  vec3 ay = normalize(cross(normalize(vec3(sin(a2), cos(a2), 0.35)), ax));
  float size = 0.036 + 0.026 * aQ.x;
  vec3 wpos = p + (ax * position.x * 1.25 + ay * position.y) * size;
  vec4 vp = viewMatrix * vec4(wpos, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  vec3 nrm = normalize(cross(ax, ay));
  vec3 V = normalize(cameraPosition - wpos);
  vLight = 0.7 + 0.3 * abs(dot(nrm, V));
  // fade them out (alpha) very near the lens and in the far distance
  vFade = smoothstep(1.2, 2.8, vViewZ) * smoothstep(40.0, 22.0, vViewZ);
  vTint = aQ.w;
}`;

const petalFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform vec3 uCol;
uniform vec3 uCol2;
varying vec2 vQ;
varying float vViewZ;
varying float vLight;
varying float vTint;
varying float vFade;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  // a petal: an oval with a notch at its tip
  vec2 q = vQ;
  float d = length(vec2(q.x, q.y * 1.35 + 0.1 * q.x * q.x));
  float notch = smoothstep(0.18, 0.05, length(q - vec2(1.0, 0.0)));
  float a = smoothstep(1.0, 0.85, d) * (1.0 - notch);
  if (a < 0.02) discard;
  vec3 c = mix(uCol, uCol2, vTint) * (0.9 + 0.3 * smoothstep(0.9, 0.0, d));
  gl_FragColor = vec4(c * vLight, a * vis * vFade);
}`;

export class Petals {
  readonly mesh: THREE.Mesh;

  constructor(density: number) {
    const n = Math.round(1100 * density);
    const rand = rng(88);
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    const a = new Float32Array(n * 4);
    const b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      a.set([rand(), rand(), rand(), rand()], i * 4);
      b.set([rand(), rand(), rand(), rand()], i * 4);
    }
    g.setAttribute("aP", new THREE.InstancedBufferAttribute(a, 4));
    g.setAttribute("aQ", new THREE.InstancedBufferAttribute(b, 4));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: petalVert,
      fragmentShader: petalFrag,
      uniforms: {
        ...fxShared,
        uTime: env.uTime,
        uMin: { value: new THREE.Vector3(-17, -0.5, -17) },
        uSize: { value: new THREE.Vector3(34, 10, 30) },
        uDrift: { value: new THREE.Vector3(0.55, 0, 0.35) },
        uCol: { value: new THREE.Color(1.0, 0.62, 0.74) },
        uCol2: { value: new THREE.Color(1.0, 0.88, 0.92) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }
}
