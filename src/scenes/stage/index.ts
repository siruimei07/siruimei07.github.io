import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { makeEnv } from "../common/env";
import { FishStream } from "../common/fishStream";
import { Sky } from "../common/sky";
import type { SceneContext, SceneShots, StageScene } from "../common/types";
import { buildCity } from "./city";
import { buildGate } from "./gate";
import { LANTERNS, moonDir, STONE_LANTERNS } from "./layout";
import { buildTownLights } from "./lights";
import { buildSakura, Petals } from "./sakura";
import { buildStage } from "./stage";

// PROFILE — 舞台: the great wooden terrace of a hilltop shrine, reached up
// stone steps through a vermilion gate, looking out over the night city of
// Tsukuyomi: blossom glowing under the balustrade, a valley of lights rising
// to the table mountain and its shrine, searchlights, schools of light-fish,
// and the full moon high over it all.

const shots: SceneShots = {
  // from the top of the steps: the whole view between the pillars
  menu: { pos: [0, 1.45, 8.4], yaw: 0, pitch: 4, fov: 50 },
  // pushed in by the left pillar, turned toward the moon
  screen: { pos: [-5.2, 1.6, 8.8], yaw: 7, pitch: 7, fov: 46 },
};

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();
  const d = ctx.density;

  const L = (i: number, r: number) => new THREE.Vector4(LANTERNS[i].x, LANTERNS[i].y, LANTERNS[i].z, r);
  const env = makeEnv({
    moonDir,
    keyDir: new THREE.Vector3(0.3, 0.85, 0.55),
    skyAmb: new THREE.Color(0.92, 0.94, 1.05),
    groundAmb: new THREE.Color(0.95, 0.78, 0.84),
    rimCol: new THREE.Color(0.62, 0.78, 1.0),
    fogCol: new THREE.Color(0x0b1943),
    fogMoon: new THREE.Color(0x1f3c80),
    fogDist: new THREE.Vector3(260, 9000, 0.8),
    poleLight: new THREE.Vector4(0, -1.5, -21, 26),
    poleCol: new THREE.Color(1.0, 0.42, 0.34).multiplyScalar(0.8),
    lamps: [L(3, 6.5), L(4, 6.5), new THREE.Vector4(STONE_LANTERNS[0].x, 1.6, STONE_LANTERNS[0].z, 5), new THREE.Vector4(STONE_LANTERNS[1].x, 1.6, STONE_LANTERNS[1].z, 5)],
    lampCols: [new THREE.Color(1.0, 0.6, 0.3), new THREE.Color(1.0, 0.6, 0.3), new THREE.Color(1.0, 0.62, 0.3), new THREE.Color(1.0, 0.62, 0.3)],
    wind: new THREE.Vector3(1, 0, 0.4),
  });

  const lampBase = env.lampCols.map((c) => c.clone());

  const sky = new Sky({ moonRadius: 4.2, zenith: 0x030817, mid: 0x08163f, horizon: 0x24438a, glow: 0x2e58b0, stars: 0.5, halo: 0.9 });
  const clouds = new Clouds({
    list: [
      // one across the moon's lower half, a bank over the left, one low behind the mesa
      [27, 15.5, 20, 3.6],
      [-26, 19.5, 28, 5.0],
      [2, 9.0, 26, 3.4],
      [-50, 8, 30, 4.0],
    ],
    seed: 2718,
    body: 0x0f214f,
    mid: 0x1f3f86,
    lining: 0xd8e6ff,
    front: 0x2a4a92,
  });
  // Draw the sky and the clouds last, depth-tested, so they only fill what the
  // stage and the town leave uncovered (the G-buffer pass is fill-bound).
  sky.material.depthTest = true;
  sky.material.depthFunc = THREE.LessEqualDepth;
  sky.mesh.renderOrder = 1000;
  clouds.mesh.renderOrder = 900;
  const city = buildCity(d);
  const gate = buildGate();
  opaque.add(sky.mesh, clouds.mesh, gate.group, buildStage(), buildSakura(d), city.group);

  const town = buildTownLights(d);
  const petals = new Petals(d);
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const fish = [
    // a school weaving low over the near town, just past the blossom
    new FishStream({
      path: [V(-60, 14, -260), V(70, 26, -200), V(190, 12, -190), V(330, 30, -250), V(480, 22, -330), V(560, 46, -470), V(420, 60, -560), V(250, 40, -470), V(90, 56, -520), V(-40, 38, -430)],
      count: Math.round(220 * d),
      radius: 11,
      flatten: 0.5,
      size: 3.2,
      speed: 22,
      trail: 0.45,
      shoals: 0.75,
      intensity: 1.6,
      minPx: 2.5,
      seed: 11,
      colors: [0xbff4ff, 0xe8fbff, 0xffc8e8, 0x9fe6ff],
    }),
    // a longer river further out, sweeping in from the left over the town
    new FishStream({
      path: [V(-1100, 70, -560), V(-700, 95, -620), V(-360, 80, -700), V(-80, 110, -640), V(180, 90, -560), V(60, 70, -430), V(-240, 60, -420), V(-560, 75, -460), V(-900, 60, -420)],
      count: Math.round(200 * d),
      radius: 22,
      flatten: 0.45,
      size: 5.5,
      speed: 34,
      trail: 0.4,
      shoals: 0.7,
      intensity: 1.35,
      minPx: 2.2,
      seed: 23,
      colors: [0xbff4ff, 0xe8fbff, 0xffd6f0, 0x9fe6ff],
    }),
    // one school curling up out of the blossom on the right: a loop, then past the
    // right lantern and over the gate, back out high and down into the valley
    new FishStream({
      path: [
        V(-4.0, -5.0, -26),
        V(-0.5, 0.6, -19),
        V(3.4, 4.2, -15.5),
        V(4.6, 7.4, -12.5),
        V(4.9, 9.6, -15.0),
        V(7.4, 10.2, -16.0),
        V(9.2, 8.2, -13.5),
        V(8.4, 6.4, -9.5),
        V(6.8, 6.6, -5.5),
        V(4.8, 8.8, -3.0),
        V(2.4, 11.8, -5.0),
        V(1.0, 15.0, 3.0),
        V(8.0, 16.0, 14.0),
        V(26, 8.0, 10.0),
        V(30, -6.0, -10.0),
        V(20, -10.0, -26.0),
        V(4, -12.0, -40.0),
      ],
      count: Math.round(260 * d),
      radius: 0.55,
      flatten: 0.55,
      size: 0.32,
      speed: 4.2,
      trail: 0.55,
      shoals: 0.35,
      intensity: 1.8,
      minPx: 2.4,
      seed: 5,
    }),
  ];
  fx.add(town.group, ...fish.map((f) => f.mesh), petals.mesh);

  return {
    id: "stage",
    opaque,
    fx,
    env,
    shots,
    post: { exposure: 1.0, bloom: 1.35, inkFade: [70, 480], inkWidth: 1.2, rim: new THREE.Color(0.68, 0.82, 1.0) },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      // the lanterns' light breathes a little (flame behind paper and stone)
      for (let i = 0; i < 4; i++) {
        const k = 0.9 + 0.06 * Math.sin(t * (5.3 + i) + i * 1.7) + 0.04 * Math.sin(t * (11.1 + i * 0.7));
        env.lampCols[i].copy(lampBase[i]).multiplyScalar(k);
      }
      city.update(t);
      sky.update(camera, heightPx);
      town.update(camera, heightPx);
      for (const f of fish) f.update(camera, heightPx);
    },
  };
}
