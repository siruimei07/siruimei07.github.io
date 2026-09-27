import type { MenuId } from "../content";
import { $, $$ } from "./dom";

// The strip of tabs across the top of every screen (P3R's L1 / R1 row):
// jump straight to another screen without going back through the menu.

export class Tabbar {
  readonly root = $("[data-tabbar]");
  private links = $$<HTMLAnchorElement>("[data-tab-to]", this.root ?? document);
  onGo: (id: MenuId) => void = () => {};
  onStep: (d: number) => void = () => {};

  constructor() {
    this.links.forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.onGo(a.dataset.tabTo as MenuId);
      }),
    );
    $("[data-tab-prev]", this.root ?? document)?.addEventListener("click", () => this.onStep(-1));
    $("[data-tab-next]", this.root ?? document)?.addEventListener("click", () => this.onStep(1));
  }

  show(on: boolean) {
    this.root?.classList.toggle("is-on", on);
  }

  mark(id: MenuId | null) {
    this.links.forEach((a) => {
      const on = a.dataset.tabTo === id;
      a.classList.toggle("is-on", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }
}
