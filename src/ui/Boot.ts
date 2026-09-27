import { moonLitPath } from "../lib/moon";
import { $ } from "./dom";

// NOW LOADING: the moon waxes from new to full while the world is built.

export class Boot {
  private root = $("[data-boot]");
  private lit = $<SVGPathElement>("[data-boot-lit]");
  private bar = $<HTMLElement>("[data-progress]");
  private phase = 0.02;
  private target = 0.02;
  private raf = 0;

  constructor() {
    const tick = () => {
      this.phase += (this.target - this.phase) * 0.12;
      this.lit?.setAttribute("d", moonLitPath(this.phase, 46));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  progress(k: number) {
    this.target = 0.02 + Math.min(1, k) * 0.48;
    if (this.bar) this.bar.style.transform = `scaleX(${Math.min(1, k)})`;
  }

  done() {
    this.progress(1);
    this.root?.classList.add("is-gone");
    window.setTimeout(() => cancelAnimationFrame(this.raf), 900);
  }
}
