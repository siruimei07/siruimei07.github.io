// RESEARCH behaviour: three tabs (STAT / ECON / QNT). The left tile swaps to
// the chosen section's logotype with a grain flash, like the PV walking from
// STRU to NRG; the panel cross-fades and its specimen draws itself in again.

import { scramble } from "../app/fx.ts";
import { skills } from "../content.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const IN_MS = 2000;
const GLITCH_MS = 500;
/** The phone / tablet flow, same query as the CSS phone blocks: there the screen scrolls. */
const PHONE = "(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 539px), (pointer: coarse) and (max-width: 1400px)";

export function createSkills(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let tabs: HTMLButtonElement[] = [];
  let panels: HTMLElement[] = [];
  let tileBox: HTMLElement | null = null;
  let current = 0;
  let inTimer = 0;
  let glitchTimer = 0;
  let cancelName: () => void = () => {};

  /** Replays the panel's entrance (title wipe, notes, specimen draw-in). */
  const play = (panel: HTMLElement) => {
    clearTimeout(inTimer);
    cancelName();
    for (const p of panels) p.classList.remove("is-in");
    if (ctx.reduced()) return;
    void panel.offsetWidth; // restart the CSS animations
    panel.classList.add("is-in");
    inTimer = window.setTimeout(() => panel.classList.remove("is-in"), IN_MS);
    const name = panel.querySelector<HTMLElement>(".lab__name");
    if (name) cancelName = scramble(name, { duration: 520 });
  };

  const glitch = () => {
    if (!tileBox || ctx.reduced()) return;
    clearTimeout(glitchTimer);
    tileBox.classList.remove("is-glitch");
    void tileBox.offsetWidth;
    tileBox.classList.add("is-glitch");
    glitchTimer = window.setTimeout(() => tileBox?.classList.remove("is-glitch"), GLITCH_MS);
  };

  const select = (i: number, focus = false) => {
    const next = (i + tabs.length) % tabs.length;
    if (next === current) {
      if (focus) tabs[current].focus();
      return;
    }
    current = next;
    const id = tabs[current].dataset.skill!;
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(j === current));
      t.tabIndex = j === current ? 0 : -1;
    });
    let on: HTMLElement | null = null;
    for (const p of panels) {
      const hit = p.dataset.skillPanel === id;
      p.classList.toggle("is-on", hit);
      if (hit) on = p;
    }
    for (const a of root.querySelectorAll<HTMLElement>("[data-tile-alt]")) a.classList.toggle("is-on", a.dataset.tileAlt === id);
    glitch();
    if (on) play(on);
    if (focus) tabs[current].focus();
    const k = skills[current];
    ctx.caption(`${k.zh}科：${k.motto}`);
    ctx.log(`> OPEN ${k.tile.lines.join("")}-00${current + 1}`);
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-skill]")];
      panels = [...root.querySelectorAll<HTMLElement>("[data-skill-panel]")];
      tileBox = root.querySelector<HTMLElement>("[data-tile-box]");
      tabs.forEach((t, i) => t.addEventListener("click", () => select(i)));
    },
    enter() {
      const on = panels[current];
      if (on) play(on);
    },
    leave() {
      clearTimeout(inTimer);
      cancelName();
      for (const p of panels) p.classList.remove("is-in");
    },
    key(e) {
      const a = document.activeElement;
      const onTab = tabs.includes(a as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // on a tab; or in the desktop frame right after entering, when focus is on the screen
        // itself. Anywhere else the arrows keep scrolling.
        const fresh = (!a || a === root || a === document.body) && !matchMedia(PHONE).matches;
        if (!onTab && !fresh) return false;
        select(current + (e.key === "ArrowDown" ? 1 : -1), true);
        return true;
      }
      if (onTab && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        select(current + (e.key === "ArrowRight" ? 1 : -1), true);
        return true;
      }
      if (onTab && (e.key === "Home" || e.key === "End")) {
        select(e.key === "Home" ? 0 : tabs.length - 1, true);
        return true;
      }
      return false;
    },
  };
}
