// The shared motion kernel (MOTION-SPEC §2): the 1.1× clock, the house
// easings, springs, measured tracks, one frame loop that sleeps with the tab,
// timelines, and the PV's text and marker effects. Every area imports its
// timing from here. It imports nothing, never touches `document` at load
// without a guard, and stays out of the lazy three.js chunk's way.

// ───────── 1.1× clock (PV-MOTION-ATLAS §0.2, Appendix B) ─────────

/** One PV frame at 1.1×: every stepped effect advances on this. */
export const TICK = 1000 / 27.5;
/** PV frames → ms at 1.1×. */
export const F = (frames: number): number => frames * TICK;
/** A RhineLabUI duration (ms) → ours at 1.1×. */
export const RL = (ms: number): number => ms / 1.1;
/** A RhineLabUI rate (1/s, e.g. a damp() rate) → ours at 1.1×. */
export const RLRATE = (perSecond: number): number => perSecond * 1.1;
/** A per-frame decay ratio r → time constant in ms. */
export const tauMs = (r: number): number => -TICK / Math.log(r);
/** Round a computed delay up to the next PV frame boundary (cuts land on frames). */
export const onTick = (ms: number): number => Math.ceil(ms / TICK - 1e-6) * TICK;
/** The interactive decryption plays PV time this many times faster (RhineLabUI 1.5 × our 1.1). */
export const DECRYPT_RATE = 1.65;
/** RhineLabUI's idle threshold, 2.5 s ÷ 1.1. */
export const IDLE_MS = 2500 / 1.1;
/** Pointer smoothing for every parallax layer (atlas: ×0.8 per tick). */
export const POINTER_TAU_MS = 163;

/** The phone/tablet flow, identical to tokens.css and app.css. */
export const PHONE_QUERY = "(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 539px), (pointer: coarse) and (max-width: 1400px)";
/** Pointer effects (lamp, parallax, proximity) only run for a precise hovering pointer. */
export const FINE_QUERY = "(hover: hover) and (pointer: fine)";
/** CSS px per PV px (the JS twin of var(--u)). */
export function unit(): number {
  if (typeof matchMedia === "undefined") return 1;
  return matchMedia(PHONE_QUERY).matches ? 0.5 : Math.min(innerWidth / 1920, innerHeight / 1080);
}

// ───────── easing (atlas §0.5 house family + RhineLabUI surfaces) ─────────

export type Bezier = readonly [number, number, number, number];
export const EASE = {
  hud: [0.2, 0.25, 0, 1],
  dock: [0.22, 0, 0.05, 1],
  draw: [0.3, 0, 0, 1],
  expo: [0.16, 1, 0.3, 1],
  pop: [0.15, 0.6, 0.35, 1],
  swap: [0.65, 0, 0.25, 1],
  sweep: [0.15, 0, 0.4, 1],
  inFade: [0.11, 0, 0.5, 0],
  clear: [0.25, 0.45, 0.45, 0.95],
  exit: [0.7, 0, 0.84, 0],
  recede: [0.75, 0, 0.8, 1],
  wipe: [0.2, 0, 0.15, 0.9],
  collapse: [0.35, 0.1, 0.35, 0.9],
  drop: [0.1, 0, 0.2, 1],
  box: [0.3, 0.2, 0.1, 1],
  marquee: [0.4, 0.1, 0.1, 1],
  bar: [0.1, 0.3, 0.25, 1],
  quart: [0.25, 1, 0.5, 1],
  cubicOut: [0.33, 1, 0.68, 1],
  inCubic: [0.32, 0, 0.67, 0],
  smooth: [0.45, 0, 0.55, 1],
  enter: [0.22, 1, 0.36, 1],
  leave: [0.4, 0, 1, 1],
} as const satisfies Record<string, Bezier>;
export type EaseName = keyof typeof EASE;

/** cubic-bezier(x1, y1, x2, y2) as a function of progress (Newton, then bisection). */
export function cubic([x1, y1, x2, y2]: Bezier): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const e = X(s) - x;
      if (Math.abs(e) < 1e-7) return Y(s);
      const d = dX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= e / d;
      if (s < 0 || s > 1) break;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 30; i++) {
      const v = X(s);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return Y(s);
  };
}

const easeCache = new Map<EaseName, (x: number) => number>();
export function ease(name: EaseName): (x: number) => number {
  let f = easeCache.get(name);
  if (!f) {
    f = cubic(EASE[name]);
    easeCache.set(name, f);
  }
  return f;
}
/** The same curve as a CSS string, for WAAPI `easing`. */
export const cssEase = (name: EaseName): string => `cubic-bezier(${EASE[name].join(", ")})`;
export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const smooth3 = (x: number): number => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** RhineLabUI's quintic smootherstep (motion.ts `smooth`). */
export const smooth5 = (x: number): number => {
  const t = clamp01(x);
  return t * t * t * (10 + t * (-15 + 6 * t));
};

// ───────── springs (RhineLabUI motion.ts) ─────────

export type Spring = { value: number; velocity: number };
/** Critically damped step toward target, exact for any dt; velocity is kept, so a
 *  retarget mid-flight never jumps. dt in seconds, rate in 1/s (use RLRATE()). */
export function damp(s: Spring, target: number, rate: number, dt: number): void {
  const delta = s.value - target;
  const impulse = s.velocity + rate * delta;
  const decay = Math.exp(-rate * dt);
  s.value = target + (delta + impulse * dt) * decay;
  s.velocity = (s.velocity - rate * impulse * dt) * decay;
}
/** First-order approach (RhineLabUI's `lerp(v, t, 1 - exp(-dt*k))`). */
export const approach = (value: number, target: number, rate: number, dt: number): number => target + (value - target) * Math.exp(-rate * dt);
/** Pointer smoothing shared by every parallax layer. */
export const POINTER_RATE = 1000 / POINTER_TAU_MS;

// ───────── measured tracks (RhineLabUI decryption.ts) ─────────

export type Knot = readonly [number, number];
/** Monotone cubic Hermite through measured knots: no overshoot, zero end velocity. */
export function sampleCurve(knots: readonly Knot[], time: number): number {
  if (time <= knots[0][0]) return knots[0][1];
  if (time >= knots[knots.length - 1][0]) return knots[knots.length - 1][1];
  const secant = (i: number) => (knots[i + 1][1] - knots[i][1]) / (knots[i + 1][0] - knots[i][0]);
  const slope = (i: number) => {
    if (i === 0 || i === knots.length - 1) return 0;
    const a = secant(i - 1);
    const b = secant(i);
    if (a * b <= 0) return 0;
    const left = knots[i][0] - knots[i - 1][0];
    const right = knots[i + 1][0] - knots[i][0];
    const w1 = 2 * right + left;
    const w2 = right + 2 * left;
    return (w1 + w2) / (w1 / a + w2 / b);
  };
  let i = 0;
  while (time > knots[i + 1][0]) i++;
  const span = knots[i + 1][0] - knots[i][0];
  const t = (time - knots[i][0]) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * knots[i][1] + (t3 - 2 * t2 + t) * span * slope(i) + (-2 * t3 + 3 * t2) * knots[i + 1][1] + (t3 - t2) * span * slope(i + 1);
}

// ───────── stepped sequences: one value per TICK (atlas Appendix B) ─────────

export const SEQ = {
  stutterOn: [1, 0.18, 0.62, 0.09, 1, 0.48, 1], // D1 / F1 marker stutter
  stutterOut: [0.18, 0.62, 0.08, 1, 0.48, 1, 0], // D2
  stutterOutSync: [0.15, 0.55, 0.05, 1, 0], // D2, all together
  markerIdle: [0, 1, 0.15, 0.6, 0.07, 1, 0.4, 1], // D3
  labelFlicker: [0.4, 0.8, 1, 0.5, 0.4, 0.8, 1, 0.8, 0.5, 0.5, 0.5, 0.75, 1], // F2
  logoStamp: [1, 0.25, 0.75, 0.1, 1, 0.55, 1, 0.1, 1], // F3
  doubleBlink: [0, 0, 0, 1, 1, 1, 0, 0, 0, 1], // F4
  flickerTwos: [1, 1, 0, 0, 1, 1, 0.55, 0.55, 1], // F6
  capBlink: [0.8, 0.14, 0.57, 0.05, 0.85, 0.42, 0.87, 0, 0.89, 1], // F10 end cap
  popSquareExit: [0, 1, 1, 0, 1, 1, 0], // S6 exit
  ledBlink: [1, 1, 1, 0, 0, 0], // contact LED, 3 on / 3 off, loops
} as const satisfies Record<string, readonly number[]>;

// ───────── one shared frame loop ─────────

export type Cancel = () => void;
type FrameFn = (nowMs: number, dtSec: number) => boolean | void;
const frameFns = new Set<FrameFn>();
let frameId = 0;
let lastFrame = 0;
const pump = (now: number) => {
  // -1 = "this loop is running": an onFrame() from inside a callback joins it instead of
  // requesting a second rAF (each nested call used to add one permanent extra loop)
  frameId = -1;
  const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
  lastFrame = now;
  for (const fn of [...frameFns]) {
    // one failing effect must not stop every other one (it is dropped and reported)
    try {
      if (fn(now, dt) === false) frameFns.delete(fn);
    } catch (e) {
      frameFns.delete(fn);
      console.error(e);
    }
  }
  frameId = frameFns.size && !document.hidden ? requestAnimationFrame(pump) : 0;
  if (!frameId) lastFrame = 0;
};
/** Every continuous JS effect runs here. Stops while the tab is hidden or nobody listens.
 *  Return false from fn to unsubscribe. */
export function onFrame(fn: FrameFn): Cancel {
  frameFns.add(fn);
  if (!frameId && !document.hidden) frameId = requestAnimationFrame(pump);
  return () => {
    frameFns.delete(fn);
  };
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && frameFns.size && !frameId) frameId = requestAnimationFrame(pump);
  });
}

/** Plays a stepped sequence (never tweened). Cancel jumps to the last value. */
export function stepped(seq: readonly number[], apply: (v: number, i: number) => void, o: { delay?: number; instant?: boolean; loop?: boolean; done?: () => void } = {}): Cancel {
  const last = seq.length - 1;
  if (last < 0) return () => {};
  if (o.instant) {
    apply(seq[last], last);
    o.done?.();
    return () => {};
  }
  const t0 = performance.now() + (o.delay ?? 0);
  let i = -1;
  const stop = onFrame((now) => {
    const k = Math.floor((now - t0) / TICK);
    if (k < 0) return;
    const j = o.loop ? k % seq.length : Math.min(last, k);
    if (j !== i) {
      i = j;
      apply(seq[j], j);
    }
    if (!o.loop && j === last) {
      o.done?.();
      return false;
    }
  });
  return () => {
    stop();
    if (i !== last) {
      apply(seq[last], last);
      o.done?.();
    }
  };
}

/** "Paper": a pointer target that is not content or a control (B's halo, C's ripple and drag). */
export function isPaper(t: EventTarget | null): boolean {
  if (!(t instanceof Element)) return true;
  return !t.closest('a, button, input, textarea, select, label, summary, [role="tab"], [role="slider"], [role="radio"], [tabindex]:not(.screen), .sect__glass, .sect__tile, .chrome, .rail, .home__co, .home__centre, .home__id, .toast, [data-no-paper]');
}

// ───────── exact PV tracks for WAAPI (the same text as tokens.css §3.2) ─────────

/** WAAPI cannot read CSS variables, so the measured `linear()` curves live here too. */
export const TRACK = {
  c3: "linear(0, 0.056 7.1%, 0.268 14.3%, 0.494 21.4%, 0.638 28.6%, 0.736 35.7%, 0.807 42.9%, 0.864 50%, 0.907 57.1%, 0.94 64.3%, 0.964 71.4%, 0.98 78.6%, 0.992 85.7%, 0.998 92.9%, 1)",
  h1: "linear(0, 0.077 4.3%, 0.226 8.7%, 0.389 13%, 0.509 17.4%, 0.598 21.7%, 0.667 26.1%, 0.722 30.4%, 0.769 34.8%, 0.808 39.1%, 0.838 43.5%, 0.868 47.8%, 0.889 52.2%, 0.91 56.5%, 0.927 60.9%, 0.944 65.2%, 0.957 69.6%, 0.966 73.9%, 0.974 78.3%, 0.983 82.6%, 0.987 87%, 0.996 91.3%, 0.996 95.7%, 1)",
  p1: "linear(0, 0.04 6.7%, 0.062 13.3%, 0.085 20%, 0.108 26.7%, 0.13 33.3%, 0.185 40%, 0.24 46.7%, 0.3 53.3%, 0.38 60%, 0.46 66.7%, 0.57 73.3%, 0.66 80%, 0.82 86.7%, 0.98 93.3%, 1)",
  p4: "linear(0, 0.08 7.7%, 0.28 15.4%, 0.48 23.1%, 0.6 30.8%, 0.72 38.5%, 0.78 46.2%, 0.83 53.8%, 0.89 61.5%, 0.94 69.2%, 0.96 76.9%, 0.97 84.6%, 0.99 92.3%, 1)",
  b3: "linear(0, 0.007 4.3%, 0.026 8.7%, 0.072 13%, 0.17 17.4%, 0.32 21.7%, 0.471 26.1%, 0.582 30.4%, 0.667 34.8%, 0.725 39.1%, 0.778 43.5%, 0.817 47.8%, 0.85 52.2%, 0.882 56.5%, 0.902 60.9%, 0.922 65.2%, 0.941 69.6%, 0.954 73.9%, 0.967 78.3%, 0.974 82.6%, 0.987 87%, 0.987 91.3%, 0.993 95.7%, 1)",
  l2: "linear(0, 0.208 5.6%, 0.364 11.1%, 0.487 16.7%, 0.58 22.2%, 0.658 27.8%, 0.725 33.3%, 0.777 38.9%, 0.822 44.4%, 0.859 50%, 0.892 55.6%, 0.918 61.1%, 0.941 66.7%, 0.955 72.2%, 0.97 77.8%, 0.981 83.3%, 0.989 88.9%, 0.996 94.4%, 1)",
  exp: "linear(0, 0.252 6.2%, 0.442 12.5%, 0.584 18.8%, 0.69 25%, 0.77 31.2%, 0.83 37.5%, 0.875 43.8%, 0.909 50%, 0.934 56.2%, 0.953 62.5%, 0.967 68.8%, 0.978 75%, 0.986 81.2%, 0.992 87.5%, 0.997 93.8%, 1)",
} as const;
export type TrackName = keyof typeof TRACK;

/** A house easing, a measured track, or any raw CSS easing → the WAAPI string. */
export function easing(e: EaseName | TrackName | string | undefined): string {
  if (!e) return "linear";
  if (e in TRACK) return TRACK[e as TrackName];
  if (e in EASE) return cssEase(e as EaseName);
  return e;
}

// ───────── timelines (§2.2) ─────────

export interface Timeline {
  /** performance.now() at creation. */
  readonly t0: number;
  /** fn at t0 + onTick(ms). */
  at(ms: number, fn: () => void): Timeline;
  play(el: Element, frames: Keyframe[], o: { at: number; dur: number; ease?: EaseName | TrackName | string; fill?: FillMode; composite?: CompositeOperation }): Animation;
  /** Pending at() fns run now, in time order; every animation .finish()es. */
  finish(): void;
  /** Drop pending fns; cancel animations (elements fall back to CSS). */
  cancel(): void;
  /** Drop pending fns and freeze every animation where it is (an overtaken entry); cancel() later. */
  pause(): void;
}

/** One choreography: tick-aligned cues plus WAAPI animations on the same clock. */
export function timeline(): Timeline {
  const t0 = performance.now();
  const cues: { at: number; fn: () => void; seq: number }[] = [];
  const anims: Animation[] = [];
  let seq = 0;
  let stop: Cancel | null = null;
  let dead = false;
  const run = (now: number) => {
    // cues may add cues, so always take the earliest due one
    for (;;) {
      let k = -1;
      for (let i = 0; i < cues.length; i++) if (t0 + cues[i].at <= now && (k < 0 || cues[i].at < cues[k].at || (cues[i].at === cues[k].at && cues[i].seq < cues[k].seq))) k = i;
      if (k < 0) break;
      const [c] = cues.splice(k, 1);
      c.fn();
      if (dead) return false;
    }
    if (!cues.length) {
      stop = null;
      return false;
    }
  };
  const tl: Timeline = {
    t0,
    at(ms, fn) {
      if (dead) return tl;
      cues.push({ at: onTick(Math.max(0, ms)), fn, seq: seq++ });
      // a cue that is already due runs on the next frame, never synchronously
      if (!stop) stop = onFrame(run);
      return tl;
    },
    play(el, frames, o) {
      const a = el.animate(frames, {
        duration: Math.max(0, o.dur),
        easing: easing(o.ease),
        fill: o.fill ?? "both",
        composite: o.composite ?? "replace",
      });
      // pinned to the choreography's clock (the document timeline shares performance.now()'s
      // origin): a late call joins mid-flight, an early one holds its first keyframe
      a.startTime = t0 + o.at;
      if (dead) a.finish();
      else anims.push(a);
      return a;
    },
    finish() {
      if (dead) return;
      // a cue may schedule more cues or animations: drain until nothing is left
      for (let guard = 0; cues.length && guard < 500; guard++) {
        cues.sort((a, b) => a.at - b.at || a.seq - b.seq);
        const c = cues.shift();
        c?.fn();
      }
      stop?.();
      stop = null;
      for (const a of anims) {
        try {
          a.finish();
        } catch {
          /* infinite animations cannot finish; they are left running */
        }
      }
    },
    cancel() {
      dead = true;
      cues.length = 0;
      stop?.();
      stop = null;
      for (const a of anims) a.cancel();
      anims.length = 0;
    },
    pause() {
      dead = true;
      cues.length = 0;
      stop?.();
      stop = null;
      for (const a of anims) a.pause();
    },
  };
  return tl;
}

// ───────── text effects (§2.3) ─────────

/** Reduced motion (settings or OS, mirrored by the shell): every effect lands on its final state. */
const reducedNow = (): boolean => typeof document !== "undefined" && document.documentElement.dataset.motion === "reduced";

// One running typing run per element: a newer call takes over from what is shown.
type Run = { halt: () => void };
const runs = new WeakMap<Element, Run>();
const claim = (el: Element, run: Run) => {
  const prev = runs.get(el);
  runs.set(el, run);
  if (prev && prev !== run) prev.halt();
};
const release = (el: Element, run: Run) => {
  if (runs.get(el) === run) runs.delete(el);
};

/** Deterministic PRNG seeded by the text, so a string always types with the same rhythm. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let s = h >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Characters shown after each frame (index k = after frame k + 1). */
function typingPlan(chars: string[], o: { cps?: number; fixed?: number; pv?: boolean }): number[] {
  const n = chars.length;
  const plan: number[] = [];
  if (!n) return plan;
  if (o.fixed !== undefined) {
    // T1c: the whole string in a fixed time, linear, still advancing on frames
    const ticks = Math.max(1, Math.round(o.fixed / TICK));
    for (let k = 1; k <= ticks; k++) plan.push(Math.round((n * k) / ticks));
    return plan;
  }
  const rate = Math.max(0.05, (o.cps ?? 27.5) / 27.5);
  if (o.pv === false) {
    for (let k = 1; ; k++) {
      const c = Math.min(n, Math.floor(rate * k + 1e-9));
      plan.push(c);
      if (c >= n) return plan;
    }
  }
  // T1: 0–3 chars a frame, irregular; spaces come free; the last 3 hold 2 frames each
  const rnd = seeded(chars.join(""));
  const isSpace = (i: number) => /\s/.test(chars[i] ?? "");
  let tail = n;
  for (let i = n - 1, left = 3; i >= 0 && left > 0 && n > 3; i--) {
    if (!isSpace(i)) left--;
    if (left === 0) tail = i;
  }
  let c = 0;
  let budget = 0;
  let hold = false;
  while (c < n) {
    if (c >= tail) {
      hold = !hold;
      if (!hold) c++;
    } else {
      budget += rate * (0.35 + 1.3 * rnd());
      let emit = Math.min(3, Math.floor(budget));
      budget -= emit;
      while (emit-- > 0 && c < tail) c++;
    }
    while (c < n && isSpace(c)) c++;
    plan.push(c);
  }
  return plan;
}

/** The frame-driven part of typing; the caller owns the element (claim). */
function runTyping(el: HTMLElement, text: string, o: { cps?: number; fixed?: number; delay?: number; pv?: boolean; done?: () => void }): { halt: () => void; cancel: Cancel } {
  const chars = [...text];
  const plan = typingPlan(chars, o);
  const t0 = performance.now() + (o.delay ?? 0);
  let shown = -1;
  const show = (n: number) => {
    if (n === shown) return;
    shown = n;
    el.textContent = n >= chars.length ? text : chars.slice(0, n).join("");
  };
  show(0);
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    show(chars.length);
    o.done?.();
  };
  const halt = onFrame((now) => {
    const k = Math.floor((now - t0) / TICK);
    if (k < 0) return;
    if (k >= plan.length) {
      end();
      return false;
    }
    show(plan[k]);
  });
  return {
    halt,
    cancel: () => {
      halt();
      end();
    },
  };
}

/** T1: the string grows from a fixed left edge, whole glyphs, no cursor. */
export function typeText(el: HTMLElement, text: string, o: { cps?: number; fixed?: number; delay?: number; instant?: boolean; pv?: boolean; done?: () => void } = {}): Cancel {
  const run: Run = { halt: () => {} };
  claim(el, run);
  if (o.instant || reducedNow()) {
    release(el, run);
    el.textContent = text;
    o.done?.();
    return () => {};
  }
  const t = runTyping(el, text, { ...o, done: () => (release(el, run), o.done?.()) });
  run.halt = t.halt;
  return t.cancel;
}

/** T3 + N6: the line clears in one frame, stays blank two, then retypes at 1.4 chars a frame. */
export function retype(el: HTMLElement, text: string, o: { delay?: number; instant?: boolean; done?: () => void } = {}): Cancel {
  // a run in progress stops where it is, so the clear starts from the partial text
  const run: Run = { halt: () => {} };
  claim(el, run);
  if (o.instant || reducedNow()) {
    release(el, run);
    el.textContent = text;
    o.done?.();
    return () => {};
  }
  const delay = o.delay ?? 0;
  let typer: ReturnType<typeof runTyping> | null = null;
  let ended = false;
  const finish = () => {
    if (ended) return;
    ended = true;
    release(el, run);
    o.done?.();
  };
  const tl = timeline();
  tl.at(delay + TICK, () => {
    el.textContent = "";
  });
  tl.at(delay + 3 * TICK, () => {
    typer = runTyping(el, text, { cps: 1.4 * 27.5, done: finish });
  });
  run.halt = () => {
    tl.cancel();
    typer?.halt();
  };
  return () => {
    tl.cancel();
    if (typer) typer.cancel();
    else el.textContent = text;
    finish();
  };
}

const swaps = new WeakMap<Element, Cancel>();

/** Right inset (0–100) of a clip-path: inset(...) as currently painted. */
function clipRight(el: Element): number {
  const m = /inset\(\s*[^\s)]+\s+([\d.]+)%/.exec(getComputedStyle(el).clipPath);
  return m ? Number(m[1]) : 0;
}

/** T8: a hard-edged clip wipe. Slow: erase R→L 8 frames, 1 empty, reveal L→R 6 (545 ms). Fast: 3 + 4 (255 ms). */
export function swapLabel(el: HTMLElement, text: string, o: { speed?: "fast" | "slow"; instant?: boolean } = {}): Cancel {
  // restart from what is painted: an erase in flight continues from its edge
  const from = swaps.has(el) ? clipRight(el) : 0;
  swaps.get(el)?.();
  const stopAnims = () => {
    for (const a of el.getAnimations()) if (a.id === "rl-swap") a.cancel();
  };
  stopAnims();
  if (o.instant || reducedNow() || (el.textContent === text && from === 0)) {
    el.textContent = text;
    swaps.delete(el);
    return () => {};
  }
  const slow = o.speed === "slow";
  const erase = (slow ? 8 : 3) * TICK * (1 - from / 100);
  const gap = slow ? TICK : 0;
  const reveal = (slow ? 6 : 4) * TICK;
  const tl = timeline();
  const a = tl.play(el, [{ clipPath: `inset(0 ${from}% 0 0)` }, { clipPath: "inset(0 100% 0 0)" }], { at: 0, dur: erase, ease: "linear" });
  a.id = "rl-swap";
  tl.at(erase + gap, () => {
    el.textContent = text;
    const b = tl.play(el, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { at: onTick(erase + gap), dur: reveal, ease: "linear", fill: "backwards" });
    b.id = "rl-swap";
    a.cancel();
  });
  tl.at(erase + gap + reveal, () => {
    stopAnims();
    swaps.delete(el);
  });
  const cancel = () => {
    tl.cancel();
    stopAnims();
    el.textContent = text;
    swaps.delete(el);
  };
  swaps.set(el, cancel);
  return cancel;
}

/** T7c (from left) / T7d (from right): the value slides out of a clip at its own edge. */
export function maskSlide(el: HTMLElement, o: { from?: "left" | "right"; dur?: number; delay?: number; instant?: boolean } = {}): Cancel {
  let inner = el.firstElementChild instanceof HTMLElement && el.firstElementChild.classList.contains("mslide") ? el.firstElementChild : null;
  if (o.instant || reducedNow()) {
    inner?.getAnimations().forEach((a) => a.cancel());
    el.classList.remove("is-mslide");
    return () => {};
  }
  if (!inner) {
    inner = document.createElement("span");
    inner.className = "mslide";
    inner.append(...el.childNodes);
    el.append(inner);
    // a transform needs a box: an inline host becomes inline-block (same line box for one line)
    if (getComputedStyle(el).display === "inline") el.style.display = "inline-block";
  }
  const right = o.from === "right";
  const span = inner;
  span.getAnimations().forEach((a) => a.cancel());
  // clipped horizontally at the element's own box; glyphs keep their vertical bleed
  el.classList.add("is-mslide");
  const a = span.animate([{ translate: right ? "100% 0" : "-100% 0" }, { translate: "0 0" }], {
    duration: o.dur ?? (right ? 764 : 436),
    delay: o.delay ?? 0,
    easing: cssEase(right ? "cubicOut" : "expo"),
    fill: "backwards",
  });
  const done = () => el.classList.remove("is-mslide");
  a.finished.then(done, () => {});
  return () => {
    a.cancel();
    done();
  };
}

type Roll = { slots: HTMLElement[]; text: string; sr: HTMLElement; box: HTMLElement };
const rolls = new WeakMap<HTMLElement, Roll>();
const ROLL_DIGITS = /^[\d\s:.,+\-−%·/]*$/;

function rollSlot(text: string): HTMLElement {
  const slot = document.createElement("span");
  slot.className = "roll__slot";
  const cur = document.createElement("span");
  cur.className = "roll__v";
  cur.textContent = text;
  slot.append(cur);
  return slot;
}

/** Rolls one slot to `text`: the shown value leaves by a line, the new one enters from the other side. */
function rollTo(slot: HTMLElement, text: string, dir: 1 | -1) {
  const vs = [...slot.querySelectorAll<HTMLElement>(":scope > .roll__v")];
  const shown = vs[vs.length - 1];
  if (!shown || shown.textContent === text) return;
  // only the newest value is ever shown: older leavers go, the visible one leaves from where it is
  for (const v of vs.slice(0, -1)) v.remove();
  const dur = RL(460);
  const enterEase = cssEase("enter");
  const w0 = slot.getBoundingClientRect().width;
  const cs = getComputedStyle(shown);
  const from = cs.translate && cs.translate !== "none" ? cs.translate : "0 0";
  const op = cs.opacity;
  shown.getAnimations().forEach((a) => a.cancel());
  shown.classList.add("is-out");
  shown
    .animate(
      [
        { translate: from, opacity: op },
        { opacity: 0, offset: 0.6 },
        { translate: `0 ${-100 * dir}%`, opacity: 0 },
      ],
      { duration: dur, easing: enterEase, fill: "forwards" },
    )
    .finished.then(
      () => shown.remove(),
      () => {},
    );
  const v = document.createElement("span");
  v.className = "roll__v";
  v.textContent = text;
  slot.append(v);
  v.animate([{ translate: `0 ${100 * dir}%` }, { translate: "0 0" }], { duration: dur, easing: enterEase });
  // width changes ride the same curve
  const w1 = v.getBoundingClientRect().width;
  slot.getAnimations().forEach((a) => a.cancel());
  if (Math.abs(w1 - w0) > 0.5) slot.animate([{ width: `${w0}px` }, { width: `${w1}px` }], { duration: dur, easing: enterEase });
}

/** RhineLabUI's roll at 1.1× (418 ms, ease-enter, no blur), for values the user drives.
 *  Digits roll slot by slot; other text rolls as one block. The first call just shows it. */
export function rollText(el: HTMLElement, text: string, o: { dir?: "up" | "down"; instant?: boolean } = {}): void {
  const instant = o.instant || reducedNow();
  const dir: 1 | -1 = o.dir === "down" ? -1 : 1;
  const digits = (t: string) => ROLL_DIGITS.test(t);
  const build = (t: string, perChar: boolean): Roll => {
    const box = document.createElement("span");
    box.className = "roll__box";
    box.setAttribute("aria-hidden", "true");
    const slots = perChar ? [...t].map((c) => rollSlot(c)) : [rollSlot(t)];
    box.append(...slots);
    // one semantic copy; the rolling slots are decoration
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = t;
    el.classList.add("roll");
    el.replaceChildren(box, sr);
    const r: Roll = { slots, text: t, sr, box };
    rolls.set(el, r);
    return r;
  };
  let r = rolls.get(el);
  if (!r || !el.contains(r.box) || instant) {
    if (r?.text !== text || !r || !el.contains(r.box)) build(text, digits(text));
    return;
  }
  if (r.text === text) return;
  const old = r.text;
  r.sr.textContent = text;
  if (digits(old) && digits(text) && [...old].length === [...text].length) {
    if (r.slots.length !== [...old].length) r = build(old, true);
    const cs = [...text];
    r.slots.forEach((slot, i) => rollTo(slot, cs[i], dir));
  } else {
    if (r.slots.length !== 1) r = build(old, false);
    rollTo(r.slots[0], text, dir);
  }
  r.text = text;
  r.sr.textContent = text;
}

/** Runs a SEQ on el (opacity, or the text colour only). Cancel restores the rest value. */
export function flicker(el: HTMLElement, seq: readonly number[], o: { prop?: "opacity" | "color"; delay?: number; instant?: boolean; loop?: boolean } = {}): Cancel {
  const prop = o.prop ?? "opacity";
  const rest = () => el.style.removeProperty(prop);
  if (o.instant || reducedNow()) {
    rest();
    return () => {};
  }
  let base = "";
  if (prop === "color") {
    rest();
    base = getComputedStyle(el).color;
  }
  const stop = stepped(
    seq,
    (v) => {
      if (prop === "opacity") el.style.opacity = String(v);
      else el.style.color = v >= 1 ? base : `color-mix(in srgb, ${base} ${Math.round(v * 100)}%, transparent)`;
    },
    { delay: o.delay, loop: o.loop, done: rest },
  );
  return () => {
    stop();
    rest();
  };
}

const CORNERS = ["--c-tl", "--c-tr", "--c-bl", "--c-br"] as const;
const cornerRuns = new WeakMap<Element, Cancel>();

/** The four squares of `.cornered`: on (D1), off (D2), hop (D7), idle (D3). */
export function corners(el: HTMLElement, mode: "on" | "off" | "hop" | "idle", o: { delay?: number; instant?: boolean } = {}): Cancel {
  cornerRuns.get(el)?.();
  const set = (i: number, v: number) => el.style.setProperty(CORNERS[i], String(v));
  const rest = () => CORNERS.forEach((c) => el.style.removeProperty(c));
  if (o.instant || reducedNow()) {
    if (mode === "off") CORNERS.forEach((_, i) => set(i, 0));
    else rest();
    return () => {};
  }
  const delay = o.delay ?? 0;
  const stops: Cancel[] = [];
  const end = mode === "off" ? () => CORNERS.forEach((_, i) => set(i, 0)) : rest;
  if (mode === "on") {
    CORNERS.forEach((_, i) => set(i, 0));
    // TL → TR → BL → BR, a frame apart
    CORNERS.forEach((_, i) => stops.push(stepped(SEQ.stutterOn, (v) => set(i, v), { delay: delay + i * TICK })));
  } else if (mode === "off") {
    CORNERS.forEach((_, i) => stops.push(stepped(SEQ.stutterOutSync, (v) => set(i, v), { delay })));
  } else if (mode === "hop") {
    // one lit at a time TR → BR → BL → TL (3 frames each), all off 1 frame, then all on
    const order = [1, 3, 2, 0];
    const frames: number[][] = [];
    for (const c of order) for (let k = 0; k < 3; k++) frames.push(CORNERS.map((_, i) => (i === c ? 1 : 0)));
    frames.push([0, 0, 0, 0], [1, 1, 1, 1]);
    stops.push(stepped(frames.map((_, i) => i), (k) => frames[k].forEach((v, i) => set(i, v)), { delay }));
  } else {
    // D3: a random corner plays the idle stutter every ~291 ms (exponential, ≥ 109 ms)
    let timer = 0;
    let alive = true;
    const next = () => {
      if (!alive) return;
      const wait = Math.max(3 * TICK, -Math.log(1 - Math.random()) * 291);
      timer = window.setTimeout(() => {
        if (document.hidden) return next();
        const c = (Math.random() * 4) | 0;
        stops.push(stepped(SEQ.markerIdle, (v) => set(c, v)));
        if (stops.length > 8) stops.splice(0, stops.length - 8);
        next();
      }, wait);
    };
    timer = window.setTimeout(next, delay);
    stops.push(() => {
      alive = false;
      clearTimeout(timer);
    });
  }
  const cancel = () => {
    stops.forEach((s) => s());
    stops.length = 0;
    // cancel leaves all four lit (an "off" run goes dark, as asked)
    if (mode === "off") end();
    else rest();
    if (cornerRuns.get(el) === cancel) cornerRuns.delete(el);
  };
  cornerRuns.set(el, cancel);
  return cancel;
}

// ───────── retired (§1.2): kept as instant setters until the lead removes them ─────────

/** @deprecated No letter scrambles in the PV: sets the final text at once. */
export function scramble(el: HTMLElement, opts: { duration?: number; instant?: boolean } = {}): Cancel {
  void opts;
  const target = el.dataset.text ?? el.textContent ?? "";
  el.dataset.text = target;
  el.textContent = target;
  return () => {};
}

/** @deprecated No count-ups in the PV: sets the final value at once. */
export function rollNumber(el: HTMLElement, opts: { to?: number; duration?: number; instant?: boolean } = {}): Cancel {
  const to = opts.to ?? Number(el.dataset.count ?? el.textContent ?? 0);
  el.textContent = String(to);
  return () => {};
}
