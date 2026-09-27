import * as THREE from "three";
import { Pipeline } from "../engine/Pipeline";
import { Quality, TIERS, type TierName } from "../engine/Quality";
import { env } from "../engine/toon";
import { Hero, heroMenuPose } from "../fx/hero";
import type { SceneId, Shot } from "../scenes/common/types";
import { SCENE_IDS, Scenes, type ShotName } from "../scenes/host";

// Authoring view of one scene, no UI:
//   ?scene=pagoda&shot=screen&grade=color
//   grade: color (content screens) | sea (menu, P3R blue) | title (duotone)
//   cam=x,y,z,yaw,pitch,fov[,roll] overrides the shot; t=12.5 freezes the clock
//   guides=1 outlines where the UI sits for the shot; hero=1 shows Yachiyo's band (menu)
// window.__view: { ready, shot(name), cam(shot), grade(name), time(t|null), gpu(), passes() }

export async function startViewer(canvas: HTMLCanvasElement) {
  const q = new URLSearchParams(location.search);
  const id = q.get("scene") as SceneId;
  if (!SCENE_IDS.includes(id)) throw new Error(`unknown scene ${id}; one of ${SCENE_IDS.join(", ")}`);
  document.querySelector("[data-boot]")?.remove();
  document.querySelector("[data-hud]")?.remove();
  const tierName = (q.get("q") as TierName) ?? "ultra";
  const tier = TIERS.some((t) => t.name === tierName) ? tierName : "ultra";
  const quality = new Quality(tier, tier);
  const pl = new Pipeline(canvas, quality.current);
  const resize = () => pl.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
  resize();
  addEventListener("resize", resize);
  const scenes = new Scenes({ density: quality.current.particles }, pl);
  const host = await scenes.load(id);
  let shot = (q.get("shot") as ShotName) ?? "screen";
  host.snap(shot);
  const cam = q.get("cam");
  if (cam) {
    const v = cam.split(",").map(Number);
    host.rig.snap({ pos: [v[0], v[1], v[2]], yaw: v[3], pitch: v[4], fov: v[5] ?? 40, roll: v[6] ?? 0 });
  }
  const fixedT = q.get("t");
  let frozen: number | null = fixedT !== null ? Number(fixedT) : null;
  const hero = new Hero(true);
  let showHero = q.get("hero") === "1";
  if (showHero) {
    await hero.load();
    pl.heroTexture = hero.texture;
  }

  const grade = (g: string) => {
    const p = pl.post;
    p.mono = g === "title" ? 0.3 : 0;
    p.water = g === "sea" ? 1 : 0;
    p.flood = g === "sea" ? 1 : 0;
    p.calm = g === "sea" ? 0.42 : 0;
  };
  grade(q.get("grade") ?? (shot === "menu" ? "sea" : shot === "title" ? "title" : "color"));

  if (q.get("guides") === "1") guides(shot);

  const pointer = new THREE.Vector2();
  let t = frozen ?? 0;
  let last = performance.now();
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t = frozen ?? t + dt;
    env.uTime.value = t;
    pl.time = t;
    host.update(frozen !== null ? 0 : dt, t, pointer, pl.width / pl.height, pl.height);
    if (showHero && pl.heroTexture) {
      Hero.place(heroMenuPose(innerWidth, innerHeight), pl.width / innerWidth, pl.height, pl.post.heroInv, pl.post.heroBorder);
      pl.post.hero = 1;
      pl.post.heroShadow.set(14 * (pl.width / innerWidth), -14 * (pl.width / innerWidth));
    }
    pl.render(host.frame());
  };
  loop();

  const api = {
    ready: true,
    shot(name: ShotName) {
      shot = name;
      host.snap(name);
    },
    cam(s: Shot) {
      host.rig.snap(s);
    },
    grade,
    time(v: number | null) {
      frozen = v;
    },
    async hero(on: boolean) {
      showHero = on;
      if (on && !pl.heroTexture) {
        await hero.load();
        pl.heroTexture = hero.texture;
      }
      pl.post.hero = on ? 1 : 0;
    },
    gpu: () => pl.timer.total,
    passes: () => Object.fromEntries(pl.timer.times),
    size: () => [pl.width, pl.height],
  };
  Object.assign(window, { __view: api });
}

/** Rough boxes where the UI covers the scene for a shot. */
function guides(shot: ShotName) {
  const box = (l: number, t: number, w: number, h: number, label: string) => {
    const d = document.createElement("div");
    d.textContent = label;
    Object.assign(d.style, {
      position: "fixed",
      left: `${l}vw`,
      top: `${t}vh`,
      width: `${w}vw`,
      height: `${h}vh`,
      border: "2px dashed rgba(255,80,120,0.9)",
      color: "rgba(255,200,220,0.95)",
      font: "700 14px sans-serif",
      padding: "4px",
      zIndex: "50",
      pointerEvents: "none",
      boxSizing: "border-box",
    });
    document.body.appendChild(d);
  };
  if (shot === "menu") {
    box(0, 0, 40, 100, "Yachiyo film band");
    box(42, 14, 40, 64, "menu words");
    box(60, 82, 38, 16, "status / description");
  } else if (shot === "screen") {
    box(3, 16, 52, 78, "content panels");
    box(57, 0, 43, 100, "scene hero lives here");
  } else {
    box(3, 12, 50, 70, "title type");
  }
}
