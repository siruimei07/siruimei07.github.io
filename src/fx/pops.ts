// Pop squares on the overview (MOTION-SPEC B-10, atlas S6, f1520–1817): now
// and then a grey square pops out of a 96u grid cell, opens a light square at
// its centre, and leaves with a blink. Irregular spawns (145–1636 ms, about
// 618 on average), 1527 ms each, at most two at a time, and never near the
// copy or the ∞'s anchor dots. Never following the cursor.

import { F, SEQ, TICK, cssEase, unit } from "../app/fx.ts";

export type Box = { l: number; t: number; r: number; b: number };
export type Keepout = { boxes: Box[]; dots: { x: number; y: number }[] };

const LIFE = F(42); // 1527 ms
const POP = F(9); // 327 ms, 1/6 → full size
const OPEN_AT = F(10); // the inner square opens from a dot…
const OPEN = F(7); // …over 255 ms
const EXIT_AT = LIFE - SEQ.popSquareExit.length * TICK;
const SPAWN_MIN = 145;
const SPAWN_MAX = 1636;
/** Mean of the exponential part, so the clamped spawn interval averages ≈ 618 ms. */
const SPAWN_MEAN = 500;
const MAX_ALIVE = 2;
const SHADES = ["a", "b", "c"] as const;

export type Pops = { start(): void; stop(): void };

export function createPops(layer: HTMLElement, o: { enabled(): boolean; keepout(): Keepout; origin(): { x: number; y: number } }): Pops {
  const alive = new Set<{ el: HTMLElement; box: Box; dies: number }>();
  let timer = 0;
  let running = false;

  // the exit is stepped: each value holds for one tick, so every keyframe is step-end
  const exitFrames: Keyframe[] = [{ opacity: 1, offset: 0, easing: "step-end" }];
  SEQ.popSquareExit.forEach((v, i) => exitFrames.push({ opacity: v, offset: (EXIT_AT + i * TICK) / LIFE, easing: "step-end" }));
  exitFrames.push({ opacity: 0, offset: 1 });

  const place = (): { x: number; y: number; s: number } | null => {
    const u = unit();
    const g = 96 * u;
    const { x: ox, y: oy } = o.origin();
    const { boxes, dots } = o.keepout();
    const pad = 24 * u;
    const dotPad = 48 * u;
    const i0 = Math.ceil(-ox / g);
    const i1 = Math.floor((innerWidth - ox) / g) - 1;
    const j0 = Math.ceil(-oy / g);
    const j1 = Math.floor((innerHeight - oy) / g) - 1;
    if (i1 < i0 || j1 < j0) return null;
    for (let tries = 0; tries < 16; tries++) {
      const s = Math.round(30 + Math.random() * 42) * u;
      const x = ox + (i0 + Math.floor(Math.random() * (i1 - i0 + 1)) + 0.5) * g;
      const y = oy + (j0 + Math.floor(Math.random() * (j1 - j0 + 1)) + 0.5) * g;
      const box = { l: x - s / 2, t: y - s / 2, r: x + s / 2, b: y + s / 2 };
      const near = (b: Box, m: number) => box.l < b.r + m && box.r > b.l - m && box.t < b.b + m && box.b > b.t - m;
      if (boxes.some((b) => near(b, pad))) continue;
      if (dots.some((d) => Math.hypot(Math.max(box.l - d.x, 0, d.x - box.r), Math.max(box.t - d.y, 0, d.y - box.b)) < dotPad)) continue;
      // one square per cell neighbourhood, so two never touch
      if ([...alive].some((a) => near(a.box, g / 2))) continue;
      return { x, y, s };
    }
    return null;
  };

  const spawn = () => {
    const at = place();
    if (!at) return;
    const el = document.createElement("i");
    el.className = `amb__pop amb__pop--${SHADES[Math.floor(Math.random() * SHADES.length)]}`;
    el.style.cssText = `left:${(at.x - at.s / 2).toFixed(1)}px;top:${(at.y - at.s / 2).toFixed(1)}px;width:${at.s.toFixed(1)}px;height:${at.s.toFixed(1)}px`;
    const core = document.createElement("i");
    el.append(core);
    layer.append(el);
    const rec = { el, box: { l: at.x - at.s / 2, t: at.y - at.s / 2, r: at.x + at.s / 2, b: at.y + at.s / 2 }, dies: performance.now() + LIFE };
    alive.add(rec);
    el.animate([{ scale: 1 / 6 }, { scale: 1 }], { duration: POP, easing: cssEase("expo"), fill: "both" });
    core.animate([{ scale: 0 }, { scale: 1 }], { delay: OPEN_AT, duration: OPEN, easing: cssEase("expo"), fill: "both" });
    el.animate(exitFrames, { duration: LIFE, fill: "forwards" }).finished.then(
      () => {
        alive.delete(rec);
        el.remove();
      },
      () => {
        alive.delete(rec);
        el.remove();
      },
    );
  };

  const schedule = (ms: number) => {
    clearTimeout(timer);
    timer = window.setTimeout(tick, ms);
  };

  const tick = () => {
    timer = 0;
    if (!running || !o.enabled()) return;
    if (alive.size >= MAX_ALIVE) {
      // the next one waits for a free slot
      const first = Math.min(...[...alive].map((a) => a.dies));
      schedule(Math.max(TICK, first - performance.now()));
      return;
    }
    spawn();
    schedule(Math.min(SPAWN_MAX, SPAWN_MIN - SPAWN_MEAN * Math.log(1 - Math.random())));
  };

  return {
    start() {
      if (running) return;
      running = true;
      // the first square waits for the overview to stand still a moment
      schedule(F(30));
    },
    stop() {
      running = false;
      clearTimeout(timer);
      timer = 0;
      for (const a of alive) {
        a.el.getAnimations().forEach((an) => an.cancel());
        a.el.remove();
      }
      alive.clear();
    },
  };
}
