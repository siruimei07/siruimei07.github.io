import * as THREE from "three";
import type { Pipeline } from "../engine/Pipeline";
import type { Tier } from "../engine/Quality";
import { applyAtmos, G, type AtmosExtra } from "../world/atmos";
import { Clouds, type CloudLayout } from "../world/clouds";
import { Emergence } from "../world/emergence";
import { Fireworks } from "../world/fireworks";
import { FloatingLanterns } from "../world/lanterns";
import type { CloudNoise } from "../world/noiseTextures";
import { Portal } from "../world/portal";
import { Sky } from "../world/sky";
import { SkyLanterns } from "../world/skyLanterns";
import { Splash } from "../world/splash";
import { StarTrails } from "../world/stars";
import { buildToriiGeometry, createToriiMaterial } from "../world/torii";
import { Water } from "../world/water";
import { ParticleWhale } from "../world/whale";

// World A — the endless water with a single great torii. Owns its camera,
// sky/clouds, water reflection and everything floating on or above the lake.

export const DUSK_CLOUDS: CloudLayout = {
  bottom: 0.3,
  top: 10.5,
  coverage: 0.5,
  density: 1.8,
  weatherScale: 42,
  ringInner: 9,
  ringOuter: 110,
  anchors: [
    { az: -27, dist: 23, radius: 8.5, strength: 0.95, type: 1 },
    { az: -56, dist: 21, radius: 8, strength: 0.85, type: 0.9 },
    { az: -8, dist: 33, radius: 8, strength: 0.66, type: 0.9 },
    { az: 9, dist: 36, radius: 9, strength: 0.7, type: 0.9 },
    { az: 27, dist: 26, radius: 8.5, strength: 0.88, type: 0.95 },
    { az: 55, dist: 22, radius: 8, strength: 0.9, type: 0.9 },
  ],
};

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Pose = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number };

export function pose(px: number, py: number, pz: number, tx: number, ty: number, tz: number, fov = 38, roll = 0): Pose {
  return { pos: new THREE.Vector3(px, py, pz), target: new THREE.Vector3(tx, ty, tz), fov, roll };
}

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose) {
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.target.lerpVectors(a.target, b.target, t);
  out.fov = THREE.MathUtils.lerp(a.fov, b.fov, t);
  out.roll = THREE.MathUtils.lerp(a.roll, b.roll, t);
  return out;
}

export class WaterWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.25, 30000);
  readonly sky = new Sky();
  readonly clouds: Clouds;
  readonly water = new Water();
  readonly torii: THREE.Mesh;
  readonly toriiMaterial: THREE.ShaderMaterial;
  readonly lanterns: FloatingLanterns;
  readonly stars: StarTrails;
  readonly whale: ParticleWhale;
  readonly skyLanterns: SkyLanterns;
  readonly splash: Splash;
  readonly emergence = new Emergence();
  readonly fireworks = new Fireworks();
  /** The light-water membrane in the torii opening (the passage). */
  readonly portal = new Portal(11.4, 12.35);
  readonly atmos: AtmosExtra = { exposure: 1 };
  tod = 0;
  /** Cloud wind speed multiplier (time-lapse during nightfall). */
  windSpeed = 1;
  lanternRate = 0;
  private cloudTime = 0;

  constructor(noise: CloudNoise, particleScale = 1) {
    this.clouds = new Clouds(noise, DUSK_CLOUDS);
    this.toriiMaterial = createToriiMaterial();
    this.torii = new THREE.Mesh(buildToriiGeometry(), this.toriiMaterial);
    this.scene.add(this.torii);
    this.scene.add(this.water.mesh);
    const rng = mulberry32(7);
    this.lanterns = new FloatingLanterns(
      {
        center: new THREE.Vector2(0, -40),
        half: new THREE.Vector2(170, 170),
        count: Math.round(3200 * Math.max(0.5, particleScale)),
        exclude: (x, z) => Math.abs(z) < 2.5 && Math.abs(Math.abs(x) - 6.0) < 1.6,
      },
      Math.round(26000 * Math.max(0.4, particleScale)),
      rng,
      this.water.material.uniforms.uDrops as { value: THREE.Vector4[] },
    );
    this.scene.add(this.lanterns.near, this.lanterns.far);
    this.stars = new StarTrails(7000, mulberry32(21));
    this.scene.add(this.stars.mesh);
    this.whale = new ParticleWhale(mulberry32(5), particleScale, 88);
    this.scene.add(this.whale.mesh);
    this.skyLanterns = new SkyLanterns(Math.round(260 * Math.max(0.5, particleScale)), mulberry32(11), { cx: 20, cz: -120, rx: 260, rz: 200, minDist: 30 });
    this.scene.add(this.skyLanterns.mesh);
    this.splash = new Splash(Math.round(700 * Math.max(0.5, particleScale)), mulberry32(3));
    this.scene.add(this.splash.mesh);
    this.scene.add(this.fireworks.mesh);
    this.portal.mesh.position.set(0, 0, 0.02);
    this.scene.add(this.portal.mesh);
    this.setPose(pose(0, 1.2, 46, 0, 5.2, 0));
  }

  /** A click: ripples + a rising sky lantern on the water, fireworks in the sky. */
  click(ndc: THREE.Vector2, now: number) {
    const cam = this.camera;
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    if (dir.y < -0.004) {
      const t = -cam.position.y / dir.y;
      if (t < 600) {
        const p = cam.position.clone().addScaledVector(dir, t);
        this.water.addDrop(p.x, p.z, 0.22, now);
        this.skyLanterns.release(p.x, p.z);
        return;
      }
    }
    // Break the shell where the click points, a few hundred metres out.
    const d = new THREE.Vector3(dir.x, Math.max(dir.y, 0.08), dir.z).normalize();
    const at = cam.position.clone().addScaledVector(d, 330);
    at.y = Math.max(at.y, 70);
    this.fireworks.launch(at, now, 70 + Math.random() * 40, 24 + Math.random() * 10);
  }

  /** The camera broke the surface at time `at`: ripples + churned foam. */
  surface(at: number) {
    const c = this.camera.position;
    this.water.setDrop(0, c.x, c.z - 2.0, 0.55, at);
    this.water.setDrop(1, c.x + 1.5, c.z - 4.0, 0.3, at + 0.08);
    (this.water.material.uniforms.uFoam.value as THREE.Vector4).set(c.x, c.z - 2.2, at, 1);
  }

  setPose(p: Pose) {
    const cam = this.camera;
    cam.position.copy(p.pos);
    cam.up.set(Math.sin(p.roll), Math.cos(p.roll), 0);
    cam.lookAt(p.target);
    if (cam.fov !== p.fov) {
      cam.fov = p.fov;
      cam.updateProjectionMatrix();
    }
  }

  resize(pl: Pipeline, tier: Tier) {
    this.camera.aspect = pl.width / pl.height;
    this.camera.updateProjectionMatrix();
    this.clouds.resize(pl.width, pl.height, tier);
    this.water.resize(pl.width, pl.height, tier.reflScale);
  }

  update(dt: number) {
    applyAtmos(this.tod, this.atmos);
    // Lanterns read brighter as the sky darkens.
    this.lanterns.update(dt, THREE.MathUtils.lerp(1.9, 2.1, this.tod));
    this.toriiMaterial.uniforms.uLanternLight.value = THREE.MathUtils.lerp(0.05, 0.22, this.tod);
    // Clouds drift; faster during the time-lapse.
    this.cloudTime += dt * this.windSpeed;
    this.clouds.wind.set(this.cloudTime * 0.035, this.cloudTime * 0.012);
    this.clouds.shapeWind.set(this.cloudTime * 0.0016, this.cloudTime * 0.0009, this.cloudTime * 0.0011);
    this.whale.update(dt);
    this.skyLanterns.update(dt, this.lanternRate);
    this.splash.update();
    this.fireworks.update(G.uTime.value);
    this.portal.update();
  }

  render(pl: Pipeline, time: number) {
    const r = pl.renderer;
    const cam = this.camera;
    cam.updateMatrixWorld();
    G.uCamPos.value.copy(cam.position);
    G.uRes.value.set(pl.width, pl.height);
    this.splash.anchor.set(cam.position.x, 0, cam.position.z);

    pl.timer.begin("clouds");
    this.clouds.update(r, cam);
    pl.timer.end();

    // Planar reflection.
    pl.timer.begin("reflection");
    this.water.updateReflection(cam);
    const rt = this.water.reflTarget;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    this.sky.render(r, rt, this.water.reflSkyCamera, null, this.clouds.pano.texture, true);
    this.water.mesh.visible = false;
    this.lanterns.far.visible = false;
    const splashVisible = this.splash.mesh.visible;
    this.splash.mesh.visible = false;
    G.uCamPos.value.copy(this.water.reflCamera.position);
    G.uRes.value.set(rt.width, rt.height);
    this.stars.prepare(this.water.reflCamera, null, true, rt.height / 1080);
    r.render(this.scene, this.water.reflCamera);
    G.uCamPos.value.copy(cam.position);
    G.uRes.value.set(pl.width, pl.height);
    this.water.mesh.visible = true;
    this.lanterns.far.visible = true;
    this.splash.mesh.visible = splashVisible;
    pl.timer.end();

    pl.timer.begin("scene");
    r.setRenderTarget(pl.scene);
    r.clear(true, true, false);
    this.sky.render(r, pl.scene, cam, this.clouds.texture, null, false);
    this.stars.prepare(cam, this.clouds.texture, false, pl.height / 1080);
    r.render(this.scene, cam);
    pl.timer.end();
    pl.current = pl.scene;

    if (this.emergence.active) {
      pl.timer.begin("emergence");
      const dst = pl.nextFx();
      this.emergence.render(r, pl.current.texture, dst, time);
      pl.current = dst;
      pl.timer.end();
    }
  }
}
