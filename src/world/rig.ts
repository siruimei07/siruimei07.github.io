import * as THREE from "three";
import { globals } from "./globals.ts";

// One pose per page section. `shift` is a horizontal lens shift in NDC so the
// 3D subject can sit beside the text column without turning the camera.
type Key = { pos: [number, number, number]; target: [number, number, number]; fov: number; shift: number };

const moonTarget = (from: [number, number, number], dist: number, drop: number): [number, number, number] => {
  const m = globals.uMoonDir.value;
  return [from[0] + m.x * dist, from[1] + m.y * dist - drop, from[2] + m.z * dist];
};

// Section 0 stands before the great torii; scrolling to section 1 carries the
// camera through its opening (z = 0) into Tsukuyomi.
const DESKTOP: Key[] = [
  { pos: [0, 4.4, 50], target: [0, 11.5, -60], fov: 38, shift: 0.26 },
  { pos: [-5, 4.6, -30], target: [-46, 7, -74], fov: 42, shift: -0.3 },
  { pos: [18, 6.5, -100], target: [85, 12, -104], fov: 44, shift: 0 },
  { pos: [6, 9, -170], target: [-200, 26, -880], fov: 46, shift: 0 },
  { pos: [0, 4.2, -262], target: moonTarget([0, 4.2, -262], 100, 25), fov: 40, shift: 0 },
];

const PORTRAIT: Key[] = [
  { pos: [0, 5, 74], target: [0, 14, -60], fov: 60, shift: 0 },
  { pos: [-3, 5, -22], target: [-46, 9, -74], fov: 62, shift: 0 },
  { pos: [16, 7, -100], target: [85, 15, -104], fov: 66, shift: 0 },
  { pos: [6, 10, -170], target: [-200, 30, -880], fov: 64, shift: 0 },
  { pos: [0, 4.2, -262], target: moonTarget([0, 4.2, -262], 100, 12), fov: 56, shift: 0 },
];

// Exported so parts can compose themselves around a section's camera.
export const SKILLS_KEY = { pos: DESKTOP[2].pos, target: DESKTOP[2].target, fov: DESKTOP[2].fov };

export type Pose = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; shift: number };

export class CameraRig {
  private posCurve!: THREE.CatmullRomCurve3;
  private targetCurve!: THREE.CatmullRomCurve3;
  private keys: Key[] = DESKTOP;
  private u = 0; // smoothed section coordinate
  private goal = 0;
  velocity = 0;
  pose: Pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, shift: 0 };

  constructor() {
    this.setAspect(16 / 9);
  }

  get sectionCount() {
    return this.keys.length;
  }

  setAspect(aspect: number) {
    this.keys = aspect < 0.9 ? PORTRAIT : DESKTOP;
    const v = (a: [number, number, number]) => new THREE.Vector3(...a);
    this.posCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => v(k.pos)), false, "centripetal");
    this.targetCurve = new THREE.CatmullRomCurve3(this.keys.map((k) => v(k.target)), false, "centripetal");
  }

  // Scroll position mapped to [0, sections - 1] by the DOM layer.
  setGoal(s: number) {
    this.goal = THREE.MathUtils.clamp(s, 0, this.keys.length - 1);
  }

  jump() {
    this.u = this.goal;
  }

  update(dt: number) {
    const prev = this.u;
    this.u += (this.goal - this.u) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs(this.goal - this.u) < 1e-4) this.u = this.goal;
    this.velocity = dt > 0 ? (this.u - prev) / dt : 0;

    // Ease each segment so the camera rests while a section is centred.
    const n = this.keys.length - 1;
    const i = Math.min(Math.floor(this.u), n - 1);
    const f = this.u - i;
    const e = THREE.MathUtils.smootherstep(f, 0.06, 0.94);
    const t = (i + e) / n;
    this.posCurve.getPoint(t, this.pose.pos);
    this.targetCurve.getPoint(t, this.pose.target);
    const a = this.keys[i];
    const b = this.keys[Math.min(i + 1, n)];
    this.pose.fov = THREE.MathUtils.lerp(a.fov, b.fov, e);
    this.pose.shift = THREE.MathUtils.lerp(a.shift, b.shift, e);
    return this.pose;
  }

  get section() {
    return this.u;
  }
}
