import * as THREE from "three";
import type { Shot } from "./types";

// The camera of one scene: glides between shots (an arc for long moves, fov
// interpolated in log space), breathes a little, and leans toward the pointer.

type Pose = { pos: THREE.Vector3; yaw: number; pitch: number; fov: number; roll: number };

const D = THREE.MathUtils.degToRad;

const fromShot = (s: Shot): Pose => ({ pos: new THREE.Vector3(...s.pos), yaw: D(s.yaw), pitch: D(s.pitch), fov: s.fov, roll: D(s.roll ?? 0) });
const clone = (p: Pose): Pose => ({ pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch, fov: p.fov, roll: p.roll });
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const _worldUp = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _target = new THREE.Vector3();

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.3, 40000);
  private from: Pose;
  private to: Pose;
  private pose: Pose;
  private k = 1;
  private dur = 1.4;
  private dir = new THREE.Vector3();
  /** 0 = still camera (reduced motion). */
  motion = 1;
  /** Degrees of lean toward the pointer. */
  lean = { yaw: 1.4, pitch: 0.9 };
  /** Where the hero sits across a 16:9 frame (NDC x); portrait views turn toward it. */
  aim = 0.45;

  constructor(shot: Shot, near = 0.3, far = 40000) {
    this.pose = fromShot(shot);
    this.from = clone(this.pose);
    this.to = clone(this.pose);
    this.camera.near = near;
    this.camera.far = far;
  }

  go(shot: Shot, dur = 1.4) {
    this.from = clone(this.pose);
    this.to = fromShot(shot);
    this.k = 0;
    this.dur = Math.max(0.001, dur);
  }

  snap(shot: Shot) {
    this.pose = fromShot(shot);
    this.from = clone(this.pose);
    this.to = clone(this.pose);
    this.k = 1;
  }

  get moving() {
    return this.k < 1;
  }

  /** pointer: smoothed, −1…1 both axes (y up). */
  update(dt: number, t: number, pointer: THREE.Vector2, aspect: number) {
    this.k = Math.min(1, this.k + dt / this.dur);
    const e = easeInOutCubic(this.k);
    const a = this.from;
    const b = this.to;
    const p = this.pose;
    p.pos.lerpVectors(a.pos, b.pos, e);
    p.pos.y += Math.sin(e * Math.PI) * Math.min(6, a.pos.distanceTo(b.pos) * 0.06);
    p.yaw = a.yaw + (b.yaw - a.yaw) * e;
    p.pitch = a.pitch + (b.pitch - a.pitch) * e;
    p.roll = a.roll + (b.roll - a.roll) * e;
    p.fov = Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * e);

    const m = this.motion;
    // Shots are composed for landscape with the hero right of centre (the UI
    // takes the left). A portrait screen sees only the middle of that, so turn
    // toward where the hero sits in a 16:9 frame.
    const narrow = THREE.MathUtils.clamp((1 - aspect) / 0.5, 0, 1);
    const aim = narrow * Math.atan(this.aim * Math.tan(D(p.fov) / 2) * (16 / 9));
    const yaw = p.yaw + aim + (pointer.x * D(this.lean.yaw) + Math.sin(t * 0.13) * D(0.3)) * m;
    const pitch = p.pitch + (pointer.y * D(this.lean.pitch) + Math.sin(t * 0.17 + 1) * D(0.18)) * m;
    const cam = this.camera;
    cam.position.copy(p.pos);
    cam.position.y += Math.sin(t * 0.5) * 0.02 * m;
    this.dir.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    // roll about the view axis: tilt "up" around the look direction
    const right = _right.crossVectors(this.dir, _worldUp).normalize();
    const up = _up.crossVectors(right, this.dir).normalize();
    cam.up.copy(up.multiplyScalar(Math.cos(p.roll)).addScaledVector(right, Math.sin(p.roll)));
    cam.lookAt(_target.copy(cam.position).add(this.dir));
    // portrait screens: widen the vertical fov so the scene's hero stays in frame
    cam.fov = aspect < 1 ? Math.min(100, p.fov * (0.55 + 0.45 / Math.max(0.45, aspect))) : p.fov;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }
}
