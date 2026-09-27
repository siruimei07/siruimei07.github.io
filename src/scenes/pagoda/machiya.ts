import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { GeoBuilder } from "./geo";
import type { Lanterns } from "./lanterns";
import { STREET_HALF, STREET_Z, streetY } from "./layout";

// The old-town street: dark-timbered ryokan and shops, two to four storeys,
// with pent roofs (庇) between the floors, railed balconies, tiled hip roofs,
// glowing shoji and lattice fronts. All instanced: storey boxes (the facade
// shader draws posts, shoji, shop fronts, noren and plaster), pent roofs,
// main roofs, balcony slabs and railing panels. Lantern rows hang under the
// eaves; lantern ropes sag across the street between the two rows.

type Lot = { side: -1 | 1; zc: number; w: number; depth: number; x: number; y: number; floors: number[]; seed: number };

const FLOOR0 = 3.7;

function lots(rand: () => number): Lot[] {
  const out: Lot[] = [];
  for (const side of [-1, 1] as const) {
    let z = STREET_Z[0];
    while (z > STREET_Z[1] + 3) {
      const w = Math.min(z - STREET_Z[1], side < 0 ? 7 + rand() * 5 : 6 + rand() * 4.5);
      const zc = z - w / 2;
      z -= w + 0.15 + (rand() < 0.15 ? 1.0 : 0);
      // taller near the viewer, lower toward the temple so the pagoda rises over them
      const far = THREE.MathUtils.smoothstep(-zc, 10, 40);
      const maxN = side < 0 ? 4 - Math.round(far * 1.6) : 2;
      const n = Math.max(2, maxN - (side < 0 && rand() < 0.35 ? 1 : 0));
      const floors: number[] = [];
      for (let i = 0; i < n; i++) floors.push(i === 0 ? FLOOR0 : 2.9 + rand() * 0.35);
      const depth = 10 + rand() * 4;
      const set = rand() * 0.3;
      out.push({ side, zc, w, depth, x: side * (STREET_HALF + set + depth / 2), y: streetY(zc + w / 2) - 0.1, floors, seed: rand() * 100 });
    }
  }
  return out;
}

const boxUnit = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

/** Pent roof (庇) projecting along +x from x = 0: sloped slab, 1 unit deep, 0.42 drop, unit length along z. */
function pentGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const slab = new THREE.BoxGeometry(1, 0.12, 1);
  const m = new THREE.Matrix4().makeRotationZ(-Math.atan2(0.42, 1)).premultiply(new THREE.Matrix4().makeTranslation(0.5, -0.21, 0));
  b.add(slab, m);
  // fascia board along the front edge
  b.add(new THREE.BoxGeometry(0.06, 0.2, 1), new THREE.Matrix4().makeTranslation(1.0, -0.47, 0));
  return b.build();
}

/** Hip roof over a unit footprint (−0.5…0.5 in x and z), eaves at y = 0, ridge at y = 1. */
function hipGeo(ridge: number): THREE.BufferGeometry {
  const e = 0.5;
  const v = [
    // long slopes (±x)
    -e, 0, -e, -e, 0, e, 0, 1, ridge, -e, 0, -e, 0, 1, ridge, 0, 1, -ridge,
    e, 0, e, e, 0, -e, 0, 1, -ridge, e, 0, e, 0, 1, -ridge, 0, 1, ridge,
    // hips (±z)
    -e, 0, e, e, 0, e, 0, 1, ridge,
    e, 0, -e, -e, 0, -e, 0, 1, -ridge,
    // underside
    -e, 0, -e, e, 0, -e, e, 0, e, -e, 0, -e, e, 0, e, -e, 0, e,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((v.length / 3) * 2), 2));
  g.computeVertexNormals();
  return g;
}

export function buildMachiya(density: number, lanterns: Lanterns) {
  const rand = rng(51772);
  const L = lots(rand);
  const group = new THREE.Group();

  type Inst = { m: THREE.Matrix4; size: THREE.Vector3; info: THREE.Vector4; col: THREE.Color };
  const bodies: Inst[] = [];
  const pents: Inst[] = [];
  const roofs: Inst[] = [];
  const slabs: Inst[] = [];
  const railsI: Inst[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const wallPal = [0x6a6258, 0x5c544a, 0x70685e, 0x564e46];

  // lantern ropes across the street: every ~9 m, from eave to eave
  const eaveY: { side: number; z0: number; z1: number; y: number }[] = [];

  for (const l of L) {
    let y = l.y;
    const fx = l.x - (l.side * l.depth) / 2; // facade x
    const n = l.floors.length;
    for (let i = 0; i < n; i++) {
      const h = l.floors[i];
      const inset = i === n - 1 && n > 2 && rand() < 0.4 ? 0.5 : 0;
      const d = l.depth - inset;
      const cx = fx + (l.side * d) / 2 + l.side * inset;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, y, l.zc), q, new THREE.Vector3(d, h, l.w));
      const col = new THREE.Color(wallPal[Math.floor(rand() * wallPal.length)]);
      bodies.push({ m, size: new THREE.Vector3(d, h, l.w), info: new THREE.Vector4(i, n, l.side, l.seed + i * 7.3), col });
      const top = y + h;
      const fxi = fx + l.side * inset;
      if (i < n - 1) {
        // pent roof above this storey, projecting toward the street
        const proj = i === 0 ? 1.25 : 0.95;
        q.setFromAxisAngle(up, l.side < 0 ? 0 : Math.PI);
        const pm = new THREE.Matrix4().compose(new THREE.Vector3(fxi, top + 0.05, l.zc), q, new THREE.Vector3(proj, proj, l.w + 0.3));
        pents.push({ m: pm, size: new THREE.Vector3(proj, proj, l.w), info: new THREE.Vector4(i, 0, l.side, l.seed), col: new THREE.Color(0xffffff) });
        q.identity();
        // lanterns under the pent roof edge
        const edgeX = fxi - l.side * proj;
        const edgeY = top + 0.05 - 0.42 * proj - 0.2;
        if (i === 0 || rand() < 0.5) {
          const count = Math.max(2, Math.round(l.w / 1.15));
          const s = i === 0 ? 0.5 : 0.44;
          for (let k = 0; k < count; k++) {
            const z = l.zc - l.w / 2 + (k + 0.5) * (l.w / count);
            lanterns.add(new THREE.Vector3(edgeX - l.side * 0.05, edgeY - s * 0.62, z), s, rand() < 0.08 ? 1 : 0);
          }
        }
        if (i === n - 2) eaveY.push({ side: l.side, z0: l.zc - l.w / 2, z1: l.zc + l.w / 2, y: top + 0.05 });
      }
      y = top;
    }
    // main roof
    const over = 0.95;
    const rh = Math.min(l.depth, l.w) * 0.28;
    const ridgeAlongZ = l.w >= l.depth * 0.8;
    const rw = l.depth + 2 * over;
    const rl = l.w + 2 * over;
    q.setFromAxisAngle(up, ridgeAlongZ ? 0 : Math.PI / 2);
    const rm = new THREE.Matrix4().compose(new THREE.Vector3(l.x, y, l.zc), q, ridgeAlongZ ? new THREE.Vector3(rw, rh, rl) : new THREE.Vector3(rl, rh, rw));
    roofs.push({ m: rm, size: new THREE.Vector3(rw, rh, rl), info: new THREE.Vector4(0, 0, l.side, l.seed), col: new THREE.Color(0xffffff) });
    q.identity();
    // lanterns along the main eave for some of the tall ones
    if (n >= 3 && rand() < 0.6) {
      const edgeX = fx - l.side * over;
      const count = Math.round(l.w / 1.2);
      for (let k = 0; k < count; k++) {
        const z = l.zc - l.w / 2 + (k + 0.5) * (l.w / count);
        lanterns.add(new THREE.Vector3(edgeX + l.side * 0.1, y - 0.55, z), 0.46, 0);
      }
    }
    if (n <= 2) eaveY.push({ side: l.side, z0: l.zc - l.w / 2, z1: l.zc + l.w / 2, y: y - 0.1 });
  }

  // balconies: a slab and a railing panel on the upper storeys' facades
  for (const bI of bodies) {
    const [i, , side] = bI.info.toArray();
    if (i < 1) continue;
    if (((bI.info.w * 13.7) % 1) > 0.55) continue;
    const p = new THREE.Vector3().setFromMatrixPosition(bI.m);
    const fx = p.x - (side * bI.size.x) / 2;
    const bd = 0.8;
    const bx = fx - side * bd * 0.5;
    slabs.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(bx, p.y - 0.02, p.z), q, new THREE.Vector3(bd, 0.16, bI.size.z - 0.6)), size: new THREE.Vector3(bd, 0.16, bI.size.z), info: new THREE.Vector4(), col: new THREE.Color(0xffffff) });
    q.setFromAxisAngle(up, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    railsI.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(fx - side * (bd - 0.04), p.y + 0.14, p.z), q, new THREE.Vector3(bI.size.z - 0.6, 0.95, 1)), size: new THREE.Vector3(bI.size.z - 0.6, 0.95, 1), info: new THREE.Vector4(), col: new THREE.Color(0xffffff) });
    q.identity();
  }

  // ---- materials
  const warmWash = /* glsl */ `
    // lantern light washing the facade just under each eave
    float wash = exp(-max(vSizeTop - vLocal.y, 0.0) / 1.1) * step(0.5, facade);
    emis += vec3(1.0, 0.55, 0.25) * base * wash * 0.55;`;
  const body = new THREE.InstancedMesh(
    boxUnit(),
    toonMaterial({
      color: 0xffffff,
      shade: 0x4a4668,
      ink: 30,
      rim: 0.6,
      step: 0.1,
      vertexHead: /* glsl */ `
        attribute vec3 aSize;
        attribute vec4 aInfo;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        varying float vSizeTop;
        flat varying vec4 vInfo;`,
      vertex: /* glsl */ `
        vLocal = position * aSize;
        vLocalN = normal;
        vSize = aSize;
        vSizeTop = aSize.y;
        vInfo = aInfo;`,
      fragmentHead: /* glsl */ `
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        varying float vSizeTop;
        flat varying vec4 vInfo;`,
      fragment: /* glsl */ `
        vec3 ln = floor(vLocalN + 0.5);
        float storey = vInfo.x;
        float side = vInfo.z;
        float seed = vInfo.w;
        float facade = step(0.5, -ln.x * side);
        vec3 wood = vec3(0.028, 0.013, 0.009);
        vec3 plaster = vTint;
        vec3 glowC = vec3(1.0, 0.42, 0.12);
        vec3 c = plaster;
        float glow = 0.0;
        if (abs(ln.y) < 0.5) {
          float u = abs(ln.x) > 0.5 ? vLocal.z : vLocal.x;
          float faceW = abs(ln.x) > 0.5 ? vSize.z : vSize.x;
          float y = vLocal.y;
          float h = vSize.y;
          float cells = max(1.0, floor(faceW / 1.8));
          float cu = (u / faceW + 0.5) * cells;
          float ci = floor(cu);
          float fu = fract(cu);
          float bw = faceW / cells;
          float post = step(fu * bw, 0.1) + step(bw - 0.1, fu * bw);
          float px = max(fwidth(cu), fwidth(y / 0.35));
          float detail = smoothstep(0.9, 0.3, px);
          float hsh = hash13(vec3(ci, storey, seed));
          if (facade > 0.5) {
            if (storey < 0.5) {
              // shop front: dark lattice (格子) over a dim interior; some bays open, with noren
              c = wood;
              if (y > 0.45 && y < h - 0.5) {
                float open = step(0.62, hsh);
                float slat = smoothstep(0.28, 0.42, abs(fract(u / 0.1) - 0.5));
                float nor = open * step(h - 1.35, y);
                float inside = mix(0.16, 0.5, open) * (0.8 + 0.4 * hash11(hsh * 9.0));
                float see = mix(slat * detail + (1.0 - detail) * 0.5, 1.0, open) * (1.0 - nor);
                c = mix(wood, vec3(0.01, 0.012, 0.04), nor);
                // noren: a pale crest in the middle of each curtain
                float crest = nor * smoothstep(0.16, 0.12, length(vec2(fu - 0.5, (y - (h - 0.9)) / bw) * vec2(1.0, bw)));
                c = mix(c, vec3(0.5, 0.47, 0.4), crest);
                emis += glowC * inside * see;
              }
            } else {
              // upper floors: shoji windows between posts, dark boards below, plaster frieze
              c = mix(wood, plaster * 0.8, step(h - 0.4, y));
              float win = step(0.95, y) * step(y, h - 0.62) * step(0.26, fu * bw) * step(fu * bw, bw - 0.26);
              float gx = smoothstep(0.42, 0.47, abs(fract(fu * bw / 0.34) - 0.5));
              float gy = smoothstep(0.42, 0.47, abs(fract((y - 0.95) / 0.4) - 0.5));
              float grid = max(gx, gy) * detail;
              float lit = step(0.42, hsh);
              vec3 paper = mix(vec3(1.0, 0.5, 0.17), vec3(1.0, 0.33, 0.08), hash11(hsh * 7.0));
              vec3 dim = vec3(0.045, 0.05, 0.075);
              c = mix(c, mix(dim, wood, grid), win);
              emis += paper * win * (1.0 - grid) * lit * (0.75 + 0.8 * hash11(hsh * 3.0));
            }
          } else {
            // side and back walls: plaster between dark timber
            float beam = step(h - 0.28, y) + step(y, 0.22);
            float t = max(post, beam);
            c = mix(plaster, wood, t * detail + (1.0 - detail) * 0.25);
            float small = step(0.82, hsh) * step(h * 0.45, y) * step(y, h * 0.75) * step(0.3, fu) * step(fu, 0.7);
            emis += glowC * small * 1.2 * detail;
          }
          if (px > 0.9) { c = mix(c, (plaster + wood) * 0.5, 0.5); }
          base = c;
          shade = c * vec3(0.42, 0.42, 0.58);
          ${warmWash}
        } else {
          base = wood; shade = wood * 0.6;
        }`,
    }),
    bodies.length,
  );
  const sizes = new Float32Array(bodies.length * 3);
  const infos = new Float32Array(bodies.length * 4);
  bodies.forEach((b, i) => {
    body.setMatrixAt(i, b.m);
    body.setColorAt(i, b.col);
    sizes.set(b.size.toArray(), i * 3);
    infos.set(b.info.toArray(), i * 4);
  });
  body.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  body.geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(infos, 4));
  body.frustumCulled = false;
  group.add(body);

  const tileTop = /* glsl */ `
    float ch = abs(fract(dot(vWorldPos.xz, vec2(0.7071)) / 0.3) - 0.5);
    float line = smoothstep(0.08, 0.18, ch);
    base *= 0.75 + 0.25 * line; shade *= 0.8 + 0.2 * line;`;
  const pent = new THREE.InstancedMesh(
    pentGeo(),
    toonMaterial({
      color: 0x3a4460,
      shade: 0x0c1124,
      ink: 31,
      rim: 0.8,
      step: 0.25,
      fragment: /* glsl */ `
        if (n.y < -0.3) {
          // underside: rafters lit warm by the lanterns
          float r = smoothstep(0.3, 0.2, abs(fract((vWorldPos.z) / 0.45) - 0.5));
          vec3 w = mix(vec3(0.008, 0.004, 0.004), vec3(0.03, 0.012, 0.006), r);
          base = w; shade = w;
          emis += vec3(1.0, 0.5, 0.2) * w * 0.9;
        } else if (abs(n.y) < 0.3) {
          base = vec3(0.018, 0.008, 0.006); shade = base * 0.7;
          emis += vec3(1.0, 0.5, 0.2) * base * 0.5;
        } else {
          ${tileTop}
        }`,
    }),
    pents.length,
  );
  pents.forEach((p, i) => pent.setMatrixAt(i, p.m));
  pent.frustumCulled = false;
  group.add(pent);

  const roof = new THREE.InstancedMesh(
    hipGeo(0.22),
    toonMaterial({
      color: 0x36405c,
      shade: 0x0b1022,
      ink: 32,
      rim: 1.0,
      step: 0.3,
      fragment: /* glsl */ `
        if (n.y < -0.5) {
          float r = smoothstep(0.3, 0.2, abs(fract((vWorldPos.z + vWorldPos.x) / 0.45) - 0.5));
          vec3 w = mix(vec3(0.007, 0.004, 0.004), vec3(0.025, 0.01, 0.006), r);
          base = w; shade = w;
          emis += vec3(1.0, 0.5, 0.2) * w * 0.6;
        } else {
          ${tileTop}
        }`,
    }),
    roofs.length,
  );
  roofs.forEach((r, i) => roof.setMatrixAt(i, r.m));
  roof.frustumCulled = false;
  group.add(roof);

  const slab = new THREE.InstancedMesh(boxUnit(), toonMaterial({ color: 0x4a2c1c, shade: 0x160c10, ink: 33, rim: 0.5 }), Math.max(1, slabs.length));
  slabs.forEach((s, i) => slab.setMatrixAt(i, s.m));
  slab.count = slabs.length;
  slab.frustumCulled = false;
  group.add(slab);

  const railGeo = new THREE.PlaneGeometry(1, 1);
  railGeo.translate(0, 0.5, 0);
  const rail = new THREE.InstancedMesh(
    railGeo,
    toonMaterial({
      color: 0x3a2216,
      shade: 0x120a0c,
      ink: 34,
      rim: 0.6,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      vertexHead: /* glsl */ `varying vec2 vLen;`,
      vertex: /* glsl */ `vLen = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));`,
      fragmentHead: /* glsl */ `varying vec2 vLen;`,
      fragment: /* glsl */ `
        float x = vUv.x * vLen.x;
        float y = vUv.y * vLen.y;
        float post = step(abs(fract(x / 0.9) - 0.5), 0.05);
        float rails = step(vLen.y - 0.09, y) + step(y, 0.08) + step(abs(y - vLen.y * 0.55), 0.03);
        float bal = step(abs(fract(x / 0.14) - 0.5), 0.13) * step(y, vLen.y * 0.55);
        alpha = max(max(post, rails), bal);
        if (alpha < 0.5) discard;`,
    }),
    Math.max(1, railsI.length),
  );
  railsI.forEach((r, i) => rail.setMatrixAt(i, r.m));
  rail.count = railsI.length;
  rail.frustumCulled = false;
  group.add(rail);

  // Lantern ropes across the street, pairing eaves on the two sides.
  const left = eaveY.filter((e) => e.side < 0);
  const right = eaveY.filter((e) => e.side > 0);
  const eaveAt = (list: typeof eaveY, z: number) => list.find((e) => z <= e.z1 && z >= e.z0);
  let count = 0;
  for (let z = 26; z > -190; z -= 8.5 + rand() * 3) {
    const a = eaveAt(left, z);
    const b = eaveAt(right, z + (rand() - 0.5) * 3);
    const ya = a ? a.y - 0.3 : 8.5;
    const yb = b ? b.y - 0.3 : 5.2;
    const pa = new THREE.Vector3(-STREET_HALF - 0.6, ya, z);
    const pb = new THREE.Vector3(STREET_HALF + 0.6, yb, z + (rand() - 0.5) * 4);
    const nl = Math.round(9 * (0.7 + 0.3 * density));
    lanterns.string(pa, pb, 1.1 + rand() * 0.6, nl, 0.42, count % 3 === 1 ? 2 : 0);
    count++;
  }

  return { group };
}
