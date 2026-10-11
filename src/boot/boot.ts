// The opening sequence (PV 0:06–0:27), as a score: every frame is a pure
// function of elapsed time, so it plays the same at any frame rate, can be
// skipped or sought to any instant, and survives a backgrounded tab. Layout
// lives in boot.css; this file only writes progress values, typed text and
// ring geometry. Phases "welcome" and "exit" are reported to the app.

import { boot, brand } from "../content.ts";

export type BootOptions = {
  /** Skip the timeline entirely (reduced motion). */
  reduced: boolean;
  /** Returning visitor this session: play the short version. */
  short: boolean;
  /** Named moments, so the app can start the 3D fly-in on cue ("welcome", "exit"). */
  onPhase?: (phase: string) => void;
};

export type BootRun = { finished: Promise<void>; skip(): void };

// ───────── timing (seconds) ─────────

type Score = { frame: (t: number) => Frame; welcome: number; exit: number; end: number };

const SKIP_MS = 280;
const REDUCED_MS = 180;
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/";

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const out3 = (p: number) => 1 - (1 - p) ** 3;
const in2 = (p: number) => p * p;
const io3 = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
const back = (p: number) => (p <= 0 ? 0 : 1 + 2.7 * (p - 1) ** 3 + 1.7 * (p - 1) ** 2);
/** Rises over [a,b], falls over [c,d]. */
const hold = (t: number, a: number, b: number, c: number, d: number) => Math.min(seg(t, a, b), 1 - seg(t, c, d));

type Mark = { draw: number; loops: number; signs: number };
type Arc = { r: number; a: number; sweep: number };
type Rings = {
  o: number;
  blur: number;
  scale: number;
  outer: Arc;
  pale: Arc;
  arcs: [Arc, Arc];
  sides: number;
  core: number;
  orange: { r: number; a: [number, number]; size: number };
  text: { n: number; o: number; track: number; scale: number };
};
type Frame = {
  veil: number;
  dna: number;
  /** exit progress: the scene shrinks, blurs and fades, the paper clears */
  out: number;
  access: { n: number; o: number };
  logo: { o: number; mark: Mark; name: number; shift: number };
  brand: [number, number, number];
  sign: number;
  line: { i: number; n: number; o: number } | null;
  rings: Rings | null;
  card: { o: number; wt: number; bar: number; text: number; db: number; markO: number; mark: Mark; name: number };
  flash: [number, number];
  cap: { i: number; o: number };
  skip: number;
};

const FULL_MARK: Mark = { draw: 1, loops: 1, signs: 1 };
const NO_MARK: Mark = { draw: 0, loops: 0, signs: 0 };

const blank = (): Frame => ({
  veil: 0,
  dna: 1,
  out: 0,
  access: { n: 0, o: 0 },
  logo: { o: 0, mark: NO_MARK, name: 0, shift: 0 },
  brand: [1, 1, 1],
  sign: 1,
  line: null,
  rings: null,
  card: { o: 0, wt: 0, bar: 0, text: 0, db: 0, markO: 0, mark: NO_MARK, name: 0 },
  flash: [0, 0],
  cap: { i: -1, o: 0 },
  skip: 0,
});

/** Which caption shows when: [index, from, to]. */
function caption(t: number, spans: [number, number, number][]) {
  for (const [i, a, b] of spans) if (t >= a && t < b) return { i, o: hold(t, a, a + 0.1, b - 0.08, b) };
  return { i: -1, o: 0 };
}

const brandIn = (t: number, a: number): [number, number, number] => [
  out3(seg(t, a, a + 0.28)),
  out3(seg(t, a + 0.05, a + 0.33)),
  out3(seg(t, a + 0.1, a + 0.38)),
];

// ───────── the full score, ≈ 4.7 s ─────────

function permission(t: number): Rings | null {
  if (t < 2.6 || t >= 3.5) return null;
  const grow = out3(seg(t, 2.68, 3.08));
  const spin = seg(t, 2.66, 3.12);
  const c = io3(seg(t, 3.08, 3.36)); // collapse into the compact double ring
  const cut = seg(t, 3.42, 3.5);
  // the black arc grows clockwise from its tail, the white one counter-clockwise
  const outer = { r: lerp(423, 256, c), a: lerp(52 + 28 * spin, 276, c), sweep: lerp(285 * grow, 356, c) };
  const paleTail = lerp(140 - 26 * spin, -96, c);
  const paleSweep = lerp(286 * grow, 354, c);
  const pale = { r: lerp(333, 235, c), a: paleTail - paleSweep, sweep: paleSweep };
  const arcR = lerp(106, 92, c);
  const arcSweep = lerp(105 * out3(seg(t, 2.7, 2.95)), 128, c);
  const aMid = lerp(150 + 70 * spin, 270, c);
  const bMid = lerp(60 - 70 * spin, 85, c);
  return {
    o: (t < 2.62 ? seg(t, 2.6, 2.62) : 1) * (1 - cut),
    blur: cut * 6,
    scale: 1 + cut * 0.04,
    outer,
    pale,
    arcs: [
      { r: arcR, a: aMid - arcSweep / 2, sweep: arcSweep },
      { r: arcR, a: bMid - arcSweep / 2, sweep: arcSweep },
    ],
    sides: out3(seg(t, 3.2, 3.42)),
    core: back(seg(t, 3.18, 3.32)),
    orange: { r: lerp(201, 175, c), a: [lerp(160 + 30 * spin, 264, c), lerp(340 + 30 * spin, 456, c)], size: out3(seg(t, 2.72, 2.84)) },
    text: { n: seg(t, 2.72, 2.94), o: lerp(1, 0.2, c), track: lerp(lerp(0.32, 0.17, out3(seg(t, 2.72, 3.08))), 0.07, c), scale: lerp(1, 0.76, c) },
  };
}

function fullFrame(t: number): Frame {
  const lines = boot.lines;
  let line: Frame["line"] = null;
  if (t >= 1.86 && t < 2.62) {
    const i = t < 2.14 ? 0 : t < 2.37 ? 1 : 2;
    const from = [1.88, 2.15, 2.38][i];
    const dur = [0.2, 0.16, 0.14][i];
    line = { i, n: seg(t, from, from + dur) * lines[i].length, o: i === 2 ? 1 - seg(t, 2.54, 2.62) : 1 };
  }
  const exit = seg(t, 4.3, 4.7);
  const db = t < 4.0 ? 0 : t < 4.03 ? 1 : t < 4.06 ? 0.12 : 1;
  return {
    veil: 1 - out3(seg(t, 0, 0.55)),
    dna: out3(seg(t, 0.05, 0.9)),
    out: exit,
    access: { n: seg(t, 0.12, 0.46) * boot.access.length, o: 1 - seg(t, 0.66, 0.78) },
    logo: {
      o: t >= 0.8 ? 1 - seg(t, 2.54, 2.64) : 0,
      mark: { draw: io3(seg(t, 0.82, 1.32)), loops: seg(t, 1.3, 1.38), signs: back(seg(t, 1.3, 1.5)) },
      name: seg(t, 1.26, 1.6),
      shift: io3(seg(t, 1.6, 1.9)),
    },
    brand: brandIn(t, 1.52),
    sign: seg(t, 1.56, 1.84),
    line,
    rings: permission(t),
    card: {
      o: t >= 3.55 ? 1 : 0,
      wt: out3(seg(t, 3.56, 3.68)),
      bar: io3(seg(t, 3.66, 3.82)),
      text: seg(t, 3.74, 3.86),
      db,
      markO: out3(seg(t, 3.8, 3.96)),
      mark: FULL_MARK,
      name: out3(seg(t, 3.84, 4.0)),
    },
    flash: [t >= 3.5 && t < 3.55 ? 1 : 0, t >= 3.55 ? 1 - seg(t, 3.6, 3.76) : 0],
    cap: caption(t, [
      [0, 0.1, 0.8],
      [1, 1.86, 2.6],
      [2, 2.66, 3.48],
      [3, 3.6, 4.7],
    ]),
    skip: hold(t, 0.4, 0.6, 4.3, 4.42),
  };
}

// ───────── the short score for returning visitors, ≈ 1.3 s ─────────

function shortFrame(t: number): Frame {
  const f = blank();
  f.veil = 1 - out3(seg(t, 0, 0.25));
  f.dna = out3(seg(t, 0, 0.45));
  f.out = seg(t, 0.95, 1.3);
  f.brand = brandIn(t, 0.04);
  f.sign = seg(t, 0.08, 0.32);
  f.card = {
    o: 1,
    wt: out3(seg(t, 0.42, 0.52)),
    bar: io3(seg(t, 0.5, 0.64)),
    text: seg(t, 0.58, 0.68),
    db: t < 0.72 ? 0 : t < 0.75 ? 1 : t < 0.78 ? 0.12 : 1,
    markO: 1,
    mark: { draw: io3(seg(t, 0.04, 0.42)), loops: seg(t, 0.4, 0.46), signs: back(seg(t, 0.4, 0.56)) },
    name: out3(seg(t, 0.32, 0.56)),
  };
  f.cap = caption(t, [[3, 0.44, 1.3]]);
  f.skip = hold(t, 0.4, 0.55, 0.95, 1.05);
  return f;
}

const FULL: Score = { frame: fullFrame, welcome: 3.5, exit: 4.3, end: 4.7 };
const SHORT: Score = { frame: shortFrame, welcome: 0.4, exit: 0.95, end: 1.3 };

// ───────── writing a frame to the DOM ─────────

type MarkEls = { contour: SVGPathElement; loops: SVGPathElement; plus: SVGPathElement; minus: SVGPathElement; head: SVGCircleElement; len: number };

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number) => [Math.cos(rad(deg)) * r, Math.sin(rad(deg)) * r];

function arcPath({ r, a, sweep }: Arc, cx = 0, cy = 0) {
  if (sweep < 0.3 || r <= 0) return "";
  const s = Math.min(sweep, 359.9);
  const [x0, y0] = polar(r, a);
  const [x1, y1] = polar(r, a + s);
  return `M${f2(cx + x0)} ${f2(cy + y0)}A${f2(r)} ${f2(r)} 0 ${s > 180 ? 1 : 0} 1 ${f2(cx + x1)} ${f2(cy + y1)}`;
}

function collect(root: HTMLElement) {
  const q = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => {
    const el = from.querySelector<T>(sel);
    if (!el) throw new Error(`boot: missing ${sel}`);
    return el;
  };
  const all = <T extends Element = HTMLElement>(sel: string, from: ParentNode = root) => [...from.querySelectorAll<T>(sel)];
  const marks: MarkEls[] = all<SVGSVGElement>(".boot__mark").map((svg) => {
    const contour = q<SVGPathElement>(".boot__contour", svg);
    return {
      contour,
      loops: q<SVGPathElement>(".boot__loops", svg),
      plus: q<SVGPathElement>(".boot__plus", svg),
      minus: q<SVGPathElement>(".boot__minus", svg),
      head: q<SVGCircleElement>(".boot__head", svg),
      len: contour.getTotalLength(),
    };
  });
  const rings = q('[data-b="rings"]');
  return {
    scene: q('[data-b="scene"]'),
    access: q('[data-b="access"]'),
    logo: q('[data-b="logo"]'),
    name: q('[data-b="logo"] .boot__name'),
    lines: all('[data-b="lines"] > li'),
    rings,
    outer: q<SVGPathElement>(".boot__r-outer", rings),
    pale: q<SVGPathElement>(".boot__r-pale", rings),
    arcs: all<SVGPathElement>(".boot__r-arc", rings),
    sides: all<SVGPathElement>(".boot__r-side", rings),
    core: q<SVGCircleElement>(".boot__r-core", rings),
    head: q<SVGCircleElement>(".boot__r-head", rings),
    phead: q<SVGCircleElement>(".boot__r-phead", rings),
    orange: all<SVGCircleElement>(".boot__r-orange", rings),
    perm: q(".boot__perm", rings),
    card: q('[data-b="card"]'),
    wt: q(".boot__wt"),
    bar: q(".boot__bar"),
    barText: q(".boot__bar > span"),
    db: q(".boot__db"),
    wlogo: q(".boot__wlogo"),
    wname: q(".boot__wlogo .boot__name"),
    flashInk: q('[data-b="flash-ink"]'),
    flashPale: q('[data-b="flash-pale"]'),
    brand: [...q('[data-b="brand"] > a').children],
    sign: q('[data-b="sign"]'),
    cap: q('[data-b="cap"]'),
    skip: q("[data-boot-skip]"),
    bigMark: marks[0],
    smallMark: marks[1],
  };
}

class Painter {
  private last = new WeakMap<Element, Map<string, string>>();
  private els: ReturnType<typeof collect>;

  constructor(private root: HTMLElement) {
    this.els = collect(root);
  }

  private css(el: Element, prop: string, value: string) {
    let m = this.last.get(el);
    if (!m) this.last.set(el, (m = new Map()));
    if (m.get(prop) === value) return;
    m.set(prop, value);
    (el as HTMLElement).style.setProperty(prop, value);
  }

  private attr(el: Element, name: string, value: string) {
    let m = this.last.get(el);
    if (!m) this.last.set(el, (m = new Map()));
    const key = `@${name}`;
    if (m.get(key) === value) return;
    m.set(key, value);
    el.setAttribute(name, value);
  }

  private text(el: Element, value: string) {
    if (el.textContent !== value) el.textContent = value;
  }

  private show(el: Element, o: number) {
    this.css(el, "opacity", f2(o));
    this.css(el, "visibility", o > 0.001 ? "visible" : "hidden");
  }

  /** Typed text in place: `n` characters are set (fractional: the next one is a passing glyph). */
  private type(host: Element, full: string, n: number, t: number) {
    const on = host.querySelector("[data-on]")!;
    const off = host.querySelector("[data-off]")!;
    const chars = [...full];
    const k = Math.floor(n);
    let shown = chars.slice(0, k).join("");
    let rest = chars.slice(k).join("");
    if (k < chars.length && n > k && chars[k] !== " ") {
      shown += GLYPHS[(Math.floor(t * 40) * 7 + k * 13) % GLYPHS.length];
      rest = chars.slice(k + 1).join("");
    }
    this.text(on, shown);
    this.text(off, rest);
  }

  private mark(m: MarkEls, s: Mark) {
    this.css(m.contour, "stroke-dasharray", `${f2(s.draw)} 2`);
    this.css(m.contour, "opacity", s.draw > 0.002 ? f2(1 - s.loops) : "0");
    this.css(m.loops, "opacity", f2(s.loops));
    const sc = f2(Math.max(0, s.signs));
    this.css(m.plus, "scale", sc);
    this.css(m.minus, "scale", sc);
    this.css(m.plus, "rotate", `${f2((1 - clamp(s.signs)) * -90)}deg`);
    const drawing = s.draw > 0.002 && s.draw < 0.998;
    this.css(m.head, "opacity", drawing ? "1" : "0");
    if (drawing) {
      const p = m.contour.getPointAtLength(s.draw * m.len);
      this.attr(m.head, "cx", f2(p.x));
      this.attr(m.head, "cy", f2(p.y));
    }
  }

  paint(f: Frame, t: number) {
    const e = this.els;
    const root = this.root;
    this.css(root, "--veil", f2(f.veil));
    this.css(root, "--dna", f2(f.dna));
    this.css(root, "--drift", f2(t));
    const out = f.out;
    this.css(root, "--paper", f2(1 - out3(out)));
    this.css(e.scene, "opacity", f2(1 - in2(out)));
    this.css(e.scene, "scale", f2(1 - 0.06 * out3(out)));
    this.css(e.scene, "filter", out > 0 ? `blur(${f2(out * 12)}px)` : "none");
    this.css(root, "pointer-events", out > 0 ? "none" : "auto");

    this.show(e.access, f.access.o * (f.access.n > 0 ? 1 : 0));
    this.type(e.access, boot.access, f.access.n, t);

    this.show(e.logo, f.logo.o);
    if (f.logo.o > 0) {
      this.mark(e.bigMark, f.logo.mark);
      this.type(e.name, brand.mark, f.logo.name * brand.mark.length, t);
      this.css(e.logo, "--shift", f2(f.logo.shift));
    }

    e.lines.forEach((li, i) => {
      const on = f.line && f.line.i === i;
      this.show(li, on ? f.line!.o : 0);
      if (on) {
        this.type(li, boot.lines[i], f.line!.n, t);
        this.css(li, "--cursor", f.line!.n < boot.lines[i].length ? "1" : "0");
      }
    });

    const r = f.rings;
    this.show(e.rings, r ? r.o : 0);
    if (r) {
      this.css(e.rings, "filter", r.blur > 0 ? `blur(${f2(r.blur)}px)` : "none");
      this.css(e.rings, "--rscale", f2(r.scale));
      this.attr(e.outer, "d", arcPath(r.outer));
      this.attr(e.pale, "d", arcPath(r.pale));
      const [hx, hy] = polar(r.outer.r, r.outer.a + r.outer.sweep);
      this.attr(e.head, "cx", f2(hx));
      this.attr(e.head, "cy", f2(hy));
      this.attr(e.head, "r", f2(lerp(3, 17, clamp(r.outer.sweep / 40)) * (1 - clamp((r.outer.sweep - 300) / 50))));
      const [px, py] = polar(r.pale.r, r.pale.a);
      this.attr(e.phead, "cx", f2(px));
      this.attr(e.phead, "cy", f2(py));
      this.attr(e.phead, "r", f2(7 * (1 - clamp((r.pale.sweep - 300) / 50))));
      r.arcs.forEach((a, i) => this.attr(e.arcs[i], "d", arcPath(a)));
      const side = r.sides * 290;
      this.attr(e.sides[0], "d", arcPath({ r: 38, a: 35, sweep: side }, -132, 14));
      this.attr(e.sides[1], "d", arcPath({ r: 38, a: 215, sweep: side }, 132, -14));
      this.attr(e.core, "r", f2(43 * r.core));
      e.orange.forEach((dot, i) => {
        const [ox, oy] = polar(r.orange.r, r.orange.a[i]);
        this.attr(dot, "cx", f2(ox));
        this.attr(dot, "cy", f2(oy));
        this.attr(dot, "r", f2(7.5 * r.orange.size));
      });
      this.type(e.perm, boot.permission, r.text.n * boot.permission.length, t);
      this.css(e.perm, "opacity", f2(r.text.o * (r.text.n > 0 ? 1 : 0)));
      this.css(e.perm, "--track", `${f2(r.text.track)}em`);
      this.css(e.perm, "scale", f2(r.text.scale));
    }

    const c = f.card;
    this.show(e.card, c.o);
    if (c.o > 0) {
      this.css(e.wt, "opacity", f2(c.wt));
      this.css(e.wt, "--rise", f2(1 - c.wt));
      this.css(e.bar, "clip-path", `inset(0 ${f2((1 - c.bar) * 100)}% 0 0)`);
      this.css(e.barText, "clip-path", `inset(0 ${f2((1 - c.text) * 100)}% 0 0)`);
      this.css(e.db, "opacity", f2(c.db));
      this.css(e.wlogo, "opacity", f2(c.markO));
      this.css(e.wlogo, "--rise", f2(1 - c.markO));
      this.mark(e.smallMark, c.mark);
      this.css(e.wname, "opacity", f2(c.name));
    }

    this.show(e.flashInk, f.flash[0]);
    this.show(e.flashPale, f.flash[1]);

    e.brand.forEach((line, i) => {
      this.css(line, "opacity", f2(f.brand[i]));
      this.css(line, "--rise", f2(1 - f.brand[i]));
    });
    this.css(e.sign, "clip-path", `inset(-20% ${f2((1 - f.sign) * 100)}% -20% 0)`);
    this.show(e.sign, f.sign > 0 ? 1 : 0);

    if (f.cap.i >= 0) this.text(e.cap, boot.captions[f.cap.i]);
    // the chrome brings its own caption at the exit: step aside quickly
    this.show(e.cap, f.cap.o * (1 - clamp(out * 4)));

    this.show(e.skip, f.skip);
    this.css(e.skip, "pointer-events", f.skip > 0.5 ? "auto" : "none");
  }
}

// ───────── the run ─────────

export function runBoot(root: HTMLElement, o: BootOptions): BootRun {
  const score = o.short ? SHORT : FULL;
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
  let start = performance.now();
  /** Dev seeking: a frozen time in seconds, or null while playing. */
  let paused: number | null = null;
  /** Skip / reduced: the frozen time, and when the fade-out began (ms). */
  let cut: { at: number; t: number; ms: number } | null = null;

  const skipBtn = root.querySelector<HTMLElement>("[data-boot-skip]");
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    skipBtn?.removeEventListener("click", skip);
    if (import.meta.env.DEV) delete (window as unknown as { __bootSeek?: unknown }).__bootSeek;
    resolve();
  };

  /** Paints the score at `t` seconds, firing every phase it has passed. */
  const at = (t: number) => {
    if (t >= score.welcome) fire("welcome");
    if (t >= score.exit) fire("exit");
    painter.paint(score.frame(t), t);
  };

  let lastNow = start;
  const tick = (now: number) => {
    if (done) return;
    // a long gap means the tab was hidden: carry on where it stopped instead of jumping ahead
    if (now - lastNow > 250) start += now - lastNow - 16;
    lastNow = now;
    if (cut) {
      const k = clamp((now - cut.at) / cut.ms);
      const f = o.reduced ? blank() : score.frame(cut.t);
      f.out = Math.max(f.out, k);
      f.skip = 0;
      painter.paint(f, cut.t);
      if (k >= 1) return finish();
    } else {
      const t = paused ?? (now - start) / 1000;
      at(t);
      if (paused === null && t >= score.end) return finish();
    }
    raf = requestAnimationFrame(tick);
  };

  function skip() {
    if (done || cut) return;
    // freeze where we are and fade out from there (an exit already under way just speeds up)
    const t = paused ?? (performance.now() - start) / 1000;
    cut = { at: performance.now(), t, ms: SKIP_MS };
    paused = null;
    fire("welcome");
    fire("exit");
  }

  skipBtn?.addEventListener("click", skip);

  if (o.reduced) {
    cut = { at: performance.now(), t: 0, ms: REDUCED_MS };
    painter.paint(blank(), 0);
    queueMicrotask(() => fire("exit"));
  } else {
    painter.paint(score.frame(0), 0);
  }
  raf = requestAnimationFrame(tick);

  if (import.meta.env.DEV) {
    // __bootSeek(2.8) freezes the opening at 2.8 s; __bootSeek(null) plays on from there.
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
    (window as unknown as { __bootSeek?: unknown }).__bootSeek = Object.assign(seek, { short: o.short, end: score.end });
  }

  return { finished, skip };
}
