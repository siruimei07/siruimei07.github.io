import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { Batches, eavePoint, Style } from "./batches";
import { DotKind, type Dots } from "./dots";
import { baseBox, blossomTree } from "./geom";
import { EDGE, GATE, HALL, PAGODA, PITCH, PLAZA, PRECINCT, ROAD, ROW0, ROW1, STREET, STREET_X0, STREET_Z0, visibleLot } from "./layout";

// Street level: the avenue's paving and lamp pools, the low traditional rows
// that line it (shops glowing under noren, shoji upstairs, vertical neon
// signs), paper-lantern strings, sakura in bloom, and the temple precinct —
// plaza crowd, festival stalls, a vermilion gate and torii, the main hall and
// a five-storey pagoda strung with lights.

const f1 = (x: number) => x.toFixed(1);

const RED_LANTERN = new THREE.Color(1.0, 0.3, 0.1);
const WARM = new THREE.Color(1.0, 0.66, 0.34);
const CROWD = [new THREE.Color(1.0, 0.9, 0.78), new THREE.Color(1.0, 0.78, 0.66), new THREE.Color(1.0, 0.62, 0.78), new THREE.Color(0.72, 0.9, 1.0)];
const WHITE = new THREE.Color(1.0, 0.92, 0.84);

export function buildGround(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(16000, 16000, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -3000);
  const mat = toonMaterial({
    color: 0xffffff,
    shade: 0xffffff,
    ink: 1,
    rim: 0,
    step: -1,
    fragment: /* glsl */ `
      vec2 p = vWorldPos.xz;
      float ax = abs(p.x);
      // city floor: dark asphalt
      vec3 gc = vec3(0.075, 0.05, 0.06);
      // the avenue's paving and the plaza stone
      float road = 1.0 - smoothstep(${f1(ROAD - 0.6)}, ${f1(ROAD + 0.6)}, ax);
      float plaza = step(${f1(PLAZA.x0)}, p.x) * step(p.x, ${f1(PLAZA.x1)}) * step(${f1(PLAZA.z0)}, p.y) * step(p.y, ${f1(PLAZA.z1)});
      float precinct = step(${f1(PRECINCT.x0)}, p.x) * step(p.x, ${f1(PRECINCT.x1)}) * step(${f1(PRECINCT.z0)}, p.y) * step(p.y, ${f1(PRECINCT.z1)});
      gc = mix(gc, vec3(0.19, 0.1, 0.09), max(road, precinct * 0.8));
      gc = mix(gc, vec3(0.17, 0.085, 0.075), plaza);
      // paving joints
      vec2 pj = fract(p / 3.0);
      float joint = (step(0.94, pj.x) + step(0.94, pj.y)) * smoothstep(0.4, 0.2, fwidth(p.x / 3.0));
      gc *= 1.0 - min(joint, 1.0) * 0.15 * max(road, precinct);
      base = gc;
      shade = gc * 0.7;
      // lamp pools: lanterns every 9 m along both kerbs, stronger toward the precinct
      float zc = p.y - (floor(p.y / 9.0) + 0.5) * 9.0;
      float kerb = abs(ax - ${f1(ROAD - 1.5)});
      float pool = exp(-(zc * zc + kerb * kerb) / 10.0) * road;
      float nearHero = exp(-pow((p.y + 40.0) / 700.0, 2.0));
      emis += vec3(1.0, 0.55, 0.3) * pool * (0.3 + 0.45 * nearHero);
      emis += vec3(1.0, 0.5, 0.32) * road * (0.05 + 0.08 * nearHero);
      // the plaza: warm glow pooling around the centre and the lantern stands
      vec2 pc = (p - vec2(${f1((PLAZA.x0 + PLAZA.x1) / 2)}, ${f1((PLAZA.z0 + PLAZA.z1) / 2)})) / vec2(${f1((PLAZA.x1 - PLAZA.x0) / 2)}, ${f1((PLAZA.z1 - PLAZA.z0) / 2)});
      // lantern stands and stall fronts pool light on the stone
      vec2 cell = vec2(fract(p.x / 12.0), fract(p.y / 7.5)) - 0.5;
      float pools = exp(-dot(cell, cell) * 14.0);
      emis += vec3(1.0, 0.48, 0.28) * plaza * (0.03 + 0.14 * exp(-dot(pc, pc) * 1.6) + 0.2 * pools);
      emis += vec3(1.0, 0.45, 0.3) * precinct * (1.0 - plaza) * 0.08;
      // the street grid between tower blocks: a faint warm line of lamps
      float gx = mod(ax - ${f1(STREET_X0)} + ${f1(PITCH / 2)}, ${f1(PITCH)}) - ${f1(PITCH / 2)};
      float gz = mod(p.y - ${f1(STREET_Z0)} + ${f1(PITCH / 2)}, ${f1(PITCH)}) - ${f1(PITCH / 2)};
      float sx = 1.0 - smoothstep(${f1(STREET / 2 - 1.5)}, ${f1(STREET / 2)}, abs(gx));
      float sz = 1.0 - smoothstep(${f1(STREET / 2 - 1.5)}, ${f1(STREET / 2)}, abs(gz));
      float street = max(sx, sz) * step(${f1(EDGE - 8)}, ax) * (1.0 - precinct);
      float lampZ = fract(p.y / 16.0);
      float lampX = fract(ax / 16.0);
      float lamps = sx * exp(-pow(lampZ - 0.5, 2.0) * 60.0) + sz * exp(-pow(lampX - 0.5, 2.0) * 60.0);
      emis += vec3(1.0, 0.56, 0.36) * street * (0.22 + 0.6 * lamps);
      // back alleys between the rows and the towers
      float alley = (1.0 - smoothstep(2.0, 4.0, abs(ax - ${f1((ROW1 + EDGE) / 2)}))) * (1.0 - precinct);
      emis += vec3(1.0, 0.5, 0.35) * alley * 0.25;`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  return mesh;
}

export type PrecinctResult = {
  group: THREE.Group;
  /** Sakura positions (for petals) and the plaza centre, for the lights. */
  plazaCentre: THREE.Vector3;
};

export function buildPrecinct(b: Batches, dots: Dots, density: number, eye: THREE.Vector3): PrecinctResult {
  const rand = rng(7117);
  const group = new THREE.Group();
  const plasters = [0xd8c2a4, 0xcdb498, 0xe0cfb4, 0xc4a88a, 0xd6b08e];
  const roofCols = [0x353341, 0x2e2c3a, 0x3c3846, 0x2a2834];
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];
  const signs: { x: number; y: number; z: number; w: number; h: number; col: THREE.Color; rot: number; seed: number }[] = [];
  const trees: { x: number; z: number; s: number }[] = [];
  const signCols = [0xff5fb8, 0xc070ff, 0x68e8ff, 0xfff0d8, 0xff7a4a, 0xff4f7a];

  // ---- the rows along the avenue
  for (const side of [-1, 1]) {
    let z = 620;
    let idx = 0;
    while (z > -2700) {
      const front = 9 + rand() * 9;
      const zc = z - front / 2;
      const gap = rand();
      const gap2 = rand();
      z -= front + (gap < 0.15 ? 4 + gap2 * 4 : 0.6);
      // each building has its own stream (stable when the views change)
      const rb = rng(side * 7919 + idx++ * 104729 + 17);
      if (!visibleLot(side * 32, zc)) continue;
      const xc = side * ROW0;
      // the precinct's avenue side: its gate, wall and torii instead
      if (side > 0 && zc > PRECINCT.z0 - 4 && zc < PRECINCT.z1 + 4) continue;
      const depth = 14 + rb() * (ROW1 - ROW0 - 14);
      const floors = rb() < 0.3 ? 3 : 2;
      const h = floors * 3.3 + 0.6;
      const x = xc + side * (depth / 2);
      const near = Math.hypot(x - eye.x, zc - eye.z) < 1400;
      b.box(x, 0, zc, depth, h, front - 0.4, 0, Style.Row, rb() * 1000, plasters[Math.floor(rb() * plasters.length)]);
      const rh = 3 + front * 0.12;
      b.roof(x, h - 0.2, zc, depth + 1.8, rh, front + 1.2, 0, roofCols[Math.floor(rb() * roofCols.length)], near);
      // a vertical sign sticking out over the street
      if (rb() < 0.55) {
        const sh = 3.5 + rb() * 3.5;
        signs.push({ x: side * (ROW0 - 0.8), y: 3.4 + rb() * 1.5, z: zc + (rb() - 0.5) * front * 0.6, w: 1.5, h: sh, col: new THREE.Color(signCols[Math.floor(rb() * signCols.length)]), rot: 0, seed: rb() * 100 });
      }
      // lantern string along the eave
      const n = Math.max(2, Math.round(front / 2.3));
      for (let i = 0; i < n; i++) {
        const lz = zc - front / 2 + (i + 0.5) * (front / n);
        dots.add(xc - side * 0.6, h - 0.8, lz, 0.42, RED_LANTERN, 4.2, { kind: DotKind.Sway, amp: 0.08, speed: 1.1, twinkle: 0.12 });
      }
    }
  }

  // strings of lanterns across the avenue, every ~30 m near the precinct
  for (let z = 420; z > -1600; z -= 30) {
    if (!visibleLot(0, z)) continue;
    const n = 15;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -ROW0 + t * ROW0 * 2;
      const y = 9.5 - 2.6 * 4 * t * (1 - t);
      dots.add(x, y, z, 0.48, i % 2 ? RED_LANTERN : WARM, 4.5, { kind: DotKind.Sway, amp: 0.12, speed: 1.3, twinkle: 0.1 });
    }
  }

  // sakura along both kerbs
  for (const side of [-1, 1])
    for (let z = 560; z > -2200; z -= 11 + rand() * 4) {
      const [a, c, e] = [rand(), rand(), rand()];
      if (side > 0 && z > PRECINCT.z0 && z < PRECINCT.z1) continue;
      if (!visibleLot(side * 14, z)) continue;
      trees.push({ x: side * (ROAD - 3 + a * 1.5), z: z + c * 3, s: 3.6 + e * 1.4 });
    }

  // crowd: dense in the plaza, thinner down the avenue
  const crowd = (x: number, z: number, amp: number, r: () => number = rand) => {
    const c = CROWD[r() < 0.8 ? (r() < 0.6 ? 0 : 1) : r() < 0.5 ? 2 : 3];
    dots.add(x, 0.95, z, 0.26, c, 1.0 + r() * 0.9, { kind: DotKind.Wander, amp, speed: 0.05 + r() * 0.18, twinkle: 0.25, phase: r() });
  };
  const nPlaza = Math.round(4200 * density);
  for (let i = 0; i < nPlaza; i++) {
    // cluster toward the middle and the stalls
    const u = rand();
    const v = rand();
    const x = PLAZA.x0 + 3 + (PLAZA.x1 - PLAZA.x0 - 6) * (u * 0.7 + 0.3 * rand());
    const z = PLAZA.z0 + 3 + (PLAZA.z1 - PLAZA.z0 - 6) * v;
    crowd(x, z, 0.8 + rand() * 2.2);
  }
  const nAve = Math.round(3400 * density);
  const rc = rng(31337);
  for (let i = 0; i < nAve; i++) {
    const z = 400 - Math.pow(rc(), 1.6) * 2200;
    const x = (rc() * 2 - 1) * (ROAD - 1);
    const amp = 1 + rc() * 3;
    if (!visibleLot(x, z)) continue;
    crowd(x, z, amp, rc);
  }

  // ---- the precinct
  const plazaCentre = new THREE.Vector3((PLAZA.x0 + PLAZA.x1) / 2, 0, (PLAZA.z0 + PLAZA.z1) / 2);
  const stone = 0x8c7a78;
  // corridors (kairō) around the precinct: long roofed galleries
  const corridor = (x0: number, z0: number, x1: number, z1: number) => {
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const w = alongX ? len : 7;
    const d = alongX ? 7 : len;
    b.box(cx, 0, cz, w, 4.6, d, 0, Style.Temple, rand() * 100, 0xe6dccb);
    b.roof(cx, 4.4, cz, w + 2.4, 3.2, d + 2.4, 0, pick(roofCols), true);
    // lanterns hung along the gallery eaves
    const n = Math.round(len / 3.2);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const px = alongX ? x0 + (x1 - x0) * t : cx;
      const pz = alongX ? cz : z0 + (z1 - z0) * t;
      for (const s of [-1, 1]) dots.add(px + (alongX ? 0 : s * 4.4), 3.9, pz + (alongX ? s * 4.4 : 0), 0.4, RED_LANTERN, 4, { kind: DotKind.Sway, amp: 0.06, speed: 1.2, twinkle: 0.1 });
    }
  };
  corridor(PRECINCT.x0 + 70, PRECINCT.z0 + 4, PRECINCT.x1 - 4, PRECINCT.z0 + 4);
  corridor(PRECINCT.x1 - 4, PRECINCT.z0 + 4, PRECINCT.x1 - 4, PRECINCT.z1 - 4);
  corridor(PRECINCT.x0 + 60, PRECINCT.z1 - 4, PRECINCT.x1 - 4, PRECINCT.z1 - 4);
  // the avenue side: a low wall either side of the gate
  b.box(PRECINCT.x0 + 1.5, 0, (PRECINCT.z0 + GATE.z - 10) / 2, 3, 3.2, GATE.z - 10 - PRECINCT.z0, 0, Style.Temple, 3, 0xe6dccb);
  b.box(PRECINCT.x0 + 1.5, 0, (PRECINCT.z1 + GATE.z + 10) / 2, 3, 3.2, PRECINCT.z1 - GATE.z - 10, 0, Style.Temple, 4, 0xe6dccb);

  // the gate (rōmon): two storeys, vermilion
  b.box(GATE.x + 4, 0, GATE.z, 10, 9, 18, 0, Style.Temple, 11, 0xd8c8b8);
  b.roof(GATE.x + 4, 8.6, GATE.z, 14, 3.5, 23, 0, 0x2e2a36, true);
  b.box(GATE.x + 4, 10.5, GATE.z, 8, 5.5, 14, 0, Style.Drum, 12, 0x3a2a2a);
  b.roof(GATE.x + 4, 15.6, GATE.z, 13, 6.5, 21, 0, 0x2e2a36, true);
  // a great torii on the avenue, facing the gate
  const tx = GATE.x - 8;
  const tz = GATE.z;
  const vermilion = 0xd8432a;
  for (const s of [-1, 1]) b.box(tx, 0, tz + s * 8.5, 1.6, 20, 1.6, 0, Style.Plain, 0, vermilion);
  b.box(tx, 17.2, tz, 1.4, 1.2, 20.5, 0, Style.Plain, 0, vermilion);
  b.box(tx, 19.6, tz, 2.2, 1.3, 24, 0, Style.Plain, 0, 0x2a1a1e);
  b.box(tx, 18.4, tz, 1.8, 1.2, 22.5, 0, Style.Plain, 0, vermilion);

  // main hall on its stone platform, two-tier roof
  b.box(HALL.x, 0, HALL.z, 50, 1.8, 70, 0, Style.Plain, 0, stone);
  b.box(HALL.x, 1.8, HALL.z, 36, 13, 56, 0, Style.Temple, 21, 0xe4d8c4);
  b.roof(HALL.x, 10.5, HALL.z, 48, 4.5, 68, 0, 0x34303e, true);
  b.box(HALL.x, 13.5, HALL.z, 30, 7, 48, 0, Style.Temple, 22, 0xe4d8c4);
  b.roof(HALL.x, 20, HALL.z, 44, 17, 64, 0, 0x34303e, true);
  // red LED strings trace the hall's lower eave
  for (const r of [{ x: HALL.x, y: 10.5, z: HALL.z, w: 68, h: 4.5, d: 48, rot: Math.PI / 2 }]) {
    for (let side = 0; side < 4; side++) {
      const len = side % 2 === 0 ? r.w : r.d;
      const n = Math.round(len / 1.4);
      for (let i = 0; i < n; i++) {
        const p = eavePoint(r, side, (i + 0.5) / n);
        dots.add(p.x, p.y + 0.2, p.z, 0.36, RED_LANTERN, 5, { twinkle: 0.15, speed: 0.7 });
      }
    }
  }

  // five-storey pagoda
  {
    let y = 0;
    b.box(PAGODA.x, 0, PAGODA.z, 16, 1.6, 16, 0, Style.Plain, 0, stone);
    y = 1.6;
    for (let i = 0; i < 5; i++) {
      const bw = 10.5 - i * 0.9;
      const bh = i === 0 ? 7 : 5.2;
      b.box(PAGODA.x, y, PAGODA.z, bw, bh, bw, 0, Style.Drum, 31 + i, 0x3a2a2a);
      y += bh;
      const rw = bw * 2.05;
      const rh = 3.4 - i * 0.15;
      b.roof(PAGODA.x, y - 0.6, PAGODA.z, rw, rh, rw, 0, 0x2c2834, true);
      // festival lights along each eave
      const r = { x: PAGODA.x, y: y - 0.6, z: PAGODA.z, w: rw, h: rh, d: rw, rot: 0 };
      for (let side = 0; side < 4; side++) {
        const n = Math.round(rw / 1.2);
        for (let k = 0; k < n; k++) {
          const p = eavePoint(r, side, (k + 0.5) / n);
          dots.add(p.x, p.y + 0.15, p.z, 0.34, i % 2 ? WARM : RED_LANTERN, 5, { twinkle: 0.2, speed: 0.8 });
        }
      }
      y += rh * 0.45;
    }
    // sōrin spire with its rings and a glowing jewel
    b.box(PAGODA.x, y - 1, PAGODA.z, 0.8, 16, 0.8, 0, Style.Plain, 0, 0x6a5040);
    for (let k = 0; k < 9; k++) dots.add(PAGODA.x, y + 2 + k * 1.3, PAGODA.z, 0.5, WARM, 3.5, { twinkle: 0.2 });
    dots.add(PAGODA.x, y + 15.6, PAGODA.z, 1.2, WHITE, 9, { twinkle: 0.15, speed: 0.4 });
  }

  // festival stalls (yatai) in rows across the plaza, and stone lanterns
  for (let row = 0; row < 3; row++) {
    const x = PLAZA.x0 + 26 + row * 24;
    for (let z = PLAZA.z0 + 12; z < PLAZA.z1 - 10; z += 7.5) {
      if (Math.abs(z - GATE.z) < 12) continue;
      if (rand() < 0.12) continue;
      const w = 4.2;
      const d = 5.6 + rand() * 1.5;
      b.box(x, 0, z, w, 2.6, d, 0, Style.Glow, rand() * 100, 0xf0d8b0);
      b.roof(x, 2.5, z, w + 1.2, 1.4, d + 0.8, 0, rand() < 0.5 ? 0x9a2a22 : 0x2c3a6a, true);
      dots.add(x - w / 2 - 0.4, 2.4, z - d / 2, 0.36, RED_LANTERN, 4.5, { kind: DotKind.Sway, amp: 0.05, speed: 1.5 });
      dots.add(x - w / 2 - 0.4, 2.4, z + d / 2, 0.36, RED_LANTERN, 4.5, { kind: DotKind.Sway, amp: 0.05, speed: 1.5 });
    }
  }
  for (let z = PLAZA.z0 + 4; z < PLAZA.z1; z += 8) {
    if (Math.abs(z - GATE.z) < 10) continue;
    for (const x of [PLAZA.x0 + 5, PLAZA.x1 - 2]) {
      b.box(x, 0, z, 1.2, 2.2, 1.2, 0, Style.Glow, 0, 0xb8a898);
      dots.add(x, 2.6, z, 0.7, WARM, 4.5, { twinkle: 0.2, speed: 0.9 });
    }
  }
  // sakura inside the precinct: around the pagoda and along the galleries
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const r = 16 + rand() * 18;
    trees.push({ x: PAGODA.x + Math.cos(a) * r, z: PAGODA.z + Math.sin(a) * r * 0.8, s: 4 + rand() * 2 });
  }
  for (let i = 0; i < 18; i++) trees.push({ x: PLAZA.x1 + 4 + rand() * 10, z: PLAZA.z0 + rand() * (PLAZA.z1 - PLAZA.z0), s: 3.5 + rand() * 1.8 });
  for (let i = 0; i < 12; i++) trees.push({ x: PLAZA.x0 + 8 + rand() * 70, z: PRECINCT.z0 + 12 + rand() * 12, s: 3.5 + rand() * 1.8 });

  // ---- sakura mesh
  {
    const geo = blossomTree(12345);
    const mat = toonMaterial({
      color: 0xffb3d4,
      shade: 0xb4507e,
      ink: 7,
      rim: 0.9,
      step: 0.0,
      fragment: /* glsl */ `
        // blossom glows from within, strongest on the undersides lit by the lanterns
        float under = saturate(0.6 - n.y * 0.6);
        float speck = step(0.62, hash13(floor(vWorldPos * 1.6)));
        emis += vec3(1.0, 0.42, 0.66) * (0.16 + 0.34 * under) * (0.8 + 0.4 * speck);
        base *= 0.9 + 0.2 * speck;`,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, trees.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.s, t.s * (0.9 + rand() * 0.2), t.s));
      mesh.setMatrixAt(i, m);
      col.setHSL(0.93 + rand() * 0.05, 0.9, 0.82 + rand() * 0.08);
      mesh.setColorAt(i, col);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
    // petals drifting down around the trees near the precinct
    const nPetals = Math.round(900 * density);
    const pink = new THREE.Color(1.0, 0.62, 0.8);
    for (let i = 0; i < nPetals; i++) {
      const t = trees[Math.floor(rand() * trees.length)];
      if (Math.abs(t.z + 40) > 500) continue;
      dots.add(t.x + (rand() - 0.5) * 8, 12 + rand() * 8, t.z + (rand() - 0.5) * 8, 0.2, pink, 1.8, { kind: DotKind.Drift, amp: 14, speed: 0.6 + rand() * 0.6 });
    }
  }

  // ---- neon signs: boards sticking out from the rows, glyph columns
  {
    const mat = toonMaterial({
      color: 0x1a1420,
      shade: 0x0a0810,
      ink: 8,
      rim: 0.3,
      lights: 0,
      fog: 0.6,
      vertexHead: /* glsl */ `attribute vec2 aSign; varying vec3 vL; varying vec3 vN0; varying vec3 vS; flat varying float vSd; attribute vec3 aSize;`,
      vertex: /* glsl */ `vL = position * aSize; vN0 = normal; vS = aSize; vSd = aSign.x;`,
      fragmentHead: /* glsl */ `varying vec3 vL; varying vec3 vN0; varying vec3 vS; flat varying float vSd;`,
      fragment: /* glsl */ `
        vec3 glow = vTint;
        base = vec3(0.06, 0.05, 0.08);
        shade = base;
        if (abs(vN0.z) > 0.5 || abs(vN0.x) > 0.5) {
          // board face: a frame and a column of glyphs made of strokes
          vec2 q = vec2((abs(vN0.z) > 0.5 ? vL.x : vL.z) / (abs(vN0.z) > 0.5 ? vS.x : vS.z) + 0.5, vL.y / vS.y);
          float px = fwidth(q.y * vS.y);
          float frame = step(q.x, 0.08) + step(0.92, q.x) + step(q.y, 0.04) + step(0.96, q.y);
          float cells = max(1.0, floor(vS.y / 1.25));
          float cy = q.y * cells;
          float ci = floor(cy);
          vec2 g = vec2((q.x - 0.2) / 0.6, fract(cy) * 1.2 - 0.1);
          vec2 gi = floor(g * 3.0);
          float h = hash13(vec3(gi + ci * 7.0, vSd));
          vec2 gf = fract(g * 3.0);
          float strokeH = step(0.5, h) * step(0.38, gf.y) * step(gf.y, 0.62);
          float strokeV = step(0.72, h) * step(0.38, gf.x) * step(gf.x, 0.62);
          float inG = step(0.0, g.x) * step(g.x, 1.0) * step(0.0, g.y) * step(g.y, 1.0);
          float glyph = max(strokeH, strokeV) * inG;
          float detail = smoothstep(0.35, 0.12, px);
          float lum = mix(0.55, max(min(frame, 1.0), glyph), detail);
          float flick = 0.85 + 0.15 * step(0.1, fract(uTime * 0.37 + vSd * 0.13));
          flick *= step(0.04, fract(uTime * (0.9 + 0.2 * fract(vSd)) + vSd)) * 0.2 + 0.8;
          emis += glow * lum * 3.4 * flick + glow * 0.25;
        }`,
    });
    const mesh = new THREE.InstancedMesh(baseBox(), mat, signs.length);
    const size = new Float32Array(signs.length * 3);
    const sd = new Float32Array(signs.length * 2);
    const m = new THREE.Matrix4();
    signs.forEach((s, i) => {
      // board sticks out perpendicular to the facade: its faces look up and down the avenue
      m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.w, s.h, 0.35));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, s.col);
      size.set([s.w, s.h, 0.35], i * 3);
      sd.set([s.seed, 0], i * 2);
    });
    mesh.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
    mesh.geometry.setAttribute("aSign", new THREE.InstancedBufferAttribute(sd, 2));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return { group, plazaCentre };
}
