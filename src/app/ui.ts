// DOM side of the app: loader, rail, chapter visibility, toasts. Everything
// here only touches classes, attributes and text — layout lives in CSS.

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

const root = document.documentElement;

export class UI {
  readonly chapters = $$<HTMLElement>("[data-chapter]");
  readonly rail = $$<HTMLAnchorElement>(".rail [data-rail]");
  private toastTimer = 0;
  active = -1;

  constructor() {
    // Stagger reveal delays per chapter.
    for (const ch of this.chapters) {
      $$<HTMLElement>("[data-reveal]", ch).forEach((el, i) => el.style.setProperty("--i", String(i)));
    }
  }

  progress(frac: number, status: string) {
    const bar = $<HTMLElement>("[data-progress]");
    if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    const st = $("[data-status]");
    if (st) st.textContent = status;
  }

  ready(onStart: () => void) {
    const btn = $<HTMLButtonElement>("[data-start]");
    if (!btn) return;
    btn.disabled = false;
    btn.focus({ preventScroll: true });
    btn.addEventListener("click", onStart, { once: true });
  }

  hideLoader() {
    $("[data-loader]")?.classList.add("is-gone");
  }

  showSkip(on: boolean, onSkip?: () => void) {
    const b = $<HTMLButtonElement>("[data-skip]");
    if (!b) return;
    if (on) {
      b.hidden = false;
      requestAnimationFrame(() => b.classList.add("is-on"));
      if (onSkip) b.onclick = onSkip;
    } else {
      b.classList.remove("is-on");
      window.setTimeout(() => (b.hidden = true), 800);
    }
  }

  uiOn(on: boolean) {
    root.classList.toggle("ui-on", on);
  }

  world(w: "a" | "b") {
    root.classList.toggle("world-a", w === "a");
    root.classList.toggle("world-b", w === "b");
  }

  setChapter(i: number) {
    if (i === this.active) return;
    this.active = i;
    this.chapters.forEach((c, k) => {
      const on = k === i;
      c.classList.toggle("is-active", on);
      c.setAttribute("aria-hidden", on ? "false" : "true");
    });
    this.rail.forEach((a) => a.classList.toggle("is-active", Number(a.dataset.rail) === i));
    const id = this.chapters[i]?.id;
    if (id) history.replaceState(null, "", i === 0 ? location.pathname + location.search : `#${id}`);
  }

  /** Hide every chapter (during transitions). */
  clearChapter() {
    this.active = -1;
    this.chapters.forEach((c) => c.classList.remove("is-active"));
  }

  toast(text: string, ms = 3200) {
    const t = $("[data-toast]");
    if (!t) return;
    t.textContent = text;
    t.classList.add("is-on");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove("is-on"), ms);
  }
}
