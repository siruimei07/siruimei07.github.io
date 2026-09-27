import type * as THREE from "three";
import type { EnvValues } from "./env";

// The contract every scene module fulfils. Each menu entry has its own,
// separately modelled scene; the app shows one at a time (two while a
// transition runs) through the shared toon pipeline.

export type SceneId = "bridge" | "stage" | "pagoda" | "avenue" | "susuki" | "street" | "bamboo";

/**
 * A camera placement. Angles in degrees: yaw 0 looks toward −z, positive yaw
 * turns right (toward +x); positive pitch looks up; roll tilts the horizon
 * (positive = clockwise on screen). fov is vertical, in degrees.
 */
export type Shot = { pos: [number, number, number]; yaw: number; pitch: number; fov: number; roll?: number };

/**
 * menu   — behind the P3R menu (graded blue): Yachiyo's window covers the
 *          left ~40% of the screen, the menu words the middle; keep the hero
 *          of the scene around the right third.
 * screen — behind a content screen (full colour): panels cover the left
 *          ~55%; frame the hero in the right ~45%.
 * title  — only the title scene: the big title type sits on the left half.
 */
export type SceneShots = { menu: Shot; screen: Shot; title?: Shot };

export type ScenePost = {
  exposure?: number;
  bloom?: number;
  /** Ink lines fade out between these view depths (m). */
  inkFade?: [number, number];
  inkWidth?: number;
  vignette?: number;
  /** Colour of the screen-space rim light (linear). */
  rim?: THREE.Color;
  /** Brightness under the menu's sea grade (1 = as is); keeps the menu words readable over bright skies. */
  sea?: number;
};

export interface StageScene {
  readonly id: SceneId;
  /** Opaque toon geometry and the sky; everything here writes the G-buffer aux target. */
  readonly opaque: THREE.Scene;
  /** Additive / transparent effects drawn after the ink pass (depth-test with fxDepthTest). */
  readonly fx: THREE.Scene;
  /** Lighting for this scene's toon materials; applied before each render. */
  readonly env: EnvValues;
  readonly shots: SceneShots;
  readonly post?: ScenePost;
  /** Angular radius (rad) of the moon disc, if the scene shows one (the title's fish ring uses it). */
  readonly moonRadius?: number;
  /**
   * Per-frame animation. `t` is the shared clock (s), `camera` is the camera
   * this frame renders with (already placed), `heightPx` the render height.
   */
  update(t: number, dt: number, camera: THREE.PerspectiveCamera, heightPx: number): void;
  dispose?(): void;
}

export type SceneContext = {
  /** 0.4 … 1: scale particle / instance counts with it. */
  density: number;
};

export type SceneModule = { build(ctx: SceneContext): StageScene | Promise<StageScene> };
