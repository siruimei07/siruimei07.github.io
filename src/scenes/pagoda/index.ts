import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { makeEnv } from "../common/env";
import { Sky } from "../common/sky";
import type { SceneContext, StageScene } from "../common/types";
import { buildAirship } from "./airship";
import { buildFish } from "./fish";
import { buildGround } from "./ground";
import { Lanterns } from "./lanterns";
import { AIRSHIP, moonDir, PAGODA, screenPoint, SHOTS, shotCamera, STREET_HALF, streetY, TERRACE_Y } from "./layout";
import { buildMachiya } from "./machiya";
import { buildNeon, type GlyphSpec, streetBoards } from "./neon";
import { buildPagoda } from "./pagoda";
import { buildParticles } from "./particles";
import { buildPrecinct } from "./precinct";
import { buildSkyline } from "./skyline";
import { type BigFish, buildSparkFish } from "./sparkfish";

// SKILL — 五重塔の路地: a low-angle look up a lantern-strung street in
// Tsukuyomi's old town. The vermilion five-storey pagoda stands at the head
// of the street against the full moon, the fish airship drifts above the
// skyline and rivers of light-fish spiral up between the buildings.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);


/**
 * A loop in the plane facing the screen-shot camera, centred behind screen
 * point (sx, sy) at distance d: whatever swims along it is seen side-on.
 */
function viewLoop(sx: number, sy: number, d: number, rx: number, ry: number, depth: number, n = 12) {
  const cam = shotCamera(SHOTS.screen);
  const c = screenPoint(SHOTS.screen, sx, sy, d);
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(c.clone().addScaledVector(right, Math.cos(a) * rx).addScaledVector(up, Math.sin(a) * ry).addScaledVector(fwd, Math.sin(a * 2) * depth));
  }
  return out;
}

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();
  const sky = new Sky({ moonRadius: 4.6, zenith: 0x02060f, mid: 0x071335, horizon: 0x16306a, glow: 0x2c52a8, moonGain: 2.5, stars: 0.35 });
  const clouds = new Clouds({
    list: [
      [-34, 26, 46, 5],
      [44, 18, 56, 6],
      [-62, 42, 34, 5],
      [80, 34, 40, 6],
    ],
    body: 0x14224e,
    mid: 0x263e7a,
    lining: 0xa8c0f0,
    front: 0x1c2e6c,
    seed: 5150,
  });
  const env = makeEnv({
    moonDir,
    keyDir: new THREE.Vector3(0.3, 0.75, -0.55),
    skyAmb: new THREE.Color(0.34, 0.4, 0.66),
    groundAmb: new THREE.Color(0.62, 0.42, 0.34),
    rimCol: new THREE.Color(0.7, 0.82, 1.0),
    fogCol: new THREE.Color(0.035, 0.065, 0.17),
    fogMoon: new THREE.Color(0.09, 0.15, 0.36),
    fogDist: new THREE.Vector3(90, 1500, 0.72),
  });

  const lanterns = new Lanterns();
  const pagoda = buildPagoda(V(PAGODA.x, TERRACE_Y, PAGODA.z), PAGODA.rot);
  for (const p of pagoda.lanterns) lanterns.add(p, 0.5, 2);
  const machiya = buildMachiya(ctx.density, lanterns);
  const precinct = buildPrecinct(ctx.density);
  const skyline = buildSkyline(ctx.density);
  const airship = buildAirship(AIRSHIP.pos, AIRSHIP.quat, AIRSHIP.length);

  // neon glyphs round the temple and over the city, boards along the street
  const face = PAGODA.rot;
  const onPagoda = V(0, 7.2, 6.4).applyAxisAngle(V(0, 1, 0), face).add(V(PAGODA.x, TERRACE_Y, PAGODA.z));
  const glyphs: GlyphSpec[] = [
    { p: onPagoda, size: 1.5, glyph: 2, color: 0xff2848, yaw: face },
    { p: V(15, TERRACE_Y + 10, -60), size: 1.5, glyph: 0, color: 0xff48c8, yaw: -0.35, flicker: 1 },
    { p: V(11.5, TERRACE_Y + 5.5, -53), size: 1.15, glyph: 1, color: 0x8cff3c, yaw: -0.25 },
    { p: V(-10.5, TERRACE_Y + 7.5, -56), size: 1.0, glyph: 1, color: 0x40e6ff, yaw: 0.3 },
    { p: V(-13, TERRACE_Y + 12, -64), size: 1.1, glyph: 3, color: 0xff70d0, yaw: 0.35, flicker: 1 },
    { p: V(8.4, streetY(-30) + 11.5, -30), size: 0.9, glyph: 4, color: 0xffb030, yaw: -0.5 },
    { p: V(70, 70, -300), size: 9, glyph: 0, color: 0xff48c8, yaw: -0.2 },
    { p: V(-110, 80, -330), size: 10, glyph: 1, color: 0x8cff3c, yaw: 0.25 },
    { p: V(170, 90, -420), size: 12, glyph: 3, color: 0x40e6ff, yaw: -0.4, flicker: 1 },
  ];
  const neon = buildNeon(glyphs, streetBoards(STREET_HALF, streetY));

  // the living air: fish rivers, great sparkling fish, embers, lanterns, petals
  const fish = buildFish(ctx.density, pagoda.top);
  const big: BigFish[] = [
    // round the airship, swimming up past its tail
    { path: viewLoop(0.86, 0.3, 300, 150, 110, 40), length: 70, speed: 15, phase: 0.62 },
    // arching over the pagoda, left of the moon
    { path: viewLoop(0.6, 0.2, 140, 46, 34, 12), length: 26, speed: 6, phase: 0.2 },
    // across the top of the frame, above the panels
    { path: viewLoop(0.34, 0.06, 170, 150, 40, 20), length: 40, speed: 9, phase: 0.45 },
  ];
  const spark = buildSparkFish(big, ctx.density);
  const particles = buildParticles(
    [
      { min: V(-8, streetY(20), -60), max: V(10, streetY(20) + 32, 20), count: 380, type: 0 },
      { min: V(-40, 10, -190), max: V(50, 130, -10), count: 110, type: 1 },
      { min: V(-10, 4, -75), max: V(14, 24, -22), count: 90, type: 2 },
      { min: V(-22, TERRACE_Y, -92), max: V(26, TERRACE_Y + 16, -44), count: 420, type: 3 },
      { min: V(-6, 2, -40), max: V(6, 13, 12), count: 160, type: 3 },
    ],
    ctx.density,
  );
  fx.add(fish.group, spark.mesh, particles.mesh, neon.fx);

  const lanternMesh = lanterns.build();
  const ground = buildGround();
  opaque.add(sky.mesh, clouds.mesh, ground, pagoda.group, machiya.group, precinct.group, skyline.group, airship.group, neon.group, lanternMesh);
  // DEBUG(perf): ?hide=a,b hides groups
  const hide = new URLSearchParams(location.search).get("hide")?.split(",") ?? [];
  const named: Record<string, THREE.Object3D> = { sky: sky.mesh, clouds: clouds.mesh, ground, pagoda: pagoda.group, machiya: machiya.group, precinct: precinct.group, skyline: skyline.group, airship: airship.group, neon: neon.group, lanterns: lanternMesh, fish: fish.group, spark: spark.mesh, particles: particles.mesh, neonfx: neon.fx };
  for (const h of hide) if (named[h]) named[h].visible = false;

  return {
    id: "pagoda",
    opaque,
    fx,
    env,
    shots: SHOTS,
    post: { exposure: 1.0, bloom: 1.6, inkFade: [120, 650] },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      pagoda.update(t);
      airship.update(t);
      sky.update(camera, heightPx);
      fish.update(camera, heightPx);
      spark.update(camera, heightPx);
      particles.update(camera, heightPx);
    },
  };
}
