import * as THREE from "three";
import type { Pipeline } from "../engine/Pipeline";
import { lerpPose, pose, type Pose, type WaterWorld } from "../stages/WaterWorld";
import type { Tunnel } from "../stages/Tunnel";

// The entry sequence, on the reference clip's clock (seconds):
//   0.00–0.70  black
//   0.70–5.44  warp tunnel (Tunnel stage)
//   5.30–5.70  white-out
//   5.44–6.45  surfacing: the camera sits at the waterline pitched down at
//              the torii's reflection, over-exposed; it whips up to the
//              dusk view through spray and churned water (clip 5.5–6.4)
//   6.45–11.5  dusk: peach cumulus, lanterns, slow push-in
//   11.5–19.5  nightfall as a time-lapse: the sun sinks, the clouds race and
//              turn navy, stars appear and trail, then the trails fold back
//              into points; the camera settles low to show the sky
//   18.5–24    the drone whale takes off from the lake and assembles
//   19.5–23.5  camera moves into the cover composition

const s = THREE.MathUtils.smoothstep;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const ease = (x: number) => x * x * (3 - 2 * x);

export const T_TUNNEL_END = 5.44;
export const T_SURFACE = 5.84;
export const T_INTRO_END = 23.5;
export const T_COVER_UI = 20.6;

const DUSK_FOV = 38;
const DIST = 41;

// Horizon height on screen (0 = top edge, 1 = bottom) while surfacing,
// read off the clip frame by frame.
const HORIZON_KEYS: [number, number][] = [
  [5.44, -0.32],
  [5.6, -0.1],
  [5.73, 0.0],
  [5.8, 0.05],
  [5.87, 0.2],
  [5.93, 0.41],
  [6.0, 0.5],
  [6.07, 0.57],
  [6.13, 0.62],
  [6.2, 0.67],
  [6.27, 0.7],
  [6.33, 0.715],
  [6.45, 0.72],
];

// Catmull-Rom through (t, v) keys — smooth but passes every measured point.
function spline(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (t > keys[i + 1][0]) i++;
  const p0 = keys[Math.max(0, i - 1)][1];
  const p1 = keys[i][1];
  const p2 = keys[i + 1][1];
  const p3 = keys[Math.min(n - 1, i + 2)][1];
  const u = (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

// Piecewise smoothstep curve through keys.
function curve(t: number, keys: [number, number][]) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t <= t1) return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
}

/** Camera pose at (0, h, z) with the horizon at screen height yh (0 = top). */
function horizonPose(h: number, z: number, yh: number, fov: number, roll: number, out: Pose) {
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const pitch = Math.atan((2 * yh - 1) * tanHalf);
  out.pos.set(0, h, z);
  out.target.set(0, h + Math.tan(pitch) * DIST, z - DIST);
  out.fov = fov;
  out.roll = roll;
  return out;
}

const P_DUSK = horizonPose(1.2, DIST, 0.72, DUSK_FOV, 0, pose(0, 0, 0, 0, 0, 0));
const P_DUSK_END = pose(0.5, 1.3, 43.2, 0.25, P_DUSK.target.y + 0.4, 0, DUSK_FOV);
const P_NIGHT = pose(0, 0.95, 62, 0, 13.5, 0, 42);
export const P_COVER = pose(-16, 2.2, 58, 3.4, 10.4, 0, 42);

export type IntroFrame = {
  stage: "black" | "tunnel" | "water";
};

export class Director {
  private tmpPose = pose(0, 0, 0, 0, 0, 0);

  constructor(
    private world: WaterWorld,
    private tunnel: Tunnel,
  ) {}

  /** Apply the intro state at clip time T; returns which stage to draw. */
  intro(T: number, pl: Pipeline, now: number): IntroFrame {
    const post = pl.post;
    const w = this.world;
    // White-out between the tunnel's sun and the surface.
    post.flash = curve(T, [
      [5.3, 0],
      [5.43, 1],
      [5.48, 1],
      [5.54, 0.55],
      [5.63, 0.22],
      [5.74, 0],
    ]);
    post.flashColor.setRGB(1.0, 0.975, 0.985);
    post.fade = 0;

    if (T < 0.7) {
      post.exposure = 1;
      return { stage: "black" };
    }
    if (T < T_TUNNEL_END) {
      this.tunnel.setTime(T);
      post.exposure = 1;
      post.bloom = 0.05;
      post.ca = 0.004;
      post.vignette = 0.5;
      post.grain = 0.018;
      post.saturation = 1;
      post.contrast = 0.1;
      return { stage: "tunnel" };
    }

    // --- World A
    post.bloom = THREE.MathUtils.lerp(0.11, 0.09, w.tod);
    post.ca = 0.006 * (1 - s(T, 5.9, 6.8));
    post.vignette = 0.24;
    post.grain = 0.012;
    post.contrast = 0.08;
    post.saturation = 1;
    // Over-exposure fading as we come up (pink-white like the clip).
    this.exposureBoost = curve(T, [
      [5.44, 9],
      [5.62, 8],
      [5.73, 5.2],
      [5.8, 3.7],
      [5.87, 2.7],
      [5.93, 2.05],
      [6.0, 1.65],
      [6.13, 1.3],
      [6.33, 1.1],
      [6.7, 1.0],
    ]);

    // Wet lens and spray.
    w.emergence.streak = curve(T, [
      [5.7, 0],
      [5.8, 1],
      [6.1, 0.85],
      [6.5, 0.25],
      [6.9, 0],
    ]);
    w.splash.age = T - (T_SURFACE - 0.1);
    // Ripples and foam are keyed to the intro clock, so seeking stays exact.
    if (T >= T_SURFACE - 0.06 && T < T_SURFACE + 4) w.surface(now - (T - (T_SURFACE - 0.06)));

    // Time of day.
    w.tod = curve(T, [
      [11.5, 0],
      [13.4, 0.3],
      [15.6, 0.62],
      [19.5, 1],
    ]);
    w.windSpeed = 1 + 11 * s(T, 11.2, 13.5) * (1 - s(T, 17.5, 20.5));

    // Stars and trails: grow 14 → 17.5, fold back 17.5 → 19.9.
    const st = w.stars;
    st.alpha = s(w.tod, 0.42, 0.85);
    const grow = clamp01((T - 14.0) / 3.5);
    const fold = clamp01((T - 17.5) / 2.4);
    const maxLen = 0.16;
    st.length = maxLen * ease(grow) * (1 - ease(fold));
    st.head = maxLen * ease(grow) + 0.02 * Math.max(0, T - 17.5);

    // Sky lanterns: a few at dusk, more as night falls.
    w.skyLanterns.intensity = THREE.MathUtils.lerp(0.35, 1, s(w.tod, 0.2, 0.8));
    w.lanternRate = THREE.MathUtils.lerp(0.4, 2.2, s(w.tod, 0.3, 0.9));

    // Whale: take-off 18.5, formation by ~24.
    w.whale.alpha = s(T, 18.2, 19.4);
    w.whale.assemble = clamp01((T - 18.5) / 5.5);

    // Camera.
    const p = this.tmpPose;
    if (T < 6.7) {
      const h = curve(T, [
        [5.44, 0.14],
        [5.87, 0.3],
        [6.1, 0.9],
        [6.45, 1.2],
      ]);
      const roll = 0.03 * Math.sin((T - 5.44) * 7) * (1 - s(T, 5.8, 6.45));
      // A slight dolly back as we rise (the torii reads larger while tilting up).
      const z = curve(T, [
        [5.9, DIST - 5],
        [6.7, DIST],
      ]);
      horizonPose(h, z, spline(T, HORIZON_KEYS), DUSK_FOV, roll, p);
    } else if (T < 11.5) {
      lerpPose(P_DUSK, P_DUSK_END, ease((T - 6.7) / 4.8), p);
    } else if (T < 19.5) {
      lerpPose(P_DUSK_END, P_NIGHT, ease((T - 11.5) / 8.0), p);
    } else {
      lerpPose(P_NIGHT, P_COVER, ease(clamp01((T - 19.5) / 4.0)), p);
    }
    w.setPose(p);
    return { stage: "water" };
  }

  /** Extra exposure multiplier for World A during the intro. */
  exposureBoost = 1;

  /** Settled night state for the cover (after the intro). */
  night(pl: Pipeline) {
    const w = this.world;
    const post = pl.post;
    post.flash = 0;
    post.bloom = 0.09;
    post.ca = 0;
    post.vignette = 0.24;
    post.grain = 0.012;
    post.contrast = 0.08;
    post.saturation = 1;
    this.exposureBoost = 1;
    w.emergence.streak = 0;
    w.tod = 1;
    w.windSpeed = 1;
    w.stars.alpha = 1;
    w.stars.length = 0;
    w.stars.head += 0.00006;
    w.skyLanterns.intensity = 1;
    w.lanternRate = 1.6;
    w.whale.alpha = 1;
    w.whale.assemble = 1;
    w.splash.age = 99;
    post.exposure = w.atmos.exposure * (1 + 0.25 * w.fireworks.light());
  }
}
