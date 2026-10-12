// ACTIVITY LOG behaviour: the calendar is one tab stop, exposed as a slider
// over the days — arrows move a ring day by day (←/→ a week, ↑/↓ a day), the
// slider's value text names the day for screen readers and the SELECTED DAY
// readout rolls to it; a mouse hover previews a day, a tap or click picks one.
// A crosshair band marks the week and the weekday, and the ring glides there
// (RhineLabUI hover rate ÷1.1). On phones the year scrolls sideways under the
// weekday column. Entry (MOTION-SPEC §8.5): the FILE boxes stutter on and
// their figures slide out of their clips, the event lines type in, and at the
// reveal a hot front sweeps the calendar (D10).

import { activityText } from "../content.ts";
import { approach, corners, F, maskSlide, onFrame, PHONE_QUERY, RLRATE, rollText, TICK, timeline, typeText, unit, type Cancel, type Timeline } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const STEP: Record<string, number> = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1, PageUp: -28, PageDown: 28 };
/** D10 front speed, PV px per second at 1.1×. */
const FRONT = 1375;
/** RhineLabUI hover lift rate (14/s) at 1.1×: the ring's glide. */
const GLIDE = RLRATE(14);
/** Event lines type a character a frame, but no line takes longer than this. */
const LINE_CAP = 2200;

/** A timeline plus the text effects its cues started; finish() lands both on their end state. */
type Build = { tl: Timeline; keep(c: Cancel): void; finish(): void };

function makeBuild(): Build {
  const tl = timeline();
  const cancels: Cancel[] = [];
  let done = false;
  return {
    tl,
    keep: (c) => void cancels.push(c),
    finish() {
      if (done) return;
      done = true;
      tl.finish();
      cancels.splice(0).forEach((c) => c());
      // every animation ends on the element's own CSS, so dropping them changes nothing visible
      tl.cancel();
    },
  };
}

export function createActivity(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let out: HTMLElement | null = null;
  let grid: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let scroller: HTMLElement | null = null;
  let days: HTMLElement | null = null;
  let months: HTMLElement[] = [];
  let dayLabels: HTMLElement[] = [];
  let cells: HTMLElement[] = [];
  let ring: HTMLElement | null = null;
  let bandCol: HTMLElement | null = null;
  let bandRow: HTMLElement | null = null;
  let front: HTMLElement | null = null;
  /** index of the latest past day (cells are in date order, future ones last) */
  let last = 0;
  let cur = 0;
  /** the day the readout shows (the hovered one, else the chosen one) */
  let shown = -1;
  let entry: Build | null = null;
  let hero: Build | null = null;
  let active = false;

  const quiet = () => ctx.reduced();

  const describe = (cell: HTMLElement) => {
    const n = Number(cell.dataset.n ?? 0);
    return `${cell.dataset.date} · ${n > 0 ? `${n} ${activityText.contributions}` : activityText.none}`;
  };

  // ───────── crosshair: bands, ring, labels ─────────

  /** Cell geometry inside .heat__body (its offset parent), measured once per layout. */
  const geo = { x0: 0, y0: 0, px: 0, py: 0, size: 0 };
  const hair = { x: 0, y: 0, tx: 0, ty: 0, placed: false };
  let hairStop: Cancel | null = null;
  let bandsOn = false;
  let hotLabels: HTMLElement[] = [];

  const measure = () => {
    if (cells.length < 8) return;
    const c0 = cells[0];
    const weeks = Math.floor((cells.length - 1) / 7);
    geo.x0 = c0.offsetLeft;
    geo.y0 = c0.offsetTop;
    // offsets are whole pixels: take the pitch across the whole year, not one step
    geo.px = weeks ? (cells[weeks * 7].offsetLeft - geo.x0) / weeks : 0;
    geo.py = (cells[6].offsetTop - geo.y0) / 6;
    geo.size = parseFloat(getComputedStyle(c0).width) || c0.offsetWidth;
    if (!geo.px) return;
    const gridR = geo.x0 + weeks * geo.px + geo.size;
    const gridB = geo.y0 + 6 * geo.py + geo.size;
    if (bandCol) Object.assign(bandCol.style, { width: `${geo.size}px`, height: `${gridB}px` });
    if (bandRow) Object.assign(bandRow.style, { width: `${gridR}px`, height: `${geo.size}px` });
    if (ring) Object.assign(ring.style, { width: `${geo.size}px`, height: `${geo.size}px` });
    if (front) Object.assign(front.style, { top: `${geo.y0}px`, height: `${gridB - geo.y0}px` });
    const at = posOf(shown >= 0 ? shown : cur);
    Object.assign(hair, { x: at.x, y: at.y, tx: at.x, ty: at.y, placed: true });
    paintHair();
  };

  const posOf = (i: number) => ({ x: geo.x0 + Math.floor(i / 7) * geo.px, y: geo.y0 + (i % 7) * geo.py });

  const paintHair = () => {
    if (ring) ring.style.transform = `translate(${hair.x.toFixed(2)}px, ${hair.y.toFixed(2)}px)`;
    if (bandCol) bandCol.style.transform = `translateX(${hair.x.toFixed(2)}px)`;
    if (bandRow) bandRow.style.transform = `translateY(${hair.y.toFixed(2)}px)`;
  };

  /** The ring (and the bands with it) glides to cell i with `approach` at the hover rate. */
  const aim = (i: number) => {
    if (!geo.px) measure();
    const p = posOf(i);
    hair.tx = p.x;
    hair.ty = p.y;
    if (quiet() || !hair.placed) {
      Object.assign(hair, { x: p.x, y: p.y, placed: true });
      paintHair();
      return;
    }
    hairStop ??= onFrame((_now, dt) => {
      hair.x = approach(hair.x, hair.tx, GLIDE, dt);
      hair.y = approach(hair.y, hair.ty, GLIDE, dt);
      const done = Math.abs(hair.x - hair.tx) < 0.05 && Math.abs(hair.y - hair.ty) < 0.05;
      if (done) {
        hair.x = hair.tx;
        hair.y = hair.ty;
      }
      paintHair();
      if (done) {
        hairStop = null;
        return false;
      }
    });
  };

  /** Bands and the week's month and weekday labels: on for a hovered or keyboard-stepped day. */
  const bands = (i: number | null) => {
    bandsOn = i !== null;
    grid?.parentElement?.classList.toggle("is-cross", bandsOn);
    hotLabels.forEach((l) => l.classList.remove("is-hot"));
    hotLabels = [];
    if (i === null) return;
    const col = Math.floor(i / 7) + 1;
    let m: HTMLElement | undefined;
    for (const s of months) if (Number(s.style.getPropertyValue("--c")) <= col) m = s;
    const d = dayLabels[i % 7];
    for (const l of [m, d]) {
      if (!l?.textContent) continue;
      l.classList.add("is-hot");
      hotLabels.push(l);
    }
  };

  /** The readout follows the day: it rolls up to later dates, down to earlier ones. */
  const show = (i: number) => {
    const cell = cells[i];
    if (!out || !cell || cell.classList.contains("is-future") || i === shown) return;
    rollText(out, describe(cell), { dir: shown >= 0 && i < shown ? "down" : "up", instant: shown < 0 || quiet() });
    shown = i;
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
  const keepVisible = (cell: HTMLElement) => {
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
    show(cur);
    aim(cur);
    grid?.setAttribute("aria-valuenow", String(cur));
    grid?.setAttribute("aria-valuetext", describe(cell));
    return cell;
  };

  const select = (i: number) => keepVisible(mark(i));

  const cellAt = (e: Event) => {
    const t = e.target instanceof Element ? e.target.closest<HTMLElement>(".heat__c") : null;
    return t ? cells.indexOf(t) : -1;
  };

  // ───────── entry ─────────

  /** Event lines type in whole characters, a frame each (the text stays in the DOM, a clip reveals it). */
  const typeLines = (b: Build, at: number) => {
    const lines = [...root.querySelectorAll<HTMLElement>(".events__list > li")];
    const plan = lines.map((li, n) => {
      // the line's printed extent, not its box: the repo link stretches to the column's end
      const r = li.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(li);
      // measured on screen (the glass is tilted), counted in the line's own pixels
      const extent = (Math.min(r.width, range.getBoundingClientRect().right - r.left) / (r.width || 1)) * li.offsetWidth;
      const ch = parseFloat(getComputedStyle(li).fontSize) * 0.6 || 8;
      const chars = Math.max(1, Math.ceil(extent / ch));
      li.classList.add("is-typing");
      li.style.setProperty("--n", "0");
      return { li, start: at + n * F(5), chars, perTick: Math.max(1, (chars * TICK) / LINE_CAP), n: 0 };
    });
    const t0 = b.tl.t0;
    const end = () => {
      for (const p of plan) {
        p.li.classList.remove("is-typing");
        p.li.style.removeProperty("--n");
      }
    };
    const stop = onFrame((now) => {
      let busy = false;
      for (const p of plan) {
        if (p.n >= p.chars) continue;
        busy = true;
        const k = Math.floor((now - t0 - p.start) / TICK) + 1;
        if (k <= 0) continue;
        const n = Math.min(p.chars, Math.ceil(k * p.perTick));
        if (n === p.n) continue;
        p.n = n;
        if (n >= p.chars) {
          p.li.classList.remove("is-typing");
          p.li.style.removeProperty("--n");
        } else p.li.style.setProperty("--n", String(n));
      }
      if (!busy) return false;
    });
    b.keep(() => {
      stop();
      end();
    });
  };

  const dock = () => {
    finishAll();
    const b = makeBuild();
    entry = b;
    root.querySelectorAll<HTMLElement>(".logs__stat").forEach((stat, i) => {
      // D1 corner stutter, then the figure slides out of its own left clip (no count-up)
      b.keep(corners(stat, "on", { delay: i * F(2) }));
      const v = stat.querySelector<HTMLElement>("dd > b");
      if (v) b.keep(maskSlide(v, { delay: F(14) + i * F(2) }));
      const date = stat.querySelector<HTMLElement>("[data-best-date]");
      if (date) b.keep(typeText(date, (date.dataset.text ??= date.textContent ?? ""), { delay: F(14) + i * F(2) }));
    });
    typeLines(b, F(28));
  };

  /** D10: a hot front sweeps the calendar from the left; each cell lands overexposed and cools. */
  const reveal = () => {
    hero?.finish();
    const b = makeBuild();
    hero = b;
    measure();
    if (!grid || !geo.px) return;
    const step = (geo.px / (FRONT * unit())) * 1000;
    // on the calendar body, so the cells and the ring both read it
    (body ?? grid).style.setProperty("--heat-step", `${step.toFixed(2)}ms`);
    if (front && !matchMedia(PHONE_QUERY).matches) {
      const cols = Math.ceil(cells.length / 7);
      const dur = cols * step;
      // not pinned to the timeline: it starts on the same frame as the cells' CSS sweep
      const run = front.animate(
        [
          { translate: `${geo.x0}px 0`, opacity: 1 },
          { opacity: 1, offset: Math.max(0, 1 - F(5) / dur) },
          { translate: `${geo.x0 + cols * geo.px}px 0`, opacity: 0 },
        ],
        { duration: dur, easing: "linear" },
      );
      b.keep(() => run.cancel());
    }
  };

  const finishAll = () => {
    entry?.finish();
    entry = null;
    hero?.finish();
    hero = null;
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      out = root.querySelector("[data-heat-sel-text]");
      grid = root.querySelector<HTMLElement>("[data-heat-grid]");
      body = root.querySelector<HTMLElement>(".heat__body");
      scroller = root.querySelector<HTMLElement>("[data-heat-scroll]");
      days = root.querySelector<HTMLElement>(".heat__days");
      months = [...root.querySelectorAll<HTMLElement>(".heat__months span")];
      dayLabels = [...root.querySelectorAll<HTMLElement>(".heat__days span")];
      ring = root.querySelector("[data-ring]");
      bandCol = root.querySelector('[data-band="col"]');
      bandRow = root.querySelector('[data-band="row"]');
      front = root.querySelector("[data-front]");
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
      body?.classList.add("has-ring");
      mark(last);

      // hover previews only for a mouse; touch would preview whatever a swipe starts on
      grid.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const i = cellAt(e);
        if (i < 0 || cells[i].classList.contains("is-future")) return;
        show(i);
        aim(i);
        bands(i);
      });
      grid.addEventListener("pointerleave", () => {
        show(cur);
        aim(cur);
        if (!grid?.classList.contains("is-kbd")) bands(null);
      });
      grid.addEventListener("pointerdown", () => grid?.classList.remove("is-kbd"));
      // a click, not pointerdown: a sideways swipe through the calendar scrolls it without choosing a day
      grid.addEventListener("click", (e) => {
        const i = cellAt(e);
        if (i >= 0 && i <= last) select(i);
        if (e instanceof PointerEvent && e.pointerType !== "mouse") bands(null);
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
        bands(cur);
      });
      grid.addEventListener("blur", () => {
        grid?.classList.remove("is-kbd");
        bands(null);
      });
    },
    enter(_from, first) {
      active = true;
      // phones: start the sideways calendar at the latest weeks
      if (first && scroller && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = scroller.scrollWidth;
      trim();
      measure();
    },
    phase(p) {
      if (p === "dock") dock();
      else if (p === "reveal") reveal();
      else if (p === "settled") finishAll();
    },
    finish: finishAll,
    leave() {
      active = false;
      bands(null);
    },
    resize() {
      trim();
      if (active) measure();
    },
  };
}
