import { boot, calendarText, contact, credits, identity, menu, profile, skills, system, title, worksText } from "./content.ts";
import { mergeWorks, summarize, type GitHubSnapshot } from "./github.ts";

// Pre-renders the whole page into index.html at build time, so every word is
// in the document before (and without) JavaScript. With JS the same markup
// becomes the P3R-style game UI: title → day change → menu → screens.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ext = (href: string, text: string, cls = "") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

// Each menu word leans at its own angle, like the P3R pause menu.
const LEAN = [
  { r: -10, x: 0.8 },
  { r: -12, x: 0.25 },
  { r: -8.5, x: 1.0 },
  { r: -11, x: 0.05 },
  { r: -9.5, x: 0.5 },
  { r: -7.5, x: 0.95 },
];

function renderBoot() {
  return `<div class="boot" data-boot aria-hidden="true">
  <div class="boot__sea"></div>
  <svg class="boot__moon" viewBox="-50 -50 100 100"><circle r="46" class="boot__disc"/><path class="boot__lit" data-boot-lit d=""/></svg>
  <p class="boot__text"><span>${esc(boot.loading)}</span><i></i><i></i><i></i></p>
  <div class="boot__bar"><i data-progress></i></div>
  <p class="boot__quote">${esc(boot.quote)}<small>${esc(boot.quoteSrc)}</small></p>
</div>`;
}

function renderHud() {
  return `<div class="hud" data-hud aria-hidden="true">
  <span class="hud__word" data-hud-word>WEEKDAY</span>
  <span class="hud__stroke"></span>
  <span class="hud__date"><b data-hud-date>--/--</b><i data-hud-dow>---</i></span>
  <span class="hud__phase" data-hud-phase>Evening</span>
  <span class="hud__moon"><small data-hud-label>FULL MOON</small><b data-hud-days>0</b><svg viewBox="-50 -50 100 100" data-hud-icon><circle r="44" class="moon-dark"/><path class="moon-lit" d=""/><circle r="47" class="moon-ring"/></svg></span>
</div>`;
}

function renderTitle() {
  const h = identity.handle;
  return `<header class="title" id="top" data-screen="title">
  <span class="title__bar" aria-hidden="true"></span>
  <p class="title__logo"><b>${esc(title.logo)}</b><span>${esc(title.logoRoman)}</span><em>RELOAD</em></p>
  <h1 class="title__name"><ruby>${esc(h.family)}<rt>${esc(h.familyKana)}</rt></ruby><ruby>${esc(h.given)}<rt>${esc(h.givenKana)}</rt></ruby><span>${esc(identity.handleRoman)}</span></h1>
  <p class="title__press" data-press aria-hidden="true">${title.press.map((w) => `<span data-word="${esc(w)}">${esc(w)}</span>`).join("")}</p>
  <p class="title__press title__press--touch" aria-hidden="true">${title.pressTouch.map((w) => `<span>${esc(w)}</span>`).join("")}</p>
  <p class="title__sub"><span>${esc(title.pressZh)}</span><span lang="ja">${esc(title.pressJa)}</span></p>
  <p class="title__tag">${esc(title.tagline)}<small lang="ja">${esc(title.taglineJa)}</small></p>
  <ul class="title__focus">${title.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <p class="title__foot"><b>© 2026 ${esc(identity.realName.toUpperCase())}</b><span>${esc(identity.affiliation.en)}</span></p>
  <a class="title__enter" href="#menu" data-enter>${esc(title.skip)} ›</a>
</header>`;
}

function renderMenu(data: GitHubSnapshot | null) {
  const stats = summarize(data);
  const items = menu
    .map(
      (m, i) => `<li style="--r:${LEAN[i].r}deg;--x:${LEAN[i].x}em;--i:${i}"><a href="#${m.id}" data-item="${m.id}" data-info="${esc(m.desc)}" data-info-en="${esc(m.descEn)}"><span class="mw" data-word>${esc(m.label)}</span><span class="mw mw--red" aria-hidden="true">${esc(m.label)}</span><small>${esc(m.zh)}</small></a></li>`,
    )
    .join("");
  return `<nav class="menu" id="menu" data-screen="menu" aria-label="主菜单">
  <div class="menu__strip" aria-hidden="true"><b>MENU</b><span data-menu-index>01</span></div>
  <div class="menu__wallet"><b>✦ <span data-wallet>${stats ? stats.yearContributions : "—"}</span></b><small>contributions · 近一年提交</small></div>
  <svg class="menu__cursor" data-cursor aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon class="cur-red" points=""/><polygon class="cur-white" points=""/><polyline class="cur-line" points=""/></svg>
  <ol class="menu__list" data-menu-list>${items}</ol>
  <div class="menu__desc" aria-live="polite"><b data-desc>${esc(menu[0].desc)}</b><small><span data-desc-en>${esc(menu[0].descEn)}</span><i></i></small></div>
  <p class="keys"><kbd>↑↓</kbd>选择<kbd>Enter</kbd>确认<kbd>Esc</kbd>返回</p>
</nav>`;
}

function screenHead(id: string, en: string, zh: string, ja: string, big: string) {
  return `<span class="screen__big" aria-hidden="true">${esc(big)}</span>
  <header class="screen__head">
    <h2 id="h-${id}"><span>${esc(en)}</span><small>${esc(zh)} · <i lang="ja">${esc(ja)}</i></small></h2>
  </header>`;
}

function backButton() {
  return `<a class="back" href="#menu" data-back><kbd>Esc</kbd>返回菜单</a>`;
}

function renderProfile(data: GitHubSnapshot | null) {
  const h = identity.handle;
  const s = summarize(data);
  const fields = profile.fields.map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join("");
  const params = s
    ? [
        ["REPOS", "仓库", s.repos, 20],
        ["STARS", "星标", s.stars, 50],
        ["COMMITS", "近一年提交", s.yearContributions, 600],
        ["ACTIVE", "活跃天数", s.activeDays, 200],
        ["FOLLOWERS", "关注者", s.followers, 50],
      ]
        .map(
          ([k, zh, v, max]) =>
            `<li style="--v:${Math.min(1, Number(v) / Number(max)).toFixed(3)}"><span>${k}</span><small>${zh}</small><b>${v}</b><i></i></li>`,
        )
        .join("")
    : "";
  return `<section id="profile" class="screen screen--profile" data-screen="profile" aria-labelledby="h-profile">
  ${screenHead("profile", "PROFILE", "档案", "ステータス", "STATUS")}
  <div class="nameplate">
    <p class="nameplate__arcana"><b>${esc(profile.arcana.num)}</b><span>${esc(profile.arcana.name)}</span><i>${esc(profile.arcana.zh)}</i></p>
    <p class="nameplate__name"><ruby>${esc(h.family)}<rt>${esc(h.familyKana)}</rt></ruby><ruby>${esc(h.given)}<rt>${esc(h.givenKana)}</rt></ruby></p>
    <p class="nameplate__roman">${esc(identity.handleRoman)}<span>${esc(identity.realName)}</span></p>
  </div>
  <div class="panel panel--profile">
    <img class="profile__avatar" src="/assets/avatar-256.webp" width="112" height="112" alt="酒寄彩葉的头像" loading="lazy" decoding="async" />
    <p class="profile__intro">${esc(profile.intro)}</p>
    <p class="profile__ja" lang="ja">${esc(profile.introJa)}</p>
    <dl class="fields">${fields}</dl>
    ${params ? `<h3 class="params__title">${esc(profile.params)}<small>GitHub</small></h3><ul class="params">${params}</ul>` : ""}
  </div>
  ${backButton()}
</section>`;
}

function renderSkills() {
  const list = skills
    .map(
      (s, i) => `<li><button type="button" class="skill-row${i === 0 ? " is-on" : ""}" data-skill="${s.id}" aria-controls="skill-${s.id}"><span class="skill-row__glyph">${esc(s.glyph)}</span><span class="skill-row__name">${esc(s.zh)}<small>${esc(s.en)}</small></span><span class="skill-row__idx">${esc(s.index)}</span></button></li>`,
    )
    .join("");
  const details = skills
    .map(
      (s, i) => `<article class="skill-card${i === 0 ? " is-on" : ""}" id="skill-${s.id}" data-skill-card="${s.id}">
      <span class="skill-card__glyph" aria-hidden="true">${esc(s.glyph)}</span>
      <h3>${esc(s.zh)}<small>${esc(s.en)} · <i lang="ja">${esc(s.ja)}</i></small></h3>
      <p class="skill-card__motto">${esc(s.motto)}</p>
      <p class="skill-card__body">${esc(s.body)}</p>
      <ul class="chips">${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
    </article>`,
    )
    .join("");
  return `<section id="skills" class="screen screen--skills" data-screen="skills" aria-labelledby="h-skills">
  ${screenHead("skills", "SKILL", "擅长", "スキル", "SKILL")}
  <ol class="skill-list">${list}</ol>
  <div class="panel panel--skill">${details}</div>
  ${backButton()}
</section>`;
}

function renderWorks(data: GitHubSnapshot | null) {
  const list = mergeWorks(data);
  const stats = summarize(data);
  const tabs = worksText.tabs.map((t, i) => `<button type="button" class="tab${i === 0 ? " is-on" : ""}" data-tab="${t.id}">${esc(t.label)}<small>${esc(t.zh)}</small></button>`).join("");
  const rows = list
    .map(
      (w, i) => `<li data-state="${w.state}"><article class="quest${i === 0 ? " is-on" : ""}" data-quest="${i}" tabindex="0">
      <span class="quest__no">${String(i + 1).padStart(2, "0")}</span>
      <h3 class="quest__title">${esc(w.title)}<small>${esc(w.zh)}</small></h3>
      <span class="quest__state quest__state--${w.state}">${w.state === "live" ? esc(worksText.live) : esc(worksText.archive)}</span>
      <div class="quest__detail">
        <p>${esc(w.description)}</p>
        <ul class="chips">${w.stack.map((t) => `<li>${esc(t)}</li>`).join("")}${w.stars !== null ? `<li class="chips__star">★ ${w.stars}</li>` : ""}</ul>
        ${ext(w.href, `${esc(worksText.open)} ›`, "btn")}
      </div>
    </article></li>`,
    )
    .join("");
  const statLine = stats
    ? `<p class="stats">GitHub · <b>${stats.repos}</b> 仓库 · <b>${stats.stars}</b> 星标 · 近一年 <b>${stats.yearContributions}</b> 次提交</p>`
    : "";
  return `<section id="works" class="screen screen--works" data-screen="works" aria-labelledby="h-works">
  ${screenHead("works", "WORKS", "作品", "クエスト", "REQUEST")}
  <div class="tabs" role="toolbar" aria-label="筛选"><kbd>◀</kbd>${tabs}<kbd>▶</kbd></div>
  <ol class="quests">${rows}</ol>
  <aside class="panel panel--quest" data-quest-panel aria-live="polite"></aside>
  ${statLine}
  <p class="more">${ext(identity.githubUrl, `${esc(worksText.more)} · @${esc(identity.github)} ›`)}</p>
  ${backButton()}
</section>`;
}

function renderCalendar(data: GitHubSnapshot | null) {
  const s = summarize(data);
  return `<section id="calendar" class="screen screen--calendar" data-screen="calendar" aria-labelledby="h-calendar">
  ${screenHead("calendar", "CALENDAR", "日历", "カレンダー", "MOON")}
  <div class="cal" data-cal>
    <div class="cal__head"><button type="button" class="cal__nav" data-cal-prev aria-label="上个月">◀</button><p class="cal__month"><b data-cal-month>--</b><span><i data-cal-year>----</i><small data-cal-mname>---</small></span></p><button type="button" class="cal__nav" data-cal-next aria-label="下个月">▶</button></div>
    <div class="cal__grid" data-cal-grid></div>
  </div>
  <aside class="panel panel--day" data-cal-day>
    <p class="day__date" data-day-date></p>
    <p class="day__moon"><svg viewBox="-50 -50 100 100" data-day-icon><circle r="44" class="moon-dark"/><path class="moon-lit" d=""/></svg><span data-day-moon></span></p>
    <p class="day__count" data-day-count></p>
    <p class="day__full" data-day-full></p>
    <p class="day__note">${esc(calendarText.kaguya)}</p>
  </aside>
  ${s ? `<p class="stats">近一年 <b>${s.yearContributions}</b> 次提交 · <b>${s.activeDays}</b> 天活跃</p>` : ""}
  ${backButton()}
</section>`;
}

function renderContact() {
  const rows = contact.links
    .map(
      (l, i) => `<li><button type="button" class="link-row${i === 0 ? " is-on" : ""}" data-link="${l.id}"><span class="link-row__arcana"><b>${esc(l.num)}</b>${esc(l.arcana)}</span><span class="link-row__who">${esc(l.label)}<small>${esc(l.value)}</small></span><span class="link-row__rank"><small>RANK</small>${esc(l.rank)}</span></button></li>`,
    )
    .join("");
  const cards = contact.links
    .map(
      (l, i) => `<div class="arcana${i === 0 ? " is-on" : ""}" data-card="${l.id}">
      <div class="arcana__card" aria-hidden="true"><span class="arcana__num">${esc(l.num)}</span><span class="arcana__art arcana__art--${l.id}"></span><span class="arcana__name">${esc(l.arcana)}</span></div>
      <p class="arcana__line">${l.id === "mail" ? `<a href="${esc(l.href)}">${esc(l.value)}</a>` : ext(l.href, esc(l.value))}</p>
    </div>`,
    )
    .join("");
  return `<section id="contact" class="screen screen--contact" data-screen="contact" aria-labelledby="h-contact">
  ${screenHead("contact", "SOCIAL LINK", "联络", "コミュ", "SOCIAL LINK")}
  <ol class="link-list">${rows}</ol>
  <div class="cards">${cards}</div>
  <form class="letter panel" data-letter>
    <h3>${esc(contact.title)}<small lang="ja">${esc(contact.titleJa)}</small></h3>
    <p class="letter__lead">${esc(contact.lead)}</p>
    <label class="sr-only" for="letter-text">留言</label>
    <textarea id="letter-text" name="message" rows="4" maxlength="600" placeholder="${esc(contact.placeholder)}"></textarea>
    <div class="letter__actions">
      <button class="btn btn--primary" type="submit">${esc(contact.send)} ›</button>
      <a class="btn" href="mailto:${esc(identity.email)}?subject=${encodeURIComponent(contact.subject)}" data-mail>${esc(identity.email)}</a>
    </div>
    <p class="letter__thanks" data-thanks hidden>${esc(contact.thanks)}</p>
  </form>
  ${backButton()}
</section>`;
}

function seg(name: string, opts: [string, string, string][]) {
  return opts.map(([v, en, zh]) => `<button type="button" class="seg" data-${name}="${v}"><span>${esc(en)}</span><small>${esc(zh)}</small></button>`).join("");
}

function renderSystem() {
  return `<section id="system" class="screen screen--system" data-screen="system" aria-labelledby="h-system">
  ${screenHead("system", "SYSTEM", "设置", "システム", "CONFIG")}
  <ul class="config">
    <li class="config__row"><span class="config__label">${esc(system.quality.label)}<small>${esc(system.quality.zh)}</small></span><span class="config__opts">${seg("quality", system.quality.options)}</span></li>
    <li class="config__row"><span class="config__label">${esc(system.motion.label)}<small>${esc(system.motion.zh)}</small></span><span class="config__opts">${seg("motion", system.motion.options)}</span></li>
    <li class="config__row"><span class="config__label">${esc(system.fps.label)}<small>${esc(system.fps.zh)}</small></span><span class="config__opts">${seg("fps", system.fps.options)}</span></li>
    <li class="config__row config__row--action"><a href="#top" data-to-title><span class="config__label">${esc(system.toTitle.label)}<small>${esc(system.toTitle.zh)}</small></span></a></li>
  </ul>
  <div class="panel panel--about">
    <h3>${esc(system.about.label)}<small>${esc(system.about.zh)}</small></h3>
    <p>${esc(system.tech)}</p>
    <p class="credits">${esc(credits)}</p>
    <p>${ext("https://github.com/siruimei07/siruimei07.github.io", `${esc(system.source)} ›`)}</p>
  </div>
  <p class="fps" data-fps hidden></p>
  ${backButton()}
</section>`;
}

export function renderApp(data: GitHubSnapshot | null): string {
  return [
    renderBoot(),
    `<div class="daybreak" data-daybreak aria-hidden="true"></div>`,
    renderHud(),
    renderTitle(),
    renderMenu(data),
    `<main id="main" class="screens">`,
    renderProfile(data),
    renderSkills(),
    renderWorks(data),
    renderCalendar(data),
    renderContact(),
    renderSystem(),
    `</main>`,
    `<p class="toast" data-toast role="status" aria-live="polite"></p>`,
    `<p class="noscript-credits">${esc(credits)}</p>`,
  ].join("\n");
}
