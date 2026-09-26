import * as THREE from "three";
import { createAvatar } from "./avatar.ts";
import { Fireworks } from "./fireworks.ts";
import { globals } from "./globals.ts";
import { createKoi } from "./koi.ts";
import { createLanternField, createLanterns, createSkillLanterns, createWishLantern } from "./lanterns.ts";
import { createMotes, PALETTE, Sparks } from "./particles.ts";
import { createScenery } from "./scenery.ts";
import { createTorii, GATE_OPENING, GATE_Z } from "./torii.ts";
import { createWhales } from "./whales.ts";
import type { FrameContext, World } from "./World.ts";

export type Target = "avatar" | "moon" | "sky" | "water";

export type SceneHooks = {
  onBurst?: (strength: number) => void;
  onLaunch?: () => void;
  onGate?: (entering: boolean) => void;
};

// Builds every part of Tsukuyomi into the world and exposes the interactions
// the DOM layer needs.
export function buildScene(world: World, avatarTexture: THREE.Texture, skillChars: string[], hooks: SceneHooks = {}) {
  const sparks = new Sparks();
  const fireworks = new Fireworks();
  const avatar = createAvatar(avatarTexture);
  const torii = createTorii();
  const skillLanterns = createSkillLanterns(skillChars);
  const wish = createWishLantern((p) => {
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, -0.6 - Math.random(), (Math.random() - 0.5) * 1.2);
    sparks.emit(p, v, PALETTE[1], 3, 0.16, 1.4, -1.5, 0.8);
  });

  world.add(torii);
  world.add(createScenery());
  world.add(createLanterns());
  world.add(createLanternField());
  world.add(skillLanterns);
  world.add(createKoi());
  world.add(createWhales());
  world.add(avatar);
  world.add(createMotes());
  world.add(fireworks);
  world.add(wish);
  world.add(sparks);

  fireworks.onBurst = (_p, k) => hooks.onBurst?.(k);
  fireworks.onLaunch = () => hooks.onLaunch?.();

  let shockIdx = 0;
  const shock = (p: THREE.Vector3) => {
    globals.uShocks.value[shockIdx].set(p.x, p.y, p.z, globals.uTime.value);
    shockIdx = (shockIdx + 1) % globals.uShocks.value.length;
  };

  // Passing through the gate: the veil shimmers, the water around the
  // pillars ripples and a few golden motes scatter.
  let lastSide = 1;
  const gateCenter = new THREE.Vector3(0, 5.5, GATE_Z);
  world.add({
    object: new THREE.Object3D(),
    update(ctx: FrameContext) {
      const z = ctx.camera.position.z - GATE_Z;
      const side = z >= 0 ? 1 : -1;
      const inside = Math.abs(ctx.camera.position.x) < GATE_OPENING.halfWidth + 2;
      if (side !== lastSide && inside && world.introDone) {
        torii.pass();
        for (const x of [-7.6, 7.6]) world.water.addRipple(x, GATE_Z, 0.8);
        sparks.burst(gateCenter, 70, 5, [PALETTE[0], PALETTE[1], PALETTE[3]], 2.5, 0.14);
        hooks.onGate?.(side < 0);
      }
      lastSide = side;
    },
  });

  // Cursor light trail: a few sparks where the pointer ray sits 14 units in
  // front of the camera, proportional to how far the pointer moved.
  const lastNdc = new THREE.Vector2(9, 9);
  const trailPoint = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let trailCarry = 0;
  world.add({
    object: new THREE.Object3D(),
    update(ctx: FrameContext) {
      if (!ctx.pointerActive) {
        lastNdc.set(9, 9);
        return;
      }
      if (lastNdc.x === 9) lastNdc.copy(ctx.pointer);
      const moved = lastNdc.distanceTo(ctx.pointer);
      lastNdc.copy(ctx.pointer);
      trailCarry += Math.min(moved * 30, 4);
      const r = world.ray();
      while (trailCarry >= 1) {
        trailCarry -= 1;
        trailPoint.copy(r.origin).addScaledVector(r.direction, 14);
        tmp.set((Math.random() - 0.5) * 0.4, (Math.random() - 0.2) * 0.4, (Math.random() - 0.5) * 0.4);
        sparks.emit(trailPoint, tmp, PALETTE[Math.random() < 0.6 ? 0 : 1], 1.4 + Math.random(), 0.06 + Math.random() * 0.04, 0.8 + Math.random() * 0.5, -0.2, 1.5);
      }
    },
  });

  const hover = (ndc: THREE.Vector2): Target => {
    const ray = world.ray(ndc);
    if (avatar.object.visible && avatar.hitTest(ray)) return "avatar";
    if (world.isMoonAt(ndc)) return "moon";
    return ray.direction.y > 0 ? "sky" : "water";
  };

  return {
    avatar,
    hover(ndc: THREE.Vector2): Target {
      const t = hover(ndc);
      avatar.setHover(t === "avatar");
      return t;
    },
    click(ndc: THREE.Vector2): Target {
      const t = hover(ndc);
      const ray = world.ray(ndc);
      if (t === "avatar") {
        avatar.poke();
        sparks.burst(avatar.worldCenter, 60, 6, [PALETTE[0], PALETTE[1]], 2.5, 0.16);
        shock(avatar.worldCenter);
      } else if (t === "moon") {
        world.moonPulse = 1;
        const target = world.camera.position.clone().addScaledVector(ray.direction, 320);
        target.y = Math.max(target.y, 90);
        fireworks.launch(target, world.camera, 0);
      } else if (t === "sky") {
        const dist = 170 + Math.random() * 60;
        const target = world.camera.position.clone().addScaledVector(ray.direction, dist);
        target.y = THREE.MathUtils.clamp(target.y, 45, 190);
        fireworks.launch(target, world.camera);
      } else {
        const p = world.waterPoint(ndc);
        if (p) {
          world.water.addRipple(p.x, p.z, 1);
          shock(p);
          const up = new THREE.Vector3();
          for (let i = 0; i < 24; i++) {
            up.set((Math.random() - 0.5) * 3, 3 + Math.random() * 4, (Math.random() - 0.5) * 3);
            sparks.emit(p, up, PALETTE[i % 2 ? 0 : 2], 2, 0.1, 1 + Math.random() * 0.6, -9.8, 0.6);
          }
        }
      }
      return t;
    },
    setSkill(index: number) {
      skillLanterns.setActive(index);
    },
    // Right after the flash: surfacing through the water in front of the
    // gate — droplets falling back, rings spreading over the mirror.
    arrive() {
      const cam = world.camera.position;
      const drop = new THREE.Vector3();
      const v = new THREE.Vector3();
      for (let i = 0; i < 160; i++) {
        drop.set(cam.x + (Math.random() - 0.5) * 14, 1 + Math.random() * 9, cam.z - 3 - Math.random() * 16);
        v.set((Math.random() - 0.5) * 1.5, Math.random() * 2, (Math.random() - 0.5) * 1.5);
        sparks.emit(drop, v, PALETTE[i % 3 === 0 ? 2 : 4], 1.6 + Math.random() * 1.5, 0.05 + Math.random() * 0.06, 1.2 + Math.random() * 1.2, -9.8, 0.3);
      }
      for (let i = 0; i < 5; i++) world.water.addRipple(cam.x + (Math.random() - 0.5) * 16, cam.z - 4 - Math.random() * 14, 0.9);
      for (const x of [-7.6, 7.6]) world.water.addRipple(x, GATE_Z, 0.7);
    },
    launchWish() {
      const cam = world.camera;
      const fwd = cam.getWorldDirection(new THREE.Vector3());
      fwd.y = 0;
      fwd.normalize();
      const from = cam.position.clone().addScaledVector(fwd, 16);
      from.y = 0.6;
      wish.launch(from);
      world.water.addRipple(from.x, from.z, 1.2);
      shock(from);
      sparks.burst(from, 50, 5, [PALETTE[1], PALETTE[3]], 3, 0.16);
    },
  };
}

export type SceneApi = ReturnType<typeof buildScene>;
