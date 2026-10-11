// Overview behaviour: leader lines from each callout to its point on the ∞.
// Points come live from the 3D projection; without 3D they are the PV
// positions inside the centred 1920×1080 frame.

import { FALLBACK_ANCHORS } from "../views/home.ts";
import type { Anchor } from "../three/plates.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const SVG = "http://www.w3.org/2000/svg";

// Which end of the callout's underline the leader leaves from.
const SIDE: Record<string, "start" | "end"> = { left: "end", cross: "end", "right-top": "start", "right-bottom": "start" };

export function createHome(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let svg: SVGSVGElement;
  let frame: HTMLElement;
  let live: Record<string, Anchor> | null = null;
  const lines = new Map<string, { line: SVGLineElement; dot: SVGCircleElement; rule: HTMLElement }>();
  let raf = 0;
  let active = false;

  const fallback = (): Record<string, Anchor> => {
    const r = frame.getBoundingClientRect();
    const k = r.width / 1920;
    const out: Record<string, Anchor> = {};
    for (const [id, [x, y]] of Object.entries(FALLBACK_ANCHORS)) out[id] = { x: r.left + x * k, y: r.top + y * k, visible: true };
    return out;
  };

  const draw = () => {
    raf = 0;
    if (!active) return;
    hook();
    const pts = live ?? fallback();
    for (const [id, l] of lines) {
      const p = pts[id];
      const rr = l.rule.getBoundingClientRect();
      if (!p || !p.visible || rr.width === 0) {
        l.line.style.display = l.dot.style.display = "none";
        continue;
      }
      const x0 = SIDE[id] === "end" ? rr.right : rr.left;
      const y0 = rr.top + rr.height / 2;
      l.line.style.display = l.dot.style.display = "";
      l.line.setAttribute("x1", x0.toFixed(1));
      l.line.setAttribute("y1", y0.toFixed(1));
      l.line.setAttribute("x2", p.x.toFixed(1));
      l.line.setAttribute("y2", p.y.toFixed(1));
      l.dot.setAttribute("cx", p.x.toFixed(1));
      l.dot.setAttribute("cy", p.y.toFixed(1));
    }
  };

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };

  // (re)subscribe whenever the 3D scene appears, is replaced or goes away
  let hooked: ReturnType<ScreenContext["plates"]> = null;
  const hook = () => {
    const p = ctx.plates();
    if (p === hooked) return;
    hooked = p;
    live = null;
    p?.onAnchors((a) => {
      if (hooked !== p) return;
      live = a;
      schedule();
    });
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      svg = root.querySelector("[data-leaders]")!;
      frame = root.querySelector("[data-home-frame]")!;
      const dotR = () => Math.max(3, (frame.getBoundingClientRect().width / 1920) * 5.5);
      for (const li of root.querySelectorAll<HTMLElement>("[data-callout]")) {
        const id = li.dataset.callout!;
        const rule = li.querySelector<HTMLElement>("[data-rule]");
        if (!rule || !SIDE[id]) continue;
        const line = document.createElementNS(SVG, "line");
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("r", String(dotR()));
        svg.append(line, dot);
        lines.set(id, { line, dot, rule });
      }
      addEventListener("resize", () => {
        for (const l of lines.values()) l.dot.setAttribute("r", String(dotR()));
        schedule();
      });
    },
    enter() {
      active = true;
      schedule();
    },
    leave() {
      active = false;
    },
    resize() {
      schedule();
    },
  };
}
