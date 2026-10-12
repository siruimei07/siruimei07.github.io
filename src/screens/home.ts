// Overview behaviour: the PV's callout build (MOTION-SPEC §8.1) and the leader
// polylines from each callout to its point on the ∞. Points come live from the
// 3D projection; without 3D they are the same points on the flat figure inside
// the centred 1920×1080 frame. Hovering a callout lights its region of the ∞.
// The small build helpers at the top are shared by the D1 screens.

import { FINE_QUERY, PHONE_QUERY, SEQ, TICK, cssEase, flicker, onFrame, timeline, typeText, type Cancel, type Timeline } from "../app/fx.ts";
import { CALLOUT_AT, anchorPoints } from "../views/home.ts";
import type { Anchor } from "../three/plates.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

// ───────── build helpers (overview, profile, research) ─────────

/** One screen's JS-driven build: cues on a 1.1× timeline plus the effects they start.
 *  finish() jumps all of it to the end state, so nothing is ever left half-typed. */
export class Build {
  private tl: Timeline | null = null;
  private stops: Cancel[] = [];
  private hidden = new Set<HTMLElement | SVGElement>();
  private paused = false;

  /** A fresh run (a previous one is finished first). */
  start(): void {
    this.finish();
    this.tl = timeline();
  }

  get running(): boolean {
    return this.tl !== null;
  }

  /** Overtaken (§7.6): no further cues, nothing jumps to its end; the exit carries the build
   *  as it stands. The next start() or finish() completes it. */
  hold(): void {
    if (!this.tl || this.paused) return;
    this.paused = true;
    this.tl.pause();
  }

  get held(): boolean {
    return this.paused;
  }

  /** fn at ms after start(), on a PV frame. */
  at(ms: number, fn: () => void): void {
    this.tl?.at(ms, fn);
  }

  /** Keeps an effect's cancel (or a clean-up) for finish(). */
  keep(c: Cancel): void {
    if (this.tl) this.stops.push(c);
    else c();
  }

  /** Invisible until a cue shows it; finish() shows it too. */
  hide(el: HTMLElement | SVGElement): void {
    el.style.opacity = "0";
    this.hidden.add(el);
  }

  show(el: HTMLElement | SVGElement): void {
    el.style.removeProperty("opacity");
    this.hidden.delete(el);
  }

  finish(): void {
    const tl = this.tl;
    this.tl = null;
    this.paused = false;
    // pending cues run now, in order (they start their effects), then every effect ends
    const stops = this.stops;
    this.stops = [];
    tl?.finish();
    for (const s of stops) s();
    for (const el of this.hidden) el.style.removeProperty("opacity");
    this.hidden.clear();
  }
}

/** The typed twin of an element's text: the original keeps its box (layout, a leader's
 *  elbow) and its accessible text, invisible while `data-typing` is set, and an
 *  aria-hidden copy on top of it is typed (T1, whole glyphs from a fixed left edge). */
function twin(el: HTMLElement): { ty: HTMLElement; text: string } {
  let ty = el.querySelector<HTMLElement>(":scope > .ty");
  if (!ty) {
    const src = document.createElement("span");
    src.className = "ty__src";
    src.append(...el.childNodes);
    ty = document.createElement("span");
    ty.className = "ty";
    ty.setAttribute("aria-hidden", "true");
    el.append(src, ty);
    el.dataset.ty = "";
  }
  const text = (el.querySelector(":scope > .ty__src")?.textContent ?? "").replace(/\s+/g, " ").trim();
  return { ty, text };
}

/** T1 (or T1c with `fixed`) of el's own text at `at` ms into the build. Blank until then. */
export function typeIn(b: Build, el: HTMLElement, at: number, o: { fixed?: number; cps?: number } = {}): void {
  const { ty, text } = twin(el);
  ty.textContent = "";
  el.setAttribute("data-typing", "");
  const done = () => el.removeAttribute("data-typing");
  b.at(at, () => b.keep(typeText(ty, text, { ...o, done })));
  b.keep(done);
}

/** Hidden, then a stepped flicker-in at `at` (F2, F6 …); the rest value afterwards. */
export function flickIn(b: Build, el: HTMLElement, seq: readonly number[], at: number): void {
  b.hide(el);
  b.at(at, () => {
    b.show(el);
    b.keep(flicker(el, seq));
  });
}

/** The PV's typing length for a T1 string: about a frame a character, plus the 3-frame tail hold. */
export const typedMs = (text: string): number => ([...text].length + 3) * TICK;

/** RhineLabUI hover only for a precise pointer that is not a finger. */
export const fineHover = (e: PointerEvent): boolean => e.pointerType !== "touch" && matchMedia(FINE_QUERY).matches;

// ───────── overview ─────────

const SVG = "http://www.w3.org/2000/svg";
const FLAT = anchorPoints();

// Which end of the callout's underline the leader meets: the end nearest the ∞.
// The underline then runs on, away from the ∞ (atlas L2).
const SIDE: Record<string, "start" | "end"> = { left: "end", cross: "end", "right-top": "start", "right-bottom": "start" };

type Leader = {
  path: SVGPathElement;
  dot: SVGCircleElement;
  halo: SVGGElement;
  rule: HTMLElement;
  link: HTMLElement;
  rr: DOMRect | null;
};

export function createHome(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let svg: SVGSVGElement;
  let frame: HTMLElement;
  let live: Record<string, Anchor> | null = null;
  const leaders = new Map<string, Leader>();
  let active = false;
  /** While the build runs, the leaders follow every frame (their rules may still move). */
  let building = false;
  let dirty = true;
  let pending = false;
  let stopLoop: Cancel = () => {};
  const build = new Build();
  /** Callout tags that already flickered on hover in this visit. */
  const flickered = new Set<string>();
  let hovered: string | null = null;
  let focused: string | null = null;

  const unitPx = () => frame.getBoundingClientRect().width / 1920;

  const fallback = (): Record<string, Anchor> => {
    const r = frame.getBoundingClientRect();
    const k = r.width / 1920;
    const out: Record<string, Anchor> = {};
    for (const [id, { x, y }] of Object.entries(FLAT)) out[id] = { x: r.left + x * k, y: r.top + y * k, visible: true };
    return out;
  };

  const sizeDots = () => {
    const u = unitPx();
    const r = Math.max(3, u * 5.5);
    for (const l of leaders.values()) {
      l.dot.setAttribute("r", r.toFixed(2));
      const [disc, ring1, ring2] = l.halo.children;
      disc.setAttribute("r", (25 * u).toFixed(1));
      ring1.setAttribute("r", (45 * u).toFixed(1));
      ring2.setAttribute("r", (50 * u).toFixed(1));
    }
  };

  const draw = () => {
    if (!active || matchMedia(PHONE_QUERY).matches) return;
    hook();
    const pts = live ?? fallback();
    // read every rule first, then write: one layout per frame at most
    if (dirty || building) for (const l of leaders.values()) l.rr = l.rule.getBoundingClientRect();
    dirty = false;
    for (const [id, l] of leaders) {
      const rr = l.rr;
      const p = pts[id];
      if (!rr || rr.width === 0) {
        l.path.style.display = l.dot.style.display = "none";
        continue;
      }
      const end = SIDE[id] === "end";
      const near = (end ? rr.right : rr.left).toFixed(1);
      const far = (end ? rr.left : rr.right).toFixed(1);
      const y = (rr.top + rr.height / 2).toFixed(1);
      l.path.style.display = "";
      // one pen path: dot → elbow at the rule's near end → along the rule (or the rule alone
      // while the point is hidden behind the 3D figure)
      if (p?.visible) {
        const x0 = p.x.toFixed(1);
        const y0 = p.y.toFixed(1);
        l.path.setAttribute("d", `M${x0} ${y0}L${near} ${y}L${far} ${y}`);
        l.dot.style.display = "";
        l.dot.setAttribute("cx", x0);
        l.dot.setAttribute("cy", y0);
        l.halo.setAttribute("transform", `translate(${x0} ${y0})`);
      } else {
        l.path.setAttribute("d", `M${near} ${y}L${far} ${y}`);
        l.dot.style.display = "none";
      }
    }
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    onFrame(() => {
      pending = false;
      draw();
      return false;
    });
  };

  // (re)subscribe whenever the 3D scene appears, is replaced or goes away
  let hooked: ReturnType<ScreenContext["plates"]> = null;
  const hook = () => {
    const p = ctx.plates();
    if (p === hooked) return;
    hooked = p;
    live = null;
    p?.onAnchors((a) => {
      if (hooked !== p) return;
      live = a;
      // the plates report every frame; only the overview on screen redraws
      if (active) schedule();
    });
  };

  /** R9 halo: a pale disc swells r 10 → 25u while two hairline rings spread to 45u and 50u. */
  const halo = (g: SVGGElement) => {
    if (ctx.reduced()) return;
    const [disc, ring1, ring2] = [...g.children] as SVGCircleElement[];
    const ease = cssEase("expo");
    disc.animate([{ scale: 0.4, opacity: 0.95 }, { opacity: 0.8, offset: 0.45 }, { scale: 1, opacity: 0 }], { duration: 436, easing: ease });
    const r0 = Math.max(3, unitPx() * 5.5);
    ring1.animate([{ scale: r0 / (45 * unitPx()), opacity: 1 }, { scale: 1, opacity: 0 }], { duration: 436, easing: ease });
    ring2.animate([{ scale: r0 / (50 * unitPx()), opacity: 1 }, { scale: 1, opacity: 0 }], { duration: 436, delay: TICK, easing: ease });
  };

  /** The same halo on an HTML ring (the centre pill's ◎). */
  const ringHalo = (host: HTMLElement) => {
    if (ctx.reduced()) return;
    const ease = cssEase("expo");
    for (const [i, el] of [...host.querySelectorAll<HTMLElement>(".home__halo > i")].entries()) {
      el.animate(i === 0 ? [{ scale: 0.4, opacity: 0.95 }, { opacity: 0.8, offset: 0.45 }, { scale: 1, opacity: 0 }] : [{ scale: 0.3, opacity: 1 }, { scale: 1, opacity: 0 }], {
        duration: 436,
        delay: i === 2 ? TICK : 0,
        easing: ease,
      });
    }
  };

  const highlight = () => ctx.plates()?.highlight?.(hovered ?? focused);

  /** Callout hover or focus (§8.1): title colour (CSS), tag flicker, a heavier leader, the dot pops and haloes. */
  const hot = (id: string, on: boolean, via: "hover" | "focus") => {
    if (via === "hover") hovered = on ? id : hovered === id ? null : hovered;
    else focused = on ? id : focused === id ? null : focused;
    const l = leaders.get(id);
    const lit = hovered === id || focused === id;
    if (l) {
      l.path.classList.toggle("is-hot", lit);
      l.dot.classList.toggle("is-hot", lit);
      l.link.classList.toggle("is-hot", lit);
    }
    if (on && !ctx.reduced()) {
      if (l) halo(l.halo);
      const tag = l?.link.querySelector<HTMLElement>(".tag");
      if (tag && !flickered.has(id)) {
        flickered.add(id);
        flicker(tag, SEQ.labelFlicker);
      }
    }
    highlight();
  };

  const startBuild = () => {
    build.start();
    // the centre pill: label bar (CSS) then its text, then the sub line right after it
    const pillB = root.querySelector<HTMLElement>(".home__pill b");
    const pillS = root.querySelector<HTMLElement>(".home__pill small");
    if (pillB) typeIn(build, pillB, 891);
    if (pillS) typeIn(build, pillS, 891 + typedMs(pillB?.textContent ?? ""));
    // each callout (atlas §2.14): title typed at c + 891, then two fixed-length lines back to back
    for (const [id, l] of leaders) {
      const c = CALLOUT_AT[id] ?? 0;
      const title = l.link.querySelector<HTMLElement>(".callout__title");
      const desc = l.link.querySelector<HTMLElement>(".callout__desc");
      const zh = l.link.querySelector<HTMLElement>(".callout__zh");
      if (title) typeIn(build, title, c + 891);
      if (desc) typeIn(build, desc, c + 1436, { fixed: 873 });
      if (zh) typeIn(build, zh, c + 1436 + 873, { fixed: 873 });
    }
    const hint = root.querySelector<HTMLElement>(".home__hint");
    if (hint) flickIn(build, hint, SEQ.flickerTwos, 5600);
  };

  const follow = () => {
    stopLoop();
    stopLoop = onFrame(() => {
      draw();
      if (!building) return false;
    });
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      svg = root.querySelector("[data-leaders]")!;
      frame = root.querySelector("[data-home-frame]")!;
      for (const li of root.querySelectorAll<HTMLElement>("[data-callout]")) {
        const id = li.dataset.callout!;
        const rule = li.querySelector<HTMLElement>("[data-rule]");
        const link = li.querySelector<HTMLElement>("a.callout");
        if (!rule || !link || !SIDE[id]) continue;
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("class", "home__lead");
        path.setAttribute("pathLength", "1");
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("class", "home__dot");
        const g = document.createElementNS(SVG, "g");
        g.setAttribute("class", "home__halo-g");
        for (const cls of ["home__halo-disc", "home__halo-ring", "home__halo-ring"]) {
          const ci = document.createElementNS(SVG, "circle");
          ci.setAttribute("class", cls);
          g.append(ci);
        }
        for (const n of [path, dot, g]) {
          n.dataset.lead = id;
          n.style.setProperty("--c", `${CALLOUT_AT[id] ?? 0}ms`);
        }
        // the anchor dot is where the shell's zoom-through starts (§7.2)
        dot.dataset.anchorDot = id;
        svg.append(path, g, dot);
        leaders.set(id, { path, dot, halo: g, rule, link, rr: null });
        link.addEventListener("pointerenter", (e) => fineHover(e) && hot(id, true, "hover"));
        link.addEventListener("pointerleave", () => hovered === id && hot(id, false, "hover"));
        // keyboard focus only: a click focuses the link too, and is already a hover
        link.addEventListener("focus", () => link.matches(":focus-visible") && hot(id, true, "focus"));
        link.addEventListener("blur", () => hot(id, false, "focus"));
      }
      // the centre pill: its ◎ haloes and the plates around the right tip light up
      const centre = root.querySelector<HTMLElement>(".home__centre");
      const ring = root.querySelector<HTMLElement>(".home__ring");
      if (centre && ring) {
        const h = document.createElement("i");
        h.className = "home__halo";
        h.setAttribute("aria-hidden", "true");
        h.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
        ring.append(h);
        const on = (via: "hover" | "focus") => {
          if (via === "hover") hovered = "centre";
          else focused = "centre";
          ringHalo(ring);
          highlight();
        };
        const off = (via: "hover" | "focus") => {
          if (via === "hover" && hovered === "centre") hovered = null;
          if (via === "focus" && focused === "centre") focused = null;
          highlight();
        };
        centre.addEventListener("pointerenter", (e) => fineHover(e) && on("hover"));
        centre.addEventListener("pointerleave", () => off("hover"));
        centre.addEventListener("focus", () => centre.matches(":focus-visible") && on("focus"));
        centre.addEventListener("blur", () => off("focus"));
      }
      sizeDots();
      addEventListener("resize", () => {
        sizeDots();
        dirty = true;
        schedule();
      });
      // late webfonts move the rules
      void document.fonts.ready.then(() => {
        dirty = true;
        schedule();
      });
    },
    enter() {
      active = true;
      dirty = true;
      schedule();
    },
    phase(p) {
      if (p === "enter") {
        flickered.clear();
        if (!ctx.reduced()) startBuild();
        building = true;
        dirty = true;
        follow();
      } else if (p === "settled") {
        // a natural settle lets the last lines finish typing; an early one already ran finish();
        // a build held by an overtaken exit and then returned to (the shell's fast way back) lands now
        if (build.held) build.finish();
        building = false;
        dirty = true;
        schedule();
      } else if (p === "leave") {
        building = false;
      }
    },
    finish() {
      build.finish();
      building = false;
      dirty = true;
      schedule();
    },
    leave() {
      // an overview left mid-build zooms away as it stands (§7.6): its callouts do not snap
      // to full text first; a click on a callout already finished the build on pointerdown
      if (building) build.hold();
      else build.finish();
      active = false;
      building = false;
      stopLoop();
      if (hovered || focused) {
        hovered = focused = null;
        for (const l of leaders.values()) for (const n of [l.path, l.dot, l.link]) n.classList.remove("is-hot");
        highlight();
      }
    },
    resize() {
      dirty = true;
      schedule();
    },
  };
}
