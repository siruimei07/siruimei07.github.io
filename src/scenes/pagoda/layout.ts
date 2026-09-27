import * as THREE from "three";
import { dirFromAzEl } from "../common/env";
import type { SceneShots, Shot } from "../common/types";

// The plan of 五重塔の路地. A lantern-strung street of Tsukuyomi's old town
// climbs gently away from the viewer (−z) between tall ryokan and shops and
// ends in stone steps up to a temple terrace, where the five-storey pagoda
// stands at the head of the street (the Yasaka view). Beyond it the modern
// skyline; over everything floats the fish airship. Units: metres, y up.

export const STREET_HALF = 5.0;
/** Street from the near end to the foot of the temple steps. */
export const STREET_Z: [number, number] = [60, -46];

/** Street level: a gentle climb toward the temple. */
export const streetY = (z: number) => 0.05 * (30 - z);

/** The temple terrace (top of the steps). */
export const TERRACE_Y = streetY(STREET_Z[1]) + 1.5;
export const TERRACE_Z = STREET_Z[1] - 2.5;

/** The pagoda: centre of its base, rotation about y (rad). */
export const PAGODA = { x: 1.5, z: -66, rot: THREE.MathUtils.degToRad(24) };

const eye = (x: number, z: number, h: number): [number, number, number] => [x, streetY(z) + h, z];

export const SHOTS: SceneShots = {
  // a few steps further down the street: pagoda, moon and airship in the right third
  menu: { pos: eye(0.6, -6, 1.7), yaw: -33, pitch: 32, fov: 64 },
  // pushed in: the pagoda against the moon, the airship over the city
  screen: { pos: eye(-1.6, -14, 1.6), yaw: -19, pitch: 27, fov: 60 },
};

/** A camera posed like the rig poses a shot (no lean, no breathing). */
export function shotCamera(s: Shot, aspect = 16 / 9) {
  const cam = new THREE.PerspectiveCamera(s.fov, aspect, 0.3, 40000);
  const D = THREE.MathUtils.degToRad;
  const dir = new THREE.Vector3(Math.sin(D(s.yaw)) * Math.cos(D(s.pitch)), Math.sin(D(s.pitch)), -Math.cos(D(s.yaw)) * Math.cos(D(s.pitch)));
  cam.position.set(...s.pos);
  cam.lookAt(cam.position.clone().add(dir));
  cam.updateMatrixWorld();
  return cam;
}

/** The world point at distance `d` behind screen point (x, y) (0…1, y down) of a shot. */
export function screenPoint(s: Shot, x: number, y: number, d: number) {
  const cam = shotCamera(s);
  const v = new THREE.Vector3(x * 2 - 1, 1 - y * 2, 0.5).unproject(cam).sub(cam.position).normalize();
  return cam.position.clone().addScaledVector(v, d);
}

/**
 * The airship, placed by where it should sit in the screen shot: nose up and
 * to the left, tail down to the right, its belly and pods turned toward the
 * viewer. Returns its centre, attitude and length.
 */
function placeAirship() {
  const s = SHOTS.screen;
  // (kept below the HUD's top-right corner: x > 0.72, y < 0.11)
  const nose = screenPoint(s, 0.725, 0.19, 250);
  const tail = screenPoint(s, 1.0, 0.5, 285);
  const pos = nose.clone().add(tail).multiplyScalar(0.5);
  const N = nose.clone().sub(tail);
  const length = N.length();
  N.normalize();
  const F = pos.clone().sub(new THREE.Vector3(...s.pos)).normalize();
  const up = new THREE.Vector3(0, 1, 0).multiplyScalar(0.7).addScaledVector(F, 0.3);
  up.addScaledVector(N, -up.dot(N)).normalize();
  const Z = new THREE.Vector3().crossVectors(N, up);
  const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(N, up, Z));
  return { pos, quat, length };
}

export const AIRSHIP = placeAirship();

/** The moon: right behind the pagoda's spire (in both shots). */
export const MOON_AZ = 3.2;
export const MOON_EL = 39.5;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);
