import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { merge } from "./city";
import { GATE, LANTERNS } from "./layout";

// The great gate at the top of the steps: four massive vermilion pillars with
// black-lacquered feet on stone plinths, the head-tie beam and plate, bracket
// sets (斗栱) on every pillar and between them, the purlin, two tiers of
// rafters with painted ends, the soffit, the tiled eave, and a row of paper
// lanterns (提灯) hung from the eave.

const f = (x: number) => x.toFixed(3);
const VERMILION = 0xd8432a;
const VERMILION_SHADE = 0x5a1830;

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
};

const PILLARS = [-GATE.outerX, -GATE.x, GATE.x, GATE.outerX];
const PLINTH_H = 0.32;
const X_END = GATE.outerX + 1.3;

export type Gate = { group: THREE.Group };

export function buildGate(): Gate {
  const group = new THREE.Group();

  // ---------------------------------------------------------------- pillars
  const H = GATE.capY - PLINTH_H;
  const pg = new THREE.CylinderGeometry(GATE.r * 0.94, GATE.r, H, 48, 8);
  pg.translate(0, PLINTH_H + H / 2, 0);
  const pillarMat = toonMaterial({
    color: VERMILION,
    shade: VERMILION_SHADE,
    ink: 20,
    rim: 1.0,
    step: 0.02,
    soft: 0.03,
    fragment: /* glsl */ `
      float y = vWorldPos.y;
      // black lacquered foot with a brass band (根巻)
      float foot = step(y, 1.55);
      float band = step(1.55, y) * step(y, 1.68);
      base = mix(base, vec3(0.028, 0.024, 0.038), foot); shade = mix(shade, vec3(0.01, 0.009, 0.02), foot);
      base = mix(base, vec3(0.86, 0.62, 0.3), band); shade = mix(shade, vec3(0.3, 0.17, 0.12), band);
      // grain in the lacquer, and age toward the top
      vec3 c = vWorldPos - vec3(sign(vWorldPos.x) * (abs(vWorldPos.x) > ${f((GATE.x + GATE.outerX) / 2)} ? ${f(GATE.outerX)} : ${f(GATE.x)}), 0.0, ${f(GATE.z)});
      float a = atan(c.z, c.x);
      float grain = vnoise(vec2(a * 14.0, y * 0.35)) - 0.5;
      base *= 1.0 + grain * 0.12 * (1.0 - foot); shade *= 1.0 + grain * 0.16 * (1.0 - foot);
      base *= 1.0 - smoothstep(${f(GATE.capY - 2.6)}, ${f(GATE.capY)}, y) * 0.45;
      shade *= 1.0 - smoothstep(${f(GATE.capY - 2.6)}, ${f(GATE.capY)}, y) * 0.4;
      // warm light of the lanterns and the deck on the lower shaft
      emis += vec3(0.55, 0.14, 0.05) * smoothstep(5.8, 2.0, y) * (1.0 - foot) * 0.35;
      // lacquer gloss: a hard, narrow highlight band
      vec3 Hh = normalize(normalize(cameraPosition - vWorldPos) + normalize(vec3(0.3, 0.2, 1.0)));
      float gloss = smoothstep(0.93, 0.95, dot(n, Hh));
      emis += mix(vec3(0.5, 0.18, 0.1), vec3(0.2, 0.2, 0.26), foot) * gloss * 0.6 + vec3(1.0, 0.7, 0.35) * band * gloss;`,
  });
  const pillars = new THREE.InstancedMesh(pg, pillarMat, PILLARS.length);
  const m = new THREE.Matrix4();
  PILLARS.forEach((x, i) => {
    m.makeTranslation(x, 0, GATE.z);
    pillars.setMatrixAt(i, m);
  });
  pillars.frustumCulled = false;
  pillars.renderOrder = 1;
  group.add(pillars);

  // stone plinths (礎盤)
  const plinthGeo = merge([
    (() => {
      const g = new THREE.CylinderGeometry(GATE.r * 1.12, GATE.r * 1.3, PLINTH_H, 32);
      g.translate(0, PLINTH_H / 2, 0);
      return g;
    })(),
    box(GATE.r * 3.0, 0.1, GATE.r * 3.0, 0, -0.08, 0),
  ]);
  const plinths = new THREE.InstancedMesh(plinthGeo, toonMaterial({ color: 0x6a7090, shade: 0x1c2038, ink: 21, rim: 0.5, step: 0.2 }), PILLARS.length);
  PILLARS.forEach((x, i) => {
    m.makeTranslation(x, 0, GATE.z);
    plinths.setMatrixAt(i, m);
  });
  plinths.frustumCulled = false;
  plinths.renderOrder = 1;
  group.add(plinths);

  // ---------------------------------------------------------------- beams and brackets
  const Z = GATE.z;
  const beams: THREE.BufferGeometry[] = [];
  const blocks: THREE.BufferGeometry[] = [];
  // head-tie beam (頭貫) and plate (台輪) running the whole front
  beams.push(box(X_END * 2, GATE.lintelH, 0.52, 0, GATE.lintelY, Z));
  beams.push(box(X_END * 2 + 0.3, 0.26, 0.92, 0, GATE.capY, Z));
  // a lower tie (飛貫) between the main pillars
  beams.push(box(GATE.x * 2, 0.34, 0.36, 0, 5.05, Z));
  const y0 = GATE.capY + 0.26;
  const bracketAt = (x: number, big: boolean) => {
    const s = big ? 1 : 0.8;
    blocks.push(box(0.95 * s, 0.38, 0.95 * s, x, y0, Z)); // 大斗
    beams.push(box(2.3 * s, 0.3, 0.3, x, y0 + 0.38, Z)); // 肘木 along the wall
    beams.push(box(0.3, 0.3, 1.9, x, y0 + 0.38, Z - 0.75)); // arm projecting out
    for (const dx of [-0.95, 0, 0.95]) blocks.push(box(0.46, 0.24, 0.46, x + dx * s, y0 + 0.68, Z));
    blocks.push(box(0.46, 0.24, 0.46, x, y0 + 0.68, Z - 1.5));
    beams.push(box(2.1 * s, 0.28, 0.3, x, y0 + 0.92, Z - 1.5)); // second arm under the purlin
    for (const dx of [-0.85, 0, 0.85]) blocks.push(box(0.44, 0.22, 0.44, x + dx * s, y0 + 1.2, Z - 1.5));
  };
  for (const x of PILLARS) bracketAt(x, true);
  for (const x of [0, -(GATE.x + GATE.outerX) / 2, (GATE.x + GATE.outerX) / 2]) bracketAt(x, false);
  // purlin (丸桁) and the wall-plane beam
  const purlinY = y0 + 1.42;
  beams.push(box(X_END * 2 + 0.8, 0.36, 0.4, 0, purlinY, Z - 1.5));
  beams.push(box(X_END * 2, 0.3, 0.34, 0, y0 + 0.92, Z));
  const beamMat = toonMaterial({
    color: VERMILION,
    shade: VERMILION_SHADE,
    ink: 22,
    rim: 0.8,
    step: 0.05,
    fragment: /* glsl */ `
      // painted ends of the beams (木口): chalk white with a yellow rim
      float endx = step(${f(X_END - 0.02)}, abs(vWorldPos.x)) * step(0.5, abs(n.x));
      base = mix(base, vec3(0.95, 0.86, 0.6), endx); shade = mix(shade, vec3(0.42, 0.36, 0.42), endx);
      // a green-gold painted band along the head-tie beam
      float lin = step(${f(GATE.lintelY + 0.18)}, vWorldPos.y) * step(vWorldPos.y, ${f(GATE.lintelY + 0.5)}) * step(0.5, abs(n.z));
      float pat = step(0.5, fract(vWorldPos.x * 0.8));
      base = mix(base, mix(vec3(0.2, 0.5, 0.45), vec3(0.85, 0.66, 0.3), pat), lin * 0.85);
      shade = mix(shade, mix(vec3(0.06, 0.16, 0.2), vec3(0.3, 0.2, 0.15), pat), lin * 0.85);`,
  });
  const beamMesh = new THREE.Mesh(merge(beams), beamMat);
  beamMesh.renderOrder = 1;
  const blockMat = toonMaterial({ color: 0xe0b85a, shade: 0x5a3a36, ink: 23, rim: 0.9, step: 0.05 });
  const blockMesh = new THREE.Mesh(merge(blocks), blockMat);
  blockMesh.renderOrder = 1;
  group.add(beamMesh, blockMesh);

  // white plaster panels (小壁) between the head-tie beam and the wall beam
  const panels = new THREE.Mesh(
    box(X_END * 2, y0 + 0.92 - (GATE.lintelY + GATE.lintelH), 0.12, 0, GATE.lintelY + GATE.lintelH, Z + 0.08),
    toonMaterial({ color: 0xe6e2da, shade: 0x5a6280, ink: 24, rim: 0.3 }),
  );
  panels.renderOrder = 1;
  group.add(panels);

  // ---------------------------------------------------------------- rafters, soffit, tiles
  const zIn = Z + 0.6;
  const zA = -0.95; // end of the base rafters
  const zB0 = -0.35;
  const zB1 = GATE.eaveZ; // end of the flying rafters
  const yBase = (z: number) => purlinY + 0.36 + (z - (Z - 1.5)) * 0.32;
  const yFly = (z: number) => yBase(zB0) + 0.2 + (z - zB0) * 0.1;
  const rafters: THREE.Matrix4[] = [];
  const kinds: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let x = -X_END - 0.3; x <= X_END + 0.3; x += 0.42) {
    // base rafter: from inside the wall to zA
    {
      const len = zIn - zA;
      const zc = (zIn + zA) / 2;
      e.set(-Math.atan(0.32), 0, 0);
      q.setFromEuler(e);
      rafters.push(new THREE.Matrix4().compose(new THREE.Vector3(x, yBase(zc), zc), q, new THREE.Vector3(0.15, 0.17, len)));
      kinds.push(0);
    }
    // flying rafter
    {
      const len = zB0 - zB1;
      const zc = (zB0 + zB1) / 2;
      e.set(-Math.atan(0.1), 0, 0);
      q.setFromEuler(e);
      rafters.push(new THREE.Matrix4().compose(new THREE.Vector3(x, yFly(zc), zc), q, new THREE.Vector3(0.13, 0.15, len)));
      kinds.push(1);
    }
  }
  const rafterGeo = new THREE.BoxGeometry(1, 1, 1);
  const rafterMat = toonMaterial({
    color: VERMILION,
    shade: VERMILION_SHADE,
    ink: 25,
    rim: 0.6,
    step: 0.05,
    vertexHead: /* glsl */ `varying float vEnd;`,
    vertex: /* glsl */ `vEnd = position.z;`,
    fragmentHead: /* glsl */ `varying float vEnd;`,
    fragment: /* glsl */ `
      // the rafter ends are painted chalk-yellow
      float endc = step(vEnd, -0.49) + step(-0.5, vEnd) * step(vEnd, -0.47) * 0.0;
      endc = step(0.5, -n.z) * step(vEnd, -0.48);
      base = mix(base, vec3(0.98, 0.84, 0.42), endc); shade = mix(shade, vec3(0.5, 0.36, 0.3), endc);`,
  });
  const rafterMesh = new THREE.InstancedMesh(rafterGeo, rafterMat, rafters.length);
  rafters.forEach((mm, i) => rafterMesh.setMatrixAt(i, mm));
  rafterMesh.frustumCulled = false;
  rafterMesh.renderOrder = 1;
  group.add(rafterMesh);
  void kinds;

  // soffit boards above the rafters, the fascia boards (木負・茅負), tile edge
  const sof: THREE.BufferGeometry[] = [];
  const slab = (z0: number, z1: number, yf: (z: number) => number, thick: number) => {
    const w = X_END * 2 + 1.2;
    const len = Math.hypot(z0 - z1, yf(z0) - yf(z1));
    const g = new THREE.BoxGeometry(w, thick, len);
    g.rotateX(-Math.atan2(yf(z0) - yf(z1), z0 - z1));
    g.translate(0, (yf(z0) + yf(z1)) / 2, (z0 + z1) / 2);
    return g;
  };
  sof.push(slab(zIn, zA, (z) => yBase(z) + 0.17, 0.06));
  sof.push(slab(zB0, zB1, (z) => yFly(z) + 0.15, 0.06));
  const soffit = new THREE.Mesh(
    merge(sof),
    toonMaterial({
      color: 0x8a5a4a,
      shade: 0x2c1a30,
      ink: 26,
      rim: 0.2,
      uniforms: { uLx: { value: LANTERNS.map((p) => p.x) } },
      fragmentHead: /* glsl */ `uniform float uLx[${LANTERNS.length}];`,
      fragment: /* glsl */ `
        // lantern light warms the underside near each lantern
        float dl = 1e3;
        for (int i = 0; i < ${LANTERNS.length}; i++) dl = min(dl, abs(vWorldPos.x - uLx[i]));
        emis += vec3(0.5, 0.22, 0.1) * smoothstep(2.6, 0.0, dl) * 0.4;`,
    }),
  );
  soffit.renderOrder = 1;
  group.add(soffit);

  const edge: THREE.BufferGeometry[] = [];
  edge.push(box(X_END * 2 + 1.0, 0.24, 0.24, 0, yBase(zA) - 0.02, zA - 0.12)); // 木負
  edge.push(box(X_END * 2 + 1.2, 0.26, 0.26, 0, yFly(zB1) - 0.03, zB1 - 0.13)); // 茅負
  edge.push(box(X_END * 2 + 1.4, 0.2, 0.5, 0, yFly(zB1) + 0.23, zB1 - 0.1)); // tile bed
  const tileMat = toonMaterial({
    color: 0x5a6488,
    shade: 0x151a34,
    ink: 27,
    rim: 1.3,
    step: 0.2,
  });
  const edgeMesh = new THREE.Mesh(merge(edge), beamMat);
  edgeMesh.renderOrder = 1;
  group.add(edgeMesh);
  // the tiled roof surface climbing away, and the round tile ends
  const roofG = slab(zB1 - 0.3, Z + 4.0, (z) => yFly(zB1) + 0.4 + (z - zB1) * 0.55, 0.3);
  const roofMesh = new THREE.Mesh(
    roofG,
    toonMaterial({
      color: 0x4a5478,
      shade: 0x12162e,
      ink: 27,
      rim: 1.2,
      step: 0.2,
      fragment: /* glsl */ `
        float rows = step(0.72, fract(vWorldPos.x / 0.3));
        base *= 1.0 - rows * 0.25; shade *= 1.0 - rows * 0.3;`,
    }),
  );
  roofMesh.renderOrder = 1;
  group.add(roofMesh);
  const disc = new THREE.CylinderGeometry(0.13, 0.13, 0.08, 14);
  disc.rotateX(Math.PI / 2);
  const nd = Math.floor((X_END * 2 + 1.2) / 0.3);
  const discs = new THREE.InstancedMesh(disc, tileMat, nd);
  for (let i = 0; i < nd; i++) {
    m.makeTranslation(-X_END - 0.6 + i * 0.3 + 0.15, yFly(zB1) + 0.3, zB1 - 0.38);
    discs.setMatrixAt(i, m);
  }
  discs.frustumCulled = false;
  discs.renderOrder = 1;
  group.add(discs);

  // ---------------------------------------------------------------- paper lanterns
  const lp: [number, number][] = [
    [0.18, -0.5],
    [0.26, -0.47],
    [0.34, -0.36],
    [0.385, -0.18],
    [0.395, 0.0],
    [0.385, 0.18],
    [0.34, 0.36],
    [0.26, 0.47],
    [0.18, 0.5],
  ];
  const lantBody = new THREE.LatheGeometry(
    lp.map(([x, y]) => new THREE.Vector2(x, y * 1.05)),
    20,
  );
  const lantMat = toonMaterial({
    color: 0xfff0d0,
    shade: 0xd08a5a,
    ink: 28,
    rim: 0.4,
    step: -0.4,
    lights: 0,
    fog: 0.3,
    vertexHead: /* glsl */ `varying vec3 vLoc;`,
    vertex: /* glsl */ `
      vLoc = position;
      // swing gently from the hook
      float sw = sin(uTime * 0.9 + wp.x * 0.7) * 0.05 + sin(uTime * 1.7 + wp.x) * 0.02;
      float arm = (${f(LANTERNS[0].y + 2.9)} - wp.y);
      wp.x += sw * arm * 0.3;
      wp.z += sw * arm * 0.12;`,
    fragmentHead: /* glsl */ `varying vec3 vLoc;`,
    fragment: /* glsl */ `
      // glowing paper: ribs, a red band with a white mon, brighter at the middle
      float y = vLoc.y;
      float rib = smoothstep(0.35, 0.5, abs(fract(y * 16.0) - 0.5)) * 0.35;
      float band = step(abs(y + 0.02), 0.2);
      float ang = atan(vLoc.z, vLoc.x);
      vec2 mp = vec2(ang * 0.39, y + 0.02);
      float mon = smoothstep(0.1, 0.085, length(mp)) * step(0.0, cos(ang));
      vec3 paper = vec3(1.0, 0.62, 0.3) * (2.1 - abs(y) * 1.6);
      vec3 red = vec3(1.0, 0.1, 0.06) * 1.3;
      vec3 c = mix(paper, red, band * (1.0 - mon));
      c *= 1.0 - rib;
      base = vec3(0.0); shade = vec3(0.0);
      emis += c * (0.9 + 0.1 * sin(uTime * 5.0 + vLoc.x * 40.0 + ang));`,
  });
  const capParts: THREE.BufferGeometry[] = [];
  const cap = (y: number, h: number) => {
    const g = new THREE.CylinderGeometry(0.2, 0.2, h, 14);
    g.translate(0, y, 0);
    capParts.push(g);
  };
  cap(0.56, 0.1);
  cap(-0.56, 0.1);
  const rodLen = 2.9;
  const rod = new THREE.CylinderGeometry(0.018, 0.018, rodLen, 5);
  rod.translate(0, 0.61 + rodLen / 2, 0);
  capParts.push(rod);
  const tassel = new THREE.CylinderGeometry(0.03, 0.05, 0.3, 6);
  tassel.translate(0, -0.76, 0);
  capParts.push(tassel);
  const capGeo = merge(capParts);
  const capMat = toonMaterial({
    color: 0x2a2430,
    shade: 0x0c0a14,
    ink: 29,
    rim: 1.0,
    lights: 0.5,
    vertex: /* glsl */ `
      float sw = sin(uTime * 0.9 + wp.x * 0.7) * 0.05 + sin(uTime * 1.7 + wp.x) * 0.02;
      float arm = (${f(LANTERNS[0].y + 2.9)} - wp.y);
      wp.x += sw * arm * 0.3;
      wp.z += sw * arm * 0.12;`,
  });
  const bodies = new THREE.InstancedMesh(lantBody, lantMat, LANTERNS.length);
  const caps = new THREE.InstancedMesh(capGeo, capMat, LANTERNS.length);
  LANTERNS.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    bodies.setMatrixAt(i, m);
    caps.setMatrixAt(i, m);
  });
  bodies.frustumCulled = caps.frustumCulled = false;
  bodies.renderOrder = caps.renderOrder = 1;
  group.add(bodies, caps);

  return { group };
}
