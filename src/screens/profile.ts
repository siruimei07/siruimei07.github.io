// PERSONNEL FILE behaviour: the scripted half of the dossier build (MOTION-SPEC
// §8.2) — the typed file code, the slides out of the ■ cursor and out of each
// value's own edge, the PROFILE rows on the PV's one-row-a-second beat — and the
// portrait's inspection line. The rest of the build is CSS keyed on data-phase.

import { F, POINTER_RATE, SEQ, TICK, approach, flicker, maskSlide, onFrame, type Cancel } from "../app/fx.ts";
import { Build, fineHover, flickIn, typeIn } from "./home.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

export function createProfile(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  const build = new Build();
  /** The shell's last phase for this screen was "settled". */
  let settledNow = false;
  /** Labels that already flickered on hover in this visit. */
  let flickered = new WeakSet<Element>();

  /** Everything here counts from the dock (t0), on PV frames. */
  const dock = () => {
    build.start();
    const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
    // + 1455: PERSONAL INFORMATION LOADED slides left out of its ■ (T7d, 764 ms)
    const loaded = q(".dossier__loaded-t");
    if (loaded) build.keep(maskSlide(loaded, { from: "right", delay: F(40) }));
    // + 1600: ■ code, typed (T1)
    const code = q(".dossier__cv");
    if (code) typeIn(build, code, F(44));
    // + 2655 …: each meter's value slides out of its own left edge as its fill grows (T7c)
    root.querySelectorAll<HTMLElement>(".dossier__bars li > b").forEach((b, n) => build.keep(maskSlide(b, { delay: F(73 + 2 * n) })));
    // + 2800: the card's head flickers on as the card pops (F2)
    const head = q(".dossier__card .card__head");
    if (head) flickIn(build, head, SEQ.labelFlicker, F(77));
    // + 3418 + n · 1055: one row a beat (29 frames) — the label flickers on, the value slides out 14 frames later
    root.querySelectorAll<HTMLElement>(".dossier__card .card__fields > div").forEach((row, n) => {
      const dt = row.querySelector<HTMLElement>("dt");
      const dd = row.querySelector<HTMLElement>("dd");
      const at = F(94 + 29 * n);
      if (dt) flickIn(build, dt, SEQ.labelFlicker, at);
      if (!dd) return;
      build.hide(dd);
      build.at(at + F(14), () => {
        build.show(dd);
        build.keep(maskSlide(dd));
      });
    });
  };

  /** The inspection line: a hairline that follows the pointer's height over the portrait
   *  (smoothed like every parallax layer, τ 163 ms) with its reading, Y as a fraction. */
  const inspect = (portrait: HTMLElement) => {
    const line = portrait.querySelector<HTMLElement>(".dossier__scan-l");
    const read = portrait.querySelector<HTMLElement>(".dossier__scan-y");
    if (!line || !read) return;
    let h = 1;
    let y = 0;
    let target = 0;
    let shown = "";
    let lastText = -Infinity;
    let stop: Cancel | null = null;
    const write = (now: number, force: boolean) => {
      line.style.translate = `0 ${y.toFixed(1)}px`;
      if (!force && now - lastText < TICK) return;
      lastText = now;
      const t = `Y ${Math.min(1, Math.max(0, y / h)).toFixed(2)}`;
      if (t !== shown) read.textContent = shown = t;
    };
    const run = () => {
      stop ??= onFrame((now, dt) => {
        y = ctx.reduced() ? target : approach(y, target, POINTER_RATE, dt);
        if (Math.abs(y - target) < 0.2) y = target;
        write(now, y === target);
        if (y === target) {
          stop = null;
          return false;
        }
      });
    };
    // offsetY is in the portrait's own plane, so the tilted glass does not skew it
    const at = (e: PointerEvent) => Math.min(h, Math.max(0, e.offsetY));
    portrait.addEventListener("pointerenter", (e) => {
      if (!fineHover(e)) return;
      h = portrait.offsetHeight || 1;
      y = target = at(e);
      write(performance.now(), true);
      portrait.classList.add("is-inspect");
    });
    portrait.addEventListener("pointermove", (e) => {
      if (!portrait.classList.contains("is-inspect")) return;
      target = at(e);
      run();
    });
    portrait.addEventListener("pointerleave", () => portrait.classList.remove("is-inspect"));
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      const portrait = root.querySelector<HTMLElement>(".dossier__portrait");
      if (portrait) inspect(portrait);
      // the name bar and rank tag flicker on (F2) the first time they are hovered in a visit
      for (const label of root.querySelectorAll<HTMLElement>(".dossier__name, .dossier__rank")) {
        label.addEventListener("pointerenter", (e) => {
          if (!fineHover(e) || ctx.reduced() || flickered.has(label)) return;
          flickered.add(label);
          flicker(label, SEQ.labelFlicker);
        });
      }
      // a hovered meter lifts (.lift) and its label's ■ flickers once
      for (const li of root.querySelectorAll<HTMLElement>(".dossier__bars li")) {
        const sq = li.querySelector<HTMLElement>(".dossier__sq");
        let last = -Infinity;
        li.addEventListener("pointerenter", (e) => {
          const now = performance.now();
          if (!sq || !fineHover(e) || ctx.reduced() || now - last < SEQ.labelFlicker.length * TICK) return;
          last = now;
          flicker(sq, SEQ.labelFlicker);
        });
      }
    },
    phase(p) {
      settledNow = p === "settled";
      if (p === "enter") flickered = new WeakSet();
      else if (p === "dock" && !ctx.reduced()) dock();
      // held by an overtaken exit, then returned to (the shell's fast way back): land it now
      else if (p === "settled" && build.held) build.finish();
    },
    finish() {
      build.finish();
    },
    leave() {
      // a dossier left mid-build leaves as it stands (§7.6); the next entry restarts it
      if (settledNow) build.finish();
      else build.hold();
    },
  };
}
