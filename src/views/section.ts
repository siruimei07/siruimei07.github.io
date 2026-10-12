// The frame every section screen shares, after the PV's director screens:
// a logotype tile straddling the left rule, and a tilted glass plate on the
// right that holds the content. The card, frost and decryption layers are the
// shell's (app.ts) to animate; without scripts they are inert or hidden.

import { brand, worksText, type Logotype, type Section } from "../content.ts";
import { esc, logotype } from "../markup.ts";

export type SectionFrame = {
  /** Big pale word across the top of the plate (the PV's "AHRENS PA…"). */
  ghost: string;
  /** Tile shown at the left; defaults to the section's own. */
  tile?: Logotype;
  /** Raw tile contents, for screens that swap between several logotypes. */
  tileHtml?: string;
  body: string;
  /** Extra class on the screen element. */
  cls?: string;
  /** Length of the screen's own build after dock, in ms (MOTION-SPEC §4.2). */
  buildMs?: number;
  /** Length of its hero build after the reveal, in ms. */
  revealMs?: number;
};

export function sectionScreen(s: Section, f: SectionFrame): string {
  const timing = `${f.buildMs !== undefined ? ` data-build-ms="${f.buildMs}"` : ""}${f.revealMs !== undefined ? ` data-reveal-ms="${f.revealMs}"` : ""}`;
  // the decryption overlay: four corner marks, the joining line and its midpoint (geometry set by the shell)
  const marks = ["tl", "tr", "bl", "br"].map((c) => `<rect class="decrypt__mark" data-c="${c}"/>`).join("");
  // ■ TEXT whose text can slide out from behind the square (T7a)
  const foot = `<span class="sq__clip"><span>${esc(s.section)}</span></span>`;
  return `<section id="${s.id}" class="screen sect sect--${s.id}${f.cls ? ` ${f.cls}` : ""}" data-screen="${s.id}" aria-labelledby="h-${s.id}" tabindex="-1"${timing}>
  <div class="sect__tile" data-tile data-depth="3.3" data-tc>
    <div class="sect__card">
      <p class="sect__tab" aria-hidden="true">SECTION</p>
      <div class="tile" data-tile-box>${f.tileHtml ?? logotype(f.tile ?? s.tile)}<i class="tile__dot" aria-hidden="true"></i></div>
    </div>
  </div>
  <div class="sect__panel" data-depth="1.75">
    <div class="glass sect__glass" data-glass data-tc>
      <span class="ghost sect__ghost" aria-hidden="true">${esc(f.ghost)}</span>
      <i class="sect__orb" aria-hidden="true"><i></i></i>
      <header class="sect__head">
        <h2 class="sect__h" id="h-${s.id}"><span class="sect__no">${esc(s.no)}</span><span class="sect__label">${esc(s.label)}</span><small class="zh">${esc(s.zh)}</small></h2>
        <p class="sect__access" aria-hidden="true"><span class="tag tag--line" data-blink><span>GENERAL ACCESS CONTENT</span></span><span class="tag tag--grey"><span>${esc(brand.title)}.</span></span></p>
      </header>
      <div class="sect__bodywrap">
        <div class="sect__body">${f.body}</div>
        <i class="sect__frost" aria-hidden="true"></i>
        <svg class="sect__decrypt" aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path class="decrypt__line"/>${marks}<circle class="decrypt__pt"/></svg>
        <p class="sect__decrypt-label" aria-hidden="true"><span>${esc(worksText.confidentiality)}:</span> <b>${esc(worksText.public)}</b></p>
      </div>
      <p class="sq sect__foot"><span>${foot}</span><span class="sq__echo" aria-hidden="true">${foot}</span></p>
    </div>
  </div>
</section>`;
}
