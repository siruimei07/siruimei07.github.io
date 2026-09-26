import * as THREE from "three";
import { globals } from "./globals.ts";

// Camera poses. `shift` is a horizontal lens shift in NDC so the 3D subject
// can sit beside the text column without turning the camera.
type Key = { pos: [number, number, number]; target: [number, number, number]; fov: number; shift: number };

const moonTarget = (from: [number, number, number], dist: number, drop: number): [number, number, number] => {
  const m = globals.uMoonDir.value;
  return [from[0] + m.x * dist, from[1] + m.y * dist - drop, from[2] + m.z * dist];
};

// Section 0 stands before the great torii with the gate on the right and the
// copy on the left; scrolling to section 1 carries the camera through its
// opening (z = 0) into Tsukuyomi. `via` points are waypoints the path must
// pass through between two sections (the middle of the gate opening).
type Stop = Key & { via?: [number, number, number][] };

const DESKTOP: Stop[] = [
  { pos: [-9, 4.8, 60], target: [-2.5, 12.4, -60], fov: 42, shift: 0.16, via: [[-1.2, 5.4, 12], [0, 5.2, -4]] },
  { pos: [-5, 4.6, -30], target: [-46, 7, -74], fov: 42, shift: -0.3 },
  { pos: [18, 6.5, -100], target: [85, 12, -104], fov: 44, shift: 0 },
  { pos: [6, 9, -170], target: [-200, 26, -880], fov: 46, shift: 0 },
  { pos: [0, 4.2, -262], target: moonTarget([0, 4.2, -262], 100, 25), fov: 40, shift: 0 },
];

const PORTRAIT: Stop[] = [
  { pos: [0, 5, 80], target: [0, 15, -60], fov: 60, shift: 0, via: [[0, 5.6, 14], [0, 5.2, -4]] },
  { pos: [-3, 5, -22], target: [-46, 9, -74], fov: 62, shift: 0 },
  { pos: [16, 7, -100], target: [85, 15, -104], fov: 66, shift: 0 },
  { pos: [6, 10, -170], target: [-200, 30, -880], fov: 64, shift: 0 },
  { pos: [0, 4.2, -262], target: moonTarget([0, 4.2, -262], 100, 12), fov: 56, shift: 0 },
];

// The entry sequence frames the gate dead centre, a little lower and wider,
// with the moon above the kasagi; afterwards the camera glides to section 0.
export const INTRO_POSE: Key = { pos: [0, 3.6, 62], target: [0, 13.6, -60], fov: 44, shift: 0 };
const INTRO_POSE_PORTRAIT: Key = { pos: [0, 4.2, 92], target: [0, 16, -60], fov: 62, shift: 0 };

// Exported so parts can compose themselves around a section's camera.
export const SKILLS_KEY = { pos: DESKTOP[2].pos, target: DESKTOP[2].target, fov: DESKTOP[2].fov };

export type Pose = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; shift: number };

// Scroll follows a critically damped spring: it eases in as well as out, so a
// move between sections starts gently instead of jumping to full speed.
const SPRING = 1.45; // rad/s — about 3.5 s to settle

export class CameraRig {
  private posCurve!: THREE.CatmullRomCurve3;
  private targetCurve!: THREE.CatmullRomCurve3;
  private stops: Stop[] = DESKTOP;
  private stopT: number[] = []; // curve parameter of each section stop
  private portrait = false;
  private u = 0; // smoothed section coordinate
  private goal = 0;
  velocity = 0;
  pose: Pose = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, shift: 0 };

  constructor() {
    this.setAspect(16 / 9);
  }

  get sectionCount() {
    return this.stops.length;
  }

  get introPose(): Key {
    return this.portrait ? INTRO_POSE_PORTRAIT : INTRO_POSE;
  }

  setAspect(aspect: number) {
    this.portrait = aspect < 0.9;
    this.stops = this.portrait ? PORTRAIT : DESKTOP;
    const v = (a: [number, number, number]) => new THREE.Vector3(...a);
    const pos: THREE.Vector3[] = [];
    const tgt: THREE.Vector3[] = [];
    this.stopT = [];
    this.stops.forEach((s, i) => {
      this.stopT.push(pos.length);
      pos.push(v(s.pos));
      tgt.push(v(s.target));
      if (s.via && i < this.stops.length - 1) {
        // Waypoints: the target eases toward the next stop's as we go.
        const next = this.stops[i + 1];
        s.via.forEach((w, j) => {
          const k = (j + 1) / (s.via!.length + 1);
          pos.push(v(w));
          tgt.push(v(s.target).lerp(v(next.target), k * k));
        });
      }
    });
    const last = pos.length - 1;
    this.stopT = this.stopT.map((i) => i / last);
    this.posCurve = new THREE.CatmullRomCurve3(pos, false, "centripetal");
    this.targetCurve = new THREE.CatmullRomCurve3(tgt, false, "centripetal");
  }

  // Scroll position mapped to [0, sections - 1] by the DOM layer.
  setGoal(s: number) {
    this.goal = THREE.MathUtils.clamp(s, 0, this.stops.length - 1);
  }

  jump() {
    this.u = this.goal;
    this.velocity = 0;
  }

  update(dt: number) {
    const x = this.u - this.goal;
    const w = SPRING;
    this.velocity += (-w * w * x - 2 * w * this.velocity) * dt;
    this.u += this.velocity * dt;
    if (Math.abs(this.goal - this.u) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
      this.u = this.goal;
      this.velocity = 0;
    }
    this.u = THREE.MathUtils.clamp(this.u, 0, this.stops.length - 1);

    // Ease each segment so the camera rests while a section is centred.
    const n = this.stops.length - 1;
    const i = Math.min(Math.floor(this.u), n - 1);
    const f = this.u - i;
    const e = THREE.MathUtils.smootherstep(f, 0.04, 0.96);
    const t = THREE.MathUtils.lerp(this.stopT[i], this.stopT[i + 1], e);
    this.posCurve.getPoint(t, this.pose.pos);
    this.targetCurve.getPoint(t, this.pose.target);
    const a = this.stops[i];
    const b = this.stops[Math.min(i + 1, n)];
    this.pose.fov = THREE.MathUtils.lerp(a.fov, b.fov, e);
    this.pose.shift = THREE.MathUtils.lerp(a.shift, b.shift, e);
    return this.pose;
  }

  get section() {
    return this.u;
  }
}

// Blend from the entry framing to the rig's pose. k: 0 → 1 (already eased).
// The camera drifts on a gentle arc (a little higher mid-way) so the gate
// glides to the right with real parallax rather than a flat slide.
export function blendIntroPose(k: number, intro: Key, end: Pose, out: Pose) {
  out.pos.set(...intro.pos).lerp(end.pos, k);
  out.pos.y += Math.sin(Math.PI * k) * 0.8;
  out.target.set(...intro.target).lerp(end.target, k);
  out.fov = THREE.MathUtils.lerp(intro.fov, end.fov, k);
  out.shift = THREE.MathUtils.lerp(intro.shift, end.shift, k);
  return out;
}
