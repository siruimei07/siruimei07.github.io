import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const startedAt = Date.now();
const command = process.platform === "win32" ? "vinext.cmd" : "vinext";
const result = spawnSync(command, ["build"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) throw result.error;
if (result.status === 0) process.exit(0);

// vinext 1.0.0-beta.2 can finish a static export on Windows and then hit a
// libuv handle-closing assertion while shutting down its temporary prerender
// server. Never mask a real build error: accept only that Windows abort code,
// and only when a fresh, complete Pages artifact was produced by this run.
const windowsLibuvAbortCodes = new Set([3221226505, -1073740791]);
const outputRoot = join(process.cwd(), "dist", "client");
const indexPath = join(outputRoot, "index.html");
const manifestPath = join(outputRoot, "vinext-client-entry-manifest.json");
const outputIsFresh = existsSync(indexPath)
  && existsSync(manifestPath)
  && statSync(indexPath).mtimeMs >= startedAt - 2_000
  && readFileSync(indexPath, "utf8").includes("Sirui Mei");

if (process.platform === "win32" && windowsLibuvAbortCodes.has(result.status) && outputIsFresh) {
  console.warn("vinext completed the static export before a known Windows shutdown assertion; the fresh artifact was verified.");
  process.exit(0);
}

process.exit(result.status ?? 1);
