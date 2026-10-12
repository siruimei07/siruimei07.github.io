// SYSTEM behaviour: each segmented group is a radio group bound to Prefs —
// one tab stop, arrows move and apply the choice at once — plus replay. For
// AUTO the row also says what the browser resolved it to, swapping the label
// with the PV's fast status wipe (T8). Selection fills are CSS (a B2 plate
// wiped in, collapsed out); hovering a choice or a row blinks its text once
// (F4). The THEME click reaches Prefs untouched: the shell runs the cascade
// from it. Entry (MOTION-SPEC §8.7) is CSS keyed on data-phase, apart from the
// typed AUTO readouts and the head's progress hairline.

import type { Settings } from "../app/settings.ts";
import { F, flicker, PHONE_QUERY, SEQ, swapLabel, timeline, typeText, unit, type Cancel, type Timeline } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const GROUPS = ["theme", "motion", "three"] as const;
const NEXT: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
/** N2 progress fill: 65 PV px a second, and it never quite arrives. */
const FILL = 65;
const FILL_STOP = 0.97;

export function createSystem(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let active = false;
  let build: { tl: Timeline; cancels: Cancel[] } | null = null;
  /** The text each readout should end on (the build may still be typing it). */
  const nowText = new Map<HTMLElement, string>();
  const blinking = new WeakSet<HTMLElement>();

  const quiet = () => ctx.reduced();

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
      const text = s[g] === "auto" ? `→ ${now[g]}` : "";
      if (nowText.get(el) === text) continue;
      nowText.set(el, text);
      // a change the visitor made wipes the label over (fast T8); anything else is just set
      if (active && !build) swapLabel(el, text, { speed: "fast", instant: quiet() });
      else if (!build) el.textContent = text;
    }
  };

  /** F4 on the text only, once per hover (not restarted while it runs). */
  const blink = (el: HTMLElement | null) => {
    if (!el || blinking.has(el) || quiet() || !active) return;
    blinking.add(el);
    const stop = flicker(el, SEQ.doubleBlink, { prop: "color" });
    window.setTimeout(() => {
      stop();
      blinking.delete(el);
    }, F(SEQ.doubleBlink.length));
  };

  const finishBuild = () => {
    if (!build) return;
    const b = build;
    build = null;
    b.tl.finish();
    b.cancels.splice(0).forEach((c) => c());
    b.tl.cancel();
    for (const [el, text] of nowText) el.textContent = text;
  };

  /** §8.7 from the dock: the AUTO readouts type in (T1c) at t0 + 1455; the hairline starts filling. */
  const dock = () => {
    finishBuild();
    const tl = timeline();
    const cancels: Cancel[] = [];
    build = { tl, cancels };
    for (const el of root.querySelectorAll<HTMLElement>("[data-cfg-now]")) {
      const text = nowText.get(el) ?? el.textContent ?? "";
      if (text) cancels.push(typeText(el, text, { fixed: F(11), delay: F(40) }));
    }
    // N2: linear at 65u/s, stopping at 97 % of the head's width
    const prog = root.querySelector<HTMLElement>("[data-prog]");
    if (prog) prog.style.setProperty("--prog-dur", `${Math.round(((prog.offsetWidth * FILL_STOP) / (FILL * unit())) * 1000)}ms`);
    tl.at(F(40) + F(11), finishBuild);
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
          // Y-01: the ring takes the hover colour (CSS) and the label blinks once
          b.addEventListener("pointerenter", (e) => {
            if (e.pointerType === "mouse" && b.getAttribute("aria-checked") !== "true") blink(b.querySelector<HTMLElement>(".seg__face"));
          });
        });
      }
      for (const row of root.querySelectorAll<HTMLElement>(".config__row")) {
        row.addEventListener("pointerenter", (e) => {
          if (e.pointerType === "mouse" && !matchMedia(PHONE_QUERY).matches) blink(row.querySelector<HTMLElement>(".config__code"));
        });
      }
      root.querySelector("[data-replay]")?.addEventListener("click", () => ctx.replayBoot());
      sync(ctx.prefs.get());
      ctx.prefs.on(sync);
    },
    enter() {
      active = true;
      sync(ctx.prefs.get());
    },
    phase(p) {
      if (p === "dock") dock();
      else if (p === "settled") finishBuild();
    },
    finish: finishBuild,
    leave() {
      active = false;
    },
  };
}
