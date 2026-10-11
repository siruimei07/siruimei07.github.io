// Pre-renders the whole page into index.html at build time, so every word is
// in the document before (and without) JavaScript. With JS the same markup
// becomes the terminal: opening → overview → section files.

import { credits } from "./content.ts";
import { summarize, type GitHubSnapshot } from "./github.ts";
import { esc } from "./markup.ts";
import { renderBoot } from "./boot/markup.ts";
import { renderChrome } from "./views/chrome.ts";
import { renderHome } from "./views/home.ts";
import { renderProfile } from "./views/profile.ts";
import { renderSkills } from "./views/skills.ts";
import { renderWorks } from "./views/works.ts";
import { renderActivity } from "./views/activity.ts";
import { renderContact } from "./views/contact.ts";
import { renderSystem } from "./views/system.ts";

export function renderApp(data: GitHubSnapshot | null): string {
  const stats = summarize(data);
  return [
    renderBoot(),
    renderChrome(),
    `<main id="main" class="screens">`,
    renderHome(stats ? stats.yearContributions : null),
    renderProfile(data),
    renderSkills(),
    renderWorks(data),
    renderActivity(data),
    renderContact(),
    renderSystem(),
    `</main>`,
    `<p class="toast" data-toast role="status" aria-live="polite"></p>`,
    `<p class="credits-foot">${esc(credits)}</p>`,
  ].join("\n");
}
