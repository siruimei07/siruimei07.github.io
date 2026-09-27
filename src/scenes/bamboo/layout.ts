import * as THREE from "three";
import { dirFromAzEl } from "../common/env";
import type { SceneShots, Shot } from "../common/types";

// The plan of the grove. The shining stalk stands at the origin in a small
// clearing; a stepping-stone path comes in from the viewer's left and runs on
// to an old hokora (祠) with a stone lantern. The ground rolls gently and falls
// away toward the moon (upper right, seen through a gap in the canopy).
// Units: metres, y up.

export const MOON_AZ = 41;
export const MOON_EL = 21;
/** Angular radius of the moon disc (deg). */
export const MOON_R = 5.2;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);

/** Base of the shining stalk (x, z); y from groundY. */
export const STALK_X = 0;
export const STALK_Z = 0;
export const STALK_H = 17.5;
export const STALK_R = 0.105;

/** The hokora, its torii and the stone lantern. */
export const SHRINE = { x: 5.9, z: -3.9, rot: -0.72 };
export const LANTERN = { x: 4.1, z: -1.2 };

const smooth = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Terrain height: a gentle roll, rising behind the viewer, falling away toward the moon. */
export function groundY(x: number, z: number): number {
  let y = 0.3 * Math.sin(x * 0.13 + 0.7) * Math.sin(z * 0.11 + 1.9) + 0.14 * Math.sin(x * 0.31 - z * 0.23 + 0.5);
  y += 0.03 * z - 0.012 * x;
  // toward the moon the grove runs down into a hollow
  const along = x * 0.656 - z * 0.755;
  y -= 0.1 * Math.pow(Math.max(0, along - 20), 1.25);
  // the clearing and the shrine sit on level ground
  const dc = Math.hypot(x - STALK_X, z - STALK_Z);
  const ds = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  const level = Math.max(1 - smooth(3, 11, dc), 1 - smooth(2, 8, ds));
  const y0 = groundAt0();
  return THREE.MathUtils.lerp(y, y0, level);
}

let cached0: number | null = null;
function groundAt0() {
  if (cached0 === null) {
    const x = STALK_X;
    const z = STALK_Z;
    cached0 = 0.3 * Math.sin(x * 0.13 + 0.7) * Math.sin(z * 0.11 + 1.9) + 0.14 * Math.sin(x * 0.31 - z * 0.23 + 0.5) + 0.03 * z - 0.012 * x;
  }
  return cached0;
}

export const stalkBase = () => new THREE.Vector3(STALK_X, groundY(STALK_X, STALK_Z), STALK_Z);

const eye = (x: number, z: number, h: number): [number, number, number] => [x, groundY(x, z) + h, z];

export const SHOTS: SceneShots = {
  // a wider look into the grove: the shining stalk on the right third, the moon above it
  menu: { pos: eye(-8.6, 12.4, 1.55), yaw: 8.5, pitch: 10.5, fov: 52 },
  // closer, lower, looking up past the stalk to the moon (panels cover the left 55%)
  screen: { pos: eye(-4.3, 7.1, 1.4), yaw: 12, pitch: 12.5, fov: 48 },
};

/** Stepping stones: a path from the viewer's side to the clearing and on to the shrine. */
export const PATH: [number, number][] = [
  [-12.5, 21],
  [-10.6, 16.5],
  [-8.2, 12.6],
  [-6.0, 9.4],
  [-3.9, 6.2],
  [-2.3, 3.4],
  [-1.3, 1.2],
  [0.2, -1.3],
  [2.0, -2.2],
  [3.6, -2.4],
  [5.3, -3.1],
];

/** Distance (xz) from a point to the path polyline. */
export function pathDist(x: number, z: number): number {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i];
    const [bx, bz] = PATH[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** A camera posed like the rig poses it for a shot (for build-time culling). */
export function shotCamera(s: Shot, aspect = 16 / 9): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(s.fov, aspect, 0.3, 4000);
  const yaw = THREE.MathUtils.degToRad(s.yaw);
  const pitch = THREE.MathUtils.degToRad(s.pitch);
  cam.position.set(...s.pos);
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  cam.lookAt(cam.position.clone().add(dir));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return cam;
}

const lerpShot = (a: Shot, b: Shot, k: number): Shot => ({
  pos: [0, 1, 2].map((i) => THREE.MathUtils.lerp(a.pos[i], b.pos[i], k)) as [number, number, number],
  yaw: THREE.MathUtils.lerp(a.yaw, b.yaw, k),
  pitch: THREE.MathUtils.lerp(a.pitch, b.pitch, k),
  fov: THREE.MathUtils.lerp(a.fov, b.fov, k),
});

/** Cameras along the menu → screen glide: everything outside all of them is never seen. */
export const VIEW_CAMS = [0, 0.33, 0.66, 1].map((k) => shotCamera(lerpShot(SHOTS.menu, SHOTS.screen, k)));
export const MAIN_CAMS = [VIEW_CAMS[0], VIEW_CAMS[VIEW_CAMS.length - 1]];

const _p = new THREE.Vector3();

/** Is a point inside any view (with margins for pointer lean and portrait screens)? */
export function seen(p: THREE.Vector3, mx = 0.3, my = 0.8): boolean {
  for (const c of VIEW_CAMS) {
    _p.copy(p).project(c);
    if (_p.z < 1 && _p.z > -1 && Math.abs(_p.x) < 1 + mx && Math.abs(_p.y) < 1 + my) return true;
  }
  return false;
}

/** Distance (xz) from the screen camera: instances are sorted by it (front to back, for early-z). */
export function camDist(x: number, z: number): number {
  const c = MAIN_CAMS[1].position;
  return Math.hypot(x - c.x, z - c.z);
}

/** Is a vertical segment (a culm) visible in any view? */
export function segmentSeen(x: number, y0: number, z: number, h: number, mx = 0.3, my = 0.8): boolean {
  for (let i = 0; i <= 6; i++) {
    _p.set(x, y0 + (h * i) / 6, z);
    if (seen(_p, mx, my)) return true;
  }
  return false;
}

const _m = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * How close (in moon radii) a vertical segment comes to the moon's centre on
 * screen, over the main cameras. < 1 means it crosses the disc.
 */
export function moonCover(x: number, y0: number, z: number, h: number, halfWidth = 0): number {
  let best = 1e9;
  for (const c of MAIN_CAMS) {
    _m.copy(moonDir).multiplyScalar(1000).add(c.position).project(c);
    _a.set(x, y0, z).project(c);
    _b.set(x, y0 + h, z).project(c);
    if (_a.z > 1 || _b.z > 1) continue;
    const aspect = c.aspect;
    const ax = _a.x * aspect;
    const bx = _b.x * aspect;
    const mx = _m.x * aspect;
    const dx = bx - ax;
    const dy = _b.y - _a.y;
    const t = THREE.MathUtils.clamp(((mx - ax) * dx + (_m.y - _a.y) * dy) / Math.max(1e-9, dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(mx - (ax + dx * t), _m.y - (_a.y + dy * t));
    const r = Math.tan(THREE.MathUtils.degToRad(MOON_R)) / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
    const dist = c.position.distanceTo(_p.set(x, y0 + h * t, z));
    const w = halfWidth / Math.max(0.1, dist) / Math.tan(THREE.MathUtils.degToRad(c.fov / 2));
    best = Math.min(best, Math.max(0, d - w) / r);
  }
  return best;
}
