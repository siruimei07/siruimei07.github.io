// SYSTEM: a Rhine Lab config sheet — coded rows (SYS-01…) of segmented tags
// for theme, motion and the 3D scene, the opening replay, where settings live,
// and the credits. Each segment carries an inverted copy of its label (the
// B2 fill, clipped by screens/system.ts's state), hidden from assistive tech;
// the head line has the PV's orbiting loader and a progress hairline.

import { brand, credits, sectionById, system } from "../content.ts";
import { esc, ext, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";

type Opt = [string, string, string];

function seg(name: string, opts: Opt[]) {
  const label = (en: string, zh: string) => `<span>${esc(en)}</span><small class="zh">${esc(zh)}</small>`;
  const buttons = opts
    .map(
      ([v, en, zh]) =>
        `<button type="button" role="radio" aria-checked="false" class="seg" data-${name}="${v}"><span class="seg__face">${label(en, zh)}</span><span class="seg__fill" aria-hidden="true">${label(en, zh)}</span></button>`,
    )
    .join("");
  return `<div class="config__opts" role="radiogroup" aria-labelledby="cfg-${name}">${buttons}</div>`;
}

const code = (n: number) => `<span class="config__code" aria-hidden="true">SYS-${pad(n, 2)}</span>`;

/** The credits open with an English sentence: mark it, so a Chinese voice does not read it. */
function creditsLine(text: string): string {
  // up to the first full stop that is followed by Chinese
  const m = /^(.+?\.)\s+(?=[^\x20-\x7e])(.+)$/s.exec(text);
  return m ? `<span lang="en">${esc(m[1])}</span> ${esc(m[2])}` : esc(text);
}

export function renderSystem(): string {
  const s = sectionById.system;
  const row = (n: number, k: { label: string; zh: string; options: Opt[] }, name: string, now: boolean) =>
    `<li class="config__row" style="--n:${n - 1}">${code(n)}<p class="config__label" id="cfg-${name}"><span>${esc(k.label)}</span><small class="zh">${esc(k.zh)}</small></p>${
      now ? `<p class="config__now" data-cfg-now="${name}"></p>` : `<p class="config__now" aria-hidden="true"></p>`
    }${seg(name, k.options)}</li>`;
  const body = `<div class="config">
  <p class="config__head" aria-hidden="true"><span>${esc(brand.title)} / ${esc(s.section)}</span><span class="config__hcode">${esc(s.code)}<i class="config__orbit"><i></i><i></i></i></span><i class="config__prog" data-prog></i></p>
  <ul class="config__rows" data-reveal>
    ${row(1, system.theme, "theme", true)}
    ${row(2, system.motion, "motion", true)}
    ${row(3, system.three, "three", false)}
    <li class="config__row config__row--action" style="--n:3">${code(4)}<p class="config__label" id="cfg-replay"><span>${esc(system.replay.label)}</span><small class="zh">${esc(system.replay.zh)}</small></p><p class="config__now" aria-hidden="true"></p><p class="config__opts"><button type="button" class="btn" data-replay aria-describedby="cfg-replay">REPLAY <span aria-hidden="true">›</span></button></p></li>
  </ul>
  <p class="config__note zh" data-occlude>${esc(system.stored)}</p>
  <section class="credits" data-reveal aria-labelledby="h-credits">
    <h3 class="credits__h" id="h-credits">${code(5)}<span class="tag">${esc(system.about.label)}</span><small class="zh">${esc(system.about.zh)}</small></h3>
    <div class="credits__cols">
      <p class="credits__tech zh" data-occlude>${esc(system.tech)}</p>
      <p class="credits__line" data-occlude>${creditsLine(credits)}</p>
    </div>
    <p class="credits__links">${ext("https://github.com/siruimei07/siruimei07.github.io", `${esc(system.source)} <small>${esc(system.sourceZh)}</small>`, `class="btn btn--ink"`)}${ext("https://github.com/LBEILC/RhineLabUI", `RHINELABUI <small>MIT</small>`, `class="btn"`)}</p>
  </section>
</div>`;
  return sectionScreen(s, { ghost: "CONFIG", body, buildMs: 2400, revealMs: 0 });
}
