import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { WARM, type CityMap } from "./bridge";
import { box, cyl, hipRoof, merge, prep } from "./geo";
import { DECK_Y, EYE, GATE_Z, hillY, MESA, ridgeZ, SHORE_Z, slopeS } from "./layout";

// Tsukuyomi on its hill: thousands of lit windows climbing the slope — warm
// oranges and pinks at the heart behind the gate, cool blues, violets and
// greens toward the flanks — temple halls and pagodas with glowing eaves, a
// few modern towers, sakura glowing pink at the foot of the city, the dark
// shrine forest along the shore, and the table mountain with its small
// shrine above everything. Also bakes an angular light map of it all that
// the water and the wet deck reflect.

const D2R = Math.PI / 180;
const smooth = THREE.MathUtils.smoothstep;

type Bld = { x: number; y0: number; y1: number; z: number; w: number; d: number; rot: number; style: number; win: THREE.Color; lit: number };

const WARM_PAL = [0xffb347, 0xff8a3a, 0xffd08a, 0xff9f6a, 0xffc070, 0xff7a5a, 0xffa0c0, 0xffe0a0];
const COOL_PAL = [0x6fa8ff, 0x9fc8ff, 0x7fe8ff, 0xb08cff, 0xd68cff, 0x7dffc0, 0xa8ff8f, 0xff8fd0, 0x8cb4ff, 0xfff0c0, 0xffb347];

/** Warmth of the city at x: the heart behind the gate burns orange. */
const warmth = (x: number, z: number) => Math.exp(-Math.pow(x / 340, 2)) * (1 - 0.4 * slopeS(x, z));

export type CityResult = { group: THREE.Group; map: CityMap };

export function buildCity(density: number): CityResult {
  const group = new THREE.Group();
  const rand = rng(20261001);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  // ---------------------------------------------------------------- buildings
  const blds: Bld[] = [];
  const pick = (pal: number[]) => new THREE.Color(pal[Math.floor(rand() * pal.length)]);
  for (let z = -292; z > -1320; ) {
    const s0 = slopeS(0, z);
    const rowStep = 19 + 10 * s0;
    for (let x = -2400; x <= 1500; ) {
      const ax0 = Math.abs(x);
      const step = 19 + 16 * smooth(ax0, 500, 1900);
      x += step * (0.8 + rand() * 0.4);
      const jx = x;
      const jz = z + (rand() - 0.5) * rowStep * 0.6;
      if (jz < ridgeZ(jx) + 25) continue;
      if (Math.hypot((jx - MESA.x) * 0.95, (jz - MESA.z) * 1.3) < MESA.r1 + 30) continue;
      const ax = Math.abs(jx);
      const s = slopeS(jx, jz);
      const keep = (0.9 - 0.3 * Math.min(1, ax / 2200) - 0.3 * s * s) * (0.55 + 0.45 * density);
      if (rand() > keep) continue;
      const wc = warmth(jx, jz);
      let style = rand() < 0.16 + 0.6 * wc ? 1 : 0;
      if (style === 0 && ax > 300 && rand() < 0.03) style = 2;
      const big = 1 + 0.5 * smooth(ax, 600, 2000);
      const w = (style === 1 ? 14 + rand() * 16 : 10 + rand() * 14) * big;
      const d = (style === 1 ? 12 + rand() * 10 : 9 + rand() * 12) * big;
      let h = style === 1 ? 9 + rand() * 12 : 10 + rand() * 24 + (rand() < 0.12 ? 22 : 0);
      if (style === 2) h = 70 + rand() * 80;
      const yc = hillY(jx, jz);
      const ylo = Math.min(hillY(jx - w / 2, jz + d / 2), hillY(jx + w / 2, jz + d / 2), yc) - 4;
      const warm = rand() < 0.25 + 0.7 * wc;
      const win = pick(warm ? WARM_PAL : COOL_PAL).multiplyScalar(style === 1 ? 2.6 : 2.2 + rand() * 1.6);
      const lit = style === 1 ? 0.65 + rand() * 0.3 : 0.28 + rand() * 0.42;
      blds.push({ x: jx, y0: ylo, y1: yc + h, z: jz, w, d, rot: (rand() - 0.5) * 0.3, style, win, lit });
    }
    z -= rowStep;
  }
  // the palace district right behind the gate: big warm halls
  for (let i = 0; i < 28; i++) {
    const x = (rand() - 0.5) * 440;
    const z = -305 - rand() * 330;
    const yc = hillY(x, z);
    const w = 26 + rand() * 24;
    const d = 16 + rand() * 10;
    blds.push({ x, y0: yc - 6, y1: yc + 12 + rand() * 12, z, w, d, rot: (rand() - 0.5) * 0.1, style: 1, win: pick(WARM_PAL).multiplyScalar(2.8), lit: 0.9 });
  }
  // near first, so the depth test rejects most of what hides behind
  blds.sort((a, b) => b.z - a.z);

  const n = blds.length;
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  bodyGeo.translate(0, 0.5, 0);
  const bodies = new THREE.InstancedMesh(bodyGeo, buildingMaterial(), n);
  const sizes = new Float32Array(n * 3);
  const wins = new Float32Array(n * 4);
  const styles = new Float32Array(n * 2);
  const wall = new THREE.Color();
  blds.forEach((b, i) => {
    q.setFromAxisAngle(up, b.rot);
    const H = b.y1 - b.y0;
    m.compose(new THREE.Vector3(b.x, b.y0, b.z), q, new THREE.Vector3(b.w, H, b.d));
    bodies.setMatrixAt(i, m);
    sizes.set([b.w, H, b.d], i * 3);
    wins.set([b.win.r, b.win.g, b.win.b, b.lit], i * 4);
    styles.set([b.style, rand() * 100], i * 2);
    wall.setHSL(0.62 + rand() * 0.1, 0.3, 0.38 + rand() * 0.2);
    bodies.setColorAt(i, wall);
  });
  bodies.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  bodies.geometry.setAttribute("aWin", new THREE.InstancedBufferAttribute(wins, 4));
  bodies.geometry.setAttribute("aStyle", new THREE.InstancedBufferAttribute(styles, 2));
  bodies.frustumCulled = false;
  bodies.name = "bodies";
  bodies.renderOrder = 1;

  // ---------------------------------------------------------------- temple roofs
  const unitRoof = hipRoof(1.6, 1, 1, { lift: 0.16, pow: 1.7, segU: 5, segV: 3, fascia: 0.09 });
  unitRoof.scale(1 / 1.6, 1, 1);
  const roofList: { x: number; y: number; z: number; w: number; h: number; d: number; rot: number; glow: number }[] = [];
  for (const b of blds) {
    if (b.style !== 1) continue;
    const H = b.y1 - b.y0;
    const rh = Math.min(b.w, b.d) * (0.34 + rand() * 0.1);
    const glow = Math.min(1, b.win.r / 2.4);
    roofList.push({ x: b.x, y: b.y1 - 0.2, z: b.z, w: b.w * 1.3, h: rh, d: b.d * 1.38, rot: b.rot, glow });
    if (H > 20 && rand() < 0.75) roofList.push({ x: b.x, y: b.y1 - 0.2 - (H - 6) * 0.45, z: b.z, w: b.w * 1.42, h: rh * 0.42, d: b.d * 1.5, rot: b.rot, glow });
  }
  const roofs = new THREE.InstancedMesh(unitRoof, roofMaterial(), roofList.length);
  const glowA = new Float32Array(roofList.length);
  roofList.forEach((r, i) => {
    q.setFromAxisAngle(up, r.rot);
    m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.w, r.h, r.d));
    roofs.setMatrixAt(i, m);
    glowA[i] = r.glow;
  });
  roofs.geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(glowA, 1));
  roofs.frustumCulled = false;
  roofs.name = "roofs";
  roofs.renderOrder = 1;

  // ---------------------------------------------------------------- pagodas
  const pagodaSpots: [number, number, number][] = [
    // x, z, height
    [-150, -430, 54],
    [235, -560, 46],
    [-560, -690, 48],
    [610, -820, 40],
    [-1080, -880, 52],
    [990, -700, 40],
    [-330, -930, 38],
    [MESA.x + 34, MESA.z + 78, 30],
  ];
  const pag = pagodaGeometry();
  const pagWalls = new THREE.InstancedMesh(pag.walls, pagodaWallMaterial(), pagodaSpots.length);
  const pagRoofs = new THREE.InstancedMesh(pag.roofs, roofMaterial(true), pagodaSpots.length);
  pagWalls.name = "pagodas";
  pagRoofs.name = "pagodas";
  roofs.name = "roofs";
  pagodaSpots.forEach(([x, z, h], i) => {
    const onMesa = i === pagodaSpots.length - 1;
    const y = onMesa ? MESA.top - 3 : hillY(x, z) - 1;
    m.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(h / 30, h / 30, h / 30));
    pagWalls.setMatrixAt(i, m);
    pagRoofs.setMatrixAt(i, m);
  });
  pagRoofs.geometry.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array(pagodaSpots.length).fill(0.8), 1));
  for (const pm of [pagWalls, pagRoofs]) {
    pm.frustumCulled = false;
    pm.renderOrder = 1;
  }

  // the shrine hall on the mesa
  const hallY = MESA.top - 2;
  const hall = new THREE.Mesh(
    merge([
      prep(box(34, 9, 16, MESA.x - 30, hallY + 4.5, MESA.z + 70), 0x2a3150),
      prep(
        (() => {
          const r = hipRoof(44, 24, 9, { lift: 2.2, pow: 1.7, segU: 8, segV: 4, fascia: 0.9 });
          r.translate(MESA.x - 30, hallY + 9, MESA.z + 70);
          return r;
        })(),
        0x1a2038,
      ),
    ]),
    toonMaterial({
      color: 0xffffff,
      shade: 0x303450,
      ink: 22,
      rim: 1.0,
      vertexColors: true,
      side: THREE.DoubleSide,
      lights: 0,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol;`,
      fragment: /* glsl */ `
        float dots = step(0.7, fract(vWorldPos.x / 3.0)) * step(0.4, fract((vWorldPos.y - ${(hallY + 2).toFixed(1)}) / 3.0)) * step(vWorldPos.y, ${(hallY + 7).toFixed(1)}) * step(0.5, n.z);
        emis += uLanternCol * dots * 2.5;`,
    }),
  );
  hall.frustumCulled = false;
  hall.renderOrder = 1;

  // ---------------------------------------------------------------- sakura
  const sak: { x: number; y: number; z: number; r: number; h: number }[] = [];
  const nSak = Math.round(230 * (0.6 + 0.4 * density));
  for (let i = 0; i < nSak; i++) {
    let x: number;
    let z: number;
    if (rand() < 0.5) {
      // in the shore forest, clustered left and right of the gate
      const side = rand() < 0.5 ? -1 : 1;
      x = side * (90 + Math.pow(rand(), 1.3) * 1100) + (rand() - 0.5) * 40;
      z = -150 - rand() * 130;
    } else {
      // at the foot of the city
      x = (rand() - 0.5) * 2400 - 250;
      z = -280 - rand() * 170;
    }
    const r = 4.5 + rand() * 6;
    sak.push({ x, y: hillY(x, z) + r * 0.7 + 1.5, z, r, h: r * (0.62 + rand() * 0.2) });
  }
  const sakura = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), sakuraMaterial(), sak.length);
  sak.forEach((s, i) => {
    q.setFromAxisAngle(up, rand() * 6.28);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.r, s.h, s.r * (0.8 + rand() * 0.3)));
    sakura.setMatrixAt(i, m);
  });
  sakura.frustumCulled = false;
  sakura.name = "sakura";
  sakura.renderOrder = 0;

  const forest = buildForest(rand, density);
  forest.name = "forest";
  const terrain = buildTerrain();
  terrain.name = "terrain";
  terrain.renderOrder = 5;
  // draw order inside the city: near forest first, the big terrain last
  group.add(forest, sakura, bodies, roofs, pagWalls, pagRoofs, hall, terrain);

  // ---------------------------------------------------------------- light map
  const map = bakeLightMap(blds, sak, pagodaSpots);
  return { group, map };
}

// ---------------------------------------------------------------- terrain

function buildTerrain(): THREE.Mesh {
  const NX = 220;
  const NZ = 150;
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const u = (i / NX) * 2 - 1;
    xs.push(Math.sign(u) * 3200 * Math.pow(Math.abs(u), 1.5));
  }
  for (let j = 0; j <= NZ; j++) zs.push(SHORE_Z - 2600 * Math.pow(j / NZ, 1.4));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = xs[i];
      const z = zs[j];
      let y = hillY(x, z);
      // the plaza before the gate is flat stone
      const plaza = (1 - smooth(Math.abs(x), 60, 90)) * (1 - smooth(-z, 175, 200));
      y = THREE.MathUtils.lerp(y, DECK_Y - 0.02, plaza);
      pos.push(x, y, z);
    }
  }
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
  const mesh = new THREE.Mesh(
    g,
    toonMaterial({
      color: 0x18223f,
      shade: 0x080d20,
      ink: 21,
      rim: 0.8,
      step: 0.25,
      lights: 1,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol;`,
      fragment: /* glsl */ `
        vec3 P = vWorldPos;
        float plaza = step(abs(P.x), 62.0) * step(-176.0, P.z);
        if (plaza > 0.5) {
          // paving stones, pale and wet
          vec2 g = P.xz / vec2(1.4, 0.9);
          vec2 fr = abs(fract(g) - 0.5);
          float joint = step(0.46, max(fr.x, fr.y)) * (1.0 - smoothstep(0.2, 0.6, fwidth(g.x)));
          base = mix(vec3(0.2, 0.2, 0.28), vec3(0.08, 0.08, 0.13), joint);
          shade = base * 0.5;
          emis += uLanternCol * 0.06 * exp(-abs(P.x) * 0.08) * exp(-abs(P.z + 150.0) * 0.03);
        } else {
          float s = saturate((-272.0 - P.z) / 900.0);
          // the forest floor is darkest; the city ground glows faintly at its heart
          base *= mix(0.45, 1.0, s);
          shade *= mix(0.6, 1.0, s);
          float heart = exp(-P.x * P.x / 160000.0) * (1.0 - s) * step(P.z, -280.0);
          emis += uLanternCol * heart * 0.04;
          // scattered street lights between the buildings
          vec2 cell = floor(P.xz / 9.0);
          float hh = hash12(cell);
          float lamp = step(0.93, hh) * step(P.z, -285.0) * step(P.y, ${(DECK_Y + 260).toFixed(1)});
          vec2 fr = fract(P.xz / 9.0) - 0.5;
          float dotm = 1.0 - smoothstep(0.08, 0.16, length(fr));
          float px = fwidth(P.x / 9.0);
          dotm = mix(dotm, 0.03, smoothstep(0.3, 0.8, px));
          emis += mix(vec3(1.0, 0.7, 0.4), vec3(0.6, 0.8, 1.0), step(0.5, fract(hh * 13.0))) * lamp * dotm * 1.4;
        }`,
    }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

// ---------------------------------------------------------------- materials

function buildingMaterial(): THREE.ShaderMaterial {
  return toonMaterial({
    color: 0x151c3a,
    shade: 0x070b1c,
    ink: 0,
    rim: 0,
    step: 0.2,
    lights: 0,
    vertexHead: /* glsl */ `
      attribute vec3 aSize;
      attribute vec4 aWin;
      attribute vec2 aStyle;
      varying vec3 vLocal;
      varying vec3 vLocalN;
      flat varying vec3 vSize;
      flat varying vec4 vWin;
      flat varying vec2 vStyle;`,
    vertex: /* glsl */ `
      vLocal = position * aSize;
      vLocalN = normal;
      vSize = aSize;
      vWin = aWin;
      vStyle = aStyle;`,
    fragmentHead: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vLocalN;
      flat varying vec3 vSize;
      flat varying vec4 vWin;
      flat varying vec2 vStyle;`,
    fragment: /* glsl */ `
      vec3 ln = floor(vLocalN + 0.5);
      float seed = vStyle.y;
      if (abs(ln.y) < 0.5) {
        bool sideX = abs(ln.x) > 0.5;
        float faceW = sideX ? vSize.z : vSize.x;
        float u = (sideX ? vLocal.z : vLocal.x) + faceW * 0.5;
        float v = vSize.y - vLocal.y;             // metres down from the roof line
        float jap = step(0.5, vStyle.x) * step(vStyle.x, 1.5);
        float tower = step(1.5, vStyle.x);
        vec2 f0 = vec2(u / mix(2.7, 6.0, jap), v / mix(3.3, 4.4, jap));
        // window "mip": far away, coarser cells each carry one small, crisp dot
        float px = max(fwidth(f0.x), fwidth(f0.y));
        float lod = max(0.0, ceil(log2(px * 4.5)));
        float sc = exp2(lod);
        vec2 f = f0 / sc;
        vec2 ci = floor(f);
        vec2 fr = fract(f);
        float cpx = sc / max(px, 1e-4);           // pixels per cell
        float h = hash13(vec3(ci, seed + lod * 13.0 + (ln.x + ln.z * 3.0) * 17.0));
        float lit = step(1.0 - vWin.a, h);
        // a few windows switch on and off slowly
        lit = abs(lit - step(0.978, hash13(vec3(ci + 7.0, seed + floor(uTime * 0.15 + h * 7.0)))));
        vec3 wc = vWin.rgb * (0.65 + 0.7 * hash11(h * 31.0));
        wc = mix(wc, vWin.rgb.gbr, step(0.86, hash11(h * 7.7)) * 0.7);
        float win;
        if (lod < 0.5) {
          if (jap > 0.5) win = step(0.3, fr.y) * step(fr.y, 0.74) * step(0.12, fract(u / 0.9));
          else win = step(0.2, fr.x) * step(fr.x, 0.8) * step(0.3, fr.y) * step(fr.y, 0.74);
        } else {
          vec2 dpx = abs(fr - 0.5) * cpx;
          vec2 hs = jap > 0.5 ? vec2(1.7, 0.75) : vec2(0.8, 0.8);
          win = (1.0 - smoothstep(hs.x - 0.5, hs.x + 0.5, dpx.x)) * (1.0 - smoothstep(hs.y - 0.5, hs.y + 0.5, dpx.y));
        }
        win *= step(1.2, v);                        // not on the parapet
        emis += wc * win * lit * (1.0 + 0.2 * lod);
        base = mix(base, base * 0.4, win * 0.6);
        shade = mix(shade, shade * 0.5, win * 0.6);
        if (tower > 0.5) {
          // LED edges and crown rings
          float edge = 1.0 - smoothstep(0.35, 0.9, min(u, faceW - u));
          float ring = step(0.92, fract(vLocal.y / 24.0));
          emis += vWin.rgb * (edge * 1.2 + ring * 0.6);
          emis += vec3(1.0, 0.12, 0.08) * step(v, 1.2) * step(0.5, fract(uTime * 0.5 + seed)) * 6.0;
        }
      } else {
        base *= 0.6;
        shade *= 0.6;
      }`,
  });
}

function roofMaterial(pagoda = false): THREE.ShaderMaterial {
  return toonMaterial({
    color: 0x283456,
    shade: 0x080b1c,
    ink: pagoda ? 18 : 17,
    rim: 0.7,
    step: 0.3,
    lights: 0,
    side: THREE.DoubleSide,
    vertexHead: /* glsl */ `attribute float aGlow; flat varying float vGlow;`,
    vertex: /* glsl */ `vGlow = aGlow;`,
    uniforms: { uLanternCol: { value: WARM } },
    fragmentHead: /* glsl */ `flat varying float vGlow; uniform vec3 uLanternCol;`,
    fragment: /* glsl */ `
      // the undersides glow with the light of the rooms and lanterns below
      if (!gl_FrontFacing) {
        base = vec3(0.3, 0.13, 0.08);
        shade = vec3(0.13, 0.05, 0.06);
        emis += uLanternCol * (0.3 + 0.5 * vGlow);
      }
      // the eave edge (fascia) catches the glow too
      emis += uLanternCol * step(vUv.y, -0.3) * (0.4 + 0.9 * vGlow);`,
  });
}

function pagodaWallMaterial(): THREE.ShaderMaterial {
  return toonMaterial({
    color: 0xb84434,
    shade: 0x341424,
    ink: 18,
    rim: 0.6,
    step: 0.2,
    lights: 0,
    uniforms: { uLanternCol: { value: WARM } },
    fragmentHead: /* glsl */ `uniform vec3 uLanternCol;`,
    fragment: /* glsl */ `
      // lit openings on every storey
      float yy = fract(vWorldPos.y / 6.0);
      float band = step(0.25, yy) * step(yy, 0.62) * step(0.35, fract((vWorldPos.x + vWorldPos.z) / 2.2));
      emis += uLanternCol * band * 1.8 * step(abs(n.y), 0.5);`,
  });
}

function sakuraMaterial(): THREE.ShaderMaterial {
  return toonMaterial({
    color: 0xf0b4d4,
    shade: 0x6a3c7a,
    ink: 19,
    rim: 0.9,
    step: -0.1,
    soft: 0.1,
    lights: 0,
    vertex: /* glsl */ `
      // lumpy, cloud-like crowns
      vec3 c = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float lump = vnoise(wp.xz * 0.45 + wp.y * 0.4) * 0.5 + vnoise(wp.xz * 1.2 - wp.y) * 0.25;
      wp.xyz = c + (wp.xyz - c) * (0.7 + lump);`,
    fragment: /* glsl */ `
      float fl = vnoise(vWorldPos.xz * 1.3 + vWorldPos.y * 0.9);
      float spark = step(0.8, vnoise(vWorldPos.xz * 3.7 + vWorldPos.y * 2.9 + floor(uTime * 0.7)));
      vec3 pink = vec3(1.0, 0.5, 0.74);
      emis += pink * (0.3 + 0.45 * fl) + vec3(1.0, 0.86, 0.95) * spark * 1.1;
      base *= 0.8 + 0.35 * fl;`,
  });
}

// ---------------------------------------------------------------- forest

function buildForest(rand: () => number, density: number): THREE.Group {
  const g = new THREE.Group();
  // a ragged conifer: stacked, skewed cones, height 1
  const layers: THREE.BufferGeometry[] = [];
  const lr = rng(77);
  for (let i = 0; i < 5; i++) {
    const r = 0.44 - i * 0.075 + (lr() - 0.5) * 0.06;
    const h = 0.34 - i * 0.02;
    const c = new THREE.ConeGeometry(r, h, 7, 1, false);
    c.rotateY(i * 1.1);
    c.translate((lr() - 0.5) * 0.08, 0.16 + i * 0.16 + h / 2, (lr() - 0.5) * 0.08);
    layers.push(prep(c));
  }
  layers.push(prep(cyl(0.03, 0.045, 0.3, 5, 0, 0, 0)));
  const conifer = merge(layers);
  const blob = prep(new THREE.IcosahedronGeometry(0.5, 1).translate(0, 0.6, 0));
  const mat = toonMaterial({
    color: 0x131d36,
    shade: 0x050814,
    ink: 20,
    rim: 0.85,
    step: 0.15,
    lights: 1,
    fog: 0.7,
    vertex: /* glsl */ `
      vec3 c = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
      float lump = vnoise(wp.xz * 0.6 + wp.y * 0.5) - 0.5;
      wp.xz += (wp.xz - c.xz) * lump * 0.5;`,
  });
  const nT = Math.round(2600 * (0.6 + 0.4 * density));
  const cones = new THREE.InstancedMesh(conifer, mat, nT);
  const blobs = new THREE.InstancedMesh(blob, mat, Math.round(nT * 0.45));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();
  type T = { x: number; y: number; z: number; w: number; h: number; blob: boolean };
  const trees: T[] = [];
  for (let i = 0; i < nT * 3 && trees.length < nT * 1.4; i++) {
    const x = (rand() - 0.5) * 3800 - 300;
    const z = -134 - Math.pow(rand(), 0.9) * 160;
    const ax = Math.abs(x);
    if (ax < 82 && z > GATE_Z - 7) continue; // keep the gate and corridors clear
    const y = hillY(x, z) - 0.5;
    const h = (9 + rand() * 13) * (0.9 + 0.25 * (1 - Math.min(1, ax / 1800)));
    const blobT = rand() < 0.3;
    trees.push({ x, y, z, w: h * (blobT ? 0.8 + rand() * 0.3 : 0.5 + rand() * 0.25), h: blobT ? h * 0.8 : h, blob: blobT });
  }
  trees.sort((a, b) => b.z - a.z);
  let ci = 0;
  let bi = 0;
  for (const t of trees) {
    q.setFromAxisAngle(up, rand() * 6.28);
    col.setHSL(0.6 + rand() * 0.06, 0.3, 0.42 + rand() * 0.16);
    m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.w, t.h, t.w));
    if (t.blob && bi < blobs.count) {
      blobs.setMatrixAt(bi, m);
      blobs.setColorAt(bi, col);
      bi++;
    } else if (!t.blob && ci < cones.count) {
      cones.setMatrixAt(ci, m);
      cones.setColorAt(ci, col);
      ci++;
    }
  }
  cones.count = ci;
  blobs.count = bi;
  cones.frustumCulled = false;
  blobs.frustumCulled = false;
  g.add(cones, blobs);
  g.renderOrder = 3;
  return g;
}

// ---------------------------------------------------------------- pagoda

function pagodaGeometry(): { walls: THREE.BufferGeometry; roofs: THREE.BufferGeometry } {
  // 30 m tall at scale 1: five storeys, a spire
  const walls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  walls.push(prep(box(9, 1.2, 9, 0, 0.6, 0)));
  let y = 1.2;
  for (let i = 0; i < 5; i++) {
    const s = 7 - i * 0.9;
    const bh = 3.2 - i * 0.15;
    walls.push(prep(box(s, bh, s, 0, y + bh / 2, 0)));
    y += bh;
    const r = hipRoof(s * 1.75, s * 1.75, 1.3, { lift: 0.55, pow: 1.5, segU: 4, segV: 3, fascia: 0.28 });
    r.translate(0, y - 0.1, 0);
    roofs.push(prep(r));
    y += 0.9;
  }
  walls.push(prep(cyl(0.12, 0.2, 5.5, 6, 0, y, 0)));
  for (let k = 0; k < 5; k++) walls.push(prep(cyl(0.45, 0.45, 0.14, 8, 0, y + 1.2 + k * 0.75, 0)));
  return { walls: merge(walls), roofs: merge(roofs) };
}

// ---------------------------------------------------------------- the light map

function bakeLightMap(blds: Bld[], sak: { x: number; y: number; z: number; r: number }[], pag: [number, number, number][]): CityMap {
  const W = 512;
  const H = 128;
  const az0 = -80 * D2R;
  const az1 = 80 * D2R;
  const el0 = -3 * D2R;
  const el1 = 33 * D2R;
  const eye = new THREE.Vector3(0, EYE, -10);
  const acc = new Float32Array(W * H * 3);
  const cov = new Float32Array(W * H);
  const splat = (x: number, yb: number, yt: number, z: number, w: number, c: THREE.Color, k: number) => {
    const dx = x - eye.x;
    const dz = z - eye.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 20) return;
    const az = Math.atan2(dx, -dz);
    const hw = Math.atan2(w / 2, dist);
    const e0 = Math.atan2(yb - eye.y, dist);
    const e1 = Math.atan2(yt - eye.y, dist);
    const i0 = Math.max(0, Math.floor(((az - hw - az0) / (az1 - az0)) * W));
    const i1 = Math.min(W - 1, Math.ceil(((az + hw - az0) / (az1 - az0)) * W));
    const j0 = Math.max(0, Math.floor(((e0 - el0) / (el1 - el0)) * H));
    const j1 = Math.min(H - 1, Math.ceil(((e1 - el0) / (el1 - el0)) * H));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const t = j * W + i;
        acc[t * 3] += c.r * k;
        acc[t * 3 + 1] += c.g * k;
        acc[t * 3 + 2] += c.b * k;
        cov[t] += 1;
      }
    }
  };
  for (const b of blds) {
    const k = b.lit * (b.style === 1 ? 0.3 : 0.2);
    splat(b.x, Math.max(b.y0, hillY(b.x, b.z) - 1), b.y1, b.z, Math.max(b.w, b.d), b.win, k);
  }
  const pink = new THREE.Color(1.0, 0.5, 0.74);
  for (const s of sak) splat(s.x, s.y - s.r * 0.6, s.y + s.r * 0.6, s.z, s.r * 2, pink, 0.6);
  const warm = WARM.clone().multiplyScalar(2.2);
  for (const [x, z, h] of pag) splat(x, hillY(x, z), hillY(x, z) + h, z, h * 0.25, warm, 0.35);
  // the gate and its corridors
  splat(0, DECK_Y, DECK_Y + 16, GATE_Z, 26, warm, 0.25);
  splat(-40, DECK_Y, DECK_Y + 5, GATE_Z, 58, warm, 0.18);
  splat(40, DECK_Y, DECK_Y + 5, GATE_Z, 58, warm, 0.18);

  // the skyline: where the hill (and the mesa) meet the sky
  const sky = new Float32Array(W);
  for (let i = 0; i < W; i++) {
    const az = az0 + ((i + 0.5) / W) * (az1 - az0);
    let best = -1;
    for (let d = 120; d < 3200; d *= 1.03) {
      const x = eye.x + Math.sin(az) * d;
      const z = eye.z - Math.cos(az) * d;
      const e = Math.atan2(hillY(x, z) - eye.y + 4, d);
      if (e > best) best = e;
    }
    sky[i] = best;
  }
  const data = new Uint8Array(W * H * 4);
  const MAXV = 1.6;
  for (let j = 0; j < H; j++) {
    const el = el0 + ((j + 0.5) / H) * (el1 - el0);
    for (let i = 0; i < W; i++) {
      const t = j * W + i;
      const c = Math.max(1, cov[t]);
      const solid = THREE.MathUtils.clamp((sky[i] - el) / (0.25 * D2R) + 0.5, 0, 1);
      for (let k = 0; k < 3; k++) data[t * 4 + k] = Math.round(THREE.MathUtils.clamp(acc[t * 3 + k] / c / MAXV, 0, 1) * 255);
      data[t * 4 + 3] = Math.round(solid * 255);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { tex, map: new THREE.Vector4(az0, az1, el0, el1), eye, gain: MAXV };
}
