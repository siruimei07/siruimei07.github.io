// PERSONNEL FILE: the PV's director card (1:52 AHRENS PARVIS). The portrait
// holds the left of the glass; to its right the rank tag, name bar, section
// box and file code; below, the intro beside INFO + lime rings and the white
// PROFILE card; along the foot, the GitHub meters as one VISUALIZED strip.

import { brand, identity, profile, sectionById } from "../content.ts";
import { summarize, type GitHubSnapshot } from "../github.ts";
import { esc, ext, lockup, logotype, tag } from "../markup.ts";
import { sectionScreen } from "./section.ts";

export function renderProfile(data: GitHubSnapshot | null): string {
  const s = sectionById.profile;
  const st = summarize(data);
  // the name bar already carries the name, so the card keeps to the facts (like the PV's RACE / HEIGHT / POB)
  const fields = profile.fields
    .filter((f) => f.k !== "NAME")
    .map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`)
    .join("");
  // the bar is a visual scale only; the number beside it is the real value
  const meters = st
    ? (
        [
          ["COMMITS", "近一年提交", st.yearContributions, 600, true],
          ["ACTIVE DAYS", "活跃天数", st.activeDays, 200, false],
          ["REPOS", "公开仓库", st.repos, 20, false],
          ["STARS", "星标", st.stars, 50, false],
          ["FOLLOWERS", "关注者", st.followers, 50, false],
        ] as [string, string, number, number, boolean][]
      )
        .map(
          ([k, zh, v, max, hi]) =>
            `<li${hi ? ` class="is-hi"` : ""} style="--v:${Math.min(1, v / max).toFixed(3)}"><span>${k}<small>${zh}</small></span><b data-count="${v}">${v}</b><i aria-hidden="true"></i></li>`,
        )
        .join("")
    : "";
  const body = `<div class="dossier">
  <figure class="dossier__portrait" data-reveal>
    <span class="dossier__bg" aria-hidden="true"></span>
    <img src="/assets/avatar.webp" width="1024" height="1024" alt="${esc(identity.name)} 的头像" decoding="async" />
    <i class="dossier__scan" aria-hidden="true"></i>
  </figure>
  <div class="dossier__id" data-reveal>
    ${tag(profile.rank, "tag--tilt dossier__rank")}
    <p class="namebar dossier__name">${esc(identity.name.toUpperCase())}</p>
    <p class="dossier__en">${esc(profile.introEn)}</p>
    <div class="dossier__sec">
      <span class="tile tile--light dossier__mini" aria-hidden="true">${logotype(s.tile)}</span>
      <p class="dossier__loaded">${esc(profile.loaded)}&nbsp;<i aria-hidden="true">■</i></p>
    </div>
    <div class="dossier__coderow">
      <p class="dossier__code"><i aria-hidden="true">■</i> ${esc(s.code)}</p>
      ${lockup(brand.mark, "lockup lockup--orange dossier__lockup")}
    </div>
  </div>
  <div class="dossier__info" data-reveal>
    <p class="dossier__intro zh">${esc(profile.intro)}</p>
    <p class="dossier__links">${ext(identity.githubUrl, `${esc(profile.links.github)} <small>@${esc(identity.github)}</small>`, `class="btn btn--ink"`)}<a class="btn" href="mailto:${esc(identity.email)}">${esc(profile.links.mail)} <small>${esc(identity.email)}</small></a></p>
  </div>
  <div class="dossier__deck">
    <div class="dossier__deco" aria-hidden="true">
      <span class="ghost dossier__ghost">INFO</span>
      <span class="rings3 dossier__rings"><i></i><i></i><i></i></span>
    </div>
    <div class="card dossier__card" data-reveal>
      <p class="card__head">${esc(profile.card)}</p>
      <dl class="card__fields">${fields}</dl>
      <p class="card__foot">${esc(brand.title)}.</p>
    </div>
  </div>
  ${
    meters
      ? `<div class="dossier__params" data-reveal><p class="dossier__params-h"><span class="tag">${esc(profile.params)}</span><span class="tag tag--lime">VISUALIZED</span></p><ul class="bars dossier__bars">${meters}</ul></div>`
      : ""
  }
</div>`;
  return sectionScreen(s, { ghost: identity.name.toUpperCase(), body });
}
