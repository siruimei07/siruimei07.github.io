// RESEARCH: the PV's section walk-through (STRU → NRG, 1:44–2:10). Three
// research sections behind tag-like tabs; each opens a glass panel with the
// STUDY / … title box, motto, notes and topics on the left, and the specimen
// drawing on the right with a crosshair through its orange core.

import { sectionById, skills } from "../content.ts";
import { esc, logotype, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";
import { VIZ, VIZ_H, VIZ_W } from "./viz.ts";

export function renderSkills(): string {
  const s = sectionById.skills;
  const tabs = skills
    .map(
      (k, i) =>
        `<button type="button" role="tab" class="lab__tab" id="tab-${k.id}" aria-controls="skill-${k.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-skill="${k.id}"><b>${esc(k.tile.lines.join(""))}</b><span>${esc(k.en)}</span><small class="zh">${esc(k.zh)}</small></button>`,
    )
    .join("");
  const panels = skills
    .map((k, i) => {
      const v = VIZ[k.id]();
      const at = `--cx:${((v.core[0] / VIZ_W) * 100).toFixed(2)}%;--cy:${((v.core[1] / VIZ_H) * 100).toFixed(2)}%`;
      const topics = k.topics
        .map((t, j) => `<li><span class="lab__tno">T-${pad(j + 1, 2)}</span><b>${esc(t.en)}</b><small class="zh">${esc(t.zh)}</small><i aria-hidden="true"></i></li>`)
        .join("");
      return `<article class="lab__panel${i === 0 ? " is-on" : ""}" id="skill-${k.id}" role="tabpanel" aria-labelledby="tab-${k.id}" tabindex="0" data-skill-panel="${k.id}">
    <div class="lab__text">
      <div class="lab__title">
        <p class="lab__study">${esc(k.study)}</p>
        <h3 class="lab__name">${esc(k.en)}</h3>
      </div>
      <p class="lab__motto"><span class="zh">${esc(k.zh)}</span><i aria-hidden="true"></i><span class="zh">${esc(k.motto)}</span></p>
      <p class="lab__body zh">${esc(k.body)}</p>
      <p class="lab__th"><span class="tag tag--xs">RESEARCH TOPICS</span><span class="lab__count">${pad(k.topics.length, 2)}</span></p>
      <ol class="lab__topics">${topics}</ol>
    </div>
    <figure class="lab__viz">
      <div class="lab__plot" style="${at}">
        <span class="lab__hatch" aria-hidden="true"></span>
        <span class="lab__chip" aria-hidden="true"></span>
        ${v.svg}
        <i class="lab__xh lab__xh--v" aria-hidden="true"></i>
        <i class="lab__xh lab__xh--h" aria-hidden="true"></i>
      </div>
      <figcaption class="lab__cap" aria-hidden="true"><span class="tag tag--xs">FIG. ${pad(i + 1, 2)}</span><span class="tag tag--xs tag--lime">VISUALIZED</span><span class="zh">${esc(v.label)}</span></figcaption>
    </figure>
  </article>`;
    })
    .join("");
  // every research tile is in the box; the active one shows
  const tileHtml = skills.map((k, i) => `<span class="tile__alt${i === 0 ? " is-on" : ""}" data-tile-alt="${k.id}">${logotype(k.tile)}</span>`).join("");
  const body = `<div class="lab" data-skills>
  <div class="lab__tabs" role="tablist" aria-label="研究科">${tabs}</div>
  <div class="lab__stack">
  ${panels}
  </div>
</div>`;
  return sectionScreen(s, { ghost: "RESEARCH", body, tileHtml });
}
