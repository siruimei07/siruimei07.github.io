import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { groundY, MOON_AZ, PATH, POND, TEMPLE } from "./layout";

// The valley: the meadow floor (a heightfield, fine near the viewer), the
// footpath and the temple's gravel court painted onto it, a ring of dark
// wooded slopes, far hills in painted layers melting into the moon mist, and
// a still pond that holds the sky, the hall's warm doors and the moon's glitter.

const glslVec2Array = (pts: THREE.Vector2[]) => pts.map((p) => `vec2(${p.x.toFixed(3)}, ${p.y.toFixed(3)})`).join(", ");

function heightfield(): THREE.BufferGeometry {
  const NX = 170;
  const NZ = 150;
  const xs: number[] = [];
  const zs: number[] = [];
  // dense around the path / pond / temple, stretching out to the valley rim
  for (let i = 0; i <= NX; i++) {
    const u = (i / NX) * 2 - 1;
    xs.push(12 + Math.sign(u) * 330 * Math.pow(Math.abs(u), 1.8));
  }
  for (let j = 0; j <= NZ; j++) {
    const v = j / NZ;
    zs.push(60 - 420 * Math.pow(v, 1.6));
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) pos.push(xs[i], groundY(xs[i], zs[j]), zs[j]);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildGround(): THREE.Mesh {
  const c = Math.cos(TEMPLE.yaw);
  const s = Math.sin(TEMPLE.yaw);
  const pc = Math.cos(POND.yaw);
  const ps = Math.sin(POND.yaw);
  return new THREE.Mesh(
    heightfield(),
    toonMaterial({
      color: 0x24486a,
      shade: 0x0d1c3c,
      ink: 2,
      rim: 0.2,
      step: 0.08,
      fragmentHead: /* glsl */ `
        const vec2 PATHP[${PATH.length}] = vec2[${PATH.length}](${glslVec2Array(PATH)});
        float pathDist(vec2 p) {
          float best = 1e9;
          for (int i = 0; i < ${PATH.length - 1}; i++) {
            vec2 a = PATHP[i];
            vec2 ab = PATHP[i + 1] - a;
            float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
            vec2 d = p - (a + ab * t);
            best = min(best, dot(d, d));
          }
          return sqrt(best);
        }`,
      fragment: /* glsl */ `
        vec2 p = vWorldPos.xz;
        // meadow floor: dark under the grass, painted patches
        float g = fbm2(p * 0.09, 3);
        base *= 0.88 + 0.24 * step(0.5, g); shade *= 0.9 + 0.18 * step(0.5, g);
        // combed grass strokes on the floor, fading with distance
        float strokes = vnoise(vec2(p.x * 2.6 + p.y * 1.3, p.y * 0.35 - p.x * 0.2));
        float camD = length(vWorldPos - cameraPosition);
        float near = smoothstep(90.0, 20.0, camD);
        base *= 1.0 + (step(0.6, strokes) * 0.18 - 0.05) * near;
        // far off, the meadow is painted: a dark mass of leaves flecked with silver plumes
        float farF = smoothstep(55.0, 120.0, camD);
        float fleck = step(0.6, vnoise(vec2(p.x * 1.3 + p.y * 0.5, p.y * 3.1 - p.x * 0.2)));
        base = mix(base, mix(vec3(0.045, 0.11, 0.22), vec3(0.36, 0.42, 0.66), fleck * 0.75), farF);
        shade = mix(shade, mix(vec3(0.02, 0.05, 0.13), vec3(0.16, 0.2, 0.4), fleck * 0.75), farF);
        // the footpath: trodden earth with a soft grassy edge
        float pd = pathDist(p) + (vnoise(p * 1.9) - 0.5) * 0.35;
        float path = smoothstep(0.95, 0.55, pd);
        vec3 earth = vec3(0.1, 0.13, 0.24);
        base = mix(base, earth * (0.9 + 0.2 * vnoise(p * 3.0)), path);
        shade = mix(shade, vec3(0.045, 0.06, 0.14), path);
        // the temple court: raked gravel
        vec2 d = p - vec2(${TEMPLE.x.toFixed(3)}, ${TEMPLE.z.toFixed(3)});
        vec2 lp = vec2(d.x * ${c.toFixed(5)} - d.y * ${s.toFixed(5)}, d.x * ${s.toFixed(5)} + d.y * ${c.toFixed(5)});
        float court = max(abs(lp.x) / 17.0, abs(lp.y) / 15.0);
        float gravel = smoothstep(1.03, 0.97, court + (vnoise(p * 0.8) - 0.5) * 0.06);
        float rake = step(0.5, fract(lp.y * 2.2 + sin(lp.x * 0.35) * 0.3));
        vec3 grav = vec3(0.17, 0.21, 0.34) * (0.92 + 0.12 * rake);
        base = mix(base, grav, gravel);
        shade = mix(shade, vec3(0.06, 0.075, 0.16) * (0.95 + 0.1 * rake), gravel);
        // the pond bank: wet dark mud
        vec2 pp = p - vec2(${POND.x.toFixed(3)}, ${POND.z.toFixed(3)});
        vec2 lq = vec2(pp.x * ${pc.toFixed(5)} - pp.y * ${ps.toFixed(5)}, pp.x * ${ps.toFixed(5)} + pp.y * ${pc.toFixed(5)});
        float pr = length(lq / vec2(${POND.rx.toFixed(2)}, ${POND.rz.toFixed(2)}));
        float bank = smoothstep(1.35, 1.0, pr);
        base = mix(base, vec3(0.1, 0.16, 0.3), bank * 0.7);
        shade = mix(shade, vec3(0.03, 0.05, 0.13), bank * 0.7);
        // the far valley slopes: dark woods
        float wood = smoothstep(4.0, 12.0, vWorldPos.y);
        base = mix(base, vec3(0.1, 0.22, 0.4), wood);
        shade = mix(shade, vec3(0.03, 0.08, 0.2), wood);`,
    }),
  );
}

// ------------------------------------------------------------------ treelines

const treeVert = /* glsl */ `
attribute float aH;
varying float vH;
varying float vViewZ;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vH = aH;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const treeFrag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform vec3 uCol;
uniform vec3 uLow;
uniform vec3 uMist;
uniform float uInk;
uniform vec3 uMoonDir;
varying float vH;
varying float vViewZ;
varying vec3 vWorld;
void main() {
  // a wall of crowns: darker at the foot, clumps of foliage suggested by soft value noise
  vec3 dir = normalize(vWorld - cameraPosition);
  float az = atan(dir.x, -dir.z);
  float leaf = vnoise(vec2(az * 260.0, vWorld.y * 0.45));
  vec3 col = mix(uLow, uCol, smoothstep(0.0, 0.8, vH));
  col *= 0.92 + 0.16 * step(0.55, leaf);
  float toMoon = pow(saturate(dot(dir, uMoonDir) * 0.5 + 0.5), 10.0);
  col = mix(col, uMist, smoothstep(0.35, 0.0, vH) * 0.6 + toMoon * 0.18);
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0, 0.0, vViewZ, uInk + 0.15 * 0.45);
}`;

// valley azimuth (about the valley centre) of the woods seen behind the hall from both viewpoints
const DIP = THREE.MathUtils.degToRad(41);

/** Treelines on the valley rim: curtains whose top edge is a scallop of crowns (and a few spires). */
export function buildTreelines(): THREE.Object3D {
  const group = new THREE.Group();
  // valley radius, crown height, colour, foot colour, mist, ink, seed
  const rows: [number, number, number, number, number, number, number][] = [
    [168, 14, 0x173d6e, 0x0d2652, 0x3f86c0, 12, 5],
    [236, 16, 0x285a90, 0x1a4478, 0x5aa2d6, 13, 6],
  ];
  rows.forEach(([R, H, c, low, mist, ink, seed], li) => {
    const rand = rng(seed);
    const az0 = THREE.MathUtils.degToRad(-80);
    const az1 = THREE.MathUtils.degToRad(160);
    // trees along the arc: azimuth, half-width (rad), height, pointed
    // the woods thin out behind the hall so its roofs stand against the haze
    const behindHall = (az: number) => Math.exp(-(((az - DIP) / 0.3) ** 2));
    const stand = (az: number) => (0.78 + 0.2 * Math.sin(az * 6 + seed) + 0.12 * Math.sin(az * 15 + seed * 2.3) + 0.06 * Math.sin(az * 37 + seed)) * (1 - 0.55 * behindHall(az));
    const trees: [number, number, number, number][] = [];
    let a = az0;
    while (a < az1) {
      const pointed = rand() < 0.16 ? 1 : 0;
      const w = ((2 + rand() * 2.6) / R) * (pointed ? 0.62 : 1);
      trees.push([a, w, H * stand(a) * (0.84 + rand() * 0.3) * (pointed ? 1.22 : 1), pointed]);
      a += w * (0.55 + rand() * 0.5);
    }
    const N = 1600;
    const pos: number[] = [];
    const hs: number[] = [];
    const idx: number[] = [];
    let ti = 0;
    for (let i = 0; i <= N; i++) {
      const az = az0 + ((az1 - az0) * i) / N;
      while (ti < trees.length - 1 && trees[ti][0] + trees[ti][1] * 1.5 < az) ti++;
      let top = H * 0.5 * stand(az);
      for (let k = Math.max(0, ti - 4); k < Math.min(trees.length, ti + 5); k++) {
        const [ta, tw, th, pt] = trees[k];
        const u = (az - ta) / tw;
        if (Math.abs(u) >= 1) continue;
        const bump = pt ? th * (1 - Math.abs(u)) ** 1.15 : th * Math.sqrt(1 - u * u);
        top = Math.max(top, bump);
      }
      const r = R + 16 * Math.sin(az * 3 + seed) + 7 * Math.sin(az * 8 - seed);
      const x = (Math.sin(az) * r) / 0.8;
      const z = -20 - Math.cos(az) * r;
      const gy = groundY(x, z);
      pos.push(x, gy - 12, z, x, gy + top, z);
      hs.push(0, 1);
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aH", new THREE.Float32BufferAttribute(hs, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: treeVert,
      fragmentShader: treeFrag,
      side: THREE.DoubleSide,
      uniforms: {
        uCol: { value: new THREE.Color(c) },
        uLow: { value: new THREE.Color(low) },
        uMist: { value: new THREE.Color(mist) },
        uInk: { value: ink },
        uMoonDir: env.uMoonDir,
      },
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8 + li;
    group.add(mesh);
  });
  return group;
}

// ------------------------------------------------------------------ far hills

const hillVert = /* glsl */ `
attribute float aH;
varying float vH;
varying float vViewZ;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vH = aH;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const hillFrag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform vec3 uCol;
uniform vec3 uMist;
uniform vec3 uRidge;
uniform vec3 uMoonDir;
varying float vH;
varying float vViewZ;
varying vec3 vWorld;
void main() {
  // flat painted layer; mist gathers in the valleys at its foot, a pale moonlit crest
  float mist = 1.0 - smoothstep(0.0, 0.55, vH);
  vec3 col = mix(uCol, uMist, mist * 0.85);
  vec3 dir = normalize(vWorld - cameraPosition);
  float toMoon = pow(saturate(dot(dir, uMoonDir) * 0.5 + 0.5), 8.0);
  col = mix(col, uMist, toMoon * 0.35);
  col = mix(col, uRidge, smoothstep(0.985, 1.0, vH) * (0.35 + 0.65 * toMoon));
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0, 0.0, vViewZ, 0.0);
}`;

export function buildHills(): THREE.Object3D {
  const group = new THREE.Group();
  // radius (m), base height, amplitude, colour, mist, seed
  const layers: [number, number, number, number, number, number][] = [
    [520, 40, 70, 0x2d66aa, 0x7cc0e8, 11],
    [900, 70, 120, 0x2c69aa, 0x6dbbe6, 23],
    [1600, 110, 210, 0x3f86c2, 0x7cc9ee, 37],
    [2800, 150, 330, 0x5aa3d6, 0x8ad4f2, 51],
  ];
  const centre = new THREE.Vector3(10, 0, -20);
  layers.forEach(([R, h0, amp, c, mist, seed], li) => {
    const rand = rng(seed);
    const ph = Array.from({ length: 6 }, () => rand() * 6.28);
    const N = 220;
    const pos: number[] = [];
    const hs: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const az = THREE.MathUtils.degToRad(-75 + (230 * i) / N);
      // a mountain profile: a few long swells, some sharper peaks, fine ripple
      const a = az * 3;
      let h = Math.sin(a * 0.9 + ph[0]) * 0.45 + Math.sin(a * 1.7 + ph[1]) * 0.3 + Math.sin(a * 4.3 + ph[2]) * 0.12;
      h += Math.pow(Math.max(0, Math.sin(a * 2.6 + ph[3])), 3) * 0.55 + Math.sin(a * 11 + ph[4]) * 0.04 + Math.sin(a * 23 + ph[5]) * 0.015;
      // keep the sky under the moon open: the hills dip there
      const dm = az - THREE.MathUtils.degToRad(MOON_AZ);
      h -= 0.35 * Math.exp(-dm * dm * 8);
      const top = h0 + amp * (0.55 + 0.5 * h);
      const x = centre.x + Math.sin(az) * R;
      const z = centre.z - Math.cos(az) * R;
      pos.push(x, -60, z, x, top, z);
      hs.push(0, 1);
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aH", new THREE.Float32BufferAttribute(hs, 1));
    g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      vertexShader: hillVert,
      fragmentShader: hillFrag,
      side: THREE.DoubleSide,
      uniforms: {
        uCol: { value: new THREE.Color(c) },
        uMist: { value: new THREE.Color(mist) },
        uRidge: { value: new THREE.Color(0xbfeeff) },
        uMoonDir: env.uMoonDir,
      },
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    // far layers draw after the near geometry, so most of their pixels are rejected early
    mesh.renderOrder = 10 + li;
    group.add(mesh);
  });
  return group;
}

// ------------------------------------------------------------------ the pond

const pondVert = /* glsl */ `
varying vec3 vWorld;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const pondFrag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform float uTime;
uniform vec3 uMoonDir;
uniform float uMoonR;
uniform float uLit;
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uDeep;
uniform vec3 uBank;
uniform vec3 uHall;
uniform vec4 uLights[3];   // warm lights to reflect: xyz, strength
uniform vec4 uTemple;      // x, z, cos, sin
varying vec3 vWorld;
varying float vViewZ;

vec3 skyAt(vec3 d) {
  float el = d.y;
  vec3 col = mix(uHorizon, uMid, smoothstep(-0.02, 0.3, el));
  col = mix(col, uZenith, smoothstep(0.26, 0.9, el));
  float md = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  col += uGlow * (exp(-md / (uMoonR * 3.6)) * 0.7 + exp(-md / (uMoonR * 1.1)) * 0.8) * (0.3 + 0.7 * uLit);
  return col;
}

float rip(vec2 p, float t) {
  float h = vnoise(p * vec2(0.9, 2.6) + vec2(t * 0.18, t * 0.55)) * 0.6;
  h += vnoise(p * vec2(2.4, 5.5) - vec2(t * 0.4, t * 1.1)) * 0.3;
  h += sin(p.x * 0.8 + p.y * 3.1 - t * 1.7) * 0.06;
  return h;
}

// Is the mirrored ray blocked by the hall (a coarse massing of the building)?
float hallHit(vec3 o, vec3 d) {
  float hit = 0.0;
  for (int i = 1; i <= 28; i++) {
    float t = float(i) * 2.2;
    vec3 q = o + d * t;
    vec2 w = q.xz - uTemple.xy;
    vec2 l = vec2(w.x * uTemple.z - w.y * uTemple.w, w.x * uTemple.w + w.y * uTemple.z);
    float y = q.y - ${TEMPLE.y.toFixed(2)};
    // body, lower roof, upper roof (tapering toward the ridge)
    float body = step(abs(l.x), 11.6) * step(abs(l.y), 9.8) * step(y, 7.2);
    float upper = step(abs(l.x), 9.6 - max(0.0, y - 12.0) * 0.9) * step(abs(l.y), 7.6 - max(0.0, y - 12.0) * 1.8) * step(y, 16.6);
    hit = max(hit, max(body, upper) * step(0.0, y));
  }
  return hit;
}

void main() {
  vec3 toP = vWorld - cameraPosition;
  float dist = length(toP);
  vec3 V = toP / dist;
  vec2 p = vWorld.xz;
  float e = 0.06;
  float h0 = rip(p, uTime);
  float hx = rip(p + vec2(e, 0.0), uTime);
  float hz = rip(p + vec2(0.0, e), uTime);
  float amp = 0.09;
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp * 1.6));
  vec3 r = reflect(V, n);
  vec3 col = skyAt(r);
  // the far bank's grass and woods reflected as a dark band low in the mirror
  float el = r.y;
  float bank = 1.0 - smoothstep(0.035, 0.07, el + (vnoise(vec2(atan(r.x, -r.z) * 60.0, 0.0)) - 0.5) * 0.03);
  col = mix(col, uBank, bank);
  // the hall's silhouette and its lit doors
  float hall = hallHit(vWorld + vec3(0.0, 0.02, 0.0), r);
  col = mix(col, uHall, hall);
  // Fresnel: steeper views see into the water
  float fres = 0.25 + 0.75 * pow(1.0 - saturate(-V.y), 4.0);
  col = mix(uDeep, col, fres);
  // warm lights stretched into vertical streaks
  for (int i = 0; i < 3; i++) {
    vec3 L = uLights[i].xyz;
    vec3 m = vec3(L.x, 2.0 * ${POND.level.toFixed(2)} - L.y, L.z);   // mirror image of the light
    vec3 dm = normalize(m - cameraPosition);
    vec2 a = vec2(atan(V.x, -V.z) - atan(dm.x, -dm.z), asin(V.y) - asin(dm.y));
    float streak = exp(-a.x * a.x / 0.00002) * exp(-a.y * a.y / 0.0009);
    float brk = step(0.35, vnoise(vec2(p.x * 3.0, p.y * 9.0 + uTime * 1.5)));
    col += vec3(1.0, 0.62, 0.3) * streak * brk * uLights[i].w;
  }
  // the moon's glitter: hard dashes where the ripples mirror the moon
  float mu = dot(r, uMoonDir);
  float glint = smoothstep(cos(uMoonR * 2.6), cos(uMoonR * 1.1), mu);
  float dash = step(0.5, vnoise(vec2(p.x * 1.6, p.y * 7.0) + vec2(uTime * 0.4, uTime * 1.3)));
  col = mix(col, vec3(1.0, 0.99, 0.95) * 2.4, glint * dash * (0.35 + 0.65 * uLit));
  // drawn ripple lines
  float f = fbm2(p * vec2(0.25, 0.9) + vec2(uTime * 0.05, uTime * 0.12), 3);
  float band = abs(fract(f * 6.0) - 0.5);
  col = mix(col, uGlow * 0.8, smoothstep(0.02, 0.008, band) * 0.25 * (1.0 - bank) * step(0.45, vnoise(p * 0.7)));
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0, 0.0, vViewZ, 0.0);
}`;

export class Pond {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(sky: { zenith: THREE.Color; mid: THREE.Color; horizon: THREE.Color; glow: THREE.Color; moonR: number }, lights: THREE.Vector4[]) {
    const geo = new THREE.CircleGeometry(1, 48);
    geo.rotateX(-Math.PI / 2);
    geo.scale(POND.rx + 1.6, 1, POND.rz + 1.6);
    geo.rotateY(POND.yaw);
    geo.translate(POND.x, POND.level, POND.z);
    this.material = new THREE.ShaderMaterial({
      vertexShader: pondVert,
      fragmentShader: pondFrag,
      uniforms: {
        uTime: env.uTime,
        uMoonDir: env.uMoonDir,
        uMoonR: { value: sky.moonR },
        uLit: { value: 1 },
        uZenith: { value: sky.zenith },
        uMid: { value: sky.mid },
        uHorizon: { value: sky.horizon },
        uGlow: { value: sky.glow },
        uDeep: { value: new THREE.Color(0x0b2455) },
        uBank: { value: new THREE.Color(0x0e2a55) },
        uHall: { value: new THREE.Color(0x0a1838) },
        uLights: { value: lights },
        uTemple: { value: new THREE.Vector4(TEMPLE.x, TEMPLE.z, Math.cos(TEMPLE.yaw), Math.sin(TEMPLE.yaw)) },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }

  set lit(v: number) {
    this.material.uniforms.uLit.value = v;
  }
}
