import * as THREE from "three";
import type { Pipeline } from "../engine/Pipeline";
import type { Tier } from "../engine/Quality";
import { applyAtmos, G, type AtmosExtra } from "../world/atmos";
import { CityBuildings } from "../world/city/buildings";
import { LightFish } from "../world/city/fish";
import { BRIDGE, flyCurve, FLY_POINTS, GATE_Z, LANDMARKS, placeBuildings, placeSakura, PLATFORM, SHORE_Z } from "../world/city/layout";
import { CityLights } from "../world/city/lights";
import { Sakura } from "../world/city/sakura";
import { createPlaque, GreatLanterns } from "../world/city/signs";
import { bridgeY, buildStructures, GATE_SCALE, structuresMaterial } from "../world/city/structures";
import { createTerrain } from "../world/city/terrain";
import { Clouds, type CloudLayout } from "../world/clouds";
import { Fireworks } from "../world/fireworks";
import { FloatingLanterns } from "../world/lanterns";
import type { CloudNoise } from "../world/noiseTextures";
import { Portal } from "../world/portal";
import { Sky } from "../world/sky";
import { SkyLanterns } from "../world/skyLanterns";
import { StarTrails } from "../world/stars";
import { buildToriiGeometry, createToriiMaterial } from "../world/torii";
import { Water } from "../world/water";
import { ParticleWhale } from "../world/whale";
import { mulberry32, pose, type Pose, type WaterWorld } from "./WaterWorld";


// World B — 月読の都. The great gate on its platform, the lantern bridge,
// and the hillside city under a small bright moon. Chapters are camera
// stations; the last one is a low flight through the streets that loops.

const CITY_CLOUDS: CloudLayout = {
  bottom: 1.4,
  top: 5.2,
  coverage: 0.42,
  density: 1.2,
  weatherScale: 48,
  ringInner: 16,
  ringOuter: 120,
  anchors: [
    { az: -40, dist: 42, radius: 9, strength: 0.7, type: 0.7 },
    { az: 38, dist: 46, radius: 9, strength: 0.65, type: 0.7 },
    { az: -95, dist: 30, radius: 8, strength: 0.8, type: 0.8 },
    { az: 100, dist: 32, radius: 8, strength: 0.8, type: 0.8 },
  ],
};

const MOON_DIR = new THREE.Vector3(0.05, Math.sin(THREE.MathUtils.degToRad(23)), -1).normalize();

// Camera stations (World B coordinates).
// Arrival (进入鸟居.mov, 12–15 s): out of the portal we look back at it, pull
// away until the whole great gate stands revealed, then turn to the city.
const P_ARRIVE_0 = pose(0, 15, 4, 0, 17, 40, 62);
const P_ARRIVE_1 = pose(0, 9.5, -36, 0, 24, 12, 50);
const STATIONS: Pose[] = [
  pose(0, 0, 0, 0, 0, 0), // (cover lives in World A)
  pose(6, 12, -44, -150, 70, -590, 44), // 档案: the hill city on the right
  pose(-2.5, 9.5, -110, -20, 16, -330, 46), // 擅长: great lanterns over the bridge
  pose(-14, 17, -290, -14, 40, -600, 48), // 作品: the pagoda above the shore
];

type Move = { curve: THREE.CatmullRomCurve3; from: Pose; to: Pose; t0: number; dur: number };

export class CityWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.3, 40000);
  readonly sky = new Sky();
  readonly clouds: Clouds;
  readonly water = new Water();
  readonly atmos: AtmosExtra = { exposure: 1.3 };
  readonly fireworks = new Fireworks();
  readonly portal: Portal;
  readonly stars: StarTrails;
  readonly whale: ParticleWhale;
  readonly skyLanterns: SkyLanterns;
  readonly floating: FloatingLanterns;
  readonly buildings: CityBuildings;
  readonly sakura: Sakura;
  readonly fish: LightFish;
  readonly great: GreatLanterns;
  private structMat: THREE.ShaderMaterial;
  private lamps: THREE.Vector3[];
  private move: Move | null = null;
  private pose: Pose = pose(0, 0, 0, 0, 0, 0);
  private rest: Pose = pose(0, 0, 0, 0, 0, 0);
  private flying = false;
  private flyU = 0;
  private flySpeed = 11; // m/s
  private chapter = 1;
  private parallax = new THREE.Vector2();
  settled = false;

  constructor(noise: CloudNoise, particleScale: number, private worldA: WaterWorld) {
    this.clouds = new Clouds(noise, CITY_CLOUDS);
    this.sky.material.uniforms.uMoonRadius.value = 0.011;
    this.sky.material.uniforms.uCirrus.value = 0.5;
    const density = Math.max(0.45, particleScale);

    // Terrain + city.
    const list = placeBuildings(density);
    this.buildings = new CityBuildings(list);
    this.scene.add(createTerrain(list), this.buildings.bodies, this.buildings.roofs, this.buildings.spire);
    this.scene.add(new CityLights(list, density).mesh);
    this.sakura = new Sakura(placeSakura(Math.round(150 * density)), Math.round(1400 * density));
    this.scene.add(this.sakura.canopies, this.sakura.trunks, this.sakura.petals);

    // Platform, bridge, lanterns, teal strips.
    const st = buildStructures();
    this.structMat = structuresMaterial();
    this.scene.add(new THREE.Mesh(st.geometry, this.structMat));
    this.lamps = st.lamps.map((l) => l.pos);

    // The great gate.
    const gate = new THREE.Mesh(buildToriiGeometry(), createToriiMaterial());
    gate.scale.setScalar(GATE_SCALE);
    gate.position.set(0, PLATFORM.y, GATE_Z);
    gate.rotation.y = Math.PI;
    (gate.material as THREE.ShaderMaterial).uniforms.uWet.value = 0;
    (gate.material as THREE.ShaderMaterial).uniforms.uPortal.value = 0.25;
    this.scene.add(gate);
    const plaque = createPlaque(3.4, 6.2);
    plaque.position.set(0, PLATFORM.y + 14.6 * GATE_SCALE, GATE_Z - 0.8 * GATE_SCALE);
    this.scene.add(plaque);
    this.portal = new Portal(10.6 * GATE_SCALE, (12.35 - 0.575) * GATE_SCALE);
    this.portal.mesh.position.set(0, PLATFORM.y, GATE_Z);
    this.portal.intensity = 0.55;
    this.scene.add(this.portal.mesh);

    // Skills: great lanterns hanging over the bridge.
    const lz = -168;
    this.great = new GreatLanterns([
      { id: "stats", char: "統", pos: new THREE.Vector3(5, bridgeY(lz) + 9.5, lz + 6), scale: 1.9 },
      { id: "econ", char: "経", pos: new THREE.Vector3(12.5, bridgeY(lz) + 12.5, lz - 2), scale: 2.2 },
      { id: "quant", char: "量", pos: new THREE.Vector3(20, bridgeY(lz) + 9, lz - 10), scale: 1.9 },
    ]);
    this.scene.add(this.great.group);

    // Water life & sky.
    this.scene.add(this.water.mesh);
    this.floating = new FloatingLanterns(
      {
        center: new THREE.Vector2(0, -160),
        half: new THREE.Vector2(220, 170),
        count: Math.round(900 * density),
        exclude: (x, z) =>
          (Math.abs(x) < BRIDGE.width / 2 + 2 && z < PLATFORM.z0 + 2 && z > SHORE_Z) ||
          (x > PLATFORM.x0 - 3 && x < PLATFORM.x1 + 3 && z > PLATFORM.z0 - 3 && z < PLATFORM.z1 + 3) ||
          z < SHORE_Z + 4,
      },
      Math.round(6000 * density),
      mulberry32(71),
      this.water.material.uniforms.uDrops as { value: THREE.Vector4[] },
    );
    this.scene.add(this.floating.near, this.floating.far);
    this.stars = new StarTrails(6000, mulberry32(33));
    this.stars.alpha = 1;
    this.scene.add(this.stars.mesh);
    this.whale = new ParticleWhale(mulberry32(8), particleScale, 96);
    this.whale.alpha = 1;
    this.whale.assemble = 1;
    this.whale.path = (t, out) => {
      const a = t * 0.045;
      return out.set(Math.sin(a) * 260 - 40, 230 + Math.sin(t * 0.08) * 16, -560 + Math.cos(a) * 170);
    };
    this.scene.add(this.whale.mesh);
    this.skyLanterns = new SkyLanterns(Math.round(260 * Math.max(0.5, particleScale)), mulberry32(12), { cx: 0, cz: -420, rx: 380, rz: 240, minDist: 40 });
    this.skyLanterns.intensity = 1;
    this.skyLanterns.prefill(70, 140);
    this.scene.add(this.skyLanterns.mesh);
    this.scene.add(this.fireworks.mesh);

    // Light-fish: a loop above the flight path and a loop over the bridge.
    const upper = FLY_POINTS.map(([x, y, z]) => new THREE.Vector3(x * 1.1, y + 22, z));
    const bridgeLoop = [
      [-30, 16, -60],
      [-12, 20, -150],
      [26, 24, -230],
      [44, 18, -150],
      [30, 14, -70],
      [0, 18, -40],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.fish = new LightFish(
      [upper, bridgeLoop],
      [
        { loop: 0, phase: 0.0, speed: 0.012, lateral: 0, vertical: 0, length: 60, width: 8, count: 180 },
        { loop: 0, phase: 0.35, speed: 0.014, lateral: 14, vertical: 6, length: 40, width: 6, count: 120 },
        { loop: 0, phase: 0.62, speed: 0.011, lateral: -12, vertical: -4, length: 50, width: 7, count: 150 },
        { loop: 1, phase: 0.0, speed: 0.022, lateral: 0, vertical: 0, length: 36, width: 5, count: 130 },
        { loop: 1, phase: 0.5, speed: 0.019, lateral: 6, vertical: 4, length: 26, width: 4, count: 90 },
      ],
      Math.max(0.5, particleScale),
    );
    this.scene.add(this.fish.mesh);
    this.setPose(STATIONS[1]);
  }

  resize(pl: Pipeline, tier: Tier) {
    this.camera.aspect = pl.width / pl.height;
    this.camera.updateProjectionMatrix();
    this.clouds.resize(pl.width, pl.height, tier);
    this.water.resize(pl.width, pl.height, tier.reflScale);
  }

  private setPose(p: Pose) {
    const cam = this.camera;
    cam.position.copy(p.pos);
    cam.up.set(Math.sin(p.roll), Math.cos(p.roll), 0);
    cam.lookAt(p.target);
    if (cam.fov !== p.fov) {
      cam.fov = p.fov;
      cam.updateProjectionMatrix();
    }
  }

  // --------------------------------------------------------------- chapters

  arrive(now: number) {
    this.chapter = 1;
    this.flying = false;
    this.settled = false;
    this.arrival = { t0: now };
    this.portal.ripple(0.5, 0.45, now, 1.2);
    this.portal.intensity = 1.2;
  }

  private arrival: { t0: number } | null = null;

  // Scripted reveal of the gate, then hand over to a normal move.
  private arrivalPose(now: number, p: Pose) {
    const t = now - this.arrival!.t0;
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (t < 2.8) {
      const k = ease(Math.min(1, t / 2.8));
      p.pos.lerpVectors(P_ARRIVE_0.pos, P_ARRIVE_1.pos, k);
      p.target.lerpVectors(P_ARRIVE_0.target, P_ARRIVE_1.target, k);
      p.fov = THREE.MathUtils.lerp(P_ARRIVE_0.fov, P_ARRIVE_1.fov, k);
      p.roll = 0;
      this.portal.intensity = THREE.MathUtils.lerp(1.2, 0.6, k);
      return false;
    }
    this.arrival = null;
    this.portal.intensity = 0.6;
    if (this.chapter === 1) this.startMove(P_ARRIVE_1, STATIONS[1], now, 3.6, [new THREE.Vector3(3, 12, -41)]);
    else this.goChapter(this.chapter, now);
    return true;
  }

  goChapter(i: number, now: number) {
    if (this.arrival) {
      // Still revealing the gate: go there once the reveal ends.
      this.chapter = i;
      return;
    }
    const from = { ...this.pose, pos: this.pose.pos.clone(), target: this.pose.target.clone() };
    this.chapter = i;
    this.settled = false;
    if (i === 4) {
      // Join the flight loop at its nearest point, then keep flying.
      const start = flyCurve.getPointAt(0);
      const look = flyCurve.getPointAt(0.02);
      const to = pose(start.x, start.y, start.z, look.x, look.y, look.z, 52);
      this.flyU = 0;
      this.startMove(from, to, now, 4.5, [new THREE.Vector3(from.pos.x * 0.5, Math.max(from.pos.y, 20) + 8, (from.pos.z + start.z) / 2)]);
      this.flying = true;
      return;
    }
    this.flying = false;
    const to = STATIONS[i];
    const mid: THREE.Vector3[] = [];
    const d = from.pos.distanceTo(to.pos);
    if (d > 60) mid.push(from.pos.clone().lerp(to.pos, 0.5).add(new THREE.Vector3(0, Math.min(30, d * 0.08), 0)));
    this.startMove(from, to, now, THREE.MathUtils.clamp(2.2 + d / 70, 2.6, 5.5), mid);
  }

  private startMove(from: Pose, to: Pose, now: number, dur: number, mid: THREE.Vector3[] = []) {
    const pts = [from.pos.clone(), ...mid, to.pos.clone()];
    if (pts.length === 2) pts.splice(1, 0, from.pos.clone().lerp(to.pos, 0.5));
    this.move = { curve: new THREE.CatmullRomCurve3(pts, false, "centripetal"), from, to, t0: now, dur };
  }

  pointer(x: number, y: number) {
    this.parallax.set(x, y);
  }

  click(ndc: THREE.Vector2, now: number) {
    const cam = this.camera;
    const dir = new THREE.Vector3(ndc.x, ndc.y, 0.5).unproject(cam).sub(cam.position).normalize();
    if (dir.y < -0.004) {
      const t = -cam.position.y / dir.y;
      const p = cam.position.clone().addScaledVector(dir, t);
      if (t < 500 && p.z > SHORE_Z) {
        this.water.addDrop(p.x, p.z, 0.22, now);
        this.skyLanterns.release(p.x, p.z);
        return;
      }
    }
    const d = new THREE.Vector3(dir.x, Math.max(dir.y, 0.1), dir.z).normalize();
    const at = cam.position.clone().addScaledVector(d, 360);
    at.y = Math.max(at.y, cam.position.y + 80);
    this.fireworks.launch(at, now, 90 + Math.random() * 40, 26 + Math.random() * 10);
  }

  lightSkill(id: string | null) {
    this.great.light(id);
  }

  releaseLantern(now: number) {
    const c = this.camera.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.skyLanterns.release(c.x + f.x * 30, c.z + f.z * 30, now - 1.5);
    this.fireworks.launch(c.clone().addScaledVector(f, 320).setY(c.y + 150), now, 100, 30);
  }

  // --------------------------------------------------------------- frame

  update(dt: number, now: number) {
    applyAtmos(1, this.atmos, MOON_DIR);
    G.uCityGlow.value.setRGB(0.22, 0.09, 0.035);
    this.floating.update(dt, 2.1);
    this.whale.update(dt);
    this.skyLanterns.update(dt, 1.4);
    this.fireworks.update(now);
    this.portal.update();
    this.great.update(dt, now);
    this.stars.head += dt * 0.0005;

    // Camera.
    const p = this.pose;
    if (this.arrival && !this.arrivalPose(now, p)) {
      this.settled = false;
      this.setPose(p);
      this.sakura.update(this.camera, 0.35);
      return;
    }
    if (this.move) {
      const m = this.move;
      const k = Math.min(1, (now - m.t0) / m.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      p.pos.copy(m.curve.getPoint(e));
      // Turn the view by yaw/pitch (shortest way round) rather than sliding
      // the look-at point, so the camera never swings up into empty sky.
      const tgtTo = this.flying ? this.flyLook(0) : m.to.target;
      const d0 = new THREE.Vector3().subVectors(m.from.target, m.from.pos).normalize();
      const d1 = new THREE.Vector3().subVectors(tgtTo, m.to.pos).normalize();
      const yaw0 = Math.atan2(d0.x, -d0.z);
      let yaw1 = Math.atan2(d1.x, -d1.z);
      while (yaw1 - yaw0 > Math.PI) yaw1 -= Math.PI * 2;
      while (yaw1 - yaw0 < -Math.PI) yaw1 += Math.PI * 2;
      const pitch0 = Math.asin(THREE.MathUtils.clamp(d0.y, -1, 1));
      const pitch1 = Math.asin(THREE.MathUtils.clamp(d1.y, -1, 1));
      const ey = e * e * (3 - 2 * e);
      const yaw = THREE.MathUtils.lerp(yaw0, yaw1, ey);
      const pitch = THREE.MathUtils.lerp(pitch0, pitch1, ey);
      p.target.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(200).add(p.pos);
      p.fov = THREE.MathUtils.lerp(m.from.fov, m.to.fov, e);
      p.roll = 0;
      if (k >= 1) {
        this.move = null;
        this.rest = { ...p, pos: p.pos.clone(), target: p.target.clone() };
      }
      this.settled = k > 0.7;
    } else if (this.flying) {
      const L = flyCurve.getLength();
      this.flyU = (this.flyU + (dt * this.flySpeed) / L) % 1;
      const pos = flyCurve.getPointAt(this.flyU);
      p.pos.copy(pos);
      p.target.copy(this.flyLook(this.flyU));
      // Bank into the turns.
      const t0 = flyCurve.getTangentAt(this.flyU);
      const t1 = flyCurve.getTangentAt((this.flyU + 0.02) % 1);
      const turn = t0.x * t1.z - t0.z * t1.x;
      p.roll = THREE.MathUtils.lerp(p.roll, THREE.MathUtils.clamp(-turn * 6, -0.18, 0.18), 1 - Math.exp(-dt * 2));
      p.fov = 52;
      this.settled = true;
    } else {
      // Rest with a gentle breathing drift + pointer parallax.
      const r = this.rest;
      const b = Math.sin(now * 0.25) * 0.25;
      p.pos.set(r.pos.x + this.parallax.x * 1.2, r.pos.y + b + this.parallax.y * 0.5, r.pos.z);
      p.target.set(r.target.x + this.parallax.x * 10, r.target.y + this.parallax.y * 6, r.target.z);
      p.fov = r.fov;
      p.roll = 0;
      this.settled = true;
    }
    this.setPose(p);
    this.sakura.update(this.camera, this.chapter >= 3 ? 0.8 : 0);
  }

  private flyLook(u: number) {
    const ahead = flyCurve.getPointAt((u + 0.035) % 1);
    return ahead.add(new THREE.Vector3(0, -3, 0));
  }

  render(pl: Pipeline) {
    const r = pl.renderer;
    const cam = this.camera;
    cam.updateMatrixWorld();
    G.uCamPos.value.copy(cam.position);
    G.uRes.value.set(pl.width, pl.height);
    // Point lights from the nearest lanterns.
    const lampU = this.structMat.uniforms.uLamps.value as THREE.Vector4[];
    const near = this.lamps
      .map((l) => ({ l, d: l.distanceToSquared(cam.position) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, lampU.length);
    lampU.forEach((v, i) => {
      const n = near[i];
      if (n) v.set(n.l.x, n.l.y, n.l.z, 1);
      else v.set(0, 0, 0, 0);
    });

    pl.timer.begin("clouds");
    this.clouds.update(r, cam);
    pl.timer.end();

    pl.timer.begin("reflection");
    this.water.updateReflection(cam);
    const rt = this.water.reflTarget;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    this.sky.render(r, rt, this.water.reflSkyCamera, null, this.clouds.pano.texture, true);
    this.water.mesh.visible = false;
    this.floating.far.visible = false;
    this.sakura.petals.visible = false;
    G.uCamPos.value.copy(this.water.reflCamera.position);
    G.uRes.value.set(rt.width, rt.height);
    this.stars.prepare(this.water.reflCamera, null, true, rt.height / 1080);
    r.render(this.scene, this.water.reflCamera);
    G.uCamPos.value.copy(cam.position);
    G.uRes.value.set(pl.width, pl.height);
    this.water.mesh.visible = true;
    this.floating.far.visible = true;
    this.sakura.petals.visible = true;
    pl.timer.end();

    pl.timer.begin("scene");
    r.setRenderTarget(pl.scene);
    r.clear(true, true, false);
    this.sky.render(r, pl.scene, cam, this.clouds.texture, null, false);
    this.stars.prepare(cam, this.clouds.texture, false, pl.height / 1080);
    r.render(this.scene, cam);
    pl.timer.end();
    pl.current = pl.scene;
    const post = pl.post;
    post.exposure = this.atmos.exposure * (1 + 0.3 * this.fireworks.light());
    post.bloom = 0.11;
    post.vignette = 0.26;
    post.flash = 0;
    post.ca = 0;
    void this.worldA;
    void LANDMARKS;
  }
}
