// SYSTEM behaviour: each segmented group is a radio group bound to Prefs —
// one tab stop, arrows move and apply the choice at once — plus replay. For
// AUTO the row also says what the browser resolved it to.

import type { Settings } from "../app/settings.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const GROUPS = ["theme", "motion", "three"] as const;
const NEXT: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export function createSystem(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;

  const sync = (s: Settings) => {
    for (const g of GROUPS) {
      for (const b of root.querySelectorAll<HTMLButtonElement>(`[data-${g}]`)) {
        const on = b.dataset[g] === s[g];
        b.setAttribute("aria-checked", String(on));
        b.tabIndex = on ? 0 : -1;
      }
    }
    const now: Record<string, string> = {
      theme: ctx.prefs.theme() === "dark" ? "DARK" : "LIGHT",
      motion: ctx.reduced() ? "REDUCED" : "FULL",
    };
    for (const el of root.querySelectorAll<HTMLElement>("[data-cfg-now]")) {
      const g = el.dataset.cfgNow as "theme" | "motion";
      el.textContent = s[g] === "auto" ? `→ ${now[g]}` : "";
    }
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      for (const g of GROUPS) {
        const buttons = [...root.querySelectorAll<HTMLButtonElement>(`[data-${g}]`)];
        buttons.forEach((b, i) => {
          b.addEventListener("click", () => {
            const v = b.dataset[g]!;
            if (ctx.prefs.get()[g] === v) return;
            ctx.prefs.set(g, v as never);
            ctx.log(`> SET ${g === "three" ? "3D" : g.toUpperCase()} ${v.toUpperCase()}`);
          });
          b.addEventListener("keydown", (e) => {
            let n: HTMLButtonElement | undefined;
            if (e.key in NEXT) n = buttons[(i + NEXT[e.key] + buttons.length) % buttons.length];
            else if (e.key === "Home") n = buttons[0];
            else if (e.key === "End") n = buttons[buttons.length - 1];
            if (!n) return;
            // a radio group keeps the arrows, so the app's section paging must not see them
            e.preventDefault();
            e.stopPropagation();
            n.click();
            n.focus();
          });
        });
      }
      root.querySelector("[data-replay]")?.addEventListener("click", () => ctx.replayBoot());
      sync(ctx.prefs.get());
      ctx.prefs.on(sync);
    },
    enter() {
      sync(ctx.prefs.get());
    },
  };
}
