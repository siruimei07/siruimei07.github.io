import * as THREE from "three";
import { Clouds } from "../common/clouds";
import { makeEnv } from "../common/env";
import { Sky } from "../common/sky";
import type { SceneContext, SceneShots, StageScene } from "../common/types";
import { buildCity } from "./city";
import { buildHouses } from "./houses";
import { moonDir, streetY } from "./layout";
import { Sea } from "./sea";
import { Street } from "./street";
import { buildTerrain } from "./terrain";
import { buildBamboo, buildSusuki } from "./vegetation";

// SOCIAL LINK — the real-world town where the film begins: a moonlit slope
// street down to the bay, the wires strung pole to pole (everything linked),
// and the first pole glowing seven colours: the ゲーミング電柱 where Iroha
// found Kaguya.

const eyeY = (z: number, h = 1.62) => streetY(z) + h;

const shots: SceneShots = {
  // the rainbow pole on the right third, the wires fanning out to the moon
  menu: { pos: [-2.2, eyeY(-2, 1.4), -2], yaw: 14, pitch: 12, fov: 46 },
  screen: { pos: [-1.6, eyeY(-7, 1.1), -7], yaw: 22, pitch: 17, fov: 50 },
};

export function build(ctx: SceneContext): StageScene {
  const opaque = new THREE.Scene();
  const fx = new THREE.Scene();
  const sky = new Sky();
  const city = buildCity(ctx.density);
  const sea = new Sea(city.strip, [-5200, 5200], -3900);
  // the street's pole and lamp lights live in this scene's lighting
  const env = makeEnv({ moonDir });
  const street = new Street(env);
  opaque.add(
    sky.mesh,
    new Clouds().mesh,
    sea.mesh,
    buildTerrain(),
    buildHouses(ctx.density),
    street.group,
    city.group,
    buildSusuki(ctx.density),
    buildBamboo(ctx.density),
  );
  return {
    id: "street",
    opaque,
    fx,
    env,
    shots,
    moonRadius: sky.moonRadius,
    update(t, _dt, camera, heightPx) {
      street.update();
      city.update(t);
      sky.update(camera, heightPx);
    },
  };
}
