// The live archive plates (contract in plates.ts): one InstancedMesh of
// frosted cassettes that gathers into the overview's ribbed ∞, a loose
// domino chain beside section files, or flies off into the paper. Poses are
// rebuilt every frame from the viewport, so the figure stays registered with
// the DOM callouts; a small-FOV camera gives the PV's compressed perspective.

import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
  type ShaderMaterial,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ANCHOR_T } from "../views/home.ts";
import { ArcCurve, INF, chainPath, lemniscate, type Vec2 } from "./curves.ts";
import { applyPalette, createPlateMaterial } from "./material.ts";
import type { Anchor, Formation, Plates, PlatesOptions } from "./plates.ts";

const DEG = Math.PI / 180;
const COUNT = { high: 220, low: 150 } as const;
const PIXEL_CAP = 3.7e6;
const FOV = 24;
/** Frame px per world unit; a plate (5 × 3.7 × 0.31) is then 100 frame px wide. */
const UNIT = 20;

const FLOW_PERIOD = 80; // s per lap of the ∞
/** Tuned against the PV frames (angles in degrees, lengths in world units). */
const LOOK = {
  tilt: 30, // the figure leans back, bottom nearer the camera
  zSep: 2, // strands pass this far in front of / behind each other at the crossing
  lean: 42, // fins turned from edge-on toward the camera
  roll: 22, // turned in their own plane, so corners step out like the PV's teeth
  scale: 1,
  strand: 0.1, // darkening of the strand that passes in front
  cross: 0.08, // and of both strands where they overlap
  // the section chain
  cScale: 2,
  cLean0: 64, // where it rises from the bottom edge…
  cLean1: 52, // …and where it leaves past the left edge
  cRoll: 4,
  cUpright: 0.6, // 0: long side across the path, 1: always landscape
  cZ0: 12, // nearer the camera at the bottom, receding as it leaves
  cZ1: -10,
};

const CHAIN_COUNT = 16;
const CHAIN_STEP = 7; // s for the chain to drift by one plate
const HIDE_Z = -260;

const MORPH = 0.9; // s per plate
const STAGGER = 0.5; // s spread from first to last plate
const PULSE = 1.1;

const NARROW = "(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 539px), (pointer: coarse) and (max-width: 1400px)";
const STRIDE = 11; // px py pz · qx qy qz qw · scale fade tube tone

type FrameMap = { ox: number; oy: number; k: number };

const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class PlatesScene implements Plates {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(FOV, 1, 1, 1000);
  private geometry = new RoundedBoxGeometry(5, 3.7, 0.31, 2, 0.12);
  private material: ShaderMaterial = createPlateMaterial();
  private mesh: InstancedMesh;
  private inst: InstancedBufferAttribute;

  private theme: "light" | "dark";
  private reduced: boolean;
  private quality: "high" | "low";
  private n: number;
  private formation: Formation = "hidden";
  private morphT0 = -Infinity;
  private pulseT0 = -Infinity;
  private flow = 0;
  private lastT = 0;
  private raf = 0;
  private disposed = false;

  // per-instance state
  private cur = new Float32Array(COUNT.high * STRIDE);
  private from = new Float32Array(COUNT.high * STRIDE);
  private tgt = new Float32Array(COUNT.high * STRIDE);
  private glow = new Float32Array(COUNT.high);
  private order = new Float32Array(COUNT.high);
  private seed = new Float32Array(COUNT.high);
  private jitter: Quaternion[] = [];
  private chainSlot = new Int16Array(COUNT.high);
  private depth = new Float32Array(COUNT.high);
  private idx: number[] = [];

  // viewport
  private W = 1;
  private H = 1;
  private u = 1;
  private D = 100;
  private wpp = 1;
  private narrowQ = matchMedia(NARROW);
  private flat: Element | null = null;
  private yaw = 0;
  private pitch = 0;
  private aimYaw = 0;
  private aimPitch = 0;

  // curves & anchors
  private inf = new ArcCurve(lemniscate, 0, Math.PI * 2);
  private chain = new ArcCurve(chainPath, 0, 1, 1024);
  private anchorT: [string, number][];
  private anchorCb: ((a: Record<string, Anchor>) => void) | null = null;
  private lastAnchors: Record<string, Anchor> | null = null;

  // scratch
  private v2: Vec2 = { x: 0, y: 0 };
  private p = new Vector3();
  private p2 = new Vector3();
  private T = new Vector3();
  private B = new Vector3();
  private N = new Vector3();
  private m = new Matrix4();
  private q = new Quaternion();
  private q2 = new Quaternion();
  private qa = new Quaternion();
  private qb = new Quaternion();
  private sv = new Vector3();
  private fwd = new Vector3();

  private observer: MutationObserver;
  private onVisibility = () => {
    if (document.hidden) this.stop();
    else this.invalidate();
  };
  private onNarrow = () => this.invalidate();
  private onScroll = () => {
    if (this.narrow && this.formation === "infinity") this.invalidate();
  };
  private onLost = (e: Event) => {
    e.preventDefault();
    this.stop();
  };
  private onRestored = () => this.invalidate();

  constructor(
    private canvas: HTMLCanvasElement,
    o: PlatesOptions,
  ) {
    this.theme = o.theme;
    this.reduced = o.reduced;
    this.quality = o.quality;
    this.n = COUNT[o.quality];

    const antialias = o.quality === "high";
    const gl = canvas.getContext("webgl2", { antialias, alpha: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: "high-performance" });
    if (!gl || gl.isContextLost()) throw new Error("WebGL2 unavailable");
    this.renderer = new WebGLRenderer({ canvas, context: gl, antialias, alpha: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);

    this.mesh = new InstancedMesh(this.geometry, this.material, COUNT.high);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.inst = new InstancedBufferAttribute(new Float32Array(COUNT.high * 4), 4);
    this.inst.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("aInst", this.inst);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);

    const rnd = mulberry(7031);
    for (let i = 0; i < COUNT.high; i++) {
      this.seed[i] = rnd();
      this.jitter.push(new Quaternion().setFromAxisAngle(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), (rnd() - 0.5) * 6 * DEG));
      this.idx.push(i);
    }
    this.anchorT = Object.entries(ANCHOR_T);
    this.assignChain();

    this.readTheme();
    this.measure();
    // everything starts parked in the distance, so the first formation is a fly-in
    this.targets(0);
    this.cur.set(this.tgt);
    this.renderer.compile(this.scene, this.camera);

    this.observer = new MutationObserver(() => {
      const t = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      if (t !== this.theme) this.setTheme(t);
    });
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", this.onVisibility);
    document.addEventListener("scroll", this.onScroll, { capture: true, passive: true });
    this.narrowQ.addEventListener("change", this.onNarrow);
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);

    this.invalidate();
  }

  /** Phones, touch tablets, narrow, short and portrait windows: the ∞ follows the flat figure's box. */
  private get narrow() {
    return this.narrowQ.matches;
  }

  // ───────── public API ─────────

  setFormation(f: Formation, o: { immediate?: boolean } = {}): void {
    if (f === this.formation && !o.immediate) return;
    this.formation = f;
    this.lastAnchors = null;
    const now = performance.now() / 1000;
    if (o.immediate || this.reduced) {
      this.morphT0 = -Infinity;
    } else {
      this.from.set(this.cur);
      this.morphT0 = now;
    }
    this.setOrder();
    this.invalidate();
  }

  setTheme(t: "light" | "dark"): void {
    this.theme = t;
    this.readTheme();
    this.invalidate();
  }

  setReduced(r: boolean): void {
    if (r === this.reduced) return;
    this.reduced = r;
    if (r) {
      this.morphT0 = -Infinity;
      this.pulseT0 = -Infinity;
      this.yaw = this.pitch = this.aimYaw = this.aimPitch = 0;
    }
    this.invalidate();
  }

  setQuality(q: "high" | "low"): void {
    if (q === this.quality) return;
    const old = this.n;
    this.quality = q;
    this.n = COUNT[q];
    this.assignChain();
    this.setOrder();
    this.measure();
    // newly enabled plates start parked; everyone glides to the respaced figure
    this.targets(performance.now() / 1000);
    for (let i = old; i < this.n; i++) this.hiddenPose(i, this.cur);
    if (!this.reduced) {
      this.from.set(this.cur);
      this.morphT0 = performance.now() / 1000;
    }
    this.invalidate();
  }

  setPointer(nx: number, ny: number): void {
    if (this.reduced) return;
    this.aimYaw = Math.max(-1, Math.min(1, nx)) * 2 * DEG;
    this.aimPitch = Math.max(-1, Math.min(1, ny)) * 1.4 * DEG;
  }

  onAnchors(cb: (anchors: Record<string, Anchor>) => void): void {
    this.anchorCb = cb;
    this.lastAnchors = null;
    this.invalidate();
  }

  pulse(): void {
    if (this.reduced) return;
    this.pulseT0 = performance.now() / 1000;
    this.invalidate();
  }

  resize(): void {
    this.measure();
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.observer.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    document.removeEventListener("scroll", this.onScroll, { capture: true });
    this.narrowQ.removeEventListener("change", this.onNarrow);
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    this.anchorCb = null;
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.dispose();
  }

  // ───────── loop ─────────

  private invalidate() {
    if (this.disposed || this.raf || document.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame = (ms: number) => {
    this.raf = 0;
    if (this.disposed) return;
    const now = ms / 1000;
    const dt = Math.min(0.1, this.lastT ? now - this.lastT : 0);
    this.lastT = now;
    const animating = this.step(now, dt);
    this.draw();
    this.emitAnchors(now);
    if (animating) this.invalidate();
    else this.lastT = 0;
  };

  /** Advance the simulation; returns whether another frame is needed. */
  private step(now: number, dt: number): boolean {
    if (!this.reduced) {
      this.flow += dt;
      const k = 1 - Math.exp(-dt * 2.5);
      this.yaw += (this.aimYaw - this.yaw) * k;
      this.pitch += (this.aimPitch - this.pitch) * k;
    }
    const r = this.D;
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * r, Math.sin(this.pitch) * r, Math.cos(this.yaw) * Math.cos(this.pitch) * r);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.material.uniforms.uPlaneN.value.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));
    this.targets(now);
    const el = now - this.morphT0;
    const morphing = el < STAGGER + MORPH;
    const n = this.n;
    if (morphing) {
      for (let i = 0; i < n; i++) {
        const e = ease(Math.min(1, Math.max(0, (el - this.order[i] * STAGGER) / MORPH)));
        this.blend(i, e);
      }
    } else {
      this.cur.set(this.tgt.subarray(0, n * STRIDE));
    }

    if (this.reduced) return false;
    const pulsing = now - this.pulseT0 < PULSE + 0.4;
    const shown = this.formation !== "hidden";
    return morphing || pulsing || shown || Math.abs(this.aimYaw - this.yaw) > 1e-4 || Math.abs(this.aimPitch - this.pitch) > 1e-4;
  }

  private blend(i: number, e: number) {
    const o = i * STRIDE;
    const a = this.from;
    const b = this.tgt;
    const c = this.cur;
    for (let k = 0; k < 3; k++) c[o + k] = a[o + k] + (b[o + k] - a[o + k]) * e;
    this.qa.fromArray(a, o + 3);
    this.qb.fromArray(b, o + 3);
    this.q.slerpQuaternions(this.qa, this.qb, e).toArray(c, o + 3);
    for (let k = 7; k < STRIDE; k++) c[o + k] = a[o + k] + (b[o + k] - a[o + k]) * e;
  }

  /** Sort back to front, skip invisible plates, upload. */
  private draw() {
    const n = this.n;
    const cam = this.camera.position;
    this.fwd.copy(cam).negate().normalize();
    const vis: number[] = this.idx;
    vis.length = 0;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (this.cur[o + 7] < 1e-3 || this.cur[o + 8] < 3e-3) continue;
      this.depth[i] = (this.cur[o] - cam.x) * this.fwd.x + (this.cur[o + 1] - cam.y) * this.fwd.y + (this.cur[o + 2] - cam.z) * this.fwd.z;
      vis.push(i);
    }
    vis.sort((a, b) => this.depth[b] - this.depth[a]);
    const mat = this.mesh.instanceMatrix.array as Float32Array;
    const att = this.inst.array as Float32Array;
    for (let k = 0; k < vis.length; k++) {
      const i = vis[k];
      const o = i * STRIDE;
      const s = this.cur[o + 7];
      this.p.fromArray(this.cur, o);
      this.q.fromArray(this.cur, o + 3);
      this.m.compose(this.p, this.q, this.sv.set(s, s, s)).toArray(mat, k * 16);
      att[k * 4] = this.cur[o + 10] * (0.985 + 0.03 * this.seed[i]);
      att[k * 4 + 1] = this.cur[o + 8];
      att[k * 4 + 2] = this.glow[i];
      att[k * 4 + 3] = this.cur[o + 9];
    }
    this.mesh.count = vis.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.inst.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  // ───────── formations ─────────

  private assignChain() {
    this.chainSlot.fill(-1);
    for (let j = 0; j < CHAIN_COUNT; j++) this.chainSlot[Math.min(this.n - 1, Math.round(((j + 0.5) * this.n) / CHAIN_COUNT))] = j;
  }

  /** Stagger order (0..1) of each plate for the current formation. */
  private setOrder() {
    for (let i = 0; i < this.n; i++) {
      const j = this.chainSlot[i];
      this.order[i] = this.formation === "chain" && j >= 0 ? (j / CHAIN_COUNT) * 0.6 : i / this.n;
    }
  }

  private targets(now: number) {
    const n = this.n;
    const pulseAge = now - this.pulseT0;
    const front = (pulseAge / PULSE) * 1.3 - 0.15;
    for (let i = 0; i < n; i++) {
      this.glow[i] = pulseAge < PULSE + 0.4 ? Math.exp(-(((this.order[i] - front) / 0.07) ** 2)) : 0;
    }
    const f = this.formation;
    if (f === "infinity") {
      const map = this.infMap();
      for (let i = 0; i < n; i++) {
        if (map) this.infPose(i, map, this.tgt);
        else this.hiddenPose(i, this.tgt);
      }
    } else if (f === "chain" && !this.narrow) {
      for (let i = 0; i < n; i++) {
        const j = this.chainSlot[i];
        if (j >= 0) this.chainPose(i, j, this.tgt);
        else this.hiddenPose(i, this.tgt);
      }
    } else {
      for (let i = 0; i < n; i++) this.hiddenPose(i, this.tgt);
    }
  }

  /** Frame → viewport mapping for the ∞, or null when it has nowhere to be. */
  private infMap(): FrameMap | null {
    if (!this.narrow) return { ox: this.W / 2 - 960 * this.u, oy: this.H / 2 - 540 * this.u, k: this.u };
    if (!this.flat || !this.flat.isConnected) this.flat = document.querySelector(".home__flat");
    const r = this.flat?.getBoundingClientRect();
    if (!r || r.width < 2 || r.height < 2) return null;
    // the SVG's viewBox is 1920×1080, preserveAspectRatio meet
    const k = Math.min(r.width / 1920, r.height / 1080);
    return { ox: r.left + (r.width - 1920 * k) / 2, oy: r.top + (r.height - 1080 * k) / 2, k };
  }

  private cssToWorld(x: number, y: number, z: number, out: Vector3): Vector3 {
    const f = ((this.D - z) / this.D) * this.wpp;
    return out.set((x - this.W / 2) * f, (this.H / 2 - y) * f, z);
  }

  /** The ∞'s centreline at parameter t, in world space. */
  private infPoint(t: number, map: FrameMap, out: Vector3): Vector3 {
    lemniscate(t, this.v2);
    const sc = map.k / this.u;
    const z = sc * (((this.v2.y - INF.cy) * Math.tan(LOOK.tilt * DEG)) / UNIT + LOOK.zSep * Math.sin(t));
    return this.cssToWorld(map.ox + this.v2.x * map.k, map.oy + this.v2.y * map.k, z, out);
  }

  private infPose(i: number, map: FrameMap, out: Float32Array) {
    const s = (i / this.n + this.flow / FLOW_PERIOD) % 1;
    const t = this.inf.tAt(s);
    this.infPoint(t, map, this.p);
    this.infPoint(t + 2e-3, map, this.p2);
    this.T.subVectors(this.p2, this.p).normalize();
    this.B.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));
    const sc = (map.k / this.u) * LOOK.scale;
    this.fin(i, LOOK.lean * DEG + this.glow[i] * 0.35, LOOK.roll * DEG, this.glow[i] * 0.9 * sc, out);
    // the strand that passes in front at the crossing reads darker, as in the PV
    const c = Math.cos(t);
    this.attrs(i, out, sc, 1, 1, 1 - LOOK.strand * Math.max(0, Math.sin(t)) - LOOK.cross * Math.exp(-(c * c) / 0.03));
  }

  private chainPose(i: number, j: number, out: Float32Array) {
    const s = ((j + this.flow / CHAIN_STEP) % CHAIN_COUNT) / CHAIN_COUNT;
    this.chainPoint(s, this.p);
    this.chainPoint(s + 2e-3, this.p2);
    this.T.subVectors(this.p2, this.p).normalize();
    this.B.copy(Z_AXIS);
    const fade = smooth(0, 0.05, s) * smooth(1, 0.94, s);
    const lean = (LOOK.cLean0 + (LOOK.cLean1 - LOOK.cLean0) * s) * DEG;
    // turn the plates part of the way back toward landscape, like a standing stack
    let a = Math.atan2(this.T.x, -this.T.y);
    if (a > Math.PI / 2) a -= Math.PI;
    else if (a < -Math.PI / 2) a += Math.PI;
    this.fin(i, lean + this.glow[i] * 0.3, LOOK.cRoll * DEG - a * LOOK.cUpright, this.glow[i] * 1.2, out);
    this.attrs(i, out, LOOK.cScale, fade, 0, 1);
  }

  /** The chain path at arc fraction s, anchored to the viewport's left/bottom. */
  private chainPoint(s: number, out: Vector3): Vector3 {
    this.chain.at(this.chain.tAt(s), this.v2);
    const z = LOOK.cZ0 + (LOOK.cZ1 - LOOK.cZ0) * s;
    return this.cssToWorld(this.v2.x * this.u, this.H - (1080 - this.v2.y) * this.u, z, out);
  }

  /**
   * A plate standing across the path: long side along the in-plane normal,
   * face normal along the tangent, then leaned toward B (the camera side).
   */
  private fin(i: number, lean: number, roll: number, lift: number, out: Float32Array) {
    const T = this.T;
    const B = this.B;
    B.addScaledVector(T, -B.dot(T)).normalize();
    this.N.crossVectors(B, T);
    this.m.makeBasis(this.N, B, T);
    this.q.setFromRotationMatrix(this.m);
    this.q.multiply(this.q2.setFromAxisAngle(X_AXIS, -lean));
    this.q.multiply(this.q2.setFromAxisAngle(Z_AXIS, roll));
    this.q.multiply(this.jitter[i]);
    if (lift) this.p.addScaledVector(B, lift);
    const o = i * STRIDE;
    this.p.toArray(out, o);
    this.q.toArray(out, o + 3);
  }

  private attrs(i: number, out: Float32Array, scale: number, fade: number, tube: number, tone: number) {
    const o = i * STRIDE;
    out[o + 7] = scale;
    out[o + 8] = fade;
    out[o + 9] = tube;
    out[o + 10] = tone;
  }

  /** Parked far behind the paper (fully fogged), along the ∞'s own rays. */
  private hiddenPose(i: number, out: Float32Array) {
    const map = { ox: this.W / 2 - 960 * this.u, oy: this.H / 2 - 540 * this.u, k: this.u };
    const s = (i / this.n + this.flow / FLOW_PERIOD) % 1;
    const t = this.inf.tAt(s);
    this.infPoint(t, map, this.p);
    this.infPoint(t + 2e-3, map, this.p2);
    this.T.subVectors(this.p2, this.p).normalize();
    this.B.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));
    const f = (this.D - HIDE_Z) / (this.D - this.p.z);
    this.p.set(this.p.x * f, this.p.y * f, HIDE_Z);
    this.fin(i, LOOK.lean * DEG, LOOK.roll * DEG, 0, out);
    this.attrs(i, out, 0, 0, 1, 1);
  }

  // ───────── viewport, theme, anchors ─────────

  private measure() {
    const W = this.canvas.clientWidth || innerWidth;
    const H = this.canvas.clientHeight || innerHeight;
    this.W = W;
    this.H = H;
    this.u = Math.min(W / 1920, H / 1080);
    // camera distance chosen so one world unit is UNIT frame px on the z = 0 plane
    this.wpp = 1 / (this.u * UNIT);
    this.D = (H * this.wpp) / 2 / Math.tan((FOV / 2) * DEG);
    const cam = this.camera;
    cam.aspect = W / H;
    cam.near = Math.max(0.5, this.D - 60);
    cam.far = this.D - HIDE_Z + 120;
    cam.updateProjectionMatrix();

    let dpr = this.quality === "high" ? Math.min(devicePixelRatio || 1, 2) : 1;
    dpr = Math.min(dpr, Math.sqrt(PIXEL_CAP / (W * H)));
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    const u = this.material.uniforms;
    u.uRes.value.set(this.canvas.width, this.canvas.height);
    u.uFogNear.value = this.D - 4;
    u.uFogFar.value = this.D + 70;
  }

  private readTheme() {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    const bg = v("--bg", this.theme === "dark" ? "#11181b" : "#e8e5e1");
    applyPalette(this.material, this.theme, { hi: v("--bg-hi", bg), bg, lo: v("--bg-lo", bg) });
  }

  private emitAnchors(now: number) {
    const cb = this.anchorCb;
    if (!cb) return;
    const map = this.formation === "infinity" ? this.infMap() : null;
    const visible = !!map && (now - this.morphT0) / (STAGGER + MORPH) >= 0.8;
    const out: Record<string, Anchor> = {};
    let moved = !this.lastAnchors;
    for (const [id, t] of this.anchorT) {
      let x = -1;
      let y = -1;
      if (map) {
        this.infPoint(t, map, this.p).project(this.camera);
        x = (this.p.x + 1) * 0.5 * this.W;
        y = (1 - this.p.y) * 0.5 * this.H;
      }
      const a = { x, y, visible };
      const prev = this.lastAnchors?.[id];
      if (!prev || prev.visible !== visible || Math.abs(prev.x - x) > 0.25 || Math.abs(prev.y - y) > 0.25) moved = true;
      out[id] = a;
    }
    if (!moved) return;
    this.lastAnchors = out;
    cb(out);
  }
}
