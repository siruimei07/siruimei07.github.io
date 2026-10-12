// HUD double blinks (MOTION-SPEC B-07, atlas F4): each [data-blink] tag of a
// settled screen, and of the chrome around it, drops out off 3 / on 3 / off 3
// ticks (364 ms) at its own random interval of 640–3600 ms, never in sync and
// never two at once in one screen. [data-blink="text"] drops only its text.

import { SEQ, TICK, flicker, type Cancel } from "../app/fx.ts";

const MIN_MS = 640;
const MAX_MS = 3600;
const BLINK_MS = SEQ.doubleBlink.length * TICK;

type Group = { root: HTMLElement | null; els: HTMLElement[]; stop: Cancel | null; until: number };

export type Blinks = {
  /** Re-read which screens are settled (after a phase change or navigation). */
  refresh(): void;
  /** Cancel every blink and the schedule. */
  stop(): void;
};

export function createBlinks(o: { enabled(): boolean; settled(root: HTMLElement): boolean }): Blinks {
  const next = new WeakMap<HTMLElement, number>();
  let groups: Group[] = [];
  let timer = 0;
  const rand = () => MIN_MS + Math.random() * (MAX_MS - MIN_MS);

  const visible = (el: HTMLElement) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? el.getClientRects().length > 0;

  const wake = () => {
    timer = 0;
    if (!o.enabled()) return;
    const now = performance.now();
    let soonest = Infinity;
    for (const g of groups) {
      if (g.stop && now >= g.until) g.stop = null;
      if (g.stop) {
        soonest = Math.min(soonest, g.until);
        continue;
      }
      // the most overdue tag of this group goes; the others wait their turn
      let pick: HTMLElement | null = null;
      for (const el of g.els) {
        const t = next.get(el) ?? now + rand();
        next.set(el, t);
        if (t <= now && (!pick || t < next.get(pick)!)) pick = el;
      }
      if (pick) {
        next.set(pick, now + rand());
        if (visible(pick)) {
          g.stop = flicker(pick, SEQ.doubleBlink, { prop: pick.dataset.blink === "text" ? "color" : "opacity" });
          g.until = now + BLINK_MS;
          // whoever else was due starts a few ticks after this one ends
          for (const el of g.els) if (el !== pick && next.get(el)! < g.until) next.set(el, g.until + TICK * (1 + Math.floor(Math.random() * 4)));
        }
      }
      for (const el of g.els) soonest = Math.min(soonest, next.get(el)!);
      if (g.stop) soonest = Math.min(soonest, g.until);
    }
    if (soonest < Infinity) timer = window.setTimeout(wake, Math.max(TICK, soonest - performance.now()));
  };

  const stopAll = () => {
    clearTimeout(timer);
    timer = 0;
    for (const g of groups) g.stop?.();
    groups = [];
  };

  return {
    refresh() {
      const old = groups;
      groups = [];
      clearTimeout(timer);
      timer = 0;
      if (o.enabled()) {
        const roots = [...document.querySelectorAll<HTMLElement>(".screen.is-active")].filter((r) => o.settled(r));
        for (const root of roots) groups.push({ root, els: [...root.querySelectorAll<HTMLElement>("[data-blink]")], stop: null, until: 0 });
        // the chrome blinks only while the screen it frames is still
        if (roots.length) {
          const els = [...document.querySelectorAll<HTMLElement>("[data-blink]")].filter((el) => !el.closest(".screen, [data-boot]"));
          groups.push({ root: null, els, stop: null, until: 0 });
        }
      }
      // a running blink carries over when its screen is still settled; otherwise it ends at once
      for (const g of old) {
        const keep = g.stop && groups.find((n) => n.root === g.root);
        if (keep) {
          keep.stop = g.stop;
          keep.until = g.until;
        } else g.stop?.();
      }
      // a newly settled screen's tags start counting from now
      const now = performance.now();
      for (const g of groups) for (const el of g.els) if (!g.stop && !old.some((p) => p.root === g.root)) next.set(el, now + rand());
      if (groups.some((g) => g.els.length)) wake();
    },
    stop: stopAll,
  };
}
