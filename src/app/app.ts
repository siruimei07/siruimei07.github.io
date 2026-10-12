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
// #main is the skip link's target, handled on its own (it is not a screen)
const ALIAS: Record<string, ScreenId> = {
  "": "home",
  top: "home",
  home: "home",
  menu: "home",
  research: "skills",
  projects: "works",
  calendar: "activity",
  log: "activity",
};
const LEAVE_MS = 260;
const ENTER_MS = 1500;
const BOOTED_KEY = "rl.booted";

function screenFromHash(hash: string): ScreenId | null {
  let h = hash.replace(/^#/, "");
  try {
    h = decodeURIComponent(h);
  } catch {
    /* malformed escape: keep it raw, it matches nothing */
  }
  h = h.toLowerCase();
  // own keys only: "#constructor" must not find Object.prototype
  if (Object.hasOwn(ALIAS, h)) return ALIAS[h];
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
  /** The screen whose module enter() has run without a leave() yet. */
  private live: ScreenId | null = null;
  private plates: Plates | null = null;
  private platesLoading = false;
  private boot: BootRun | null = null;
  private cancelCaption: () => void = () => {};
  private toastTimer = 0;
  private enterDelay = 0;
  private leaveTimers = new Map<ScreenId, number>();
  private enterTimers = new Map<ScreenId, number>();
  /** Aborted if init fails, so the plain fallback page keeps no handlers. */
  private ac = new AbortController();
  private clockFmt = new Intl.DateTimeFormat("en-GB", { timeZone: identity.timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  constructor(private canvas: HTMLCanvasElement | null) {}

  async init() {
    try {
      await this.start();
    } catch (e) {
      this.ac.abort();
      throw e;
    }
  }

  private async start() {
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
    const offPrefs = this.prefs.on(() => this.applyPrefs());
    this.ac.signal.addEventListener("abort", () => {
      offPrefs();
      this.plates?.dispose();
      this.plates = null;
      this.html.classList.remove("gl-on");
    });
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

    // the 3D's first frames are long tasks: they wait for a still moment of the opening ("idle")
    const hadFocus = await this.playBoot({ reduced: this.prefs.reduced() || deepLink, short: seen, onIdle: () => void this.loadPlates(first) });
    void this.loadPlates(first);
    // a click during the exit fade may already have opened a screen
    if (this.current === null) this.show(first, { initial: true });
    // a deep link lands in its section, so the arrow keys scroll it straight away (phones)
    if (hadFocus || (deepLink && document.activeElement === document.body)) this.roots[this.current ?? first].focus({ preventScroll: true });
  }

  // ───────── opening ─────────

  /** Plays the opening. Resolves to whether it held keyboard focus (SKIP) at the end. */
  private async playBoot(o: { reduced: boolean; short: boolean; onIdle?: () => void; onWelcome?: () => void }): Promise<boolean> {
    const root = document.querySelector<HTMLElement>("[data-boot]");
    if (!root) return false;
    this.html.classList.add("is-booting");
    root.hidden = false;
    // Did keyboard focus go into the opening (SKIP)? SKIP hides itself before the
    // end, which can drop focus to <body> on its own, so track it as it moves.
    let held = false;
    const watch = new AbortController();
    root.addEventListener("focusin", () => (held = true), { signal: watch.signal });
    root.addEventListener("focusout", (e) => (held = !e.relatedTarget || root.contains(e.relatedTarget as Node)), { signal: watch.signal });
    let welcomed = false;
    const welcome = () => {
      if (welcomed) return;
      welcomed = true;
      o.onWelcome?.();
    };
    this.boot = runBoot(root, {
      reduced: o.reduced,
      short: o.short,
      onPhase: (p) => {
        if (p === "idle") o.onIdle?.();
        if (p === "welcome") {
          welcome();
          this.plates?.setFormation("hidden", { immediate: true });
        }
        if (p === "exit") {
          // a reduced run has no welcome beat
          welcome();
          this.html.classList.remove("is-booting");
          this.plates?.setFormation(this.current && this.current !== "home" ? "chain" : "infinity");
        }
      },
    });
    await this.boot.finished;
    this.boot = null;
    watch.abort();
    const a = document.activeElement;
    const hadFocus = held && (!a || a === document.body || root.contains(a));
    root.hidden = true;
    this.html.classList.remove("is-booting");
    return hadFocus;
  }

  private async replayBoot() {
    if (this.boot) return;
    const target = this.current ?? "home";
    await this.playBoot({
      reduced: this.prefs.reduced(),
      short: false,
      // while the welcome card covers everything, swap the section beneath it for the overview
      onWelcome: () => {
        if (this.current !== target || target === "home") return;
        history.pushState({ screen: "home" }, "", location.pathname + location.search);
        this.show("home", { initial: true });
      },
    });
    // the REPLAY button that had focus left with its screen
    this.roots[this.current ?? "home"].focus({ preventScroll: true });
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
    const fromOverview = this.html.dataset.view !== "sect";
    this.current = id;

    // A quick second navigation overtakes the first: its delayed entry is
    // dropped, and enter()/leave() stay paired because only a screen that
    // actually entered is told to leave.
    clearTimeout(this.enterDelay);
    if (this.live) {
      this.modules[this.live].leave?.();
      this.live = null;
    }

    // every other visible screen fades out (one already fading keeps its own timer)
    for (const sid of ORDER) {
      if (sid === id) continue;
      const el = this.roots[sid];
      clearTimeout(this.enterTimers.get(sid));
      el.classList.remove("is-entering");
      if (!el.classList.contains("is-active")) {
        el.classList.remove("is-leaving");
      } else if (reduced) {
        clearTimeout(this.leaveTimers.get(sid));
        el.classList.remove("is-active", "is-leaving");
      } else if (!el.classList.contains("is-leaving")) {
        el.classList.add("is-leaving");
        this.leaveTimers.set(
          sid,
          window.setTimeout(() => el.classList.remove("is-active", "is-leaving"), LEAVE_MS),
        );
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
    // the incoming screen is laid out while still hidden, so the marker can move with the rail
    this.placeMarker(fromOverview);
    this.revealTab(id);
    this.caption(s ? s.caption : home.caption, o.initial);
    if (s) this.log(`> ACCESS ${s.code}`);
    else if (!o.initial) this.log("> RETURN TO OVERVIEW");

    // incoming screen
    const delay = prev && !reduced ? LEAVE_MS * 0.6 : 0;
    const enter = () => {
      if (this.current !== id) return;
      // coming straight back to a screen that is still fading out: keep it (only
      // now, so an entry that is overtaken still lets that fade finish)
      clearTimeout(this.leaveTimers.get(id));
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
      this.live = id;
      this.modules[id].enter?.(prev, first);
      if (o.focus) next.focus({ preventScroll: true });
    };
    if (delay) this.enterDelay = window.setTimeout(enter, delay);
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
    // screen readers get the whole line once; the typed copy is aria-hidden
    this.setText("[data-caption-say]", text);
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

  /** Slide the lime marker on the rule to the current rail entry, staying clear of the SECTION tab. */
  private placeMarker(instant = false) {
    const mark = document.querySelector<HTMLElement>("[data-rule-mark]");
    const id = this.current;
    const a = id && document.querySelector<HTMLElement>(`[data-nav="${id}"]`);
    if (!mark || !id || !a) return;
    const r = a.getBoundingClientRect();
    if (!r.height) return;
    let y = r.top + r.height / 2;
    // the tab crosses the rule; the marker sits above it, never behind it
    const tab = this.roots[id].querySelector(".sect__tab")?.getBoundingClientRect();
    if (tab?.height) y = Math.min(y, tab.top - mark.offsetHeight / 2 - 6);
    // arriving from the overview the marker is hidden: put it in place, then fade it in there
    if (instant) mark.style.transitionProperty = "opacity";
    mark.style.setProperty("--mark-y", `${y.toFixed(1)}px`);
    if (instant) {
      void mark.offsetWidth;
      mark.style.removeProperty("transition-property");
    }
  }

  /** Phone tab bar: scroll the current tab into view if the bar is too narrow for all six. */
  private revealTab(id: ScreenId) {
    const a = document.querySelector<HTMLElement>(`[data-nav="${id}"]`);
    const bar = a?.closest<HTMLElement>(".rail__nav");
    if (!a || !bar || bar.scrollWidth <= bar.clientWidth) return;
    const r = a.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    if (r.left < b.left) bar.scrollLeft -= b.left - r.left;
    else if (r.right > b.right) bar.scrollLeft += r.right - b.right;
  }

  private startClock() {
    const el = document.querySelector<HTMLElement>("[data-clock]");
    if (!el) return;
    const tick = () => {
      el.textContent = `${identity.homebase.toUpperCase()} ${this.clockFmt.format(new Date())}`;
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    this.ac.signal.addEventListener("abort", () => clearInterval(timer));
  }

  // ───────── preferences & 3D ─────────

  private applyPrefs() {
    const theme = this.prefs.theme();
    const reduced = this.prefs.reduced();
    this.html.dataset.theme = theme;
    this.html.dataset.motion = reduced ? "reduced" : "full";
    // the browser bar follows the theme actually shown, not only the OS one
    const bg = getComputedStyle(this.html).getPropertyValue("--bg").trim();
    if (bg) for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
    const three = this.prefs.get().three;
    if (this.plates) {
      if (three === "off") {
        this.plates.dispose();
        this.plates = null;
        this.html.classList.remove("gl-on");
        this.relayout();
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
      const now = this.prefs.get().three;
      if (now === "off" || this.ac.signal.aborted) {
        p.dispose();
        return;
      }
      this.plates = p;
      // preferences may have changed while the chunk was loading
      p.setQuality(now);
      p.setReduced(this.prefs.reduced());
      p.setTheme(this.prefs.theme());
      const at = this.current ?? target;
      // on the overview the plates fly in; elsewhere (or under the opening) they are simply placed
      p.setFormation(this.boot ? "hidden" : at === "home" ? "infinity" : "chain", { immediate: !!this.boot || at !== "home" });
      this.html.classList.add("gl-on");
      this.relayout();
    } catch (e) {
      console.warn("[plates] 3D unavailable:", e);
      this.plates = null;
      this.html.classList.remove("gl-on");
    } finally {
      this.platesLoading = false;
    }
  }

  /** The current screen re-measures (leader lines follow the 3D or the flat figure). */
  private relayout() {
    if (this.current) this.modules[this.current].resize?.();
  }

  // ───────── input ─────────

  private bindInput() {
    const on = { signal: this.ac.signal };

    document.addEventListener(
      "click",
      (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
        if (!a) return;
        const href = a.getAttribute("href")!;
        // the skip link: into the current screen, whichever it is
        if (href === "#main") {
          e.preventDefault();
          this.roots[this.current ?? "home"].focus({ preventScroll: true });
          return;
        }
        const id = screenFromHash(href);
        if (!id) return;
        e.preventDefault();
        this.navigate(id);
      },
      on,
    );

    addEventListener("popstate", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }), on);
    addEventListener("hashchange", () => this.show(screenFromHash(location.hash) ?? "home", { focus: true }), on);

    const roots = Object.values(this.roots);
    document.addEventListener(
      "keydown",
      (e) => {
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
        // single-key shortcuts only while no control has focus (WCAG 2.1.4); Esc and ←/→ always work
        const idle = t === document.body || t === this.html || roots.includes(t);
        if (k === "Escape" || (k === "Backspace" && idle)) {
          if (this.current === "home") return;
          this.navigate("home");
        } else if (k === "ArrowRight" || (idle && (k === "e" || k === "E" || k === "]"))) this.step(1);
        else if (k === "ArrowLeft" || (idle && (k === "q" || k === "Q" || k === "["))) this.step(-1);
        else if (idle && /^[1-6]$/.test(k)) this.navigate(sections[Number(k) - 1].id);
        else if (idle && (k === "0" || k === "h" || k === "H")) this.navigate("home");
        else return;
        e.preventDefault();
      },
      on,
    );

    document.addEventListener("pointerdown", () => this.boot?.skip(), on);

    addEventListener(
      "pointermove",
      (e) => {
        this.plates?.setPointer((e.clientX / innerWidth) * 2 - 1, 1 - (e.clientY / innerHeight) * 2);
      },
      { passive: true, signal: this.ac.signal },
    );

    // a lost GL context leaves an empty canvas: show the flat ∞ until it comes back
    this.canvas?.addEventListener(
      "webglcontextlost",
      () => {
        this.html.classList.remove("gl-on");
        this.relayout();
      },
      on,
    );
    this.canvas?.addEventListener(
      "webglcontextrestored",
      () => {
        if (!this.plates) return;
        this.html.classList.add("gl-on");
        this.relayout();
      },
      on,
    );

    let resizeRaf = 0;
    addEventListener(
      "resize",
      () => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          this.plates?.resize();
          this.placeMarker();
          this.relayout();
        });
      },
      on,
    );
  }
}
