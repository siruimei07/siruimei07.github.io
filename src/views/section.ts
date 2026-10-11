// The frame every section screen shares, after the PV's director screens:
// a logotype tile straddling the left rule, and a tilted glass plate on the
// right that holds the content.

import { brand, type Logotype, type Section } from "../content.ts";
import { esc, logotype, squareLine } from "../markup.ts";

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
};

export function sectionScreen(s: Section, f: SectionFrame): string {
  return `<section id="${s.id}" class="screen sect sect--${s.id}${f.cls ? ` ${f.cls}` : ""}" data-screen="${s.id}" aria-labelledby="h-${s.id}" tabindex="-1">
  <div class="sect__tile" data-tile>
    <p class="sect__tab" aria-hidden="true">SECTION</p>
    <div class="tile" data-tile-box>${f.tileHtml ?? logotype(f.tile ?? s.tile)}<i class="tile__dot" aria-hidden="true"></i></div>
  </div>
  <div class="sect__panel">
    <div class="glass sect__glass" data-glass>
      <span class="ghost sect__ghost" aria-hidden="true">${esc(f.ghost)}</span>
      <i class="sect__orb" aria-hidden="true"><i></i></i>
      <header class="sect__head">
        <h2 class="sect__h" id="h-${s.id}"><span class="sect__no">${esc(s.no)}</span><span class="sect__label">${esc(s.label)}</span><small class="zh">${esc(s.zh)}</small></h2>
        <p class="sect__access" aria-hidden="true"><span class="tag tag--line">GENERAL ACCESS CONTENT</span><span class="tag tag--grey">${esc(brand.title)}.</span></p>
      </header>
      <div class="sect__body">${f.body}</div>
      ${squareLine(s.section, "sect__foot")}
    </div>
  </div>
</section>`;
}
