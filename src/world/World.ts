import * as THREE from "three";
import { globals } from "./globals.ts";
import { GpuTimer } from "./gpuTimer.ts";
import { createNoiseTexture } from "./noise.ts";
import { PostPipeline, type PostParams } from "./post.ts";
import { guessTier, PIXEL_BUDGET, QualityGovernor, TIERS, type Tier } from "./quality.ts";
import { CameraRig, type Pose } from "./rig.ts";
import { createSky, createStars, MOON_RADIUS } from "./sky.ts";
import { createTunnel } from "./tunnel.ts";
import { Water } from "./water.ts";

// Entry sequence, in seconds after "启程". It follows the reference clip beat
// for beat (clip time = intro time + CLIP_OFFSET): black, a light appears, the
// dive through the tunnel, white-out, the gate emerges from the glare at dusk,
// then night falls under streaking stars and the trails settle into the
// moonlit sky. The camera never moves: it waits at the hero framing.
export const CLIP_OFFSET = 0.42;
export const INTRO = {
  white: 5.05, // the tunnel has burned to white
  clear: 6.07, // the gate has emerged from the glare
  dusk: 8.75, // night starts to fall
  night: 9.35, // the sky is dark
  trails: 11.2, // star trails at full length; they start to settle
  reveal: 10.2, // page copy fades in
  end: 12.4,
};

const NIGHT_HORIZON = new THREE.Color(0.008, 0.034, 0.066);
const NIGHT_HIGH = new THREE.Color(0.002, 0.012, 0.035);
const DUSK_HORIZON = new THREE.Color(0.56, 0.36, 0.35);
const DUSK_HIGH = new THREE.Color(0.06, 0.11, 0.33);
// The tunnel's blacks are warm and neutral, like the clip's.
const TUNNEL_SHADOW = new THREE.Color(0.0052, 0.005, 0.0041);

export type FrameContext = {
  dt: number;
  time: number;
  camera: THREE.PerspectiveCamera;
  pointer: THREE.Vector2; // NDC
  pointerActive: boolean;
  section: number;
  scrollSpeed: number;
};

export interface Part {
  object: THREE.Object3D;
  update?(ctx: FrameContext): void;
  setQuality?(tier: Tier): void;
  resize?(aspect: number): void;
}

export type WorldEvents = {
  onStats?: (fps: number, tier: string, auto: boolean) => void;
  onArrive?: () => void;
};

const tmpV = new THREE.Vector3();

export class World {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 9000);
  rig = new CameraRig();
  quality: QualityGovernor;
  gpu: GpuTimer;
  post: PostPipeline;
  water: Water;
  sky: ReturnType<typeof createSky>;
  parts: Part[] = [];

  pointer = new THREE.Vector2(0, 0);
  pointerActive = false;
  private smoothPointer = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private clock = 0;
  private last = 0;
  private running = false;
  private introT = -1;
  private introSpeed = 1;
  private tunnel = createTunnel();
  private exposure = 1.25;
  private height = 1;
  private cssW = 1;
  private cssH = 1;
  private statsTimer = 0;
  private reduced: boolean;
  private events: WorldEvents;
  private sun = new THREE.Vector2(0.5, 0.5);
  private sunVisible = 0;
  moonPulse = 0;
  // Live overrides for post parameters (handy from the devtools console).
  tune: Partial<PostParams> = {};

  constructor(canvas: HTMLCanvasElement, opts: { reducedMotion: boolean; mobile: boolean; events?: WorldEvents }) {
    this.reduced = opts.reducedMotion;
    this.events = opts.events ?? {};
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 1);

    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.quality = new QualityGovernor(guessTier(gl, opts.mobile));
    this.gpu = new GpuTimer(gl);

    globals.uNoise.value = createNoiseTexture();
    this.camera.layers.enable(0);

    this.sky = createSky();
    this.scene.add(this.sky.mesh);
    this.scene.add(createStars());

    this.water = new Water();
    this.scene.add(this.water.mesh);

    this.post = new PostPipeline(1, 1, this.quality.current.msaa);
    this.resize();
  }

  add(part: Part) {
    this.parts.push(part);
    this.scene.add(part.object);
    part.setQuality?.(this.quality.current);
    part.resize?.(this.cssW / this.cssH);
  }

  // Compiles every program up front (in parallel where the driver allows) so
  // the first real frames do not hitch.
  async warmUp() {
    const pose = this.rig.update(0);
    this.applyPose(pose);
    // Compilation skips invisible objects, and fireworks / the wish lantern /
    // the altars start hidden — show everything while compiling so nothing
    // compiles (and hitches) on first appearance.
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    // Program variants depend on the render target being drawn into, and every
    // pass renders into half-float targets — so compile against one of those,
    // not the canvas, or everything recompiles on first use.
    this.renderer.setRenderTarget(this.post.scene);
    // compileAsync polls with setTimeout, which background tabs throttle hard;
    // never let it hold the loader for more than a few seconds.
    await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 4000))]);
    this.renderer.setRenderTarget(this.post.scene);
    this.renderer.render(this.scene, this.camera);
    this.tunnel.render(this.renderer, this.post.scene);
    // Upload every texture now too, so nothing uploads (and hitches) later.
    const seen = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
      if (!mat?.uniforms) return;
      for (const u of Object.values(mat.uniforms)) {
        if (u.value instanceof THREE.Texture && !seen.has(u.value)) {
          seen.add(u.value);
          this.renderer.initTexture(u.value);
        }
      }
    });
    for (const o of hidden) o.visible = false;
    this.renderFrame(0);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = window.innerWidth;
    this.cssH = window.innerHeight;
    let w = this.cssW * dpr;
    let h = this.cssH * dpr;
    const cap = Math.sqrt(Math.min(1, PIXEL_BUDGET / (w * h)));
    const tier = this.quality.current;
    w = Math.max(2, Math.round(w * cap * tier.scale));
    h = Math.max(2, Math.round(h * cap * tier.scale));
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, tier.msaa);
    this.water.setSize(w * tier.reflection, h * tier.reflection);
    globals.uResolution.value.set(w, h);
    globals.uPixelRatio.value = w / this.cssW;
    this.camera.aspect = w / h;
    this.rig.setAspect(this.cssW / this.cssH);
    for (const p of this.parts) p.resize?.(this.cssW / this.cssH);
    this.quality.grace(performance.now(), 800);
  }

  private applyTier() {
    const tier = this.quality.current;
    for (const p of this.parts) p.setQuality?.(tier);
    this.resize();
  }

  cycleQuality() {
    // AUTO → ULTRA → HIGH → MED → LOW → AUTO
    const now = performance.now();
    if (this.quality.auto) this.quality.setManual(TIERS.length - 1, now);
    else if (this.quality.tier === 0) this.quality.setManual(null, now);
    else this.quality.setManual(this.quality.tier - 1, now);
    this.applyTier();
    this.emitStats();
  }

  setScroll(s: number) {
    this.rig.setGoal(s);
  }

  setPointer(ndcX: number, ndcY: number, active: boolean) {
    this.pointer.set(ndcX, ndcY);
    this.pointerActive = active;
  }

  startIntro() {
    this.introT = this.reduced ? INTRO.end : 0;
    this.introSpeed = 1;
    this.rig.jump();
    if (this.reduced) this.events.onArrive?.();
  }

  // Fast-forward the entry sequence (any click, scroll or key during it).
  skipIntro() {
    if (!this.introDone) this.introSpeed = 7;
  }

  get introDone() {
    return this.introT >= INTRO.end || this.introT < 0;
  }

  get introTime() {
    return this.introT;
  }

  // When the page copy should fade in during the sequence.
  readonly revealAt = INTRO.reveal;

  // World-space ray under the pointer.
  ray(ndc = this.pointer) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  // Where the pointer ray meets the water, if it does.
  waterPoint(ndc = this.pointer, out = new THREE.Vector3()): THREE.Vector3 | null {
    const r = this.ray(ndc);
    if (r.direction.y > -0.002) return null;
    const t = -r.origin.y / r.direction.y;
    if (t > 2500) return null;
    return out.copy(r.origin).addScaledVector(r.direction, t);
  }

  isMoonAt(ndc = this.pointer) {
    if (globals.uMoonK.value < 0.5) return false;
    const r = this.ray(ndc);
    return r.direction.dot(globals.uMoonDir.value) > Math.cos(MOON_RADIUS);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.quality.grace(this.last, 2500);
    const loop = (now: number) => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      const dtMs = now - this.last;
      this.last = now;
      if (this.quality.sample(dtMs, now, this.gpu.frameMs)) {
        this.applyTier();
        this.emitStats();
      }
      this.renderFrame(Math.min(dtMs / 1000, 1 / 20));
    };
    requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.quality.grace(performance.now(), 1500);
    });
  }

  private emitStats() {
    const q = this.quality;
    this.events.onStats?.(q.fps, q.current.name, q.auto);
  }

  private applyPose(pose: Pose) {
    const cam = this.camera;
    cam.position.copy(pose.pos);
    cam.lookAt(pose.target);
    cam.fov = pose.fov;
    cam.updateProjectionMatrix();
    // Lens shift: move the image horizontally without re-aiming the camera.
    cam.projectionMatrix.elements[8] = -pose.shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld();
  }

  private renderFrame(dt: number) {
    this.clock += dt;
    const t = this.clock;
    globals.uTime.value = t;

    // Camera: scroll rig, cursor parallax and a slow drift.
    const pose = this.rig.update(dt);
    const intro = this.introT >= 0 && this.introT < INTRO.end;
    if (intro) {
      const prev = this.introT;
      this.introT = Math.min(INTRO.end, this.introT + dt * this.introSpeed);
      if (prev < INTRO.white && this.introT >= INTRO.white) this.events.onArrive?.();
    }
    const tt = this.introT;
    const inTunnel = intro && tt < INTRO.white;
    const ss = THREE.MathUtils.smoothstep;

    // Time of day: dusk on arrival, then night falls fast (as in the clip).
    const dusk = tt < 0 || this.reduced ? 0 : 1 - ss(tt, INTRO.dusk, INTRO.night);
    globals.uDusk.value = dusk;
    // Dusk air is hazier: the far hills melt into the pink horizon.
    globals.uFogDensity.value = 0.00085 * (1 + 1.8 * dusk);
    // Star trails: they begin as night falls and lengthen like a long
    // exposure; then the tails fade from the back, leaving still stars.
    const trailsOn = tt >= 0 && !this.reduced && tt < INTRO.end;
    globals.uTrail.value = trailsOn ? Math.max(0, tt - (INTRO.dusk + 0.15)) : 0;
    globals.uTrailFade.value = trailsOn ? ss(tt, INTRO.dusk + 0.1, INTRO.dusk + 0.6) * (1 - ss(tt, INTRO.end - 0.6, INTRO.end)) : 0;
    globals.uTrailTail.value = trailsOn ? ss(tt, INTRO.trails, INTRO.end - 0.3) : 0;
    // No moon at dusk or behind the trails; it rises as they settle.
    const moonK = tt < 0 || this.reduced ? 1 : ss(tt, INTRO.trails - 0.2, INTRO.end);
    globals.uMoonK.value = moonK;
    globals.uReveal.value = tt < 0 || this.reduced || !intro ? 1 : ss(tt, INTRO.reveal - 0.1, INTRO.reveal + 0.9);
    const elev = THREE.MathUtils.lerp(-0.16, 0.07, dusk);
    globals.uSunDir.value.set(0.34, Math.sin(elev), 0.94).normalize();
    globals.uFogHorizon.value.copy(NIGHT_HORIZON).lerp(DUSK_HORIZON, dusk);
    globals.uFogHigh.value.copy(NIGHT_HIGH).lerp(DUSK_HIGH, dusk);
    this.smoothPointer.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const sway = this.reduced ? 0 : 1;
    const px = this.smoothPointer.x * sway;
    const py = this.smoothPointer.y * sway;
    tmpV.set(Math.sin(t * 0.21) * 0.35 + px * 1.3, Math.sin(t * 0.17) * 0.22 + py * 0.6, 0);
    pose.pos.add(tmpV);
    pose.target.add(tmpV.set(px * 3.5, py * 2.0, 0));
    const speed = Math.abs(this.rig.velocity);
    pose.fov += Math.min(speed * 3, 3);
    this.applyPose(pose);

    // Cursor ray for particles and fish.
    const r = this.ray();
    globals.uRayOrigin.value.copy(r.origin);
    globals.uRayDir.value.copy(r.direction);
    globals.uRayOn.value += ((this.pointerActive ? 1 : 0) - globals.uRayOn.value) * (1 - Math.exp(-dt * 6));
    globals.uPointScale.value = this.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const wp = this.waterPoint(this.pointer, tmpV);
    this.water.setCursor(wp?.x ?? 0, wp?.z ?? 0, wp && this.pointerActive ? 1 : 0);

    // Firework light decays; the beat envelope decays.
    globals.uFlash.value.multiplyScalar(Math.exp(-dt * 3.5));
    globals.uBeat.value *= Math.exp(-dt * 4);
    this.moonPulse *= Math.exp(-dt * 1.2);
    this.sky.uniforms.uMoonPulse.value = this.moonPulse;

    const ctx: FrameContext = {
      dt,
      time: t,
      camera: this.camera,
      pointer: this.pointer,
      pointerActive: this.pointerActive,
      section: this.rig.section,
      scrollSpeed: speed,
    };
    for (const p of this.parts) p.update?.(ctx);

    // Moon in screen space (god rays, ghosts) and eye adaptation.
    const moonDir = globals.uMoonDir.value;
    tmpV.copy(this.camera.position).addScaledVector(moonDir, 3000).project(this.camera);
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const facing = fwd.dot(moonDir);
    this.sun.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
    const edge = Math.max(Math.abs(tmpV.x), Math.abs(tmpV.y));
    this.sunVisible = (facing > 0 ? THREE.MathUtils.smoothstep(1.35 - edge, 0, 0.4) : 0) * moonK;
    const targetExposure =
      1.15 * THREE.MathUtils.lerp(1, 0.82, ss(facing, 0.9, 0.995) * moonK) * THREE.MathUtils.lerp(1, 0.8, dusk);
    // During the sequence exposure is a pure function of its clock, so a
    // frame depends only on the time (smooth, and reproducible for tests).
    if (intro) this.exposure = targetExposure;
    else this.exposure += (targetExposure - this.exposure) * (1 - Math.exp(-dt * 1.5));
    globals.uExposure.value = this.exposure;
    // White-out and emergence: the tunnel burns to white, then the gate
    // surfaces from over-exposure — shadows first, highlights last — while the
    // glow, fringing and the white veil relax.
    let flash = 0;
    let over = 1;
    let ca = 0;
    let bloom = 0.065;
    let sat = THREE.MathUtils.lerp(0.92, 1.07, dusk);
    if (inTunnel) {
      flash = ss(tt, INTRO.white - 0.08, INTRO.white);
      ca = 0.0022 + 0.003 * ss(tt, INTRO.white - 0.7, INTRO.white);
      bloom = 0.1;
    } else if (intro && tt < INTRO.clear) {
      // One smooth curve, as in the clip: the white holds a moment, then
      // lifts over ~0.75 s with soft ends; beneath it the scene starts over-
      // exposed and settles, so the gate surfaces from the glare.
      const g = 1 - ss(tt, INTRO.white + 0.14, INTRO.clear);
      flash = Math.pow(g, 1.3);
      over = 1 + 5 * g * g;
      sat = 1.07 + 0.55 * g;
      ca = 0.006 * g * g;
      bloom = 0.065 + 0.35 * g * g;
    }
    // Passes: reflection → scene (MSAA HDR) → post chain. During the dive the
    // tunnel shader replaces the world entirely.
    const tier = this.quality.current;
    const gpu = this.gpu;
    gpu.poll();
    if (inTunnel) {
      const u = this.tunnel.uniforms;
      u.uV.value = tt + CLIP_OFFSET;
      u.uAspect.value = this.camera.aspect;
      u.uPx.value = 2 / this.height;
      gpu.begin("scene");
      this.tunnel.render(this.renderer, this.post.scene);
      gpu.end();
    } else {
      gpu.begin("reflection");
      this.water.renderReflection(this.renderer, this.scene, this.camera, tier.reflection);
      gpu.end();
      gpu.begin("scene");
      this.renderer.setRenderTarget(this.post.scene);
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      gpu.end();
    }
    gpu.begin("post");
    this.post.finish(this.renderer, {
      exposure: (inTunnel ? 1.1 : this.exposure * over) * (tt < 0 ? 0.35 : 1),
      bloom,
      god: inTunnel ? 0 : 0.4,
      godSamples: tier.god,
      vignette: 0.42,
      grain: 0.034,
      flash,
      ca,
      shadow: inTunnel ? TUNNEL_SHADOW : undefined,
      // Dusk is painted richer than the moonlit night.
      sat: inTunnel ? 0.96 : sat,
      sun: this.sun,
      sunVisible: this.sunVisible,
      time: t,
      ...this.tune,
    });
    gpu.end();

    this.statsTimer += dt;
    if (this.statsTimer > 0.25) {
      this.statsTimer = 0;
      this.emitStats();
    }
  }
}
