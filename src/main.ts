import "@fontsource/montserrat/latin-300.css";
import "@fontsource/montserrat/latin-400.css";
import "@fontsource/montserrat/latin-500.css";
import "@fontsource/montserrat/latin-600.css";
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-800.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "./fonts/fonts.css";
import "./styles/index.css";
import { App } from "./app/app.ts";

const fallback = (e: unknown) => {
  // Anything goes wrong: the page stays a plain, complete document.
  console.error(e);
  document.documentElement.classList.remove("js", "is-booting");
  document.querySelector("[data-boot]")?.remove();
};

try {
  const app = new App(document.getElementById("gl") as HTMLCanvasElement | null);
  app.init().catch(fallback);
  if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
} catch (e) {
  fallback(e);
}
