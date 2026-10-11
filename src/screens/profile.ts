// PERSONNEL FILE behaviour: the GitHub meters count up on entry.

import { rollNumber } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

export function createProfile(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let cancels: (() => void)[] = [];
  return {
    init(el, c) {
      root = el;
      ctx = c;
    },
    enter() {
      cancels.forEach((f) => f());
      cancels = [...root.querySelectorAll<HTMLElement>("[data-count]")].map((el, i) => rollNumber(el, { instant: ctx.reduced(), duration: 800 + i * 90 }));
    },
    leave() {
      cancels.forEach((f) => f());
      cancels = [];
    },
  };
}
