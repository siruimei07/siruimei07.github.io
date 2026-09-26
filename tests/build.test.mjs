// Checks the static build in dist/ (run `pnpm run build` first; `pnpm test`
// does both). Guards the things GitHub Pages depends on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = new URL("../dist/", import.meta.url);
const html = readFileSync(new URL("index.html", dist), "utf8");

test("index.html is pre-rendered with every section", () => {
  assert.ok(!html.includes("<!--app-->"), "placeholder was not replaced");
  for (const id of ["login", "profile", "skills", "works", "contact"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing section #${id}`);
  }
});

test("identity: persona ID and real name both present", () => {
  assert.ok(html.includes("酒寄"), "persona family name");
  assert.ok(html.includes("彩葉"), "persona given name");
  assert.ok(html.includes("さかより") && html.includes("いろは"), "furigana");
  assert.ok(html.includes("Sirui Mei"), "real name");
});

test("expertise lists statistics, economics and quant", () => {
  for (const s of ["统计", "经济", "量化"]) assert.ok(html.includes(s), `missing ${s}`);
});

test("every local asset referenced by index.html exists", () => {
  const refs = [...html.matchAll(/(?:src|href)="(\/[^"#?]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 0);
  for (const ref of refs) {
    assert.ok(existsSync(new URL(`.${ref}`, dist)), `missing ${ref}`);
  }
});

test("external links open safely", () => {
  for (const m of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
    assert.match(m[0], /rel="noopener noreferrer"/, m[0]);
  }
});

test("bundle contains the avatar and no leftovers from the old site", () => {
  assert.ok(existsSync(new URL("assets/avatar.webp", dist)));
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(fileURLToPath(dist));
  assert.ok(!files.some((f) => /angelina|summer-|chibi|doodle/i.test(f)), "old design assets found in dist");
  assert.ok(files.some((f) => f.endsWith(".js")), "no JavaScript bundle");
});
