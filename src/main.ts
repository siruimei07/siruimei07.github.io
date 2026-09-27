import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/900.css";
import "@fontsource/montserrat/700-italic.css";
import "@fontsource/montserrat/900-italic.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "@fontsource/noto-sans-sc/900.css";
import "@fontsource/shippori-mincho-b1/800.css";
import "./styles/main.css";
import { App } from "./app/App";

const canvas = document.getElementById("gl") as HTMLCanvasElement | null;
const gl2 = !!canvas && !!document.createElement("canvas").getContext("webgl2");

const fallback = () => {
  // Without WebGL2 the page stays a plain document.
  document.documentElement.classList.remove("js");
  document.querySelector("[data-boot]")?.remove();
};

if (!canvas || !gl2) {
  fallback();
} else {
  new App(canvas).init().catch((e) => {
    console.error(e);
    fallback();
  });
}
