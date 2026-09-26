import { readFileSync } from "node:fs";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { renderApp } from "./src/render.ts";
import type { GitHubSnapshot } from "./src/github.ts";

function readSnapshot(): GitHubSnapshot | null {
  try {
    return JSON.parse(readFileSync(new URL("./public/data/github.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

// Pre-renders every section into index.html so the page has real content
// before (and without) JavaScript. In dev the renderer is reloaded through the
// SSR module graph so edits to content.ts show up on refresh.
function staticSections(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: "tsukuyomi-static-sections",
    configureServer(s) {
      server = s;
    },
    async transformIndexHtml(html) {
      const render = server
        ? ((await server.ssrLoadModule("/src/render.ts")) as typeof import("./src/render.ts")).renderApp
        : renderApp;
      return html.replace("<!--app-->", render(readSnapshot()));
    },
  };
}

export default defineConfig({
  plugins: [staticSections()],
  build: {
    target: "es2022",
    // three.js is one chunk on purpose; it is needed before the first frame.
    chunkSizeWarningLimit: 900,
    assetsInlineLimit: 0,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});
