import * as THREE from "three";
import { FishStream } from "../common/fishStream";
import { AIRSHIP, PAGODA, STREET_HALF, streetY, TERRACE_Y } from "./layout";

// Rivers of light-fish: a thick school spiralling up around the pagoda and
// away to the airship, a river pouring down the street canyon over the
// lanterns (past the viewer), a ring swimming round the airship, thin
// ribbons high in the sky and fountains rising out of the city.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildFish(density: number, pagodaTop: THREE.Vector3) {
  const k = 0.55 + 0.45 * density;
  const streams: FishStream[] = [];
  const cyan = [0xbff4ff, 0xe8fbff, 0x8fdcff, 0xd6f7ff];
  const air = AIRSHIP.pos;

  // 1 — the spiral round the pagoda, up to the airship and back behind the city
  {
    // rises behind the pagoda, wraps its upper storeys once, crowns the
    // spire, then streams off to the airship and home behind the city
    const path: THREE.Vector3[] = [V(PAGODA.x + 6, TERRACE_Y + 12, PAGODA.z - 26)];
    const turns = 1.2;
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = -2.2 + t * turns * Math.PI * 2;
      const r = 22 + 6 * Math.sin(t * Math.PI);
      path.push(V(PAGODA.x + Math.cos(a) * r, TERRACE_Y + 24 + t * (pagodaTop.y - TERRACE_Y - 6), PAGODA.z + Math.sin(a) * r * 0.8 - 6));
    }
    path.push(V(PAGODA.x + 14, pagodaTop.y + 22, PAGODA.z - 40), V(40, pagodaTop.y + 60, -150), V(air.x - 80, air.y - 20, air.z + 40), V(air.x - 10, air.y - 50, air.z + 30), V(air.x + 70, air.y + 10, air.z - 10));
    path.push(V(air.x + 150, air.y - 40, air.z - 140), V(180, 70, -520), V(60, 20, -300), V(PAGODA.x + 20, TERRACE_Y + 8, PAGODA.z - 60));
    streams.push(new FishStream({ path, closed: true, count: Math.round(3000 * k), radius: 5.5, flatten: 0.6, size: 0.72, speed: 13, colors: cyan, intensity: 1.5, shoals: 0.8, trail: 0.55, minPx: 2.0, seed: 11 }));
  }

  // 2 — the street river: from the temple steps down the canyon over the
  // lanterns, over the viewer, up and back high above the roofs
  {
    const y0 = (z: number) => streetY(z) + 9.5;
    const path = [
      V(1.5, TERRACE_Y + 12, -58),
      V(-1.0, y0(-40), -40),
      V(1.8, y0(-26) - 0.5, -26),
      V(-1.2, y0(-12), -12),
      V(0.5, y0(2) + 1.5, 2),
      V(-2.0, y0(14) + 5, 16),
      V(-8, 40, 26),
      V(-20, 70, -10),
      V(-12, 60, -52),
      V(-4, 30, -70),
    ];
    streams.push(new FishStream({ path, closed: true, count: Math.round(700 * k), radius: STREET_HALF * 0.55, flatten: 0.45, size: 0.62, speed: 7.5, colors: cyan, intensity: 1.35, shoals: 0.85, trail: 0.4, minPx: 2.0, seed: 23 }));
  }

  // 3 — a ring round the airship
  {
    const path: THREE.Vector3[] = [];
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      path.push(V(air.x + Math.cos(a) * 118, air.y + Math.sin(a) * 38 + Math.cos(a) * 30, air.z + Math.sin(a) * 70));
    }
    streams.push(new FishStream({ path, closed: true, count: Math.round(1100 * k), radius: 9, flatten: 0.5, size: 2.4, speed: 16, colors: [0xe8fbff, 0xbff4ff, 0xd8ffb0, 0xfff2c0], intensity: 1.8, shoals: 0.6, trail: 0.7, minPx: 2.0, seed: 37 }));
  }

  // 4 — thin ribbons high in the sky
  for (const [s, y, zc, x0] of [
    [41, 330, -420, -520],
    [53, 430, -300, -300],
  ] as const) {
    const path: THREE.Vector3[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      path.push(V(x0 * 0.2 + Math.cos(a) * 480, y + Math.sin(a * 2) * 60 + Math.cos(a) * 40, zc + Math.sin(a) * 260));
    }
    streams.push(new FishStream({ path, closed: true, count: Math.round(650 * k), radius: 14, flatten: 0.25, size: 3.2, speed: 22, colors: cyan, intensity: 1.2, shoals: 0.9, trail: 0.6, minPx: 1.8, seed: s }));
  }

  // 5 — fountains rising out of the city between the towers
  for (const [s, x, z, h] of [
    [61, -70, -365, 250],
    [67, 100, -385, 210],
    [71, 230, -380, 240],
    [73, -220, -420, 230],
  ] as const) {
    const base = TERRACE_Y;
    const path = [V(x, base + 10, z), V(x + 6, base + h * 0.45, z + 4), V(x - 4, base + h, z - 6), V(x - 40, base + h * 1.1, z - 30), V(x - 70, base + h * 0.7, z - 60), V(x - 60, base + 20, z - 70)];
    streams.push(new FishStream({ path, closed: true, count: Math.round(420 * k), radius: 8, flatten: 0.8, size: 2.2, speed: 18, colors: cyan, intensity: 1.4, shoals: 0.5, trail: 0.8, minPx: 1.8, seed: s }));
  }

  const group = new THREE.Group();
  for (const s of streams) group.add(s.mesh);
  return {
    group,
    update(camera: THREE.PerspectiveCamera, heightPx: number) {
      for (const s of streams) s.update(camera, heightPx);
    },
  };
}
