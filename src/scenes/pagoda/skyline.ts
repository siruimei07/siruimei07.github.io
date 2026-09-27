import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { GeoBuilder } from "./geo";
import { TERRACE_Y } from "./layout";

// Behind the old town: Tsukuyomi's modern skyline. Towers in a broad arc
// (instanced boxes, some with set-back crowns and masts) whose window grids
// glow warm and cool and melt into their average far away, a few with LED
// strips and blinking aviation lights; and the tower with the green-lit
// tiered crown.

type Tower = { x: number; z: number; w: number; d: number; h: number; rot: number; kind: number };

export const GREEN_TOWER = { x: -51, z: -430, h: 240, w: 44 };

export function buildSkyline(density: number) {
  const rand = rng(3131);
  const group = new THREE.Group();
  const towers: Tower[] = [];
  const cx = 0;
  const cz = -40;
  const n = Math.round(150 * (0.6 + 0.4 * density));
  for (let i = 0; i < n * 3 && towers.length < n; i++) {
    const az = THREE.MathUtils.degToRad(-70 + rand() * 150);
    const r = 260 + Math.pow(rand(), 0.8) * 1100;
    const x = cx + Math.sin(az) * r;
    const z = cz - Math.cos(az) * r;
    const azd = THREE.MathUtils.radToDeg(az);
    // downtown right of the pagoda, a gap right behind its spire
    const core = Math.exp(-Math.pow((azd - 30) / 30, 2)) + 0.5 * Math.exp(-Math.pow((azd + 35) / 25, 2));
    let h = 60 + rand() * 90 + core * rand() * 260;
    if (azd > -9 && azd < 13) h = Math.min(h, 40 + r * 0.14);
    // nothing tall between the viewer and the airship
    if (r < 480 && azd > 10 && azd < 55) h = Math.min(h, 60 + rand() * 40);
    const w = 26 + rand() * 38;
    // keep the towers apart
    if (towers.some((t) => Math.hypot(t.x - x, t.z - z) < (t.w + w) * 0.62)) continue;
    const kind = rand() < 0.35 ? 1 : rand() < 0.2 ? 2 : 0;
    towers.push({ x, z, w, d: w * (0.7 + rand() * 0.5), h, rot: az + (rand() - 0.5) * 0.4, kind });
  }
  // the green-crowned tower
  towers.push({ x: GREEN_TOWER.x, z: GREEN_TOWER.z, w: GREEN_TOWER.w, d: GREEN_TOWER.w, h: GREEN_TOWER.h, rot: 0.3, kind: 3 });

  type Inst = { m: THREE.Matrix4; size: THREE.Vector3; seed: number; kind: number };
  const inst: Inst[] = [];
  const masts = new GeoBuilder();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const t of towers) {
    q.setFromAxisAngle(up, t.rot);
    const base = TERRACE_Y - 2;
    const lowH = t.kind === 1 ? t.h * (0.62 + rand() * 0.15) : t.h;
    inst.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, base, t.z), q, new THREE.Vector3(t.w, lowH, t.d)), size: new THREE.Vector3(t.w, lowH, t.d), seed: rand() * 100, kind: t.kind });
    if (t.kind === 1) {
      const s = 0.62 + rand() * 0.2;
      inst.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(t.x, base + lowH, t.z), q, new THREE.Vector3(t.w * s, t.h - lowH, t.d * s)), size: new THREE.Vector3(t.w * s, t.h - lowH, t.d * s), seed: rand() * 100, kind: 1 });
    }
    if (t.kind !== 3 && t.h > 150 && rand() < 0.6) {
      const mh = 12 + rand() * 30;
      masts.box(t.x, base + t.h + mh / 2, t.z, 1.2, mh, 1.2, 0, 0xffffff);
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(
    geo,
    toonMaterial({
      color: 0x2a3552,
      shade: 0x0c1226,
      ink: 0,
      rim: 1.2,
      step: 0.2,
      fog: 1.0,
      lights: 0,
      vertexHead: /* glsl */ `attribute vec3 aSize; attribute vec2 aSeed; varying vec3 vObj; varying vec3 vSize; flat varying vec2 vSeed; varying vec3 vObjN;`,
      vertex: /* glsl */ `vObj = position * aSize; vSize = aSize; vSeed = aSeed; vObjN = normal;`,
      fragmentHead: /* glsl */ `varying vec3 vObj; varying vec3 vSize; flat varying vec2 vSeed; varying vec3 vObjN;`,
      fragment: /* glsl */ `
        float seed = vSeed.x;
        if (abs(vObjN.y) < 0.5) {
          bool sx = abs(vObjN.x) > 0.5;
          float u = sx ? vObj.z : vObj.x;
          vec2 f = vec2(u + 100.0, vObj.y);
          vec2 cellSz = vec2(3.4, 4.0);
          vec2 cell = floor(f / cellSz);
          vec2 fr = fract(f / cellSz);
          float h = hash13(vec3(cell, seed + (sx ? 3.0 : 0.0)));
          float density = 0.25 + 0.5 * hash11(seed * 1.7);
          // lit rooms come in horizontal runs (whole offices on)
          float run = hash13(vec3(floor(cell.x / 4.0), cell.y, seed * 2.0));
          float on = step(1.0 - density, mix(h, run, 0.6));
          float win = step(0.18, fr.x) * step(fr.x, 0.82) * step(0.22, fr.y) * step(fr.y, 0.78) * step(3.0, vObj.y) * step(vObj.y, vSize.y - 2.5);
          vec3 wc = mix(vec3(1.0, 0.42, 0.1), vec3(1.0, 0.68, 0.32), hash11(h * 13.0));
          wc = mix(wc, vec3(0.35, 0.6, 1.0), step(0.85, hash11(h * 7.0 + seed)));
          float px = max(fwidth(f.x / cellSz.x), fwidth(f.y / cellSz.y));
          float detail = smoothstep(0.7, 0.3, px);
          float lit = mix(density * 0.36 * step(3.0, vObj.y), win * on, detail);
          base = mix(base, vec3(0.006, 0.008, 0.02), mix(0.3, win, detail) * 0.8);
          emis += wc * lit * 2.6;
          // vertical LED strips on some towers
          float led = step(0.8, hash11(seed * 5.3)) * step(abs(fract(u / 9.0) - 0.5), 0.03);
          vec3 ledC = hsv2rgb(vec3(fract(0.5 + 0.35 * hash11(seed)), 0.7, 1.0));
          emis += ledC * led * 2.2 * (0.7 + 0.3 * sin(uTime * 1.5 + vObj.y * 0.05 + seed));
          // aviation lights on the tall ones
          float top = step(vSize.y - 1.8, vObj.y) * step(120.0, vSize.y);
          float corner = step((sx ? vSize.z : vSize.x) * 0.5 - 1.5, abs(u));
          emis += vec3(1.0, 0.1, 0.06) * top * corner * step(0.5, fract(uTime * 0.5 + seed)) * 7.0;
        } else {
          base *= 0.6; shade *= 0.8;
        }`,
    }),
    inst.length,
  );
  const sizes = new Float32Array(inst.length * 3);
  const seeds = new Float32Array(inst.length * 2);
  inst.forEach((it, i) => {
    mesh.setMatrixAt(i, it.m);
    sizes.set(it.size.toArray(), i * 3);
    seeds.set([it.seed, it.kind], i * 2);
  });
  mesh.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  mesh.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 2));
  mesh.frustumCulled = false;
  group.add(mesh);

  // masts: thin, with a red light on top
  const mastMesh = new THREE.Mesh(
    masts.build(),
    toonMaterial({ color: 0x4a5878, shade: 0x141c34, ink: 0, lights: 0, rim: 1.0 }),
  );
  mastMesh.frustumCulled = false;
  group.add(mastMesh);

  // ---- the green crown: stacked rings of light tapering to a mast
  const G = GREEN_TOWER;
  const crown = new GeoBuilder();
  const top = TERRACE_Y - 2 + G.h;
  const rings = 9;
  for (let i = 0; i < rings; i++) {
    const r = 17 - i * 1.5;
    const y = top + 2 + i * 7.2;
    crown.add(new THREE.CylinderGeometry(r, r + 0.6, 2.2, 28, 1), new THREE.Matrix4().makeTranslation(G.x, y, G.z), 0xffffff, [1, i, 0, 0]);
    crown.add(new THREE.CylinderGeometry(r * 0.8, r * 0.86, 5.0, 28, 1, true), new THREE.Matrix4().makeTranslation(G.x, y + 3.6, G.z), 0xffffff, [0, i, 0, 0]);
  }
  crown.add(new THREE.CylinderGeometry(0.5, 2.8, 58, 10), new THREE.Matrix4().makeTranslation(G.x, top + 2 + rings * 7.2 + 26, G.z), 0xffffff, [2, 0, 0, 0]);
  const crownMesh = new THREE.Mesh(
    crown.build(true),
    toonMaterial({
      color: 0x24344c,
      shade: 0x0a1224,
      ink: 0,
      rim: 1.2,
      lights: 0,
      fog: 0.6,
      side: THREE.DoubleSide,
      vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart;`,
      vertex: /* glsl */ `vPart = aPart;`,
      fragmentHead: /* glsl */ `varying vec4 vPart;`,
      fragment: /* glsl */ `
        vec3 g = vec3(0.25, 1.0, 0.45);
        float ring = step(0.5, vPart.x) * step(vPart.x, 1.5);
        float mast = step(1.5, vPart.x);
        float chase = 0.75 + 0.25 * sin(uTime * 2.0 - vPart.y * 0.9);
        float slats = step(0.5, fract(atan(vWorldPos.z - ${G.z.toFixed(1)}, vWorldPos.x - ${G.x.toFixed(1)}) * 28.0 / 6.2832));
        emis += g * (ring * 3.2 * chase + (1.0 - ring - mast) * (0.5 + 0.9 * slats) * chase);
        emis += g * mast * smoothstep(0.0, 50.0, vWorldPos.y - ${(top + rings * 7.2).toFixed(1)}) * 2.0;`,
    }),
  );
  crownMesh.frustumCulled = false;
  group.add(crownMesh);

  return { group };
}
