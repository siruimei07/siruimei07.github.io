import * as THREE from "three";
import { FishStream } from "../common/fishStream";
import type { Shot } from "../common/types";
import { HALL, moonDir, PLAZA, shots } from "./layout";
import { SparkFish } from "./sparkfish";

// Rivers of light-fish through the district: a great S-shaped river that
// sweeps through the right of the frame and coils past the lantern tower,
// one down the length of the avenue, a loop over the precinct, coils round
// the lantern pavilions, a school of big ones gliding close by, far rivers
// winding through the haze, and a stream climbing to the moon. Three great
// sparkler fish swim above it all.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const PALE = [0xfff4f8, 0xffd8ea, 0xe6f6ff, 0xffe8cc];
const PINK = [0xffe0ee, 0xffc4dc, 0xfff6fa, 0xffd6c8];
const CYAN = [0xdff8ff, 0xbff0ff, 0xf4fdff, 0xffe6f4];

export type FishSet = { streams: FishStream[]; big: SparkFish[] };

/** World points from (frame x, frame y, distance along the view ray) for a shot — to draw a river where the frame wants it. */
function fromShot(s: Shot, pts: [number, number, number][]): THREE.Vector3[] {
  const cam = new THREE.PerspectiveCamera(s.fov, 16 / 9, 0.3, 40000);
  cam.position.set(...s.pos);
  const yaw = THREE.MathUtils.degToRad(s.yaw);
  const pitch = THREE.MathUtils.degToRad(s.pitch);
  cam.lookAt(cam.position.clone().add(V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))));
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return pts.map(([x, y, d]) => {
    const ray = V(x * 2 - 1, 1 - y * 2, 0.5).unproject(cam).sub(cam.position).normalize();
    return cam.position.clone().addScaledVector(ray, d);
  });
}

export function buildFish(fx: THREE.Scene, heroes: { role: string; top: THREE.Vector3; w: number }[], density: number): FishSet {
  const streams: FishStream[] = [];
  const big: SparkFish[] = [];
  const add = (s: FishStream) => {
    streams.push(s);
    fx.add(s.mesh);
  };
  const n = (c: number) => Math.round(c * density);

  // 1 · the great S-river through the right of the screen shot: in front of the lantern tower low, behind it high
  const sRiver = fromShot(shots.screen, [
        [0.36, 1.12, 150],
        [0.56, 0.9, 220],
        [0.74, 0.77, 285],
        [0.93, 0.64, 345],
        [1.02, 0.46, 420],
        [0.86, 0.31, 510],
        [0.67, 0.25, 590],
        [0.55, 0.15, 700],
        [0.62, 0.04, 880],
        [0.78, -0.08, 1100],
      ]);
  add(
    new FishStream({
      path: sRiver,
      closed: false,
      count: n(4200),
      radius: 5,
      flatten: 0.7,
      size: 1.15,
      speed: 12,
      colors: PALE,
      intensity: 2.1,
      shoals: 0.8,
      trail: 0.18,
      minPx: 1.8,
      seed: 7,
    }),
  );

  // … and a looser halo of stragglers around it, so the river has body
  add(new FishStream({ path: sRiver, closed: false, count: n(1800), radius: 16, flatten: 0.6, size: 0.9, speed: 10, colors: PINK, intensity: 1.3, shoals: 0.5, trail: 0.15, minPx: 1.5, seed: 8 }));

  // 2 · a school of big fish gliding close through the lower right
  add(
    new FishStream({
      path: fromShot(shots.screen, [
        [0.42, 1.15, 120],
        [0.6, 0.97, 140],
        [0.8, 0.86, 160],
        [0.98, 0.8, 180],
        [1.2, 0.72, 210],
      ]),
      closed: false,
      count: n(150),
      radius: 9,
      flatten: 0.6,
      size: 2.4,
      speed: 9,
      colors: PALE,
      intensity: 1.2,
      shoals: 0.9,
      trail: 0.4,
      minPx: 2.5,
      seed: 41,
    }),
  );

  // 3 · the avenue river, from behind the camera to the far haze, weaving over the rows
  {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const z = 520 - i * 150;
      pts.push(V(Math.sin(i * 0.9) * 14 + (i < 5 ? 8 : 0), 36 + Math.sin(i * 0.7 + 1.0) * 12 + i * 4, z));
    }
    add(new FishStream({ path: pts, closed: false, count: n(3600), radius: 7, flatten: 0.55, size: 1.2, speed: 12, colors: PALE, intensity: 1.7, shoals: 0.8, trail: 0.18, minPx: 1.8, seed: 11 }));
    // a thinner, higher school above the west side
    const hi = pts.map((p, i) => V(-70 + Math.cos(i * 0.8) * 30, p.y + 55 + Math.sin(i * 1.3) * 18, p.z + 40));
    add(new FishStream({ path: hi, closed: false, count: n(1800), radius: 8, flatten: 0.6, size: 1.4, speed: 14, colors: PINK, intensity: 1.4, shoals: 0.8, trail: 0.18, minPx: 1.6, seed: 12 }));
  }

  // 4 · a tilted, wobbling loop over plaza, hall and pagoda
  {
    const c = V((PLAZA.x0 + HALL.x) / 2 + 20, 0, (PLAZA.z0 + PLAZA.z1) / 2);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pts.push(V(c.x + Math.cos(a) * 125, 48 + Math.sin(a * 2.0) * 16 + Math.cos(a) * 14, c.z + Math.sin(a) * 150));
    }
    add(new FishStream({ path: pts, count: n(2200), radius: 6, flatten: 0.6, size: 1.1, speed: 10, colors: PALE, intensity: 1.8, shoals: 0.75, trail: 0.2, minPx: 1.8, seed: 21 }));
  }

  // 5 · coils around the lantern pavilions
  for (const h of heroes) {
    if (!h.role.startsWith("lantern")) continue;
    const pts: THREE.Vector3[] = [];
    const R = h.w * 0.85 + 10;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 4; // two turns
      const y = h.top.y - 60 + (i / 16) * 75 + Math.sin(a * 0.5) * 8;
      pts.push(V(h.top.x + Math.cos(a) * R * (1 + 0.15 * Math.sin(a * 1.5)), y, h.top.z + Math.sin(a) * R));
    }
    add(new FishStream({ path: pts, count: n(h.role === "lantern" ? 1600 : 900), radius: 4.5, flatten: 0.7, size: 1.0, speed: 9, colors: PINK, intensity: 2.4, shoals: 0.7, trail: 0.2, minPx: 1.8, seed: 31 + (h.role === "lantern" ? 0 : 1) }));
  }

  // 6 · far rivers winding through the haze
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const x = -700 + t * 1900 + Math.sin(t * 9 + k) * 120;
      const z = -700 - k * 520 - Math.sin(t * 5.5 + k * 2) * 220;
      pts.push(V(x, 110 + k * 45 + Math.sin(t * 7 + k) * 40, z));
    }
    add(new FishStream({ path: pts, closed: false, count: n(1700), radius: 16, flatten: 0.45, size: 3.0, speed: 18, colors: k === 1 ? CYAN : PALE, intensity: 1.6, shoals: 0.8, trail: 0.25, minPx: 1.4, seed: 51 + k }));
  }

  // 7 · a stream climbing toward the moon
  {
    const flat = V(moonDir.x, 0, moonDir.z).normalize();
    const start = V(150, 90, -300);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(start.clone().addScaledVector(flat, t * 3600).add(V(Math.sin(t * 8) * 90, t * t * 1300 + Math.sin(t * 5) * 40, 0)));
    }
    add(new FishStream({ path: pts, closed: false, count: n(4200), radius: 18, flatten: 0.45, size: 4.6, speed: 22, colors: CYAN, intensity: 3.2, shoals: 0.7, trail: 0.3, minPx: 1.6, seed: 61 }));
  }

  // ---- sparkler fish
  const addBig = (f: SparkFish) => {
    big.push(f);
    fx.add(f.mesh);
  };
  {
    // over the precinct, a big slow loop
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      pts.push(V(150 + Math.cos(a) * 230, 118 + Math.sin(a * 2) * 26, -70 + Math.sin(a) * 190));
    }
    addBig(new SparkFish({ path: pts, length: 74, speed: 13, color: 0xfff1dc, accent: 0xffc2de, intensity: 5.5, point: 0.55, phase: 0.62, seed: 3, density }));
  }
  {
    // along the far avenue
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      pts.push(V(Math.cos(a) * 170 - 20, 170 + Math.sin(a * 2) * 30, -760 + Math.sin(a) * 420));
    }
    addBig(new SparkFish({ path: pts, length: 60, speed: 15, color: 0xfff6ec, accent: 0xbfefff, intensity: 5, point: 0.6, phase: 0.1, seed: 4, density }));
  }
  {
    const h = heroes.find((x) => x.role === "lantern");
    if (h) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        pts.push(V(h.top.x + Math.cos(a) * 95, h.top.y + 20 + Math.sin(a * 2) * 14, h.top.z + Math.sin(a) * 80));
      }
      addBig(new SparkFish({ path: pts, length: 38, speed: 11, color: 0xffe9f2, accent: 0xffd29a, intensity: 5.5, point: 0.42, phase: 0.35, seed: 5, density }));
    }
  }
  return { streams, big };
}
