// The overview: a ∞ of translucent archive plates (3D, src/three) with the
// sections called out around it, like the PV's "structure of Rhine Lab"
// (3:40–3:58). The 2D figure-eight underneath stands in when 3D is off.

import { home, identity, profile, sectionById } from "../content.ts";
import { esc, ext, mark } from "../markup.ts";

// Static fallback anchor points, in 1920×1080 frame pixels, where the leader
// lines meet the curve when no live 3D projection is available.
export const FALLBACK_ANCHORS: Record<string, [number, number]> = {
  left: [525, 636],
  cross: [955, 503],
  "right-top": [1201, 369],
  "right-bottom": [1318, 633],
  centre: [1391, 552],
};

/** A figure-eight drawn as a ribbon of thin plates, for no-WebGL and 3D-off. */
function flatInfinity(): string {
  const n = 150;
  const cx = 960;
  const cy = 550;
  const a = 430;
  // lemniscate of Bernoulli, flattened a little like the PV's figure
  const at = (t: number): [number, number] => {
    const s = Math.sin(t);
    const d = 1 + s * s;
    return [cx + (a * Math.cos(t)) / d, cy + (0.92 * a * s * Math.cos(t)) / d];
  };
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const [x, y] = at(t);
    const [x1, y1] = at(t + 1e-3);
    const ang = (Math.atan2(y1 - y, x1 - x) * 180) / Math.PI;
    parts.push(`<rect x="-3" y="-34" width="6" height="68" rx="1.5" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(ang + 90 + 18).toFixed(1)})"/>`);
  }
  return `<svg class="home__flat" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g>${parts.join("")}</g></svg>`;
}

export function renderHome(yearContributions: number | null): string {
  const callouts = home.callouts
    .map((c) => {
      const s = sectionById[c.to];
      const desc = c.to === "activity" && yearContributions !== null ? `${yearContributions} CONTRIBUTIONS IN THE LAST YEAR` : c.desc;
      return `<li class="home__co home__co--${c.anchor}" data-callout="${c.anchor}"><a class="callout" href="#${s.id}" data-go="${s.id}"><i class="callout__br" aria-hidden="true"></i><span class="tag">${esc(c.tag)}</span><b class="callout__title">${esc(c.title)}</b><i class="callout__rule" data-rule aria-hidden="true"></i><small class="callout__desc">${esc(desc)}</small><small class="callout__zh">${esc(c.zh)}</small></a></li>`;
    })
    .join("");
  return `<section id="top" class="screen home" data-screen="home" aria-label="总览">
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
