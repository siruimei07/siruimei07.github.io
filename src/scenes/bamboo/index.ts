import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { dirFromAzEl, makeEnv } from "../common/env";
import { FishStream } from "../common/fishStream";
import { Sky } from "../common/sky";
import type { SceneContext, StageScene } from "../common/types";
import { Motes, buildMist, buildShafts } from "./fx";
import { buildGround, buildShrine, buildStumps } from "./ground";
import { buildBackdrop, buildCulms, buildFallingLeaves, buildSasa, buildSprays, placeCulms } from "./grove";
import { MAIN_CAMS, MOON_AZ, MOON_EL, MOON_R, moonDir, SHOTS, stalkBase } from "./layout";
import { ShiningStalk } from "./stalk";

// SYSTEM — 竹取の竹林. The grove where the tale begins: a deep bamboo wood at
// night, and in a small clearing the one stalk that shines. The film made it a
// gaming pole; here it is bamboo again, but it keeps the pole's slow rainbow.
// Moonlight slants through the canopy, fireflies drift over the kumazasa, an
// old hokora keeps its lantern lit, and a thin school of light-fish threads
// the culms up toward the moon.

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();
  const base = stalkBase();

  const env = makeEnv({
    moonDir,
    keyDir: dirFromAzEl(MOON_AZ + 8, 50),
    skyAmb: new THREE.Color(0.95, 1.0, 1.1),
    groundAmb: new THREE.Color(0.6, 0.66, 0.84),
    rimCol: new THREE.Color(0.55, 0.75, 1.0),
    fogCol: new THREE.Color(0.02, 0.055, 0.17),
    fogMoon: new THREE.Color(0.07, 0.15, 0.38),
    fogDist: new THREE.Vector3(8, 110, 0.92),
    wind: new THREE.Vector3(1, 0, 0.35),
  });

  const sky = new Sky({ moonRadius: MOON_R, zenith: 0x050b24, mid: 0x0c2260, horizon: 0x1d4b98, glow: 0x3a6cd0, moonGain: 2.4, stars: 0.7 });
  const clouds = new Clouds({
    list: [
      [37, MOON_EL - 2.8, 14, 1.8],
      [52, MOON_EL + 4, 20, 2.6],
      [26, MOON_EL + 7, 18, 2.4],
      [60, MOON_EL - 6, 16, 2.0],
      [12, MOON_EL + 13, 22, 3.0],
      [70, MOON_EL + 9, 16, 2.4],
    ],
    seed: 2718,
    drift: 0.6,
  });

  const culms = placeCulms(ctx.density);
  const shrine = buildShrine();
  const stalk = new ShiningStalk(base, env, ctx.density);
  const culmMeshes = buildCulms(culms, base);
  const sprays = buildSprays(culms, ctx.density);
  // the sky first (it writes no depth), then near to far so early-z rejects what is hidden
  opaque.add(sky.mesh);
  [stalk.opaque, buildSasa(ctx.density), culmMeshes.near, sprays.near, buildFallingLeaves(ctx.density), buildStumps(), shrine.group, buildGround(base), culmMeshes.far, sprays.cards, buildBackdrop(), clouds.mesh].forEach((o, i) => {
    const layer = new THREE.Group();
    layer.renderOrder = i + 1;
    layer.add(o);
    opaque.add(layer);
  });

  // the lantern and the candle in the hokora
  env.lamps[0].set(shrine.lanternLight.x, shrine.lanternLight.y, shrine.lanternLight.z, 3.2);
  env.lampCols[0].setRGB(1.3, 0.78, 0.36);

  const motes = new Motes(ctx.density);
  const fish = [
    // a thin school threads the culms, circles the shining stalk twice and streams off to the moon
    new FishStream({
      path: [
        [-15, 3.0, -9],
        [-10, 3.6, -8.5],
        [-6.5, 2.6, -6.0],
        [-3.5, 2.2, -3.2],
        [-1.9, 1.9, -0.2],
        [-1.0, 2.1, 1.6],
        [1.0, 2.4, 1.9],
        [2.1, 2.7, 0.2],
        [1.1, 3.0, -1.8],
        [-1.0, 3.3, -1.5],
        [-1.8, 3.6, 0.4],
        [-0.4, 3.9, 1.8],
        [1.7, 4.2, 1.0],
        [4.5, 5.2, -2.0],
        [8.5, 7.2, -6.5],
        [14, 12, -12.5],
        [21, 15, -20],
        [31, 19, -30],
        [44, 24, -43],
      ].map(([x, y, z]) => new THREE.Vector3(x, y + base.y, z)),
      closed: false,
      count: Math.round(160 * ctx.density),
      radius: 0.55,
      flatten: 0.5,
      size: 0.2,
      speed: 2.2,
      shoals: 0.75,
      trail: 0.5,
      intensity: 1.6,
      colors: [0xbff4ff, 0xe8fbff, 0x8fdcff, 0xffd6f0],
      seed: 31,
    }),
    new FishStream({
      path: [
        [-30, 6, -40],
        [-14, 8, -34],
        [0, 7, -30],
        [12, 9.5, -36],
        [20, 12, -48],
        [8, 13, -58],
        [-10, 10, -54],
      ].map(([x, y, z]) => new THREE.Vector3(x, y + base.y, z)),
      closed: true,
      count: Math.round(90 * ctx.density),
      radius: 1.4,
      flatten: 0.4,
      size: 0.3,
      speed: 3.2,
      shoals: 0.8,
      trail: 0.4,
      intensity: 1.1,
      seed: 57,
    }),
  ];
  fx.add(buildMist(MAIN_CAMS[1].position, SHOTS.screen.yaw, base.y), buildShafts(), motes.mesh, stalk.fx, ...fish.map((f) => f.mesh));

  // DEBUG (temporary): expose for the authoring scripts
  (globalThis as unknown as { __bamboo: unknown }).__bamboo = { opaque, fx };

  return {
    id: "bamboo",
    opaque,
    fx,
    env,
    shots: SHOTS,
    post: { exposure: 1.0, bloom: 1.25, inkFade: [18, 100], inkWidth: 1.3, rim: new THREE.Color(0.62, 0.82, 1.0) },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      sky.update(camera, heightPx);
      stalk.update(t, camera, heightPx);
      motes.update(camera, heightPx);
      for (const f of fish) f.update(camera, heightPx);
      // the lantern flickers
      const fl = 0.88 + 0.08 * Math.sin(t * 9.0) * Math.sin(t * 5.3 + 1.0) + 0.04 * Math.sin(t * 23.0);
      env.lampCols[0].setRGB(1.3 * fl, 0.78 * fl, 0.36 * fl);
    },
  };
}
