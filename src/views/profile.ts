// PERSONNEL FILE: the PV's director card (1:52 AHRENS PARVIS). The portrait
// holds the left of the glass; to its right the rank tag, name bar, section
// box and file code; below, the intro beside INFO + lime rings and the white
// PROFILE card; along the foot, the GitHub meters as one VISUALIZED strip.
// It builds like the PV's dossiers (MOTION-SPEC §8.2); the hooks for that
// (wrappers, the ■ cursors, the portrait's inspection line) are inert without JS.

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
          ([k, zh, v, max, hi], n) =>
            `<li class="lift${hi ? " is-hi" : ""}" style="--v:${Math.min(1, v / max).toFixed(3)};--n:${n}"><span><em><i class="dossier__sq" aria-hidden="true"></i>${k}</em><small>${zh}</small></span><b>${v}</b><i aria-hidden="true"></i></li>`,
        )
        .join("")
    : "";
  const body = `<div class="dossier">
  <figure class="dossier__portrait">
    <span class="dossier__bg" aria-hidden="true"></span>
    <img src="/assets/avatar-512.webp" srcset="/assets/avatar-256.webp 256w, /assets/avatar-512.webp 512w, /assets/avatar.webp 1024w" sizes="(max-width: 409px) calc(100vw - 70px), 340px" width="1024" height="1024" alt="${esc(identity.name)} 的头像" decoding="async" fetchpriority="low" />
    <i class="dossier__scan" aria-hidden="true"><i class="dossier__scan-l"><b class="dossier__scan-y">Y 0.00</b></i></i>
  </figure>
  <div class="dossier__id">
    ${tag(profile.rank, "tag--tilt dossier__rank")}
    <p class="namebar dossier__name">${esc(identity.name.toUpperCase())}</p>
    <p class="dossier__en" lang="en" data-occlude>${esc(profile.introEn)}</p>
    <div class="dossier__sec">
      <span class="dossier__plate" aria-hidden="true"><i class="dossier__plate-sh"></i><span class="tile tile--light dossier__mini">${logotype(s.tile)}</span></span>
      <p class="dossier__loaded"><span class="dossier__loaded-t">${esc(profile.loaded)}</span><i class="breathe" aria-hidden="true">■</i></p>
    </div>
    <div class="dossier__coderow">
      <p class="dossier__code"><i class="breathe" aria-hidden="true">■</i> <span class="dossier__cv">${esc(s.code)}</span></p>
      ${lockup(brand.mark, "lockup lockup--orange dossier__lockup")}
    </div>
  </div>
  <div class="dossier__info">
    <p class="dossier__intro zh" data-occlude>${esc(profile.intro)}</p>
    <p class="dossier__links">${ext(identity.githubUrl, `${esc(profile.links.github)} <small>@${esc(identity.github)}</small>`, `class="btn btn--ink"`)}<a class="btn" href="mailto:${esc(identity.email)}">${esc(profile.links.mail)} <small>${esc(identity.email)}</small></a></p>
  </div>
  <div class="dossier__deck">
    <div class="dossier__deco" aria-hidden="true">
      <span class="ghost dossier__ghost">INFO</span>
      <span class="rings3 dossier__rings"><i></i><i></i><i></i></span>
    </div>
    <div class="dossier__lift lift">
      <div class="card dossier__card">
        <p class="card__head">${esc(profile.card)}</p>
        <dl class="card__fields">${fields}</dl>
        <p class="card__foot">${esc(brand.title)}.</p>
      </div>
    </div>
  </div>
  ${
    meters
      ? `<div class="dossier__params"><p class="dossier__params-h"><span class="tag"><span class="dossier__mq">${esc(profile.params)}</span></span><span class="tag tag--lime" data-blink><span class="dossier__mq">VISUALIZED</span></span></p><ul class="bars dossier__bars">${meters}</ul></div>`
      : ""
  }
</div>`;
  return sectionScreen(s, { ghost: identity.name.toUpperCase(), body, buildMs: 7600, revealMs: 0 });
}
