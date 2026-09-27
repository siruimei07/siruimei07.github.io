import * as THREE from "three";
import type { Frame, Pipeline } from "../engine/Pipeline";
import { applyEnv } from "./common/env";
import { CameraRig } from "./common/rig";
import type { SceneContext, SceneId, SceneModule, Shot, StageScene } from "./common/types";

// Hosts each scene with its own camera rig, and loads scene modules lazily
// (each one is its own chunk) so the title can show while the rest build.

const loaders: Record<SceneId, () => Promise<SceneModule>> = {
  bridge: () => import("./bridge"),
  stage: () => import("./stage"),
  pagoda: () => import("./pagoda"),
  avenue: () => import("./avenue"),
  susuki: () => import("./susuki"),
  street: () => import("./street"),
  bamboo: () => import("./bamboo"),
};

export const SCENE_IDS = Object.keys(loaders) as SceneId[];

export type ShotName = "menu" | "screen" | "title";

export class SceneHost {
  readonly rig: CameraRig;
  shot: ShotName = "menu";
  private frameObj: Frame;
  private ndc = new THREE.Vector3();

  constructor(readonly scene: StageScene) {
    this.rig = new CameraRig(scene.shots.menu);
    const s = scene;
    this.frameObj = {
      camera: this.rig.camera,
      lightDir: s.env.moonDir,
      opaque: s.opaque,
      fx: s.fx,
      before: () => applyEnv(s.env),
      look: s.post,
    };
  }

  get id() {
    return this.scene.id;
  }

  shotOf(name: ShotName): Shot {
    const s = this.scene.shots;
    return name === "title" ? (s.title ?? s.menu) : s[name];
  }

  go(name: ShotName, dur = 1.4) {
    this.shot = name;
    this.rig.go(this.shotOf(name), dur);
  }

  snap(name: ShotName) {
    this.shot = name;
    this.rig.snap(this.shotOf(name));
  }

  update(dt: number, t: number, pointer: THREE.Vector2, aspect: number, heightPx: number) {
    this.rig.update(dt, t, pointer, aspect);
    this.scene.update(t, dt, this.rig.camera, heightPx);
  }

  frame(): Frame {
    return this.frameObj;
  }

  /** The moon on screen: NDC centre and radius (NDC y units), if the scene has one. */
  moonNdc() {
    const cam = this.rig.camera;
    this.ndc.copy(this.scene.env.moonDir).multiplyScalar(1000).add(cam.position).project(cam);
    const r = Math.tan(this.scene.moonRadius ?? 0.05) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    return { x: this.ndc.x, y: this.ndc.y, r, front: this.ndc.z < 1 };
  }
}

export class Scenes {
  private hosts = new Map<SceneId, SceneHost>();
  private pending = new Map<SceneId, Promise<SceneHost>>();
  /** Build / warm-up times (ms) per scene, for tuning. */
  readonly stats: Record<string, { build: number; compile: number }> = {};

  constructor(
    private ctx: SceneContext,
    private pl: Pipeline,
  ) {}

  get(id: SceneId) {
    return this.hosts.get(id);
  }

  /** Import, build and warm up a scene (once). */
  load(id: SceneId): Promise<SceneHost> {
    const hit = this.hosts.get(id);
    if (hit) return Promise.resolve(hit);
    let p = this.pending.get(id);
    if (!p) {
      p = (async () => {
        const mod = await loaders[id]();
        const t0 = performance.now();
        const scene = await mod.build(this.ctx);
        const host = new SceneHost(scene);
        host.update(0, 0, new THREE.Vector2(), this.pl.width / this.pl.height, this.pl.height);
        const t1 = performance.now();
        await this.pl.compile(host.frame()).catch(() => undefined);
        this.stats[id] = { build: Math.round(t1 - t0), compile: Math.round(performance.now() - t1) };
        this.hosts.set(id, host);
        return host;
      })();
      this.pending.set(id, p);
    }
    return p;
  }

  /** Build the rest one after another while the page is idle. */
  async preload(ids: SceneId[]) {
    for (const id of ids) {
      await idle();
      await this.load(id).catch((e) => console.warn(`scene ${id} failed`, e));
    }
  }

  get all() {
    return [...this.hosts.values()];
  }
}

const idle = () =>
  new Promise<void>((r) => {
    if ("requestIdleCallback" in window) (window as Window & { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(() => r(), { timeout: 400 });
    else setTimeout(r, 60);
  });
