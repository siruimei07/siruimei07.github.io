import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { GeoBuilder } from "./geo";
import { PAGODA, STREET_HALF, STREET_Z, streetY, TERRACE_Y, TERRACE_Z } from "./layout";

// The temple terrace at the head of the street: stone steps and a dressed
// stone retaining wall, stone lanterns (灯籠) with lit fire boxes along the
// path to the pagoda, and sakura in full bloom glowing pink over it all —
// canopies of lumpy blossom clusters lit from below by the lanterns.

export type SakuraSpot = { x: number; z: number; y: number; r: number; h: number };

export function buildPrecinct(density: number) {
  const rand = rng(8812);
  const group = new THREE.Group();

  // ---- steps and wall
  const stone = new GeoBuilder();
  const y0 = streetY(STREET_Z[1]);
  const nSteps = 6;
  for (let i = 0; i < nSteps; i++) {
    const h = ((TERRACE_Y - y0) * (i + 1)) / nSteps;
    const z = STREET_Z[1] - (i * (STREET_Z[1] - TERRACE_Z)) / nSteps;
    stone.box(0, y0 + h / 2 - 0.3, z - 0.3, 2 * STREET_HALF + 1.5, h + 0.6, 0.6, 0, [0.2, 0.19, 0.23]);
  }
  for (const sgn of [-1, 1]) {
    const x0 = sgn * (STREET_HALF + 0.75);
    stone.box(x0 + sgn * 30, (TERRACE_Y + y0) / 2 - 1.0, TERRACE_Z + 0.4, 60, TERRACE_Y - y0 + 2, 1.6, 0, [0.14, 0.13, 0.17]);
    // cheek walls of the steps
    stone.box(x0, TERRACE_Y - 0.2, (STREET_Z[1] + TERRACE_Z) / 2, 0.7, 1.0, STREET_Z[1] - TERRACE_Z + 0.8, 0, [0.18, 0.17, 0.21]);
  }

  // ---- stone lanterns (灯籠): base, post, fire box, roof, jewel
  const toro = new GeoBuilder();
  const fire: THREE.Vector3[] = [];
  const addToro = (x: number, y: number, z: number, s: number) => {
    const c: [number, number, number] = [0.24, 0.23, 0.28];
    toro.add(new THREE.CylinderGeometry(0.55 * s, 0.62 * s, 0.3 * s, 6), new THREE.Matrix4().makeTranslation(x, y + 0.15 * s, z), c);
    toro.add(new THREE.CylinderGeometry(0.16 * s, 0.2 * s, 1.3 * s, 8), new THREE.Matrix4().makeTranslation(x, y + 0.95 * s, z), c);
    toro.add(new THREE.CylinderGeometry(0.5 * s, 0.34 * s, 0.22 * s, 6), new THREE.Matrix4().makeTranslation(x, y + 1.7 * s, z), c);
    toro.add(new THREE.BoxGeometry(0.62 * s, 0.55 * s, 0.62 * s), new THREE.Matrix4().makeTranslation(x, y + 2.08 * s, z), [1, 1, 1]);
    toro.add(new THREE.ConeGeometry(0.8 * s, 0.5 * s, 6), new THREE.Matrix4().makeTranslation(x, y + 2.6 * s, z), c);
    toro.add(new THREE.SphereGeometry(0.14 * s, 8, 6), new THREE.Matrix4().makeTranslation(x, y + 2.95 * s, z), c);
    fire.push(new THREE.Vector3(x, y + 2.08 * s, z));
  };
  for (const sgn of [-1, 1]) {
    addToro(sgn * (STREET_HALF + 0.4), TERRACE_Y, TERRACE_Z - 1.0, 1.25);
    for (let i = 0; i < 3; i++) addToro(sgn * 3.8 + PAGODA.x * 0.3, TERRACE_Y, TERRACE_Z - 5 - i * 3.6, 0.95);
  }
  const toroMesh = new THREE.Mesh(
    toro.build(),
    toonMaterial({
      color: 0xffffff,
      shade: 0x3a3c5c,
      ink: 50,
      rim: 0.7,
      vertexColors: true,
      fragment: /* glsl */ `
        // the fire box: paper windows glowing from inside (vertex colour = pure white)
        float box = step(0.99, min(vTint.r, min(vTint.g, vTint.b)));
        float win = box * step(abs(n.y), 0.5);
        base = mix(base * 0.24, vec3(0.01, 0.005, 0.004), win);
        shade = mix(shade * 0.24, vec3(0.008, 0.004, 0.003), win);
        emis += vec3(1.0, 0.38, 0.08) * win * 3.2;`,
    }),
  );
  toroMesh.frustumCulled = false;
  const stoneMesh = new THREE.Mesh(
    stone.build(),
    toonMaterial({
      color: 0xffffff,
      shade: 0x2a2c48,
      ink: 51,
      rim: 0.5,
      vertexColors: true,
      fragment: /* glsl */ `
        // dressed stone courses
        vec2 q = vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y);
        float course = step(0.9, fract(q.y / 0.5));
        float joint = step(0.94, fract((q.x + floor(q.y / 0.5) * 0.37) / 1.1));
        float m = max(course, joint) * step(abs(n.y), 0.5);
        base *= 1.0 - m * 0.45; shade *= 1.0 - m * 0.45;
        emis += vec3(1.0, 0.55, 0.28) * base * 0.35 * exp(-max(vWorldPos.y - ${(y0 - 0.5).toFixed(2)}, 0.0) / 1.2);`,
    }),
  );
  stoneMesh.frustumCulled = false;
  group.add(toroMesh, stoneMesh);

  // ---- sakura
  const spots: SakuraSpot[] = [];
  const addTree = (x: number, y: number, z: number, r: number, h: number) => spots.push({ x, y, z, r, h });
  // on the terrace, framing the pagoda
  for (const [x, z, r] of [
    [-12, -56, 6.5],
    [14, -51, 7.0],
    [-18, -71, 7.0],
    [21, -74, 7.2],
    [-8, -88, 6.0],
    [13, -92, 6.5],
    [-28, -60, 6.0],
    [30, -63, 6.5],
  ] as const)
    addTree(x, TERRACE_Y, z, r, r * 1.3);
  // tall old cherries behind the street's roofs: pink clouds above the eaves
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    const z = 18 - rand() * 64;
    const r = 6 + rand() * 3;
    addTree(side * (STREET_HALF + 17 + rand() * 12), streetY(z), z, r, 12 + rand() * 5);
  }
  const blobs: { p: THREE.Vector3; s: THREE.Vector3; hue: number }[] = [];
  const trunks = new GeoBuilder();
  for (const t of spots) {
    const n = Math.round(12 + t.r * 2.0);
    const crown = new THREE.Vector3(t.x, t.y + t.h * 0.7, t.z);
    // trunk and a few heavy limbs
    trunks.beam(new THREE.Vector3(t.x, t.y - 0.5, t.z), new THREE.Vector3(t.x + 0.3, t.y + t.h * 0.45, t.z), 0.55, 0.55, [0.04, 0.022, 0.024]);
    for (let k = 0; k < 3; k++) {
      const a = rand() * Math.PI * 2;
      const e = crown.clone().add(new THREE.Vector3(Math.cos(a) * t.r * 0.6, 0.4 + rand() * 1.2, Math.sin(a) * t.r * 0.6));
      trunks.beam(new THREE.Vector3(t.x + 0.3, t.y + t.h * 0.42, t.z), e, 0.3, 0.3, [0.04, 0.022, 0.024]);
    }
    for (let k = 0; k < n; k++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * t.r * 0.85;
      const p = crown.clone().add(new THREE.Vector3(Math.cos(a) * rr, (rand() - 0.3) * t.r * 0.5, Math.sin(a) * rr));
      const s = t.r * (0.26 + rand() * 0.22) * (0.75 + 0.25 * density);
      blobs.push({ p, s: new THREE.Vector3(s, s * (0.62 + rand() * 0.2), s), hue: rand() });
    }
  }
  const blobGeo = new THREE.IcosahedronGeometry(1, 2);
  const bloom = new THREE.InstancedMesh(
    blobGeo,
    toonMaterial({
      color: 0xffc2dc,
      shade: 0x8a4a86,
      ink: 52,
      rim: 1.0,
      step: -0.05,
      soft: 0.12,
      alphaToCoverage: true,
      vertexHead: /* glsl */ `varying vec3 vObj; attribute float aHue; varying float vHue;`,
      vertex: /* glsl */ `
        vObj = position;
        vHue = aHue;
        // lumpy clusters: push the surface out by a few octaves of noise
        vec3 pp = position * 2.3 + aHue * 17.0;
        float bump = vnoise(pp.xy + pp.z) * 0.55 + vnoise(pp.yz * 2.1 - pp.x) * 0.3;
        vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        wp.xyz += nrm * (bump - 0.35) * sc.x * 0.62;
        // a slow breeze
        wp.x += sin(uTime * 0.7 + wp.z * 0.2 + aHue * 6.0) * 0.06 * sc.x;`,
      fragmentHead: /* glsl */ `varying vec3 vObj; varying float vHue;`,
      fragment: /* glsl */ `
        // blossom clusters, projected three ways so they never streak
        vec3 an = abs(n); an = an * an * an * an; an /= (an.x + an.y + an.z);
        vec3 p1 = vWorldPos * 2.1 + vHue * 5.0;
        vec3 p2 = vWorldPos * 6.3 + 3.1;
        float f1 = vnoise(p1.yz) * an.x + vnoise(p1.zx) * an.y + vnoise(p1.xy) * an.z;
        float f2 = vnoise(p2.yz) * an.x + vnoise(p2.zx) * an.y + vnoise(p2.xy) * an.z;
        float flor = smoothstep(0.5, 0.8, f1 * 0.45 + f2 * 0.65);
        // ragged, fluffy edges where the puff turns away from the eye
        float facing = abs(dot(n, V));
        alpha = smoothstep(0.0, 0.2, facing - 0.28 + f2 * 0.55);
        if (alpha < 0.02) discard;
        base = mix(base * vec3(0.92, 0.74, 0.86), vec3(1.0, 0.92, 0.96), flor * 0.75);
        shade = mix(shade, vec3(0.74, 0.44, 0.74), flor * 0.45);
        float under = saturate(-n.y * 0.6 + 0.4);
        emis += vec3(1.0, 0.36, 0.58) * (0.25 + 0.7 * under) * (0.6 + 0.7 * flor) * mix(0.8, 1.2, vHue);`,
    }),
    blobs.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const hues = new Float32Array(blobs.length);
  blobs.forEach((b, i) => {
    q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * 6.28, rand() * 0.4));
    m.compose(b.p, q, b.s);
    bloom.setMatrixAt(i, m);
    hues[i] = b.hue;
  });
  bloom.geometry.setAttribute("aHue", new THREE.InstancedBufferAttribute(hues, 1));
  bloom.frustumCulled = false;
  const trunkMesh = new THREE.Mesh(trunks.build(), toonMaterial({ color: 0xffffff, shade: 0x2a2440, ink: 53, rim: 0.6, vertexColors: true }));
  trunkMesh.frustumCulled = false;
  group.add(bloom, trunkMesh);

  return { group, fire, spots };
}
