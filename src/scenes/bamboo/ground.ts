import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { groundY, LANTERN, PATH, SHRINE, STALK_X, STALK_Z } from "./layout";
import { stalkHueGlsl } from "./shaders";

// The floor of the grove: a heightfield strewn with fallen bamboo leaves,
// dappled where the moonlight shafts land and pooled with the shining stalk's
// rainbow; a stepping-stone path; an old hokora (祠) with a little torii; a
// stone lantern that still burns.

/** Where the moonlight shafts come down (x, z, width, seed) — shared with fx. */
export const SHAFTS: [number, number, number, number][] = [
  [-2.5, -6.5, 0.7, 0.1],
  [1.8, -4.8, 0.5, 0.7],
  [-6.0, -12.0, 1.0, 0.3],
  [4.8, -11.0, 0.9, 0.5],
  [-11.0, -8.0, 0.8, 0.9],
  [8.0, -18.0, 1.2, 0.2],
  [-3.0, -19.0, 1.1, 0.6],
  [12.0, -9.0, 0.8, 0.8],
];

function heightfield(): THREE.BufferGeometry {
  const NX = 190;
  const NZ = 170;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const u = (i / NX) * 2 - 1;
    xs.push(-2 + Math.sign(u) * 150 * Math.pow(Math.abs(u), 1.8));
  }
  for (let j = 0; j <= NZ; j++) {
    const u = (j / NZ) * 2 - 1;
    zs.push(2 + (u < 0 ? -210 : 60) * Math.pow(Math.abs(u), 1.7));
  }
  const pos: number[] = [];
  const idx: number[] = [];
  for (const z of zs) for (const x of xs) pos.push(x, groundY(x, z), z);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildGround(stalk: THREE.Vector3): THREE.Mesh {
  const shafts = SHAFTS.map(([x, z, w, s]) => new THREE.Vector4(x, z, w, s));
  const mat = toonMaterial({
    color: 0x33495a,
    shade: 0x0d172b,
    ink: 1,
    rim: 0.2,
    step: 0.85,
    lights: 0,
    soft: 0.05,
    uniforms: { uStalk: { value: stalk }, uShafts: { value: shafts } },
    fragmentHead: /* glsl */ `
      uniform vec3 uStalk;
      uniform vec4 uShafts[${SHAFTS.length}];
      ${stalkHueGlsl}`,
    fragment: /* glsl */ `
      vec2 p = vWorldPos.xz;
      float px = fwidth(p.x) + fwidth(p.y);
      // soil and moss patches under the litter
      float patchy = fbm2(p * 0.22, 3);
      base = mix(base * 0.78, base * vec3(0.92, 1.08, 1.0), smoothstep(0.35, 0.65, patchy));
      shade *= mix(0.85, 1.05, smoothstep(0.3, 0.7, patchy));
      // fallen bamboo leaves: two layers of cells, one slender leaf each
      float det = 1.0 - smoothstep(0.035, 0.09, px);
      vec3 litter = vec3(0.0);
      float cover = 0.0;
      for (int L = 0; L < 2; L++) {
        vec2 q = p / 0.3 + float(L) * vec2(0.5, 0.31);
        vec2 id = floor(q);
        vec2 fq = fract(q) - 0.5;
        vec2 h = hash22(id + float(L) * 17.3);
        float ang = h.x * 6.2832;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 d = fq - (hash22(id + 5.1) - 0.5) * 0.25;
        float along = dot(d, dir);
        float across = dot(d, vec2(-dir.y, dir.x));
        float len = 0.36 + 0.12 * h.y;
        float t = clamp(along / len * 0.5 + 0.5, 0.0, 1.0);
        float hw = 0.075 * pow(sin(3.1416 * pow(t, 0.7)), 0.8);
        float leaf = step(abs(along), len) * smoothstep(hw, hw * 0.6, abs(across));
        float kind = hash12(id + 9.7 + float(L));
        vec3 lc = kind < 0.55 ? vec3(0.66, 0.66, 0.54) : kind < 0.85 ? vec3(0.5, 0.46, 0.42) : vec3(0.4, 0.58, 0.5);
        litter = mix(litter, lc, leaf);
        cover = max(cover, leaf);
      }
      vec3 avgLit = vec3(0.57, 0.58, 0.5);
      float c = mix(0.42, cover, det);
      vec3 lc = mix(avgLit, litter / max(cover, 1e-3), det * step(0.001, cover));
      base = mix(base, base * 0.6 + lc * 0.22, c * 0.8);
      shade = mix(shade, shade * 0.8 + lc * 0.08, c * 0.85);
      // moonlight dapples where the shafts come down (long ellipses along the light)
      vec2 md = normalize(uMoonDir.xz);
      float moon = 0.0;
      for (int i = 0; i < ${SHAFTS.length}; i++) {
        vec4 s = uShafts[i];
        vec2 q = p - s.xy;
        if (dot(q, q) > s.z * s.z * 7.0) continue;
        float a = dot(q, md);
        float b = dot(q, vec2(-md.y, md.x));
        float e = length(vec2(a / (s.z * 2.1), b / s.z)) + (vnoise(q * 2.2 + s.w * 40.0) - 0.5) * 0.55;
        moon += smoothstep(1.0, 0.86, e) * (0.75 + 0.25 * sin(uTime * 0.7 + s.w * 20.0));
      }
      emis += vec3(0.42, 0.56, 0.9) * min(moon, 1.0) * (base + 0.05) * 1.3;
      // the shining stalk's pool: banded rings of its colours that spread outward
      vec2 dv = p - uStalk.xz;
      float dS = length(dv) + (vnoise(p * 1.7) - 0.5) * 0.3;
      // a painted pool: flat steps near the foot that melt away outward
      float core = exp(-dS * 1.3);
      float bandc = mix(core, floor(core * 3.0 + 0.6) / 3.0, 0.6) * smoothstep(3.6, 0.9, dS);
      // and thin ripples of its colours running outward over the litter
      float rip = fract(dS * 0.6 - uTime * 0.2);
      float ring = smoothstep(0.05, 0.0, abs(rip - 0.5) - 0.02) * exp(-dS * 0.42) * smoothstep(0.4, 1.2, dS) * smoothstep(5.5, 3.5, dS);
      float hue = stalkHue(0.9 + dS * 1.4);
      vec3 pc = hsv2rgb(vec3(hue, 0.55, 1.0));
      vec3 rc = hsv2rgb(vec3(hue, 0.8, 1.0));
      vec3 onLitter = base * 2.0 + lc * 0.1 * c + 0.05;
      emis += (pc * bandc * 2.8 + rc * ring * 1.4) * onLitter;
      emis += vec3(1.0, 0.96, 0.9) * smoothstep(0.7, 0.0, dS) * 0.6;
      // the stone lantern's warm pool: painted bands, soft at the rim
      vec3 toL = uLamps[0].xyz - vWorldPos;
      float fl = saturate(1.0 - length(toL) / uLamps[0].w);
      fl *= fl;
      float bl = floor(fl * 3.0 + 0.3) / 3.0 * smoothstep(0.0, 0.12, fl) + fl * 0.25;
      emis += uLampCols[0] * (base + lc * 0.08 * c + 0.03) * bl * 1.6;`,
  });
  const mesh = new THREE.Mesh(heightfield(), mat);
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------------------

const withUv = (g: THREE.BufferGeometry) => {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.getAttribute("uv")) n.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n.getAttribute("position").count * 2), 2));
  n.deleteAttribute("uv1");
  return n;
};

const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.rotateX(rx).rotateY(ry).rotateZ(rz);
  g.translate(x, y, z);
  return withUv(g);
};

const cyl = (rt: number, rb: number, h: number, seg: number, x: number, y: number, z: number, open = false) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y, z);
  return withUv(g);
};

/** A triangular gable board (prism) in the yz plane at x. */
function gable(x: number, y0: number, halfD: number, rise: number, t: number) {
  const s = new THREE.Shape();
  s.moveTo(-halfD, 0);
  s.lineTo(halfD, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(x - t / 2, y0, 0);
  return withUv(g);
}

function stones(): THREE.BufferGeometry {
  const rand = rng(3131);
  const parts: THREE.BufferGeometry[] = [];
  const curve = new THREE.CatmullRomCurve3(PATH.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const len = curve.getLength();
  const n = Math.round(len / 0.78);
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    const tan = curve.getTangentAt(i / n);
    const side = new THREE.Vector3(-tan.z, 0, tan.x);
    p.addScaledVector(side, (rand() - 0.5) * 0.3 + (i % 2 ? 0.12 : -0.12));
    const shape = new THREE.Shape();
    const k = 9;
    const rx = 0.27 + rand() * 0.12;
    const rz = 0.22 + rand() * 0.1;
    for (let j = 0; j < k; j++) {
      const a = (j / k) * Math.PI * 2;
      const r = 0.85 + rand() * 0.25;
      const x = Math.cos(a) * rx * r;
      const y = Math.sin(a) * rz * r;
      if (j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.04, bevelSegments: 1, steps: 1 });
    g.rotateX(-Math.PI / 2);
    g.rotateY(rand() * Math.PI);
    g.rotateX((rand() - 0.5) * 0.08);
    g.translate(p.x, groundY(p.x, p.z) - 0.06, p.z);
    parts.push(withUv(g));
  }
  // a few loose rocks at the clearing's edge
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.2 + rand() * 2.5;
    const x = STALK_X + Math.cos(a) * r;
    const z = STALK_Z + Math.sin(a) * r;
    const g = new THREE.DodecahedronGeometry(0.12 + rand() * 0.14, 0);
    g.scale(1.3, 0.6, 1);
    g.translate(x, groundY(x, z) + 0.02, z);
    parts.push(withUv(g));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

const stoneFragment = /* glsl */ `
  // moss on the upward faces, weathering streaks
  float moss = smoothstep(0.35, 0.8, n.y) * smoothstep(0.4, 0.62, fbm2(vWorldPos.xz * 3.1 + vWorldPos.y, 3));
  base = mix(base, vec3(0.32, 0.5, 0.4), moss * 0.7);
  shade = mix(shade, vec3(0.07, 0.17, 0.2), moss * 0.6);
  base *= 0.9 + 0.2 * vnoise(vWorldPos.xz * 7.0 + vWorldPos.y * 3.0);`;

export type ShrineResult = { group: THREE.Group; lanternLight: THREE.Vector3 };

export function buildShrine(): ShrineResult {
  const group = new THREE.Group();
  const stoneMat = toonMaterial({ color: 0x6f7b92, shade: 0x1b2340, ink: 20, rim: 0.7, step: 0.15, lights: 0.6, fragment: stoneFragment });
  group.add(new THREE.Mesh(stones(), stoneMat));

  // --- the hokora, in its own frame (front = +z)
  const shrine = new THREE.Group();
  const stoneParts = [box(1.15, 0.28, 0.95, 0, 0.1, 0), box(0.92, 0.2, 0.76, 0, 0.34, 0)];
  const wood = [
    box(0.8, 0.06, 0.66, 0, 0.47, 0),
    box(0.62, 0.6, 0.5, 0, 0.8, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.07, 0.66, 0.07, sx * 0.31, 0.82, sz * 0.25))),
    box(0.78, 0.07, 0.07, 0, 1.13, 0.27),
    box(0.62, 0.05, 0.22, 0, 0.47, 0.42),
    gable(0.44, 1.12, 0.33, 0.27, 0.04),
    gable(-0.44, 1.12, 0.33, 0.27, 0.04),
  ];
  const roof = [
    box(1.04, 0.05, 0.7, 0, 1.235, 0.303, Math.PI / 6),
    box(1.04, 0.05, 0.7, 0, 1.235, -0.303, -Math.PI / 6),
    box(1.1, 0.075, 0.09, 0, 1.43, 0),
    // chigi: the barge boards crossing above the ridge at each gable
    ...[-1, 1].flatMap((sx) => [
      box(0.035, 0.035, 0.34, sx * 0.53, 1.56, -0.1, Math.PI / 6 + 0.35),
      box(0.035, 0.035, 0.34, sx * 0.53, 1.56, 0.1, -Math.PI / 6 - 0.35),
    ]),
  ];
  const woodMat = toonMaterial({
    color: 0x7a665c,
    shade: 0x22192c,
    ink: 21,
    rim: 0.9,
    fragment: /* glsl */ `
      // weathered grain
      float g = vnoise(vec2(vWorldPos.y * 40.0, (vWorldPos.x + vWorldPos.z) * 3.0));
      base *= 0.86 + 0.24 * g; shade *= 0.9 + 0.15 * g;`,
  });
  const roofMat = toonMaterial({
    color: 0x5a9c8c,
    shade: 0x16333f,
    ink: 22,
    rim: 1.2,
    step: 0.1,
    fragment: /* glsl */ `
      // copper sheets gone to verdigris, lines of the seams, a fallen leaf or two
      float seam = step(0.9, fract(vWorldPos.x * 9.0 + vWorldPos.z * 0.3));
      base *= 1.0 - seam * 0.2;
      base = mix(base, base * vec3(1.15, 1.05, 0.85), smoothstep(0.5, 0.8, fbm2(vWorldPos.xz * 6.0, 2)));`,
  });
  shrine.add(new THREE.Mesh(mergeGeometries(stoneParts), stoneMat), new THREE.Mesh(mergeGeometries(wood), woodMat), new THREE.Mesh(mergeGeometries(roof), roofMat));
  // lattice doors with a small light burning inside
  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.48),
    toonMaterial({
      color: 0x6d5a52,
      shade: 0x1e1628,
      ink: 23,
      rim: 0.3,
      fragment: /* glsl */ `
        vec2 q = vUv * vec2(6.0, 7.0);
        vec2 f = abs(fract(q) - 0.5);
        float slat = step(0.36, max(f.x, f.y));
        float split = step(abs(vUv.x - 0.5), 0.015);
        float frame = step(0.46, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
        float wood = max(max(slat, split), frame);
        vec3 inside = vec3(1.0, 0.62, 0.3) * (0.9 + 0.3 * sin(uTime * 7.0) * sin(uTime * 3.1)) * smoothstep(0.9, 0.2, length(vUv - vec2(0.5, 0.35)));
        base = mix(vec3(0.03, 0.02, 0.05), base, wood);
        shade = mix(vec3(0.02, 0.015, 0.04), shade, wood);
        emis += inside * (1.0 - wood) * 1.4;`,
    }),
  );
  door.position.set(0, 0.8, 0.252);
  shrine.add(door);
  // shimenawa and shide
  const rope = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3([new THREE.Vector3(-0.4, 1.1, 0.33), new THREE.Vector3(0, 1.055, 0.34), new THREE.Vector3(0.4, 1.1, 0.33)]),
    12,
    0.02,
    6,
  );
  const shide: THREE.BufferGeometry[] = [];
  for (const sx of [-0.2, 0.2]) {
    const pts: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= 4; i++) {
      const y = 1.07 - i * 0.055;
      const x = sx + (i % 2 ? 0.025 : 0);
      pts.push(x - 0.018, y, 0.35, x + 0.018, y, 0.35);
      if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    shide.push(withUv(g));
  }
  shrine.add(new THREE.Mesh(withUv(rope), toonMaterial({ color: 0xd8c89a, shade: 0x5b5470, ink: 24, rim: 0.6 })));
  shrine.add(new THREE.Mesh(mergeGeometries(shide), toonMaterial({ color: 0xf2f5ff, shade: 0x7d89b6, ink: 25, rim: 0.8, side: THREE.DoubleSide, emissive: 0x141a26 })));

  // --- a small, old vermilion torii in front
  const torii = new THREE.Group();
  const verm = [
    cyl(0.058, 0.066, 1.86, 12, -0.62, 0.93, 0),
    cyl(0.058, 0.066, 1.86, 12, 0.62, 0.93, 0),
    box(1.5, 0.07, 0.06, 0, 1.5, 0),
    box(0.06, 0.24, 0.05, 0, 1.66, 0),
    box(1.62, 0.075, 0.13, 0, 1.82, 0),
  ];
  const black = [box(1.86, 0.08, 0.17, 0, 1.9, 0), cyl(0.08, 0.085, 0.16, 12, -0.62, 0.08, 0), cyl(0.08, 0.085, 0.16, 12, 0.62, 0.08, 0)];
  torii.add(
    new THREE.Mesh(
      mergeGeometries(verm),
      toonMaterial({
        color: 0xd24a32,
        shade: 0x55172f,
        ink: 26,
        rim: 1.1,
        fragment: /* glsl */ `base *= 0.85 + 0.25 * vnoise(vWorldPos.xy * vec2(3.0, 18.0) + vWorldPos.z);`,
      }),
    ),
    new THREE.Mesh(mergeGeometries(black), toonMaterial({ color: 0x2a2b3c, shade: 0x0a0a16, ink: 27, rim: 0.9 })),
  );
  torii.position.set(0, 0, 1.75);
  shrine.add(torii);

  const sy = groundY(SHRINE.x, SHRINE.z);
  shrine.position.set(SHRINE.x, sy - 0.04, SHRINE.z);
  shrine.rotation.y = SHRINE.rot;
  group.add(shrine);

  // --- stone lantern (kasuga-dōrō): the fire box glows through its windows
  const lantern = new THREE.Group();
  const lStone = [
    cyl(0.25, 0.3, 0.14, 6, 0, 0.07, 0),
    cyl(0.075, 0.09, 0.5, 10, 0, 0.39, 0),
    cyl(0.1, 0.1, 0.04, 10, 0, 0.4, 0),
    cyl(0.2, 0.14, 0.12, 6, 0, 0.7, 0),
    cyl(0.34, 0.34, 0.035, 6, 0, 1.04, 0),
    cyl(0.06, 0.33, 0.16, 6, 0, 1.13, 0),
    (() => {
      const g = new THREE.SphereGeometry(0.06, 10, 8);
      g.translate(0, 1.25, 0);
      return withUv(g);
    })(),
    cyl(0.0, 0.035, 0.08, 8, 0, 1.33, 0),
  ];
  lantern.add(new THREE.Mesh(mergeGeometries(lStone), stoneMat));
  const ly = groundY(LANTERN.x, LANTERN.z);
  const fireCenter = new THREE.Vector3(LANTERN.x, ly + 0.89, LANTERN.z);
  const fire = new THREE.Mesh(
    withUv(new THREE.CylinderGeometry(0.15, 0.15, 0.26, 6, 1)),
    toonMaterial({
      color: 0x8793aa,
      shade: 0x232c48,
      ink: 28,
      rim: 0.8,
      uniforms: { uCenter: { value: fireCenter } },
      fragmentHead: /* glsl */ `uniform vec3 uCenter;`,
      fragment: /* glsl */ `
        vec3 lp = vWorldPos - uCenter;
        float fa = fract(atan(lp.x, lp.z) / 1.0472);
        float win = step(0.24, fa) * step(fa, 0.76) * step(abs(lp.y), 0.075) * step(abs(n.y), 0.5);
        float flick = 0.85 + 0.15 * sin(uTime * 9.0) * sin(uTime * 5.3 + 1.0);
        base = mix(base, vec3(1.0, 0.8, 0.5), win);
        emis += vec3(1.0, 0.6, 0.26) * win * 5.0 * flick;`,
    }),
  );
  fire.position.set(0, 0.89, 0);
  lantern.add(fire);
  lantern.position.set(LANTERN.x, ly - 0.03, LANTERN.z);
  group.add(lantern);
  return { group, lanternLight: fireCenter };
}

// ---------------------------------------------------------------------------
// Cut stumps (斜め切り) by the path: pale hollow cut faces; one keeps a little
// light inside its tube, as in the tale.

export function buildStumps(): THREE.InstancedMesh {
  const g = new THREE.CylinderGeometry(1, 1.04, 1, 14, 1, false);
  g.translate(0, 0.5, 0);
  const list: [number, number, number, number, number][] = [
    // x, z, radius, height, glow
    [0.95, 1.5, 0.08, 0.46, 1],
    [1.75, 0.55, 0.065, 0.3, 0],
    [-1.95, 2.1, 0.07, 0.38, 0],
    [2.7, -1.2, 0.07, 0.55, 0],
    [-0.9, -2.7, 0.075, 0.62, 0],
  ];
  const mesh = new THREE.InstancedMesh(
    g,
    toonMaterial({
      color: 0x5f9a86,
      shade: 0x10293a,
      ink: 29,
      rim: 0.9,
      step: 0.1,
      vertexHead: /* glsl */ `attribute float aGlow; varying vec3 vLocal; varying float vGlow; varying float vTop;`,
      vertex: /* glsl */ `
        vLocal = position; vGlow = aGlow;
        vTop = normal.y > 0.5 ? 1.0 : 0.0;
        // the 40° cut, in metres: the top rises along the stump's local x
        vec3 ax = vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]);
        float rad = length(ax);
        if (position.y > 0.99) wp.y += position.x * rad * 0.84;
        if (vTop > 0.5) nrm = normalize(nrm - normalize(ax) * 0.84);`,
      fragmentHead: /* glsl */ `varying vec3 vLocal; varying float vGlow; varying float vTop;`,
      fragment: /* glsl */ `
        float r = length(vLocal.xz);
        float top = step(0.5, vTop);
        // the cut face: a pale ring of wall around the dark (or glowing) hollow
        float hole = smoothstep(0.74, 0.7, r) * top;
        base = mix(base, vec3(0.86, 0.84, 0.64), top);
        shade = mix(shade, vec3(0.36, 0.4, 0.5), top);
        base = mix(base, vec3(0.03, 0.04, 0.06), hole);
        shade = mix(shade, vec3(0.02, 0.03, 0.05), hole);
        emis += vec3(1.0, 0.86, 0.55) * hole * vGlow * (1.4 + 0.3 * sin(uTime * 1.7));
        // a node ring just under the cut
        base *= 1.0 - 0.4 * smoothstep(0.03, 0.0, abs(vLocal.y - 0.6)) * (1.0 - top);`,
    }),
    list.length,
  );
  const glow = new Float32Array(list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach(([x, z, r, h, gl], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2.1 + 0.4);
    m.compose(new THREE.Vector3(x, groundY(x, z) - 0.05, z), q, new THREE.Vector3(r, h, r));
    mesh.setMatrixAt(i, m);
    glow[i] = gl;
  });
  g.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glow, 1));
  mesh.frustumCulled = false;
  return mesh;
}
