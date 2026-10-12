// RESEARCH: the PV's section walk-through (STRU → NRG, 1:44–2:10). Three
// research sections behind tag-like tabs; each opens a glass panel with the
// STUDY / … title box, motto, notes and topics on the left, and the specimen
// drawing on the right with a crosshair through its orange core. The specimen
// prints in on entry and reads out what is under the pointer (MOTION-SPEC §8.3).

import { sectionById, skills } from "../content.ts";
import { esc, logotype, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";
import { VIZ, VIZ_H, VIZ_W } from "./viz.ts";

/** The specimen plot is at most 564u wide (1920×1080), so 1 viewBox unit ≈ this many u. */
const VB_U = 564 / VIZ_W;

export function renderSkills(): string {
  const s = sectionById.skills;
  const tabs = skills
    .map(
      (k, i) =>
        `<button type="button" role="tab" class="lab__tab" id="tab-${k.id}" aria-controls="skill-${k.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-skill="${k.id}" style="--n:${i}"><b>${esc(k.tile.lines.join(""))}</b><span>${esc(k.en)}</span><small class="zh">${esc(k.zh)}</small></button>`,
    )
    .join("");
  const panels = skills
    .map((k, i) => {
      const v = VIZ[k.id]();
      // the dashed outer ring is an HTML layer so it can turn on the compositor: 8u dashes, 6u gaps
      const ru = v.ring * VB_U;
      const deg = (len: number) => `${((len / ru) * (180 / Math.PI)).toFixed(2)}deg`;
      const at = `--cx:${((v.core[0] / VIZ_W) * 100).toFixed(2)}%;--cy:${((v.core[1] / VIZ_H) * 100).toFixed(2)}%;--cr:${((v.ring / VIZ_W) * 100).toFixed(2)}%;--dash:${deg(8)};--gap:${deg(6)}`;
      const topics = k.topics
        .map((t, j) => `<li style="--n:${j}"><span class="lab__tno">T-${pad(j + 1, 2)}</span><b>${esc(t.en)}</b><small class="zh">${esc(t.zh)}</small><i aria-hidden="true"></i></li>`)
        .join("");
      return `<article class="lab__panel${i === 0 ? " is-on" : ""}" id="skill-${k.id}" role="tabpanel" aria-labelledby="tab-${k.id}" tabindex="0" data-skill-panel="${k.id}">
    <div class="lab__text">
      <div class="lab__title">
        <p class="lab__study"><span>${esc(k.study)}</span></p>
        <h3 class="lab__name">${esc(k.en)}</h3>
      </div>
      <p class="lab__motto"><span class="zh">${esc(k.zh)}</span><i aria-hidden="true"></i><span class="zh">${esc(k.motto)}</span></p>
      <p class="lab__body zh" data-occlude>${esc(k.body)}</p>
      <p class="lab__th"><span class="tag tag--xs">RESEARCH TOPICS</span><span class="lab__count"><span>${pad(k.topics.length, 2)}</span></span></p>
      <ol class="lab__topics">${topics}</ol>
    </div>
    <figure class="lab__viz">
      <div class="lab__plot" style="${at}">
        <div class="lab__print">
          <span class="lab__hatch" aria-hidden="true"></span>
          <span class="lab__chip" aria-hidden="true"></span>
          <span class="lab__halo" aria-hidden="true"><i></i><i></i><i></i></span>
          ${v.svg}
          <span class="lab__ring" aria-hidden="true"></span>
        </div>
        <i class="lab__xh lab__xh--v" aria-hidden="true"></i>
        <i class="lab__xh lab__xh--h" aria-hidden="true"></i>
        <i class="lab__scan" aria-hidden="true"></i>
        ${v.probe}
        <p class="lab__readout" aria-hidden="true">${v.readout}</p>
        <i class="lab__hit" aria-hidden="true"></i>
      </div>
      <figcaption class="lab__cap" aria-hidden="true"><span class="tag tag--xs">FIG. ${pad(i + 1, 2)}</span><span class="tag tag--xs tag--lime" data-blink>VISUALIZED</span><span class="zh lab__tick"><span>${esc(v.label)}</span></span></figcaption>
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
  return sectionScreen(s, { ghost: "RESEARCH", body, tileHtml, buildMs: 2600, revealMs: 1600 });
}
