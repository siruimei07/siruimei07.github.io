import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { makeEnv } from "../common/env";
import { FishStream } from "../common/fishStream";
import { Sky } from "../common/sky";
import type { SceneContext, SceneShots, StageScene } from "../common/types";
import { buildBridge, WARM } from "./bridge";
import { buildCity } from "./city";
import { buildHaze, buildSearchlights, Motes, MOTE_BOX, type Beam } from "./fx";
import { DECK_Y, EYE, hillY, moonDir, POST, POST_LIGHT_Y, TORII_Z } from "./layout";
import { BIG_LAMPS, buildShrine } from "./shrine";
import { buildWater } from "./water";

// TITLE — 月見橋, the long vermilion bridge into Tsukuyomi. Standing on the
// wet deck, the lantern-lined railings run away to the great torii and the
// gate hall; beyond the shore forest the city climbs its hill in a haze of
// warm and coloured lights up to the table mountain, the full moon above,
// and rivers of light-fish stream over the water toward the city.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const shots: SceneShots = {
  // the bridge's vanishing point centre-right, the torii, city heart and moon above it
  title: { pos: [-1.0, EYE, 4], yaw: -9.8, pitch: 12, fov: 44 },
  // the hero pushed to the right third, strong silhouettes for the sea grade
  menu: { pos: [-2.2, EYE, 14], yaw: -22, pitch: 14, fov: 46 },
  // lower and closer to the right railing: lantern post, rail and torii in the right 45%
  screen: { pos: [1.7, DECK_Y + 1.05, 1], yaw: -13, pitch: 11, fov: 50 },
};

/** Wrap objects in a group whose renderOrder orders them among the scene's groups. */
const layer = (order: number, ...objs: THREE.Object3D[]) => {
  const g = new THREE.Group();
  g.renderOrder = order;
  g.add(...objs);
  return g;
};

export function build(ctx: SceneContext): StageScene {
  const dens = ctx.density;
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();

  const sky = new Sky({ moonRadius: 3.6, zenith: 0x02071a, mid: 0x08173c, horizon: 0x152d66, glow: 0x2c56b0, moonGain: 1.9, stars: 0.7, halo: 0.8 });
  const clouds = new Clouds({
    list: [
      [-46, 22, 50, 8],
      [-14, 33, 40, 7],
      [34, 31, 44, 8],
      [15, 17.4, 30, 3.4],
      [-4, 44, 60, 9],
      [58, 21, 40, 6],
      [-80, 27, 46, 7],
      [-32, 15.2, 30, 3],
      [46, 13.8, 26, 2.6],
    ],
    seed: 811,
    body: 0x0a1838,
    mid: 0x173266,
    lining: 0xcfe0ff,
    front: 0x21407e,
    drift: 0.6,
  });
  const city = buildCity(dens);

  const warm = (k: number) => WARM.clone().multiplyScalar(k);
  const env = makeEnv({
    moonDir,
    keyDir: V(0.12, 1.0, -0.45),
    skyAmb: new THREE.Color(1, 1, 1),
    groundAmb: new THREE.Color(0.78, 0.82, 0.95),
    rimCol: new THREE.Color(0.6, 0.78, 1.0),
    fogCol: new THREE.Color(0.025, 0.05, 0.12),
    fogMoon: new THREE.Color(0.07, 0.08, 0.2),
    fogDist: V(220, 3400, 0.6),
    poleLight: new THREE.Vector4(POST.x, POST_LIGHT_Y, POST.z, 7.5),
    poleCol: warm(1.5),
    lamps: [
      new THREE.Vector4(BIG_LAMPS[0].x, BIG_LAMPS[0].y, BIG_LAMPS[0].z, 11),
      new THREE.Vector4(BIG_LAMPS[1].x, BIG_LAMPS[1].y, BIG_LAMPS[1].z, 11),
      new THREE.Vector4(0, DECK_Y + 3, -146, 20),
      new THREE.Vector4(0, DECK_Y + 6, TORII_Z + 8, 14),
    ],
    lampCols: [warm(1.4), warm(1.4), warm(1.0), warm(0.5)],
  });

  // Draw order (G-buffer overdraw is the cost): the sky first, then near to
  // far — bridge, shrine, forest, city, the big terrain — then the lake
  // (mostly hidden under the deck) and the clouds behind everything.
  const bridge = buildBridge(city.map);
  bridge.renderOrder = 1;
  const shrine = buildShrine();
  shrine.renderOrder = 2;
  city.group.renderOrder = 4;
  opaque.add(sky.mesh, bridge, shrine, city.group, layer(10, buildWater(city.map)), layer(11, clouds.mesh));
  // TEMP(debug): hide parts by name, ?bdbg=deck,bodies,…
  {
    const dbg = (new URLSearchParams(location.search).get("bdbg") ?? "").split(",").filter(Boolean);
    bridge.name = "bridge";
    shrine.name = "shrine";
    city.group.name = "city";
    opaque.children[4].name = "water";
    opaque.children[5].name = "clouds";
    sky.mesh.name = "sky";
    opaque.traverse((o) => {
      if (dbg.includes(o.name)) o.visible = false;
    });
    if (dbg.includes("fx")) fx.visible = false;
    Object.assign(window, { __bridge: { opaque, fx } });
  }

  // ---------------------------------------------------------------- light-fish
  const streams = [
    // the great river: along the right of the bridge, up over the gate toward the moon, back down the left
    new FishStream({
      path: [V(14, 5, 20), V(12, 6, -8), V(10, 8, -40), V(9, 11, -80), V(4, 18, -120), V(-4, 30, -170), V(-6, 60, -260), V(10, 110, -380), V(40, 170, -520), V(80, 240, -700), V(140, 300, -860), V(60, 330, -940), V(-60, 300, -860), V(-120, 220, -640), V(-140, 140, -420), V(-90, 60, -230), V(-40, 22, -120), V(-18, 10, -60), V(-14, 6, -20), V(-8, 6, 24)],
      count: Math.round(1000 * dens),
      radius: 4.5,
      flatten: 0.55,
      size: 0.5,
      speed: 9,
      shoals: 0.7,
      trail: 0.45,
      intensity: 1.6,
      seed: 17,
    }),
    // a ribbon down the bridge toward the torii, back low over the right water
    new FishStream({
      path: [V(9, 6, 16), V(6, 6.5, -6), V(2, 7.5, -30), V(0, 9, -60), V(-1, 11, -95), V(2, 12, -118), V(8, 8, -110), V(14, 4, -80), V(16, 3, -45), V(15, 3.5, -15), V(13, 4.5, 8)],
      count: Math.round(380 * dens),
      radius: 1.6,
      flatten: 0.6,
      size: 0.3,
      speed: 5,
      shoals: 0.8,
      trail: 0.4,
      intensity: 1.4,
      seed: 29,
    }),
    // far above the city: a slow wheel of sparks
    new FishStream({
      path: [V(-700, 110, -520), V(-300, 150, -380), V(200, 140, -420), V(600, 110, -560), V(700, 90, -800), V(300, 120, -900), V(-200, 170, -800), V(-650, 140, -760)],
      count: Math.round(700 * dens),
      radius: 20,
      flatten: 0.45,
      size: 2.4,
      speed: 26,
      shoals: 0.75,
      trail: 0.25,
      intensity: 1.2,
      minPx: 2,
      colors: [0xbff4ff, 0xe8fbff, 0xffc6e8, 0x8fdcff],
      seed: 41,
    }),
  ];

  // ---------------------------------------------------------------- searchlights, haze, motes
  const at = (x: number, z: number) => V(x, hillY(x, z) + 30, z);
  const beams: Beam[] = [
    { base: at(-620, -640), az: -12, el: 78, sweep: 7, color: 0x6f94ff, len: 1100, width: 5 },
    { base: at(-240, -560), az: 8, el: 81, sweep: 6, color: 0xa480ff, len: 1000, width: 5 },
    { base: at(330, -600), az: -6, el: 76, sweep: 8, color: 0x7fc0ff, len: 1100, width: 5 },
    { base: at(760, -820), az: 12, el: 73, sweep: 6, color: 0x90a8ff, len: 1100, width: 6 },
    { base: at(-1150, -900), az: -10, el: 75, sweep: 7, color: 0x8a70ff, len: 1200, width: 7 },
    { base: at(90, -900), az: 3, el: 84, sweep: 5, color: 0x88d0ff, len: 1000, width: 5 },
  ];
  const motes = new Motes(Math.round(140 * dens), MOTE_BOX.min, MOTE_BOX.size);
  fx.add(
    buildHaze(V(0, 85, -520), new THREE.Vector2(650, 210), new THREE.Color(1.0, 0.42, 0.2).multiplyScalar(0.14), new THREE.Color(0.35, 0.3, 0.85).multiplyScalar(0.05), 1, 160),
    buildSearchlights(beams),
    ...streams.map((s) => s.mesh),
    motes.mesh,
  );

  const base = { pole: env.poleCol.clone(), l0: env.lampCols[0].clone(), l1: env.lampCols[1].clone() };
  return {
    id: "bridge",
    opaque,
    fx,
    env,
    shots,
    post: { exposure: 1.0, bloom: 1.4, inkFade: [140, 650], inkWidth: 1.25, rim: new THREE.Color(0.66, 0.82, 1.0) },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      sky.update(camera, heightPx);
      for (const s of streams) s.update(camera, heightPx);
      motes.update(camera, heightPx);
      // the lanterns breathe
      const f = (a: number, b: number) => 0.9 + 0.06 * Math.sin(t * a) + 0.04 * Math.sin(t * b + 1.3);
      env.poleCol.copy(base.pole).multiplyScalar(f(7.3, 17.1));
      env.lampCols[0].copy(base.l0).multiplyScalar(f(6.1, 13.7));
      env.lampCols[1].copy(base.l1).multiplyScalar(f(5.3, 15.2));
    },
  };
}
