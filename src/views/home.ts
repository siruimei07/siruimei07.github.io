// The overview: a ∞ of translucent archive plates (3D, src/three) with the
// sections called out around it, like the PV's "structure of Rhine Lab"
// (3:40–3:58). The 2D figure-eight underneath stands in when 3D is off.

import { home, identity, profile, sectionById, sections } from "../content.ts";
import { esc, ext, mark } from "../markup.ts";
import { lemniscate, type Vec2 } from "../three/curves.ts";

/** Where each leader line meets the ∞, as parameters t of the lemniscate in
 *  three/curves.ts. The 3D scene projects these same points, so the dots sit
 *  on the plates with 3D on and on the flat figure without it. */
export const ANCHOR_T: Record<string, number> = {
  left: 3.25, // lower left lobe, clear of PROJECT ARCHIVE's rule
  cross: 1.69, // just above the crossing
  "right-top": 5.616,
  "right-bottom": 0.31,
  centre: 0, // the right tip, behind the ◎
};

/** The anchor points in 1920×1080 frame pixels. */
export function anchorPoints(): Record<string, Vec2> {
  const out: Record<string, Vec2> = {};
  for (const [id, t] of Object.entries(ANCHOR_T)) out[id] = lemniscate(t, { x: 0, y: 0 });
  return out;
}

/** A figure-eight drawn as a ribbon of thin plates, for no-WebGL and 3D-off. */
function flatInfinity(): string {
  const n = 150;
  const p: Vec2 = { x: 0, y: 0 };
  const q: Vec2 = { x: 0, y: 0 };
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const { x, y } = lemniscate(t, p);
    lemniscate(t + 1e-3, q);
    const ang = (Math.atan2(q.y - y, q.x - x) * 180) / Math.PI;
    parts.push(`<rect x="-3" y="-34" width="6" height="68" rx="1.5" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + 90 + 18).toFixed(1)})"/>`);
  }
  return `<svg class="home__flat" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g>${parts.join("")}</g></svg>`;
}

export function renderHome(yearContributions: number | null): string {
  // in section order, for the phone list, the plain page and screen readers;
  // on desktop each callout is placed by its anchor class
  const order = (id: string) => sections.findIndex((s) => s.id === id);
  const callouts = [...home.callouts]
    .sort((a, b) => order(a.to) - order(b.to))
    .map((c) => {
      const s = sectionById[c.to];
      const desc = c.to === "activity" && yearContributions !== null ? `${yearContributions} CONTRIBUTIONS IN THE LAST YEAR` : c.desc;
      return `<li class="home__co home__co--${c.anchor}" data-callout="${c.anchor}"><a class="callout" href="#${s.id}" data-go="${s.id}"><i class="callout__br" aria-hidden="true"></i><span class="tag">${esc(c.tag)}</span><b class="callout__title">${esc(c.title)}</b><i class="callout__rule" data-rule aria-hidden="true"></i><small class="callout__desc">${esc(desc)}</small><small class="callout__zh">${esc(c.zh)}</small></a></li>`;
    })
    .join("");
  return `<section id="top" class="screen home" data-screen="home" aria-label="总览">
  <h2 class="sr-only">总览 · OVERVIEW</h2>
  <svg class="home__leaders" data-leaders aria-hidden="true"></svg>
  <div class="home__frame" data-home-frame>
    ${flatInfinity()}
    <ul class="home__callouts">${callouts}</ul>
    <a class="home__centre" href="#profile" data-go="profile" data-callout="centre"><span class="home__pill"><b>${esc(home.centre)}</b><small>${esc(home.centreSub)}</small></span><i class="home__ring" aria-hidden="true"></i></a>
    <p class="home__hint" aria-hidden="true"><span>${esc(home.hint)}</span><small class="zh">${esc(home.hintZh)}</small></p>
  </div>
  <div class="home__id">
    <span class="home__badge" aria-hidden="true">${mark("home__badge-mark")}<small>SIRUI · MEI</small></span>
    <p class="home__role"><span>${esc(profile.rank)}</span><span>${esc(identity.affiliation.en.toUpperCase())}</span></p>
    <p class="home__line"><b>${esc(identity.focusEn.join(" · "))}</b><span class="zh">${esc(identity.oneLiner)}</span></p>
    <p class="home__links">${ext(identity.githubUrl, `GITHUB <small>@${esc(identity.github)}</small>`, `class="btn btn--ink"`)}<a class="btn" href="mailto:${esc(identity.email)}">MAIL <small>${esc(identity.email)}</small></a></p>
  </div>
</section>`;
}
