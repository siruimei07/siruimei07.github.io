import { boot, calendarText, card, contact, credits, heroCaption, identity, menu, places, profile, sceneOf, skills, system, tabs, title, worksText } from "./content.ts";
import { heatmap, heatStats, mergeWorks, summarize, type GitHubSnapshot } from "./github.ts";
import { moonAt, MONTHS_EN } from "./lib/moon.ts";

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

const nameRuby = () => {
  const h = identity.handle;
  return `<ruby>${esc(h.family)}<rt>${esc(h.familyKana)}</rt></ruby><ruby>${esc(h.given)}<rt>${esc(h.givenKana)}</rt></ruby>`;
};

function place(id: keyof typeof places) {
  const p = places[id];
  return `<p class="where" aria-hidden="true"><i>LOCATION</i><b>${esc(p.ja)}</b><span>${esc(p.en)}</span></p>`;
}

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
  return `<header class="title" id="top" data-screen="title">
  <span class="title__bar" aria-hidden="true"></span>
  <p class="title__logo"><b>${esc(title.logo)}</b><span>${esc(title.logoRoman)}</span><em>RELOAD</em></p>
  <h1 class="title__name">${nameRuby()}<span>${esc(identity.handleRoman)}</span></h1>
  <p class="title__who">${esc(identity.realName)} · ${esc(identity.oneLiner)}</p>
  <p class="title__press" data-press aria-hidden="true">${title.press.map((w) => `<span data-word="${esc(w)}">${esc(w)}</span>`).join("")}</p>
  <p class="title__press title__press--touch" aria-hidden="true">${title.pressTouch.map((w) => `<span>${esc(w)}</span>`).join("")}</p>
  <p class="title__sub"><span>${esc(title.pressZh)}</span><span lang="ja">${esc(title.pressJa)}</span></p>
  <p class="title__tag">${esc(title.tagline)}<small lang="ja">${esc(title.taglineJa)}</small></p>
  <ul class="title__focus">${title.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
  <p class="title__foot"><b>© 2026 ${esc(identity.realName.toUpperCase())}</b><span>${esc(identity.affiliation.en)}</span></p>
  <a class="title__enter" href="#menu" data-enter>${esc(title.skip)} ›</a>
  ${place("bridge")}
</header>`;
}

function portrait(cls: string, src: string, size: number, alt: string, tag = "") {
  return `<figure class="portrait ${cls}"><span class="portrait__bg" aria-hidden="true"></span><img class="portrait__img" src="${src}" width="${size}" height="${size}" alt="${esc(alt)}" decoding="async" />${tag}</figure>`;
}

function renderMenu(data: GitHubSnapshot | null) {
  const stats = summarize(data);
  const items = menu
    .map(
      (m, i) => `<li style="--r:${LEAN[i].r}deg;--x:${LEAN[i].x}em;--i:${i}"><a href="#${m.id}" data-item="${m.id}" data-info="${esc(m.desc)}" data-info-en="${esc(m.descEn)}" data-place="${esc(places[sceneOf[m.id]].ja)}"><span class="mw" data-word>${esc(m.label)}</span><span class="mw mw--red" aria-hidden="true">${esc(m.label)}</span><small>${esc(m.zh)}</small></a></li>`,
    )
    .join("");
  const links = card.links.map((l) => (l.id === "mail" ? `<a href="${esc(l.href)}">${esc(l.label)}</a>` : ext(l.href, esc(l.label)))).join("");
  return `<nav class="menu" id="menu" data-screen="menu" aria-label="主菜单">
  <div class="menu__strip" aria-hidden="true"><b>MENU</b><span data-menu-index>01</span></div>
  <p class="menu__cap" aria-hidden="true"><b>${esc(heroCaption.name)}</b><span>${esc(heroCaption.line)}</span><small>${esc(heroCaption.en)}</small></p>
  <svg class="menu__cursor" data-cursor aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon class="cur-red" points=""/><polygon class="cur-white" points=""/><polyline class="cur-line" points=""/></svg>
  <ol class="menu__list" data-menu-list>${items}</ol>
  <div class="menu__desc" aria-live="polite"><b data-desc>${esc(menu[0].desc)}</b><small><span data-desc-en>${esc(menu[0].descEn)}</span><i></i><em data-desc-place>${esc(places[sceneOf[menu[0].id]].ja)}</em></small></div>
  <aside class="me" aria-label="关于我">
    <p class="me__label" aria-hidden="true">${esc(card.label)}</p>
    ${portrait("portrait--card", "/assets/avatar-256.webp", 256, "酒寄彩葉的头像")}
    <div class="me__body">
      <p class="me__name">${nameRuby()}<small>${esc(identity.realName)}</small></p>
      <p class="me__role">${esc(card.role)}</p>
      <ul class="me__tags">${card.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
      <p class="me__links">${links}${stats ? `<span class="me__stat"><b>${stats.yearContributions}</b>${esc(card.stat)}</span>` : ""}</p>
    </div>
  </aside>
  <p class="keys"><kbd>↑↓</kbd>选择<kbd>Enter</kbd>确认<kbd>Esc</kbd>标题</p>
</nav>`;
}

function renderTabbar() {
  const items = menu.map((m) => `<a href="#${m.id}" data-tab-to="${m.id}"><span>${esc(m.label)}</span><small>${esc(m.zh)}</small></a>`).join("");
  return `<nav class="tabbar" data-tabbar aria-label="${esc(tabs.label)}">
  <button type="button" class="tabbar__step" data-tab-prev aria-label="上一页"><kbd>${esc(tabs.prev)}</kbd>◀</button>
  <div class="tabbar__list">${items}</div>
  <button type="button" class="tabbar__step" data-tab-next aria-label="下一页">▶<kbd>${esc(tabs.next)}</kbd></button>
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
  const tag = `<figcaption class="portrait__tag"><b>UofT</b>${esc(identity.realName.toUpperCase())}</figcaption>`;
  return `<section id="profile" class="screen screen--profile" data-screen="profile" aria-labelledby="h-profile">
  ${screenHead("profile", "PROFILE", "档案", "ステータス", "STATUS")}
  <div class="idcard">
    ${portrait("portrait--profile", "/assets/avatar.webp", 1024, "酒寄彩葉的头像", tag)}
    <div class="idcard__text">
      <p class="nameplate__arcana"><b>${esc(profile.arcana.num)}</b><span>${esc(profile.arcana.name)}</span><i>${esc(profile.arcana.zh)}</i></p>
      <p class="nameplate__name">${nameRuby()}</p>
      <p class="nameplate__roman">${esc(identity.handleRoman)}<span>${esc(identity.realName)}</span></p>
      <p class="idcard__role">${esc(identity.affiliation.en)} · ${esc(identity.status.en)} · ${esc(identity.homebase)}</p>
      <ul class="chips">${card.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    </div>
  </div>
  <div class="panel panel--profile">
    <div class="profile__about">
      <p class="profile__intro">${esc(profile.intro)}</p>
      <p class="profile__ja" lang="ja">${esc(profile.introJa)}</p>
      <p class="profile__links">${ext(identity.githubUrl, "GitHub ›", "btn btn--primary")}<a class="btn" href="mailto:${esc(identity.email)}">${esc(identity.email)}</a></p>
    </div>
    <div class="profile__facts">
      <dl class="fields">${fields}</dl>
      ${params ? `<h3 class="params__title">${esc(profile.params)}<small>GitHub</small></h3><ul class="params">${params}</ul>` : ""}
    </div>
  </div>
  ${place("stage")}
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
  ${place("pagoda")}
  ${backButton()}
</section>`;
}

function renderWorks(data: GitHubSnapshot | null) {
  const list = mergeWorks(data);
  const stats = summarize(data);
  const tabsHtml = worksText.tabs.map((t, i) => `<button type="button" class="tab${i === 0 ? " is-on" : ""}" data-tab="${t.id}">${esc(t.label)}<small>${esc(t.zh)}</small></button>`).join("");
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
  <div class="tabs" role="toolbar" aria-label="筛选"><kbd>◀</kbd>${tabsHtml}<kbd>▶</kbd></div>
  <ol class="quests">${rows}</ol>
  <aside class="panel panel--quest" data-quest-panel aria-live="polite"></aside>
  ${statLine}
  <p class="more">${ext(identity.githubUrl, `${esc(worksText.more)} · @${esc(identity.github)} ›`)}</p>
  ${place("avenue")}
  ${backButton()}
</section>`;
}

const WEEK_LABELS = ["", "MON", "", "WED", "", "FRI", ""];

function renderHeat(data: GitHubSnapshot | null) {
  const weeks = heatmap(data);
  const st = heatStats(weeks);
  // month labels on the week where a month starts
  let lastMonth = -1;
  const months = weeks
    .map((w, i) => {
      const m = Number(w[0].date.slice(5, 7)) - 1;
      const label = m !== lastMonth && i > 0 ? MONTHS_EN[m].slice(0, 3).toUpperCase() : "";
      lastMonth = m;
      return `<span style="--c:${i + 1}">${label}</span>`;
    })
    .join("");
  const cells = weeks
    .map((w, i) =>
      w
        .map((c, d) => {
          const noon = new Date(`${c.date}T12:00:00Z`);
          const m = moonAt(noon);
          const full = Math.abs(m.phase - 0.5) < 0.5 / 29.53;
          const tip = c.future ? "" : `${c.date} · ${c.count > 0 ? `${c.count} ${calendarText.contributions}` : calendarText.none}`;
          return `<i class="heat__c${c.future ? " is-future" : ""}${full ? " is-full" : ""}" style="--c:${i + 1};--r:${d + 1}" data-l="${c.level}" data-date="${c.date}" data-n="${c.count}"${tip ? ` title="${esc(tip)}"` : ""}></i>`;
        })
        .join(""),
    )
    .join("");
  const S = calendarText.stats;
  const stat = (k: string, v: string, zh: string) => `<div><dt>${esc(zh)}</dt><dd>${v}<small>${esc(k)}</small></dd></div>`;
  return `<section class="heat" data-heat aria-labelledby="h-heat">
    <header class="heat__head">
      <h3 id="h-heat">${esc(calendarText.heat)}<small>${esc(calendarText.heatZh)}</small></h3>
      <dl class="heat__stats">
        ${stat("TOTAL", String(st.total), S.total)}
        ${stat("DAYS", String(st.active), S.active)}
        ${stat("STREAK", String(st.longest), S.streak)}
        ${stat("NOW", String(st.current), S.current)}
        ${stat("BEST", st.best ? `${st.best.count}<i>${st.best.date.slice(5).replace("-", "/")}</i>` : "—", S.best)}
      </dl>
    </header>
    <div class="heat__body">
      <div class="heat__months" aria-hidden="true">${months}</div>
      <div class="heat__days" aria-hidden="true">${WEEK_LABELS.map((l) => `<span>${l}</span>`).join("")}</div>
      <div class="heat__grid" data-heat-grid>${cells}</div>
    </div>
    <p class="heat__legend" aria-hidden="true"><span>${esc(calendarText.less)}</span><i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i><span>${esc(calendarText.more)}</span><em>${esc(calendarText.fullMark)}</em></p>
  </section>`;
}

function renderCalendar(data: GitHubSnapshot | null) {
  return `<section id="calendar" class="screen screen--calendar" data-screen="calendar" aria-labelledby="h-calendar">
  ${screenHead("calendar", "CALENDAR", "日历", "カレンダー", "MOON")}
  <div class="today" data-today aria-live="polite">
    <svg class="today__moon" viewBox="-50 -50 100 100" data-today-icon aria-hidden="true"><circle r="44" class="moon-dark"/><path class="moon-lit" d=""/><circle r="48" class="moon-ring"/></svg>
    <p class="today__date" data-today-date></p>
    <p class="today__name" data-today-name></p>
    <p class="today__meta" data-today-meta></p>
  </div>
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
  ${renderHeat(data)}
  ${place("susuki")}
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
  ${place("street")}
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
  ${place("bamboo")}
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
    renderTabbar(),
    `<main id="main" class="screens">`,
    renderProfile(data),
    renderSkills(),
    renderWorks(data),
    renderCalendar(data),
    renderContact(),
    renderSystem(),
    `</main>`,
    `<div class="swipe" data-swipe aria-hidden="true"><i></i><b></b></div>`,
    `<p class="toast" data-toast role="status" aria-live="polite"></p>`,
    `<p class="noscript-credits">${esc(credits)}</p>`,
  ].join("\n");
}
