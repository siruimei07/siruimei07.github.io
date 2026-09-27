import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { dirFromAzEl, makeEnv } from "./env";
import { Sky } from "./sky";
import type { SceneId, StageScene } from "./types";

// A stand-in scene (ground, a few blocks, the moon) used until a scene's
// real model exists.

export function placeholder(id: SceneId, tint: THREE.ColorRepresentation): StageScene {
  const opaque = new THREE.Scene();
  const sky = new Sky({ moonRadius: 4 });
  opaque.add(sky.mesh);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), toonMaterial({ color: 0x2a3a6a, ink: 1 }));
  opaque.add(ground);
  const mat = toonMaterial({ color: tint, ink: 2, rim: 1 });
  for (let i = 0; i < 9; i++) {
    const h = 4 + ((i * 7) % 11);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, h, 4), mat);
    b.position.set(-24 + i * 6, h / 2, -40 - (i % 3) * 8);
    opaque.add(b);
  }
  return {
    id,
    opaque,
    fx: new THREE.Scene(),
    env: makeEnv({ moonDir: dirFromAzEl(8, 14) }),
    shots: {
      menu: { pos: [0, 3, 10], yaw: 6, pitch: 6, fov: 45 },
      screen: { pos: [2, 2.5, 4], yaw: 10, pitch: 8, fov: 42 },
      title: { pos: [0, 3, 12], yaw: 4, pitch: 6, fov: 40 },
    },
    moonRadius: sky.moonRadius,
    update(_t, _dt, camera, heightPx) {
      sky.update(camera, heightPx);
    },
  };
}
