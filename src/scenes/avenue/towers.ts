import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { Batches, eavePoint, Style } from "./batches";
import { DotKind, type Dots } from "./dots";
import { lanternCaps, lanternGeometry } from "./geom";
import type { Lot } from "./layout";

// The tower district: slabs and stepped towers banded with lit floors, most of
// them capped Kyoto-style — single or double pagoda roofs with vermilion
// drums, skirt roofs at the setbacks, red LED strings along the eaves — plus
// rooftop gardens, plant rooms with aviation lights, and the hero pavilions
// that hold giant glowing paper lanterns.

const FH = 3.6;
const snap = (h: number) => Math.max(FH * 3, Math.round(h / FH) * FH);

export type GiantLantern = { pos: THREE.Vector3; size: number; phase: number };

const RED = new THREE.Color(1.0, 0.16, 0.1);
const WARM = new THREE.Color(1.0, 0.62, 0.3);
const WHITE = new THREE.Color(1.0, 0.9, 0.8);

const bodyCols = [0x2a1a24, 0x24171f, 0x2e1d24, 0x221823, 0x2a1f2a, 0x33222b];
const roofCols = [0x3a3442, 0x332d3c, 0x403848, 0x2c2836, 0x46404e];

export type TowersResult = {
  lanterns: GiantLantern[];
  /** Lantern-pavilion tops and the dot-ring apex: where the fish swirl. */
  heroes: { role: string; top: THREE.Vector3; w: number }[];
};

/** Detail tier of a lot: 0 near (full), 1 mid (simplified), 2 far (bare shafts). */
export function tierOf(l: { x: number; z: number }, eyes: THREE.Vector3[]) {
  const d = Math.min(...eyes.map((e) => Math.hypot(l.x - e.x, l.z - e.z)));
  return d < 1000 ? 0 : d < 2200 ? 1 : 2;
}

export function buildTowers(lots: Lot[], b: Batches, dots: Dots, eyes: THREE.Vector3[]): TowersResult {
  let rand = rng(99173);
  const lanterns: GiantLantern[] = [];
  const heroes: TowersResult["heroes"] = [];
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

  const ledRing = (r0: { x: number; y: number; z: number; w: number; h: number; d: number; rot: number }, col: THREE.Color, spacing: number, inten: number, radius: number) => {
    // same orientation rule as Batches.roof: the ridge runs along the longer side
    const r = r0.d > r0.w ? { ...r0, w: r0.d, d: r0.w, rot: r0.rot + Math.PI / 2 } : r0;
    for (let side = 0; side < 4; side++) {
      const len = side % 2 === 0 ? r.w : r.d;
      const n = Math.max(3, Math.round(len / spacing));
      for (let i = 0; i < n; i++) {
        const p = eavePoint(r, side, (i + 0.5) / n);
        dots.add(p.x, p.y + 0.15, p.z, radius, col, inten, { twinkle: 0.15, speed: 0.6 });
      }
    }
  };

  for (const l of lots) {
    // each tower draws from its own stream (stable when the lot list changes)
    rand = rng(Math.floor(l.seed * 7919) + 11);
    const tier = l.hero ? 0 : tierOf(l, eyes);
    const near = tier === 0;
    const crownKind = tier === 0 ? l.crown : l.crown === "dots" || l.crown === "lantern" ? "pagoda" : l.crown;
    const tint = new THREE.Color(pick(bodyCols));
    const rc = new THREE.Color(pick(roofCols));
    let y = 0;
    let w = l.w;
    let d = l.d;
    const H = snap(l.h);
    // shaft sections (setbacks get a skirt roof, like a pagoda's mokoshi)
    const cuts = l.steps === 0 ? [1] : l.steps === 1 ? [0.62, 1] : [0.48, 0.76, 1];
    for (let i = 0; i < cuts.length; i++) {
      const top = snap(H * cuts[i]);
      const hh = top - y;
      if (hh <= 0) continue;
      b.box(l.x, y, l.z, w, hh, d, 0, l.style, l.seed + i * 17, tint);
      y = top;
      if (i < cuts.length - 1) {
        const skirt = rand() < 0.7;
        if (skirt && tier < 2) b.roof(l.x, y - 0.4, l.z, w * 1.08, 2.4 + w * 0.03, d * 1.08, 0, rc, near);
        else if (tier < 2) b.box(l.x, y, l.z, w + 0.8, 1.2, d + 0.8, 0, Style.Cornice, l.seed + 3, tint);
        w *= 0.8;
        d *= 0.8;
      }
    }
    const m = Math.min(w, d);
    const top = new THREE.Vector3(l.x, y, l.z);
    // far away: the bare shaft, a pagoda cap for the skyline, a blinking light now and then
    if (tier === 2) {
      if (crownKind === "pagoda" || crownKind === "pagoda2") b.roof(l.x, y, l.z, w * 1.22, m * 0.3, d * 1.22, 0, rc, false);
      else if (H > 110 && rand() < 0.5) dots.add(l.x, y + 2, l.z, 0.9, RED, 7, { kind: DotKind.Blink, speed: 0.5, phase: rand() });
      continue;
    }
    switch (crownKind) {
      case "flat": {
        b.box(l.x, y, l.z, w + 0.8, 1.4, d + 0.8, 0, Style.Cornice, l.seed + 5, tint);
        const pw = w * (0.25 + rand() * 0.2);
        const pd = d * (0.2 + rand() * 0.2);
        const px = l.x + (rand() - 0.5) * (w - pw) * 0.6;
        const pz = l.z + (rand() - 0.5) * (d - pd) * 0.6;
        if (near) b.box(px, y, pz, pw, 3.5 + rand() * 3, pd, 0, Style.Plain, l.seed + 9, tint.clone().multiplyScalar(1.2));
        // aviation lights on the corners of the tall ones
        if (H > 100)
          for (const [sx, sz] of [
            [-1, -1],
            [1, 1],
          ])
            dots.add(l.x + (sx * w) / 2, y + 2, l.z + (sz * d) / 2, 0.55, RED, 7, { kind: DotKind.Blink, speed: 0.55, phase: rand() });
        break;
      }
      case "garden": {
        b.box(l.x, y, l.z, w + 0.8, 1.4, d + 0.8, 0, Style.Cornice, l.seed + 5, tint);
        // lantern lights between the planting
        const n = near ? Math.round(4 + rand() * 6) : 0;
        for (let i = 0; i < n; i++)
          dots.add(l.x + (rand() - 0.5) * w * 0.8, y + 1.6, l.z + (rand() - 0.5) * d * 0.8, 0.5, WARM, 3.5, { twinkle: 0.3, speed: 0.7 });
        break;
      }
      case "pagoda": {
        const rw = w * 1.22;
        const rd = d * 1.22;
        const rh = m * (0.26 + rand() * 0.1);
        b.box(l.x, y, l.z, w + 0.6, 1.0, d + 0.6, 0, Style.Cornice, l.seed + 5, tint);
        b.roof(l.x, y + 0.8, l.z, rw, rh, rd, 0, rc, near);
        if (near) b.box(l.x, y + rh * 0.9, l.z, 0.7, rh * 0.5 + 3, 0.7, 0, Style.Plain, 0, 0x2a2228);
        dots.add(l.x, y + rh * 1.4 + 3.5, l.z, 0.6, WHITE, 5, { twinkle: 0.25, speed: 0.4 });
        if (near && rand() < 0.16) ledRing({ x: l.x, y: y + 0.8, z: l.z, w: rw, h: rh, d: rd, rot: 0 }, RED, 1.5, 5, 0.32);
        break;
      }
      case "pagoda2": {
        const r1w = w * 1.2;
        const r1d = d * 1.2;
        const r1h = m * 0.17;
        b.box(l.x, y, l.z, w + 0.6, 1.0, d + 0.6, 0, Style.Cornice, l.seed + 5, tint);
        b.roof(l.x, y + 0.8, l.z, r1w, r1h, r1d, 0, rc, near);
        const dw = w * 0.68;
        const dd = d * 0.68;
        const dh = snap(m * 0.22 + 3);
        const dy = y + r1h * 0.55;
        b.box(l.x, dy, l.z, dw, dh, dd, 0, Style.Drum, l.seed + 7, 0x3a2a2a);
        const r2w = dw * 1.34;
        const r2d = dd * 1.34;
        const r2h = m * 0.3;
        b.roof(l.x, dy + dh - 0.2, l.z, r2w, r2h, r2d, 0, rc, near);
        if (near) b.box(l.x, dy + dh + r2h * 0.85, l.z, 0.7, r2h * 0.5 + 4, 0.7, 0, Style.Plain, 0, 0x2a2228);
        dots.add(l.x, dy + dh + r2h * 1.35 + 4.5, l.z, 0.7, WHITE, 5, { twinkle: 0.25, speed: 0.4 });
        if (near && rand() < 0.18) ledRing({ x: l.x, y: y + 0.8, z: l.z, w: r1w, h: r1h, d: r1d, rot: 0 }, RED, 1.5, 5, 0.32);
        top.y = dy + dh + r2h;
        break;
      }
      case "dots": {
        // the LED-ringed roof (f_030): a low pyramid outlined by rings of red dots, a white light on top
        const rw = w * 1.12;
        const rd = d * 1.12;
        const rh = m * 0.2;
        b.box(l.x, y, l.z, w + 0.6, 1.2, d + 0.6, 0, Style.Cornice, l.seed + 5, tint);
        b.roof(l.x, y + 1.0, l.z, rw, rh, rd, 0, rc, near);
        const ring = (t: number, spacing: number) => {
          const s = 1 - t;
          const prof = 0.28 * t + 0.72 * t * t;
          const ww = rw * s;
          const dd2 = rd * s;
          for (let side = 0; side < 4; side++) {
            const len = side % 2 === 0 ? ww : dd2;
            const n = Math.max(2, Math.round(len / spacing));
            for (let i = 0; i < n; i++) {
              const p = eavePoint({ x: l.x, y: y + 1.0 + prof * rh, z: l.z, w: ww, h: rh * (1 - t) * (1 - t), d: dd2, rot: 0 }, side, (i + 0.5) / n);
              dots.add(p.x, p.y + 0.3, p.z, 0.42, RED, 6.5, { twinkle: 0.2, speed: 0.8 });
            }
          }
        };
        ring(0.0, 1.25);
        ring(0.2, 1.25);
        ring(0.42, 1.25);
        ring(0.62, 1.3);
        dots.add(l.x, y + 1.0 + rh + 1.2, l.z, 1.4, WHITE, 9, { twinkle: 0.2, speed: 0.5 });
        top.y = y + rh;
        if (l.hero) heroes.push({ role: l.hero, top: top.clone(), w: rw });
        break;
      }
      case "lantern": {
        // an open pavilion on the roof: four tall posts, a sweeping cap, and the giant lantern
        // hanging low inside it so it glows out from under the eaves
        b.box(l.x, y, l.z, w + 0.8, 1.4, d + 0.8, 0, Style.Cornice, l.seed + 5, tint);
        const ls = m * 0.74;
        const lh = ls * 1.2;
        const ph = lh * 1.55;
        const pw = 1.6;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          b.box(l.x + sx * (w * 0.5 - pw), y + 1.4, l.z + sz * (d * 0.5 - pw), pw, ph, pw, 0, Style.Plain, 0, 0x6a1c14);
        // a vermilion railing ring at the pavilion floor
        b.box(l.x, y + 1.4, l.z, w - 0.6, 1.1, d - 0.6, 0, Style.Drum, l.seed + 11, 0x3a2a2a);
        const ry = y + 1.4 + ph;
        const rw = w * 1.14;
        const rd = d * 1.14;
        const rh = m * 0.3;
        b.roof(l.x, ry, l.z, rw, rh, rd, 0, rc, true);
        b.box(l.x, ry + rh * 0.9, l.z, 0.9, rh * 0.5 + 5, 0.9, 0, Style.Plain, 0, 0x2a2228);
        dots.add(l.x, ry + rh * 1.4 + 5.5, l.z, 0.9, WHITE, 6, { twinkle: 0.25, speed: 0.4 });
        ledRing({ x: l.x, y: ry, z: l.z, w: rw, h: rh, d: rd, rot: 0 }, RED, 1.3, 6, 0.36);
        lanterns.push({ pos: new THREE.Vector3(l.x, y + 1.4 + ph - lh * 0.62, l.z), size: ls, phase: rand() * 6.28 });
        top.y = ry + rh;
        heroes.push({ role: l.hero ?? "lantern", top: top.clone(), w: rw });
        break;
      }
    }
  }
  return { lanterns, heroes };
}

/** The giant chōchin: glowing ribbed paper, lacquered caps, a slow sway. */
export function buildLanterns(list: GiantLantern[]) {
  const group = new THREE.Group();
  const paper = toonMaterial({
    color: 0xff6a2a,
    shade: 0xb02010,
    ink: 4,
    rim: 0.0,
    fog: 0.5,
    lights: 0,
    vertexHead: /* glsl */ `varying float vY; varying vec3 vN0;`,
    vertex: /* glsl */ `vY = position.y; vN0 = normal;`,
    fragmentHead: /* glsl */ `varying float vY; varying vec3 vN0;`,
    fragment: /* glsl */ `
      // hot core where the paper faces us, deep red at the limb, bamboo ribs
      float facing = saturate(dot(n, normalize(cameraPosition - vWorldPos)));
      float rib = smoothstep(0.78, 1.0, abs(sin(vY * 3.14159 * 15.0)));
      float flick = 0.92 + 0.08 * sin(uTime * 7.0 + vWorldPos.x) * sin(uTime * 3.1 + vWorldPos.z);
      vec3 hot = mix(vec3(1.0, 0.11, 0.025) * 1.5, vec3(1.0, 0.52, 0.12) * 2.4, pow(facing, 1.7));
      // a dark mon (crest) ring on two sides
      float ang = atan(vN0.z, vN0.x);
      float side = abs(fract(ang / 3.14159) - 0.5);
      float mon = smoothstep(0.03, 0.0, abs(length(vec2(side * 3.4, vY * 2.2)) - 0.36)) * step(abs(vY), 0.3);
      emis += hot * (1.0 - rib * 0.4) * (1.0 - mon * 0.7) * flick;
      base = vec3(0.9, 0.3, 0.1);`,
  });
  const lacquer = toonMaterial({ color: 0x241418, shade: 0x0c0608, ink: 5, rim: 1.0 });
  const lg = lanternGeometry();
  const cg = lanternCaps();
  for (const l of list) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(lg, paper);
    const caps = new THREE.Mesh(cg, lacquer);
    g.add(body, caps);
    g.position.copy(l.pos);
    g.scale.set(l.size, l.size * 1.2, l.size);
    g.userData.phase = l.phase;
    group.add(g);
  }
  return {
    group,
    update(t: number) {
      for (const g of group.children) {
        const ph = g.userData.phase as number;
        g.rotation.z = Math.sin(t * 0.6 + ph) * 0.025;
        g.rotation.x = Math.sin(t * 0.45 + ph * 1.7) * 0.02;
        g.rotation.y = t * 0.05 + ph;
      }
    },
  };
}

/** Rooftop gardens and planters: dark round trees. */
export function buildGardens(lots: Lot[], density: number, eyes: THREE.Vector3[]) {
  let rand = rng(5151);
  const spots: THREE.Matrix4[] = [];
  const cols: THREE.Color[] = [];
  const q = new THREE.Quaternion();
  for (const l of lots) {
    if (l.crown !== "garden" || tierOf(l, eyes) > 0) continue;
    rand = rng(Math.floor(l.seed * 6007) + 5);
    const H = snap(l.h);
    let w = l.w;
    let d = l.d;
    for (let i = 0; i < l.steps; i++) {
      w *= 0.8;
      d *= 0.8;
    }
    const n = Math.round((4 + rand() * 5) * density);
    for (let i = 0; i < n; i++) {
      const s = 1.6 + rand() * 2.6;
      const x = l.x + (rand() - 0.5) * (w - s * 2);
      const z = l.z + (rand() - 0.5) * (d - s * 2);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      spots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, H + 1.4 + s * 0.4, z), q, new THREE.Vector3(s, s * 0.8, s)));
      cols.push(new THREE.Color().setHSL(0.36 + rand() * 0.12, 0.35, 0.18 + rand() * 0.1));
    }
  }
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), toonMaterial({ color: 0xffffff, shade: new THREE.Color(0.35, 0.3, 0.5), ink: 6, rim: 0.9, step: 0.15 }), Math.max(1, spots.length));
  spots.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, cols[i]);
  });
  mesh.count = spots.length;
  mesh.frustumCulled = false;
  return mesh;
}
