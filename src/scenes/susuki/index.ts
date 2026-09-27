import * as THREE from "three";
import { moonAt } from "../../lib/moon";
import { Clouds } from "../common/clouds";
import { makeEnv } from "../common/env";
import { FishStream } from "../common/fishStream";
import type { SceneContext, SceneShots, StageScene } from "../common/types";
import { buildGround, buildHills, buildTreelines, buildWoods, Pond } from "./land";
import { EYE_MENU, EYE_SCREEN, groundY, moonDir } from "./layout";
import { MoonSky } from "./moonSky";
import { Motes } from "./motes";
import { buildSusuki } from "./susuki";
import { buildTemple, lanternGeometry, lanternMaterial, yukimiGeometry } from "./temple";

// CALENDAR — 月見の野: the harvest-moon night of Yachiyo's first era. A
// field of silver susuki bowing in waves of wind, an old two-storey hall with
// warm light behind its lattice doors and dango offered on the veranda, a
// still pond, wooded hills, and above it all the moon — in its real phase of
// today, because this is the calendar's sky.

const shots: SceneShots = {
  // the moon high in the free top-right area, the hall's roofs and the tall plumes beside and below it
  screen: { pos: EYE_SCREEN, yaw: 15.5, pitch: 10, fov: 44 },
  // from the bank: the field, the moon and the hall in the right third
  menu: { pos: EYE_MENU, yaw: 3, pitch: 9, fov: 50 },
};

const SKY = {
  zenith: new THREE.Color(0x1f6ef0),
  mid: new THREE.Color(0x3a9ae6),
  horizon: new THREE.Color(0x7cd0f0),
  glow: new THREE.Color(0xc9f4ff),
};

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();

  // ---- sky: today's moon
  const sky = new MoonSky({ moonRadius: 4.6, zenith: SKY.zenith, mid: SKY.mid, horizon: SKY.horizon, glow: SKY.glow, stars: 0.3, halo: 0.8 });
  const phaseOverride = Number(new URLSearchParams(globalThis.location?.search ?? "").get("phase") ?? NaN);
  const phaseNow = () => (Number.isFinite(phaseOverride) ? phaseOverride : moonAt(new Date()).phase);
  sky.phase = phaseNow();
  const clouds = new Clouds({
    list: [
      // low streaks behind the hills
      [-20, 3.4, 40, 2.4],
      [12, 4.4, 30, 2.2],
      [66, 5.2, 28, 2.4],
      // a long thin streak trailing from under the moon
      [20, 12.6, 28, 2.0],
      [58, 10.5, 20, 2.2],
      // soft banks high up
      [2, 30, 36, 5.2],
      [-30, 21, 28, 4.2],
      [50, 30, 30, 4.4],
      [26, 44, 34, 5.0],
    ],
    seed: 91,
    body: 0xd4f2fb,
    mid: 0xace0f4,
    lining: 0xffffff,
    front: 0xbde8f7,
    drift: 0.8,
  });

  // ---- the valley
  const temple = buildTemple();
  // two Kasuga lanterns by the stair, a snow-viewing lantern at the pond's edge
  const lanternMat = lanternMaterial();
  const lanterns = new THREE.InstancedMesh(lanternGeometry(), lanternMat, 2);
  const m = new THREE.Matrix4();
  temple.lamps.slice(1, 3).forEach((p, i) => {
    m.compose(p.clone().setY(p.y - 1.6), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3 + i * 0.9), new THREE.Vector3(1, 1, 1));
    lanterns.setMatrixAt(i, m);
  });
  lanterns.frustumCulled = false;
  const yx = 9.6;
  const yz = -10.3;
  const yukimi = new THREE.Mesh(yukimiGeometry(), lanternMat);
  yukimi.position.set(yx, Math.max(groundY(yx, yz), -0.28), yz);
  yukimi.rotation.y = 0.4;
  const pondLight = yukimi.position.clone().add(new THREE.Vector3(0, 0.88, 0));
  const lanternSpots = [temple.lamps[1], temple.lamps[2], pondLight];

  const vase = temple.vase;
  const field = buildSusuki(ctx.density, [new THREE.Vector4(vase.x, vase.y - 0.1, vase.z, 1.05)]);

  const warmDoor = new THREE.Color(1.0, 0.56, 0.24).multiplyScalar(1.5);
  const warmLamp = new THREE.Color(1.0, 0.64, 0.3).multiplyScalar(1.25);
  const env = makeEnv({
    moonDir,
    keyDir: new THREE.Vector3(moonDir.x * 0.55, 1.0, moonDir.z * 0.55),
    skyAmb: new THREE.Color(1.0, 1.04, 1.1),
    groundAmb: new THREE.Color(0.8, 0.86, 0.98),
    rimCol: new THREE.Color(0.7, 0.92, 1.0),
    fogCol: new THREE.Color(0x7cc6ea),
    fogMoon: new THREE.Color(0xb8ecfb),
    fogDist: new THREE.Vector3(70, 2600, 0.85),
    lamps: [
      new THREE.Vector4(temple.lamps[0].x, temple.lamps[0].y, temple.lamps[0].z, 10),
      new THREE.Vector4(lanternSpots[0].x, lanternSpots[0].y + 0.3, lanternSpots[0].z, 4.5),
      new THREE.Vector4(lanternSpots[1].x, lanternSpots[1].y + 0.3, lanternSpots[1].z, 4.5),
      new THREE.Vector4(lanternSpots[2].x, lanternSpots[2].y + 0.2, lanternSpots[2].z, 4.2),
    ],
    lampCols: [warmDoor, warmLamp, warmLamp, warmLamp],
    wind: new THREE.Vector3(1, 0, -0.25),
  });
  const lampBase = env.lampCols.map((c) => c.clone());

  const pond = new Pond(
    { ...SKY, moonR: sky.moonRadius },
    [
      new THREE.Vector4(temple.lamps[0].x, temple.lamps[0].y, temple.lamps[0].z, 0.9),
      new THREE.Vector4(lanternSpots[2].x, lanternSpots[2].y, lanternSpots[2].z, 1.6),
      new THREE.Vector4(lanternSpots[0].x, lanternSpots[0].y + 0.35, lanternSpots[0].z, 0.6),
    ],
  );
  pond.lit = (1 - Math.cos(sky.phase * 2 * Math.PI)) / 2;

  // TEMP profiling switch: ?off=sky,clouds,hills,trees,woods,ground,pond,temple,lanterns,leaves,plumes
  const off = new Set((new URLSearchParams(globalThis.location?.search ?? "").get("off") ?? "").split(","));
  const parts: [string, THREE.Object3D][] = [
    ["sky", sky.mesh],
    ["clouds", clouds.mesh],
    ["hills", buildHills()],
    ["trees", buildTreelines()],
    ["woods", buildWoods()],
    ["ground", buildGround()],
    ["pond", pond.mesh],
    ["temple", temple.group],
    ["lanterns", lanterns],
    ["lanterns", yukimi],
    ["field", field.group],
  ];
  for (const [k, o] of parts) if (!off.has(k)) opaque.add(o);
  if (off.has("leaves")) field.group.children.slice(0, 3).forEach((c) => (c.visible = false));
  if (off.has("plumes")) field.group.children[3].visible = false;
  console.warn("susuki counts", JSON.stringify(field.group.userData.counts));

  // ---- fx: moon motes, fireflies, a faint school of light-fish crossing the moon
  const motes = new Motes(ctx.density);
  const eye = new THREE.Vector3(...EYE_SCREEN);
  const C = eye.clone().addScaledVector(moonDir, 300);
  const right = new THREE.Vector3().crossVectors(moonDir, new THREE.Vector3(0, 1, 0)).normalize();
  const upv = new THREE.Vector3().crossVectors(right, moonDir).normalize();
  const loop: [number, number, number][] = [
    [-120, -4, -40],
    [-45, -9, -64],
    [35, -6, -66],
    [115, 3, -36],
    [70, 30, 70],
    [-70, 26, 70],
  ];
  const fish = new FishStream({
    path: loop.map(([r, u, d]) => C.clone().addScaledVector(right, r).addScaledVector(upv, u).addScaledVector(moonDir, d)),
    closed: true,
    count: Math.round(110 * (0.5 + 0.5 * ctx.density)),
    radius: 3.2,
    flatten: 0.45,
    size: 1.3,
    speed: 11,
    colors: [0xbff4ff, 0xe8fbff, 0x8fdcff, 0xd6f0ff],
    intensity: 0.85,
    shoals: 0.8,
    trail: 0.45,
    minPx: 2.2,
    seed: 15,
  });
  fx.add(motes.mesh, fish.mesh);

  let lastPhase = Date.now();
  const flick = (t: number, k: number) => 0.9 + 0.06 * Math.sin(t * 7.1 + k * 1.7) + 0.04 * Math.sin(t * 12.3 + k * 4.1);

  return {
    id: "susuki",
    opaque,
    fx,
    env,
    shots,
    post: { exposure: 1.0, bloom: 1.25, inkFade: [80, 480], inkWidth: 1.25, rim: new THREE.Color(0.7, 0.92, 1.0) },
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      // the real phase of the moon, refreshed every minute
      const now = Date.now();
      if (now - lastPhase > 60_000) {
        lastPhase = now;
        sky.phase = phaseNow();
        pond.lit = (1 - Math.cos(sky.phase * 2 * Math.PI)) / 2;
      }
      for (let i = 0; i < 4; i++) env.lampCols[i].copy(lampBase[i]).multiplyScalar(flick(t, i));
      sky.update(camera, heightPx);
      field.update(camera, heightPx);
      motes.update(camera, heightPx);
      fish.update(camera, heightPx);
    },
  };
}

