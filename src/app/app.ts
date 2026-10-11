// The terminal shell: opening → overview ⇄ section files. Owns routing
// (hash URLs, history), screen transitions, the persistent chrome (caption,
// section line, pager, rail and lime marker, command log, clock), keyboard
// input, preferences and the lazily loaded 3D plates.

import { home, identity, sectionById, sections, type SectionId } from "../content.ts";
import { runBoot, type BootRun } from "../boot/boot.ts";
import type { Plates } from "../three/plates.ts";
import { createHome } from "../screens/home.ts";
import { createProfile } from "../screens/profile.ts";
import { createSkills } from "../screens/skills.ts";
import { createWorks } from "../screens/works.ts";
import { createActivity } from "../screens/activity.ts";
import { createContact } from "../screens/contact.ts";
import { createSystem } from "../screens/system.ts";
import type { ScreenContext, ScreenId, ScreenModule } from "../screens/types.ts";
import { Prefs } from "./settings.ts";
import { typeText } from "./fx.ts";

const ORDER: ScreenId[] = ["home", ...sections.map((s) => s.id)];
const ALIAS: Record<string, ScreenId> = {
  "": "home",
  top: "home",
  home: "home",
  menu: "home",
  main: "home",
  research: "skills",
  projects: "works",
  calendar: "activity",
  log: "activity",
};
const LEAVE_MS = 260;
const ENTER_MS = 1500;
const BOOTED_KEY = "rl.booted";

function screenFromHash(hash: string): ScreenId | null {
  const h = decodeURIComponent(hash.replace(/^#/, "")).toLowerCase();
  if (h in ALIAS) return ALIAS[h];
  return (ORDER as string[]).includes(h) ? (h as ScreenId) : null;
}

export class App {
  private html = document.documentElement;
  private prefs = new Prefs();
  private modules: Record<ScreenId, ScreenModule> = {
    home: createHome(),
    profile: createProfile(),
    skills: createSkills(),
    works: createWorks(),
    activity: createActivity(),
    contact: createContact(),
    system: createSystem(),
  };
  private roots = {} as Record<ScreenId, HTMLElement>;
  private entered = new Set<ScreenId>();
  private current: ScreenId | null = null;
  private plates: Plates | null = null;
  private platesLoading = false;
  private boot: BootRun | null = null;
  private cancelCaption: () => void = () => {};
  private toastTimer = 0;
  private leaveTimer = 0;
  private enterTimers = new Map<ScreenId, number>();
  private clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: identity.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  constructor(private canvas: HTMLCanvasElement | null) {}

  async init() {
    for (const id of ORDER) {
      const el = document.querySelector<HTMLElement>(`[data-screen="${id}"]`);
      if (!el) throw new Error(`missing screen ${id}`);
      if (!el.hasAttribute("tabindex")) el.tabIndex = -1;
      this.roots[id] = el;
      el.querySelectorAll<HTMLElement>("[data-reveal]").forEach((r, i) => r.style.setProperty("--i", String(i)));
    }
    const ctx = this.context();
    for (const id of ORDER) this.modules[id].init(this.roots[id], ctx);

    this.applyPrefs();
    this.prefs.on(() => this.applyPrefs());
    this.bindInput();
    this.startClock();

    const first = screenFromHash(location.hash) ?? "home";
    const deepLink = first !== "home";
    let seen = false;
    try {
      seen = sessionStorage.getItem(BOOTED_KEY) === "1";
      sessionStorage.setItem(BOOTED_KEY, "1");
    } catch {
      /* storage unavailable */
    }

    void this.loadPlates(first);
    await this.playBoot({ reduced: this.prefs.reduced() || deepLink, short: seen });
    this.show(first, { initial: true });
  }

  // ───────── opening ─────────

  private async playBoot(o: { reduced: boolean; short: boolean }) {
    const root = document.querySelector<HTMLElement>("[data-boot]");
    if (!root) return;
    this.html.classList.add("is-booting");
    root.hidden = false;
    this.boot = runBoot(root, {
      reduced: o.reduced,
      short: o.short,
      onPhase: (p) => {
        if (p === "welcome") this.plates?.setFormation("hidden", { immediate: true });
        if (p === "exit") {
          this.html.classList.remove("is-booting");
          this.plates?.setFormation(this.current && this.current !== "home" ? "chain" : "infinity");
        }
      },
    });
    await this.boot.finished;
    this.boot = null;
    root.hidden = true;
    this.html.classList.remove("is-booting");
  }

  private async replayBoot() {
    if (this.boot) return;
    const target = this.current ?? "home";
    await this.playBoot({ reduced: false, short: false });
    if (target !== "home") this.navigate("home");
    else this.plates?.setFormation("infinity");
  }

  // ───────── screens ─────────

  private context(): ScreenContext {
    return {
      prefs: this.prefs,
      reduced: () => this.prefs.reduced(),
      go: (id) => this.navigate(id),
      toast: (m) => this.toast(m),
      log: (l) => this.log(l),
      caption: (t) => this.caption(t),
      plates: () => this.plates,
      replayBoot: () => void this.replayBoot(),
    };
  }

  /** User navigation: update history, then show. */
  navigate(id: ScreenId) {
    if (id === this.current) return;
    const url = id === "home" ? location.pathname + location.search : `#${id}`;
    history.pushState({ screen: id }, "", url);
    this.show(id, { focus: true });
  }

  private show(id: ScreenId, o: { initial?: boolean; focus?: boolean } = {}) {
    if (id === this.current) return;
    const prev = this.current;
    const reduced = this.prefs.reduced();
    const next = this.roots[id];
    this.current = id;

    // outgoing screen
    if (prev) {
      const out = this.roots[prev];
      this.modules[prev].leave?.();
      clearTimeout(this.leaveTimer);
      for (const el of Object.values(this.roots)) if (el !== out) el.classList.remove("is-leaving");
      out.classList.remove("is-entering");
      if (reduced) out.classList.remove("is-active");
      else {
        out.classList.add("is-leaving");
        this.leaveTimer = window.setTimeout(() => {
          out.classList.remove("is-active", "is-leaving");
        }, LEAVE_MS);
      }
    }

    // chrome
    this.html.dataset.view = id === "home" ? "home" : "sect";
    this.html.dataset.screen = id;
    const s = id === "home" ? null : sectionById[id as SectionId];
    document.title = s ? `${s.label} · ${identity.name}` : `${identity.name} · Analysis OS`;
    this.setText("[data-foot-sect]", s ? s.section : "OVERVIEW");
    this.setText("[data-rail-note]", s ? s.note : sections[0].note);
    for (const a of document.querySelectorAll<HTMLElement>("[data-pager], [data-nav]")) {
      const on = (a.dataset.pager ?? a.dataset.nav) === id;
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    }
    this.caption(s ? s.caption : home.caption, o.initial);
    if (s) this.log(`> ACCESS ${s.code}`);
    else if (!o.initial) this.log("> RETURN TO OVERVIEW");

    // incoming screen
    const delay = prev && !reduced ? LEAVE_MS * 0.6 : 0;
    const enter = () => {
      next.classList.remove("is-leaving");
      next.classList.add("is-active");
      if (!reduced) {
        next.classList.add("is-entering");
        clearTimeout(this.enterTimers.get(id));
        this.enterTimers.set(
          id,
          window.setTimeout(() => next.classList.remove("is-entering"), ENTER_MS),
        );
      }
      if (next.scrollTop) next.scrollTop = 0;
      const first = !this.entered.has(id);
      this.entered.add(id);
      this.modules[id].enter?.(prev, first);
      this.placeMarker();
      if (o.focus) next.focus({ preventScroll: true });
    };
    if (delay) window.setTimeout(enter, delay);
    else enter();

    // 3D
    if (this.plates) {
      this.plates.setFormation(id === "home" ? "infinity" : "chain", { immediate: o.initial && reduced });
      if (prev) this.plates.pulse();
    }
  }

  private step(d: number) {
    const list = sections.map((s) => s.id) as ScreenId[];
    const i = this.current && this.current !== "home" ? list.indexOf(this.current) : d > 0 ? -1 : list.length;
    this.navigate(list[(i + d + list.length) % list.length]);
  }

  // ───────── chrome ─────────

  private setText(sel: string, text: string) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el && el.textContent !== text) el.textContent = text;
  }

  private caption(text: string, instant = false) {
    const el = document.querySelector<HTMLElement>("[data-caption-text]");
    if (!el) return;
    this.cancelCaption();
    this.cancelCaption = typeText(el, text, { cps: 30, instant: instant || this.prefs.reduced(), delay: 180 });
  }

  private log(line: string) {
    const ol = document.querySelector<HTMLOListElement>("[data-log]");
    if (!ol) return;
    const li = document.createElement("li");
    li.textContent = line;
    ol.append(li);
    while (ol.children.length > 6) ol.firstElementChild?.remove();
  }

  private toast(message: string) {
    const el = document.querySelector<HTMLElement>("[data-toast]");
    if (!el) return;
    el.textContent = message;
    el.classList.add("is-on");
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove("is-on"), 2200);
  }

  /** Slide the lime marker on the rule to the current rail entry. */
  private placeMarker() {
    const mark = document.querySelector<HTMLElement>("[data-rule-mark]");
    const a = this.current && document.querySelector<HTMLElement>(`[data-nav="${this.current}"]`);
    if (!mark || !a) return;
    const r = a.getBoundingClientRect();
    if (r.height) mark.style.setProperty("--mark-y", `${(r.top + r.height / 2).toFixed(1)}px`);
  }

  private startClock() {
    const el = document.querySelector<HTMLElement>("[data-clock]");
    if (!el) return;
    const tick = () => {
      el.textContent = `${identity.homebase.toUpperCase()} ${this.clockFmt.format(new Date())}`;
    };
    tick();
    window.setInterval(tick, 1000);
  }

  // ───────── preferences & 3D ─────────

  private applyPrefs() {
    const theme = this.prefs.theme();
    const reduced = this.prefs.reduced();
    this.html.dataset.theme = theme;
    this.html.dataset.motion = reduced ? "reduced" : "full";
    const three = this.prefs.get().three;
    if (this.plates) {
      if (three === "off") {
        this.plates.dispose();
        this.plates = null;
        this.html.classList.remove("gl-on");
        if (this.current) this.modules[this.current].resize?.();
      } else {
        this.plates.setTheme(theme);
        this.plates.setReduced(reduced);
        this.plates.setQuality(three);
      }
    } else if (three !== "off" && this.current) {
      void this.loadPlates(this.current);
    }
  }

  private async loadPlates(target: ScreenId) {
    const three = this.prefs.get().three;
    if (!this.canvas || three === "off" || this.plates || this.platesLoading) return;
    this.platesLoading = true;
    try {
      const { createPlates } = await import("../three/plates.ts");
      const p = await createPlates(this.canvas, { theme: this.prefs.theme(), reduced: this.prefs.reduced(), quality: three });
      if (this.prefs.get().three === "off") {
        p.dispose();
        return;
      }
      this.plates = p;
      const at = this.current ?? target;
      p.setFormation(this.boot ? "hidden" : at === "home" ? "infinity" : "chain", { immediate: true });
      if (!this.boot && at === "home") p.setFormation("infinity");
      this.html.classList.add("gl-on");
      if (this.current) this.modules[this.current].resize?.();
    } catch (e) {
      console.warn("[plates] 3D unavailable:", e);
      this.plates = null;
      this.html.classList.remove("gl-on");
    } finally {
      this.platesLoading = false;
    }
  }

  // ───────── input ─────────

  private bindInput() {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = screenFromHash(a.getAttribute("href")!);
      if (!id) return;
      e.preventDefault();
      this.navigate(id);
    });

    addEventListener("popstate", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }));
    addEventListener("hashchange", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }));

    document.addEventListener("keydown", (e) => {
      if (this.boot) {
        if (!["Shift", "Control", "Alt", "Meta", "Tab"].includes(e.key)) this.boot.skip();
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) {
        if (e.key === "Escape") t.blur();
        return;
      }
      if (this.current && this.modules[this.current].key?.(e)) {
        e.preventDefault();
        return;
      }
      const k = e.key;
      if ((k === "Escape" || k === "Backspace") && this.current !== "home") this.navigate("home");
      else if (k === "ArrowRight" || k === "e" || k === "E" || k === "]") this.step(1);
      else if (k === "ArrowLeft" || k === "q" || k === "Q" || k === "[") this.step(-1);
      else if (/^[1-6]$/.test(k)) this.navigate(sections[Number(k) - 1].id);
      else if (k === "0" || k === "h" || k === "H") this.navigate("home");
      else return;
      e.preventDefault();
    });

    const skipBoot = () => this.boot?.skip();
    document.addEventListener("pointerdown", skipBoot);

    addEventListener(
      "pointermove",
      (e) => {
        this.plates?.setPointer((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
      },
      { passive: true },
    );

    let resizeRaf = 0;
    addEventListener("resize", () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        this.plates?.resize();
        this.placeMarker();
        if (this.current) this.modules[this.current].resize?.();
      });
    });
  }
}
