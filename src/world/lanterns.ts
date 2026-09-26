import * as THREE from "three";
import { common } from "../engine/glsl";
import { G } from "./atmos";
import { rippleGLSL } from "./water";

// Tōrō-nagashi: hexagonal paper lanterns on dark wooden boards, drifting and
// bobbing on the water (instanced meshes near the viewer), plus thousands of
// tiny lantern sprites — each with its own reflection — that pile up into the
// glowing band along the horizon seen in the clip.

function lanternGeometry() {
  const pos: number[] = [];
  const kind: number[] = [];
  const fuv: number[] = [];
  const idx: number[] = [];
  const add = (x: number, y: number, z: number, k: number, u: number, v: number) => {
    pos.push(x, y, z);
    kind.push(k);
    fuv.push(u, v);
    return pos.length / 3 - 1;
  };
  const quad = (a: number, b: number, c: number, d: number) => idx.push(a, b, c, a, c, d);
  const R = 0.17;
  const y0 = 0.035;
  const y1 = 0.5;
  // Six paper panels (kind 0), each with its own UV for the frame lines.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R;
    const x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
    const v0 = add(x0, y0, z0, 0, 0, 0);
    const v1 = add(x1, y0, z1, 0, 1, 0);
    const v2 = add(x1 * 0.96, y1, z1 * 0.96, 0, 1, 1);
    const v3 = add(x0 * 0.96, y1, z0 * 0.96, 0, 0, 1);
    quad(v0, v3, v2, v1);
  }
  // Top rim (dark wood, kind 1) — a thin hexagonal ring.
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
    const ro = R * 1.02, ri = R * 0.8;
    const o0 = add(Math.cos(a0) * ro, y1, Math.sin(a0) * ro, 1, 0, 0);
    const o1 = add(Math.cos(a1) * ro, y1, Math.sin(a1) * ro, 1, 0, 0);
    const i1 = add(Math.cos(a1) * ri, y1, Math.sin(a1) * ri, 1, 0, 0);
    const i0 = add(Math.cos(a0) * ri, y1, Math.sin(a0) * ri, 1, 0, 0);
    quad(o0, i0, i1, o1);
  }
  // Inner glow disc seen through the open top (kind 2).
  {
    const c = add(0, y1 - 0.08, 0, 2, 0.5, 0.5);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const a1 = ((i + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      const v0 = add(Math.cos(a0) * R * 0.8, y1 - 0.08, Math.sin(a0) * R * 0.8, 2, 0, 0);
      const v1 = add(Math.cos(a1) * R * 0.8, y1 - 0.08, Math.sin(a1) * R * 0.8, 2, 0, 0);
      idx.push(c, v1, v0);
    }
  }
  // Base board (kind 1): a flat box.
  const bx = 0.28, by0 = 0.0, by1 = 0.035;
  const b = [
    add(-bx, by1, -bx, 1, 0, 0), add(bx, by1, -bx, 1, 0, 0), add(bx, by1, bx, 1, 0, 0), add(-bx, by1, bx, 1, 0, 0),
    add(-bx, by0, -bx, 1, 0, 0), add(bx, by0, -bx, 1, 0, 0), add(bx, by0, bx, 1, 0, 0), add(-bx, by0, bx, 1, 0, 0),
  ];
  quad(b[0], b[3], b[2], b[1]);
  const sides = [
    [3, 7, 6, 2], [2, 6, 5, 1], [1, 5, 4, 0], [0, 4, 7, 3],
  ];
  for (const s of sides) {
    // Duplicate verts per side so normals stay flat.
    const v = s.map((k) => add(pos[b[k] * 3], pos[b[k] * 3 + 1], pos[b[k] * 3 + 2], 1, 0, 0));
    quad(v[0], v[1], v[2], v[3]);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("kind", new THREE.Float32BufferAttribute(kind, 1));
  geo.setAttribute("fuv", new THREE.Float32BufferAttribute(fuv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const nearVert = /* glsl */ `
${rippleGLSL}
attribute float kind;
attribute vec2 fuv;
attribute vec4 iPlace; // x, z, yaw, scale
attribute vec2 iPhase; // flicker, bob
uniform float uTime;
uniform vec2 uDrift;
uniform vec4 uField; // centre x, z, half size x, z
uniform float uMirror; // 1 in the reflection pass
varying float vKind;
varying vec2 vFuv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vFlicker;
varying float vLocalY;
void main() {
  vec2 p = iPlace.xy + uDrift * (0.6 + 0.4 * iPhase.y);
  // Wrap inside the field so the flotilla never runs out.
  p = uField.xy + mod(p - uField.xy + uField.zw, uField.zw * 2.0) - uField.zw;
  float s = iPlace.w;
  float bob = sin(uTime * (0.9 + iPhase.y * 0.5) + iPhase.y * 20.0) * 0.025;
  vec3 rp = ripples(p);
  float tilt = 0.06 * sin(uTime * 0.7 + iPhase.x * 9.0);
  float c = cos(iPlace.z), sn = sin(iPlace.z);
  vec3 lp = position * s;
  lp.xz = mat2(c, -sn, sn, c) * lp.xz;
  lp.y += lp.x * (tilt + rp.y * 0.3) + lp.z * rp.z * 0.3;
  vec3 w = vec3(p.x + lp.x, lp.y + bob + rp.x * 0.35, p.y + lp.z);
  vWorld = w;
  vec3 n = normal;
  n.xz = mat2(c, -sn, sn, c) * n.xz;
  vNormal = n;
  vKind = kind;
  vFuv = fuv;
  vLocalY = position.y;
  vFlicker = 0.86 + 0.14 * sin(uTime * 7.3 + iPhase.x * 40.0) * sin(uTime * 3.1 + iPhase.x * 17.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const nearFrag = /* glsl */ `
${common}
uniform vec3 uCamPos;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uGlow;
uniform float uFogDist;
varying float vKind;
varying vec2 vFuv;
varying vec3 vNormal;
varying vec3 vWorld;
varying float vFlicker;
varying float vLocalY;
void main() {
  vec3 N = normalize(vNormal);
  vec3 warm = vec3(1.0, 0.68, 0.34);
  vec3 col;
  if (vKind < 0.5) {
    // Paper panel: brightest near the flame, framed by thin wooden strips.
    vec2 uv = vFuv;
    float frame = max(smoothstep(0.94, 0.98, abs(uv.x * 2.0 - 1.0)), smoothstep(0.93, 0.975, abs(uv.y * 2.0 - 1.0)));
    float hot = exp(-pow((uv.y - 0.4) * 1.8, 2.0)) * (0.8 + 0.2 * (1.0 - abs(uv.x * 2.0 - 1.0)));
    float paper = 0.88 + 0.12 * vnoise(uv * vec2(8.0, 30.0));
    vec3 paperCol = mix(warm, vec3(1.0, 0.94, 0.84), 0.55);
    col = paperCol * (1.1 + 2.2 * hot) * paper * uGlow * vFlicker;
    // Warm rim where the paper meets the top frame.
    col = mix(col, warm * vec3(1.0, 0.75, 0.45) * uGlow * 1.4, smoothstep(0.8, 0.95, uv.y) * 0.7);
    col = mix(col, vec3(0.05, 0.03, 0.025) + warm * 0.1 * uGlow, frame * 0.9);
  } else if (vKind < 1.5) {
    // Dark wood, lit warmly from the lantern and faintly by the sky.
    vec3 wood = vec3(0.055, 0.032, 0.022);
    float up = saturate(N.y);
    col = wood * (mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5) * 0.8 + warm * uGlow * (0.35 + 0.8 * up) * 0.35);
  } else {
    col = warm * 2.4 * uGlow * vFlicker;
  }
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist / uFogDist);
  col = mix(col, uFogColor, fog * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

// Far field: camera-facing glow sprites (lantern + its reflection).
const farVert = /* glsl */ `
attribute vec3 iPos; // x, z, phase
attribute float corner; // 0..3
attribute float refl; // 0 lantern, 1 reflection
uniform float uTime;
uniform vec3 uCamPos;
uniform vec2 uRes;
uniform vec2 uDrift;
uniform float uPx;
varying vec2 vQ;
varying float vRefl;
varying float vBright;
varying float vDist;
void main() {
  vec2 p = iPos.xy + uDrift * 0.3;
  float h = 0.28;
  vec3 w = vec3(p.x, refl > 0.5 ? -h * 0.9 : h, p.y);
  vec4 clip = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (clip.w < 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float dist = length(w - uCamPos);
  vDist = dist;
  // World size ~0.3 x 0.4 m, but never smaller than ~uPx pixels.
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  vec2 worldHalf = vec2(0.16, refl > 0.5 ? 0.5 : 0.22);
  float pxPerM = uRes.y * projectionMatrix[1][1] * 0.5 / max(clip.w, 0.01);
  vec2 halfPx = max(worldHalf * pxPerM, vec2(uPx * 0.5, uPx * (refl > 0.5 ? 1.2 : 0.65)));
  // Energy-conserving: tiny sprites get dimmer instead of bigger.
  float area = (worldHalf.x * worldHalf.y * pxPerM * pxPerM) / (halfPx.x * halfPx.y);
  vBright = min(1.0, area) * (0.8 + 0.2 * sin(uTime * 5.0 + iPos.z * 30.0));
  vRefl = refl;
  clip.xy += q * halfPx * 2.0 / uRes * clip.w;
  gl_Position = clip;
}`;

const farFrag = /* glsl */ `
uniform float uGlow;
uniform vec3 uFogColor;
uniform float uFogDist;
varying vec2 vQ;
varying float vRefl;
varying float vBright;
varying float vDist;
void main() {
  vec2 q = vQ;
  float g;
  if (vRefl > 0.5) {
    g = exp(-q.x * q.x * 5.0) * smoothstep(1.0, -0.2, q.y) * smoothstep(-1.0, -0.7, q.y) * 0.45;
  } else {
    g = exp(-dot(q, q) * 2.6);
  }
  vec3 warm = vec3(1.0, 0.78, 0.5);
  float fog = 1.0 - exp(-vDist / uFogDist);
  vec3 col = warm * g * vBright * uGlow * 1.6;
  col = mix(col, uFogColor * g * vBright * 0.3, fog * 0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

export type LanternField = {
  center: THREE.Vector2;
  half: THREE.Vector2;
  count: number;
  exclude: (x: number, z: number) => boolean;
};

export class FloatingLanterns {
  readonly near: THREE.Mesh;
  readonly far: THREE.Mesh;
  readonly nearMaterial: THREE.ShaderMaterial;
  readonly farMaterial: THREE.ShaderMaterial;
  private drift = new THREE.Vector2();

  constructor(field: LanternField, farCount: number, rng: () => number, dropsUniform: { value: THREE.Vector4[] }) {
    const geo = lanternGeometry();
    const place: number[] = [];
    const phase: number[] = [];
    let n = 0;
    let guard = 0;
    while (n < field.count && guard++ < field.count * 20) {
      const x = field.center.x + (rng() * 2 - 1) * field.half.x;
      const z = field.center.y + (rng() * 2 - 1) * field.half.y;
      if (field.exclude(x, z)) continue;
      place.push(x, z, rng() * Math.PI * 2, 0.9 + rng() * 0.3);
      phase.push(rng(), rng());
      n++;
    }
    geo.setAttribute("iPlace", new THREE.InstancedBufferAttribute(new Float32Array(place), 4));
    geo.setAttribute("iPhase", new THREE.InstancedBufferAttribute(new Float32Array(phase), 2));
    geo.instanceCount = n;
    this.nearMaterial = new THREE.ShaderMaterial({
      vertexShader: nearVert,
      fragmentShader: nearFrag,
      uniforms: {
        uTime: G.uTime,
        uNow: G.uTime,
        uDrops: dropsUniform,
        uCamPos: G.uCamPos,
        uAmbTop: G.uAmbTop,
        uAmbBottom: G.uAmbBottom,
        uFogColor: G.uFogColor,
        uDrift: { value: this.drift },
        uField: { value: new THREE.Vector4(field.center.x, field.center.y, field.half.x, field.half.y) },
        uGlow: { value: 1 },
        uFogDist: { value: 1600 },
        uMirror: { value: 0 },
      },
    });
    this.near = new THREE.Mesh(geo, this.nearMaterial);
    this.near.frustumCulled = false;

    // Far sprites: ring from just outside the near field to the horizon,
    // denser with distance (as the clip's band).
    const fg = new THREE.InstancedBufferGeometry();
    const corners: number[] = [];
    const refl: number[] = [];
    const fidx: number[] = [];
    for (let r = 0; r < 2; r++) {
      const base = corners.length;
      for (let c = 0; c < 4; c++) {
        corners.push(c);
        refl.push(r);
      }
      fidx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    fg.setAttribute("position", new THREE.Float32BufferAttribute(new Array(corners.length * 3).fill(0), 3));
    fg.setAttribute("corner", new THREE.Float32BufferAttribute(corners, 1));
    fg.setAttribute("refl", new THREE.Float32BufferAttribute(refl, 1));
    fg.setIndex(fidx);
    const ip: number[] = [];
    for (let i = 0; i < farCount; i++) {
      // Distance distribution skewed toward far away.
      const u = rng();
      const d = 150 + Math.pow(u, 0.55) * 3200;
      const a = rng() * Math.PI * 2;
      ip.push(field.center.x + Math.sin(a) * d, field.center.y - Math.cos(a) * d, rng());
    }
    fg.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(ip), 3));
    fg.instanceCount = farCount;
    this.farMaterial = new THREE.ShaderMaterial({
      vertexShader: farVert,
      fragmentShader: farFrag,
      uniforms: {
        uTime: G.uTime,
        uCamPos: G.uCamPos,
        uRes: G.uRes,
        uDrift: { value: this.drift },
        uPx: { value: 3.0 },
        uGlow: { value: 1 },
        uFogColor: G.uFogColor,
        uFogDist: { value: 2600 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.far = new THREE.Mesh(fg, this.farMaterial);
    this.far.frustumCulled = false;
    this.far.renderOrder = 2;
  }

  update(dt: number, glow: number) {
    this.drift.x += dt * 0.12;
    this.drift.y += dt * 0.05;
    this.nearMaterial.uniforms.uGlow.value = glow;
    this.farMaterial.uniforms.uGlow.value = glow;
  }
}
