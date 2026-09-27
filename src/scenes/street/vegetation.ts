import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { groundY, POLE_X, rng, STREET_HALF, streetY, WALK } from "./layout";

// Moon-viewing grass (susuki) and a bamboo grove — the two plants of the
// Taketori tale's night. Both sway in the vertex shader; plumes and leaves are
// procedural cut-outs with alpha-to-coverage edges.

/** A curved strip of `segs` segments; uv.y runs 0 → 1 up the blade. */
function strip(segs: number, width: number, height: number, curve: number, taper = 1): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * (1 - t * taper * 0.9);
    const z = curve * t * t;
    pos.push(-w / 2, t * height, z, w / 2, t * height, z);
    uv.push(0, t, 1, t);
    nrm.push(0, -2 * curve * t, 1, 0, -2 * curve * t, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

const windVertex = (amp: string, stiff: string) => /* glsl */ `
  float h = pow(uv.y, ${stiff});
  float ph = dot(wp.xz, vec2(0.11, 0.07));
  float gust = 0.6 + 0.4 * sin(uTime * 0.35 + wp.x * 0.01);
  float sway = (sin(uTime * 1.35 + ph) * 0.65 + sin(uTime * 2.3 + ph * 1.7) * 0.25) * gust;
  vec2 wdir = normalize(uWind.xz);
  wp.xz += wdir * sway * ${amp} * h;
  wp.y -= abs(sway) * ${amp} * h * 0.25;
`;

export function buildSusuki(density: number): THREE.Object3D {
  const rand = rng(1508);
  const group = new THREE.Group();
  // Where the grass grows: the vacant lot by the gaming pole, the roadside
  // edges, a few clumps in front of the viewer.
  const clumps: [number, number, number, number][] = []; // x, z, radius, count
  for (let i = 0; i < 26; i++) clumps.push([POLE_X + 2.5 + rand() * 20, -10 - rand() * 34, 1.2 + rand() * 1.4, 18]);
  for (let i = 0; i < 16; i++) {
    const z = -2 - rand() * 120;
    clumps.push([-(STREET_HALF + WALK + 0.8 + rand() * 1.2), z, 0.8, 8]);
  }
  clumps.push([POLE_X + 1.6, -15.5, 1.3, 16], [POLE_X + 2.4, -22, 1.2, 14], [-(STREET_HALF + WALK) - 1.4, 2.0, 1.4, 14]);

  const blades: { x: number; z: number; y: number; h: number; rot: number; lean: number }[] = [];
  for (const [cx, cz, r, count] of clumps) {
    const n = Math.round(count * (0.5 + 0.5 * density));
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * r;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      const onLot = x > STREET_HALF + WALK;
      const y = Math.abs(x) < STREET_HALF + WALK + 1 ? streetY(z) + 0.1 : onLot ? Math.max(streetY(z) + 0.1, groundY(x, z) * 0 + streetY(z) + 0.1) : groundY(x, z);
      blades.push({ x, z, y, h: 1.2 + rand() * 1.1, rot: rand() * Math.PI * 2, lean: 0.25 + rand() * 0.45 });
    }
  }

  const leafGeo = strip(6, 0.035, 1, 0.35);
  const plumeGeo = strip(8, 0.22, 0.42, 0.18, 0.6);
  const n = blades.length;
  const leaves = new THREE.InstancedMesh(
    leafGeo,
    toonMaterial({
      color: 0x4d7f8f,
      shade: 0x14283a,
      ink: 30,
      rim: 1.2,
      side: THREE.DoubleSide,
      vertex: windVertex("0.35", "1.8"),
    }),
    n * 3,
  );
  const plumes = new THREE.InstancedMesh(
    plumeGeo,
    toonMaterial({
      color: 0xe9f0ff,
      shade: 0x6d80ad,
      ink: 31,
      rim: 1.6,
      step: -0.1,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      vertex: windVertex("0.55", "1.2"),
      fragment: /* glsl */ `
        // feathery plume: a soft spindle with combed fringe
        float x = vUv.x * 2.0 - 1.0;
        float spindle = 1.0 - pow(abs(vUv.y * 2.0 - 0.85), 2.0);
        float comb = vnoise(vec2(vUv.x * 9.0, vUv.y * 38.0));
        alpha = smoothstep(0.0, 0.15, spindle - abs(x) * 1.05 + (comb - 0.5) * 0.55);
        if (alpha < 0.05) discard;
        base *= 0.9 + comb * 0.2;`,
    }),
    n,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let li = 0;
  blades.forEach((b, i) => {
    // stem + two leaves at different angles
    for (let k = 0; k < 3; k++) {
      e.set(b.lean * (k === 0 ? 0.35 : 0.9) * (k === 2 ? -1 : 1), b.rot + k * 2.1, 0);
      q.setFromEuler(e);
      const h = k === 0 ? b.h : b.h * (0.45 + rand() * 0.25);
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(k === 0 ? 0.6 : 1.4, h, 1));
      leaves.setMatrixAt(li++, m);
    }
    e.set(b.lean * 0.35 + 0.15, b.rot, 0);
    q.setFromEuler(e);
    const top = new THREE.Vector3(0, b.h * 0.93, 0).applyQuaternion(q);
    const pq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5 + rand() * 0.5, 0, 0)));
    m.compose(new THREE.Vector3(b.x + top.x, b.y + top.y, b.z + top.z), pq, new THREE.Vector3(1, 1 + rand() * 0.4, 1));
    plumes.setMatrixAt(i, m);
  });
  leaves.count = li;
  leaves.frustumCulled = false;
  plumes.frustumCulled = false;
  group.add(leaves, plumes);
  return group;
}

export function buildBamboo(density: number): THREE.Object3D {
  const rand = rng(8000); // eight thousand years, give or take
  const group = new THREE.Group();
  const stalks: { x: number; z: number; y: number; h: number; lean: THREE.Vector2; r: number }[] = [];
  const count = Math.round(46 * (0.6 + 0.4 * density));
  for (let i = 0; i < count; i++) {
    const x = POLE_X + 5 + rand() * 26 + (rand() < 0.3 ? 6 : 0);
    const z = -14 - rand() * 36;
    stalks.push({
      x,
      z,
      y: Math.max(groundY(x, z), streetY(z)),
      h: 12 + rand() * 9,
      lean: new THREE.Vector2((rand() - 0.6) * 0.18, (rand() - 0.2) * 0.14),
      r: 0.05 + rand() * 0.035,
    });
  }
  const stalkGeo = new THREE.CylinderGeometry(1, 1.1, 1, 8, 16, true);
  stalkGeo.translate(0, 0.5, 0);
  const stalkMesh = new THREE.InstancedMesh(
    stalkGeo,
    toonMaterial({
      color: 0x5f9e8f,
      shade: 0x173942,
      ink: 40,
      rim: 1.1,
      vertexHead: /* glsl */ `attribute vec2 aLean; varying float vH;`,
      vertex: /* glsl */ `
        float hh = uv.y;
        vH = position.y;
        wp.xz += aLean * hh * hh * 14.0;
        float sw = sin(uTime * 0.9 + wp.x * 0.3) * 0.25 + sin(uTime * 1.7 + wp.z * 0.2) * 0.1;
        wp.xz += normalize(uWind.xz) * sw * hh * hh;`,
      fragmentHead: /* glsl */ `varying float vH;`,
      fragment: /* glsl */ `
        // nodes: a dark hairline with a pale ring above it every ~0.45 m
        float y = vWorldPos.y * 2.2;
        float node = smoothstep(0.06, 0.0, abs(fract(y) - 0.02));
        float ring = smoothstep(0.1, 0.0, abs(fract(y) - 0.1));
        base = mix(base, base * 0.45, node); shade = mix(shade, shade * 0.5, node);
        base = mix(base, base * 1.25 + 0.05, ring * 0.6);`,
    }),
    stalks.length,
  );
  const leans = new Float32Array(stalks.length * 2);
  const m = new THREE.Matrix4();
  stalks.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(s.r, s.h, s.r));
    stalkMesh.setMatrixAt(i, m);
    leans.set([s.lean.x, s.lean.y], i * 2);
  });
  stalkMesh.geometry.setAttribute("aLean", new THREE.InstancedBufferAttribute(leans, 2));
  stalkMesh.frustumCulled = false;
  group.add(stalkMesh);

  // Leaf sprays: cards with 6 narrow leaves each, hung along the upper stalk.
  const card = new THREE.PlaneGeometry(1.6, 1.0);
  card.translate(0.7, 0, 0);
  const sprays: THREE.Matrix4[] = [];
  const sprayLean: number[] = [];
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const s of stalks) {
    const k = Math.round(10 + rand() * 8);
    for (let j = 0; j < k; j++) {
      const t = 0.45 + rand() * 0.55;
      const lx = s.lean.x * t * t * 14;
      const lz = s.lean.y * t * t * 14;
      e.set((rand() - 0.5) * 0.9, rand() * Math.PI * 2, -0.35 - rand() * 0.6);
      q.setFromEuler(e);
      const sc = 0.8 + rand() * 0.7;
      sprays.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x + lx, s.y + s.h * t, s.z + lz), q, new THREE.Vector3(sc, sc, sc)));
      sprayLean.push(t);
    }
  }
  const leafMesh = new THREE.InstancedMesh(
    card,
    toonMaterial({
      color: 0x6fae8c,
      shade: 0x163540,
      ink: 41,
      rim: 1.5,
      step: 0.0,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      vertexHead: /* glsl */ `attribute float aT;`,
      vertex: /* glsl */ `
        float sw = sin(uTime * 1.3 + wp.x * 0.4 + wp.y * 0.2) * 0.22 * aT;
        wp.xz += normalize(uWind.xz) * sw;
        wp.y += sin(uTime * 2.1 + wp.z) * 0.04;`,
      fragment: /* glsl */ `
        // six slender bamboo leaves fanning from the card's left edge
        vec2 p = vec2(vUv.x, vUv.y * 2.0 - 1.0);
        float a = 0.0;
        for (int i = 0; i < 6; i++) {
          float fi = float(i);
          float ang = (fi / 5.0 - 0.5) * 1.3;
          vec2 dir = vec2(cos(ang), sin(ang));
          float along = dot(p, dir);
          float across = abs(dot(p, vec2(-dir.y, dir.x)));
          float len = 0.78 + 0.2 * fract(fi * 0.618);
          float w = 0.07 * sin(clamp(along / len, 0.0, 1.0) * 3.1416);
          a = max(a, smoothstep(w, w - 0.02, across) * step(0.02, along) * step(along, len));
        }
        alpha = a;
        if (alpha < 0.05) discard;`,
    }),
    sprays.length,
  );
  sprays.forEach((mm, i) => leafMesh.setMatrixAt(i, mm));
  leafMesh.geometry.setAttribute("aT", new THREE.InstancedBufferAttribute(new Float32Array(sprayLean), 1));
  leafMesh.frustumCulled = false;
  group.add(leafMesh);
  return group;
}
