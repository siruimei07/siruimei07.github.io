import * as THREE from "three";
import { dirFromAzEl } from "../common/env";

// 月見の野 — the plan. A shallow meadow of susuki in a valley; a footpath runs
// from a low bank (the menu viewpoint) through the grass toward an old
// two-storey temple hall on the right, a quiet pond lies in front of its stone
// terrace, wooded hills close the valley. The harvest moon hangs above the hall.
// Units: metres, y up; the viewer looks roughly toward −z.

export const deg = THREE.MathUtils.degToRad;

/** The moon: azimuth / elevation (deg). */
export const MOON_AZ = 32.2;
export const MOON_EL = 18.4;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);

/** The temple hall: centre of its stone terrace (ground level) and yaw (rad). */
export const TEMPLE = { x: 48.1, z: -49.2, yaw: deg(-30), y: 0.55 };

/** Temple-local (x across the front, z toward its front) → world xz. */
export function templeToWorld(lx: number, lz: number): [number, number] {
  const c = Math.cos(TEMPLE.yaw);
  const s = Math.sin(TEMPLE.yaw);
  return [TEMPLE.x + lx * c + lz * s, TEMPLE.z - lx * s + lz * c];
}

/** World xz → temple-local. */
export function worldToTemple(x: number, z: number): [number, number] {
  const dx = x - TEMPLE.x;
  const dz = z - TEMPLE.z;
  const c = Math.cos(TEMPLE.yaw);
  const s = Math.sin(TEMPLE.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

/** The pond beside the path, below the hall: centre, radii (a rotated ellipse) and water level. */
export const POND = { x: 7.6, z: -7.8, rx: 5.0, rz: 2.9, yaw: deg(-30), level: -0.3 };

/** Signed "inside" distance of the pond ellipse, in metres (≈ >0 inside). */
export function pondInside(x: number, z: number): number {
  const dx = x - POND.x;
  const dz = z - POND.z;
  const c = Math.cos(POND.yaw);
  const s = Math.sin(POND.yaw);
  const u = dx * c - dz * s;
  const v = dx * s + dz * c;
  // a lobed ellipse (a little bay on the near side)
  const a = Math.atan2(v, u);
  const r = 1 + 0.09 * Math.sin(a * 3 + 0.6) + 0.05 * Math.sin(a * 5 - 1.1);
  const k = Math.hypot(u / POND.rx, v / POND.rz) / r;
  return (1 - k) * Math.min(POND.rx, POND.rz);
}

/** The footpath: from the bank (menu viewpoint) through the grass to the temple steps. */
export const PATH: THREE.Vector2[] = [
  new THREE.Vector2(-3, 38),
  new THREE.Vector2(-1, 24),
  new THREE.Vector2(-0.9, 13),
  new THREE.Vector2(-0.5, 5),
  new THREE.Vector2(0.5, -2.5),
  new THREE.Vector2(0.8, -8.5),
  new THREE.Vector2(3.6, -15.5),
  new THREE.Vector2(10.5, -21),
  new THREE.Vector2(20, -24.5),
  new THREE.Vector2(28.5, -26.5),
];

// the temple's stone walk, then its steps, where the path ends
for (const lz of [24, 12.5]) {
  const [x, z] = templeToWorld(0, lz);
  PATH.push(new THREE.Vector2(x, z));
}

/** Distance (m) from a point to the path polyline. */
export function pathDist(x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const a = PATH[i];
    const b = PATH[i + 1];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const t = THREE.MathUtils.clamp(((x - a.x) * abx + (z - a.y) * abz) / (abx * abx + abz * abz), 0, 1);
    const dx = x - (a.x + abx * t);
    const dz = z - (a.y + abz * t);
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Terrain height: a flat meadow, the bank behind the viewer, the temple terrace, the pond hollow, the valley sides. */
export function groundY(x: number, z: number): number {
  let y = 0;
  // gentle swells in the meadow
  y += 0.35 * Math.sin(x * 0.07 + 0.4) * Math.sin(z * 0.055 - 0.3) + 0.18 * Math.sin(x * 0.19 + z * 0.13);
  // the bank behind the viewer (the menu viewpoint stands on it)
  y += 1.6 * smooth(4, 20, z) * (1 - smooth(10, 60, Math.abs(x + 6) - 6));
  // the temple terrace (a low rise around the hall)
  const [lx, lz] = worldToTemple(x, z);
  const tr = Math.max(Math.abs(lx) / 21, Math.abs(lz) / 17);
  y = THREE.MathUtils.lerp(y, TEMPLE.y, 1 - smooth(0.8, 1.25, tr));
  // the pond: a flat bank, then the hollow (the shore lies ~0.5 m outside the ellipse)
  const pin = pondInside(x, z);
  y = THREE.MathUtils.lerp(y, 0.04, smooth(-5, -1.5, pin));
  y = THREE.MathUtils.lerp(y, -1.25, smooth(-1.2, 1.4, pin));
  // the valley rises toward the wooded hills
  const r = Math.hypot(x * 0.8, z + 20);
  y += 9 * smooth(95, 190, r) + 22 * smooth(170, 320, r);
  return y;
}

/** Where susuki grows (0…1). */
export function grassDensity(x: number, z: number): number {
  const p = pathDist(x, z);
  let d = smooth(0.75, 1.5, p);
  d *= smooth(0.9, 2.1, -pondInside(x, z));
  const [lx, lz] = worldToTemple(x, z);
  const tr = Math.max(Math.abs(lx) / 16.5, Math.abs(lz) / 14.5);
  d *= smooth(1.0, 1.2, tr);
  // thin out toward the woods
  const r = Math.hypot(x * 0.8, z + 20);
  d *= 1 - smooth(135, 182, r);
  return d;
}

/** Camera eye positions of the two shots (they share the path). */
export const EYE_SCREEN: [number, number, number] = [0.2, groundY(0.2, 0.4) + 1.25, 0.4];
export const EYE_MENU: [number, number, number] = [-1, groundY(-1, 24) + 1.75, 24];
