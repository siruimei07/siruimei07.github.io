// The live archive plates (contract in plates.ts): one InstancedMesh of
// frosted cassettes that gathers into the overview's ribbed ∞, a loose
// cassette chain beside section files, or flies off into the paper. Poses are
// rebuilt every frame from the viewport, so the figure stays registered with
// the DOM callouts; a small-FOV camera gives the PV's compressed perspective.
//
// Motion follows MOTION-SPEC §6.9 at 1.1×. Formations travel on per-plate
// springs (RhineLabUI's selection rates). The ∞ never flows: its plates twist
// in place as the PV's fins do, and breathe once the page is idle. The chain
// is frozen between flip-waves and whole-pitch conveyor bursts. The pointer
// tilts the camera, lifts the plates it passes, drags the ∞ with inertia and
// sends RhineLabUI selection waves through the ribbon; a theme change crosses
// the figure plate by plate from the control that made it.

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
import { F, FINE_QUERY, IDLE_MS, PHONE_QUERY, POINTER_RATE, RL, RLRATE, approach, damp, ease, isPaper, onFrame, smooth3, smooth5, type Cancel, type Spring } from "../app/fx.ts";
import { ANCHOR_T } from "../views/home.ts";
import { ArcCurve, INF, chainPath, lemniscate, type Vec2 } from "./curves.ts";
import { applyPalettes, createPlateMaterial, type Backdrop, type Theme } from "./material.ts";
import type { Anchor, Formation, Plates, PlatesOptions, PulseFrom } from "./plates.ts";

const DEG = Math.PI / 180;
const COUNT = { high: 220, low: 150 } as const;
const MAX = COUNT.high;
const PIXEL_CAP = 3.7e6;
const FOV = 24;
/** Frame px per world unit; a plate (5 × 3.7 × 0.31) is then 100 frame px wide. */
const UNIT = 20;

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
const HIDE_Z = -260;

/** G-01: RhineLabUI selection springs (damp 4.2/s) and their 500 ms stagger, at 1.1×. */
const MORPH = { rate: RLRATE(4.2), stagger: RL(500) };
/** G-02: one full turn of each fin per 250 PV frames, phase-shifted along the ribbon (atlas §3, FLAG 14: the calm end). */
const TWIST_MS = F(250);
/** G-02: RhineLabUI idle breathing (motion.ts idleWave), gain rates and periods at 1.1×. */
const BREATHE = { in: RLRATE(0.8), out: RLRATE(4), p1: RL(8000), p2: RL(13000) };
/** G-04: RhineLabUI baselineSelectionWave, life 3.2 s; age runs 1.1× fast, distance in plate pitches. */
const WAVE = { life: RL(3200), clamp: 0.6, glow: 0.35, keep: 6 };
/** G-10, G-13: RhineLabUI hover lift (+0.28, lerp rate 14) at 1.1×; radii in PV px. */
const LIFT = { rate: RLRATE(14), height: 0.28, prox: 90, proxTone: 0.12, hlTone: 0.2, hlSpan: 12, hlWidth: 6 };
/** Pointer reach in PV px: a click ripples within RIPPLE, the ∞ band is grabbable within BAND. */
const REACH = { ripple: 120, band: 60, chain: 60 };
/** G-12: RhineLabUI archive drag and momentum (archive-drag.ts) at 1.1×. */
const DRAG = { moved: 7, start: 10, window: 120, still: 80, span: 8, samples: 32, friction: RLRATE(2.4), coast: RLRATE(0.75), stop: RLRATE(0.6), snap: RLRATE(10) };
/** G-03, G-14: the chain's flip-wave (atlas §3, §6.3): twist in, drift, flip back; 1 PV frame per cassette. */
const FLIP = { in: F(37.5), drift: F(15), out: F(27), lag: F(2), every: [4400, 5000] as const, hover: 2500, twist: -48 * DEG, lean: 18 * DEG, nudge: 0.06 };
const FLIP_TOTAL = FLIP.in + FLIP.drift + FLIP.out;
/** G-03: a conveyor burst over whole pitches, bell speed profile. */
const CONVEYOR_MS = F(60);
/** G-07: RhineLabUI theme wave (theme-motion.ts) at 1.1×; rows 108u, columns 384u. */
const THEME = { row: 108, col: 384, perRow: RL(34), perCol: RL(110), cap: RL(600), item: RL(580), bg: RL(850) };
const THEME_DONE = THEME.cap + THEME.item;

const STRIDE = 11; // px py pz · qx qy qz qw · scale fade tube tone
const BACKDROP: Record<Theme, Backdrop> = {
  light: { hi: "#f1efec", bg: "#e8e5e1", lo: "#dcd8d2" },
  dark: { hi: "#182125", bg: "#11181b", lo: "#0b1012" },
};

type FrameMap = { ox: number; oy: number; k: number };
type Pulse = { t0: number; pos: number; f: Formation };
type Burst = { t0: number; n: number };
type DragState = {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  active: boolean;
  /** The grabbed plate, which keeps following the pointer along the curve. */
  grab: number;
  samples: { v: number; t: number }[];
  lastMotion: number;
  dx: number;
  dy: number;
};
type Momentum = { s: Spring; target: number; coasting: boolean };

const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const IDENTITY = new Quaternion();

const smooth = (a: number, b: number, x: number) => smooth3((x - a) / (b - a));
const mod = (a: number, n: number) => ((a % n) + n) % n;
/** Distance along a closed ribbon of n pitches. */
const ring = (a: number, b: number, n: number) => {
  const d = mod(a - b, n);
  return Math.min(d, n - d);
};
const bell = (x: number, w: number) => Math.exp(-0.5 * (x / w) ** 2);
const easeDraw = ease("draw");
const easeSwap = ease("swap");
const easeSmooth = ease("smooth");

/** RhineLabUI's signed selection wave (motion.ts baselineSelectionWave), at 1.1×. */
function selection(d: number, ageMs: number): number {
  const a = (ageMs / 1000) * 1.1;
  if (a < 0 || a > 3.2) return 0;
  const x = d - a * 8;
  return 0.8 * smooth5(a / 0.2) * Math.exp(-a * 1.15) * Math.cos(x * 0.58) * bell(x, 3.4);
}

/** One cassette's flip, 0 (resting) → 1 (face-on) and back, ms after its own start. */
function flipAt(ms: number): number {
  if (ms <= 0 || ms >= FLIP_TOTAL) return 0;
  if (ms < FLIP.in) return easeDraw(ms / FLIP.in);
  if (ms < FLIP.in + FLIP.drift) return 1 + FLIP.nudge * easeSmooth((ms - FLIP.in) / FLIP.drift);
  return (1 + FLIP.nudge) * (1 - easeSwap((ms - FLIP.in - FLIP.drift) / FLIP.out));
}

const between = ([a, b]: readonly [number, number]) => a + Math.random() * (b - a);

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
  private inst2: InstancedBufferAttribute;
  private html = document.documentElement;

  private reduced: boolean;
  private quality: "high" | "low";
  private n: number;
  private formation: Formation = "hidden";
  private morphT0 = -Infinity;
  private disposed = false;
  private stopFrame: Cancel | null = null;
  private dirty = false;
  private lastMs = 0;
  private wakeTimer = 0;

  // per-plate state
  private cur = new Float32Array(MAX * STRIDE);
  private tgt = new Float32Array(MAX * STRIDE);
  /** Spring offsets of the shown pose from the target pose, and their velocities. */
  private offP = new Float32Array(MAX * 3);
  private velP = new Float32Array(MAX * 3);
  private offQ = new Float32Array(MAX * 4);
  private offA = new Float32Array(MAX * 4);
  private velA = new Float32Array(MAX * 4);
  private startAt = new Float64Array(MAX);
  private settling = false;
  /** The ribbon's across-axis for the tube light, before the twist. */
  private axis = new Float32Array(MAX * 3);
  private glow = new Float32Array(MAX);
  private height = new Float32Array(MAX);
  private prox = new Float32Array(MAX);
  private hl = new Float32Array(MAX);
  private order = new Float32Array(MAX);
  private seed = new Float32Array(MAX);
  private jitter: Quaternion[] = [];
  private chainSlot = new Int16Array(MAX);
  private depth = new Float32Array(MAX);
  private idx: number[] = [];
  /** Projected centres (viewport CSS px) from the last drawn frame. */
  private sx = new Float32Array(MAX);
  private sy = new Float32Array(MAX);
  private shown = new Uint8Array(MAX);

  // ∞: twist, breathing, waves, highlight, drag
  private twistT = 0;
  private breath = 0;
  private pulses: Pulse[] = [];
  private hlPos: number | null = null;
  /** The ∞'s plates slide along the curve by this many pitches (drag). */
  private slide = 0;
  private drag: DragState | null = null;
  private momentum: Momentum | null = null;

  // chain: conveyor, flip-waves
  private shiftBase = 0;
  private bursts: Burst[] = [];
  private flipStart = new Float64Array(CHAIN_COUNT).fill(-Infinity);
  private nextWave = Infinity;
  private hoverSlot = -1;
  private lastHoverWave = -Infinity;

  // theme cascade
  private themeTarget: 0 | 1;
  private themeT0 = -Infinity;
  private mix = new Float32Array(MAX);
  private mixFrom = new Float32Array(MAX);
  private mixAt = new Float64Array(MAX);
  private bgFrom = 0;
  private bgMix = 0;
  private backdrop: Record<Theme, Backdrop> = { light: { ...BACKDROP.light }, dark: { ...BACKDROP.dark } };

  // pointer and idle
  private px = 0;
  private py = 0;
  private pIn = false;
  private hoverOn = false;
  private tap: { id: number; x: number; y: number; t: number; paper: boolean } | null = null;
  private paperSeen = false;
  private idleSig: boolean | null = null;
  private lastInput = performance.now();

  // viewport
  private W = 1;
  private H = 1;
  private u = 1;
  private D = 100;
  private wpp = 1;
  private narrowQ = matchMedia(PHONE_QUERY);
  private fineQ = matchMedia(FINE_QUERY);
  private flat: Element | null = null;
  private map: FrameMap | null = null;
  private yaw = 0;
  private pitch = 0;

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
  private spring: Spring = { value: 0, velocity: 0 };

  private observer: MutationObserver;
  private ac = new AbortController();
  /** Dev only: main-thread ms spent per frame (step + upload + render call), last 300 frames. */
  private cost: number[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    o: PlatesOptions,
  ) {
    this.reduced = o.reduced;
    this.quality = o.quality;
    this.n = COUNT[o.quality];
    this.themeTarget = o.theme === "dark" ? 1 : 0;
    this.mix.fill(this.themeTarget);
    this.bgMix = this.themeTarget;

    const antialias = o.quality === "high";
    const gl = canvas.getContext("webgl2", { antialias, alpha: true, premultipliedAlpha: true, depth: true, stencil: false, powerPreference: "high-performance" });
    if (!gl || gl.isContextLost()) throw new Error("WebGL2 unavailable");
    this.renderer = new WebGLRenderer({ canvas, context: gl, antialias, alpha: true, premultipliedAlpha: true });
    this.renderer.setClearColor(0x000000, 0);

    this.mesh = new InstancedMesh(this.geometry, this.material, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.inst = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.inst.setUsage(DynamicDrawUsage);
    this.inst2 = new InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.inst2.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute("aInst", this.inst);
    this.geometry.setAttribute("aInst2", this.inst2);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.scene.add(this.mesh);

    const rnd = mulberry(7031);
    for (let i = 0; i < MAX; i++) {
      this.seed[i] = rnd();
      this.jitter.push(new Quaternion().setFromAxisAngle(new Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), (rnd() - 0.5) * 6 * DEG));
      this.idx.push(i);
      this.offQ[i * 4 + 3] = 1;
    }
    this.anchorT = Object.entries(ANCHOR_T);
    this.assignChain();

    this.readTheme();
    this.measure();
    // everything starts parked in the distance, so the first formation is a fly-in
    this.targets(performance.now());
    this.cur.set(this.tgt);
    this.renderer.compile(this.scene, this.camera);

    this.observer = new MutationObserver(() => this.setTheme(this.html.dataset.theme === "dark" ? "dark" : "light"));
    this.observer.observe(this.html, { attributes: true, attributeFilter: ["data-theme"] });
    this.listen();
    this.invalidate();
    if (import.meta.env.DEV) {
      const stats = () => {
        const c = this.cost;
        return { frames: c.length, avg: c.reduce((a, b) => a + b, 0) / (c.length || 1), max: Math.max(0, ...c) };
      };
      (window as unknown as { __plates?: { stats: typeof stats; scene: PlatesScene } }).__plates = { stats, scene: this };
    }
  }

  /** Phones, touch tablets, narrow, short and portrait windows: the ∞ follows the flat figure's box. */
  private get narrow() {
    return this.narrowQ.matches;
  }

  /** Lamp-style pointer effects (parallax, lift, drag, hover waves): a precise hovering pointer only. */
  private pointerFx() {
    return this.fineQ.matches && !this.reduced && !this.narrow;
  }

  // ───────── public API ─────────

  setFormation(f: Formation, o: { immediate?: boolean } = {}): void {
    if (f === this.formation && !o.immediate) return;
    const now = performance.now();
    this.formation = f;
    this.lastAnchors = null;
    this.pulses = this.pulses.filter((p) => p.f === f);
    if (f !== "infinity") {
      this.endDrag();
      this.momentum = null;
      this.slide = mod(Math.round(this.slide), this.n);
      this.hlPos = null;
      this.setHover(false);
    }
    if (f === "chain") this.nextWave = now + between(FLIP.every);
    else this.flipStart.fill(-Infinity);
    const instant = !!o.immediate || this.reduced;
    this.morphT0 = instant ? -Infinity : now;
    this.setOrder();
    this.map = f === "infinity" ? this.infMap() : null;
    this.retarget(now, instant);
    this.invalidate();
  }

  setTheme(t: Theme): void {
    this.readTheme();
    const target = t === "dark" ? 1 : 0;
    if (target !== this.themeTarget) {
      // no rl:theme came first (an OS change, or a shell without the cascade): switch with the page
      this.themeTarget = target;
      this.themeT0 = -Infinity;
      this.mix.fill(target);
      this.bgMix = target;
    }
    this.invalidate();
  }

  setReduced(r: boolean): void {
    if (r === this.reduced) return;
    this.reduced = r;
    if (r) {
      const now = performance.now();
      this.pulses = [];
      this.endDrag();
      this.momentum = null;
      this.slide = mod(Math.round(this.slide), this.n);
      // pending conveyor bursts land on their whole pitch at once
      for (const b of this.bursts) this.shiftBase += b.n;
      this.bursts = [];
      this.flipStart.fill(-Infinity);
      this.breath = 0;
      this.prox.fill(0);
      this.hl.fill(0);
      this.yaw = this.pitch = 0;
      this.themeT0 = -Infinity;
      this.mix.fill(this.themeTarget);
      this.bgMix = this.themeTarget;
      this.retarget(now, true);
    } else if (this.formation === "chain") {
      this.nextWave = performance.now() + between(FLIP.every);
    }
    this.setHover(false);
    this.invalidate();
  }

  setQuality(q: "high" | "low"): void {
    if (q === this.quality) return;
    const old = this.n;
    this.quality = q;
    this.n = COUNT[q];
    this.endDrag();
    this.momentum = null;
    this.slide = 0;
    this.assignChain();
    this.setOrder();
    this.measure();
    // newly enabled plates start parked; everyone springs to the respaced figure
    for (let i = old; i < this.n; i++) this.hiddenPose(i, this.cur);
    this.retarget(performance.now(), this.reduced);
    this.invalidate();
  }

  setPointer(): void {
    // the scene listens to the pointer itself (G-05), so the shell's feed is not needed
  }

  onAnchors(cb: (anchors: Record<string, Anchor>) => void): void {
    this.anchorCb = cb;
    this.lastAnchors = null;
    this.invalidate();
  }

  pulse(from?: PulseFrom): void {
    const f = this.formation;
    if (this.reduced || f === "hidden") return;
    let pos: number | null = null;
    if (from && "anchor" in from) {
      if (f === "infinity") pos = this.anchorPos(from.anchor);
    } else if (from) {
      const near = this.nearest(from.x, from.y);
      if (near) pos = this.lattice(near.i);
    }
    pos ??= f === "infinity" ? (this.anchorPos("centre") ?? 0) : CHAIN_COUNT - 1;
    this.pulses.push({ t0: performance.now(), pos, f });
    if (this.pulses.length > WAVE.keep) this.pulses.shift();
    this.invalidate();
  }

  highlight(anchor: string | null): void {
    this.hlPos = anchor === null ? null : this.anchorPos(anchor);
    this.invalidate();
  }

  advance(steps: number): void {
    if (!steps || !Number.isFinite(steps)) return;
    // only whole pitches, so the strip always lands seamlessly
    const n = Math.round(steps);
    if (this.reduced || this.formation !== "chain") this.shiftBase += n;
    else this.bursts.push({ t0: performance.now(), n });
    this.invalidate();
  }

  resize(): void {
    this.measure();
    this.invalidate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopFrame?.();
    this.stopFrame = null;
    clearTimeout(this.wakeTimer);
    this.ac.abort();
    this.observer.disconnect();
    this.endDrag();
    this.setHover(false);
    this.anchorCb = null;
    if (import.meta.env.DEV) {
      const w = window as unknown as { __plates?: { scene: unknown } };
      if (w.__plates?.scene === this) delete w.__plates;
    }
    this.scene.remove(this.mesh);
    this.mesh.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.dispose();
  }

  // ───────── input ─────────

  private listen() {
    const on = { signal: this.ac.signal };
    const passive = { passive: true, signal: this.ac.signal };
    const input = () => (this.lastInput = performance.now());

    addEventListener("pointermove", (e) => this.onPointerMove(e), passive);
    addEventListener("pointerdown", (e) => this.onPointerDown(e), on);
    addEventListener("pointerup", (e) => this.onPointerUp(e), passive);
    addEventListener("pointercancel", (e) => this.onPointerUp(e, true), passive);
    // the pointer left the window: parallax and lift return to rest
    document.addEventListener("pointerout", (e) => !e.relatedTarget && this.pointerGone(), passive);
    addEventListener("blur", () => this.pointerGone(), on);
    addEventListener("keydown", input, passive);
    addEventListener("wheel", input, passive);
    addEventListener("touchstart", input, passive);
    document.addEventListener(
      "scroll",
      () => {
        input();
        if (this.narrow && this.formation === "infinity") this.invalidate();
      },
      { capture: true, passive: true, signal: this.ac.signal },
    );

    // shared signals from the ambient layer and the shell (MOTION-SPEC §4.3)
    addEventListener(
      "rl:idle",
      (e) => {
        const d = (e as CustomEvent<{ idle?: boolean }>).detail;
        this.idleSig = !!d?.idle;
        this.invalidate();
      },
      on,
    );
    addEventListener(
      "rl:paper",
      (e) => {
        const d = (e as CustomEvent<{ x: number; y: number }>).detail;
        this.paperSeen = true;
        if (d && Number.isFinite(d.x) && Number.isFinite(d.y)) this.ripple(d.x, d.y);
      },
      on,
    );
    addEventListener(
      "rl:theme",
      (e) => {
        const d = (e as CustomEvent<{ theme: Theme; origin?: { x: number; y: number } }>).detail;
        if (d?.theme === "light" || d?.theme === "dark") this.cascade(d.theme, d.origin);
      },
      on,
    );

    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) return;
        // waves that were due while hidden do not all fire at once
        if (this.formation === "chain") this.nextWave = performance.now() + between(FLIP.every);
        this.invalidate();
      },
      on,
    );
    const media = () => {
      if (!this.pointerFx()) {
        this.endDrag();
        this.setHover(false);
      }
      this.invalidate();
    };
    this.narrowQ.addEventListener("change", media, on);
    this.fineQ.addEventListener("change", media, on);
    this.canvas.addEventListener(
      "webglcontextlost",
      (e) => {
        e.preventDefault();
        this.stopFrame?.();
        this.stopFrame = null;
      },
      on,
    );
    this.canvas.addEventListener("webglcontextrestored", () => this.invalidate(), on);
  }

  private onPointerMove(e: PointerEvent) {
    this.lastInput = performance.now();
    if (e.pointerType === "touch") return;
    this.px = e.clientX;
    this.py = e.clientY;
    this.pIn = true;
    if (!this.pointerFx()) return;
    if (this.drag) this.dragMove(e);
    else this.hover(e);
    this.invalidate();
  }

  private onPointerDown(e: PointerEvent) {
    this.lastInput = performance.now();
    this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, paper: isPaper(e.target) };
    if (e.button !== 0 || e.pointerType === "touch" || !this.pointerFx() || this.formation !== "infinity" || !this.tap.paper) return;
    const near = this.nearest(e.clientX, e.clientY);
    if (!near || near.d > REACH.band * this.k()) return;
    // the paper under the ∞ is not text: keep the browser from starting a selection
    e.preventDefault();
    // holding stops a coast at once (RhineLabUI); the slide continues from where it is
    if (this.momentum) this.slide = this.momentum.s.value;
    this.momentum = null;
    this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, grab: near.i, samples: [{ v: this.slide, t: e.timeStamp }], lastMotion: -Infinity, dx: 0, dy: 0 };
    // data-plate-hover holds for the whole drag, wherever the pointer goes (§4.3)
    this.setHover(true);
    this.invalidate();
  }

  private onPointerUp(e: PointerEvent, cancelled = false) {
    const tap = this.tap;
    this.tap = null;
    // without the ambient layer's rl:paper, recognise a paper tap here (same rule: < 7 px, < 500 ms)
    if (!cancelled && tap && tap.id === e.pointerId && tap.paper && !this.paperSeen && !document.getElementById("rl-ambient") && isPaper(e.target) && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < DRAG.moved && e.timeStamp - tap.t < 500) {
      const { x, y } = tap;
      // after this event's dispatch: an rl:paper sent for the same tap wins
      setTimeout(() => !this.paperSeen && !this.disposed && this.ripple(x, y), 0);
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    this.release(cancelled ? 0 : this.releaseVelocity(d, e.timeStamp));
  }

  /** Let go of the ∞: coast at the release velocity, or snap to the nearest pitch (G-12). */
  private release(v: number) {
    const d = this.drag;
    this.drag = null;
    if (!d?.active) return;
    delete this.html.dataset.plateDrag;
    this.momentum = { s: { value: this.slide, velocity: v }, target: Math.round(this.slide), coasting: Math.abs(v) >= DRAG.coast };
    this.invalidate();
  }

  private pointerGone() {
    this.pIn = false;
    this.release(0);
    this.setHover(false);
    this.hoverSlot = -1;
    this.invalidate();
  }

  private endDrag() {
    if (this.drag?.active) this.slide = mod(Math.round(this.slide), this.n);
    this.drag = null;
    delete this.html.dataset.plateDrag;
  }

  private setHover(on: boolean) {
    if (on === this.hoverOn) return;
    this.hoverOn = on;
    if (on) this.html.dataset.plateHover = "1";
    else delete this.html.dataset.plateHover;
  }

  /** Hover: the ∞ band shows a grab cursor; a cassette under the pointer starts a flip-wave (G-14). */
  private hover(e: PointerEvent) {
    const paper = isPaper(e.target);
    if (this.formation === "infinity") {
      const near = paper ? this.nearest(e.clientX, e.clientY) : null;
      this.setHover(!!near && near.d <= REACH.band * this.k());
      return;
    }
    this.setHover(false);
    if (this.formation !== "chain") return;
    const near = paper ? this.nearest(e.clientX, e.clientY) : null;
    const slot = near && near.d <= REACH.chain * this.u ? this.chainSlot[near.i] : -1;
    if (slot === this.hoverSlot) return;
    this.hoverSlot = slot;
    const now = performance.now();
    if (slot < 0 || !near || now - this.lastHoverWave < FLIP.hover) return;
    this.lastHoverWave = now;
    this.wave(now, this.lattice(near.i), true);
  }

  /** G-11: a click or tap on the paper ripples the plates nearest to it. */
  private ripple(x: number, y: number) {
    if (this.reduced || this.formation === "hidden") return;
    const near = this.nearest(x, y);
    if (near && near.d <= REACH.ripple * this.k()) this.pulse({ x, y });
  }

  private dragMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG.start) return;
    if (!d.active) {
      d.active = true;
      this.html.dataset.plateDrag = "1";
      getSelection()?.removeAllRanges();
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    // the grabbed plate runs along its own local tangent, wherever the curve takes it
    const map = this.map;
    if (map) {
      const pos = mod(d.grab + this.slide, this.n);
      const a = this.screenOnInf(pos - 0.5, map, this.p);
      const ax = a.x;
      const ay = a.y;
      const b = this.screenOnInf(pos + 0.5, map, this.p);
      const tx = b.x - ax;
      const ty = b.y - ay;
      const l2 = tx * tx + ty * ty;
      if (l2 > 0.25) this.slide += (dx * tx + dy * ty) / l2;
    }
    // velocity estimate (RhineLabUI ArchiveDrag): the last 120 ms, a reversal starts afresh
    const t = e.timeStamp;
    const last = d.samples[d.samples.length - 1];
    if (Math.hypot(dx, dy) > 1e-9) {
      d.lastMotion = t;
      if (dx * d.dx + dy * d.dy < 0 && last) d.samples = [last];
      d.dx = dx;
      d.dy = dy;
    }
    const sample = { v: this.slide, t };
    if (last && last.t === t) d.samples[d.samples.length - 1] = sample;
    else d.samples.push(sample);
    d.samples = d.samples.filter((s) => t - s.t <= DRAG.window).slice(-DRAG.samples);
  }

  private releaseVelocity(d: DragState, time: number): number {
    const first = d.samples[0];
    const last = d.samples[d.samples.length - 1];
    if (!first || !last || time - d.lastMotion > DRAG.still || last.t - first.t < DRAG.span) return 0;
    return ((last.v - first.v) * 1000) / (last.t - first.t);
  }

  // ───────── theme cascade (G-07) ─────────

  /** rl:theme arrives just before the page flips: each plate turns after its own delay from the origin. */
  private cascade(theme: Theme, origin?: { x: number; y: number }) {
    const target = theme === "dark" ? 1 : 0;
    if (target === this.themeTarget) return;
    this.readTheme();
    this.themeTarget = target;
    if (this.reduced) {
      this.themeT0 = -Infinity;
      this.mix.fill(target);
      this.bgMix = target;
      this.invalidate();
      return;
    }
    const now = performance.now();
    const ox = origin?.x ?? this.W / 2;
    const oy = origin?.y ?? this.H / 2;
    const row = THEME.row * this.u;
    const col = THEME.col * this.u;
    this.bgFrom = this.bgMix;
    for (let i = 0; i < MAX; i++) {
      // a reversal starts from each plate's current colour
      this.mixFrom[i] = this.mix[i];
      const x = this.shown[i] ? this.sx[i] : this.W / 2;
      const y = this.shown[i] ? this.sy[i] : this.H / 2;
      this.mixAt[i] = now + Math.min(THEME.cap, (Math.abs(y - oy) / row) * THEME.perRow + (Math.abs(x - ox) / col) * THEME.perCol);
    }
    this.themeT0 = now;
    this.invalidate();
  }

  private themeStep(now: number): boolean {
    const el = now - this.themeT0;
    const target = this.themeTarget;
    if (!(el < THEME_DONE)) {
      // a long frame may jump past the end: land every plate exactly once
      if (this.themeT0 > -Infinity) {
        this.themeT0 = -Infinity;
        this.mix.fill(target);
        this.bgMix = target;
      }
      return false;
    }
    for (let i = 0; i < MAX; i++) this.mix[i] = this.mixFrom[i] + (target - this.mixFrom[i]) * smooth3((now - this.mixAt[i]) / THEME.item);
    this.bgMix = this.bgFrom + (target - this.bgFrom) * easeSmooth(Math.min(1, el / THEME.bg));
    return true;
  }

  // ───────── loop ─────────

  private invalidate() {
    if (this.disposed || document.hidden) return;
    this.dirty = true;
    if (!this.stopFrame) this.stopFrame = onFrame(this.frame);
  }

  private frame = (nowMs: number): boolean => {
    if (this.disposed) return false;
    // one render per display frame, even if the shared loop calls twice with the same timestamp
    if (nowMs === this.lastMs) return true;
    this.dirty = false;
    // real elapsed time: damp() and approach() are exact for any step, and the
    // timed motions (waves, flips, conveyor, theme) read the clock directly
    const dt = this.lastMs ? Math.min(0.25, Math.max(0, (nowMs - this.lastMs) / 1000)) : 0;
    this.lastMs = nowMs;
    const t0 = import.meta.env.DEV ? performance.now() : 0;
    const more = this.step(nowMs, dt);
    this.draw();
    this.emitAnchors(nowMs);
    if (import.meta.env.DEV) {
      this.cost.push(performance.now() - t0);
      if (this.cost.length > 300) this.cost.shift();
    }
    if (more || this.dirty) return true;
    this.stopFrame = null;
    this.lastMs = 0;
    this.sleep(nowMs);
    return false;
  };

  /** Nothing moves: wake for the chain's next flip-wave only. */
  private sleep(now: number) {
    clearTimeout(this.wakeTimer);
    if (this.formation !== "chain" || this.reduced || this.narrow) return;
    let at = this.nextWave;
    for (let j = 0; j < CHAIN_COUNT; j++) if (this.flipStart[j] > now) at = Math.min(at, this.flipStart[j]);
    if (Number.isFinite(at)) this.wakeTimer = window.setTimeout(() => this.invalidate(), Math.max(0, at - now));
  }

  /** Advance the simulation; returns whether another frame is needed. */
  private step(now: number, dt: number): boolean {
    const red = this.reduced;
    const f = this.formation;
    const fx = this.pointerFx() && this.pIn;
    this.map = f === "infinity" ? this.infMap() : null;

    // G-05: the camera leans a little toward the pointer (the PV's ×0.8-per-frame follow)
    const aimYaw = fx ? Math.max(-1, Math.min(1, (this.px / this.W) * 2 - 1)) * 2 * DEG : 0;
    const aimPitch = fx ? Math.max(-1, Math.min(1, 1 - (this.py / this.H) * 2)) * 1.4 * DEG : 0;
    this.yaw = red ? 0 : approach(this.yaw, aimYaw, POINTER_RATE, dt);
    this.pitch = red ? 0 : approach(this.pitch, aimPitch, POINTER_RATE, dt);
    const r = this.D;
    this.camera.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * r, Math.sin(this.pitch) * r, Math.cos(this.yaw) * Math.cos(this.pitch) * r);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();
    this.material.uniforms.uPlaneN.value.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));

    // ambient stays still on phones (§7.8): nothing may keep moving under the bars' backdrop blur
    const still = red || this.narrow;
    if (!still) this.twistT += dt * 1000;
    const idle = this.idleSig ?? now - this.lastInput > IDLE_MS;
    const breathe = !still && f === "infinity" && idle;
    this.breath = red ? 0 : approach(this.breath, breathe ? 1 : 0, breathe ? BREATHE.in : BREATHE.out, dt);
    const breathing = this.breath > 1e-4;

    const coasting = this.stepMomentum(dt);
    this.pulses = this.pulses.filter((p) => now - p.t0 < WAVE.life);
    if (f === "chain" && !red && !this.narrow && now >= this.nextWave) {
      this.wave(now, CHAIN_COUNT, false);
      this.nextWave = now + between(FLIP.every);
    }
    const shift = this.chainShift(now);
    const live = this.fields(now, dt, shift);
    this.targets(now, shift);
    this.integrate(now, dt);
    const theming = this.themeStep(now);

    if (red) return theming;
    const shown = f === "infinity" && !!this.map && !still;
    let flipping = false;
    if (f === "chain") for (let j = 0; j < CHAIN_COUNT; j++) if (now >= this.flipStart[j] && now < this.flipStart[j] + FLIP_TOTAL) flipping = true;
    const leaning = Math.abs(aimYaw - this.yaw) > 1e-5 || Math.abs(aimPitch - this.pitch) > 1e-5;
    return shown || breathing || flipping || leaning || live || coasting || theming || this.settling || this.pulses.length > 0 || this.bursts.length > 0 || !!this.drag;
  }

  /** G-12 release: free coast first, then a short spring to the nearest pitch. */
  private stepMomentum(dt: number): boolean {
    const m = this.momentum;
    if (!m) return false;
    const s = m.s;
    if (m.coasting) {
      const decay = Math.exp(-DRAG.friction * dt);
      s.value += (s.velocity * (1 - decay)) / DRAG.friction;
      s.velocity *= decay;
      if (Math.abs(s.velocity) < DRAG.stop) {
        m.target = Math.round(s.value + s.velocity / DRAG.friction);
        m.coasting = false;
      }
    } else {
      damp(s, m.target, DRAG.snap, dt);
      if (Math.abs(s.value - m.target) < 1e-4 && Math.abs(s.velocity) < 5e-3) {
        this.slide = mod(m.target, this.n);
        this.momentum = null;
        return true;
      }
    }
    this.slide = s.value;
    return true;
  }

  /** The chain's conveyor position in pitches: superposed bell-profile bursts (G-03). */
  private chainShift(now: number): number {
    let shift = this.shiftBase;
    for (let k = this.bursts.length - 1; k >= 0; k--) {
      const b = this.bursts[k];
      const x = (now - b.t0) / CONVEYOR_MS;
      if (x >= 1) {
        this.shiftBase += b.n;
        shift += b.n;
        this.bursts.splice(k, 1);
      } else shift += b.n * easeSmooth(Math.max(0, x));
    }
    return shift;
  }

  /** A flip-wave from lattice position q0 toward the far end, one PV frame per cassette. */
  private wave(now: number, q0: number, fromHover: boolean) {
    const shift = this.chainShift(now);
    for (let j = 0; j < CHAIN_COUNT; j++) {
      const q = mod(j + shift, CHAIN_COUNT);
      if (fromHover && q > q0 + 0.5) continue;
      // a cassette still flipping (or about to) finishes its own turn first
      if (now < this.flipStart[j] + FLIP_TOTAL) continue;
      this.flipStart[j] = now + Math.max(0, q0 - q) * FLIP.lag;
    }
    this.invalidate();
  }

  /** Per-plate live fields: wave height, cursor proximity, callout highlight and their glow. */
  private fields(now: number, dt: number, shift: number): boolean {
    const n = this.n;
    const f = this.formation;
    const red = this.reduced;
    const inf = f === "infinity";
    const near = inf && this.pIn && this.pointerFx();
    const reach = LIFT.prox * this.k();
    let busy = false;
    for (let i = 0; i < n; i++) {
      const pos = f === "hidden" ? null : this.latticeAt(i, shift);
      let h = 0;
      if (pos !== null && this.pulses.length) {
        for (const p of this.pulses) h += selection(inf ? ring(pos, p.pos, n) : Math.abs(pos - p.pos), now - p.t0);
        h = Math.max(-WAVE.clamp, Math.min(WAVE.clamp, h));
      }
      this.height[i] = h;
      let pt = 0;
      if (near && this.shown[i]) {
        const d = Math.hypot(this.sx[i] - this.px, this.sy[i] - this.py) / reach;
        if (d < 1) pt = smooth3(1 - d);
      }
      let ht = 0;
      if (inf && pos !== null && this.hlPos !== null) {
        const d = ring(pos, this.hlPos, n);
        if (d <= LIFT.hlSpan) ht = bell(d, LIFT.hlWidth);
      }
      this.prox[i] = red ? 0 : approach(this.prox[i], pt, LIFT.rate, dt);
      this.hl[i] = red ? 0 : approach(this.hl[i], ht, LIFT.rate, dt);
      if (Math.abs(this.prox[i] - pt) > 1e-3 || Math.abs(this.hl[i] - ht) > 1e-3) busy = true;
      this.glow[i] = Math.min(1, WAVE.glow * Math.abs(h) + LIFT.proxTone * this.prox[i] + LIFT.hlTone * this.hl[i]);
    }
    return busy;
  }

  /** Springs: the shown pose is the target pose plus an offset that decays to zero (G-01). */
  private integrate(now: number, dt: number) {
    const n = this.n;
    const cur = this.cur;
    const tgt = this.tgt;
    if (!this.settling) {
      cur.set(tgt.subarray(0, n * STRIDE));
      return;
    }
    const rate = MORPH.rate;
    const k = 1 - Math.exp(-rate * dt);
    const s = this.spring;
    let busy = false;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const o3 = i * 3;
      const o4 = i * 4;
      const go = now >= this.startAt[i];
      for (let c = 0; c < 3; c++) {
        if (go) {
          s.value = this.offP[o3 + c];
          s.velocity = this.velP[o3 + c];
          damp(s, 0, rate, dt);
          this.offP[o3 + c] = s.value;
          this.velP[o3 + c] = s.velocity;
        }
        cur[o + c] = tgt[o + c] + this.offP[o3 + c];
        // settled within a tenth of a PV pixel
        if (Math.abs(this.offP[o3 + c]) > 5e-3 || Math.abs(this.velP[o3 + c]) > 5e-3) busy = true;
      }
      this.qb.fromArray(this.offQ, o4);
      if (go) {
        this.qb.slerp(IDENTITY, k);
        this.qb.toArray(this.offQ, o4);
      }
      if (1 - Math.abs(this.qb.w) > 1e-7) busy = true;
      this.qa.fromArray(tgt, o + 3).multiply(this.qb).toArray(cur, o + 3);
      for (let c = 0; c < 4; c++) {
        if (go) {
          s.value = this.offA[o4 + c];
          s.velocity = this.velA[o4 + c];
          damp(s, 0, rate, dt);
          this.offA[o4 + c] = s.value;
          this.velA[o4 + c] = s.velocity;
        }
        cur[o + 7 + c] = tgt[o + 7 + c] + this.offA[o4 + c];
        if (Math.abs(this.offA[o4 + c]) > 1e-3 || Math.abs(this.velA[o4 + c]) > 1e-3) busy = true;
      }
      // a spring with velocity may cross zero: scale, fade and tube stay in range
      cur[o + 7] = Math.max(0, cur[o + 7]);
      cur[o + 8] = Math.min(1, Math.max(0, cur[o + 8]));
      cur[o + 9] = Math.min(1, Math.max(0, cur[o + 9]));
      if (!go) busy = true;
    }
    if (!busy) {
      this.zeroOffsets();
      this.settling = false;
      cur.set(tgt.subarray(0, n * STRIDE));
    }
  }

  private zeroOffsets() {
    this.offP.fill(0);
    this.velP.fill(0);
    this.offA.fill(0);
    this.velA.fill(0);
    for (let i = 0; i < MAX; i++) {
      const o = i * 4;
      this.offQ[o] = this.offQ[o + 1] = this.offQ[o + 2] = 0;
      this.offQ[o + 3] = 1;
    }
  }

  /** New targets: every plate keeps its shown pose (and velocity) as an offset that springs home. */
  private retarget(now: number, instant: boolean) {
    this.targets(now, this.chainShift(now));
    const n = this.n;
    if (instant) {
      this.zeroOffsets();
      this.settling = false;
      this.cur.set(this.tgt.subarray(0, n * STRIDE));
      return;
    }
    const cur = this.cur;
    const tgt = this.tgt;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const o3 = i * 3;
      const o4 = i * 4;
      let speed = 0;
      for (let c = 0; c < 3; c++) {
        this.offP[o3 + c] = cur[o + c] - tgt[o + c];
        speed = Math.max(speed, Math.abs(this.velP[o3 + c]));
      }
      this.qa.fromArray(tgt, o + 3).invert().multiply(this.qb.fromArray(cur, o + 3));
      // shortest way home
      if (this.qa.w < 0) this.qa.set(-this.qa.x, -this.qa.y, -this.qa.z, -this.qa.w);
      this.qa.toArray(this.offQ, o4);
      for (let c = 0; c < 4; c++) {
        this.offA[o4 + c] = cur[o + 7 + c] - tgt[o + 7 + c];
        speed = Math.max(speed, Math.abs(this.velA[o4 + c]));
      }
      // plates at rest leave in order; a plate still in flight turns at once, keeping its velocity
      this.startAt[i] = speed < 1e-2 ? now + this.order[i] * MORPH.stagger : now;
    }
    this.settling = true;
  }

  /** Sort back to front, skip invisible plates, upload; remember where each plate landed on screen. */
  private draw() {
    const n = this.n;
    const cam = this.camera.position;
    this.fwd.copy(cam).negate().normalize();
    const vis: number[] = this.idx;
    vis.length = 0;
    this.shown.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      if (this.cur[o + 7] < 1e-3 || this.cur[o + 8] < 3e-3) continue;
      this.depth[i] = (this.cur[o] - cam.x) * this.fwd.x + (this.cur[o + 1] - cam.y) * this.fwd.y + (this.cur[o + 2] - cam.z) * this.fwd.z;
      vis.push(i);
    }
    vis.sort((a, b) => this.depth[b] - this.depth[a]);
    const mat = this.mesh.instanceMatrix.array as Float32Array;
    const att = this.inst.array as Float32Array;
    const att2 = this.inst2.array as Float32Array;
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
      att2[k * 4] = this.axis[i * 3];
      att2[k * 4 + 1] = this.axis[i * 3 + 1];
      att2[k * 4 + 2] = this.axis[i * 3 + 2];
      att2[k * 4 + 3] = this.mix[i];
      // only plates clearly on stage take part in hit tests (lift, drag, ripples, hover)
      if (this.cur[o + 8] > 0.3 && this.cur[o + 7] > 0.3) {
        this.p.project(this.camera);
        this.sx[i] = (this.p.x + 1) * 0.5 * this.W;
        this.sy[i] = (1 - this.p.y) * 0.5 * this.H;
        this.shown[i] = 1;
      }
    }
    this.mesh.count = vis.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.inst.needsUpdate = true;
    this.inst2.needsUpdate = true;
    this.material.uniforms.uBgMix.value = this.bgMix;
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

  /** A plate's place on its formation's lattice, in pitches (null when it has none). */
  private latticeAt(i: number, shift: number): number | null {
    if (this.formation === "infinity") return mod(i + this.slide, this.n);
    if (this.formation === "chain") {
      const j = this.chainSlot[i];
      return j >= 0 ? mod(j + shift, CHAIN_COUNT) : null;
    }
    return null;
  }

  private lattice(i: number): number {
    return this.latticeAt(i, this.chainShift(performance.now())) ?? 0;
  }

  /** An ∞ anchor's place on the plate lattice. */
  private anchorPos(id: string): number | null {
    if (!Object.hasOwn(ANCHOR_T, id)) return null;
    return this.inf.sAt(ANCHOR_T[id]) * this.n;
  }

  /** Scale of the figure on screen (CSS px per PV px): the ∞'s own box on phones. */
  private k(): number {
    return this.formation === "infinity" && this.map ? this.map.k : this.u;
  }

  /** The visible plate whose projected centre is nearest to a viewport point. */
  private nearest(x: number, y: number): { i: number; d: number } | null {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      if (!this.shown[i]) continue;
      const d = Math.hypot(this.sx[i] - x, this.sy[i] - y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best < 0 ? null : { i: best, d: bd };
  }

  private targets(now: number, shift = this.chainShift(now)) {
    const n = this.n;
    const f = this.formation;
    if (f === "infinity") {
      const map = this.map ?? this.infMap();
      for (let i = 0; i < n; i++) {
        if (map) this.infPose(i, map, now);
        else this.hiddenPose(i, this.tgt);
      }
    } else if (f === "chain" && !this.narrow) {
      for (let i = 0; i < n; i++) {
        const j = this.chainSlot[i];
        if (j >= 0) this.chainPose(i, j, shift, now);
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

  /** The centreline at lattice position pos, projected to the viewport. */
  private screenOnInf(pos: number, map: FrameMap, out: Vector3): Vector3 {
    this.infPoint(this.inf.tAt(mod(pos, this.n) / this.n), map, out).project(this.camera);
    return out.set((out.x + 1) * 0.5 * this.W, (1 - out.y) * 0.5 * this.H, 0);
  }

  private infPose(i: number, map: FrameMap, now: number) {
    const n = this.n;
    const pos = mod(i + this.slide, n);
    const t = this.inf.tAt(pos / n);
    this.infPoint(t, map, this.p);
    this.infPoint(t + 2e-3, map, this.p2);
    this.T.subVectors(this.p2, this.p).normalize();
    this.B.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));
    const sc = (map.k / this.u) * LOOK.scale;
    // breathing, waves, the cursor and a callout's highlight all lift along the figure's normal
    const lift = this.breathAt(i, now) + this.height[i] + LIFT.height * (this.prox[i] + this.hl[i]);
    this.fin(i, LOOK.lean * DEG, LOOK.roll * DEG, lift * sc);
    // G-02: each fin turns in place about the ribbon, one turn per loop, its phase set by its place
    this.q.premultiply(this.q2.setFromAxisAngle(this.T, 2 * Math.PI * (this.twistT / TWIST_MS - i / n)));
    this.write(i, this.tgt);
    // the strand that passes in front at the crossing reads darker, as in the PV
    const c = Math.cos(t);
    this.attrs(i, this.tgt, sc, 1, 1, 1 - LOOK.strand * Math.max(0, Math.sin(t)) - LOOK.cross * Math.exp(-(c * c) / 0.03));
  }

  /** G-02 idle breathing (RhineLabUI idleWave at 1.1×), neighbours slightly out of phase. */
  private breathAt(i: number, now: number): number {
    if (this.breath < 1e-4) return 0;
    const k = 220 / this.n;
    return this.breath * (0.075 * Math.sin((2 * Math.PI * now) / BREATHE.p1 + i * 0.3 * k) + 0.027 * Math.sin((2 * Math.PI * now) / BREATHE.p2 - i * 0.17 * k));
  }

  private chainPose(i: number, j: number, shift: number, now: number) {
    const s = mod(j + shift, CHAIN_COUNT) / CHAIN_COUNT;
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
    const flip = this.reduced ? 0 : flipAt(now - this.flipStart[j]);
    this.fin(i, lean + FLIP.lean * flip, LOOK.cRoll * DEG - a * LOOK.cUpright, this.height[i] * LOOK.cScale);
    // G-03: the flip-wave twists each cassette about the chain into a face-on arc
    if (flip) this.q.premultiply(this.q2.setFromAxisAngle(this.T, FLIP.twist * flip));
    this.write(i, this.tgt);
    this.attrs(i, this.tgt, LOOK.cScale, fade, 0, 1);
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
   * Leaves the pose in this.p / this.q and the untwisted across-axis in axis[i].
   */
  private fin(i: number, lean: number, roll: number, lift: number) {
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
    this.sv.copy(X_AXIS).applyQuaternion(this.q).toArray(this.axis, i * 3);
  }

  private write(i: number, out: Float32Array) {
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
    const t = this.inf.tAt(i / this.n);
    this.infPoint(t, map, this.p);
    this.infPoint(t + 2e-3, map, this.p2);
    this.T.subVectors(this.p2, this.p).normalize();
    this.B.set(0, Math.sin(LOOK.tilt * DEG), Math.cos(LOOK.tilt * DEG));
    const f = (this.D - HIDE_Z) / (this.D - this.p.z);
    this.p.set(this.p.x * f, this.p.y * f, HIDE_Z);
    this.fin(i, LOOK.lean * DEG, LOOK.roll * DEG, 0);
    this.write(i, out);
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

  /** The shown theme's page background, remembered per theme so a cascade can blend the two. */
  private readTheme() {
    const shown: Theme = this.html.dataset.theme === "dark" ? "dark" : "light";
    const cs = getComputedStyle(this.html);
    const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
    const bg = v("--bg", BACKDROP[shown].bg);
    this.backdrop[shown] = { hi: v("--bg-hi", bg), bg, lo: v("--bg-lo", bg) };
    applyPalettes(this.material, this.backdrop);
  }

  private emitAnchors(now: number) {
    const cb = this.anchorCb;
    if (!cb) return;
    const map = this.formation === "infinity" ? this.map : null;
    // the leaders appear once every plate is on its way in
    const visible = !!map && now - this.morphT0 >= MORPH.stagger;
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
