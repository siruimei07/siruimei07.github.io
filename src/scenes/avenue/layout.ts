import * as THREE from "three";
import { dirFromAzEl } from "../common/env";
import type { Shot } from "../common/types";
import { rng } from "../common/util";

// Street plan of downtown Tsukuyomi (metres, y up). 大通り — the grand avenue
// — runs north (−z) along x = 0 between rows of low traditional buildings; on
// its east side it opens into a temple precinct (a plaza packed with people,
// the main hall, a five-storey pagoda). Everything else is a dense grid of
// towers, many wearing pagoda caps. The camera floats above the south-east
// and looks up the avenue toward the moon.

export const ROAD = 17; // half-width of the avenue's paving
export const ROW0 = 20; // low-rise rows: |x| from ROW0 …
export const ROW1 = 44; // … to ROW1
export const PRECINCT = { x0: 20, x1: 200, z0: -170, z1: 66 };
export const PLAZA = { x0: 20, x1: 108, z0: -128, z1: 44 };
export const HALL = new THREE.Vector3(154, 0, -70);
export const PAGODA = new THREE.Vector3(150, 0, 26);
export const GATE = new THREE.Vector3(26, 0, -42);

export const BLOCK = 74;
export const STREET = 12;
export const PITCH = BLOCK + STREET;
/** Inner edge of the first tower blocks either side of the avenue. */
export const EDGE = 52;
export const Z0 = 1000;

export const MOON_AZ = 12;
export const MOON_EL = 5.2;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);

export type Crown = "flat" | "pagoda" | "pagoda2" | "lantern" | "dots" | "garden";

export type Lot = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  crown: Crown;
  /** 0 warm bands, 1 warm grid, 2 cool bands */
  style: number;
  /** 0 straight, 1 or 2 setbacks */
  steps: number;
  seed: number;
  hero?: "lantern" | "dots" | "lantern2";
};

/** Solve yaw / pitch so `target` lands at `ndc` (x, y ∈ −1…1) for a camera at `pos`. */
export function aim(pos: [number, number, number], target: THREE.Vector3, ndc: [number, number], fov: number, aspect = 16 / 9): Shot {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 0.3, 40000);
  cam.position.set(...pos);
  let yaw = Math.atan2(target.x - pos[0], -(target.z - pos[2]));
  let pitch = Math.atan2(target.y - pos[1], Math.hypot(target.x - pos[0], target.z - pos[2]));
  const v = new THREE.Vector3();
  const f = THREE.MathUtils.degToRad(fov);
  for (let i = 0; i < 40; i++) {
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    cam.up.set(0, 1, 0);
    cam.lookAt(v.copy(cam.position).add(dir));
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    v.copy(target).project(cam);
    yaw += (v.x - ndc[0]) * f * aspect * 0.35;
    pitch += (v.y - ndc[1]) * f * 0.35;
  }
  const r = (x: number) => Math.round(x * 100) / 100;
  return { pos, yaw: r(THREE.MathUtils.radToDeg(yaw)), pitch: r(THREE.MathUtils.radToDeg(pitch)), fov };
}

/** The hero cluster the shots frame. */
export const HERO = new THREE.Vector3(150, 40, -90);

export const shots: { menu: Shot; screen: Shot } = {
  // high and far to the south: the district to the horizon, the moon rising out of the haze at the right,
  // the lantern tower and the precinct stacked under it in the right strip
  menu: { pos: [-38, 360, 1161], yaw: -18.14, pitch: -8.63, fov: 50 },
  // pushed in and tipped down over the precinct: plaza, hall, pagoda, lantern tower and fish rivers in the right 45 %
  screen: aim([110, 340, 420], new THREE.Vector3(194, 158, 120), [0.6, 0.05], 40),
};

export const inPrecinct = (x: number, z: number, pad = 0) =>
  x > PRECINCT.x0 - pad && x < PRECINCT.x1 + pad && z > PRECINCT.z0 - pad && z < PRECINCT.z1 + pad;

/** Horizontal wedge test: is (x, z) roughly inside a shot's view (with margin)? */
function inView(s: Shot, x: number, z: number, marginDeg: number, maxDist: number) {
  const dx = x - s.pos[0];
  const dz = z - s.pos[2];
  const dist = Math.hypot(dx, dz);
  if (dist < 260) return true;
  if (dist > maxDist) return false;
  const bearing = THREE.MathUtils.radToDeg(Math.atan2(dx, -dz));
  let d = bearing - s.yaw;
  d = ((d + 540) % 360) - 180;
  const hf = THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(s.fov / 2)) * (16 / 9)));
  // also allow for the lot's own width at this distance
  return Math.abs(d) < hf + marginDeg + THREE.MathUtils.radToDeg(Math.atan(60 / dist));
}

export function visibleLot(x: number, z: number) {
  return inView(shots.menu, x, z, 9, 6200) || inView(shots.screen, x, z, 9, 3200);
}

/** The tower grid: blocks split into one, two or four lots each. */
export function towerLots(density: number): Lot[] {
  const lots: Lot[] = [];
  const blockXs: number[] = [];
  for (let i = 0; i < 34; i++) {
    blockXs.push(EDGE + i * PITCH + BLOCK / 2);
    blockXs.push(-(EDGE + i * PITCH + BLOCK / 2));
  }
  for (const bx of blockXs) {
    for (let k = 0; k < 60; k++) {
      const bz = Z0 - k * PITCH - BLOCK / 2;
      if (!visibleLot(bx, bz)) continue;
      if (inPrecinct(bx, bz, BLOCK * 0.35)) continue;
      // every block draws from its own stream, so the city does not reshuffle when the views change
      const rand = rng(((Math.round(bx) * 73856093) ^ (Math.round(bz) * 19349663) ^ 424231) >>> 0);
      const dist = Math.hypot(bx - HERO.x, bz - HERO.z);
      const far = Math.min(1, dist / 2600);
      // split pattern
      const r = rand();
      const cells: [number, number, number, number][] = [];
      const half = BLOCK / 2;
      if (r < 0.14) cells.push([bx, bz, BLOCK, BLOCK]);
      else if (r < 0.45) {
        if (rand() < 0.5) cells.push([bx - half / 2, bz, half, BLOCK], [bx + half / 2, bz, half, BLOCK]);
        else cells.push([bx, bz - half / 2, BLOCK, half], [bx, bz + half / 2, BLOCK, half]);
      } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) cells.push([bx + (sx * half) / 2, bz + (sz * half) / 2, half, half]);
      for (const [cx, cz, cw, cd] of cells) {
        // far away, drop lots (thinner skyline, fewer instances)
        const dm = Math.hypot(cx - shots.menu.pos[0], cz - shots.menu.pos[2]);
        const r0 = rand();
        const r1 = rand();
        if (dm > 3200 && r0 < 0.45 + (1 - density) * 0.3) continue;
        if (r1 > 1 - far * 0.35 * (1.1 - density)) continue;
        const set = 3 + rand() * 4;
        let w = cw - set * 2;
        let d = cd - set * 2;
        // keep slabs from getting too thin
        w = Math.max(18, w * (0.82 + rand() * 0.18));
        d = Math.max(18, d * (0.82 + rand() * 0.18));
        const core = Math.exp(-Math.pow(dist / 900, 2));
        let h = 46 + 92 * Math.pow(rand(), 1.25) + core * 40 * rand();
        if (rand() < 0.035) h += 70 + rand() * 60;
        // the blocks right next to the precinct stay a little lower (the pagoda and hall read),
        // and the ones between the camera and the precinct are low-rise so the plaza shows
        if (inPrecinct(cx, cz, 70)) h *= 0.72;
        if (cx > 20 && cx < 240 && cz > 60 && cz < 300) h = 22 + (h - 46) * 0.28;
        const cr = rand();
        let crown: Crown;
        if (cr < 0.36) crown = "pagoda";
        else if (cr < 0.52) crown = "pagoda2";
        else if (cr < 0.64) crown = "garden";
        else if (cr < 0.655) crown = "dots";
        else crown = "flat";
        // narrow slabs get flat or single caps
        if (Math.min(w, d) < 22 && crown === "pagoda2") crown = "pagoda";
        const sr = rand();
        const style = sr < 0.56 ? 0 : sr < 0.86 ? 1 : 2;
        const steps = h > 90 && rand() < 0.35 ? (rand() < 0.5 ? 1 : 2) : 0;
        lots.push({ x: cx + (rand() - 0.5) * 3, z: cz + (rand() - 0.5) * 3, w, d, h, crown, style, steps, seed: rand() * 1000 });
      }
    }
  }
  // Hero towers around the precinct: the lantern pavilions and the dot-ring roof.
  const cast = (at: THREE.Vector3, role: Lot["hero"], h: number, crown: Crown, size: number) => {
    let best = -1;
    let bd = 1e9;
    lots.forEach((l, i) => {
      const dd = Math.hypot(l.x - at.x, l.z - at.z);
      if (dd < bd && !l.hero) {
        bd = dd;
        best = i;
      }
    });
    if (best < 0) return;
    const l = lots[best];
    l.hero = role;
    l.h = h;
    l.crown = crown;
    l.steps = 1;
    l.w = Math.max(l.w, size);
    l.d = Math.max(l.d, size);
    l.style = 0;
  };
  cast(new THREE.Vector3(194, 0, 122), "lantern", 132, "lantern", 36);
  cast(new THREE.Vector3(270, 0, 30), "dots", 100, "dots", 34);
  cast(new THREE.Vector3(120, 0, -330), "lantern2", 124, "lantern", 32);
  return lots;
}

/** Street centre lines between tower blocks (for the ground shader). */
export const STREET_X0 = EDGE + BLOCK + STREET / 2;
export const STREET_Z0 = Z0 + STREET / 2;
