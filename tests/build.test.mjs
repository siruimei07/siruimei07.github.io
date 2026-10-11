// Checks the static build in dist/ (run `pnpm run build` first; `pnpm test`
// does both). Guards the things GitHub Pages and the no-JS page depend on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");
const head = html.slice(0, html.indexOf("</head>"));

const SECTIONS = ["profile", "skills", "works", "activity", "contact", "system"];

/** Every opening <a> tag on the page. */
const anchors = [...html.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);

/** Markup of one pre-rendered screen: from its <section> to the next screen (or the end of <main>). */
function screen(id) {
  const start = html.search(new RegExp(`<section\\b[^>]*\\bid="${id}"`));
  assert.ok(start >= 0, `missing #${id}`);
  const open = html.indexOf(">", start) + 1;
  const next = html.slice(open).search(/<section\b[^>]*\bdata-screen="|<\/main>/);
  return html.slice(start, next >= 0 ? open + next : html.length);
}

function distFiles() {
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(fileURLToPath(dist));
  return files;
}

test("index.html is pre-rendered with the overview and every section file", () => {
  assert.ok(!html.includes("<!--app-->"), "placeholder was not replaced");
  for (const id of ["top", ...SECTIONS]) {
    assert.match(html, new RegExp(`<section\\b[^>]*\\bid="${id}"`), `missing section #${id}`);
  }
  assert.match(html, /<main\b[^>]*\bid="main"/, "skip link target");
});

test("rail and pager link to each of the six sections", () => {
  for (const id of SECTIONS) {
    const to = (a) => a.includes(`href="#${id}"`);
    assert.ok(anchors.some((a) => to(a) && a.includes(`data-nav="${id}"`)), `rail has no link to #${id}`);
    assert.ok(anchors.some((a) => to(a) && a.includes(`data-pager="${id}"`)), `pager has no link to #${id}`);
  }
});

test("identity: name and school are on the page", () => {
  assert.ok(html.includes("Sirui Mei"), "real name");
  assert.ok(html.includes("University of Toronto"), "school");
});

test("focus lists statistics, economics and quant", () => {
  for (const s of ["统计", "经济", "量化"]) assert.ok(html.includes(s), `missing ${s}`);
});

/** Text files of the build, i.e. everything a visitor's browser can read. */
const distText = () => distFiles().filter((f) => /\.(html|js|css|json)$/.test(f));

test("nothing of the previous persona or site is left", () => {
  // content.ts is bundled into the JS as well, so the page alone is not enough
  for (const f of distText()) {
    const text = readFileSync(f, "utf8");
    const name = relative(fileURLToPath(dist), f);
    for (const s of ["酒寄", "彩葉", "彩叶", "さかより", "いろは", "ヤチヨ", "月読"]) {
      assert.ok(!text.includes(s), `found ${s} in ${name}`);
    }
    assert.doesNotMatch(text, /tsukuyomi|sakayori|iroha/i, name);
  }
});

test("every Chinese character on the page is in the Noto Sans SC subset", () => {
  const covered = new Set(readFileSync(new URL("../src/fonts/noto-sans-sc.chars.txt", import.meta.url), "utf8").replace(/\r|\n/g, ""));
  // the GitHub snapshot is re-synced on every deploy; what only it uses falls back to a system font
  const synced = new Set(readFileSync(new URL("data/github.json", dist), "utf8"));
  const missing = new Set();
  for (const f of distFiles().filter((f) => /\.(html|js)$/.test(f))) {
    for (const c of readFileSync(f, "utf8").match(/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/gu) ?? []) {
      if (!covered.has(c) && !synced.has(c)) missing.add(c);
    }
  }
  assert.equal(missing.size, 0, `not in src/fonts/: ${[...missing].join("")} (run python scripts/subset-noto.py)`);
});

test("fonts load as a few files, not hundreds of unicode-range slices", () => {
  const css = distFiles()
    .filter((f) => f.endsWith(".css"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  assert.ok(faces.length <= 15, `${faces.length} @font-face rules`);
  assert.equal(faces.filter((f) => f.includes("Noto Sans SC")).length, 3, "Noto Sans SC 400, 500 and 700");
});

test("the fan-made notice is on the page", () => {
  assert.ok(html.includes("Fan-made tribute"), "credits line");
});

test("every local asset referenced by index.html exists", () => {
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.ok(existsSync(new URL(`.${ref}`, dist)), `missing ${ref}`);
  }
});

test("external links open safely", () => {
  for (const a of anchors.filter((a) => a.includes('target="_blank"'))) {
    assert.match(a, /rel="noopener noreferrer"/, a);
  }
});

test("the activity heatmap is pre-rendered (53 weeks × 7 days)", () => {
  const cells = screen("activity").match(/class="heat__c(?=[\s"])[^"]*"/g) ?? [];
  assert.equal(cells.length, 53 * 7);
  assert.ok(html.includes("data-heat-grid"), "heat grid container");
});

test("the opening is in the markup", () => {
  assert.match(html, /<[a-z]+\b[^>]*\sdata-boot(?=[\s>=])/, "[data-boot] root");
});

test("the overview calls out four sections around the centre", () => {
  const ids = [...screen("top").matchAll(/data-callout="([^"]+)"/g)].map((m) => m[1]);
  const around = ids.filter((id) => id !== "centre");
  assert.equal(around.length, 4, `callouts: ${ids.join(", ")}`);
  assert.equal(new Set(around).size, 4, "callouts are distinct");
  assert.equal(ids.length - around.length, 1, "one centre");
});

test("the theme is set in <head> before the page paints", () => {
  const inline = [...head.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(
    inline.some((s) => s.includes("rl.theme") && s.includes("dataset.theme")),
    "inline theme script in <head>",
  );
});

test("bundle ships the avatar, lazy-loads three.js and has no leftovers from old designs", () => {
  assert.ok(existsSync(new URL("assets/avatar.webp", dist)));
  assert.ok(existsSync(new URL("assets/avatar-256.webp", dist)));
  assert.ok(!existsSync(new URL("assets/avatar-cut.webp", dist)), "v3 avatar cut-out is gone");
  const files = distFiles();
  assert.ok(!files.some((f) => /yachiyo-walk\./i.test(f)), "old film band found in dist");
  assert.ok(!files.some((f) => /angelina|summer-|chibi|doodle|washi|yachiyo/i.test(f)), "old design assets found in dist");

  // three.js stays out of the entry: it is imported on demand, after the page shows.
  const js = files.filter((f) => f.endsWith(".js"));
  assert.ok(js.length >= 2, "three.js should be its own lazily loaded chunk");
  const entry = html.match(/<script type="module"[^>]*\ssrc="(\/[^"]+\.js)"/);
  assert.ok(entry, "module entry script");
  const entryFile = fileURLToPath(new URL(`.${entry[1]}`, dist));
  const isThree = (f) => readFileSync(f, "utf8").includes("linearToOutputTexel"); // WebGLRenderer's shader prelude
  assert.ok(!isThree(entryFile), "three.js is in the entry chunk");
  assert.ok(js.some((f) => f !== entryFile && isThree(f)), "no lazily loaded three.js chunk");
});
