import * as THREE from "three";
import { common, skyMath } from "../engine/glsl";
import { G } from "./atmos";
import { skyFunctions } from "./sky";

// A myōjin torii modelled from the clip's proportions (kasagi ≈ 2.3× the
// pillar spacing, nuki ≈ 1.8×): curved kasagi with a black lacquer cap and
// swept, slanted ends, shimaki beneath it, gakuzuka, a through-tenon nuki,
// kusabi wedges, daiwa collars and slightly leaning, tapered pillars.
// Everything is one merged geometry with a `part` attribute; the shader does
// vermilion lacquer, wood grain, weathering and the wet base procedurally.

export type ToriiDims = {
  spacing: number; // pillar centre distance
  height: number; // top of kasagi at the middle
  scale: number;
};

type Parts = { pos: number[]; nrm: number[]; part: number[]; grain: number[]; idx: number[] };

function pushQuadStrip(P: Parts, a: THREE.Vector3[], b: THREE.Vector3[], part: number, grain: THREE.Vector3, flip = false) {
  // a and b are rows of equal length; builds a strip of quads with flat-ish normals.
  const base = P.pos.length / 3;
  for (let i = 0; i < a.length; i++) {
    for (const v of [a[i], b[i]]) {
      P.pos.push(v.x, v.y, v.z);
      P.part.push(part);
      P.grain.push(grain.x, grain.y, grain.z);
      P.nrm.push(0, 0, 0);
    }
  }
  for (let i = 0; i < a.length - 1; i++) {
    const i0 = base + i * 2;
    if (!flip) P.idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    else P.idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3);
  }
}

function pushPoly(P: Parts, pts: THREE.Vector3[], part: number, grain: THREE.Vector3) {
  // Convex polygon fan.
  const base = P.pos.length / 3;
  for (const v of pts) {
    P.pos.push(v.x, v.y, v.z);
    P.part.push(part);
    P.grain.push(grain.x, grain.y, grain.z);
    P.nrm.push(0, 0, 0);
  }
  for (let i = 1; i < pts.length - 1; i++) P.idx.push(base, base + i, base + i + 1);
}

// Beam along X from -L/2..L/2. yBot(x)/yTop(x) give the profile; depth(x) the
// z-thickness; endSlant pushes the top of each end outward (kasagi cut).
function beam(P: Parts, L: number, seg: number, yBot: (x: number) => number, yTop: (x: number) => number, depth: (x: number) => number, part: number, capPart: number, endSlant = 0, zc = 0) {
  const grain = new THREE.Vector3(1, 0, 0);
  const xs: number[] = [];
  for (let i = 0; i <= seg; i++) xs.push(-L / 2 + (L * i) / seg);
  const row = (fy: (x: number) => number, fz: (x: number) => number, top: boolean) =>
    xs.map((x) => {
      const e = Math.abs(x) / (L / 2);
      const slant = top ? endSlant * Math.pow(e, 8) * Math.sign(x) : 0;
      return new THREE.Vector3(x + slant, fy(x), zc + fz(x));
    });
  const tf = row(yTop, (x) => depth(x) / 2, true); // top front
  const tb = row(yTop, (x) => -depth(x) / 2, true); // top back
  const bf = row(yBot, (x) => depth(x) / 2, false);
  const bb = row(yBot, (x) => -depth(x) / 2, false);
  pushQuadStrip(P, tb, tf, capPart, grain); // top
  pushQuadStrip(P, bf, bb, part, grain); // bottom
  pushQuadStrip(P, tf, bf, part, grain); // front
  pushQuadStrip(P, bb, tb, part, grain); // back
  // End caps.
  const n = xs.length - 1;
  pushPoly(P, [tf[0], tb[0], bb[0], bf[0]], part, new THREE.Vector3(0, 1, 0));
  pushPoly(P, [tf[n], bf[n], bb[n], tb[n]], part, new THREE.Vector3(0, 1, 0));
}

function box(P: Parts, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, part: number, grain: THREE.Vector3) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  pushPoly(P, [v(x0, y1, z1), v(x1, y1, z1), v(x1, y1, z0), v(x0, y1, z0)], part, grain);
  pushPoly(P, [v(x0, y0, z0), v(x1, y0, z0), v(x1, y0, z1), v(x0, y0, z1)], part, grain);
  pushPoly(P, [v(x0, y0, z1), v(x1, y0, z1), v(x1, y1, z1), v(x0, y1, z1)], part, grain);
  pushPoly(P, [v(x1, y0, z0), v(x0, y0, z0), v(x0, y1, z0), v(x1, y1, z0)], part, grain);
  pushPoly(P, [v(x1, y0, z1), v(x1, y0, z0), v(x1, y1, z0), v(x1, y1, z1)], part, grain);
  pushPoly(P, [v(x0, y0, z0), v(x0, y0, z1), v(x0, y1, z1), v(x0, y1, z0)], part, grain);
}

// Tapered, leaning cylinder from y0 to y1.
function pillar(P: Parts, cx: number, y0: number, y1: number, r0: number, r1: number, lean: number, part: number, radial = 36, rings = 14) {
  const grain = new THREE.Vector3(0, 1, 0);
  const base = P.pos.length / 3;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = y0 + (y1 - y0) * t;
    const r = r0 + (r1 - r0) * t;
    const x = cx + lean * t;
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      P.pos.push(x + Math.cos(a) * r, y, Math.sin(a) * r);
      P.nrm.push(0, 0, 0);
      P.part.push(part);
      P.grain.push(grain.x, grain.y, grain.z);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = base + j * (radial + 1) + i;
      const b = a + radial + 1;
      P.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

function ring(P: Parts, cx: number, y0: number, y1: number, r: number, part: number) {
  // Short cylinder with a rounded (bulging) profile: the daiwa collar.
  const base = P.pos.length / 3;
  const radial = 36;
  const rings = 6;
  for (let j = 0; j <= rings; j++) {
    const t = j / rings;
    const y = y0 + (y1 - y0) * t;
    const rr = r * (0.9 + 0.1 * Math.sin(t * Math.PI));
    for (let i = 0; i <= radial; i++) {
      const a = (i / radial) * Math.PI * 2;
      P.pos.push(cx + Math.cos(a) * rr, y, Math.sin(a) * rr);
      P.nrm.push(0, 0, 0);
      P.part.push(part);
      P.grain.push(0, 1, 0);
    }
  }
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < radial; i++) {
      const a = base + j * (radial + 1) + i;
      const b = a + radial + 1;
      P.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Top cap.
  const c = P.pos.length / 3;
  P.pos.push(cx, y1, 0);
  P.nrm.push(0, 0, 0);
  P.part.push(part);
  P.grain.push(0, 1, 0);
  const top = base + rings * (radial + 1);
  for (let i = 0; i < radial; i++) P.idx.push(c, top + i + 1, top + i);
}

function wedge(P: Parts, cx: number, y: number, sx: number, sy: number, sz: number, part: number) {
  // Kusabi: a little gabled block sitting on the nuki.
  const v = (x: number, yy: number, z: number) => new THREE.Vector3(cx + x, y + yy, z);
  const hx = sx / 2, hz = sz / 2;
  const g = new THREE.Vector3(1, 0, 0);
  pushPoly(P, [v(-hx, 0, hz), v(hx, 0, hz), v(hx * 0.7, sy, 0), v(-hx * 0.7, sy, 0)], part, g);
  pushPoly(P, [v(hx, 0, -hz), v(-hx, 0, -hz), v(-hx * 0.7, sy, 0), v(hx * 0.7, sy, 0)], part, g);
  pushPoly(P, [v(-hx, 0, -hz), v(-hx, 0, hz), v(-hx * 0.7, sy, 0)], part, g);
  pushPoly(P, [v(hx, 0, hz), v(hx, 0, -hz), v(hx * 0.7, sy, 0)], part, g);
}

export const TORII_PILLAR_TOP = 16.25;

export function buildToriiGeometry() {
  const P: Parts = { pos: [], nrm: [], part: [], grain: [], idx: [] };
  const half = 6.0; // pillar centres at ±6 m
  const lean = 0.22;
  const pillarTop = TORII_PILLAR_TOP;
  const nukiY = pillarTop * 0.76;
  // Pillars (0 = vermilion). They continue 2 m below the waterline.
  pillar(P, -half, -2, pillarTop, 0.74, 0.6, lean, 0);
  pillar(P, half, -2, pillarTop, 0.74, 0.6, -lean, 0);
  // Daiwa collars under the shimaki.
  ring(P, -half + lean, pillarTop - 0.42, pillarTop, 0.72, 0);
  ring(P, half - lean, pillarTop - 0.42, pillarTop, 0.72, 0);
  // Nuki: straight tie beam, extending past the pillars.
  box(P, 0, nukiY, 0, 21.2, 1.15, 0.72, 0, new THREE.Vector3(1, 0, 0));
  // Kusabi wedges on the nuki, outside each pillar.
  for (const s of [-1, 1]) {
    const px = s * (half - lean * 0.72);
    wedge(P, px + s * 1.05, nukiY + 0.575, 0.9, 0.55, 0.62, 0);
    wedge(P, px - s * 1.05, nukiY + 0.575, 0.9, 0.55, 0.62, 0);
  }
  // Gakuzuka (central strut).
  const gakuBot = nukiY + 0.575;
  box(P, 0, (gakuBot + pillarTop) / 2, 0, 1.25, pillarTop - gakuBot, 0.62, 0, new THREE.Vector3(0, 1, 0));
  // Shimaki: gently curved.
  const shimakiL = 21.8;
  const sori = (x: number, L: number, k: number) => k * Math.pow(Math.abs(x) / (L / 2), 2.6);
  beam(
    P,
    shimakiL,
    64,
    (x) => pillarTop + sori(x, shimakiL, 0.35),
    (x) => pillarTop + 0.95 + sori(x, shimakiL, 0.42),
    () => 1.05,
    0,
    0,
  );
  // Kasagi: stronger sweep, thicker toward the ends, black top.
  const kasagiL = 25.6;
  const ky = pillarTop + 0.95;
  beam(
    P,
    kasagiL,
    96,
    (x) => ky + sori(x, kasagiL, 0.62),
    (x) => ky + 1.18 + sori(x, kasagiL, 1.05) + 0.12 * Math.pow(Math.abs(x) / (kasagiL / 2), 4),
    () => 1.35,
    0,
    1,
    0.55,
  );
  // Black lacquer coping on top of the kasagi (thin slab following the curve).
  beam(
    P,
    kasagiL + 0.35,
    96,
    (x) => ky + 1.16 + sori(x, kasagiL, 1.05) + 0.12 * Math.pow(Math.abs(x) / (kasagiL / 2), 4),
    (x) => ky + 1.44 + sori(x, kasagiL, 1.08) + 0.14 * Math.pow(Math.abs(x) / (kasagiL / 2), 4),
    () => 1.5,
    1,
    1,
    0.7,
  );

  // Flat-shade beams/boxes, smooth-shade round parts: compute per-face normals
  // then average only across vertices that belong to the same face group.
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(P.pos, 3));
  geo.setAttribute("part", new THREE.Float32BufferAttribute(P.part, 1));
  geo.setAttribute("grain", new THREE.Float32BufferAttribute(P.grain, 3));
  geo.setIndex(P.idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const vert = /* glsl */ `
attribute float part;
attribute vec3 grain;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vPart;
varying vec3 vGrain;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vLocal = position;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vPart = part;
  vGrain = grain;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${common}
${skyMath}
${skyFunctions}
uniform vec3 uCamPos;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uMoonColor;
uniform float uLanternLight;
uniform float uFogDist;
uniform float uPortal;
uniform float uWet;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vLocal;
varying float vPart;
varying vec3 vGrain;

float D_GGX(float NdH, float a) { float a2 = a * a; float d = NdH * NdH * (a2 - 1.0) + 1.0; return a2 / (PI * d * d); }

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  vec3 p = vLocal;

  // Wood grain: stretched noise along the grain axis.
  vec3 ga = normalize(vGrain);
  vec3 q = p * 3.0;
  float along = dot(q, ga);
  vec3 perp = q - ga * along;
  float grainN = fbm2(vec2(along * 0.18, length(perp) * 6.0 + dot(perp, vec3(3.1, 1.7, 2.3))), 4);
  float fine = vnoise(vec2(along * 0.6, dot(perp, vec3(9.0, 7.0, 5.0))));
  // Weathering: vertical rain streaks and blotches.
  float streak = fbm2(vec2(p.x * 2.2 + p.z * 1.3, p.y * 0.12), 4);
  float blotch = fbm2(p.xy * 0.45 + p.z, 4);

  vec3 vermilion = vec3(0.38, 0.042, 0.03);
  vec3 albedo = vermilion * (0.84 + grainN * 0.3 + fine * 0.08);
  albedo *= 1.0 - smoothstep(0.55, 0.8, streak) * 0.25;
  albedo = mix(albedo, albedo * vec3(0.8, 0.72, 0.7), smoothstep(0.55, 0.75, blotch) * 0.5);
  float rough = 0.42 + grainN * 0.12;
  if (vPart > 0.5) {
    albedo = vec3(0.028, 0.024, 0.026) * (0.9 + grainN * 0.2);
    rough = 0.36;
  }
  // Wet, darker base where the pillars meet the water.
  float wet = 1.0 - smoothstep(0.2, 2.6 + blotch * 0.8, vWorld.y);
  albedo = mix(albedo, albedo * vec3(0.32, 0.22, 0.2), wet * uWet);
  rough = mix(rough, 0.18, wet * uWet);

  // Sun.
  vec3 L = uSunDir;
  float NdL = saturate(dot(N, L));
  vec3 H = normalize(L + V);
  float a = rough * rough;
  float spec = D_GGX(saturate(dot(N, H)), a) * 0.25;
  vec3 F0 = vec3(0.045);
  float fres = pow(1.0 - saturate(dot(N, V)), 5.0);
  vec3 F = F0 + (1.0 - F0) * fres;
  float sunVis = smoothstep(-0.02, 0.04, uSunDir.y);
  vec3 col = (albedo / PI * NdL + F * spec * NdL) * uSunColor * sunVis * PI;
  // Moon (key light at night).
  vec3 Lm = uMoonDir;
  float NdLm = saturate(dot(N, Lm));
  vec3 Hm = normalize(Lm + V);
  col += (albedo * NdLm + F * D_GGX(saturate(dot(N, Hm)), a) * 0.25 * NdLm * PI) * uMoonColor * 1.4;
  // Sky + water ambient (hemisphere) with crude cavity darkening.
  float cav = 0.7 + 0.3 * saturate(N.y * 0.5 + 0.5);
  // Occlusion where members meet (under the kasagi, above the nuki, at the base).
  float occ = 1.0 - 0.35 * exp(-abs(vWorld.y - 16.25) * 1.4) - 0.25 * exp(-abs(vWorld.y - 12.9) * 2.0) * step(abs(abs(vWorld.x) - 5.9), 1.2);
  vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
  col += albedo * amb * cav * occ * 0.85;
  // Lacquer reflection of the sky (the long highlight along the pillars).
  vec3 R = reflect(-V, N);
  vec3 env = skyGradient(normalize(vec3(R.x, max(R.y, 0.02), R.z)));
  col += env * F * (1.0 - rough) * 0.55;
  // Warm light bouncing up from the floating lanterns.
  col += albedo * vec3(1.0, 0.62, 0.3) * uLanternLight * exp(-max(vWorld.y, 0.0) * 0.28) * saturate(-N.y * 0.5 + 0.6);
  // Portal glow spilling onto the inner faces.
  float inner = saturate(1.0 - abs(vWorld.x) / 7.2) * step(vWorld.y, 12.2);
  col += albedo * vec3(0.2, 1.0, 0.9) * uPortal * inner * 2.0;

  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist / uFogDist);
  col = mix(col, uFogColor, fog * 0.7);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createToriiMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uCamPos: G.uCamPos,
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uMoonDir: G.uMoonDir,
      uMoonColor: G.uMoonColor,
      uMoon: G.uMoon,
      uZenith: G.uZenith,
      uMid: G.uMid,
      uHorizon: G.uHorizon,
      uGlow: G.uGlow,
      uFogColor: G.uFogColor,
      uHorizonBank: G.uHorizonBank,
      uAmbTop: G.uAmbTop,
      uAmbBottom: G.uAmbBottom,
      uTime: G.uTime,
      uLanternLight: { value: 0 },
      uFogDist: { value: 1600 },
      uPortal: { value: 0 },
      uWet: { value: 1 },
    },
    side: THREE.DoubleSide,
  });
}
