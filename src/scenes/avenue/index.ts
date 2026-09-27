import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { dirFromAzEl, makeEnv } from "../common/env";
import { Sky } from "../common/sky";
import type { SceneContext, StageScene } from "../common/types";
import { GlowDome, Searchlight } from "./atmosphere";
import { Batches } from "./batches";
import { Dots } from "./dots";
import { buildFish } from "./fish";
import { GATE, HALL, MOON_AZ, moonDir, PAGODA, PLAZA, shots, towerLots } from "./layout";
import { buildGround, buildPrecinct } from "./precinct";
import { buildGardens, buildLanterns, buildTowers } from "./towers";

// WORKS — 大通り: flying over downtown Tsukuyomi at night. A dense district of
// towers banded with lit floors and capped with pagoda roofs, giant paper
// lanterns glowing on their tops, the grand avenue and a temple precinct
// packed with people far below, all of it steeped in the warm pink haze of
// its own light — and everywhere, rivers of light-fish swirling between the
// towers, with great sparkler fish swimming above.

const srgb = (hex: number) => new THREE.Color(hex);

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();

  const sky = new Sky({ moonRadius: 3.8, zenith: 0x090818, mid: 0x1e0f30, horizon: 0x6a2442, glow: 0xff8e78, moonGain: 2.2, stars: 0.45, halo: 0.55 });
  const clouds = new Clouds({
    list: [
      // a puff low across the moon and two small ones beside it
      [MOON_AZ + 1, 2.4, 11, 3.4],
      [MOON_AZ + 13, 1.2, 9, 2.6],
      [MOON_AZ - 12, 1.0, 10, 2.4],
    ],
    // lit from below by the city: lighter than the sky, gold-pink linings toward the moon
    body: 0x7a3452,
    mid: 0xa84a62,
    lining: 0xffdcc8,
    front: 0x9a4060,
    seed: 1717,
    drift: 0.5,
  });

  const eye = new THREE.Vector3(...shots.screen.pos);
  const eyes = [eye, new THREE.Vector3(...shots.menu.pos)];
  const batches = new Batches();
  const dots = new Dots();
  const lots = towerLots(ctx.density);
  const towers = buildTowers(lots, batches, dots, eyes);
  const precinct = buildPrecinct(batches, dots, ctx.density, eye);
  const winU = { value: 1 };
  const fasU = { value: 1 };
  const lanterns = buildLanterns(towers.lanterns);
  opaque.add(sky.mesh, clouds.mesh, buildGround(), ...batches.build(eye, { uWin: winU, uFascia: fasU }), lanterns.group, buildGardens(lots, ctx.density, eyes), precinct.group);

  fx.add(dots.build(1.6));
  const fish = buildFish(fx, towers.heroes, ctx.density);

  // warm air over the bright places
  const plaza = new THREE.Vector3((PLAZA.x0 + PLAZA.x1) / 2, 18, (PLAZA.z0 + PLAZA.z1) / 2);
  const domes = [
    new GlowDome(plaza, new THREE.Vector3(120, 50, 150), 0xff8a5a, 0.2),
    new GlowDome(new THREE.Vector3(0, 25, -700), new THREE.Vector3(70, 40, 1000), 0xff7a66, 0.08),
  ];
  for (const t of towers.lanterns) domes.push(new GlowDome(t.pos, new THREE.Vector3(t.size * 2.6, t.size * 2.4, t.size * 2.6), 0xff6a30, 0.45));
  for (const d of domes) fx.add(d.mesh);

  // searchlights sweeping from two tower tops
  const lights = [
    new Searchlight(new THREE.Vector3(-260, 150, -420), { az: 30, el: 38, swing: 24, rate: 0.07, length: 2600, radius: 55, color: 0xffe0cc, intensity: 0.12, phase: 0 }),
    new Searchlight(new THREE.Vector3(520, 140, -520), { az: -10, el: 44, swing: 20, rate: 0.055, length: 2600, radius: 60, color: 0xd8ecff, intensity: 0.1, phase: 2.0 }),
  ];
  for (const l of lights) fx.add(l.mesh);

  // lighting: the moon low in the north-north-east, a warm city glow from below
  const hero = towers.lanterns[0];
  const env = makeEnv({
    moonDir,
    keyDir: dirFromAzEl(MOON_AZ + 35, 52),
    skyAmb: new THREE.Color(0.9, 0.82, 1.0),
    groundAmb: new THREE.Color(1.4, 0.86, 0.72),
    rimCol: new THREE.Color(1.0, 0.74, 0.7),
    fogCol: srgb(0x6a2840),
    fogMoon: srgb(0xa8465c),
    fogDist: new THREE.Vector3(100, 2600, 0.9),
    poleLight: hero ? new THREE.Vector4(hero.pos.x, hero.pos.y, hero.pos.z, hero.size * 3.2) : undefined,
    poleCol: new THREE.Color(2.2, 0.7, 0.3),
    lamps: [new THREE.Vector4(plaza.x, 10, plaza.z, 110), new THREE.Vector4(GATE.x, 8, GATE.z, 45), new THREE.Vector4(PAGODA.x, 12, PAGODA.z, 45), new THREE.Vector4(HALL.x - 30, 8, HALL.z, 60)],
    lampCols: [new THREE.Color(1.0, 0.62, 0.36), new THREE.Color(1.0, 0.45, 0.25), new THREE.Color(1.0, 0.55, 0.35), new THREE.Color(1.0, 0.6, 0.4)],
  });

  // AVDEBUG (temporary): expose the graphs for counting
  if (import.meta.env.DEV) Object.assign(globalThis, { __avenue: { opaque, fx }, __avenueInfo: { heroes: towers.heroes, lanterns: towers.lanterns } });
  return {
    id: "avenue",
    opaque,
    fx,
    env,
    shots,
    post: { exposure: 1.0, bloom: 1.3, inkFade: [340, 1400], inkWidth: 1.25, rim: new THREE.Color(1.0, 0.76, 0.72) },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      sky.update(camera, heightPx);
      dots.update(camera, heightPx);
      for (const s of fish.streams) s.update(camera, heightPx);
      for (const f of fish.big) f.update(camera, heightPx);
      for (const l of lights) l.update(t);
      lanterns.update(t);
      // the giant lantern breathes, and so does its light
      if (hero) {
        const k = 0.9 + 0.1 * Math.sin(t * 1.7) * Math.sin(t * 0.63 + 1.0);
        env.poleCol.setRGB(2.2 * k, 0.7 * k, 0.3 * k);
      }
    },
  };
}
