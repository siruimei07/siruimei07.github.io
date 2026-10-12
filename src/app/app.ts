// The terminal shell: opening → overview ⇄ section files. Owns routing
// (hash URLs, history), the screen changes and their phases, the section
// reveal (frost, decryption, occlusion bars), the persistent chrome (caption,
// section line, pager, rail and lime marker, command log, clock, toast),
// keyboard input, preferences, the theme cascade and the lazy 3D plates.
// Every motion here follows MOTION-SPEC §6.1/§7: PV frames at 1.1×, cut on
// the 36.36 ms tick, interruptible from what is on screen.

import { home, identity, sectionById, sections, worksText, type SectionId } from "../content.ts";
import { runBoot, type BootRun } from "../boot/boot.ts";
import type { Plates } from "../three/plates.ts";
import { createHome } from "../screens/home.ts";
import { createProfile } from "../screens/profile.ts";
import { createSkills } from "../screens/skills.ts";
import { createWorks } from "../screens/works.ts";
import { createActivity } from "../screens/activity.ts";
import { createContact } from "../screens/contact.ts";
import { createSystem } from "../screens/system.ts";
import type { NavKind, Phase, PhaseInfo, ScreenContext, ScreenId, ScreenModule } from "../screens/types.ts";
import { Prefs } from "./settings.ts";
import {
  DECRYPT_RATE,
  F,
  FINE_QUERY,
  PHONE_QUERY,
  RL,
  SEQ,
  TICK,
  clamp01,
  corners,
  cssEase,
  easing,
  flicker,
  onFrame,
  retype,
  rollText,
  sampleCurve,
  smooth5,
  stepped,
  swapLabel,
  timeline,
  typeText,
  unit,
  type Cancel,
  type EaseName,
  type Knot,
  type Timeline,
  type TrackName,
} from "./fx.ts";

const ORDER: ScreenId[] = ["home", ...sections.map((s) => s.id)];
// #main is the skip link's target, handled on its own (it is not a screen)
const ALIAS: Record<string, ScreenId> = {
  "": "home",
  top: "home",
  home: "home",
  menu: "home",
  research: "skills",
  projects: "works",
  calendar: "activity",
  log: "activity",
};
const BOOTED_KEY = "rl.booted";
/** HUD constant for the status label between sections (atlas §5.18). Hard-coded here
 *  because content.ts is frozen; it is Latin only, so the CJK font subset is untouched. */
const SELECTING = "SELECTING FILES";
/** The frame's own glass furniture ends at dock + 1782 + 436 (the grey bar's text). */
const FRAME_BUILD_MS = 2218;
/** The overview's build when its view does not say (§8.1: settled at t1 + 5600). */
const HOME_BUILD_MS = 5600;
/** Theme-cascade cells (§7.10). They never nest. */
const TC_CELLS = ".brand, .pager, .rail, .rule, .rule__mark, .foot-sect, .foot-sign, .caption, .sect__tile, .sect__glass, .home__co, .home__centre, .home__id, .home__leaders, .home__flat, #rl-ambient";

// ───────── decryption beat (RhineLabUI decryption.ts, PV seconds) ─────────

const GROW: readonly Knot[] = [
  [34.24, 0],
  [34.4, 0.19],
  [34.64, 0.57],
  [34.96, 0.79],
  [35.28, 0.92],
  [35.6, 0.973],
  [36.04, 1],
];
const RETRACT: readonly Knot[] = [
  [37.72, 1],
  [37.88, 0.72],
  [38.0, 0.38],
  [38.12, 0.22],
  [38.24, 0.14],
  [38.4, 0.075],
  [38.64, 0.024],
  [38.84, 0],
];
const REVEAL: readonly Knot[] = [
  [38.84, 0],
  [38.92, 0.28],
  [39.0, 0.51],
  [39.16, 0.74],
  [39.32, 0.94],
  [39.56, 1],
];
const D_START = 34.12;
const D_REVEAL = 38.84;
const D_END = 39.56;
/** ms after D0 at which a PV second of the beat lands. */
const dms = (pv: number) => ((pv - D_START) * 1000) / DECRYPT_RATE;
/** RhineLabUI document decryption, 950 ms ÷ 1.1. */
const BARS_MS = RL(950);
/** The clearing front's feather (atlas C5: a 35 % band). */
const FEATHER = 0.35;


function screenFromHash(hash: string): ScreenId | null {
  let h = hash.replace(/^#/, "");
  try {
    h = decodeURIComponent(h);
  } catch {
    /* malformed escape: keep it raw, it matches nothing */
  }
  h = h.toLowerCase();
  // own keys only: "#constructor" must not find Object.prototype
  if (Object.hasOwn(ALIAS, h)) return ALIAS[h];
  return (ORDER as string[]).includes(h) ? (h as ScreenId) : null;
}

/** A WAAPI animation pinned to an absolute performance.now() start. */
function anim(el: Element, frames: Keyframe[], o: { start: number; dur: number; ease?: EaseName | TrackName | string; fill?: FillMode; pseudo?: string; composite?: CompositeOperation; iterations?: number }): Animation {
  const a = el.animate(frames, {
    duration: Math.max(0, o.dur),
    easing: easing(o.ease),
    fill: o.fill ?? "none",
    pseudoElement: o.pseudo,
    composite: o.composite ?? "replace",
    iterations: o.iterations ?? 1,
  });
  a.startTime = o.start;
  return a;
}

/** Runs fn now when it is due now, else as a tick-aligned cue (so screens activate in the same task). */
function when(tl: Timeline, at: number, fn: () => void) {
  if (at <= 0) fn();
  else tl.at(at, fn);
}

/** R9 halo ripple: a disc r 10 → 25 and a ring to r 45 around a dot, 436 ms. */
function halo(el: HTMLElement, colour: string) {
  if (document.documentElement.dataset.motion === "reduced") return;
  const u = unit();
  // keyframes get a resolved colour, not a var()
  const m = /^var\((--[\w-]+)\)$/.exec(colour);
  if (m) colour = getComputedStyle(el).getPropertyValue(m[1]).trim() || "#fff";
  el.animate(
    [
      { boxShadow: `0 0 0 0 color-mix(in srgb, ${colour} 45%, transparent)`, outline: `1px solid color-mix(in srgb, ${colour} 50%, transparent)`, outlineOffset: "0px" },
      { boxShadow: `0 0 0 ${(15 * u).toFixed(1)}px transparent`, outline: "1px solid transparent", outlineOffset: `${(35 * u).toFixed(1)}px` },
    ],
    { duration: F(12), easing: cssEase("expo") },
  );
}

// ───────── the section reveal (§7.5) ─────────

type Cover = { win: HTMLElement; ink: HTMLElement; order: number };

/** Frost over a section's body, the decryption marks and line over it, and the
 *  occlusion bars over its [data-occlude] text; driven by the PV beat at DECRYPT_RATE. */
class Reveal {
  private wrap: HTMLElement | null;
  private frost: HTMLElement | null;
  private svg: SVGSVGElement | null;
  private line: SVGPathElement | null;
  private marks: SVGRectElement[];
  private pt: SVGCircleElement | null;
  private label: HTMLElement | null;
  private key: HTMLElement | null;
  private val: HTMLElement | null;
  private keyText: string;
  private valText: string;
  private covers: Cover[] = [];
  private stops: Cancel[] = [];
  private loop: Cancel | null = null;
  private refrostAnim: Animation | null = null;
  private relay: (() => void) | null = null;
  private overlay = false;
  private revealAt = Infinity;
  private lineD = "";

  constructor(private root: HTMLElement) {
    this.wrap = root.querySelector(".sect__bodywrap");
    this.frost = root.querySelector(".sect__frost");
    this.svg = root.querySelector(".sect__decrypt");
    this.line = root.querySelector(".decrypt__line");
    this.marks = [...root.querySelectorAll<SVGRectElement>(".decrypt__mark")];
    this.pt = root.querySelector(".decrypt__pt");
    this.label = root.querySelector(".sect__decrypt-label");
    this.key = this.label?.querySelector("span") ?? null;
    this.val = this.label?.querySelector("b") ?? null;
    this.keyText = this.key?.textContent ?? `${worksText.confidentiality}:`;
    this.valText = this.val?.textContent ?? worksText.public;
  }

  /** At enter: the body sits under the frost and its text under the bars, seen softly. */
  frostOn(overlay: boolean) {
    if (!this.wrap || !this.frost) return;
    this.overlay = overlay && !!this.svg && !!this.label;
    this.frost.style.visibility = "visible";
    this.frost.style.opacity = "1";
    this.mask(0);
    if (this.overlay) {
      this.measure();
      this.svg!.style.visibility = "visible";
      this.label!.style.visibility = "visible";
      this.label!.style.opacity = "1";
      this.marks.forEach((m) => (m.style.opacity = "0"));
      this.setLine("");
      this.pt?.setAttribute("r", "0");
      if (this.key) this.key.textContent = "";
      if (this.val) this.val.textContent = "";
    }
    this.lay();
    // fonts arriving or a resize move the lines: lay the bars again where they now are
    let raf = 0;
    const again = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!this.covers.length) return;
        if (this.overlay) this.measure();
        this.lay();
        this.bars(performance.now());
      });
    };
    addEventListener("resize", again);
    document.fonts?.addEventListener("loadingdone", again);
    this.relay = () => {
      removeEventListener("resize", again);
      document.fonts?.removeEventListener("loadingdone", again);
    };
  }

  /** The PV beat from D0 (absolute ms); onReveal fires as the clearing front starts. */
  play(d0: number, onReveal: () => void) {
    const rel = (ms: number) => d0 + ms - performance.now();
    if (this.overlay) {
      // D1: the marks stutter on a frame apart (TL → TR → BL → BR); D2 out again
      this.marks.forEach((m, i) => {
        this.stops.push(stepped(SEQ.stutterOn, (v) => (m.style.opacity = String(v)), { delay: rel(48 + i * TICK) }));
        this.stops.push(stepped(SEQ.stutterOut, (v) => (m.style.opacity = String(v)), { delay: rel(2206 + i * TICK) }));
      });
      // D6: LABEL: then VALUE, each typed in a fixed 400 ms
      if (this.key) this.stops.push(typeText(this.key, this.keyText, { fixed: 400, delay: rel(121) }));
      if (this.val) this.stops.push(typeText(this.val, this.valText, { fixed: 400, delay: rel(921) }));
    }
    this.revealAt = d0 + dms(D_REVEAL);
    let revealed = false;
    let clear = false;
    this.loop = onFrame((now) => {
      const el = now - d0;
      if (el < 0) return;
      const T = D_START + (el * DECRYPT_RATE) / 1000;
      if (this.overlay && !clear) this.drawOverlay(T, el);
      if (T >= D_REVEAL) {
        if (!revealed) {
          revealed = true;
          onReveal();
        }
        this.mask(sampleCurve(REVEAL, T));
        this.bars(now);
      }
      if (T >= D_END && !clear) {
        clear = true;
        this.hideOverlay();
        this.frostOff();
      }
      if (clear && now >= this.revealAt + BARS_MS) {
        this.loop = null;
        this.clear();
        return false;
      }
    });
  }

  /** Phones: no marks or line; the clearing front and the bars from `at` (absolute ms). */
  front(at: number, onReveal: () => void) {
    this.revealAt = at;
    let revealed = false;
    this.loop = onFrame((now) => {
      if (now < at) return;
      if (!revealed) {
        revealed = true;
        onReveal();
      }
      const c = sampleCurve(REVEAL, D_REVEAL + ((now - at) * DECRYPT_RATE) / 1000);
      this.mask(c);
      this.bars(now);
      if (c >= 1) this.frostOff();
      if (c >= 1 && now >= at + BARS_MS) {
        this.loop = null;
        this.clear();
        return false;
      }
    });
  }

  /** Jump to the end: overlay gone, frost gone, bars removed. */
  finish() {
    this.stops.forEach((s) => s());
    this.stops = [];
    this.loop?.();
    this.loop = null;
    this.clear();
  }

  /** Stop where it is (the screen is being left mid-reveal). */
  halt() {
    this.loop?.();
    this.loop = null;
    // the typing and stutters are dropped; the overlay goes with the screen
    const stops = this.stops;
    this.stops = [];
    stops.forEach((s) => s());
    this.hideOverlay();
  }

  /** RhineLabUI refrost (clarity · e^(−9.9 t)): the frost thickens again as the glass recedes. */
  refrost(start: number) {
    if (!this.frost || !this.wrap) return;
    const from = this.frost.style.visibility === "visible" ? getComputedStyle(this.frost).opacity : "0";
    this.mask(0);
    this.frost.style.visibility = "visible";
    this.frost.style.opacity = "1";
    this.refrostAnim = anim(this.frost, [{ opacity: from }, { opacity: 1 }], { start, dur: 4600 / 9.9, ease: "exp", fill: "backwards" });
  }

  /** Back to rest (the screen is inactive). */
  reset() {
    this.finish();
    this.refrostAnim?.cancel();
    this.refrostAnim = null;
    this.frostOff();
  }

  private clear() {
    this.relay?.();
    this.relay = null;
    this.hideOverlay();
    this.frostOff();
    for (const c of this.covers) c.win.remove();
    this.covers = [];
    this.root.querySelectorAll(".is-occluded").forEach((t) => t.classList.remove("is-occluded"));
    if (this.key) this.key.textContent = this.keyText;
    if (this.val) this.val.textContent = this.valText;
  }

  private frostOff() {
    if (!this.frost) return;
    this.frost.style.removeProperty("visibility");
    this.frost.style.removeProperty("opacity");
    this.frost.style.removeProperty("mask-image");
    this.frost.style.removeProperty("-webkit-mask-image");
  }

  private hideOverlay() {
    if (this.svg) this.svg.style.removeProperty("visibility");
    if (this.label) {
      this.label.style.removeProperty("visibility");
      this.label.style.removeProperty("opacity");
    }
  }

  /** Glass reveal at C5 values: clear above the front, frosted below, a 35 % feather between. */
  private mask(clarity: number) {
    if (!this.frost) return;
    const edge = 1 - (1 + FEATHER) * clamp01(clarity);
    const a = ((1 - edge - FEATHER) * 100).toFixed(2);
    const b = ((1 - edge) * 100).toFixed(2);
    const m = `linear-gradient(to bottom, transparent ${a}%, #000 ${b}%)`;
    this.frost.style.setProperty("-webkit-mask-image", m);
    this.frost.style.setProperty("mask-image", m);
  }

  private geo = { w: 0, h: 0, u: 1 };

  /** The overlay works in the body wrapper's own pixels (it shares the glass's perspective). */
  private measure() {
    if (!this.wrap || !this.svg) return;
    const w = this.wrap.clientWidth;
    const h = this.wrap.clientHeight;
    const u = unit();
    this.geo = { w, h, u };
    this.svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const s = Math.max(5, 10 * u);
    const at: Record<string, [number, number]> = { tl: [0.03, 0.03], tr: [0.97, 0.03], bl: [0.03, 0.97], br: [0.97, 0.97] };
    for (const m of this.marks) {
      const [fx, fy] = at[m.dataset.c ?? "tl"] ?? [0.03, 0.03];
      m.setAttribute("x", (fx * w - s / 2).toFixed(1));
      m.setAttribute("y", (fy * h - s / 2).toFixed(1));
      m.setAttribute("width", s.toFixed(1));
      m.setAttribute("height", s.toFixed(1));
    }
    this.pt?.setAttribute("cx", (w / 2).toFixed(1));
    this.pt?.setAttribute("cy", (h / 2).toFixed(1));
    this.lineD = "";
  }

  private setLine(d: string) {
    if (d === this.lineD || !this.line) return;
    this.lineD = d;
    this.line.setAttribute("d", d);
  }

  private drawOverlay(T: number, el: number) {
    const { w, h, u } = this.geo;
    // 5 % inside the BL mark to 5 % inside the TR mark
    const P = (t: number) => `${(w * (0.05 + 0.9 * t)).toFixed(1)} ${(h * (0.95 - 0.9 * t)).toFixed(1)}`;
    const ivs: [number, number][] = [];
    if (T >= 34.24 && T < 36.04) {
      const g = sampleCurve(GROW, T);
      if (g > 0) ivs.push([0, g / 2], [1 - g / 2, 1]);
    } else if (T >= 36.04 && T < D_REVEAL) {
      const r = sampleCurve(RETRACT, T);
      if (r > 0) ivs.push([0.5 - r / 2, 0.5 + r / 2]);
    }
    this.setLine(ivs.map(([a, b]) => `M${P(a)}L${P(b)}`).join(""));
    const p = smooth5((T - 38.58) / 0.2) * (1 - smooth5((T - 39.08) / 0.22));
    this.pt?.setAttribute("r", (p * 3 * u).toFixed(2));
    // X2: label and value fade together, 1 − t², from 2158 ms over 291
    if (this.label && el >= 2158) this.label.style.opacity = String(Math.max(0, 1 - ((el - 2158) / 291) ** 2));
  }

  /** Measure every text line of the [data-occlude] blocks and lay one bar over each. */
  private lay() {
    for (const c of this.covers) c.win.remove();
    this.covers = [];
    for (const target of this.root.querySelectorAll<HTMLElement>("[data-occlude]")) {
      if (!target.offsetWidth) continue;
      target.classList.add("is-occluded");
      const bounds = target.getBoundingClientRect();
      const scale = bounds.width / target.offsetWidth;
      if (!scale || !Number.isFinite(scale)) continue;
      const lines: { x: number; y: number; right: number; bottom: number }[] = [];
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (!r.width || !r.height) continue;
          const x = (r.left - bounds.left) / scale;
          const y = (r.top - bounds.top) / scale;
          const right = (r.right - bounds.left) / scale;
          const bottom = (r.bottom - bounds.top) / scale;
          const line = lines.find((l) => Math.abs(l.y - y) < 6);
          if (line) {
            line.x = Math.min(line.x, x);
            line.y = Math.min(line.y, y);
            line.right = Math.max(line.right, right);
            line.bottom = Math.max(line.bottom, bottom);
          } else lines.push({ x, y, right, bottom });
        }
      }
      for (const l of lines) {
        const win = document.createElement("span");
        win.className = "occl";
        win.setAttribute("aria-hidden", "true");
        const left = Math.max(0, l.x - 1);
        const right = Math.min(target.clientWidth, l.right + 1);
        win.style.cssText = `left:${left.toFixed(1)}px;top:${(l.y - 1).toFixed(1)}px;width:${(right - left).toFixed(1)}px;height:${(l.bottom - l.y + 2).toFixed(1)}px`;
        const ink = document.createElement("i");
        win.append(ink);
        target.append(win);
        this.covers.push({ win, ink, order: this.covers.length });
      }
    }
  }

  /** R12: brief acceleration, decisive departure, long deceleration; lines a little apart. */
  private bars(now: number) {
    if (!this.covers.length) return;
    const p = clamp01((now - this.revealAt) / BARS_MS);
    const count = Math.max(1, this.covers.length - 1);
    for (const c of this.covers) {
      const t = clamp01((p - (c.order / count) * 0.22) / 0.78);
      const e = t < 0.2 ? 0.4 * (t / 0.2) ** 2 : 1 - 0.6 * ((1 - t) / 0.8) ** (16 / 3);
      c.ink.style.transform = `translateX(${(e * 101).toFixed(2)}%)`;
    }
  }
}

// ───────── screen runs ─────────

type Run = {
  id: ScreenId;
  root: HTMLElement;
  kind: NavKind;
  first: boolean;
  fast: boolean;
  phone: boolean;
  reduced: boolean;
  /** The entry's cues and animations; its t0 is the navigation start. */
  tl: Timeline;
  phase: Phase | null;
  /** performance.now() at dock (sections) or enter (home). */
  t0: number;
  settled: boolean;
  early: boolean;
  reveal: Reveal | null;
  off: AbortController | null;
  /** Docked drift and glass push: they outlive the entry. */
  ambient: Animation[];
  drifting: boolean;
};

export class App {
  private html = document.documentElement;
  private prefs = new Prefs();
  private modules: Record<ScreenId, ScreenModule> = {
    home: createHome(),
    profile: createProfile(),
    skills: createSkills(),
    works: createWorks(),
    activity: createActivity(),
    contact: createContact(),
    system: createSystem(),
  };
  private roots = {} as Record<ScreenId, HTMLElement>;
  private entered = new Set<ScreenId>();
  private current: ScreenId | null = null;
  /** The screen whose module enter() has run without a leave() yet. */
  private live: ScreenId | null = null;
  private runs = new Map<ScreenId, Run>();
  private exits = new Map<ScreenId, Timeline>();
  private navAt = -Infinity;
  /** Chrome animations by role: a new one starts from what the old one shows. */
  private chromeAnims = new Map<string, Animation[]>();
  /** Set while an early finish drains timelines: label swaps and typing go instant. */
  private finishing = false;
  private captionTyped = false;
  private plates: Plates | null = null;
  private platesLoading = false;
  private platesOff = 0;
  private boot: BootRun | null = null;
  private cancelCaption: Cancel = () => {};
  private cancelNote: Cancel = () => {};
  private toastTimer = 0;
  private toastAnim: Animation | null = null;
  private themeTimer = 0;
  private lastDown: { x: number; y: number; t: number } | null = null;
  private idle = false;
  private phoneQuery = matchMedia(PHONE_QUERY);
  private fineQuery = matchMedia(FINE_QUERY);
  /** Aborted if init fails, so the plain fallback page keeps no handlers. */
  private ac = new AbortController();
  private clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: identity.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  constructor(private canvas: HTMLCanvasElement | null) {}

  async init() {
    try {
      await this.start();
    } catch (e) {
      this.ac.abort();
      throw e;
    }
  }

  private async start() {
    for (const id of ORDER) {
      const el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`);
      if (!el) throw new Error(`missing screen ${id}`);
      if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
      this.roots[id] = el;
      el.querySelectorAll<HTMLElement>("[data-reveal]").forEach((r, i) => r.style.setProperty("--i", String(i)));
    }
    // the overview's blocks are theme-cascade cells too (their markup is the overview's own)
    document.querySelectorAll<HTMLElement>(".home__co, .home__centre, .home__id, .home__leaders, .home__flat").forEach((el) => el.setAttribute("data-tc", ""));
    const ctx = this.context();
    for (const id of ORDER) this.modules[id].init(this.roots[id], ctx);

    this.applyPrefs();
    const offPrefs = this.prefs.on(() => this.applyPrefs());
    this.ac.signal.addEventListener("abort", () => {
      offPrefs();
      this.plates?.dispose();
      this.plates = null;
      this.html.classList.remove("gl-on");
    });
    this.bindInput();
    this.bindHover();
    this.startClock();

    const first = screenFromHash(location.hash) ?? "home";
    const deepLink = first !== "home";
    let seen = false;
    try {
      seen = sessionStorage.getItem(BOOTED_KEY) === "1";
      sessionStorage.setItem(BOOTED_KEY, "1");
    } catch {
      /* storage unavailable */
    }

    // the 3D's first frames are long tasks: they wait for a still moment of the opening ("idle")
    const hadFocus = await this.playBoot({ reduced: this.prefs.reduced() || deepLink, short: seen, onIdle: () => void this.loadPlates(first) });
    void this.loadPlates(first);
    // a click during the exit fade may already have opened a screen
    if (this.current === null) this.show(first, { initial: true });
    // a deep link lands in its section, so the arrow keys scroll it straight away (phones)
    if (hadFocus || (deepLink && document.activeElement === document.body)) this.roots[this.current ?? first].focus({ preventScroll: true });
  }

  // ───────── opening ─────────

  /** Plays the opening. Resolves to whether it held keyboard focus (SKIP) at the end. */
  private async playBoot(o: { reduced: boolean; short: boolean; onIdle?: () => void; onWelcome?: () => void }): Promise<boolean> {
    const root = document.querySelector<HTMLElement>("[data-boot]");
    if (!root) return false;
    this.html.classList.add("is-booting");
    root.hidden = false;
    // Did keyboard focus go into the opening (SKIP)? SKIP hides itself before the
    // end, which can drop focus to <body> on its own, so track it as it moves.
    let held = false;
    const watch = new AbortController();
    root.addEventListener("focusin", () => (held = true), { signal: watch.signal });
    root.addEventListener("focusout", (e) => (held = !e.relatedTarget || root.contains(e.relatedTarget as Node)), { signal: watch.signal });
    let welcomed = false;
    const welcome = () => {
      if (welcomed) return;
      welcomed = true;
      o.onWelcome?.();
    };
    this.boot = runBoot(root, {
      reduced: o.reduced,
      short: o.short,
      onPhase: (p) => {
        if (p === "idle") o.onIdle?.();
        if (p === "welcome") {
          welcome();
          this.plates?.setFormation("hidden", { immediate: true });
        }
        if (p === "exit") {
          // a reduced run has no welcome beat
          welcome();
          this.html.classList.remove("is-booting");
          this.plates?.setFormation(this.current && this.current !== "home" ? "chain" : "infinity");
        }
      },
    });
    await this.boot.finished;
    this.boot = null;
    watch.abort();
    const a = document.activeElement;
    const hadFocus = held && (!a || a === document.body || root.contains(a));
    root.hidden = true;
    this.html.classList.remove("is-booting");
    return hadFocus;
  }

  private async replayBoot() {
    if (this.boot) return;
    const target = this.current ?? "home";
    this.captionTyped = false;
    await this.playBoot({
      reduced: this.prefs.reduced(),
      short: false,
      // while the welcome card covers everything, swap the section beneath it for the overview
      onWelcome: () => {
        if (this.current !== target || target === "home") return;
        history.pushState({ screen: "home" }, "", location.pathname + location.search);
        this.show("home", { initial: true });
      },
    });
    // the REPLAY button that had focus left with its screen
    this.roots[this.current ?? "home"].focus({ preventScroll: true });
  }

  // ───────── screens ─────────

  private context(): ScreenContext {
    return {
      prefs: this.prefs,
      reduced: () => this.prefs.reduced(),
      go: (id) => this.navigate(id),
      toast: (m) => this.toast(m),
      log: (l) => this.log(l),
      caption: (t) => this.caption(t),
      plates: () => this.plates,
      replayBoot: () => void this.replayBoot(),
      finishReveal: () => {
        const run = this.current ? this.runs.get(this.current) : undefined;
        if (run) this.finish(run);
      },
      phase: () => (this.current ? (this.runs.get(this.current)?.phase ?? "settled") : "settled"),
    };
  }

  private phone() {
    return this.phoneQuery.matches;
  }

  /** User navigation: update history, then show. */
  navigate(id: ScreenId) {
    if (id === this.current) return;
    const url = id === "home" ? location.pathname + location.search : `#${id}`;
    history.pushState({ screen: id }, "", url);
    this.show(id, { focus: true });
  }

  private show(id: ScreenId, o: { initial?: boolean; focus?: boolean } = {}) {
    if (id === this.current) return;
    const prev = this.current;
    const now = performance.now();
    // a navigate within 400 ms of the last one skips the empty stage (input-driven, §7.6)
    const rapid = now - this.navAt < 400;
    this.navAt = now;
    const reduced = this.prefs.reduced();
    const phone = this.phone();
    const kind: NavKind = o.initial || !prev ? (id === "home" ? "boot-home" : "initial") : prev === "home" ? "home-sect" : id === "home" ? "sect-home" : "sect-sect";
    this.current = id;
    dispatchEvent(new CustomEvent("rl:nav", { detail: { from: prev, to: id, kind } }));
    const zoom = kind === "home-sect" && !phone && !reduced ? this.zoomCentre(id) : null;

    // outgoing: every other screen that is shown, or about to be
    for (const sid of ORDER) if (sid !== id) this.dismiss(sid, kind, { instant: !!o.initial, reduced, phone, zoom });

    // chrome that changes at once
    this.html.dataset.screen = id;
    const s = id === "home" ? null : sectionById[id as SectionId];
    document.title = s ? `${s.label} · ${identity.name}` : `${identity.name} · Analysis OS`;
    for (const a of document.querySelectorAll<HTMLElement>("[data-pager], [data-nav]")) {
      const on = (a.dataset.pager ?? a.dataset.nav) === id;
      if (on === a.hasAttribute("aria-current")) continue;
      if (on) {
        a.setAttribute("aria-current", "page");
        if (a.dataset.pager) this.pagerPop(a);
      } else a.removeAttribute("aria-current");
    }
    this.revealTab(id);
    if (s) this.log(`> ACCESS ${s.code}`);
    else if (!o.initial) this.log("> RETURN TO OVERVIEW");

    this.admit(id, kind, prev, { rapid, reduced, phone, zoom, focus: !!o.focus });
  }

  /** The zoom-through centre (§7.2): the target's anchor dot, else the pointer, else the middle. */
  private zoomCentre(id: ScreenId): { x: number; y: number; anchor: string | null } {
    const home = this.roots.home;
    const co = [...home.querySelectorAll<HTMLElement>("[data-callout]")].find((el) => el.matches(`[href="#${id}"]`) || !!el.querySelector(`[href="#${id}"]`));
    const anchor = co?.dataset.callout ?? null;
    if (anchor) {
      const dot = home.querySelector(`[data-anchor-dot="${anchor}"], .home__leaders [data-anchor="${anchor}"]`);
      const r = dot?.getBoundingClientRect();
      if (r && r.width + r.height > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, anchor };
    }
    const d = this.lastDown;
    if (d && performance.now() - d.t < 1500) return { x: d.x, y: d.y, anchor };
    if (co) {
      const r = co.getBoundingClientRect();
      if (r.width) return { x: r.left + r.width / 2, y: r.top + r.height / 2, anchor };
    }
    return { x: innerWidth / 2, y: innerHeight / 2, anchor };
  }

  private setPhase(run: Run, p: Phase) {
    const root = run.root;
    if (p === "leave") root.dataset.exit = "";
    if (p === "leave" && run.phase !== "settled") {
      // an overtaken entry (§7.6): data-phase stays, so the CSS builds keyed on it keep their
      // selectors and freeze where they are (motion.css) instead of snapping to the base styles
      root.classList.add("is-held");
    } else {
      root.dataset.phase = p;
      // the old class stays as an alias from enter until settled
      root.classList.toggle("is-entering", p === "enter" || p === "dock" || p === "reveal");
    }
    run.phase = p;
    const info: PhaseInfo = { kind: run.kind, first: run.first, fast: run.fast, t0: run.t0 };
    dispatchEvent(new CustomEvent("rl:phase", { detail: { screen: run.id, phase: p, kind: run.kind, first: run.first, fast: run.fast } }));
    try {
      this.modules[run.id].phase?.(p, info);
    } catch (e) {
      console.error(e);
    }
  }

  /** The outgoing side of a navigation: its exit plays from what is on screen now. */
  private dismiss(sid: ScreenId, kind: NavKind, o: { instant: boolean; reduced: boolean; phone: boolean; zoom: { x: number; y: number } | null }) {
    const root = this.roots[sid];
    const run = this.runs.get(sid);
    const shown = root.classList.contains("is-active");
    if (run && !run.settled) {
      // an overtaken entry stops where it is; its pending cues are dropped
      run.tl.pause();
      run.reveal?.halt();
      run.off?.abort();
    }
    if (!shown) {
      // never shown: it simply never builds
      if (run) this.deactivate(sid);
      return;
    }
    if (this.exits.has(sid)) return;
    if (this.live === sid) {
      this.modules[sid].leave?.();
      this.live = null;
    }
    if (run) this.setPhase(run, "leave");
    if (o.instant) {
      this.deactivate(sid);
      return;
    }
    const ex = timeline();
    this.exits.set(sid, ex);
    const t = ex.t0;
    const cs = getComputedStyle(root);
    let end: number;
    if (o.reduced || o.phone) {
      // reduced: the 145 ms cross-fade; phones: the P4 content clear
      end = o.reduced ? F(4) : F(13);
      ex.play(root, [{ opacity: cs.opacity }, { opacity: 0 }], { at: 0, dur: end, ease: o.reduced ? "linear" : "p4" });
    } else if (sid === "home") {
      // M10 zoom-through: the overview (and the plates) push in to ×2.35 and blur, then cut
      end = F(7);
      const z = o.zoom ?? { x: innerWidth / 2, y: innerHeight / 2 };
      root.style.transformOrigin = `${z.x.toFixed(1)}px ${z.y.toFixed(1)}px`;
      ex.play(root, [{ scale: cs.scale === "none" ? "1" : cs.scale, filter: cs.filter === "none" ? "blur(0px)" : cs.filter }, { scale: "2.35", filter: "blur(16px)" }], { at: 0, dur: end, ease: "inCubic" });
      if (this.canvas && this.html.classList.contains("gl-on")) {
        this.canvas.style.transformOrigin = root.style.transformOrigin;
        ex.play(this.canvas, [{ scale: "1", filter: "blur(0px)" }, { scale: "2.35", filter: "blur(16px)" }], { at: 0, dur: end, ease: "inCubic" });
      }
    } else if (kind === "sect-home") {
      const dark = this.html.dataset.theme === "dark";
      const veil = document.querySelector<HTMLElement>(".veil");
      const from = { scale: cs.scale === "none" ? "1" : cs.scale, filter: cs.filter === "none" ? "blur(0px)" : cs.filter };
      root.style.transformOrigin = "50% 50%";
      if (!dark) {
        // M12 white-out and shrink: the paper goes white, the file shrinks away and pales
        end = F(23);
        if (veil) ex.play(veil, [{ opacity: 0 }, { opacity: 1 }], { at: 0, dur: F(16), ease: "linear", fill: "forwards" });
        ex.play(root, [from, { scale: "0.5", filter: "blur(8px)" }], { at: 0, dur: end, ease: "exit" });
        ex.play(root, [{ opacity: cs.opacity }, { opacity: cs.opacity, offset: (end - F(6)) / end }, { opacity: 0.43 }], { at: 0, dur: end, ease: "linear" });
      } else {
        // M11 push-in to dark: the file flies at the viewer while the room goes black
        end = F(21);
        if (veil) ex.play(veil, [{ opacity: 0 }, { opacity: 1 }], { at: 0, dur: end, ease: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" });
        ex.play(root, [from, { scale: "1.85", filter: "blur(8px)" }], { at: 0, dur: end, ease: "exit" });
      }
    } else {
      // §5.18 split exit: the card whips off left while the glass recedes right
      end = 382;
      const u = unit();
      const card = root.querySelector<HTMLElement>(".sect__card");
      const glass = root.querySelector<HTMLElement>(".sect__glass");
      const wrap = root.querySelector<HTMLElement>(".sect__bodywrap");
      if (card) {
        const c = getComputedStyle(card);
        ex.play(card, [{ translate: c.translate === "none" ? "0px 0px" : c.translate }, { translate: `${(-(253 + 400 + 60) * u).toFixed(1)}px 0px` }], { at: 0, dur: F(5), ease: "exit" });
        this.blur(ex, card, "rl-mb-out", 0, [0, 4, 9, 14, 0]);
      }
      if (glass) {
        const g = getComputedStyle(glass);
        ex.play(glass, [{ translate: g.translate === "none" ? "0px 0px" : g.translate, scale: g.scale === "none" ? "1" : g.scale, filter: g.filter === "none" ? "blur(0px)" : g.filter }, { translate: "40% 0px", scale: "0.72", filter: "blur(12px)" }], { at: 0, dur: end, ease: "recede" });
        ex.play(glass, [{ opacity: g.opacity }, { opacity: g.opacity, offset: 237 / end }, { opacity: 0 }], { at: 0, dur: end, ease: "linear" });
      }
      // front layers move farther than the glass
      if (wrap) ex.play(wrap, [{ translate: "0px 0px" }, { translate: "10% 0px" }], { at: 0, dur: end, ease: "recede" });
      (run?.reveal ?? new Reveal(root)).refrost(t);
    }
    ex.at(end, () => this.deactivate(sid));
  }

  /** The screen leaves the stage: every animation and inline state goes back to rest. */
  private deactivate(sid: ScreenId) {
    const root = this.roots[sid];
    const run = this.runs.get(sid);
    if (run) {
      run.tl.cancel();
      run.off?.abort();
      run.ambient.forEach((a) => a.cancel());
      run.reveal?.reset();
      this.runs.delete(sid);
    }
    this.exits.get(sid)?.cancel();
    this.exits.delete(sid);
    if (this.live === sid) {
      this.modules[sid].leave?.();
      this.live = null;
    }
    root.classList.remove("is-active", "is-entering", "is-held");
    delete root.dataset.phase;
    delete root.dataset.exit;
    root.style.removeProperty("transform-origin");
    root.querySelectorAll<HTMLElement>(".sect__card").forEach((c) => c.style.removeProperty("filter"));
    if (root.scrollTop) root.scrollTop = 0;
    if (this.canvas && !this.canvas.getAnimations().length) this.canvas.style.removeProperty("transform-origin");
  }

  /** Motion-blur steps on the shared SVG filter, one value per frame (u). */
  private blur(tl: Timeline, el: HTMLElement, id: string, at: number, steps: number[]) {
    const f = document.querySelector(`#${id} feGaussianBlur`);
    if (!f) return;
    steps.forEach((sd, k) =>
      tl.at(at + k * TICK, () => {
        if (sd > 0) {
          f.setAttribute("stdDeviation", `${(sd * unit()).toFixed(2)} 0`);
          el.style.filter = `url(#${id})`;
        } else el.style.removeProperty("filter");
      }),
    );
  }

  /** The incoming side: schedules the whole entry on one timeline. */
  private admit(id: ScreenId, kind: NavKind, prev: ScreenId | null, o: { rapid: boolean; reduced: boolean; phone: boolean; zoom: { x: number; y: number; anchor: string | null } | null; focus: boolean }) {
    const root = this.roots[id];
    const plates = () => this.plates;
    // coming back to a screen that is still leaving: from where it is, the fast way
    if (this.exits.has(id)) {
      this.comeBack(id, kind, prev, o.focus);
      this.chromeFor(id, kind, timeline(), 0, 0, o);
      return;
    }
    const first = !this.entered.has(id);
    const run: Run = {
      id,
      root,
      kind,
      first,
      fast: !first || o.phone || o.reduced,
      phone: o.phone,
      reduced: o.reduced,
      tl: timeline(),
      phase: null,
      t0: performance.now(),
      settled: false,
      early: false,
      reveal: id === "home" ? null : new Reveal(root),
      off: null,
      ambient: [],
      drifting: false,
    };
    this.runs.set(id, run);
    const tl = run.tl;
    const activate = (phaseEnter = true) => {
      this.entered.add(id);
      root.classList.add("is-active");
      this.live = id;
      if (phaseEnter) this.setPhase(run, "enter");
      try {
        this.modules[id].enter?.(prev, first);
      } catch (e) {
        console.error(e);
      }
      if (o.focus) root.focus({ preventScroll: true });
      if (!run.settled) this.bindFinish(run);
    };

    // ── reduced motion: one 145 ms cross-fade, settled at once ──
    if (o.reduced) {
      activate(false);
      if (prev) run.ambient.push(anim(root, [{ opacity: 0 }, { opacity: 1 }], { start: tl.t0, dur: F(4), ease: "linear" }));
      this.chromeFor(id, kind, tl, 0, 0, o);
      this.plates?.setFormation(id === "home" ? "infinity" : "chain", { immediate: true });
      this.settle(run);
      return;
    }

    // when the screen appears, relative to the navigation start
    let a: number;
    if (o.phone) a = prev && kind !== "boot-home" && kind !== "initial" ? F(13) : 0;
    else if (kind === "sect-sect") a = o.rapid ? 382 : F(18.5);
    else if (kind === "home-sect") a = F(7);
    else if (kind === "sect-home") a = this.html.dataset.theme === "dark" ? F(22) : F(24);
    else a = 0;

    if (id === "home") {
      // ── the overview (§7.3 from t1): D1 builds it; plates go back to the ∞ ──
      when(tl, a, () => {
        activate();
        run.t0 = performance.now();
        if (kind === "sect-home") plates()?.setFormation("infinity");
      });
      if (kind === "sect-home") tl.at(a + 1600, () => plates()?.pulse({ anchor: "centre" }));
      this.chromeFor(id, kind, tl, a, a, o);
      const build = Number(root.dataset.buildMs) || HOME_BUILD_MS;
      tl.at(a + build, () => this.settle(run));
      return;
    }

    // ── a section file ──
    const u = unit();
    const card = root.querySelector<HTMLElement>(".sect__card");
    const glass = root.querySelector<HTMLElement>(".sect__glass");
    const mode = o.phone ? "phone" : kind === "home-sect" ? "zoom" : "card";
    let t0: number;
    if (mode === "card") {
      // C1 in from off-screen right to the right dock, C2 hold, C3 dock slide
      t0 = a + F(11) + F(15);
      if (card) {
        const restLeft = card.getBoundingClientRect().left - (parseFloat(getComputedStyle(card).translate) || 0);
        const xDock = (1365 - 253) * u;
        const xOff = innerWidth - restLeft + 12 * u;
        tl.play(card, [{ translate: `${xOff.toFixed(1)}px 0px` }, { translate: `${xDock.toFixed(1)}px 0px` }], { at: a, dur: F(11), ease: "expo" });
        tl.play(card, [{ translate: `${xDock.toFixed(1)}px 0px` }, { translate: "0px 0px" }], { at: t0, dur: F(14), ease: "c3", fill: "forwards" });
        this.blur(tl, card, "rl-mb", a, [10, 6, 3, 1, 0]);
        this.blur(tl, card, "rl-mb", t0, [8, 5, 2, 0]);
      }
      // P1: the glass fades in place a frame after the dock starts
      if (glass) tl.play(glass, [{ opacity: 0 }, { opacity: 1 }], { at: t0 + TICK, dur: F(13.5), ease: "p1" });
    } else if (mode === "zoom") {
      // M10, second half: the file arrives at ×0.62 about the same centre and settles
      t0 = a + F(4);
      const z = o.zoom ?? { x: innerWidth / 2, y: innerHeight / 2, anchor: null };
      root.style.transformOrigin = `${z.x.toFixed(1)}px ${z.y.toFixed(1)}px`;
      tl.play(root, [{ scale: "0.62" }, { scale: "1" }], { at: a, dur: F(14), ease: "quart" });
      tl.play(root, [{ filter: "blur(12px)" }, { filter: "blur(0px)" }], { at: a, dur: F(9), ease: "quart" });
      when(tl, 0, () => plates()?.pulse(z.anchor ? { anchor: z.anchor } : { x: z.x, y: z.y }));
      tl.at(a, () => {
        plates()?.setFormation("chain", { immediate: true });
        if (this.canvas && this.html.classList.contains("gl-on")) {
          this.canvas.getAnimations().forEach((x) => x.cancel());
          this.canvas.style.transformOrigin = root.style.transformOrigin;
          tl.play(this.canvas, [{ scale: "0.62" }, { scale: "1" }], { at: a, dur: F(14), ease: "quart", fill: "forwards" });
          tl.play(this.canvas, [{ filter: "blur(12px)" }, { filter: "blur(0px)" }], { at: a, dur: F(9), ease: "quart", fill: "forwards" });
        }
      });
    } else {
      // phones: tile and glass fade in place together
      t0 = a + TICK;
      if (card) tl.play(card, [{ opacity: 0 }, { opacity: 1 }], { at: a, dur: F(13.5), ease: "p1" });
      if (glass) tl.play(glass, [{ opacity: 0 }, { opacity: 1 }], { at: a, dur: F(13.5), ease: "p1" });
    }

    // the reveal: a first visit decrypts (desktop) or clears the frost (phones)
    const decrypt = first && mode !== "phone";
    const frostOnly = first && mode === "phone";
    const d0 = t0 + F(7);
    const revealAt = decrypt ? d0 + dms(D_REVEAL) : frostOnly ? a + F(5) : t0 + TICK;

    when(tl, a, () => {
      activate();
      if (decrypt) run.reveal?.frostOn(true);
      else if (frostOnly) run.reveal?.frostOn(false);
      if (kind === "sect-sect") plates()?.pulse();
      else if (kind === "initial") plates()?.setFormation("chain");
    });
    if (kind === "sect-sect") when(tl, 0, () => plates()?.advance?.(1));

    tl.at(t0, () => {
      run.t0 = performance.now();
      this.setPhase(run, "dock");
    });
    this.chromeFor(id, kind, tl, a, t0, o);
    this.furniture(run, t0);

    if (decrypt) tl.at(d0, () => run.reveal?.play(tl.t0 + d0, () => !run.settled && this.setPhase(run, "reveal")));
    else if (frostOnly) tl.at(a, () => run.reveal?.front(tl.t0 + revealAt, () => !run.settled && this.setPhase(run, "reveal")));
    else tl.at(revealAt, () => this.setPhase(run, "reveal"));

    // docked: the card starts its slow drift (A-28)
    if (mode === "card") tl.at(t0 + F(14), () => this.drift(run));

    const buildMs = Number(root.dataset.buildMs) || 0;
    const revealMs = Number(root.dataset.revealMs) || 0;
    const settleAt = Math.max(decrypt ? d0 + 3724 : 0, frostOnly ? revealAt + BARS_MS : 0, t0 + Math.max(buildMs, FRAME_BUILD_MS), revealAt + revealMs);
    tl.at(settleAt, () => this.settle(run));
  }

  /** Back to a screen that was still leaving: everything returns to rest from where it is. */
  private comeBack(id: ScreenId, kind: NavKind, prev: ScreenId | null, focus: boolean) {
    const root = this.roots[id];
    const els = [root, ...root.querySelectorAll<HTMLElement>(".sect__card, .sect__glass, .sect__bodywrap")];
    const snap = els.map((el) => {
      const c = getComputedStyle(el);
      return { el, translate: c.translate === "none" ? "0px 0px" : c.translate, scale: c.scale === "none" ? "1" : c.scale, filter: c.filter === "none" ? "blur(0px)" : c.filter, opacity: c.opacity };
    });
    this.exits.get(id)?.cancel();
    this.exits.delete(id);
    root.classList.remove("is-held");
    delete root.dataset.exit;
    const old = this.runs.get(id);
    old?.reveal?.reset();
    old?.ambient.forEach((a) => a.cancel());
    root.querySelectorAll<HTMLElement>(".sect__card").forEach((c) => c.style.removeProperty("filter"));
    const run: Run = {
      id,
      root,
      kind,
      first: false,
      fast: true,
      phone: this.phone(),
      reduced: false,
      tl: timeline(),
      phase: null,
      t0: performance.now(),
      settled: false,
      early: false,
      // never frosted on the way back in, but a later exit refrosts it, and deactivate resets it
      reveal: id === "home" ? null : new Reveal(root),
      off: null,
      ambient: [],
      drifting: false,
    };
    this.runs.set(id, run);
    root.classList.add("is-active");
    this.live = id;
    try {
      this.modules[id].enter?.(prev, false);
    } catch (e) {
      console.error(e);
    }
    if (focus) root.focus({ preventScroll: true });
    // RhineLabUI surface in: 300 ms ÷ 1.1 from the shown state
    for (const s of snap) {
      run.ambient.push(anim(s.el, [{ translate: s.translate, scale: s.scale, filter: s.filter, opacity: s.opacity }, { translate: "0px 0px", scale: "1", filter: "blur(0px)", opacity: 1 }], { start: run.tl.t0, dur: RL(300), ease: "enter" }));
    }
    this.settle(run);
  }

  /** The frame's own build on the glass (A-07, A-08, A-09), offsets from dock. */
  private furniture(run: Run, t0: number) {
    const { root, tl } = run;
    const u = unit();
    const px = (n: number) => `${(n * u).toFixed(1)}px`;
    const h = root.querySelector(".sect__h");
    // B2 first entrance: the title revealed L→R by a hard edge (shadow room either side)
    if (h) tl.play(h, [{ clipPath: "inset(-40% 100% -40% -12%)" }, { clipPath: "inset(-40% -12% -40% -12%)" }], { at: t0 + F(3), dur: F(12), ease: "wipe" });
    // B5 boxes from the panel edge, then T7b: their text slides in through the box's right edge
    const line = root.querySelector(".sect__access .tag--line");
    const grey = root.querySelector(".sect__access .tag--grey");
    const box = (el: Element | null, at: number, dur: number) =>
      el && tl.play(el, [{ translate: `${px(342)} 0px`, opacity: 0 }, { opacity: 1, offset: 0.01 }, { translate: "0px 0px", opacity: 1 }], { at: t0 + at, dur, ease: "box" });
    const marquee = (el: Element | null, at: number) =>
      el && tl.play(el, [{ translate: `${px(195)} 0px`, opacity: 0 }, { opacity: 1, offset: 0.01 }, { translate: "0px 0px", opacity: 1 }], { at: t0 + at, dur: F(12), ease: "marquee" });
    // the boxes come in through the plate's own edge: clipped there until their text has landed
    const access = root.querySelector<HTMLElement>(".sect__access");
    const plate = root.querySelector<HTMLElement>(".sect__glass");
    if (access && plate && access.offsetParent === plate) {
      const edge = Math.max(0, plate.clientWidth - (access.offsetLeft + access.offsetWidth));
      const clip = `inset(-100% ${(-edge).toFixed(1)}px -100% -100vw)`;
      tl.play(access, [{ clipPath: clip }, { clipPath: clip }], { at: 0, dur: t0 + FRAME_BUILD_MS });
    }
    box(line, F(14), F(21));
    box(grey, F(26), F(20));
    marquee(line?.firstElementChild ?? null, F(38));
    marquee(grey?.firstElementChild ?? null, F(49));
    // T7a: the foot line slides out from behind its ■
    for (const t of root.querySelectorAll(".sect__foot .sq__clip > span")) tl.play(t, [{ translate: `${px(-255)} 0px` }, { translate: "0px 0px" }], { at: t0 + F(11), dur: F(28), ease: "hud" });
    // T11: the ghost word stretches in from the left, out of focus
    const ghost = root.querySelector(".sect__ghost");
    if (ghost) tl.play(ghost, [{ scale: "0.14 1", filter: "blur(6px)", opacity: 0 }, { opacity: 1, offset: 0.02 }, { scale: "1 1", filter: "blur(0px)", opacity: 1 }], { at: t0 + F(18), dur: F(20), ease: "cubic-bezier(0.15, 0, 0, 1)" });
    // P1: each block fades in place, under the frost on a first visit
    root.querySelectorAll("[data-reveal]").forEach((el, i) => tl.play(el, [{ opacity: 0 }, { opacity: 1 }], { at: t0 + TICK + i * F(2), dur: F(13.5), ease: "p1" }));
  }

  /** The chrome's part of a navigation: label, caption, rail, rule and marker (A-10 … A-22). */
  private chromeFor(id: ScreenId, kind: NavKind, tl: Timeline, a: number, t0: number, o: { reduced: boolean; phone: boolean }) {
    const s = id === "home" ? null : sectionById[id as SectionId];
    const foot = document.querySelector<HTMLElement>("[data-foot-sect]");
    const instant = o.reduced;
    const label = (text: string, speed: "fast" | "slow") => foot && swapLabel(foot, text, { speed, instant: instant || this.finishing });
    const t = tl.t0;
    if (s) {
      // the label: SELECTING FILES while files change, the section's name as the card docks
      if (kind === "sect-sect" || kind === "home-sect") label(SELECTING, "slow");
      when(tl, instant ? 0 : t0 + F(9), () => label(s.section, "fast"));
      when(tl, instant ? 0 : t0, () => {
        this.caption(s.caption);
        this.note(s.note);
      });
      if (o.phone) {
        this.html.dataset.view = "sect";
        return;
      }
      const fromHome = kind === "home-sect" || kind === "initial";
      this.html.dataset.view = "sect";
      if (instant) {
        this.chrome("rail", []);
        this.chrome("rail-in", []);
        this.chrome("rule", []);
        this.placeMarker("instant");
      } else if (fromHome) {
        // the rail slides in (H1), the rule draws down (L5), the marker drops onto it (M19)
        this.railIn(t + a);
        this.ruleDraw(t + a);
        this.placeMarker("drop", t + a + 400);
      } else this.placeMarker("move", t);
      return;
    }
    // the overview
    if (kind === "sect-home" && !o.phone && !instant) {
      label("OVERVIEW", "fast");
      this.railOut(t);
      this.ruleRetract(t);
    } else label("OVERVIEW", "fast");
    when(tl, a, () => {
      this.html.dataset.view = "home";
      this.chrome("rail", []);
      this.chrome("rule", []);
      this.chrome("marker", []);
      this.caption(home.caption, kind === "boot-home" && !this.captionTyped ? "type" : "retype");
      this.note(sections[0].note, true);
    });
  }

  /** Arm the early finish (§7.6): any real input inside the screen completes its entry. */
  private bindFinish(run: Run) {
    run.off?.abort();
    const ac = new AbortController();
    run.off = ac;
    const root = run.root;
    const go = () => this.finish(run);
    const o: AddEventListenerOptions = { signal: ac.signal, passive: true, capture: true };
    root.addEventListener("pointerdown", go, o);
    root.addEventListener("wheel", go, o);
    root.addEventListener("touchstart", go, o);
    // the shell focuses the root itself on navigation: that is not the reader's input
    root.addEventListener("focusin", (e) => e.target !== root && go(), o);
    document.addEventListener(
      "keydown",
      (e) => {
        if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
        const t = e.target as Node;
        if (t === document.body || t === this.html || root.contains(t)) go();
      },
      o,
    );
    if (run.phone) root.addEventListener("scroll", go, o);
  }

  /** Complete an entry now: every cue runs, every animation ends, the reveal jumps to clear. */
  private finish(run: Run) {
    // an overtaken entry is leaving as it stands: nothing finishes it now
    if (run.settled || run.phase === "leave") return;
    run.early = true;
    this.finishing = true;
    try {
      run.tl.finish();
      for (const list of this.chromeAnims.values()) for (const x of list) if (x.effect?.getTiming().iterations !== Infinity) x.finish();
    } finally {
      this.finishing = false;
    }
    this.settle(run);
  }

  private settle(run: Run) {
    if (run.settled) return;
    run.settled = true;
    run.off?.abort();
    run.off = null;
    run.reveal?.finish();
    if (run.early) {
      try {
        this.modules[run.id].finish?.();
      } catch (e) {
        console.error(e);
      }
    }
    this.setPhase(run, "settled");
    // every entry animation ended on a rest state: let CSS hold it from here
    run.tl.cancel();
    if (this.exits.size === 0) this.canvas?.style.removeProperty("transform-origin");
    run.root.querySelectorAll<HTMLElement>(".sect__card").forEach((c) => c.style.removeProperty("filter"));
    if (run.id !== "home" && !run.reduced && !run.phone) {
      if (!run.drifting) this.drift(run);
      this.push(run);
    }
    if (this.idle) this.pingPong();
  }

  /** A-28: the docked card drifts left, exp-out toward −48u over 40 s (composited on top). */
  private drift(run: Run) {
    if (run.drifting || run.reduced || run.phone) return;
    const card = run.root.querySelector(".sect__card");
    if (!card) return;
    run.drifting = true;
    run.ambient.push(anim(card, [{ translate: "0px 0px" }, { translate: `${(-48 * unit()).toFixed(1)}px 0px` }], { start: performance.now(), dur: 40000, ease: "exp", fill: "forwards", composite: "add" }));
  }

  /** A-29: the glass's inner pane and the ghost word push apart from the card, slowly. */
  private push(run: Run) {
    const glass = run.root.querySelector(".sect__glass");
    const ghost = run.root.querySelector(".sect__ghost");
    const start = performance.now();
    if (glass) run.ambient.push(anim(glass, [{ scale: "1" }, { scale: "1.024" }], { start, dur: 40000, ease: "exp", fill: "forwards", pseudo: "::before" }));
    if (ghost) run.ambient.push(anim(ghost, [{ translate: "0px 0px" }, { translate: `${(40 * unit()).toFixed(1)}px 0px` }], { start, dur: 40000, ease: "exp", fill: "forwards" }));
  }

  private step(d: number) {
    const list = sections.map((s) => s.id) as ScreenId[];
    const i = this.current && this.current !== "home" ? list.indexOf(this.current) : d > 0 ? -1 : list.length;
    this.navigate(list[(i + d + list.length) % list.length]);
  }

  // ───────── chrome ─────────

  /** Replace the animations a chrome role runs (the caller read the shown state first). */
  private chrome(key: string, list: Animation[]) {
    this.chromeAnims.get(key)?.forEach((x) => x.cancel());
    this.chromeAnims.set(key, list);
  }

  /** A-10 in: rail entries slide left from +236u (H1), the rest fades in place (P1). */
  private railIn(start: number) {
    const rail = document.querySelector<HTMLElement>("[data-rail]");
    if (!rail) return;
    const u = unit();
    const list: Animation[] = [];
    rail.querySelectorAll(".rail__nav li").forEach((li, i) => {
      list.push(anim(li, [{ translate: `${(236 * u).toFixed(1)}px 0px` }, { translate: "0px 0px" }], { start: start + i * F(2), dur: F(23), ease: "h1", fill: "backwards" }));
      list.push(anim(li, [{ opacity: 0 }, { opacity: 1 }], { start: start + i * F(2), dur: F(4), ease: "linear", fill: "backwards" }));
    });
    for (const el of rail.children) if (!el.classList.contains("rail__nav")) list.push(anim(el, [{ opacity: 0 }, { opacity: 1 }], { start: start + F(12), dur: F(13.5), ease: "p1", fill: "backwards" }));
    this.chrome("rail", []);
    this.chrome("rail-in", list);
  }

  /** A-10 out: H6, the screen-local HUD fades, linear, while the file leaves. */
  private railOut(start: number) {
    const els = [document.querySelector("[data-rail]"), document.querySelector("[data-rule-mark]")].filter((e): e is Element => !!e);
    const list = els.map((el) => anim(el, [{ opacity: getComputedStyle(el).opacity, visibility: "visible" }, { opacity: 0, visibility: "visible" }], { start, dur: F(12), ease: "linear", fill: "forwards" }));
    this.chrome("rail-in", []);
    this.chrome("rail", list);
    this.chrome("marker", []);
  }

  /** A-11: the rule draws down (L5) from where it is. */
  private ruleDraw(start: number) {
    const rule = document.querySelector(".rule");
    if (!rule) return;
    const from = this.chromeAnims.get("rule")?.length ? getComputedStyle(rule).transform : "scaleY(0)";
    this.chrome("rule", [anim(rule, [{ transform: from === "none" ? "scaleY(1)" : from }, { transform: "scaleY(1)" }], { start, dur: F(23), ease: "draw", fill: "backwards" })]);
  }

  /** A-11: the rule retracts toward the top (L4). */
  private ruleRetract(start: number) {
    const rule = document.querySelector(".rule");
    if (!rule) return;
    const from = getComputedStyle(rule).transform;
    this.chrome("rule", [anim(rule, [{ transform: from === "none" ? "scaleY(1)" : from }, { transform: "scaleY(0)" }], { start, dur: F(13), ease: "exit", fill: "forwards" })]);
  }

  /** Where the lime marker belongs: beside the current rail entry, clear of the SECTION tab. */
  private markerY(): number | null {
    const mark = document.querySelector<HTMLElement>("[data-rule-mark]");
    const id = this.current;
    const a = id && document.querySelector<HTMLElement>(`[data-nav="${id}"]`);
    if (!mark || !id || !a) return null;
    const r = a.getBoundingClientRect();
    if (!r.height) return null;
    let y = r.top + r.height / 2;
    // the tab crosses the rule; the marker sits above it, never behind it
    const tab = this.roots[id].querySelector(".sect__tab")?.getBoundingClientRect();
    if (tab?.height) y = Math.min(y, tab.top - mark.offsetHeight / 2 - 6);
    return y;
  }

  /** A-12: M19 onto the current entry, from where the marker is ("move") or from 200u above ("drop"). */
  private placeMarker(mode: "move" | "drop" | "instant", start = performance.now()) {
    const mark = document.querySelector<HTMLElement>("[data-rule-mark]");
    const y = this.markerY();
    if (!mark || y === null) return;
    const from = getComputedStyle(mark).translate;
    mark.style.setProperty("--mark-y", `${y.toFixed(1)}px`);
    if (mode === "instant" || this.prefs.reduced()) {
      this.chrome("marker", []);
      return;
    }
    const to = `0px ${y.toFixed(1)}px`;
    const frames: Keyframe[] =
      mode === "drop"
        ? [{ translate: `0px ${(y - 200 * unit()).toFixed(1)}px`, opacity: 0 }, { opacity: 1, offset: 0.001 }, { translate: to, opacity: 1 }]
        : [{ translate: from && from !== "none" ? from : to }, { translate: to }];
    this.chrome("marker", [anim(mark, frames, { start, dur: F(14), ease: "drop", fill: "backwards" })]);
  }

  /** While idle on a section, the marker ping-pongs along the rule (atlas §3), passing behind the card. */
  private pingPong() {
    const mark = document.querySelector<HTMLElement>("[data-rule-mark]");
    const run = this.current && this.current !== "home" ? this.runs.get(this.current) : undefined;
    if (!mark || !run?.settled || run.phone || this.prefs.reduced() || this.html.classList.contains("is-booting")) return;
    const u = unit();
    const A = 193 * u;
    const B = 707 * u;
    const m = /([-\d.]+)px\s*$/.exec(getComputedStyle(mark).translate);
    const y = m ? Number(m[1]) : A;
    const far = Math.abs(y - A) > Math.abs(y - B) ? A : B;
    const near = far === A ? B : A;
    const first = anim(mark, [{ translate: `0px ${y.toFixed(1)}px` }, { translate: `0px ${far.toFixed(1)}px` }], { start: performance.now(), dur: 4330, ease: "swap", fill: "forwards" });
    const list = [first];
    this.chrome("marker", list);
    first.finished.then(
      () => {
        if (this.chromeAnims.get("marker") !== list) return;
        // legs of 6.2 s with 182 ms dwells at each end, forever
        const leg = 6200;
        const dwell = F(5);
        const P = 2 * (leg + dwell);
        const loop = anim(
          mark,
          [
            { translate: `0px ${far.toFixed(1)}px`, offset: 0, easing: "linear" },
            { translate: `0px ${far.toFixed(1)}px`, offset: dwell / P, easing: cssEase("sweep") },
            { translate: `0px ${near.toFixed(1)}px`, offset: (dwell + leg) / P, easing: "linear" },
            { translate: `0px ${near.toFixed(1)}px`, offset: (2 * dwell + leg) / P, easing: cssEase("sweep") },
            { translate: `0px ${far.toFixed(1)}px`, offset: 1 },
          ],
          { start: performance.now(), dur: P, ease: "linear", iterations: Infinity },
        );
        list.push(loop);
        first.cancel();
      },
      () => {},
    );
  }

  /** A-15: the current ring pops (R7) and the line to it draws (L3), where the pager shows. */
  private pagerPop(a: HTMLElement) {
    if (this.prefs.reduced() || this.html.dataset.view === "sect" || this.phone()) return;
    a.querySelector("i")?.animate([{ transform: "scale(0.465)" }, { transform: "scale(1.55)" }], { duration: F(9), easing: cssEase("pop") });
    a.animate([{ transform: "translateY(-50%) scaleX(0)" }, { transform: "translateY(-50%) scaleX(1)" }], { duration: F(11), easing: cssEase("draw"), pseudoElement: "::before" });
  }

  private setText(sel: string, text: string) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** A-19: the narrator line. A new line retypes (T3 + N6); the first after the opening types (T1). */
  private caption(text: string, how: "retype" | "type" = "retype") {
    // screen readers get the whole line once; the typed copy is aria-hidden
    this.setText("[data-caption-say]", text);
    const el = document.querySelector<HTMLElement>("[data-caption-text]");
    if (!el) return;
    this.cancelCaption();
    const instant = this.prefs.reduced() || this.finishing;
    if (how === "type" || !this.captionTyped) this.cancelCaption = typeText(el, text, { instant });
    else this.cancelCaption = el.textContent === text ? () => {} : retype(el, text, { instant });
    this.captionTyped = true;
  }

  /** A-22: the rail note retypes as the card docks. */
  private note(text: string, instant = false) {
    const el = document.querySelector<HTMLElement>("[data-rail-note]");
    if (!el || el.textContent === text) return;
    this.cancelNote();
    this.cancelNote = retype(el, text, { instant: instant || this.prefs.reduced() || this.finishing });
  }

  /** A-21: a log line types on threes (2–3 chars every 109 ms); the oldest goes in one frame. */
  private log(line: string) {
    const ol = document.querySelector<HTMLOListElement>("[data-log]");
    if (!ol) return;
    const li = document.createElement("li");
    ol.append(li);
    if (this.prefs.reduced()) li.textContent = line;
    else {
      const chars = [...line];
      const steps = [2, 2, 3, 2];
      const plan: number[] = [];
      for (let n = 0, k = 0; n < chars.length; k++) {
        n = Math.min(chars.length, n + steps[k % steps.length]);
        plan.push(n, n, n);
      }
      stepped(plan, (n) => (li.textContent = chars.slice(0, n).join("")));
    }
    if (ol.children.length > 6) {
      const old = ol.firstElementChild;
      window.setTimeout(() => old?.remove(), TICK);
      if (ol.children.length > 7) ol.firstElementChild?.remove();
    }
  }

  /** A-14: RhineLabUI SurfaceTransition at 1.1×: in 273 ms from +12u, out 182 ms to +8u. */
  private toast(message: string) {
    const el = document.querySelector<HTMLElement>("[data-toast]");
    if (!el) return;
    el.textContent = message;
    const reduced = this.prefs.reduced();
    const u = unit();
    const shown = el.classList.contains("is-on");
    const c = getComputedStyle(el);
    const from = { opacity: shown ? c.opacity : "0", translate: shown && c.translate !== "none" ? c.translate : `0px ${(12 * u).toFixed(1)}px` };
    this.toastAnim?.cancel();
    el.classList.add("is-on");
    this.toastAnim = reduced ? null : el.animate([from, { opacity: 1, translate: "0px 0px" }], { duration: RL(300), easing: cssEase("enter") });
    clearTimeout(this.toastTimer);
    // reading time is not scaled
    this.toastTimer = window.setTimeout(() => {
      const d = getComputedStyle(el);
      this.toastAnim?.cancel();
      if (this.prefs.reduced()) {
        el.classList.remove("is-on");
        return;
      }
      const out = el.animate([{ opacity: d.opacity, translate: d.translate === "none" ? "0px 0px" : d.translate }, { opacity: 0, translate: `0px ${(8 * unit()).toFixed(1)}px` }], { duration: RL(200), easing: cssEase("leave"), fill: "forwards" });
      this.toastAnim = out;
      out.finished.then(
        () => {
          if (this.toastAnim !== out) return;
          el.classList.remove("is-on");
          out.cancel();
          this.toastAnim = null;
        },
        () => {},
      );
    }, 2600);
  }

  /** Phone tab bar: scroll the current tab into view if the bar is too narrow for all six. */
  private revealTab(id: ScreenId) {
    const a = document.querySelector<HTMLElement>(`[data-nav="${id}"]`);
    const bar = a?.closest<HTMLElement>(".rail__nav");
    if (!a || !bar || bar.scrollWidth <= bar.clientWidth) return;
    const r = a.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (r.left < b.left) bar.scrollLeft -= b.left - r.left;
    else if (r.right > b.right) bar.scrollLeft += r.right - b.right;
  }

  /** A-20: the clock's digits roll (RhineLabUI rolling clock at 1.1×). */
  private startClock() {
    const slots = (["h", "m", "s"] as const).map((k) => document.querySelector<HTMLElement>(`[data-clock-${k}]`));
    const legacy = document.querySelector<HTMLElement>("[data-clock]");
    if (!legacy) return;
    const tick = () => {
      if (document.hidden) return;
      const parts = this.clockFmt.formatToParts(new Date());
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "--";
      const v = [get("hour"), get("minute"), get("second")];
      if (slots.every((s) => s)) slots.forEach((s, i) => rollText(s!, v[i], { instant: this.prefs.reduced() }));
      else legacy.textContent = `${identity.homebase.toUpperCase()} ${v.join(":")}`;
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    this.ac.signal.addEventListener("abort", () => clearInterval(timer));
  }

  // ───────── preferences, theme & 3D ─────────

  private applyPrefs() {
    const theme = this.prefs.theme();
    const reduced = this.prefs.reduced();
    const was = this.html.dataset.theme;
    if (was && was !== theme && this.current && !reduced) this.cascade(theme);
    else this.html.dataset.theme = theme;
    this.html.dataset.motion = reduced ? "reduced" : "full";
    // switching to reduced stops everything at once
    if (reduced) {
      for (const run of this.runs.values()) if (!run.settled) this.finish(run);
      for (const run of this.runs.values()) run.ambient.forEach((a) => a.cancel());
      this.chrome("marker", []);
    }
    // the browser bar follows the theme actually shown, not only the OS one
    const bg = getComputedStyle(this.html).getPropertyValue("--bg").trim();
    if (bg) for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
    const three = this.prefs.get().three;
    if (this.plates) {
      if (three === "off") {
        // the plates recede first (RhineLabUI release, 1.1 s ÷ 1.1), then the scene goes
        if (!this.platesOff) {
          this.plates.setFormation("hidden", { immediate: reduced });
          this.platesOff = window.setTimeout(
            () => {
              this.platesOff = 0;
              if (this.prefs.get().three !== "off" || !this.plates) return;
              this.plates.dispose();
              this.plates = null;
              this.html.classList.remove("gl-on");
              this.relayout();
            },
            reduced ? 0 : 1000,
          );
        }
      } else {
        if (this.platesOff) {
          clearTimeout(this.platesOff);
          this.platesOff = 0;
          this.plates.setFormation(this.current === "home" ? "infinity" : "chain");
        }
        this.plates.setTheme(theme);
        this.plates.setReduced(reduced);
        this.plates.setQuality(three);
      }
    } else if (three !== "off" && this.current) {
      void this.loadPlates(this.current);
    }
  }

  /** §7.10: the new theme travels out from the control that set it, cell by cell. */
  private cascade(theme: "light" | "dark") {
    const d = this.lastDown;
    let origin = { x: innerWidth / 2, y: innerHeight / 2 };
    const f = document.activeElement;
    if (d && performance.now() - d.t < 2000) origin = { x: d.x, y: d.y };
    else if (f instanceof HTMLElement && f !== document.body) {
      const r = f.getBoundingClientRect();
      if (r.width) origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    dispatchEvent(new CustomEvent("rl:theme", { detail: { theme, origin } }));
    const u = unit();
    for (const cell of document.querySelectorAll<HTMLElement>(TC_CELLS)) {
      const r = cell.getBoundingClientRect();
      const rows = Math.abs(r.top + r.height / 2 - origin.y) / (108 * u);
      const cols = Math.abs(r.left + r.width / 2 - origin.x) / (384 * u);
      cell.style.setProperty("--td", `${Math.min(545, rows * 31 + cols * 100).toFixed(0)}ms`);
    }
    this.html.classList.add("is-theming");
    this.html.dataset.theme = theme;
    clearTimeout(this.themeTimer);
    this.themeTimer = window.setTimeout(() => {
      this.html.classList.remove("is-theming");
      document.querySelectorAll<HTMLElement>(TC_CELLS).forEach((c) => c.style.removeProperty("--td"));
    }, 1073);
  }

  private async loadPlates(target: ScreenId) {
    const three = this.prefs.get().three;
    if (!this.canvas || three === "off" || this.plates || this.platesLoading) return;
    this.platesLoading = true;
    try {
      const { createPlates } = await import("../three/plates.ts");
      const p = await createPlates(this.canvas, { theme: this.prefs.theme(), reduced: this.prefs.reduced(), quality: three });
      const now = this.prefs.get().three;
      if (now === "off" || this.ac.signal.aborted) {
        p.dispose();
        return;
      }
      this.plates = p;
      // preferences may have changed while the chunk was loading
      p.setQuality(now);
      p.setReduced(this.prefs.reduced());
      p.setTheme(this.prefs.theme());
      const at = this.current ?? target;
      // on the overview the plates fly in; elsewhere (or under the opening) they are simply placed
      p.setFormation(this.boot ? "hidden" : at === "home" ? "infinity" : "chain", { immediate: !!this.boot || at !== "home" });
      this.html.classList.add("gl-on");
      this.relayout();
    } catch (e) {
      console.warn("[plates] 3D unavailable:", e);
      this.plates = null;
      this.html.classList.remove("gl-on");
    } finally {
      this.platesLoading = false;
    }
  }

  /** The current screen re-measures (leader lines follow the 3D or the flat figure). */
  private relayout() {
    if (this.current) this.modules[this.current].resize?.();
  }

  // ───────── input ─────────

  private bindInput() {
    const on = { signal: this.ac.signal };

    document.addEventListener(
      "click",
      (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
        if (!a) return;
        const href = a.getAttribute("href")!;
        // the skip link: into the current screen, whichever it is
        if (href === "#main") {
          e.preventDefault();
          this.roots[this.current ?? "home"].focus({ preventScroll: true });
          return;
        }
        const id = screenFromHash(href);
        if (!id) return;
        e.preventDefault();
        this.navigate(id);
      },
      on,
    );

    addEventListener("popstate", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }), on);
    addEventListener("hashchange", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }), on);

    const roots = Object.values(this.roots);
    document.addEventListener(
      "keydown",
      (e) => {
        if (this.boot) {
          if (!["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) this.boot.skip();
          return;
        }
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement;
        if (t.closest("input, textarea, select, [contenteditable]")) {
          if (e.key === "Escape") t.blur();
          return;
        }
        if (this.current && this.modules[this.current].key?.(e)) {
          e.preventDefault();
          return;
        }
        const k = e.key;
        // single-key shortcuts only while no control has focus (WCAG 2.1.4); Esc and ←/→ always work
        const idle = t === document.body || t === this.html || roots.includes(t);
        if (k === "Escape" || (k === "Backspace" && idle)) {
          if (this.current === "home") return;
          this.navigate("home");
        } else if (k === "ArrowRight" || (idle && (k === "e" || k === "E" || k === "]"))) this.step(1);
        else if (k === "ArrowLeft" || (idle && (k === "q" || k === "Q" || k === "["))) this.step(-1);
        else if (idle && /^[1-6]$/.test(k)) this.navigate(sections[Number(k) - 1].id);
        else if (idle && (k === "0" || k === "h" || k === "H")) this.navigate("home");
        else return;
        e.preventDefault();
      },
      on,
    );

    document.addEventListener(
      "pointerdown",
      (e) => {
        this.lastDown = { x: e.clientX, y: e.clientY, t: performance.now() };
        this.boot?.skip();
      },
      { capture: true, signal: this.ac.signal },
    );

    addEventListener(
      "pointermove",
      (e) => {
        this.plates?.setPointer((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
      },
      { passive: true, signal: this.ac.signal },
    );

    // B's idle signal: the marker ping-pongs while nobody touches anything, and comes back on input
    addEventListener(
      "rl:idle",
      (e) => {
        const idle = !!(e as CustomEvent<{ idle: boolean }>).detail?.idle;
        if (idle === this.idle) return;
        this.idle = idle;
        if (idle) this.pingPong();
        else if (this.chromeAnims.get("marker")?.length && this.current !== "home") this.placeMarker("move");
      },
      on,
    );

    // a hidden tab finishes whatever was building, so it is complete when the reader returns
    document.addEventListener(
      "visibilitychange",
      () => {
        if (!document.hidden) return;
        for (const run of [...this.runs.values()]) if (!run.settled && run.root.classList.contains("is-active")) this.finish(run);
        for (const ex of [...this.exits.values()]) ex.finish();
      },
      on,
    );

    // a lost GL context leaves an empty canvas: show the flat ∞ until it comes back
    this.canvas?.addEventListener(
      "webglcontextlost",
      () => {
        this.html.classList.remove("gl-on");
        this.relayout();
      },
      on,
    );
    this.canvas?.addEventListener(
      "webglcontextrestored",
      () => {
        if (!this.plates) return;
        this.html.classList.add("gl-on");
        this.relayout();
      },
      on,
    );

    let resizeRaf = 0;
    addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          this.plates?.resize();
          if (!this.chromeAnims.get("marker")?.some((x) => x.playState === "running")) this.placeMarker("instant");
          else if (this.idle) this.pingPong();
          this.relayout();
        });
      },
      on,
    );
  }

  /** The shared hover vocabulary (atlas §6.7): rail F4, pager F6, brand T6, tile F3 + R9, .btn split, [data-hop] D7. */
  private bindHover() {
    const on = { signal: this.ac.signal };
    const pointerOk = () => this.fineQuery.matches && !this.prefs.reduced() && !this.phone();
    const running = new WeakSet<Element>();
    const lastTile = new WeakMap<Element, number>();

    // the brand's wordmark, one glyph per span, so it can re-pop
    const word = document.querySelector<HTMLElement>(".brand a > b");
    const glyphs: HTMLElement[] = [];
    if (word) {
      const text = word.textContent ?? "";
      word.replaceChildren(
        ...[...text].map((c) => {
          const g = document.createElement("span");
          g.className = "brand__g";
          g.textContent = c;
          if (c.trim()) glyphs.push(g);
          return g;
        }),
      );
    }

    const entering = (e: PointerEvent, sel: string): HTMLElement | null => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>(sel) : null;
      if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return null;
      return el;
    };

    document.addEventListener(
      "pointerover",
      (e) => {
        // .btn: the ■ takes the plate's split, re-based on its button (cheap: once per hover)
        const btn = e.target instanceof Element ? e.target.closest<HTMLElement>(".btn") : null;
        if (btn) this.measureBtn(btn);
        if (!pointerOk()) return;
        const nav = entering(e, ".rail__nav a");
        const label = nav?.querySelector<HTMLElement>(":scope > span");
        if (label && !running.has(label)) {
          running.add(label);
          flicker(label, SEQ.doubleBlink);
          window.setTimeout(() => running.delete(label), SEQ.doubleBlink.length * TICK);
        }
        const pg = entering(e, ".pager a")?.querySelector<HTMLElement>(":scope > span");
        if (pg) flicker(pg, SEQ.flickerTwos);
        const brand = entering(e, ".brand a");
        if (brand && glyphs.length && !running.has(brand)) {
          // T6: the wordmark's glyphs pop back left to right, 3 frames each
          running.add(brand);
          glyphs.forEach((g) => g.classList.add("is-off"));
          stepped(
            glyphs.flatMap((_, i) => [i, i, i]),
            (i) => glyphs.slice(0, i + 1).forEach((g) => g.classList.remove("is-off")),
            { delay: TICK, done: () => running.delete(brand) },
          );
        }
        const tile = entering(e, ".sect__tile");
        if (tile && performance.now() - (lastTile.get(tile) ?? -Infinity) > 1455) {
          // A-30: the logotype stamps (F3) and the dot haloes (R9), at most every 1455 ms
          lastTile.set(tile, performance.now());
          tile.querySelectorAll<HTMLElement>(".lt").forEach((lt) => flicker(lt, SEQ.logoStamp));
          const dot = tile.querySelector<HTMLElement>(".tile__dot");
          if (dot) halo(dot, "var(--tile-ink)");
        }
        const hop = entering(e, "[data-hop]");
        if (hop) corners(hop, "hop");
      },
      on,
    );
    document.addEventListener(
      "focusin",
      (e) => {
        const btn = e.target instanceof Element ? e.target.closest<HTMLElement>(".btn") : null;
        if (btn) this.measureBtn(btn);
      },
      on,
    );
  }

  private measureBtn(btn: HTMLElement) {
    const w = `${btn.offsetWidth}px`;
    if (btn.style.getPropertyValue("--bw") === w) return;
    btn.style.setProperty("--bw", w);
    btn.style.setProperty("--bx", getComputedStyle(btn).paddingLeft);
  }
}
