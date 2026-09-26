// Builds the page markup from content.ts + the GitHub snapshot. Runs at build
// time (vite.config.ts injects it into index.html), so the site is readable
// before JavaScript loads and the 3D layer only enhances it.

import { contact, credits, hero, identity, profile, sections, skills } from "./content.ts";
import { heatmap, mergeWorks, summarize, type GitHubSnapshot } from "./github.ts";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ext = (href: string, inner: string, cls = "") =>
  `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;

const FORMULAS: Record<string, string> = {
  stats: "X ~ N(μ, σ²)",
  econ: "Q<sub>d</sub>(P*) = Q<sub>s</sub>(P*)",
  quant: "dS = μS dt + σS dW",
};

function sectionHead(i: number, id: string) {
  const s = sections[i];
  return `<header class="sec-head" data-reveal>
    <p class="sec-head__index"><span class="numeral">${s.index}</span><i></i>${esc(s.en)}</p>
    <h2 class="sec-head__title" id="${id}">${esc(s.zh)}</h2>
    <p class="sec-head__ja" lang="ja">${esc(s.ja)}</p>
  </header>`;
}

function loader() {
  return `<div class="loader" id="loader">
  <div class="loader__core">
    <p class="loader__status"><span id="loader-text">即将启程…</span><b id="loader-pct">0%</b></p>
    <div class="loader__line" aria-hidden="true"><i id="loader-bar"></i></div>
    <div class="loader__actions" id="loader-actions">
      <button type="button" class="btn btn--primary" data-dive="sound">启程 · 开启声音</button>
      <button type="button" class="btn btn--ghost" data-dive="mute">静音启程</button>
    </div>
  </div>
  <p class="loader__foot"><span lang="ja">月読</span> · ${esc(identity.handle.family + identity.handle.given)} · 建议佩戴耳机</p>
</div>`;
}

function hud() {
  const rail = sections
    .map(
      (s, i) =>
        `<a href="#${s.id}" data-rail="${i}"><span class="rail__label">${esc(s.zh)}</span><span class="rail__num">${s.index}</span><i class="rail__dot"></i></a>`,
    )
    .join("");
  return `<header class="hud-top">
  <a class="brand" href="#login" aria-label="回到开头">
    <svg class="brand__mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5" /><circle class="brand__fill" cx="16" cy="16" r="9" /></svg>
    <span class="brand__ja" lang="ja">月読</span><span class="brand__en">TSUKUYOMI</span>
  </a>
  <div class="hud-top__right">
    <p class="hud-top__time"><span id="jihou" lang="ja">—の刻</span><span id="clock">--:--</span></p>
    <button type="button" class="chip" id="quality" title="画质（点击切换）"><b id="fps">--</b> fps · <span id="quality-label">auto</span></button>
    <button type="button" class="chip" id="sound" aria-pressed="false" title="声音"><span class="wave" aria-hidden="true"><i></i><i></i><i></i></span><span id="sound-label">音 · 关</span></button>
  </div>
</header>
<nav class="rail" aria-label="章节导航">${rail}</nav>
<div class="bubble" id="bubble" role="status" aria-live="polite"></div>
<div class="cursor" aria-hidden="true"><div class="cursor__ring"><span class="cursor__label"></span></div><div class="cursor__dot"></div></div>`;
}

function heroSection() {
  const h = identity.handle;
  return `<section class="sec sec--hero" id="login" data-section="0" aria-label="${esc(sections[0].zh)}">
  <div class="hero">
    <p class="hero__kicker" data-reveal><span class="seal" lang="ja">${esc(hero.kicker)}</span><span lang="ja">${esc(hero.kickerJa)}</span></p>
    <h1 class="hero__name" lang="ja" data-reveal>
      <ruby>${esc(h.family)}<rt>${esc(h.familyKana)}</rt></ruby><span class="hero__gap"></span><ruby>${esc(h.given)}<rt>${esc(h.givenKana)}</rt></ruby>
    </h1>
    <p class="hero__roman" data-reveal>${esc(identity.handleRoman)}</p>
    <p class="hero__real" data-reveal>真名 <strong>${esc(identity.realName)}</strong><span></span>${esc(identity.affiliation.en)}</p>
    <p class="hero__tagline" data-reveal>${hero.tagline.map(esc).join("<br />")}</p>
    <p class="hero__tagline-ja" lang="ja" data-reveal>${esc(hero.taglineJa)}</p>
    <ul class="hero__focus" data-reveal aria-label="擅长">${hero.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <div class="hero__cta" data-reveal>
      <a class="btn btn--primary" href="#profile" data-magnetic>穿过鸟居</a>
      <a class="btn btn--ghost" href="#contact" data-magnetic>写一封信</a>
    </div>
  </div>
  <ul class="hints" aria-label="操作提示">${hero.hints.map((x) => `<li><b>${esc(x.key)}</b>${esc(x.text)}</li>`).join("")}</ul>
  <div class="scroll-cue" aria-hidden="true"><i></i></div>
</section>`;
}

function profileSection() {
  const h = identity.handle;
  const rows = profile.fields.map((f) => `<div class="stat-row"><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join("");
  return `<section class="sec sec--profile" id="profile" data-section="1" data-center="1" aria-labelledby="profile-title">
  <div class="panel panel--right" data-reveal>
    ${sectionHead(1, "profile-title")}
    <div class="idcard">
      <div class="idcard__photo"><img src="/assets/avatar-256.webp" alt="酒寄彩葉的头像" width="256" height="256" loading="lazy" /></div>
      <div class="idcard__name">
        <p class="idcard__handle" lang="ja">${esc(h.family)} ${esc(h.given)}</p>
        <p class="idcard__roman">${esc(identity.handleRoman)}</p>
        <p class="idcard__real">${esc(identity.realName)} · ${esc(identity.status.zh)}</p>
      </div>
    </div>
    <p class="prose" data-reveal>${esc(profile.intro)}</p>
    <p class="prose prose--ja" lang="ja" data-reveal>${esc(profile.introJa)}</p>
    <dl class="stats" data-reveal>${rows}</dl>
    <p class="links-row" data-reveal>
      ${ext(identity.githubUrl, `GitHub <span>@${esc(identity.github)} ↗</span>`, "link-chip")}
      <a class="link-chip" href="mailto:${esc(identity.email)}">Mail <span>${esc(identity.email)}</span></a>
    </p>
  </div>
</section>`;
}

function skillsSection() {
  const cards = skills
    .map(
      (s, i) => `<article class="skill" data-skill="${i}" data-reveal data-tilt>
      <p class="skill__index"><span class="numeral">${s.index}</span><span>${esc(s.en)}</span></p>
      <h3 class="skill__title">${esc(s.zh)}<small lang="ja">${esc(s.ja)}</small><span class="skill__seal" lang="ja" aria-hidden="true">${esc(s.lantern)}</span></h3>
      <p class="skill__formula">${FORMULAS[s.id]}</p>
      <p class="skill__motto">「${esc(s.motto)}」</p>
      <p class="skill__body">${esc(s.body)}</p>
      <ul class="skill__topics">${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </article>`,
    )
    .join("");
  return `<section class="sec sec--skills" id="skills" data-section="2" data-center="1" aria-labelledby="skills-title">
  <div class="skills-wrap">
    ${sectionHead(2, "skills-title")}
    <p class="skills-lead" data-reveal>穿过鸟居，三盏提灯浮在水面上——各自照亮一种看世界的方式。</p>
    <div class="skills">${cards}</div>
  </div>
</section>`;
}

function worksSection(data: GitHubSnapshot | null) {
  const works = mergeWorks(data);
  const stats = summarize(data);
  const cards = works
    .map((w) => {
      const meta = [
        w.stars !== null ? `<span>★ ${w.stars}</span>` : "",
        w.language ? `<span>${esc(w.language)}</span>` : "",
        w.updated ? `<span>更新 ${esc(w.updated.slice(0, 10))}</span>` : "",
      ].join("");
      return `<article class="work" data-reveal data-tilt>
      <div class="work__screen"><span class="work__badge work__badge--${w.state}">${w.state === "live" ? "运行中" : "已归档"}</span><span class="work__code">${esc(w.code)}</span></div>
      <div class="work__body">
        <p class="work__zh">${esc(w.zh)}</p>
        <h3 class="work__title">${esc(w.title)}</h3>
        <p class="work__desc">${esc(w.description)}</p>
        <ul class="work__stack">${w.stack.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
        ${meta ? `<p class="work__meta">${meta}</p>` : ""}
      </div>
      ${ext(w.href, `查看仓库 <span aria-hidden="true">↗</span><span class="sr-only">：${esc(w.title)}</span>`, "work__link")}
    </article>`;
    })
    .join("");

  const statTiles = stats
    ? [
        ["公开仓库", "Repositories", stats.repos],
        ["获得星标", "Stars", stats.stars],
        ["关注者", "Followers", stats.followers],
        ["年度贡献", "Contributions", stats.yearContributions],
      ]
        .map(([zh, en, n]) => `<div class="tile"><b data-count="${n}">${n}</b><span>${zh}<small>${en}</small></span></div>`)
        .join("")
    : "";

  const cells = heatmap(data)
    .map(
      (col) =>
        `<span class="heat__col">${col
          .map((c) =>
            c.future
              ? `<i class="heat__cell heat__cell--future"></i>`
              : `<i class="heat__cell" data-level="${c.level}" title="${c.date} · ${c.count} contribution${c.count === 1 ? "" : "s"}"></i>`,
          )
          .join("")}</span>`,
    )
    .join("");

  return `<section class="sec sec--works" id="works" data-section="3" aria-labelledby="works-title">
  <div class="works-wrap">
    ${sectionHead(3, "works-title")}
    <div class="works">${cards}</div>
    <div class="activity" data-reveal>
      <div class="tiles">${statTiles}</div>
      <div class="heat" role="img" aria-label="过去一年的 GitHub 贡献日历${stats ? `：${stats.activeDays} 天有提交` : ""}">
        <p class="heat__label">GitHub · 一年的足迹<span>${stats ? `${stats.activeDays} 日` : ""}</span></p>
        <div class="heat__grid">${cells}</div>
      </div>
    </div>
  </div>
</section>`;
}

function contactSection() {
  const s = sections[4];
  return `<section class="sec sec--contact" id="contact" data-section="4" aria-labelledby="contact-title">
  <div class="contact" data-reveal>
    <p class="sec-head__index"><span class="numeral">${s.index}</span><i></i>${esc(s.en)}</p>
    <h2 class="contact__title" id="contact-title">${esc(contact.title)}</h2>
    <p class="contact__ja" lang="ja">${esc(contact.titleJa)}</p>
    <p class="contact__lead">${esc(contact.lead)}</p>
    <form class="wish" id="wish" data-subject="${esc(contact.subject)}" data-email="${esc(identity.email)}">
      <label class="sr-only" for="wish-text">留言内容</label>
      <textarea id="wish-text" name="message" rows="3" maxlength="400" placeholder="${esc(contact.placeholder)}"></textarea>
      <div class="wish__actions">
        <button type="submit" class="btn btn--primary" data-magnetic>放飞灯笼</button>
        <a class="btn btn--ghost" id="wish-mail" href="mailto:${esc(identity.email)}?subject=${encodeURIComponent(contact.subject)}" data-magnetic>用邮件寄出</a>
      </div>
      <p class="wish__status" id="wish-status" role="status" aria-live="polite"></p>
    </form>
    <div class="contact__links">
      <button type="button" class="contact-card" id="copy-email" data-email="${esc(identity.email)}"><small>邮箱 · 点击复制</small><b>${esc(identity.email)}</b></button>
      ${ext(identity.githubUrl, `<small>GitHub</small><b>@${esc(identity.github)} ↗</b>`, "contact-card")}
    </div>
  </div>
</section>`;
}

function footer(year: number) {
  return `<footer class="foot">
  <p>© ${year} ${esc(identity.realName)} · <span lang="ja">${esc(identity.handle.family + identity.handle.given)}</span></p>
  <p class="foot__credit">${esc(credits)}</p>
  <p class="foot__tech">three.js · HDR pipeline · <span id="gpu-note">adaptive quality</span></p>
</footer>`;
}

export function renderApp(data: GitHubSnapshot | null): string {
  const year = new Date(data?.generatedAt ?? Date.now()).getUTCFullYear();
  return [
    loader(),
    hud(),
    `<main id="main">`,
    heroSection(),
    profileSection(),
    skillsSection(),
    worksSection(data),
    contactSection(),
    `</main>`,
    footer(year),
  ].join("\n");
}
