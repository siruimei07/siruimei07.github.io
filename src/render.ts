import { contact, credits, hero, identity, loader, profile, sections, skills } from "./content.ts";
import { mergeWorks, summarize, type GitHubSnapshot } from "./github.ts";

// Pre-renders the whole page into index.html at build time, so every word is
// in the document before (and without) JavaScript. The 3D layer and the
// chapter controller take over once the script runs.

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const ext = (href: string, text: string, cls = "") =>
  `<a${cls ? ` class="${cls}"` : ""} href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

function head(id: string) {
  const i = sections.findIndex((s) => s.id === id);
  const s = sections[i];
  return `<header class="chapter__head" data-reveal>
    <span class="chapter__index">${s.index}</span>
    <h2 class="chapter__title">${esc(s.zh)}</h2>
    <span class="chapter__sub"><i>${esc(s.en)}</i> · ${esc(s.ja)}</span>
  </header>`;
}

function renderLoader() {
  return `<div class="loader" data-loader>
  <div class="loader__inner">
    <p class="loader__mark"><span class="loader__kanji">${esc(loader.title)}</span><span class="loader__kana">${esc(loader.titleJa)}</span></p>
    <p class="loader__line">${esc(loader.line)}</p>
    <div class="loader__bar" aria-hidden="true"><i data-progress></i></div>
    <p class="loader__status" data-status>准备中…</p>
    <div class="loader__actions">
      <button class="btn btn--primary" type="button" data-start disabled>${esc(loader.start)}<small>${esc(loader.startJa)}</small></button>
    </div>
  </div>
</div>`;
}

function renderTopbar() {
  const rail = sections
    .map((s, i) => `<a href="#${s.id}" data-rail="${i}" aria-label="${esc(s.zh)}"><b>${s.index}</b><span>${esc(s.zh)}</span></a>`)
    .join("");
  return `<header class="topbar" data-ui>
  <a class="topbar__mark" href="#cover" data-rail="0"><b>月読</b><span>TSUKUYOMI</span></a>
  <nav class="rail" aria-label="章节">${rail}</nav>
</header>
<button class="skip" type="button" data-skip hidden>${esc(loader.skip)} <span aria-hidden="true">›</span></button>`;
}

function renderCover() {
  const h = identity.handle;
  return `<section id="cover" class="chapter chapter--cover" data-chapter="0" aria-label="鸟居">
  <div class="cover">
    <p class="kicker" data-reveal><span class="kicker__kanji">${esc(hero.kicker)}</span><span class="kicker__ja">${esc(hero.kickerJa)}</span></p>
    <h1 class="name" data-reveal><ruby>${esc(h.family)}<rt>${esc(h.familyKana)}</rt></ruby><ruby>${esc(h.given)}<rt>${esc(h.givenKana)}</rt></ruby></h1>
    <p class="roman" data-reveal>${esc(identity.handleRoman)} <i>·</i> ${esc(identity.realName)}</p>
    <p class="tagline" data-reveal>${hero.tagline.map(esc).join("<br>")}</p>
    <p class="tagline-ja" data-reveal>${esc(hero.taglineJa)}</p>
    <ul class="focus" data-reveal>${hero.focus.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>
    <div class="cta" data-reveal><a class="btn btn--primary" href="#profile" data-next>${esc(hero.enter)}<small>${esc(hero.enterJa)}</small></a></div>
  </div>
  <ul class="hints" data-reveal>${hero.hints.map((x) => `<li><b>${esc(x.key)}</b>${esc(x.text)}</li>`).join("")}</ul>
</section>`;
}

function renderProfile() {
  const fields = profile.fields.map((f) => `<div><dt>${esc(f.k)}</dt><dd>${esc(f.v)}</dd></div>`).join("");
  return `<section id="profile" class="chapter chapter--profile" data-chapter="1" aria-label="档案">
  <div class="panel">
    ${head("profile")}
    <div class="profile__who" data-reveal>
      <img class="profile__avatar" src="/assets/avatar-256.webp" width="96" height="96" alt="酒寄彩葉的头像" loading="lazy" decoding="async" />
      <div>
        <p class="profile__name">${esc(identity.handle.family)} ${esc(identity.handle.given)}</p>
        <p class="profile__real">${esc(identity.realName)} · ${esc(identity.affiliation.en)}</p>
      </div>
    </div>
    <p class="profile__intro" data-reveal>${esc(profile.intro)}</p>
    <p class="profile__ja" data-reveal>${esc(profile.introJa)}</p>
    <dl class="fields" data-reveal>${fields}</dl>
  </div>
</section>`;
}

function renderSkills() {
  const cards = skills
    .map(
      (s) => `<article class="skill" data-skill="${s.id}" data-reveal tabindex="0">
      <span class="skill__lantern" aria-hidden="true">${esc(s.lantern)}</span>
      <div class="skill__body">
        <h3>${esc(s.zh)} <small>${esc(s.en)} · ${esc(s.ja)}</small></h3>
        <p class="skill__motto">${esc(s.motto)}</p>
        <p class="skill__text">${esc(s.body)}</p>
        <ul class="tags">${s.topics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
    </article>`,
    )
    .join("");
  return `<section id="skills" class="chapter chapter--skills" data-chapter="2" aria-label="擅长">
  <div class="panel panel--wide">
    ${head("skills")}
    <div class="skills">${cards}</div>
  </div>
</section>`;
}

function renderWorks(data: GitHubSnapshot | null) {
  const list = mergeWorks(data);
  const stats = summarize(data);
  const cards = list
    .map(
      (w) => `<article class="work" data-reveal>
      <span class="work__code">${esc(w.code)}</span>
      <div class="work__body">
        <h3>${ext(w.href, esc(w.title))} <small>${esc(w.zh)}</small></h3>
        <p>${esc(w.description)}</p>
        <ul class="tags">${w.stack.map((t) => `<li>${esc(t)}</li>`).join("")}${w.stars !== null ? `<li class="tags__star">★ ${w.stars}</li>` : ""}</ul>
      </div>
      <span class="work__state work__state--${w.state}">${w.state === "live" ? "LIVE" : "ARCHIVE"}</span>
    </article>`,
    )
    .join("");
  const statLine = stats
    ? `<p class="stats" data-reveal>GitHub · <b>${stats.repos}</b> 仓库 · <b>${stats.stars}</b> 星标 · 近一年 <b>${stats.yearContributions}</b> 次贡献</p>`
    : "";
  return `<section id="works" class="chapter chapter--works" data-chapter="3" aria-label="作品">
  <div class="panel panel--wide">
    ${head("works")}
    <div class="works">${cards}</div>
    ${statLine}
    <p class="more" data-reveal>${ext(identity.githubUrl, `更多在 GitHub · @${esc(identity.github)} ›`)}</p>
  </div>
</section>`;
}

function renderContact() {
  return `<section id="contact" class="chapter chapter--contact" data-chapter="4" aria-label="联络">
  <div class="panel">
    ${head("contact")}
    <h3 class="letter__title" data-reveal>${esc(contact.title)} <small>${esc(contact.titleJa)}</small></h3>
    <p class="letter__lead" data-reveal>${esc(contact.lead)}</p>
    <form class="letter" data-letter data-reveal>
      <label class="sr-only" for="letter-text">留言</label>
      <textarea id="letter-text" name="message" rows="3" maxlength="400" placeholder="${esc(contact.placeholder)}"></textarea>
      <div class="letter__actions">
        <button class="btn btn--primary" type="submit" data-release>${esc(contact.release)}</button>
        <a class="btn" href="mailto:${esc(identity.email)}?subject=${encodeURIComponent(contact.subject)}" data-mail>${esc(contact.send)}</a>
      </div>
      <p class="letter__thanks" data-thanks hidden>${esc(contact.thanks)}</p>
    </form>
    <ul class="links" data-reveal>
      <li><span>Mail</span><a href="mailto:${esc(identity.email)}">${esc(identity.email)}</a></li>
      <li><span>GitHub</span>${ext(identity.githubUrl, `@${esc(identity.github)}`)}</li>
    </ul>
    <p class="credits" data-reveal>${esc(credits)}</p>
  </div>
</section>`;
}

export function renderApp(data: GitHubSnapshot | null): string {
  return [
    renderLoader(),
    renderTopbar(),
    `<main id="main" class="chapters">`,
    renderCover(),
    renderProfile(),
    renderSkills(),
    renderWorks(data),
    renderContact(),
    `</main>`,
    `<p class="toast" data-toast role="status" aria-live="polite"></p>`,
  ].join("\n");
}
