import { daysToFull, moonAt, moonLitPath, timeOfDay, WEEKDAYS_EN } from "../lib/moon";
import { $ } from "./dom";

// The P3 field HUD: date, weekday tab, time of day and — in place of the
// game's deadline — the nights left until the full moon.

export class Hud {
  private root = $("[data-hud]");
  private timer = 0;
  onDarkHour: (dark: boolean) => void = () => {};

  constructor() {
    this.refresh();
    this.timer = window.setInterval(() => this.refresh(), 30_000);
  }

  show(on: boolean) {
    this.root?.classList.toggle("is-on", on);
  }

  refresh(now = new Date()) {
    const r = this.root;
    if (!r) return;
    const m = moonAt(now);
    const days = daysToFull(now);
    const tod = timeOfDay(now);
    const set = (sel: string, text: string) => {
      const el = $(sel, r);
      if (el) el.textContent = text;
    };
    set("[data-hud-date]", `${now.getMonth() + 1}/${now.getDate()}`);
    set("[data-hud-dow]", WEEKDAYS_EN[now.getDay()]);
    set("[data-hud-phase]", tod.en);
    set("[data-hud-word]", tod.dark ? "DARK HOUR" : now.getDay() === 0 || now.getDay() === 6 ? "WEEKEND" : "WEEKDAY");
    set("[data-hud-label]", days === 0 ? "FULL MOON" : "TO FULL MOON");
    set("[data-hud-days]", days === 0 ? "満" : String(days));
    const lit = $<SVGPathElement>("[data-hud-icon] .moon-lit", r);
    lit?.setAttribute("d", moonLitPath(m.phase, 44));
    document.documentElement.classList.toggle("dark-hour", tod.dark);
    this.onDarkHour(tod.dark);
  }

  dispose() {
    clearInterval(this.timer);
  }
}

/** A small moon icon (svg markup) for a given phase. */
export function moonIcon(phase: number, cls = "") {
  return `<svg viewBox="-50 -50 100 100"${cls ? ` class="${cls}"` : ""}><circle r="44" class="moon-dark"/><path class="moon-lit" d="${moonLitPath(phase, 44)}"/><circle r="47" class="moon-ring" fill="none"/></svg>`;
}
