// PROJECT ARCHIVE: the PV's file selection (0:28–0:40). An index of files on
// the left; on the right the selected file — FILE NUMBER box with its corner
// squares, the drawn archive cassette (t0040), CONFIDENTIALITY, notes and the
// way out to GitHub. The index is a vertical tab list, built for up to ~8 files.

import { brand, identity, sectionById, worksText } from "../content.ts";
import { mergeWorks, type GitHubSnapshot, type WorkView } from "../github.ts";
import { esc, ext, MARK_LOOPS, MARK_SIGNS, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";

/** A point on a circle; angles in degrees, clockwise from 3 o'clock (SVG y points down). */
const at = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
};
const arc = (cx: number, cy: number, r: number, from: number, to: number) =>
  `M${at(cx, cy, r, from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(cx, cy, r, to)}`;
/** Short radial strokes across a ring: the moulding seams of the reel. */
const seams = (cx: number, cy: number, r0: number, r1: number, degs: number[]) => degs.map((d) => `M${at(cx, cy, r0, d)}L${at(cx, cy, r1, d)}`).join("");

/** The PV's archive cassette (t0040), drawn flat: translucent ivory body, groove
 *  frame, label sticker, two reels with amber inlay, embossed spine. */
function cassette(no: number): string {
  const g = `cas-g-${no}`;
  const [bx, by] = [288, 230];
  const [sx, sy] = [468, 148];
  const hatch = Array.from({ length: 9 }, (_, i) => `M${430 + i * 9} 364l9-13`).join("");
  return `<div class="cassette" aria-hidden="true">
  <span class="cassette__stack"><i></i><i></i><i></i></span>
  <svg class="cassette__art" viewBox="0 0 600 400">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="cassette__s1"/><stop offset="0.5" class="cassette__s2"/><stop offset="1" class="cassette__s3"/></linearGradient></defs>
    <path class="cassette__body" fill="url(#${g})" d="M16 4H584L596 16V384L584 396H16L4 384V16Z"/>
    <path class="cassette__bevel" d="M19 12H581L588 19V381L581 388H19L12 381V19Z"/>
    <rect class="cassette__tan" x="30" y="12" width="40" height="27"/>
    <path class="cassette__groove" d="M44 116V54L64 34H300L310 43H356L364 34H402L412 43H458L466 34H548L566 52V334L544 356H330L318 366H62L44 348V176"/>
    <path class="cassette__groove cassette__groove--in" d="M53 116V58L68 43H296L306 52H360L368 43H398L408 52H462L470 43H544L557 56V330L540 347H326L314 357H66L53 344V176"/>
    <path class="cassette__guide" d="M176 104H520V332H176ZM372 70H526V246H372"/>
    <g class="cassette__fly"><path d="M134 158l20 7-20 7 5-7z"/><path d="M118 244l20 7-20 7 5-7z"/><path d="M146 262l20 7-20 7 5-7z"/></g>
    <path class="cassette__band" d="M${at(bx, by, 120, 262)}L${at(sx, sy, 70, 262)}M${at(bx, by, 120, 20)}C430 292 470 252 ${at(sx, sy, 70, 92)}"/>
    <g class="cassette__reel">
      <circle class="cassette__ring" cx="${bx}" cy="${by}" r="104"/>
      <circle class="cassette__line" cx="${bx}" cy="${by}" r="120"/>
      <circle class="cassette__line" cx="${bx}" cy="${by}" r="88"/>
      <circle class="cassette__hole" cx="${bx}" cy="${by}" r="70"/>
      <circle class="cassette__line" cx="${bx}" cy="${by}" r="62"/>
      <path class="cassette__seam" d="${seams(bx, by, 89, 119, [205, 300, 22, 118])}"/>
      <path class="cassette__amber" d="${arc(bx, by, 79, 150, 242)}"/>
      <path class="cassette__amber cassette__amber--out" d="${arc(bx, by, 121, 8, 116)}"/>
    </g>
    <g class="cassette__reel cassette__reel--s">
      <circle class="cassette__ring cassette__ring--s" cx="${sx}" cy="${sy}" r="60"/>
      <circle class="cassette__line" cx="${sx}" cy="${sy}" r="72"/>
      <circle class="cassette__inlay" cx="${sx}" cy="${sy}" r="40"/>
      <circle class="cassette__hole" cx="${sx}" cy="${sy}" r="29"/>
      <circle class="cassette__line" cx="${sx}" cy="${sy}" r="23"/>
    </g>
    <g class="cassette__label">
      <rect class="cassette__sticker" x="80" y="50" width="206" height="86"/>
      <text class="cassette__lt" x="90" y="70">${esc(brand.title)}, LLC.</text>
      <path class="cassette__bar" d="M226 61h46v8h-46z"/><path class="cassette__barlo" d="M258 61h3v8h-3zM264 61h3v8h-3z"/>
      <text class="cassette__lt cassette__lt--xs" x="90" y="84">INTERNAL DATABASE</text>
      <text class="cassette__lt" x="276" y="85" text-anchor="end">INFO</text>
      <path class="cassette__rule" d="M86 91H280M86 128H280M234 91V128"/>
      <text class="cassette__no" x="90" y="120">NO.${pad(no)}</text>
      <g class="cassette__mk" transform="translate(241 100) scale(0.105)"><path d="${MARK_LOOPS}" stroke-width="26"/><path d="${MARK_SIGNS}" stroke-width="15"/></g>
    </g>
    <text class="cassette__spine" transform="translate(27 104) rotate(90)">${esc(brand.title)}, LLC.</text>
    <g class="cassette__screw"><circle cx="572" cy="28" r="11"/><circle cx="572" cy="28" r="5"/><circle cx="28" cy="372" r="11"/><circle cx="28" cy="372" r="5"/></g>
    <g class="cassette__socket"><circle cx="534" cy="330" r="17"/><circle cx="534" cy="330" r="8"/></g>
    <path class="cassette__hatch" d="${hatch}"/>
    <path class="cassette__tick" d="M150 350v11M162 350v11"/>
  </svg>
  <span class="cassette__sheen"></span>
</div>`;
}

function state(w: WorkView) {
  return w.state === "live" ? worksText.live : worksText.archive;
}

export function renderWorks(data: GitHubSnapshot | null): string {
  const s = sectionById.works;
  const list = mergeWorks(data);
  const codeOf = (w: WorkView, i: number) => w.code || `X-${pad(i + 1)}`;
  const rows = list
    .map(
      (w, i) =>
        `<li role="presentation"><button type="button" role="tab" class="file-row${i === 0 ? " is-on" : ""}" id="filetab-${i}" aria-controls="file-${i}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-file="${i}"><b class="file-row__code">${esc(codeOf(w, i))}</b><em class="file-row__state file-row__state--${w.state}">${esc(state(w))}</em><span class="file-row__title">${esc(w.title)}</span><small class="zh">${esc(w.zh)}</small></button></li>`,
    )
    .join("");
  const files = list
    .map((w, i) => {
      const code = codeOf(w, i);
      const chips = w.stack.length ? `<ul class="chips">${w.stack.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "—";
      const side = [
        `<div class="file__st file__st--${w.state}"><dt>STATUS</dt><dd>${esc(state(w))}</dd></div>`,
        w.stars !== null ? `<div><dt>${esc(worksText.stars)}</dt><dd><b>★</b> ${w.stars}</dd></div>` : "",
        w.updated ? `<div><dt>${esc(worksText.updated)}</dt><dd>${esc(w.updated.slice(0, 10))}</dd></div>` : "",
        `<div class="file__stack"><dt>${esc(worksText.stack)}</dt><dd>${chips}</dd></div>`,
      ].join("");
      return `<article class="file${i === 0 ? " is-on" : ""}" id="file-${i}" role="tabpanel" aria-labelledby="filetab-${i}" tabindex="0" data-file-card="${i}">
    <p class="file__no cornered"><span>${esc(worksText.file)}: ${esc(code)}</span></p>
    <h3 class="file__title"><span class="file__name">${esc(w.title)}</span><small class="zh">${esc(w.zh)}</small></h3>
    <p class="file__conf">${esc(worksText.confidentiality)}: <b data-conf>${esc(worksText.public)}</b></p>
    ${cassette(i + 1)}
    <dl class="file__side">${side}</dl>
    <p class="file__desc zh">${esc(w.description)}</p>
    <p class="file__go">${ext(w.href, `${esc(worksText.open)} <small>${esc(worksText.openZh)}</small>`, `class="btn btn--ink"`)}</p>
  </article>`;
    })
    .join("");
  const body = `<div class="files" data-files>
  <div class="files__index">
    <p class="files__h"><span class="tag">${esc(worksText.index)}</span><span class="files__count">${pad(list.length, 2)} FILES</span></p>
    <ol class="files__list" role="tablist" aria-orientation="vertical" aria-label="项目档案">${rows}</ol>
    <p class="keys files__keys" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd>SELECT FILE</span></p>
    <p class="files__more">${ext(identity.githubUrl, `<span>${esc(worksText.more)} <span aria-hidden="true">›</span></span> <small>@${esc(identity.github)}</small>`)}</p>
  </div>
  <div class="files__detail">${files}</div>
</div>`;
  return sectionScreen(s, { ghost: "ARCHIVE", body });
}
