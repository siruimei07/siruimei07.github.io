// Markup of the white opening (PV 0:06–0:27): paper with blurred DNA, the
// access line, the mark drawing itself, the identity lines, the permission
// rings and the welcome card, plus the boot's own copy of the corner lockup
// and signature. Every moving part starts invisible; boot.ts drives it from a
// clock. Hidden without JavaScript. Runs at build time: strings only.

import { boot, brand } from "../content.ts";
import { esc, MARK_LOOPS } from "../markup.ts";

/** MARK_CONTOUR walked the other way round, starting at the top of the left loop,
 *  so the stroke draws down the left loop and up through the crossing as in the PV. */
const MARK_DRAW =
  "M70 15C37 15 15 39 15 70C15 101 38 128 70 128C103 128 127 96 176 52C181 47 186 43 192 38C207 23 221 15 240 15C273 15 295 41 295 73C295 105 273 128 240 128C208 128 182 99 156 75C127 48 103 15 70 15Z";

/** One double helix along the axis a→b: two strands half a turn apart and the rungs between them. */
function helix(ax: number, ay: number, bx: number, by: number, amp: number, period: number, phase: number) {
  const len = Math.hypot(bx - ax, by - ay);
  const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
  const [nx, ny] = [-uy, ux];
  const at = (s: number, side: 1 | -1, k = 1) => {
    const o = side * amp * k * Math.sin((s / period) * Math.PI * 2 + phase);
    return `${Math.round(ax + ux * s + nx * o)} ${Math.round(ay + uy * s + ny * o)}`;
  };
  const strand = (side: 1 | -1) => {
    const pts: string[] = [];
    for (let s = 0; s <= len; s += 14) pts.push(at(s, side));
    return `M${pts.join("L")}`;
  };
  const rungs: string[] = [];
  for (let s = period / 20; s < len; s += period / 10) rungs.push(`M${at(s, 1, 0.8)}L${at(s, -1, 0.8)}`);
  return { strands: strand(1) + strand(-1), rungs: rungs.join("") };
}

function dna(): string {
  const a = helix(800, -160, -160, 1260, 170, 620, 0.6);
  const b = helix(1522, -120, 1522, 1200, 96, 540, 2.2);
  return `<svg class="boot__dna" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice"><path class="boot__strand" d="${a.strands}${b.strands}"/><path class="boot__rung" d="${a.rungs}${b.rungs}"/></svg>`;
}

/** The ∞ in its drawable form: the closed contour that is drawn in, the open loops it
 *  settles into (the gap at the crossing), the + and − that pop, and the draw head. */
const drawMark = (cls: string) =>
  `<svg class="boot__mark ${cls}" viewBox="0 0 310 145"><path class="boot__contour" d="${MARK_DRAW}" pathLength="1"/><path class="boot__loops" d="${MARK_LOOPS}"/><path class="boot__plus" d="M44 70h50M69 45v50"/><path class="boot__minus" d="M219 70h44"/><circle class="boot__head" r="7" cx="70" cy="15"/></svg>`;

/** Text that is typed in place: the untyped rest keeps its room, so centred lines never shift. */
const typed = (text: string, cls = "") => `<span class="boot__t${cls ? ` ${cls}` : ""}"><span data-on></span><span data-off>${esc(text)}</span></span>`;

export function renderBoot(): string {
  const lines = boot.lines.map((l) => `<li><i class="boot__dash"></i>${typed(l)}</li>`).join("");
  return `<div class="boot" data-boot>
  <div class="boot__paper" aria-hidden="true"><div class="boot__drift">${dna()}</div></div>
  <div class="boot__scene" data-b="scene" aria-hidden="true">
    <p class="boot__access" data-b="access">${typed(boot.access)}</p>
    <div class="boot__logo" data-b="logo">${drawMark("boot__mark--lg")}<p class="boot__name">${typed(brand.mark)}</p></div>
    <ul class="boot__lines" data-b="lines">${lines}</ul>
    <div class="boot__rings" data-b="rings">
      <svg viewBox="-500 -500 1000 1000"><path class="boot__r-outer"/><path class="boot__r-pale"/><path class="boot__r-arc"/><path class="boot__r-arc"/><path class="boot__r-side"/><path class="boot__r-side"/><circle class="boot__r-core" r="0"/><circle class="boot__r-head" r="0"/><circle class="boot__r-phead" r="0"/><circle class="boot__r-orange" r="0"/><circle class="boot__r-orange" r="0"/></svg>
      <p class="boot__perm">${typed(boot.permission)}</p>
    </div>
    <div class="boot__card" data-b="card">
      <p class="boot__wt">${esc(boot.welcome[0])}</p>
      <p class="boot__bar namebar"><span>${esc(boot.welcome[1])}</span></p>
      <p class="boot__db">${esc(boot.welcome[2])}</p>
      <div class="boot__wlogo">${drawMark("boot__mark--sm")}<p class="boot__name boot__name--sm">${esc(brand.mark)}</p></div>
    </div>
    <i class="boot__flash" data-b="flash-ink"></i>
    <i class="boot__flash boot__flash--pale" data-b="flash-pale"></i>
  </div>
  <div class="boot__corner" aria-hidden="true">
    <p class="brand boot__brand" data-b="brand"><a><b>${esc(brand.title)}</b><span>${esc(brand.sub)}</span><i><span>${esc(brand.os[0])}</span><b>${esc(brand.os[1])}</b></i></a></p>
    <p class="boot__sign" data-b="sign"><span class="foot-powered">${esc(brand.powered[0])} <b>${esc(brand.powered[1])}</b><i></i></span></p>
  </div>
  <p class="boot__cap" data-b="cap" aria-hidden="true"></p>
  <button type="button" class="boot__skip" data-boot-skip aria-label="${esc(boot.skip)} · 跳过开场">${esc(boot.skip)} <span aria-hidden="true">›</span></button>
</div>`;
}
