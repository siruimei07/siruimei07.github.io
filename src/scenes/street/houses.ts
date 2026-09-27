import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { groundY, rng, SHORE_Z, shoreZ, STREET_HALF, streetY, WALK } from "./layout";

// The town: instanced two-storey houses with gable roofs along the slope
// street, a hillside of houses, apartment blocks and warehouses down to the
// shore, and round anime trees. Windows are drawn by the wall shader (lit
// rooms, half-drawn curtains) and melt into their average far away.

type Lot = { x: number; y: number; z: number; w: number; d: number; h: number; rot: number; roof: number; kind: number };

const bodyGeo = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

/** Unit gable roof: footprint 1×1 at y = 0, ridge along x at y = 1, small eaves. */
const roofGeo = () => {
  const e = 0.06;
  const hw = 0.5 + e;
  const hd = 0.5 + e;
  const v = [
    // two slopes
    -hw, 0, hd, hw, 0, hd, hw, 1, 0, -hw, 0, hd, hw, 1, 0, -hw, 1, 0,
    hw, 0, -hd, -hw, 0, -hd, -hw, 1, 0, hw, 0, -hd, -hw, 1, 0, hw, 1, 0,
    // gables
    -hw, 0, -hd, -hw, 0, hd, -hw, 1, 0, hw, 0, hd, hw, 0, -hd, hw, 1, 0,
    // underside
    -hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, -hd, hw, 0, hd, -hw, 0, hd,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
};

function streetLots(rand: () => number): Lot[] {
  const lots: Lot[] = [];
  for (const side of [-1, 1]) {
    let z = 6;
    while (z > SHORE_Z + 22) {
      const w = 8 + rand() * 3;
      const zc = z - w / 2;
      z -= w + 1.2 + rand() * 2.5;
      // the vacant lot with the bamboo grove, right side near the top
      if (side > 0 && zc < -8 && zc > -46) continue;
      const d = 7 + rand() * 3;
      const set = 1.2 + rand() * 1.6;
      const x = side * (STREET_HALF + WALK + set + d / 2);
      const kind = rand() < 0.12 ? 1 : 0;
      const h = kind ? 9 + rand() * 4 : 5.6 + rand() * 1.4;
      lots.push({ x, y: streetY(zc) + 0.3, z: zc, w: d, d: w, h, rot: 0, roof: kind ? 0 : 1, kind });
    }
  }
  return lots;
}

function hillLots(rand: () => number, density: number): Lot[] {
  const lots: Lot[] = [];
  const step = 13;
  for (let z = 2; z > -900; z -= step) {
    for (let x = -1500; x <= 1500; x += step) {
      const jx = x + (rand() - 0.5) * step * 0.8;
      const jz = z + (rand() - 0.5) * step * 0.8;
      const ax = Math.abs(jx);
      if (ax < STREET_HALF + WALK + 14) continue;
      // keep the near hillside clear (the bamboo grove, the view down the street)
      if (ax < 48 && jz > -64) continue;
      const sz = shoreZ(jx);
      if (jz < sz + 18) continue;
      // fewer houses far away and on the steep headland hills
      const far = Math.hypot(jx, jz) / 1500;
      const keep = (0.78 - far * 0.45) * density;
      if (rand() > keep) continue;
      const y = groundY(jx, jz);
      const slope = Math.abs(groundY(jx + 4, jz) - groundY(jx - 4, jz)) + Math.abs(groundY(jx, jz + 4) - groundY(jx, jz - 4));
      if (slope > 9) continue;
      const nearShore = jz < sz + 70;
      const r = rand();
      let kind = 0;
      if (nearShore && r < 0.35) kind = 2; // warehouse / mid-rise
      else if (r < 0.1) kind = 1; // apartment block
      const w = kind === 2 ? 18 + rand() * 24 : kind === 1 ? 12 + rand() * 8 : 7 + rand() * 3;
      const d = kind === 2 ? 12 + rand() * 12 : kind === 1 ? 9 + rand() * 4 : 7 + rand() * 3;
      const h = kind === 2 ? 8 + rand() * 18 : kind === 1 ? 11 + rand() * 9 : 5.4 + rand() * 1.6;
      lots.push({ x: jx, y: y + 0.2, z: jz, w, d, h, rot: (rand() - 0.5) * 0.5 + (rand() < 0.3 ? Math.PI / 2 : 0), roof: kind === 0 ? 1 : 0, kind });
    }
  }
  return lots;
}

export function buildHouses(density: number): THREE.Object3D {
  const rand = rng(20260926);
  const lots = [...streetLots(rand), ...hillLots(rand, density)];
  const group = new THREE.Group();

  const n = lots.length;
  const body = new THREE.InstancedMesh(
    bodyGeo(),
    toonMaterial({
      color: 0x8ea6d8,
      shade: 0x2d3d74,
      ink: 5,
      rim: 0.7,
      step: 0.12,
      vertexHead: /* glsl */ `
        attribute vec3 aSize;
        attribute float aSeed;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying float vSeed;`,
      vertex: /* glsl */ `
        vLocal = position * aSize;
        vLocalN = normal;
        vSize = aSize;
        vSeed = aSeed;`,
      fragmentHead: /* glsl */ `
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying float vSeed;`,
      fragment: /* glsl */ `
        vec3 ln = floor(vLocalN + 0.5);
        if (abs(ln.y) < 0.5) {
          bool sideX = abs(ln.x) > 0.5;
          float faceW = sideX ? vSize.z : vSize.x;
          float u = (sideX ? vLocal.z : vLocal.x) / faceW + 0.5;
          float v = vLocal.y;
          float floorH = 2.85;
          float floors = floor(vSize.y / floorH);
          float fl = floor(v / floorH);
          float fv = fract(v / floorH);
          float cells = max(1.0, floor(faceW / 2.6));
          float cu = u * cells;
          float ci = floor(cu);
          float fu = fract(cu);
          float win = step(0.2, fu) * step(fu, 0.8) * step(0.34, fv) * step(fv, 0.8) * step(fl, floors - 1.0) * step(0.6, v);
          float h = hash13(vec3(ci, fl, vSeed * 97.0 + (ln.x + ln.z * 3.0) * 11.0));
          float houseLit = 0.25 + 0.55 * hash11(vSeed * 13.1);
          float lit = step(1.0 - houseLit, h);
          float curtain = step(fu, 0.2 + 0.6 * hash11(h * 71.0)) + step(0.7, hash11(h * 13.0));
          vec3 warm = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.86, 0.62), hash11(h * 31.0)) * mix(1.6, 2.6, hash11(h * 5.0));
          if (hash11(h * 3.7) < 0.12) warm = vec3(0.7, 0.86, 1.0) * 1.8;
          // melt the pattern into its average when a window gets smaller than ~2 px
          float px = max(fwidth(cu), fwidth(v / floorH));
          float avg = 0.36 * 0.46 * houseLit;
          float detail = smoothstep(0.6, 0.25, px);
          vec3 glass = vec3(0.05, 0.08, 0.2);
          float w = mix(avg * 1.4, win, detail);
          float e = mix(avg, win * lit * min(1.0, curtain), detail);
          base = mix(base, glass, w * 0.85);
          shade = mix(shade, glass * 0.8, w * 0.85);
          emis += warm * e;
          // sky light: walls brighten toward the eaves
          float up = saturate((vLocal.y - 4.0) / max(1.0, vSize.y - 4.0));
          shade *= 0.82 + 0.3 * up;
        } else {
          base *= 0.8; shade *= 0.85;
        }`,
    }),
    n,
  );
  const roof = new THREE.InstancedMesh(
    roofGeo(),
    toonMaterial({
      color: 0x6f88c6,
      shade: 0x18224a,
      ink: 6,
      rim: 0.9,
      step: 0.35,
      fragment: /* glsl */ `
        float tile = step(0.86, fract(vWorldPos.y * 3.2 + vWorldPos.x * 0.02));
        base *= 1.0 - tile * 0.18; shade *= 1.0 - tile * 0.25;`,
    }),
    n,
  );

  const sizes = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const wallCol = new THREE.Color();
  const roofCol = new THREE.Color();
  const palette = [0xdfe6f7, 0xf1ead8, 0xc9d3ea, 0xe6dccd, 0xb9c6e4, 0xf4f1ea];
  const roofPal = [0x6d86c4, 0x5b6fa8, 0x7a7fae, 0x4f6aa6, 0x8a93bf];
  let roofCount = 0;
  lots.forEach((l, i) => {
    const sink = 4;
    q.setFromAxisAngle(up, l.rot);
    m.compose(new THREE.Vector3(l.x, l.y - sink, l.z), q, new THREE.Vector3(l.w, l.h + sink, l.d));
    body.setMatrixAt(i, m);
    sizes.set([l.w, l.h + sink, l.d], i * 3);
    seeds[i] = rand() * 100;
    wallCol.setHex(palette[Math.floor(rand() * palette.length)]).multiplyScalar(l.kind === 2 ? 0.8 : 1);
    body.setColorAt(i, wallCol);
    if (l.roof) {
      const rh = Math.min(l.w, l.d) * 0.3;
      const ridgeAlongX = l.w >= l.d;
      const rq = new THREE.Quaternion().setFromAxisAngle(up, l.rot + (ridgeAlongX ? 0 : Math.PI / 2));
      m.compose(new THREE.Vector3(l.x, l.y + l.h, l.z), rq, new THREE.Vector3(ridgeAlongX ? l.w : l.d, rh, ridgeAlongX ? l.d : l.w));
      roof.setMatrixAt(roofCount, m);
      roofCol.setHex(roofPal[Math.floor(rand() * roofPal.length)]);
      roof.setColorAt(roofCount, roofCol);
      roofCount++;
    }
  });
  body.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  body.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  roof.count = roofCount;
  body.frustumCulled = false;
  roof.frustumCulled = false;
  group.add(body, roof);

  // Anime trees: squashed low-poly blobs, clustered on the hills and gardens.
  const treeGeo = new THREE.IcosahedronGeometry(1, 1);
  const trees = new THREE.InstancedMesh(
    treeGeo,
    toonMaterial({ color: 0x3f6f78, shade: 0x13283d, ink: 7, rim: 0.9, step: 0.15, soft: 0.02 }),
    Math.round(1400 * density),
  );
  let tc = 0;
  const tcol = new THREE.Color();
  for (let i = 0; i < trees.count * 4 && tc < trees.count; i++) {
    const x = (rand() * 2 - 1) * 1700;
    const z = 20 - rand() * 1100;
    if (Math.abs(x) < 9) continue;
    if (Math.abs(x) < 40 && z > -80) continue;
    const sz = shoreZ(x);
    if (z < sz + 10) continue;
    const hilly = groundY(x, z) - streetY(z * (SHORE_Z / Math.min(-1, sz)));
    if (rand() > 0.2 + Math.min(0.8, hilly / 40)) continue;
    const s = 3 + rand() * 5;
    q.setFromAxisAngle(up, rand() * 6.28);
    m.compose(new THREE.Vector3(x, groundY(x, z) + s * 0.5, z), q, new THREE.Vector3(s, s * (0.8 + rand() * 0.5), s));
    trees.setMatrixAt(tc, m);
    tcol.setHSL(0.47 + rand() * 0.08, 0.3, 0.45 + rand() * 0.15);
    trees.setColorAt(tc, tcol);
    tc++;
  }
  trees.count = tc;
  trees.frustumCulled = false;
  group.add(trees);
  return group;
}
