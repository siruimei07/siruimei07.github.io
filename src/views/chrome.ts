// Persistent terminal chrome around every screen: the three-line lockup, the
// orange pager, the left rail with the lime marker, the section line, the
// clock and the POWERED BY signature, and the narrator caption. `data-tc`
// marks the theme-cascade cells; the veil and the motion-blur filter serve
// the shell's screen changes.

import { brand, home, identity, sections } from "../content.ts";
import { esc } from "../markup.ts";

export function renderChrome(): string {
  const pager = sections
    .map((s) => `<a href="#${s.id}" data-pager="${s.id}" aria-label="${esc(`${s.no} ${s.label} · ${s.zh}`)}"><i></i><span>${esc(s.no)} ${esc(s.label)}</span></a>`)
    .join("");
  const nav = sections
    .map((s) => `<li><a href="#${s.id}" data-nav="${s.id}"><b>${esc(s.no)}</b><span>${esc(s.label)}</span><small class="zh">${esc(s.zh)}</small></a></li>`)
    .join("");
  // The caption is typed out letter by letter, so the visible copy is hidden
  // from screen readers and a separate live region announces it once, whole.
  const clock = (k: string) => `<span class="foot-clock__d" data-clock-${k}>--</span>`;
  return `<i class="veil" aria-hidden="true"></i>
<svg class="mb-defs" aria-hidden="true" focusable="false" width="0" height="0"><filter id="rl-mb" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="0 0"/></filter><filter id="rl-mb-out" x="-20%" y="-5%" width="140%" height="110%"><feGaussianBlur stdDeviation="0 0"/></filter></svg>
<header class="chrome" data-chrome>
  <h1 class="brand" data-tc><a href="#top" data-go="home" aria-label="${esc(identity.name)} · ${esc(brand.sub)} ${esc(brand.os.join(" "))} — 总览"><b>${esc(brand.title)}</b><span>${esc(brand.sub)}</span><i><span>${esc(brand.os[0])}</span><b>${esc(brand.os[1])}</b></i></a></h1>
  <nav class="pager" aria-label="区块" data-tc>${pager}</nav>
</header>
<aside class="rail" data-rail data-tc>
  <i class="rail__band" aria-hidden="true"></i>
  <nav class="rail__nav" aria-label="区块导航"><ol>${nav}</ol></nav>
  <i class="rail__dash" aria-hidden="true"></i>
  <p class="tag tag--xs" data-blink>${esc(brand.database)}</p>
  <p class="rail__note" lang="en" data-rail-note>${esc(sections[0].note)}</p>
  <p class="tag tag--xs rail__cmd" data-blink>${esc(brand.command)}</p>
  <ol class="rail__log" data-log aria-hidden="true"><li>WELCOME TO [${esc(brand.title)}] DATABASE</li></ol>
  <i class="rail__end" aria-hidden="true"></i>
</aside>
<div class="rule" aria-hidden="true" data-tc></div>
<i class="rule__mark" data-rule-mark aria-hidden="true" data-tc></i>
<p class="foot-sect" aria-hidden="true" data-tc><i></i><span data-foot-sect>OVERVIEW</span></p>
<p class="foot-sign" data-tc><span class="foot-clock"><span class="sr-only">多伦多当地时间 </span><span data-clock>${esc(identity.homebase.toUpperCase())} ${clock("h")}:${clock("m")}:${clock("s")}</span></span><span class="foot-powered">${esc(brand.powered[0])} <b>${esc(brand.powered[1])}</b><i aria-hidden="true"></i></span></p>
<p class="caption" data-caption data-tc><span data-caption-text aria-hidden="true">${esc(home.caption)}</span></p>
<p class="sr-only" data-caption-say aria-live="polite"></p>`;
}
