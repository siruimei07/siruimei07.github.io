// ACTIVITY LOG behaviour: the calendar is one tab stop, exposed as a slider
// over the days — arrows move a ring day by day (←/→ a week, ↑/↓ a day), the
// slider's value text names the day for screen readers and the SELECTED DAY
// readout shows it; a mouse hover previews a day, a tap or click picks one.
// On phones the year scrolls sideways under the weekday column. The figures
// count up.

import { activityText } from "../content.ts";
import { rollNumber } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const STEP: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, PageUp: -28, PageDown: 28 };

export function createActivity(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let out: HTMLElement | null = null;
  let grid: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;
  let days: HTMLElement | null = null;
  let months: HTMLElement[] = [];
  let cells: HTMLElement[] = [];
  /** index of the latest past day (cells are in date order, future ones last) */
  let last = 0;
  let cur = 0;
  let cancels: (() => void)[] = [];

  const describe = (cell: HTMLElement) => {
    const n = Number(cell.dataset.n ?? 0);
    return `${cell.dataset.date} · ${n > 0 ? `${n} ${activityText.contributions}` : activityText.none}`;
  };

  const show = (cell: HTMLElement) => {
    if (out && !cell.classList.contains("is-future")) out.textContent = describe(cell);
  };

  // phones: a month name sliding under the weekday column, or past the far
  // edge, is hidden whole rather than shown cut ("AY" for MAY)
  let trimRaf = 0;
  const trim = () => {
    trimRaf = 0;
    if (!scroller || !days) return;
    const scrolls = scroller.scrollWidth > scroller.clientWidth;
    const from = days.getBoundingClientRect().right - 0.5;
    const to = scroller.getBoundingClientRect().right + 0.5;
    for (const m of months) {
      const left = m.getBoundingClientRect().left;
      m.style.visibility = scrolls && (left < from || left + m.scrollWidth > to) ? "hidden" : "";
    }
  };

  // keep the ring inside the phone's sideways-scrolling box without moving the page
  const reveal = (cell: HTMLElement) => {
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const c = cell.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const margin = 36;
    if (c.left < s.left + margin) scroller.scrollLeft -= s.left + margin - c.left;
    else if (c.right > s.right - 8) scroller.scrollLeft += c.right - s.right + 8;
  };

  // ring, readout and the slider's value all follow the chosen day
  const mark = (i: number) => {
    cells[cur]?.classList.remove("is-cur");
    cur = Math.max(0, Math.min(last, i));
    const cell = cells[cur];
    cell.classList.add("is-cur");
    show(cell);
    grid?.setAttribute("aria-valuenow", String(cur));
    grid?.setAttribute("aria-valuetext", describe(cell));
    return cell;
  };

  const select = (i: number) => reveal(mark(i));

  const cellAt = (e: Event) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>(".heat__c") : null;
    return t ? cells.indexOf(t) : -1;
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      out = root.querySelector("[data-heat-sel-text]");
      grid = root.querySelector<HTMLElement>("[data-heat-grid]");
      scroller = root.querySelector<HTMLElement>("[data-heat-scroll]");
      days = root.querySelector<HTMLElement>(".heat__days");
      months = [...root.querySelectorAll<HTMLElement>(".heat__months span")];
      scroller?.addEventListener(
        "scroll",
        () => {
          if (!trimRaf) trimRaf = requestAnimationFrame(trim);
        },
        { passive: true },
      );
      if (!grid) return;
      cells = [...grid.querySelectorAll<HTMLElement>(".heat__c")];
      if (!cells.length) return;
      // a plain walk back, not Array#findLastIndex: that is newer than the es2022 build target
      last = cells.length - 1;
      while (last > 0 && cells[last].classList.contains("is-future")) last--;
      // the readout replaces the native tooltips once scripts run
      for (const x of cells) x.removeAttribute("title");
      // a slider, so screen readers hand it the arrow keys (a group keeps them for browsing)
      grid.setAttribute("role", "slider");
      grid.setAttribute("aria-roledescription", "日历");
      grid.setAttribute("aria-valuemin", "0");
      grid.setAttribute("aria-valuemax", String(last));
      grid.tabIndex = 0;
      root.querySelector<HTMLElement>("[data-heat-keys]")?.removeAttribute("hidden");
      mark(last);

      // hover previews only for a mouse; touch would preview whatever a swipe starts on
      grid.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const i = cellAt(e);
        if (i >= 0) show(cells[i]);
      });
      grid.addEventListener("pointerleave", () => show(cells[cur]));
      grid.addEventListener("pointerdown", () => grid?.classList.remove("is-kbd"));
      // a click, not pointerdown: a sideways swipe through the calendar scrolls it without choosing a day
      grid.addEventListener("click", (e) => {
        const i = cellAt(e);
        if (i >= 0 && i <= last) select(i);
      });
      grid.addEventListener("keydown", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        let to: number | null = null;
        if (e.key in STEP) to = cur + STEP[e.key];
        else if (e.key === "Home") to = 0;
        else if (e.key === "End") to = last;
        if (to === null) return;
        // handled here, so the app's ←/→ section paging must not see it
        e.preventDefault();
        e.stopPropagation();
        grid?.classList.add("is-kbd");
        select(to);
      });
      grid.addEventListener("blur", () => grid?.classList.remove("is-kbd"));
    },
    enter(_from, first) {
      // phones: start the sideways calendar at the latest weeks
      if (first && scroller && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth;
      trim();
      cancels.forEach((f) => f());
      cancels = [...root.querySelectorAll<HTMLElement>(".logs__stat [data-count]")].map((el, i) => rollNumber(el, { instant: ctx.reduced(), duration: 700 + i * 120 }));
    },
    leave() {
      cancels.forEach((f) => f());
      cancels = [];
    },
    resize() {
      trim();
    },
  };
}
