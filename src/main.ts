import "@fontsource/shippori-mincho-b1/600.css";
import "@fontsource/shippori-mincho-b1/800.css";
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/600.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./styles/main.css";
import { App } from "./app/App";

const canvas = document.getElementById("gl") as HTMLCanvasElement | null;
const gl2 = !!canvas && !!document.createElement("canvas").getContext("webgl2");

if (!canvas || !gl2) {
  // Without WebGL2 the page stays a plain document.
  document.documentElement.classList.remove("js");
  document.querySelector("[data-loader]")?.remove();
} else {
  new App(canvas).init().catch((e) => {
    console.error(e);
    document.documentElement.classList.remove("js");
    document.querySelector("[data-loader]")?.remove();
  });
}
