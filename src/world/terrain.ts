import * as THREE from "three";
import { toonMaterial } from "../engine/toon";
import { groundY, SHORE_Z, shoreZ, STREET_HALF, STREET_TOP_Z, streetY, WALK } from "./layout";

// The hillside (a non-uniform heightfield: fine near the viewer, coarse far
// away), the slope street with its sidewalks and curbs, and the harbour road.

function heightfield() {
  const NX = 150;
  const NZ = 110;
  const pos: number[] = [];
  const idx: number[] = [];
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i <= NX; i++) {
    const u = (i / NX) * 2 - 1;
    xs.push(Math.sign(u) * 2400 * Math.pow(Math.abs(u), 1.9));
  }
  for (let j = 0; j <= NZ; j++) {
    const v = j / NZ;
    zs.push(90 - 1250 * Math.pow(v, 1.55));
  }
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const x = xs[i];
      const z = zs[j];
      let y = groundY(x, z);
      // sink the terrain under the street corridor (the street mesh covers it)
      const corridor = 1 - THREE.MathUtils.smoothstep(Math.abs(x), STREET_HALF + WALK + 0.5, STREET_HALF + WALK + 3);
      if (z < STREET_TOP_Z + 40 && z > SHORE_Z - 4) y = THREE.MathUtils.lerp(y, streetY(z) - 0.6, corridor);
      pos.push(x, y, z);
    }
  }
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Street strip following streetY with raised sidewalks and curbs. */
function street() {
  const zs: number[] = [];
  for (let z = STREET_TOP_Z + 30; z > SHORE_Z - 4; z -= 2) zs.push(z);
  // cross-section (x, dy): asphalt crown, gutters, curbs, sidewalks, outer lip
  const H = STREET_HALF;
  const prof: [number, number][] = [
    [-H - WALK - 0.4, -0.4],
    [-H - WALK, 0.16],
    [-H, 0.16],
    [-H, 0.0],
    [-H + 0.4, -0.02],
    [0, 0.06],
    [H - 0.4, -0.02],
    [H, 0.0],
    [H, 0.16],
    [H + WALK, 0.16],
    [H + WALK + 0.4, -0.4],
  ];
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const P = prof.length;
  zs.forEach((z, j) => {
    const y0 = streetY(z);
    for (const [x, dy] of prof) {
      pos.push(x, y0 + dy, z);
      uv.push(x, z);
    }
    if (j > 0) {
      for (let i = 0; i < P - 1; i++) {
        const a = (j - 1) * P + i;
        const b = a + 1;
        const c = j * P + i;
        const d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Harbour road along the shore plus a seawall face. */
function harbour() {
  const pos: number[] = [];
  const idx: number[] = [];
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const x = -1600 + (3200 * i) / N;
    const sz = shoreZ(x);
    const inland = sz + 16;
    // road top (y ≈ 3), seawall edge, wall face down to the sea
    pos.push(x, 3.05, inland, x, 3.05, sz + 0.5, x, 2.6, sz, x, -1.5, sz - 0.3);
    if (i > 0) {
      const b = (i - 1) * 4;
      const c = i * 4;
      for (let k = 0; k < 3; k++) idx.push(b + k, c + k, b + k + 1, c + k, c + k + 1, b + k + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTerrain(): THREE.Object3D {
  const group = new THREE.Group();
  const ground = new THREE.Mesh(
    heightfield(),
    toonMaterial({
      color: 0x33506a,
      shade: 0x152443,
      ink: 2,
      rim: 0.25,
      step: 0.12,
      fragment: /* glsl */ `
        float g = fbm2(vWorldPos.xz * 0.012, 3);
        float patchy = step(0.5, g) * 0.08 - 0.04;
        base *= 1.0 + patchy; shade *= 1.0 + patchy * 0.6;`,
    }),
  );
  group.add(ground);

  const road = new THREE.Mesh(
    street(),
    toonMaterial({
      color: 0x2c3a5c,
      shade: 0x141d38,
      ink: 3,
      rim: 0.15,
      step: -0.2,
      fragment: /* glsl */ `
        float ax = abs(vUv.x);
        // asphalt vs sidewalk
        float walk = step(${STREET_HALF.toFixed(2)} + 0.02, ax);
        base = mix(base, vec3(0.34, 0.4, 0.56), walk);
        shade = mix(shade, vec3(0.16, 0.2, 0.34), walk);
        // white edge lines, faded paint
        float line = smoothstep(0.08, 0.05, abs(ax - (${(STREET_HALF - 0.55).toFixed(2)})));
        line *= 0.75 + 0.25 * step(0.3, vnoise(vUv * vec2(3.0, 0.6)));
        base = mix(base, vec3(0.78, 0.82, 0.92), line * (1.0 - walk));
        shade = mix(shade, vec3(0.36, 0.42, 0.6), line * (1.0 - walk));
        // sidewalk tiles
        float tile = step(0.94, fract(vUv.y * 0.5)) * walk;
        base *= 1.0 - tile * 0.12;`,
    }),
  );
  group.add(road);

  const harb = new THREE.Mesh(harbour(), toonMaterial({ color: 0x5a6f98, shade: 0x1c2848, ink: 4, rim: 0.3 }));
  group.add(harb);
  return group;
}
