// PROJECT ARCHIVE behaviour: choose a file from the index (a vertical tab
// list). The chosen cassette lifts out of its stack like the PV's extraction,
// the title decodes and CONFIDENTIALITY is typed in again.

import { scramble, typeText } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const IN_MS = 2000;
/** The phone / tablet flow, same query as the CSS phone blocks: there the screen scrolls. */
const PHONE = "(max-width: 899px), (max-aspect-ratio: 1/1), (max-height: 539px), (pointer: coarse) and (max-width: 1400px)";

export function createWorks(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let rows: HTMLButtonElement[] = [];
  let cards: HTMLElement[] = [];
  let current = 0;
  let inTimer = 0;
  let cancels: (() => void)[] = [];

  const stop = () => {
    clearTimeout(inTimer);
    cancels.forEach((f) => f());
    cancels = [];
    for (const c of cards) c.classList.remove("is-in");
  };

  /** Replays the file's entrance: cassette lift, decoded title, typed confidentiality. */
  const play = (card: HTMLElement) => {
    stop();
    if (ctx.reduced()) return;
    void card.offsetWidth; // restart the CSS animations
    card.classList.add("is-in");
    inTimer = window.setTimeout(() => card.classList.remove("is-in"), IN_MS);
    const name = card.querySelector<HTMLElement>(".file__name");
    const conf = card.querySelector<HTMLElement>("[data-conf]");
    if (name) cancels.push(scramble(name, { duration: 560 }));
    if (conf) {
      const text = conf.dataset.text ?? conf.textContent ?? "";
      conf.dataset.text = text;
      cancels.push(typeText(conf, text, { cps: 26, delay: 420 }));
    }
  };

  const select = (i: number, focus = false) => {
    const next = (i + rows.length) % rows.length;
    if (next === current) {
      if (focus) rows[current].focus();
      return;
    }
    current = next;
    rows.forEach((r, j) => {
      const on = j === current;
      r.classList.toggle("is-on", on);
      r.setAttribute("aria-selected", String(on));
      r.tabIndex = on ? 0 : -1;
    });
    for (const c of cards) c.classList.toggle("is-on", Number(c.dataset.fileCard) === current);
    const card = cards.find((c) => Number(c.dataset.fileCard) === current);
    if (card) play(card);
    if (focus) rows[current].focus();
    rows[current].scrollIntoView({ block: "nearest", inline: "nearest", behavior: ctx.reduced() ? "auto" : "smooth" });
    const code = rows[current].querySelector("b")?.textContent ?? "";
    ctx.caption(`编号：${code}`);
    ctx.log(`> ACCESS FILE ${code}`);
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      rows = [...root.querySelectorAll<HTMLButtonElement>("[data-file]")];
      cards = [...root.querySelectorAll<HTMLElement>("[data-file-card]")];
      rows.forEach((r, i) => r.addEventListener("click", () => select(i)));
    },
    enter() {
      const card = cards.find((c) => Number(c.dataset.fileCard) === current);
      if (card) play(card);
    },
    leave: stop,
    key(e) {
      const a = document.activeElement;
      const onRow = rows.includes(a as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // on a row; or in the desktop frame right after entering, when focus is on the screen
        // itself (the promised ↑↓ SELECT FILE). Anywhere else the arrows keep scrolling.
        const fresh = (!a || a === root || a === document.body) && !matchMedia(PHONE).matches;
        if (!onRow && !fresh) return false;
        select(current + (e.key === "ArrowDown" ? 1 : -1), true);
        return true;
      }
      if ((e.key === "Home" || e.key === "End") && onRow) {
        select(e.key === "Home" ? 0 : rows.length - 1, true);
        return true;
      }
      return false;
    },
  };
}
