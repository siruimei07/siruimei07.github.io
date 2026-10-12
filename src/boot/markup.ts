// Markup of the white opening (PV 0:06–0:27): paper with blurred DNA, the
// access line, the mark drawing itself, the identity line, the permission
// rings and the welcome card, plus the boot's own copy of the corner lockup
// and signature. Every moving part starts invisible; boot.ts drives it from
// the score in motion.ts. Hidden without JavaScript. Runs at build time:
// strings only.

import { boot, brand } from "../content.ts";
import { esc, MARK_CONTOUR, mark } from "../markup.ts";

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

/** Text that is typed in place: the untyped rest keeps its room, so nothing shifts as it grows.
 *  [data-ghost] holds a leading part that is blanked out (the PV's glitch frames). */
const typed = (text: string, cls = "boot__t") => `<span class="${cls}"><span data-ghost></span><span data-on></span><span data-off>${esc(text)}</span></span>`;

/** The permission rings, in the frame's own pixels (centre 960, 540): black and white
 *  rings, the inner arcs, the side circles, the orange pair, six satellites, the core
 *  and the two end caps, in the PV's stacking order. */
const rings = () => {
  const n = (k: number, el: string) => el.repeat(k);
  return `<svg viewBox="0 0 1920 1080"><g class="boot__rings"><path class="boot__r-outer"/><path class="boot__r-pale"/>${n(2, '<path class="boot__r-inner"/>')}${n(2, '<path class="boot__r-side"/>')}${n(2, '<circle class="boot__r-orange" r="0"/>')}${n(6, '<circle class="boot__r-sat" r="0"/>')}<circle class="boot__r-core" cx="959.5" cy="539.5" r="0"/><circle class="boot__r-cap" r="0"/><circle class="boot__r-cap boot__r-cap--pale" r="0"/></g></svg>`;
};

export function renderBoot(): string {
  // the picture is all aria-hidden: this line tells a screen reader what the pause is
  return `<div class="boot" data-boot>
  <p class="sr-only" role="status">正在打开 Sirui Mei 的个人档案 · 按任意键跳过</p>
  <div class="boot__paper" aria-hidden="true"><div class="boot__drift">${dna()}</div><i class="boot__wash"></i></div>
  <div class="boot__scene" data-b="scene" aria-hidden="true">
    <p class="boot__access" data-b="access">${typed(boot.access)}</p>
    <div class="boot__logo" data-b="logo">
      <svg class="boot__mark" viewBox="0 0 310 145"><path class="boot__contour" d="${MARK_CONTOUR}" pathLength="1"/><path class="boot__plus" d="M44 70h50M69 45v50"/><path class="boot__minus" d="M-7.5 0h15"/></svg>
      <p class="boot__name">${typed(brand.mark)}</p>
    </div>
    <p class="boot__auth" data-b="auth"><i class="boot__dash"></i>${typed("")}</p>
    <div class="boot__scan" data-b="scan">${rings()}<p class="boot__perm">${esc(boot.permission)}</p></div>
    <div class="boot__card" data-b="card">
      <i class="boot__panel"></i>
      <p class="boot__wt">${esc(boot.welcome[0])}</p>
      <p class="boot__co"><span class="boot__co-ink">${esc(boot.welcome[1])}</span><span class="boot__co-hl"><span>${esc(boot.welcome[1])}</span></span></p>
      <p class="boot__db">${esc(boot.welcome[2])}</p>
      <div class="boot__wlogo">${mark("boot__wmark")}<p class="boot__name boot__name--sm">${esc(brand.mark)}</p></div>
    </div>
  </div>
  <div class="boot__corner" aria-hidden="true">
    <p class="brand boot__brand" data-b="brand"><a><b>${esc(brand.title)}</b><span>${esc(brand.sub)}</span><i><span>${esc(brand.os[0])}</span><b>${esc(brand.os[1])}</b></i></a></p>
    <p class="boot__sign" data-b="sign"><span class="foot-powered">${esc(brand.powered[0])} <b>${esc(brand.powered[1])}</b><i></i></span></p>
  </div>
  <p class="boot__cap" data-b="cap" aria-hidden="true"></p>
  <button type="button" class="boot__skip" data-boot-skip aria-label="${esc(boot.skip)} · 跳过开场">${esc(boot.skip)} <span aria-hidden="true">›</span></button>
</div>`;
}
