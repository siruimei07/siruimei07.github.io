// ACTIVITY LOG behaviour: the calendar is one tab stop — arrows move a ring
// day by day (←/→ a week, ↑/↓ a day) and the SELECTED DAY readout, a polite
// live region, reports it; hovering does the same. The figures count up.

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

  // keep the ring inside the phone's sideways-scrolling box without moving the page
  const reveal = (cell: HTMLElement) => {
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    const c = cell.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    const margin = 36;
    if (c.left < s.left + margin) scroller.scrollLeft -= s.left + margin - c.left;
    else if (c.right > s.right - 8) scroller.scrollLeft += c.right - s.right + 8;
  };

  const select = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    cells[cur]?.classList.remove("is-cur");
    cur = next;
    cells[cur].classList.add("is-cur");
    show(cells[cur]);
    reveal(cells[cur]);
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      out = root.querySelector("[data-heat-sel-text]");
      grid = root.querySelector<HTMLElement>("[data-heat-grid]");
      scroller = root.querySelector<HTMLElement>("[data-heat-scroll]");
      if (!grid) return;
      cells = [...grid.querySelectorAll<HTMLElement>(".heat__c")];
      last = Math.max(0, cells.findLastIndex((x) => !x.classList.contains("is-future")));
      // the readout replaces the native tooltips once scripts run
      for (const x of cells) x.removeAttribute("title");
      grid.tabIndex = 0;
      root.querySelector<HTMLElement>("[data-heat-keys]")?.removeAttribute("hidden");
      cur = last;
      cells[cur]?.classList.add("is-cur");
      if (cells[cur]) show(cells[cur]);

      grid.addEventListener("pointerover", (e) => {
        const t = (e.target as HTMLElement).closest<HTMLElement>(".heat__c");
        if (t) show(t);
      });
      grid.addEventListener("pointerleave", () => cells[cur] && show(cells[cur]));
      grid.addEventListener("pointerdown", (e) => {
        grid?.classList.remove("is-kbd");
        const i = cells.indexOf((e.target as HTMLElement).closest<HTMLElement>(".heat__c")!);
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
      cancels.forEach((f) => f());
      cancels = [...root.querySelectorAll<HTMLElement>(".logs__stat [data-count]")].map((el, i) => rollNumber(el, { instant: ctx.reduced(), duration: 700 + i * 120 }));
    },
    leave() {
      cancels.forEach((f) => f());
      cancels = [];
    },
  };
}
