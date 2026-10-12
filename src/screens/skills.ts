// RESEARCH behaviour: three tabs (STAT / ECON / QNT) and the specimens' live
// readouts. A switch follows the PV's sub-page swap (MOTION-SPEC §8.3, atlas
// §6.4): the tile cuts to the new logotype and stamps it (C9), the title plate
// collapses into its accent bar and wipes back in, the panel clears and the
// next specimen grows on (CSS, keyed on .is-out / .is-grow). Under the pointer
// each specimen reads out what it shows.

import { F, PHONE_QUERY, SEQ, TICK, cssEase, flicker, onFrame, rollText, typeText, type Cancel } from "../app/fx.ts";
import { skills, type Skill } from "../content.ts";
import { pad } from "../markup.ts";
import { AXIS, ECON, QUANT, STATS, VIZ_H, VIZ_W, statsY } from "../views/viz.ts";
import { Build } from "./home.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

/** The switch is over once the last Monte Carlo path has drawn (874 + 21 frames + 800 ms). */
const SWITCH_MS = F(68);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Standard normal cdf (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
function phi(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return 0.5 * (1 + Math.sign(z) * erf);
}

/** y at x on a sampled curve (points sorted by x). */
function yAt(pts: [number, number][], x: number): number {
  let i = 1;
  while (i < pts.length - 1 && pts[i][0] < x) i++;
  const [x0, y0] = pts[i - 1];
  const [x1, y1] = pts[i];
  return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

type Probe = { show(): void; hide(): void; at(x: number, y: number): void };

/** The live readout of one specimen. Geometry follows the pointer every frame; the
 *  numbers are written at most once a PV frame; discrete labels roll (RhineLabUI). */
function probe(plot: HTMLElement, kind: Skill["id"]): Probe | null {
  const svg = plot.querySelector<SVGSVGElement>(".lab__probe");
  const read = plot.querySelector<HTMLElement>(".lab__readout");
  if (!svg || !read) return null;
  const px = svg.querySelector<SVGPathElement>(".lab__px")!;
  const dots = [...svg.querySelectorAll<SVGCircleElement>(".lab__pd")];
  const pp = svg.querySelector<SVGPathElement>(".lab__pp");
  const slot = (k: string) => read.querySelector<HTMLElement>(`[data-r="${k}"]`);
  const set = (k: string, v: string) => {
    const el = slot(k);
    if (el && el.textContent !== v) el.textContent = v;
  };
  const dot = (i: number, x: number, y: number) => {
    dots[i]?.setAttribute("cx", x.toFixed(1));
    dots[i]?.setAttribute("cy", y.toFixed(1));
  };
  const line = (x: number) => px.setAttribute("transform", `translate(${x.toFixed(1)} 0)`);

  // ECON: both curves sampled once, on first use, into x → y tables
  let curves: { s: [number, number][]; d: [number, number][] } | null = null;
  const sample = (sel: string): [number, number][] => {
    const path = plot.querySelector<SVGPathElement>(sel);
    if (!path) return [[AXIS.x0, AXIS.y0]];
    const len = path.getTotalLength();
    const pts: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const p = path.getPointAtLength((len * i) / 199);
      pts.push([p.x, p.y]);
    }
    return pts.sort((a, b) => a[0] - b[0]);
  };
  const qStar = (ECON.qs - AXIS.x0) / (AXIS.x1 - AXIS.x0);
  const STATES = ["SHORTAGE", "EQUILIBRIUM", "SURPLUS"];
  let state = -1;

  // QUANT: the paths' heights, parsed once from their data
  let paths: { el: SVGPathElement; ys: number[] }[] | null = null;
  /** The highlighted path, and the one the readout names (it may lag by a frame). */
  let lit = -1;
  let near = -1;
  const step = (QUANT.end - QUANT.x0) / QUANT.n;

  const apply = (x: number, y: number, text: boolean) => {
    if (kind === "stats") {
      const xv = clamp(x, AXIS.x0, AXIS.x1);
      line(xv);
      dot(0, xv, statsY(xv));
      if (!text) return;
      const z = (xv - STATS.mu) / STATS.sd;
      set("z", `${z < -0.005 ? "−" : "+"}${Math.abs(z).toFixed(2)}σ`);
      set("pdf", (Math.exp((-z * z) / 2) / Math.sqrt(2 * Math.PI)).toFixed(3));
      set("cdf", `${(100 * phi(z)).toFixed(1)}%`);
    } else if (kind === "econ") {
      curves ??= { s: sample('[data-curve="s"]'), d: sample('[data-curve="d"]') };
      const xv = clamp(x, 70, 470);
      const ys = yAt(curves.s, xv);
      const yd = yAt(curves.d, xv);
      line(xv);
      dot(0, xv, ys);
      dot(1, xv, yd);
      pp?.setAttribute("d", `M${xv.toFixed(1)} ${ys.toFixed(1)}H${AXIS.x0}M${xv.toFixed(1)} ${yd.toFixed(1)}H${AXIS.x0}`);
      if (!text) return;
      const q = (xv - AXIS.x0) / (AXIS.x1 - AXIS.x0);
      const price = (v: number) => ((AXIS.y0 - v) / (AXIS.y0 - AXIS.y1)).toFixed(2);
      set("q", q.toFixed(2));
      set("ps", price(ys));
      set("pd", price(yd));
      const st = Math.abs(q - qStar) <= 0.02 * qStar ? 1 : q < qStar ? 0 : 2;
      const el = slot("state");
      if (el && st !== state) rollText(el, STATES[st], { dir: st > state || state < 0 ? "up" : "down" });
      state = st;
    } else {
      paths ??= [...plot.querySelectorAll<SVGPathElement>("[data-path]")].map((el) => ({
        el,
        ys: (el.getAttribute("d") ?? "")
          .split(/[ML]/)
          .filter((seg) => seg.trim())
          .map((seg) => Number(seg.trim().split(/\s+/)[1])),
      }));
      const xv = clamp(x, QUANT.x0, QUANT.end);
      const ft = (xv - QUANT.x0) / step;
      const i0 = Math.min(QUANT.n - 1, Math.floor(ft));
      const fr = ft - i0;
      let best = 0;
      let bestY = 0;
      let bestD = Infinity;
      paths.forEach((p, i) => {
        const yp = p.ys[i0] + (p.ys[i0 + 1] - p.ys[i0]) * fr;
        const d = Math.abs(yp - y);
        if (d < bestD) {
          bestD = d;
          best = i;
          bestY = yp;
        }
      });
      line(xv);
      dot(0, xv, bestY);
      if (best !== lit) {
        if (lit >= 0) paths[lit].el.classList.remove("is-near");
        paths[best].el.classList.add("is-near");
        lit = best;
      }
      if (!text) return;
      const t = Math.round(ft);
      const el = slot("path");
      if (el && best !== near) rollText(el, pad(best + 1, 2), { dir: best > near || near < 0 ? "up" : "down" });
      near = best;
      set("s", ((AXIS.y0 - paths[best].ys[t]) / (AXIS.y0 - QUANT.y0)).toFixed(3));
      set("t", `${pad(t, 2)}/${QUANT.n}`);
    }
  };

  let x = 0;
  let y = 0;
  let lastText = -Infinity;
  let pending: Cancel | null = null;
  return {
    show() {
      plot.classList.add("is-probe");
    },
    hide() {
      plot.classList.remove("is-probe");
      if (paths && lit >= 0) paths[lit].el.classList.remove("is-near");
      lit = -1;
    },
    at(nx, ny) {
      x = nx;
      y = ny;
      // the drawing follows every frame; the numbers wait for the next PV frame
      pending ??= onFrame((now) => {
        const text = now - lastText >= TICK - 1;
        apply(x, y, text);
        if (!text) return;
        lastText = now;
        pending = null;
        return false;
      });
    },
  };
}

export function createSkills(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let tabs: HTMLButtonElement[] = [];
  let panels: HTMLElement[] = [];
  const probes = new Map<HTMLElement, Probe>();
  let current = 0;
  const sw = new Build();

  /** C9: cut to the new logotype on the frame, then stamp it — scale 1.9 → 1 and the F3 flicker. */
  const stamp = (id: string) => {
    for (const a of root.querySelectorAll<HTMLElement>("[data-tile-alt]")) a.classList.toggle("is-on", a.dataset.tileAlt === id);
    const lt = root.querySelector<HTMLElement>(`[data-tile-alt="${id}"] .lt`);
    if (!lt || ctx.reduced()) return;
    lt.animate([{ scale: 1.9 }, { scale: 1 }], { duration: 545, easing: cssEase("expo") });
    flicker(lt, SEQ.logoStamp);
  };

  /** The B2 title swap, P4 clear and grow-on; a switch in flight jumps to its end first. */
  const swap = (from: HTMLElement, to: HTMLElement) => {
    sw.finish();
    for (const p of panels) {
      p.classList.remove("is-on", "is-out", "is-grow");
      p.inert = false;
    }
    if (ctx.reduced()) {
      to.classList.add("is-on");
      return;
    }
    // a fresh style pass, so classes that just came off can restart their animations
    void root.offsetWidth;
    from.classList.add("is-out");
    from.inert = true;
    to.classList.add("is-on", "is-grow");
    sw.start();
    // the old panel goes once its plate is down to the accent bar and the new one starts its wipe
    sw.at(F(14), () => {
      from.classList.remove("is-out");
      from.inert = false;
    });
    sw.at(SWITCH_MS, () => to.classList.remove("is-grow"));
    // + 1164: the notes and the CI label type in, a fixed 400 ms each (T1c)
    for (const t of to.querySelectorAll<SVGTextElement>(".viz__note, .viz__ci text")) {
      const text = (t.dataset.text ??= t.textContent ?? "");
      // typeText only sets textContent, which an SVG <text> has too
      sw.keep(typeText(t as unknown as HTMLElement, text, { fixed: 400, delay: F(32) }));
    }
  };

  const select = (i: number, focus = false) => {
    const next = (i + tabs.length) % tabs.length;
    if (next === current) {
      if (focus) tabs[current].focus();
      return;
    }
    const prevId = tabs[current].dataset.skill;
    current = next;
    const id = tabs[current].dataset.skill!;
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(j === current));
      t.tabIndex = j === current ? 0 : -1;
    });
    const from = panels.find((p) => p.dataset.skillPanel === prevId);
    const to = panels.find((p) => p.dataset.skillPanel === id);
    for (const pr of probes.values()) pr.hide();
    stamp(id);
    if (from && to) swap(from, to);
    if (focus) tabs[current].focus();
    const k = skills[current];
    ctx.caption(`${k.zh}科：${k.motto}`);
    ctx.log(`> OPEN ${k.tile.lines.join("")}-00${current + 1}`);
  };

  /** The pointer over a specimen: a precise pointer while it hovers, a finger while it drags
   *  (vertical swipes still scroll); a finger's reading stays after it lifts. */
  const bindProbe = (panel: HTMLElement) => {
    const plot = panel.querySelector<HTMLElement>(".lab__plot");
    const hit = plot?.querySelector<HTMLElement>(".lab__hit");
    const kind = panel.dataset.skillPanel as Skill["id"];
    const pr = plot && probe(plot, kind);
    if (!plot || !hit || !pr) return;
    probes.set(panel, pr);
    let finger = false;
    // offsetX/Y are in the plot's own plane, so the tilted glass does not skew them
    const at = (e: PointerEvent) => pr.at((e.offsetX / (hit.clientWidth || 1)) * VIZ_W, (e.offsetY / (hit.clientHeight || 1)) * VIZ_H);
    hit.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      finger = true;
      pr.show();
      at(e);
    });
    hit.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && !finger) return;
      pr.show();
      at(e);
    });
    const lift = () => (finger = false);
    hit.addEventListener("pointerup", lift);
    hit.addEventListener("pointercancel", lift);
    hit.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch") pr.hide();
    });
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-skill]")];
      panels = [...root.querySelectorAll<HTMLElement>("[data-skill-panel]")];
      tabs.forEach((t, i) => t.addEventListener("click", () => select(i)));
      panels.forEach(bindProbe);
    },
    leave() {
      sw.finish();
      for (const pr of probes.values()) pr.hide();
    },
    key(e) {
      const a = document.activeElement;
      const onTab = tabs.includes(a as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // on a tab; or in the desktop frame right after entering, when focus is on the screen
        // itself. Anywhere else the arrows keep scrolling.
        const fresh = (!a || a === root || a === document.body) && !matchMedia(PHONE_QUERY).matches;
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
