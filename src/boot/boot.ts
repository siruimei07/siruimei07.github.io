// The opening sequence (PV 0:06–0:27), played from the score in motion.ts at
// SPEED × RhineLabUI's pace. Every frame is a pure function of elapsed time,
// so it plays the same at any frame rate, can be skipped or sought to any
// instant, and survives a backgrounded tab. The clock waits on the white frame
// until the page has settled, and never runs more than one PV frame ahead of
// what was painted, so no editorial cut is ever dropped. Layout lives in
// boot.css; this file only writes opacity, a few custom properties,
// clip-paths, typed text and the mark's and rings' SVG geometry. Phases
// "idle" (a still moment for heavy work), "welcome" and "exit" go to the app.

import { boot, brand } from "../content.ts";
import { bootMotion, FULL, PV, SHORT, SPEED, type Motion, type Version } from "./motion.ts";
import { progress, smooth } from "./tracks.ts";

export type BootOptions = {
  /** Skip the timeline entirely (reduced motion, deep links). */
  reduced: boolean;
  /** Returning visitor this session: play the short version. */
  short: boolean;
  /** Named moments, so the app can load the 3D while nothing moves ("idle") and start its fly-in on cue ("welcome", "exit"). */
  onPhase?: (phase: string) => void;
};

export type BootRun = { finished: Promise<void>; skip(): void };

const SKIP_MS = 280;
const REDUCED_MS = 180;
/** One PV frame at SPEED (ms): the most the clock may advance between two painted frames. */
const TICK_MS = 1000 / (25 * SPEED);
/** The white frame holds at least HOLD_MIN_MS, then until the fonts are in and CALM_FRAMES
 *  frames in a row came within CALM_MS of each other, but never longer than HOLD_MAX_MS. */
const HOLD_MIN_MS = 360;
const HOLD_MAX_MS = 800;
const CALM_MS = 34;
const CALM_FRAMES = 3;

// The PV scales each ring as a layer, so its stroke thickens with its radius as it closes in
// (measured over frames 506–568: width ∝ radius^0.85; black 2.75 px at r 248, white 5 px at r 224).
const ringStroke = (rest: number, at: number, r: number) => rest * Math.max(0.2, r / at) ** 0.85;

/** App time (seconds since this version started) ↔ PV time. */
const pvAt = (v: Version, s: number) => v.from + s * SPEED;
const appAt = (v: Version, pv: number) => Math.max(0, (pv - v.from) / SPEED);

/** How the frame is finished: the exit's progress, the paper's wash, the SKIP button, whether
 *  the corner lockup drops what is left of its slide (after a skip), and whether the white
 *  frame still holds (nothing of the score shows yet). */
type Look = { exit: number; wash: number; skip: number; settled: boolean; hold: boolean };

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const f4 = (n: number) => (Math.round(n * 10000) / 10000).toString();

/** An arc of radius r from angle `start`, clockwise by `sweep` (radians); a full turn as two halves. */
function arc(r: number, start: number, sweep: number, x = 960, y = 540) {
  const p = (a: number) => `${f2(x + Math.cos(a) * r)} ${f2(y + Math.sin(a) * r)}`;
  if (sweep >= Math.PI * 1.999) return `M${p(start)}A${f2(r)} ${f2(r)} 0 1 1 ${p(start + Math.PI)}A${f2(r)} ${f2(r)} 0 1 1 ${p(start + Math.PI * 2)}`;
  return `M${p(start)}A${f2(r)} ${f2(r)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(start + sweep)}`;
}

function collect(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => {
    const el = from.querySelector<T>(sel);
    if (!el) throw new Error(`boot: missing ${sel}`);
    return el;
  };
  const all = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const logo = q('[data-b="logo"]');
  const auth = q('[data-b="auth"]');
  const hl = q(".boot__co-hl");
  return {
    scene: q('[data-b="scene"]'),
    corner: q(".boot__corner"),
    access: q('[data-b="access"]'),
    accessT: q('[data-b="access"] .boot__t'),
    logo,
    contour: q<SVGPathElement>(".boot__contour", logo),
    plus: q<SVGPathElement>(".boot__plus", logo),
    minus: q<SVGPathElement>(".boot__minus", logo),
    name: q(".boot__name .boot__t", logo),
    auth,
    authT: q(".boot__t", auth),
    scan: q('[data-b="scan"]'),
    rings: q<SVGGElement>(".boot__rings"),
    outer: q<SVGPathElement>(".boot__r-outer"),
    pale: q<SVGPathElement>(".boot__r-pale"),
    inner: all<SVGPathElement>(".boot__r-inner"),
    sides: all<SVGPathElement>(".boot__r-side"),
    orange: all<SVGCircleElement>(".boot__r-orange"),
    sats: all<SVGCircleElement>(".boot__r-sat"),
    core: q<SVGCircleElement>(".boot__r-core"),
    caps: all<SVGCircleElement>(".boot__r-cap"),
    perm: q(".boot__perm"),
    card: q('[data-b="card"]'),
    panel: q(".boot__panel"),
    wt: q(".boot__wt"),
    co: q(".boot__co"),
    hl,
    hlText: q("span", hl),
    db: q(".boot__db"),
    wlogo: q(".boot__wlogo"),
    brand: [...q('[data-b="brand"] > a').children],
    sign: q('[data-b="sign"]'),
    cap: q('[data-b="cap"]'),
    skip: q("[data-boot-skip]"),
  };
}

class Painter {
  private last = new WeakMap<Element, Map<string, string>>();
  private els: ReturnType<typeof collect>;

  constructor(private root: HTMLElement) {
    this.els = collect(root);
  }

  private set(el: Element, key: string, value: string, write: () => void) {
    let m = this.last.get(el);
    if (!m) this.last.set(el, (m = new Map()));
    if (m.get(key) === value) return;
    m.set(key, value);
    write();
  }

  private css(el: Element, prop: string, value: string) {
    this.set(el, prop, value, () => (el as HTMLElement).style.setProperty(prop, value));
  }

  private attr(el: Element, name: string, value: string) {
    this.set(el, `@${name}`, value, () => el.setAttribute(name, value));
  }

  private text(el: Element, value: string) {
    if (el.textContent !== value) el.textContent = value;
  }

  private show(el: Element, o: number) {
    this.css(el, "opacity", f2(o));
    this.css(el, "visibility", o > 0.001 ? "visible" : "hidden");
  }

  /** Typed text in place: characters [from, to) show; the blanked lead and the untyped rest keep their room. */
  private type(host: Element, full: string, from: number, to: number) {
    const [ghost, on, off] = host.children;
    this.text(ghost, full.slice(0, from));
    this.text(on, full.slice(from, to));
    this.text(off, full.slice(to));
  }

  paint(m: Motion, look: Look) {
    const e = this.els;
    const root = this.root;

    // paper: the reference's slow drift, the wash, and the dissolve into the page at the exit
    this.css(root, "--dx", f2(Math.sin(m.t * 0.16) * 18));
    this.css(root, "--dy", f2(-(m.t - 6) * 5));
    this.css(root, "--wash", f2(look.wash));
    const x = look.exit;
    this.css(root, "--out", f2(x));
    this.css(root, "--paper", f2(1 - x));
    // the scene leaves as the PV's welcome card does: shrinking, blurring and tinting as it fades
    this.css(e.scene, "opacity", look.hold ? "0" : f2(1 - x ** 3));
    this.css(e.corner, "opacity", look.hold ? "0" : "1");
    this.css(e.scene, "scale", f2(1 - 0.46 * x));
    this.css(e.scene, "filter", x > 0 ? `blur(calc(${f2(8 * x)} * var(--u))) invert(${f2(0.22 * x)}) sepia(${f2(x)}) saturate(${f2(1 + 5 * x)}) hue-rotate(${f2(115 * x)}deg)` : "none");
    this.css(root, "pointer-events", x > 0 ? "none" : "auto");

    this.show(e.access, m.access.n > 0 ? m.access.o : 0);
    if (m.access.n > 0) this.type(e.accessT, boot.access, 0, m.access.n);

    this.show(e.logo, m.logo.o);
    if (m.logo.o > 0) {
      const g = m.logo.mark;
      this.css(e.logo, "--lx", f2(g.left - 814));
      this.css(e.contour, "stroke-dasharray", `${f4(g.length)} ${f4(1 - g.length)}`);
      this.css(e.contour, "stroke-dashoffset", f4(-g.start));
      this.attr(e.contour, "stroke-width", f2(g.strokeWidth));
      const signs = g.symbolScale > 0 ? "1" : "0";
      this.css(e.plus, "opacity", signs);
      this.css(e.minus, "opacity", signs);
      const k = f4(g.symbolScale);
      this.attr(e.plus, "transform", `translate(${f2(g.plusX)} 70) rotate(${f2(g.plusAngle)}) scale(${k}) translate(-69 -70)`);
      this.attr(e.minus, "d", `M${f2(-g.minusWidth / 2)} 0h${f2(g.minusWidth)}`);
      this.attr(e.minus, "transform", `translate(${f2(g.minusX)} 70) scale(${k})`);
      this.type(e.name, brand.mark, 0, m.logo.name);
    }

    this.show(e.auth, m.auth.o);
    if (m.auth.o > 0) this.type(e.authT, boot.lines[m.auth.line], m.auth.from, m.auth.to);

    this.show(e.scan, m.scan ? 1 : 0);
    if (m.scan) this.rings(m, m.scan);

    const c = m.card;
    this.show(e.card, c.on ? 1 : 0);
    if (c.on) {
      this.css(e.panel, "opacity", f2(c.panel));
      this.css(e.wt, "color", c.ink >= 1 ? "var(--ink)" : `color-mix(in srgb, var(--ink) ${f2(c.ink * 100)}%, var(--boot-knock))`);
      this.css(e.co, "opacity", c.company ? (c.mask ? "0.65" : "1") : "0");
      this.css(e.hlText, "opacity", c.mask ? "0.06" : "1");
      this.css(e.hl, "clip-path", `inset(0 ${f2((1 - c.bar) * 100)}% 0 0)`);
      this.css(e.db, "opacity", String(c.db));
      this.css(e.wlogo, "opacity", c.logo ? "1" : "0");
    }

    // the chrome's own lockup fades in at the exit: this copy must lie exactly on it, never beside it
    e.brand.forEach((line, i) => {
      this.css(line, "opacity", f2(m.brand[i].o));
      this.css(line, "--bx", f2(look.settled ? 0 : m.brand[i].x));
    });
    this.show(e.sign, m.powered > 0 ? 1 : 0);
    this.css(e.sign, "clip-path", `inset(-20% ${f2((1 - m.powered) * 100)}% -20% 0)`);

    if (m.cap.i >= 0) this.text(e.cap, boot.captions[m.cap.i]);
    this.show(e.cap, m.cap.o);

    this.show(e.skip, look.skip);
    this.css(e.skip, "pointer-events", look.skip > 0.5 ? "auto" : "none");
  }

  private rings(m: Motion, s: NonNullable<Motion["scan"]>) {
    const e = this.els;
    const o = m.orbit;
    // the glitch frames enlarge and dim the rings only: the words stay put
    this.attr(e.rings, "transform", `translate(960 540) scale(${f2(m.ring.scale)}) translate(-960 -540)`);
    this.css(e.rings, "opacity", f2(m.ring.o));
    this.css(e.rings, "filter", m.ring.blur > 0 ? `blur(${f2(m.ring.blur)}px)` : "none");
    this.attr(e.outer, "d", arc(s.radius, s.outerStart, s.outerSweep));
    this.attr(e.pale, "d", arc(s.whiteRadius, s.whiteStart, s.whiteSweep));
    this.css(e.outer, "stroke-width", f2(ringStroke(2.75, 248, s.radius)));
    this.css(e.pale, "stroke-width", f2(ringStroke(5, 224, s.whiteRadius)));
    e.inner.forEach((p, i) => this.attr(p, "d", arc(s.innerRadius, s.innerStart + i * Math.PI, s.innerSweep)));
    e.sides.forEach((p, i) => {
      const side = o.sides[i];
      this.attr(p, "d", arc(side.radius, side.start, side.sweep, side.x, side.y));
      this.css(p, "opacity", o.sideVisible ? "1" : "0");
    });
    e.orange.forEach((dot, i) => {
      this.attr(dot, "cx", f2(960 + Math.cos(s.orbit + i * Math.PI) * s.orbitRadius));
      this.attr(dot, "cy", f2(540 + Math.sin(s.orbit + i * Math.PI) * s.orbitRadius));
      this.attr(dot, "r", f2(s.dotRadius));
    });
    e.sats.forEach((dot, i) => {
      const p = o.satellites[i];
      this.attr(dot, "cx", f2(p.x));
      this.attr(dot, "cy", f2(p.y));
      this.attr(dot, "r", f2(p.radius));
    });
    this.css(e.core, "opacity", m.ornament ? "1" : "0");
    this.attr(e.core, "r", f2(o.coreRadius));
    // a black cap rides the black ring's head, a white one the white ring's tail
    const ends = [
      { a: s.outerStart + s.outerSweep, r: s.radius, size: s.blackCap },
      { a: s.whiteStart, r: s.whiteRadius, size: s.whiteCap },
    ];
    e.caps.forEach((cap, i) => {
      const end = ends[i];
      this.attr(cap, "cx", f2(960 + Math.cos(end.a) * end.r));
      this.attr(cap, "cy", f2(540 + Math.sin(end.a) * end.r));
      this.attr(cap, "r", f2(end.size));
    });
    this.css(e.perm, "opacity", f2(m.permission.o));
    this.css(e.perm, "--track", f2(m.permission.track));
  }
}

// ───────── the run ─────────

export function runBoot(root: HTMLElement, o: BootOptions): BootRun {
  const v = o.short ? SHORT : FULL;
  const welcomeAt = appAt(v, PV.welcome);
  const exitAt = appAt(v, PV.exit);
  const end = appAt(v, PV.end);
  const painter = new Painter(root);
  const fired = new Set<string>();
  const fire = (p: string) => {
    if (fired.has(p)) return;
    fired.add(p);
    o.onPhase?.(p);
  };

  let resolve!: () => void;
  const finished = new Promise<void>((r) => (resolve = r));
  let raf = 0;
  let done = false;
  const born = performance.now();
  /** The clock's zero (ms), or null while the white frame holds for the page to settle. */
  let start: number | null = null;
  /** Dev seeking: a frozen app time in seconds, or null while playing. */
  let paused: number | null = null;
  /** Skip / reduced: the frozen PV time, the exit already under way there, when the quick exit
   *  began and how long it takes (ms), and whether it leaves from the still-blank white frame. */
  let cut: { at: number; pv: number; exit: number; ms: number; hold: boolean } | null = null;
  let fontsIn = !("fonts" in document);
  if (!fontsIn) {
    const fontsDone = () => (fontsIn = true);
    document.fonts.ready.then(fontsDone, fontsDone);
  }
  let calm = 0;
  let heldFor: number | null = null;
  /** The PV time last painted (dev checks). */
  let painted = 0;
  let lastNow = -1;

  const skipBtn = root.querySelector<HTMLElement>("[data-boot-skip]");
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    skipBtn?.removeEventListener("click", skip);
    if (import.meta.env.DEV) delete (window as unknown as { __bootSeek?: unknown }).__bootSeek;
    resolve();
  };

  /** App time at `now`, in seconds: 0 while the white frame holds. */
  const clock = (now: number) => paused ?? (start === null ? 0 : Math.max(0, (now - start) / 1000));

  /** Paints app time `s`, firing every phase it has passed. */
  const at = (s: number, phases = true) => {
    const m = bootMotion(pvAt(v, s), v);
    painted = m.t;
    if (phases && m.f >= v.idleAt) fire("idle");
    if (phases && s >= welcomeAt) fire("welcome");
    if (phases && s >= exitAt) fire("exit");
    // SKIP shows once the opening is under way and leaves as the exit begins
    const skipO = Math.min(progress(s, 0.4, 0.6), 1 - progress(s, exitAt, exitAt + 0.12));
    painter.paint(m, { exit: m.exit, wash: m.wash, skip: skipO, settled: false, hold: start === null && paused === null });
  };

  const tick = (now: number) => {
    if (done) return;
    const gap = lastNow < 0 ? 0 : now - lastNow;
    lastNow = now;
    if (start === null) {
      // page startup is the busiest moment of the load: let it pass before the first letter
      calm = gap > 0 && gap < CALM_MS ? calm + 1 : 0;
      const waited = now - born;
      if (paused === null && !cut && waited >= HOLD_MIN_MS && ((fontsIn && calm >= CALM_FRAMES) || waited >= HOLD_MAX_MS)) {
        start = now;
        heldFor = Math.round(waited);
      }
    } else if (gap > TICK_MS) {
      // a stall (a long task, a hidden tab) holds the clock: it resumes one PV frame on, never past a cut
      start += gap - TICK_MS;
    }
    if (cut) {
      // a frame's timestamp may predate the skip itself
      const k = Math.min(1, Math.max(0, (now - cut.at) / cut.ms));
      const m = bootMotion(cut.pv, v);
      // the chrome's caption is already fading in: never show two
      m.cap.o = 0;
      painter.paint(m, { exit: Math.max(cut.exit, smooth(k)), wash: o.reduced ? 0 : m.wash, skip: 0, settled: true, hold: cut.hold });
      if (k >= 1) return finish();
    } else {
      const s = clock(now);
      at(s);
      if (paused === null && s >= end) return finish();
    }
    raf = requestAnimationFrame(tick);
  };

  function skip() {
    if (done || cut) return;
    // freeze where we are and leave from there (an exit already under way just speeds up)
    const now = performance.now();
    const pv = pvAt(v, Math.min(clock(now), end));
    cut = { at: now, pv, exit: bootMotion(pv, v).exit, ms: SKIP_MS, hold: start === null && paused === null };
    paused = null;
    fire("idle");
    fire("welcome");
    fire("exit");
  }

  skipBtn?.addEventListener("click", skip);

  if (o.reduced) {
    // straight to the resting frame (corner lockup only) and away
    cut = { at: performance.now(), pv: PV.end, exit: 0, ms: REDUCED_MS, hold: false };
    queueMicrotask(() => {
      fire("idle");
      fire("exit");
    });
  } else {
    at(0, false);
  }
  raf = requestAnimationFrame(tick);

  if (import.meta.env.DEV) {
    // __bootSeek(2.8) freezes the opening at app time 2.8 s, __bootSeek.pv(20.5) at PV time
    // 20.5 s; __bootSeek(null) plays on from there. __bootSeek.held() is how long the white
    // frame held before the clock started (ms), or null while it still holds; .painted() the
    // PV time of the last frame painted.
    const seek = (s: number | null) => {
      if (done || cut) return;
      if (s === null) {
        if (paused !== null) start = performance.now() - paused * 1000;
        paused = null;
      } else {
        paused = Math.max(0, s);
        at(paused);
      }
    };
    (window as unknown as { __bootSeek?: unknown }).__bootSeek = Object.assign(seek, {
      short: o.short,
      end,
      speed: SPEED,
      from: v.from,
      pv: (pv: number) => seek(appAt(v, pv)),
      held: () => heldFor,
      painted: () => painted,
    });
  }

  return { finished, skip };
}
