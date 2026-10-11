// SYSTEM: a Rhine Lab config sheet — coded rows (SYS-01…) of segmented tags
// for theme, motion and the 3D scene, the opening replay, where settings live,
// and the credits.

import { brand, credits, sectionById, system } from "../content.ts";
import { esc, ext, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";

type Opt = [string, string, string];

function seg(name: string, opts: Opt[]) {
  const buttons = opts
    .map(([v, en, zh]) => `<button type="button" role="radio" aria-checked="false" class="seg" data-${name}="${v}"><span>${esc(en)}</span><small class="zh">${esc(zh)}</small></button>`)
    .join("");
  return `<div class="config__opts" role="radiogroup" aria-labelledby="cfg-${name}">${buttons}</div>`;
}

const code = (n: number) => `<span class="config__code" aria-hidden="true">SYS-${pad(n, 2)}</span>`;

export function renderSystem(): string {
  const s = sectionById.system;
  const row = (n: number, k: { label: string; zh: string; options: Opt[] }, name: string, now: boolean) =>
    `<li class="config__row">${code(n)}<p class="config__label" id="cfg-${name}"><span>${esc(k.label)}</span><small class="zh">${esc(k.zh)}</small></p>${
      now ? `<p class="config__now" data-cfg-now="${name}"></p>` : `<p class="config__now" aria-hidden="true"></p>`
    }${seg(name, k.options)}</li>`;
  const body = `<div class="config">
  <p class="config__head" aria-hidden="true"><span>${esc(brand.title)} / ${esc(s.section)}</span><span>${esc(s.code)}</span></p>
  <ul class="config__rows" data-reveal>
    ${row(1, system.theme, "theme", true)}
    ${row(2, system.motion, "motion", true)}
    ${row(3, system.three, "three", false)}
    <li class="config__row config__row--action">${code(4)}<p class="config__label" id="cfg-replay"><span>${esc(system.replay.label)}</span><small class="zh">${esc(system.replay.zh)}</small></p><p class="config__now" aria-hidden="true"></p><p class="config__opts"><button type="button" class="btn" data-replay aria-describedby="cfg-replay">REPLAY ›</button></p></li>
  </ul>
  <p class="config__note zh">${esc(system.stored)}</p>
  <section class="credits" data-reveal aria-labelledby="h-credits">
    <h3 class="credits__h" id="h-credits">${code(5)}<span class="tag">${esc(system.about.label)}</span><small class="zh">${esc(system.about.zh)}</small></h3>
    <div class="credits__cols">
      <p class="credits__tech zh">${esc(system.tech)}</p>
      <div class="credits__side">
        <p class="credits__line">${esc(credits)}</p>
        <p class="credits__links">${ext("https://github.com/siruimei07/siruimei07.github.io", `${esc(system.source)} <small>${esc(system.sourceZh)}</small>`, `class="btn btn--ink"`)}${ext("https://github.com/LBEILC/RhineLabUI", `RHINELABUI <small>MIT</small>`, `class="btn"`)}</p>
      </div>
    </div>
  </section>
</div>`;
  return sectionScreen(s, { ghost: "CONFIG", body });
}
