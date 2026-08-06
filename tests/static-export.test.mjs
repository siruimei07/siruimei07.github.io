import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(projectRoot, "public");
const exportRoot = path.join(projectRoot, "dist", "client");

const expectedAssets = [
  "avatar.jpg",
  "summer-shore.png",
  "contribution-sweeper.gif",
  "summer-drink.gif",
  "study-reader.gif",
  "delivery-run.gif",
  "summer-mage.gif",
  "paper-flight.gif",
  "staff-sitter.gif",
  "camera-nap.gif",
  "raincoat-walker.gif",
  "diver.gif",
];

const textOutputExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".mjs",
  ".rsc",
  ".svg",
  ".txt",
  ".webmanifest",
  ".xml",
]);

async function readProjectFile(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

async function collectFiles(directory, relativeTo = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath, relativeTo));
    } else if (entry.isFile()) {
      files.push(path.relative(relativeTo, absolutePath));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function assertIsoDate(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must use YYYY-MM-DD`);

  const parsed = new Date(`${value}T00:00:00.000Z`);
  assert.ok(Number.isFinite(parsed.getTime()), `${label} must be a valid date`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `${label} must be a real calendar date`);
}

test("configures vinext for a trailing-slash static export", async () => {
  const config = await readProjectFile("next.config.ts");

  assert.match(config, /\boutput\s*:\s*["']export["']/);
  assert.match(config, /\btrailingSlash\s*:\s*true/);
});

test("loads static contribution data while preserving dynamic years and the reload reveal", async () => {
  const [component, css] = await Promise.all([
    readProjectFile("app/ContributionExplorer.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.match(component, /fetch\(`\/data\/github\.json\?v=\$\{refreshTick\}`/);
  assert.match(component, /cache\s*:\s*["']no-store["']/);
  assert.doesNotMatch(component, /\/api\/contributions/);

  assert.match(component, /const\s+FIRST_PROFILE_YEAR\s*=\s*2025/);
  assert.match(component, /const\s+REFRESH_INTERVAL_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
  assert.match(component, /useState<number\s*\|\s*null>\(null\)/);
  assert.match(component, /today\.getFullYear\(\)\s*-\s*FIRST_PROFILE_YEAR\s*\+\s*1/);
  assert.match(component, /createRollingModel\(today\)/);
  assert.match(component, /createYearModel\(selectedYear,\s*today\)/);
  assert.match(component, /const\s+nextMidnight\s*=\s*new Date/);
  assert.match(component, /setInterval\([^,]+,\s*REFRESH_INTERVAL_MS\)/s);
  assert.match(component, /if\s*\(!active\)\s*return;[\s\S]*?setInterval\([^,]+,\s*REFRESH_INTERVAL_MS\)/);
  assert.match(component, /\},\s*\[active\]\);/);
  assert.match(component, /aria-pressed=\{selectedYear\s*===\s*null\}/);
  assert.match(component, /aria-pressed=\{selectedYear\s*===\s*year\}/);

  assert.doesNotMatch(component, /REVEAL_SESSION_KEY|sessionStorage/);
  assert.match(component, /useState<RevealPhase>\(["']done["']\)/);
  assert.match(component, /SWEEPER_LOAD_GRACE_MS/);
  assert.match(component, /SWEEPER_ANIMATION_MS/);
  assert.match(component, /src=["']\/assets\/contribution-sweeper\.gif["']/);
  assert.match(component, /if\s*\(!reduceMotion\)\s*setRevealPhase\(["']preparing["']\)/);
  assert.match(component, /setRevealPhase\(["']preparing["']\)/);
  assert.match(component, /setRevealPhase\(["']running["']\)/);
  assert.match(component, /setRevealPhase\(["']done["']\)/);
  assert.match(component, /onRevealCompleteRef\.current\?\.\(\)/);
  assert.match(component, /event\.animationName\s*!==\s*["']contribution-wipe["']/);
  assert.match(component, /className=["']contribution-data["'][\s\S]*?className=["']year-data["']/);
  assert.doesNotMatch(component, /flight-flash/);
  assert.match(css, /@keyframes\s+contribution-sweep/);
  assert.match(css, /@keyframes\s+contribution-wipe/);
  assert.doesNotMatch(css, /\.flight-live\s+\.flight-flash/);
  assert.match(css, /prefers-reduced-motion[\s\S]*?\.contribution-data[\s\S]*?clip-path\s*:\s*none\s*!important/);
});

test("replays on reload, delays unvisited views, and runs the mascot handoff once per page lifecycle", async () => {
  const [page, css] = await Promise.all([
    readProjectFile("app/page.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.doesNotMatch(page, /sirui-avatar-mascot-state-v1|sirui-avatar-mascot-switch-v1|sessionStorage/);
  assert.match(page, /performance\.getEntriesByType\(["']navigation["']\)/);
  assert.match(page, /navigation\?\.type\s*===\s*["']reload["']/);
  assert.match(page, /history\.replaceState\(null,\s*["']["'],\s*["']#overview["']\)/);
  assert.match(page, /scheduleMascotPhase\(["']bike-enter["'],\s*2000\)/);
  assert.match(page, /scheduleMascotPhase\(["']sitter-enter["'],\s*1000\)/);
  assert.match(page, /if\s*\(mascotSwitchConsumedRef\.current\)\s*return/);
  assert.match(page, /useState<ReadonlySet<ProfileView>>/);
  assert.match(page, /new Set<ProfileView>\(\[["']overview["']\]\)/);
  assert.match(page, /mountedViews\.has\(["']repositories["']\)\s*&&\s*<RepositoriesPanel/);
  assert.match(page, /mountedViews\.has\(["']activity["']\)\s*&&\s*<ActivityPanel/);
  assert.match(page, /<ContributionExplorer[\s\S]*?active=\{activeView\s*===\s*["']overview["']\}[\s\S]*?onRevealComplete=\{handleContributionRevealComplete\}/);
  assert.match(css, /@keyframes\s+avatar-bike-enter/);
  assert.match(css, /@keyframes\s+avatar-bike-exit/);
  assert.match(css, /@keyframes\s+avatar-sitter-enter/);
  assert.match(css, /\.avatar-mascot-sitter\s*\{[^}]*top\s*:\s*-108px/s);
  assert.doesNotMatch(
    css.match(/@keyframes\s+avatar-bike-enter\s*\{([\s\S]*?)\n\}\s*\n\s*@keyframes\s+avatar-bike-exit/)?.[1] ?? "",
    /72%/,
  );
  assert.doesNotMatch(
    css.match(/@keyframes\s+avatar-bike-exit\s*\{([\s\S]*?)\n\}\s*\n\s*@keyframes\s+avatar-sitter-enter/)?.[1] ?? "",
    /32%/,
  );
  assert.match(page, /status-citrus[\s\S]*?angelina-ui\/10\.png/);
  assert.match(css, /\.sidebar-sticker\s*\{[^}]*bottom\s*:\s*0/s);
});

test("uses the deployed GitHub snapshot whenever live public API requests fail", async () => {
  const panels = await readProjectFile("app/GitHubProfilePanels.tsx");

  assert.match(panels, /async\s+function\s+fetchDeployedSnapshot\(\)/);
  assert.match(panels, /fetch\(`\/data\/github\.json\?v=\$\{Date\.now\(\)\}`/);
  assert.match(panels, /fetchDeployedSnapshot\(\)\.catch\(\(\)\s*=>\s*null\)/);
  assert.match(panels, /Promise\.allSettled\(\[/);
  assert.match(panels, /data:\s*deployed\?\.repositories\s*\?\?\s*FALLBACK_REPOSITORIES/);
  assert.match(panels, /data:\s*deployed\.events,[\s\S]*?source:\s*["']snapshot["']/);
  assert.match(panels, /Latest deployed snapshot:/);
  assert.match(panels, /payload\.repositories[\s\S]*?\.map\(normalizeRepository\)/);
  assert.match(panels, /payload\.events[\s\S]*?\.map\(normalizeEvent\)/);
  assert.doesNotMatch(panels, /GitHubProfile|FALLBACK_PROFILE|profileResult/);
  assert.doesNotMatch(panels, /fetchGitHubPage<[^>]*Profile>\(GITHUB_API\)/);
  assert.match(panels, /export\s+function\s+RepositoriesPanel/);
  assert.match(panels, /export\s+function\s+ActivityPanel/);
});

test("keeps the duplicate profile out of right panels and shows curated stickers", async () => {
  const [panels, css] = await Promise.all([
    readProjectFile("app/GitHubProfilePanels.tsx"),
    readProjectFile("app/globals.css"),
  ]);

  assert.doesNotMatch(panels, /function\s+ProfileSummary|github-panel-profile-band/);
  assert.ok((panels.match(/className=["']panel-sticker/g) ?? []).length >= 6);
  assert.match(panels, /angelina-ui\/16\.png/);
  assert.match(panels, /angelina-ui\/17\.png/);
  assert.match(panels, /angelina-ui\/22\.png/);
  assert.doesNotMatch(panels, /angelina-ui\/9(?:-1)?\.png/);
  assert.match(panels, /repositories\.map\(\(repository,\s*index\)/);
  assert.match(panels, /index\s*===\s*0[\s\S]*?panel-sticker-repo-camera/);
  assert.match(css, /\.panel-sticker-activity-explorer\s*\{[^}]*left\s*:\s*18px/s);
});

test("uses real PushEvent payload fallbacks instead of displaying zero commits", async () => {
  const panels = await readProjectFile("app/GitHubProfilePanels.tsx");

  assert.match(panels, /numberValue\(payload,\s*["']size["']\)/);
  assert.match(panels, /numberValue\(payload,\s*["']distinct_size["']\)/);
  assert.match(panels, /arrayLengthValue\(payload,\s*["']commits["']\)/);
  assert.match(panels, /size\s*===\s*null\s*\?\s*["']Pushed commits["']/);
  assert.doesNotMatch(panels, /numberValue\(payload,\s*["']size["']\)\s*\?\?\s*0/);
});

test("validates public GitHub data and only renders safe external URLs", async () => {
  const [panels, contribution] = await Promise.all([
    readProjectFile("app/GitHubProfilePanels.tsx"),
    readProjectFile("app/ContributionExplorer.tsx"),
  ]);

  assert.match(panels, /const\s+MAX_ACTIVITY_ITEMS\s*=\s*25/);
  assert.match(panels, /const\s+MAX_REPOSITORY_PAGES\s*=\s*100/);
  assert.match(panels, /page\s*<=\s*MAX_REPOSITORY_PAGES/);
  assert.match(panels, /per_page:\s*String\(MAX_ACTIVITY_ITEMS\)/);
  assert.match(panels, /requestUrl\.origin\s*!==\s*GITHUB_API_ORIGIN/);
  assert.match(panels, /function\s+safeHttpsUrl/);
  assert.match(panels, /function\s+safeGitHubUrl/);
  assert.match(panels, /\.map\(normalizeRepository\)/);
  assert.match(panels, /\.map\(normalizeEvent\)/);
  assert.match(panels, /safeGitHubValue\(forkee,\s*["']html_url["']\)/);
  assert.doesNotMatch(panels, /href=\{repository\.(?:html_url|homepage)\}/);

  assert.match(contribution, /function\s+isRealIsoDate/);
  assert.match(contribution, /Number\.isSafeInteger\(entry\?\.level\)/);
  assert.match(contribution, /Number\.isSafeInteger\(entry\?\.count\)/);
  assert.match(contribution, /new Map<string,\s*ContributionEntry>/);
  assert.match(contribution, /\.slice\(0,\s*240\)/);
  assert.match(contribution, /let\s+requestActive\s*=\s*true/);
});

test("supplies intrinsic image sizes and isolates every new browsing context", async () => {
  const sources = await Promise.all([
    "app/page.tsx",
    "app/ContributionExplorer.tsx",
    "app/GitHubProfilePanels.tsx",
    "app/SummerFlight.tsx",
  ].map(readProjectFile));
  const source = sources.join("\n");
  const images = source.match(/<img\b[\s\S]*?\/>/g) ?? [];
  assert.ok(images.length >= 20, "Expected all decorative and profile images to be present");
  for (const image of images) {
    assert.match(image, /\bwidth=\{/);
    assert.match(image, /\bheight=\{/);
    assert.match(image, /\bdecoding=["']async["']/);
  }

  const blankLinks = source.match(/<a\b[\s\S]*?target=["']_blank["'][\s\S]*?>/g) ?? [];
  assert.ok(blankLinks.length > 0);
  for (const link of blankLinks) {
    assert.match(link, /rel=["']noopener noreferrer["']/);
  }
});

test("ships a valid flat GitHub data snapshot", async () => {
  const data = JSON.parse(await readProjectFile("public/data/github.json"));

  assert.equal(typeof data, "object");
  assert.ok(data !== null && !Array.isArray(data));
  assert.equal(typeof data.generatedAt, "string");
  assert.ok(Number.isFinite(Date.parse(data.generatedAt)), "generatedAt must be a valid timestamp");
  assert.equal(typeof data.profile, "object");
  assert.ok(data.profile !== null && !Array.isArray(data.profile));
  assert.equal(data.profile.login, "siruimei07");
  assert.ok(Array.isArray(data.repositories), "repositories must be an array");
  assert.ok(Array.isArray(data.events), "events must be an array");
  assert.ok(Array.isArray(data.contributions), "contributions must be a flat array");
  assert.equal(data.contributions.latest, undefined, "contributions must not use a nested latest object");
  assert.equal(data.contributions.years, undefined, "contributions must not use a nested years object");

  const dates = [];
  for (const [index, contribution] of data.contributions.entries()) {
    assert.equal(typeof contribution, "object", `contributions[${index}] must be an object`);
    assert.ok(contribution !== null && !Array.isArray(contribution));
    assertIsoDate(contribution.date, `contributions[${index}].date`);
    assert.ok(Number.isInteger(contribution.level), `contributions[${index}].level must be an integer`);
    assert.ok(
      contribution.level >= 0 && contribution.level <= 4,
      `contributions[${index}].level must be between 0 and 4`,
    );
    assert.ok(Number.isInteger(contribution.count), `contributions[${index}].count must be an integer`);
    assert.ok(contribution.count >= 0, `contributions[${index}].count must be non-negative`);
    assert.equal(typeof contribution.label, "string", `contributions[${index}].label must be a string`);
    assert.ok(contribution.label.length > 0, `contributions[${index}].label must not be empty`);
    dates.push(contribution.date);
  }

  assert.deepEqual(dates, [...dates].sort(), "contributions must be sorted by date");
  assert.equal(new Set(dates).size, dates.length, "contribution dates must not be duplicated");
});

test("syncs every public data source before the Pages build", async () => {
  const [syncScript, workflow, packageJson] = await Promise.all([
    readProjectFile("scripts/sync-github-data.mjs"),
    readProjectFile(".github/workflows/pages.yml"),
    readProjectFile("package.json"),
  ]);

  assert.match(syncScript, /GITHUB_TOKEN/);
  assert.match(syncScript, /PROFILE_GITHUB_TOKEN/);
  assert.match(syncScript, /users\/\$\{GITHUB_LOGIN\}/);
  assert.match(syncScript, /repos\?\$\{query\}/);
  assert.match(syncScript, /events\/public\?\$\{query\}/);
  assert.match(syncScript, /contributionsCollection\(from:\s*\$from,\s*to:\s*\$to\)/);
  assert.match(syncScript, /fetchPublicContributionYear/);
  assert.match(syncScript, /parsePublicContributionCalendar/);
  assert.match(syncScript, /FIRST_CONTRIBUTION_YEAR\s*=\s*2025/);
  assert.match(syncScript, /currentYear\s*-\s*FIRST_CONTRIBUTION_YEAR\s*\+\s*1/);
  assert.match(syncScript, /writeFile\(temporaryPath/);
  assert.match(syncScript, /rename\(temporaryPath,\s*OUTPUT_PATH\)/);

  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /cron:\s*["']2-59\/5 \* \* \* \*["']/);
  assert.match(workflow, /pnpm run sync-data/);
  assert.match(workflow, /PROFILE_GITHUB_TOKEN:\s*\$\{\{ secrets\.PROFILE_GITHUB_TOKEN \}\}/);
  assert.match(workflow, /GITHUB_TOKEN:\s*\$\{\{ github\.token \}\}/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path:\s*\.\/dist\/client/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /pages:\s*write/);
  assert.match(workflow, /id-token:\s*write/);

  const parsedPackage = JSON.parse(packageJson);
  assert.equal(parsedPackage.scripts["sync-data"], "node scripts/sync-github-data.mjs");
  assert.equal(parsedPackage.scripts.build, "node scripts/build-static.mjs");
});

test("contains no runtime-only hosting or contribution API code", async () => {
  const viteConfig = await readProjectFile("vite.config.ts");
  assert.match(viteConfig, /plugins:\s*\[vinext\(\)\]/);
  assert.doesNotMatch(viteConfig, /cloudflare|wrangler|sites\(/i);
  await assert.rejects(access(path.join(projectRoot, "app", "api", "contributions", "route.ts")));
  await assert.rejects(access(path.join(projectRoot, ".openai", "hosting.json")));
});

test("produces a self-contained GitHub Pages artifact with every public asset", async () => {
  const indexPath = path.join(exportRoot, "index.html");
  const dataPath = path.join(exportRoot, "data", "github.json");
  await Promise.all([access(indexPath), access(dataPath)]);

  const publicFiles = await collectFiles(publicRoot);
  assert.ok(publicFiles.length > 0, "public must contain deployable files");
  await Promise.all(publicFiles.map((relativePath) => access(path.join(exportRoot, relativePath))));

  await Promise.all(expectedAssets.map(async (name) => {
    const assetPath = path.join(exportRoot, "assets", name);
    await access(assetPath);
    if (name.endsWith(".gif")) assert.ok((await stat(assetPath)).size > 800_000, `${name} must be the HD asset`);
  }));

  const uiAssets = (await readdir(path.join(exportRoot, "assets", "angelina-ui")))
    .filter((name) => name.endsWith(".png"));
  assert.equal(uiAssets.length, 26);
  assert.ok(!uiAssets.includes("9.png"));
  assert.ok(!uiAssets.includes("9-1.png"));

  const outputFiles = await collectFiles(exportRoot);
  const textFiles = outputFiles.filter((relativePath) => textOutputExtensions.has(path.extname(relativePath)));
  assert.ok(textFiles.includes("index.html"), "static output must include index.html");
  assert.ok(textFiles.includes(path.join("data", "github.json")), "static output must include data/github.json");

  const textOutput = (await Promise.all(
    textFiles.map((relativePath) => readFile(path.join(exportRoot, relativePath), "utf8")),
  )).join("\n");

  // The bundled vinext router contains an internal `http://localhost` base
  // used only to resolve relative URLs. Check deployable documents rather than
  // third-party runtime code for accidentally baked-in local development URLs.
  const deployableDocuments = textFiles.filter((relativePath) => {
    const extension = path.extname(relativePath);
    return extension !== ".js" && extension !== ".mjs";
  });
  const deployableText = (await Promise.all(
    deployableDocuments.map((relativePath) => readFile(path.join(exportRoot, relativePath), "utf8")),
  )).join("\n");

  assert.doesNotMatch(deployableText, /localhost/i);
  assert.doesNotMatch(textOutput, /\/api\/contributions/);
});
