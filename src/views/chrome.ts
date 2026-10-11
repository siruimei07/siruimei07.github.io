// Persistent terminal chrome around every screen: the three-line lockup, the
// orange pager, the left rail with the lime marker, the section line, the
// clock and the POWERED BY signature, and the narrator caption.

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
  return `<header class="chrome" data-chrome>
  <h1 class="brand"><a href="#top" data-go="home" aria-label="${esc(identity.name)} · ${esc(brand.sub)} ${esc(brand.os.join(" "))} — 总览"><b>${esc(brand.title)}</b><span>${esc(brand.sub)}</span><i><span>${esc(brand.os[0])}</span><b>${esc(brand.os[1])}</b></i></a></h1>
  <nav class="pager" aria-label="区块">${pager}</nav>
</header>
<aside class="rail" data-rail>
  <i class="rail__band" aria-hidden="true"></i>
  <nav class="rail__nav" aria-label="区块导航"><ol>${nav}</ol></nav>
  <i class="rail__dash" aria-hidden="true"></i>
  <p class="tag tag--xs">${esc(brand.database)}</p>
  <p class="rail__note" lang="en" data-rail-note>${esc(sections[0].note)}</p>
  <p class="tag tag--xs rail__cmd">${esc(brand.command)}</p>
  <ol class="rail__log" data-log aria-hidden="true"><li>WELCOME TO [${esc(brand.title)}] DATABASE</li></ol>
  <i class="rail__end" aria-hidden="true"></i>
</aside>
<div class="rule" aria-hidden="true"></div>
<i class="rule__mark" data-rule-mark aria-hidden="true"></i>
<p class="foot-sect" aria-hidden="true"><i></i><span data-foot-sect>OVERVIEW</span></p>
<p class="foot-sign"><span class="foot-clock"><span class="sr-only">多伦多当地时间 </span><span data-clock>TORONTO --:--:--</span></span><span class="foot-powered">${esc(brand.powered[0])} <b>${esc(brand.powered[1])}</b><i aria-hidden="true"></i></span></p>
<p class="caption" data-caption><span data-caption-text aria-hidden="true">${esc(home.caption)}</span></p>
<p class="sr-only" data-caption-say aria-live="polite"></p>`;
}
