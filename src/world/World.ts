import * as THREE from "three";
import type { Frame, Pipeline } from "../engine/Pipeline";
import { env } from "../engine/toon";
import { buildCity } from "./city";
import { Clouds } from "./clouds";
import { buildHouses } from "./houses";
import { moonDir, POLE_X, POLE_ZS, streetY } from "./layout";
import { Sea } from "./sea";
import { Sky } from "./sky";
import { Street } from "./street";
import { buildTerrain } from "./terrain";
import { buildBamboo, buildSusuki } from "./vegetation";

// The moonlit slope town, assembled; plus the camera and its stations (one
// per menu entry — P3R changes the hero's pose per entry, we change the shot).

export type Pose = { pos: THREE.Vector3; yaw: number; pitch: number; fov: number; roll?: number };

const deg = THREE.MathUtils.degToRad;
const eye = (x: number, z: number, h = 1.62) => new THREE.Vector3(x, streetY(z) + h, z);

export const STATIONS: Record<string, Pose> = {
  title: { pos: eye(-1.2, 6), yaw: deg(-3.5), pitch: deg(1.6), fov: 30 },
  menu: { pos: eye(-0.6, 3), yaw: deg(-6), pitch: deg(3), fov: 34 },
  profile: { pos: eye(1.4, -9.5, 1.2), yaw: deg(19), pitch: deg(24), fov: 42, roll: deg(-4) },
  skills: { pos: eye(9.5, -11, 1.4), yaw: deg(62), pitch: deg(38), fov: 50, roll: deg(6) },
  works: { pos: eye(-1.2, 6), yaw: deg(-11), pitch: deg(0.6), fov: 9 },
  calendar: { pos: eye(-1.2, 6), yaw: deg(15), pitch: deg(8.0), fov: 30 },
  contact: { pos: new THREE.Vector3(POLE_X - 1.4, streetY(POLE_ZS[0]) + 9.6, POLE_ZS[0] + 7), yaw: deg(3), pitch: deg(-7), fov: 52 },
  system: { pos: new THREE.Vector3(-70, 150, 70), yaw: deg(8), pitch: deg(-17), fov: 38 },
};

export class World {
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.5, 30000);
  readonly opaque = new THREE.Scene();
  readonly fx = new THREE.Scene();
  readonly overlay = new THREE.Scene();
  readonly sky = new Sky();
  readonly street: Street;
  private city: ReturnType<typeof buildCity>;
  private from: Pose = clonePose(STATIONS.title);
  private to: Pose = clonePose(STATIONS.title);
  private moveT = 1;
  private moveDur = 1.6;
  private pose: Pose = clonePose(STATIONS.title);
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();
  private aspect = 16 / 9;
  time = 0;
  /** 0 = still camera (reduced motion). */
  motion = 1;

  constructor(density: number) {
    env.uMoonDir.value.copy(moonDir);
    this.city = buildCity(density);
    const sea = new Sea(this.city.strip, [-5200, 5200], -3900);
    this.street = new Street();
    this.opaque.add(
      this.sky.mesh,
      new Clouds(this.camera).mesh,
      sea.mesh,
      buildTerrain(),
      buildHouses(density),
      this.street.group,
      this.city.group,
      buildSusuki(density),
      buildBamboo(density),
    );
  }

  /** Glide to a station. */
  go(name: keyof typeof STATIONS | Pose, dur = 1.6) {
    const target = typeof name === "string" ? STATIONS[name] : name;
    this.from = clonePose(this.pose);
    this.to = clonePose(target);
    this.moveT = 0;
    this.moveDur = dur;
  }

  /** Jump without a glide. */
  snap(name: keyof typeof STATIONS) {
    this.pose = clonePose(STATIONS[name]);
    this.from = clonePose(this.pose);
    this.to = clonePose(this.pose);
    this.moveT = 1;
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
  }

  update(dt: number) {
    this.time += dt;
    env.uTime.value = this.time;
    const t = this.time;
    this.moveT = Math.min(1, this.moveT + dt / this.moveDur);
    const k = easeInOutCubic(this.moveT);
    lerpPose(this.from, this.to, k, this.pose);
    const ps = this.pointerS;
    ps.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const drift = this.motion;
    const p = this.pose;
    const cam = this.camera;
    const yaw = p.yaw + (ps.x * deg(1.6) + Math.sin(t * 0.13) * deg(0.35)) * drift;
    const pitch = p.pitch + (ps.y * deg(1.0) + Math.sin(t * 0.17 + 1) * deg(0.2)) * drift;
    cam.position.copy(p.pos);
    cam.position.y += Math.sin(t * 0.5) * 0.03 * drift;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    cam.up.set(Math.sin(p.roll ?? 0), Math.cos(p.roll ?? 0), 0);
    cam.lookAt(cam.position.clone().add(dir));
    // portrait screens: widen the vertical fov so the moon stays in frame
    const portrait = this.aspect < 1 ? Math.min(1.9, 1 / this.aspect) : 1;
    cam.fov = p.fov * (this.aspect < 1 ? 0.62 * portrait + 0.38 : 1);
    cam.aspect = this.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.street.update();
    this.city.update(t);
  }

  frame(pl: Pipeline): Frame {
    this.sky.update(this.camera, pl.height);
    return { camera: this.camera, opaque: this.opaque, fx: this.fx, overlay: this.overlay, lightDir: env.uMoonDir.value };
  }
}

function clonePose(p: Pose): Pose {
  return { pos: p.pos.clone(), yaw: p.yaw, pitch: p.pitch, fov: p.fov, roll: p.roll ?? 0 };
}

function lerpPose(a: Pose, b: Pose, k: number, out: Pose) {
  out.pos.lerpVectors(a.pos, b.pos, k);
  // a small lift mid-move so long glides arc instead of sliding
  out.pos.y += Math.sin(k * Math.PI) * Math.min(12, a.pos.distanceTo(b.pos) * 0.08);
  out.yaw = a.yaw + (b.yaw - a.yaw) * k;
  out.pitch = a.pitch + (b.pitch - a.pitch) * k;
  // fov in log space so telephoto moves feel even
  out.fov = Math.exp(Math.log(a.fov) + (Math.log(b.fov) - Math.log(a.fov)) * k);
  out.roll = (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * k;
}

const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
