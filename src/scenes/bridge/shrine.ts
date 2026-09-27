import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { WARM } from "./bridge";
import { box, curvedBeam, cyl, facadeBox, hipRoof, merge, prep } from "./geo";
import { DECK_Y, GATE_Z, SHORE_LAMPS, SHORE_Z, TORII_H, TORII_HALF, TORII_S, TORII_Z, Z_FAR } from "./layout";

// The far end of the bridge: the great vermilion torii with its black kasagi
// sweeping up at the ends, the two-storey gate hall (楼門) with its corridors
// glowing behind it, a pair of big stone lanterns at the bridge end, a row of
// small ones along the embankment, and the embankment itself.

const G = DECK_Y; // plaza level

/** Where the two big stone lanterns stand (their lights are env lamps 0 and 1). */
export const BIG_LAMPS = [new THREE.Vector3(-7.2, G + 1.85, Z_FAR - 2.6), new THREE.Vector3(7.2, G + 1.85, Z_FAR - 2.6)];

export function buildShrine(): THREE.Group {
  const group = new THREE.Group();
  group.add(buildTorii(), buildGate(), buildLanterns(), buildEmbankment());
  return group;
}

// ---------------------------------------------------------------- torii

function buildTorii(): THREE.Group {
  const g = new THREE.Group();
  // straight between the pillars, sweeping up toward the ends
  const curve = (x: number) => 0.85 * Math.pow(Math.max(0, Math.abs(x) - 3.6) / 4.7, 2.2);
  const red: THREE.BufferGeometry[] = [];
  const black: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    red.push(prep(cyl(0.42, 0.47, TORII_H - 1.2, 22, s * TORII_HALF, 1.2, 0)));
    black.push(prep(cyl(0.57, 0.6, 1.3, 22, s * TORII_HALF, 0, 0)));
    black.push(prep(cyl(0.5, 0.5, 0.28, 22, s * TORII_HALF, TORII_H - 0.3, 0)));
  }
  const shimaki = curvedBeam(14.6, 0.52, 0.82, 0.82, curve, 36);
  shimaki.translate(0, TORII_H - 0.02, 0);
  red.push(prep(shimaki));
  const kasagi = curvedBeam(16.6, 0.78, 1.2, 0.86, (x) => curve(x) * 1.15, 40);
  kasagi.translate(0, TORII_H + 0.5, 0);
  black.push(prep(kasagi));
  red.push(prep(box(14.2, 0.62, 0.44, 0, 9.4, 0)));
  red.push(prep(box(0.56, TORII_H - 9.72, 0.42, 0, (9.72 + TORII_H) / 2, 0)));
  const redMesh = new THREE.Mesh(
    merge(red),
    toonMaterial({
      color: 0xde4a2c,
      shade: 0x6a1a2c,
      ink: 9,
      rim: 1.0,
      step: 0.12,
      uniforms: { uLanternCol: { value: WARM }, uG: { value: G } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol; uniform float uG;`,
      fragment: /* glsl */ `
        // up-lit from the lanterns at its feet, glowing from the gate behind
        float yy = vWorldPos.y - uG;
        emis += uLanternCol * base * (0.9 * exp(-yy * 0.28) + 0.12);
        emis += uLanternCol * base * 0.35 * smoothstep(0.2, -0.6, n.z);`,
    }),
  );
  const blackMesh = new THREE.Mesh(
    merge(black),
    toonMaterial({
      color: 0x3a3440,
      shade: 0x0c0a14,
      ink: 10,
      rim: 1.0,
      step: 0.3,
      uniforms: { uLanternCol: { value: WARM }, uG: { value: G } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol; uniform float uG;`,
      fragment: /* glsl */ `
        float yy = vWorldPos.y - uG;
        emis += uLanternCol * 0.05 * exp(-yy * 0.5);
        // lacquer: a thin cool highlight along the top of the kasagi
        emis += vec3(0.25, 0.32, 0.5) * smoothstep(0.75, 0.95, n.y) * step(10.0, yy) * 0.25;`,
    }),
  );
  // the plaque (額) on the gakuzuka: dark field, gold border and two glowing glyphs
  const plaque = new THREE.Mesh(
    prep(box(1.45, 2.1, 0.16, 0, 10.95, 0.3)),
    toonMaterial({
      color: 0x1c2340,
      shade: 0x0a0e20,
      ink: 11,
      rim: 0.6,
      lights: 0,
      uniforms: { uC: { value: new THREE.Vector2(0, G + 10.95 * TORII_S) }, uS: { value: TORII_S } },
      fragmentHead: /* glsl */ `uniform vec2 uC; uniform float uS;`,
      fragment: /* glsl */ `
        vec2 q = vec2(vWorldPos.x - uC.x, vWorldPos.y - uC.y) / uS;
        float border = step(0.6, abs(q.x)) + step(0.94, abs(q.y));
        vec3 gold = vec3(1.0, 0.72, 0.3);
        base = mix(base, gold * 0.8, min(border, 1.0));
        // two stroke-ish glyph blocks
        float gy = abs(fract((q.y + 0.9) / 0.9) - 0.5);
        float glyph = step(abs(q.x), 0.32) * step(abs(q.y), 0.78) * step(0.08, gy) * step(0.5, vnoise(q * 9.0 + 3.0));
        emis += gold * glyph * 1.3 + gold * min(border, 1.0) * 0.4;`,
    }),
  );
  g.add(redMesh, blackMesh, plaque);
  g.position.set(0, G, TORII_Z);
  g.scale.setScalar(TORII_S);
  return g;
}

// ---------------------------------------------------------------- gate hall

function buildGate(): THREE.Group {
  const g = new THREE.Group();
  const walls: THREE.BufferGeometry[] = [];
  // kind 0: lower storey, 1: upper storey, 2: corridor, 3: plain
  walls.push(prep(facadeBox(22, 6.9, 9, 0, 3.45, 0), undefined, 0));
  walls.push(prep(facadeBox(15.5, 3.6, 6.6, 0, 9.2 + 1.8, 0), undefined, 1));
  walls.push(prep(facadeBox(17.6, 0.35, 8.2, 0, 9.35, 0), undefined, 3)); // balcony floor
  for (const s of [-1, 1]) walls.push(prep(facadeBox(58, 4.2, 5.2, s * (11 + 29), 2.1, -1.2), undefined, 2));
  const wallMesh = new THREE.Mesh(
    merge(walls),
    toonMaterial({
      color: 0xbfb4aa,
      shade: 0x3a3f62,
      ink: 12,
      rim: 0.6,
      step: 0.1,
      vertexHead: /* glsl */ `attribute float aKind; flat varying float vKind;`,
      vertex: /* glsl */ `vKind = aKind;`,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `flat varying float vKind; uniform vec3 uLanternCol;`,
      fragment: /* glsl */ `
        vec2 f = vUv;               // metres on the face
        bool side = abs(n.y) < 0.5;
        vec3 red = vec3(0.66, 0.1, 0.05);
        vec3 redS = vec3(0.16, 0.03, 0.06);
        if (side && vKind < 0.5) {
          // six bays of vermilion columns; the middle two are the gate passage
          float bw = 22.0 / 6.0;
          float c = abs(fract(f.x / bw + 0.5) - 0.5) * bw;
          float col = 1.0 - step(0.3, c);
          float mid = step(abs(f.x - 11.0), bw);
          float beam = step(5.0, f.y) * step(f.y, 5.5) + step(6.4, f.y);
          vec3 wall = mix(base, red, max(col, min(beam, 1.0)));
          vec3 wallS = mix(shade, redS, max(col, min(beam, 1.0)));
          // the arched passage: warm light spilling from within
          float ax = abs(f.x - 11.0);
          float arch = step(ax, 2.6) * step(f.y, 3.7 + sqrt(max(0.0, 2.6 * 2.6 - ax * ax)) * 0.45);
          float glow = exp(-ax * ax * 0.12) * (0.6 + 0.4 * smoothstep(4.5, 0.0, f.y));
          base = mix(wall, vec3(0.05, 0.03, 0.03), arch);
          shade = mix(wallS, vec3(0.03, 0.02, 0.03), arch);
          emis += uLanternCol * arch * glow * 2.2;
          // lanterns hanging in the side bays
          vec2 lq = vec2(abs(fract(f.x / bw) - 0.5) * bw, f.y - 4.2);
          float lan = (1.0 - mid) * step(length(lq * vec2(1.0, 0.7)), 0.34);
          emis += uLanternCol * lan * 3.5;
          emis += uLanternCol * base * 0.25 * (1.0 - arch);
        } else if (side && vKind < 1.5) {
          // upper storey: vermilion posts and lit shoji
          float c = abs(fract(f.x / 2.2 + 0.5) - 0.5) * 2.2;
          float post = 1.0 - step(0.16, c);
          float rail = step(f.y, 0.8);
          float shoji = (1.0 - post) * (1.0 - rail) * step(f.y, 3.2);
          vec2 k = abs(fract(f / vec2(0.36, 0.42)) - 0.5);
          float kum = step(0.44, max(k.x, k.y));
          base = mix(base, red, max(post, rail));
          shade = mix(shade, redS, max(post, rail));
          emis += uLanternCol * shoji * (1.6 - kum * 1.1) * (0.85 + 0.15 * sin(f.x * 1.3 + uTime * 0.7));
        } else if (side && vKind < 2.5) {
          // corridor: columns, a glowing lattice window band, hanging lanterns
          float c = abs(fract(f.x / 3.0 + 0.5) - 0.5) * 3.0;
          float col = 1.0 - step(0.2, c);
          float band = step(1.6, f.y) * step(f.y, 3.3) * (1.0 - col);
          float bars = step(0.5, fract(f.x / 0.22));
          base = mix(vec3(0.1, 0.07, 0.08), red, col);
          shade = mix(vec3(0.04, 0.03, 0.05), redS, col);
          emis += uLanternCol * band * (0.35 + 0.5 * bars) * 0.9;
          vec2 lq = vec2(abs(fract(f.x / 6.0) - 0.5) * 6.0, f.y - 3.6);
          emis += uLanternCol * step(length(lq * vec2(1.0, 0.75)), 0.3) * 3.2;
        } else {
          base = side ? red : base * 0.6;
          shade = side ? redS : shade * 0.6;
        }`,
    }),
  );
  const roofs: THREE.BufferGeometry[] = [];
  const r1 = hipRoof(28.5, 14.5, 3.1, { lift: 1.0, pow: 1.7, segU: 10, segV: 6, fascia: 0.45 });
  r1.translate(0, 6.95, 0);
  roofs.push(prep(r1));
  const r2 = hipRoof(24.5, 12.2, 5.4, { lift: 1.2, pow: 1.8, segU: 10, segV: 6, fascia: 0.5 });
  r2.translate(0, 13.0, 0);
  roofs.push(prep(r2));
  roofs.push(prep(box(24.5 - 12.2 * 0.9 + 0.8, 0.55, 0.7, 0, 13.0 + 5.4 + 0.12, 0)));
  for (const s of [-1, 1]) {
    const rc = hipRoof(60, 7.6, 2.3, { lift: 0.6, pow: 1.6, segU: 16, segV: 4, fascia: 0.3 });
    rc.translate(s * (11 + 29), 4.2, -1.2);
    roofs.push(prep(rc));
  }
  const roofMesh = new THREE.Mesh(
    merge(roofs),
    toonMaterial({
      color: 0x3a4466,
      shade: 0x0d1024,
      ink: 13,
      rim: 1.0,
      step: 0.35,
      side: THREE.DoubleSide,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol;`,
      fragment: /* glsl */ `
        // tile rows, and the eaves' undersides lit warm from the lanterns below
        float rows = step(0.82, fract(vUv.y * 9.0));
        base *= 1.0 - rows * 0.25;
        shade *= 1.0 - rows * 0.3;
        if (!gl_FrontFacing) {
          base = vec3(0.3, 0.12, 0.08);
          shade = vec3(0.12, 0.05, 0.06);
          emis += uLanternCol * 0.35;
        }
        emis += uLanternCol * 0.25 * step(vUv.y, -0.5);`,
    }),
  );
  g.add(wallMesh, roofMesh);
  g.position.set(0, G, GATE_Z);
  return g;
}

// ---------------------------------------------------------------- stone lanterns

function stoneLantern(): { stone: THREE.BufferGeometry; light: THREE.BufferGeometry } {
  const c = 0xa7b0c6;
  const stone = merge([
    prep(cyl(0.34, 0.4, 0.2, 6, 0, 0, 0), c),
    prep(cyl(0.12, 0.15, 0.95, 8, 0, 0.2, 0), c),
    prep(cyl(0.3, 0.2, 0.14, 6, 0, 1.15, 0), c),
    prep(
      (() => {
        const r = hipRoof(0.78, 0.78, 0.26, { lift: 0.08, pow: 1.4, segU: 4, segV: 3, fascia: 0.05 });
        r.translate(0, 1.62, 0);
        return r;
      })(),
      0x8e97ae,
    ),
    prep(new THREE.SphereGeometry(0.07, 8, 6).translate(0, 1.95, 0), c),
  ]);
  const light = prep(box(0.34, 0.33, 0.34, 0, 1.455, 0));
  return { stone, light };
}

function buildLanterns(): THREE.Group {
  const g = new THREE.Group();
  const { stone, light } = stoneLantern();
  const L = SHORE_LAMPS;
  const spots: [number, number, number][] = [];
  for (const s of [-1, 1]) for (let k = 0; k < L.n; k++) spots.push([s * (L.x0 + k * L.dx), L.z, 1]);
  // the big pair at the bridge end
  for (const p of BIG_LAMPS) spots.push([p.x, p.z, 1.35]);
  const stoneMesh = new THREE.InstancedMesh(stone, toonMaterial({ color: 0xffffff, shade: 0x4a5274, ink: 14, rim: 0.8, step: 0.1, vertexColors: true, side: THREE.DoubleSide }), spots.length);
  const lightMesh = new THREE.InstancedMesh(
    light,
    toonMaterial({
      color: 0xfff0d0,
      shade: 0xc08050,
      ink: 15,
      rim: 0.2,
      lights: 0,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol;`,
      fragment: /* glsl */ `
        // the window of the fire box: bright opening framed by stone
        float h = hash11(floor(vWorldPos.x * 0.5) + floor(vWorldPos.z) * 3.1);
        float fl = 0.85 + 0.1 * sin(uTime * (5.0 + h * 4.0) + h * 30.0) + 0.05 * sin(uTime * 11.0 + h * 9.0);
        emis += uLanternCol * fl * 3.2;
        if (abs(n.y) > 0.5) { emis *= 0.2; base *= 0.5; }`,
    }),
    spots.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spots.forEach(([x, z, s], i) => {
    m.compose(new THREE.Vector3(x, G, z), q, new THREE.Vector3(s, s, s));
    stoneMesh.setMatrixAt(i, m);
    lightMesh.setMatrixAt(i, m);
  });
  stoneMesh.frustumCulled = false;
  lightMesh.frustumCulled = false;
  g.add(stoneMesh, lightMesh);
  return g;
}

// ---------------------------------------------------------------- embankment

function buildEmbankment(): THREE.Mesh {
  const geo = box(6000, G + 1.2, 1.2, 0, (G - 1.2) / 2, SHORE_Z - 0.6);
  return new THREE.Mesh(
    geo,
    toonMaterial({
      color: 0x59627e,
      shade: 0x1a2038,
      ink: 16,
      rim: 0.4,
      step: 0.2,
      lights: 0,
      uniforms: { uLanternCol: { value: WARM }, uL: { value: new THREE.Vector3(SHORE_LAMPS.x0, SHORE_LAMPS.dx, SHORE_LAMPS.n) } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol; uniform vec3 uL;`,
      fragment: /* glsl */ `
        // dressed stone courses, a pale coping, warm pools under the shore lanterns
        vec2 p = vec2(vWorldPos.x, vWorldPos.y);
        float row = floor(p.y / 0.45);
        float bx = fract(p.x / 1.1 + hash11(row) * 0.5);
        float mortar = step(0.94, fract(p.y / 0.45)) + step(0.96, bx);
        base *= 1.0 - min(mortar, 1.0) * 0.35;
        shade *= 1.0 - min(mortar, 1.0) * 0.35;
        float cope = step(${(G - 0.25).toFixed(2)}, p.y);
        base = mix(base, vec3(0.62, 0.66, 0.78), cope);
        float ax = abs(p.x);
        float k = floor((ax - uL.x) / uL.y + 0.5);
        float dx = ax - (uL.x + clamp(k, 0.0, uL.z - 1.0) * uL.y);
        emis += uLanternCol * base * exp(-dx * dx * 0.2) * smoothstep(-0.5, 2.0, p.y) * 0.9 * step(0.0, n.z);`,
    }),
  );
}
