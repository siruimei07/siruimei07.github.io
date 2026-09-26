import "@fontsource/shippori-mincho-b1/600.css";
import "@fontsource/shippori-mincho-b1/800.css";
import "@fontsource/noto-serif-sc/600.css";
import "@fontsource/noto-serif-sc/700.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource/cormorant-garamond/500-italic.css";
import "./styles/main.css";
import * as THREE from "three";
import { avatarLines, moonLines, skills } from "./content.ts";
import { AudioEngine } from "./ui/audio.ts";
import { setupMagnetic, setupReveals, setupTilt } from "./ui/effects.ts";
import { globals } from "./world/globals.ts";
import type { SceneApi, Target } from "./world/scene.ts";
import type { World } from "./world/World.ts";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const root = document.documentElement;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const mobile = !finePointer && Math.min(screen.width, screen.height) < 820;
const audio = new AudioEngine();

const store = {
  get(k: string) {
    try {
      return localStorage.getItem(`tsukuyomi:${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`tsukuyomi:${k}`, v);
    } catch {
      /* private mode: preference simply isn't remembered */
    }
  },
};

// ───────────── Loader ─────────────

const loader = {
  el: $("#loader"),
  set(p: number, text?: string) {
    $("#loader-bar")?.style.setProperty("transform", `scaleX(${p.toFixed(3)})`);
    const pct = $("#loader-pct");
    if (pct) pct.textContent = `${Math.round(p * 100)}%`;
    const t = $("#loader-text");
    if (text && t) t.textContent = text;
  },
  ready(onDive: (sound: boolean) => void) {
    this.set(1, "准备好了");
    this.el?.classList.add("is-ready");
    const saved = store.get("sound");
    const primary = this.el?.querySelector<HTMLButtonElement>(saved === "off" ? '[data-dive="mute"]' : '[data-dive="sound"]');
    primary?.focus({ preventScroll: true });
    let done = false;
    const go = (sound: boolean) => {
      if (done) return;
      done = true;
      onDive(sound);
    };
    this.el?.querySelectorAll<HTMLButtonElement>("[data-dive]").forEach((b) =>
      b.addEventListener("click", () => go(b.dataset.dive === "sound")),
    );
  },
  leave() {
    this.el?.classList.add("is-leaving");
    setTimeout(() => this.el?.remove(), 900);
  },
};

// ───────────── Scroll → camera ─────────────

const sections = [...document.querySelectorAll<HTMLElement>("[data-section]")];
const railLinks = [...document.querySelectorAll<HTMLAnchorElement>("[data-rail]")];
let anchors: number[] = [];

function computeAnchors() {
  const vh = innerHeight;
  const max = Math.max(0, root.scrollHeight - vh);
  // A section's resting scroll position: centred when it fits the viewport
  // (or is built to be centred on wide screens), otherwise top-aligned.
  const narrow = innerWidth <= 860;
  anchors = sections.map((el, i) => {
    if (i === 0) return 0;
    const r = el.getBoundingClientRect();
    const top = r.top + scrollY;
    const tall = r.height > vh * 1.05 && (narrow || !el.dataset.center);
    const rest = tall ? top : top + r.height / 2 - vh / 2;
    return Math.min(max, Math.max(0, rest));
  });
  for (let i = 1; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
}

function scrollToSection(y: number) {
  if (y <= anchors[0]) return 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    if (y < anchors[i + 1]) return i + (y - anchors[i]) / (anchors[i + 1] - anchors[i]);
  }
  return anchors.length - 1;
}

function goToSection(i: number) {
  const idx = Math.max(0, Math.min(anchors.length - 1, i));
  window.scrollTo({ top: anchors[idx], behavior: reduced ? "auto" : "smooth" });
}

let activeSection = -1;
function onScroll(world: World | null) {
  const s = scrollToSection(scrollY);
  world?.setScroll(s);
  const fill = $("#rail-fill");
  if (fill) fill.style.transform = `scaleY(${s / (anchors.length - 1)})`;
  root.classList.toggle("at-hero", s < 0.45);
  const active = Math.round(s);
  if (active !== activeSection) {
    activeSection = active;
    railLinks.forEach((a, i) => a.classList.toggle("is-active", i === active));
    if (root.classList.contains("is-live")) audio.whoosh();
  }
}

// ───────────── HUD ─────────────

// The twelve traditional two-hour periods, 子の刻 centred on midnight.
const JIKOKU = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
function startClock() {
  const clock = $("#clock");
  const jihou = $("#jihou");
  const tick = () => {
    const d = new Date();
    if (clock) clock.textContent = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
    if (jihou) jihou.textContent = `${JIKOKU[Math.floor(((d.getHours() + 1) % 24) / 2)]}の刻`;
  };
  tick();
  setInterval(tick, 15000);
}

function setSoundUi(on: boolean) {
  const b = $("#sound");
  b?.setAttribute("aria-pressed", String(on));
  const l = $("#sound-label");
  if (l) l.textContent = on ? "音 · 开" : "音 · 关";
}

async function setSound(on: boolean) {
  store.set("sound", on ? "on" : "off");
  setSoundUi(on);
  if (on) await audio.enable().catch(() => setSoundUi(false));
  else audio.disable();
}

// ───────────── Speech bubble ─────────────

const bubble = {
  el: $("#bubble"),
  anchor: null as THREE.Vector3 | null,
  screen: { x: 0, y: 0 },
  timer: 0,
  show(text: string, anchor: THREE.Vector3 | { x: number; y: number }) {
    if (!this.el) return;
    this.el.textContent = text;
    if (anchor instanceof THREE.Vector3) this.anchor = anchor;
    else {
      this.anchor = null;
      this.screen = anchor;
      this.place(anchor.x, anchor.y - 24);
    }
    this.el.classList.add("is-on");
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.el?.classList.remove("is-on"), 2800);
  },
  place(x: number, y: number) {
    this.el?.style.setProperty("--x", `${Math.round(x)}px`);
    this.el?.style.setProperty("--y", `${Math.round(y)}px`);
  },
  update(camera: THREE.Camera) {
    if (!this.anchor || !this.el?.classList.contains("is-on")) return;
    const p = this.anchor.clone().add(new THREE.Vector3(0, 3.2, 0)).project(camera);
    this.place((p.x * 0.5 + 0.5) * innerWidth, (-p.y * 0.5 + 0.5) * innerHeight);
  },
};
const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

// ───────────── Cursor ─────────────

const cursor = {
  el: $(".cursor"),
  dot: $(".cursor__dot"),
  ring: $(".cursor__ring"),
  label: $(".cursor__label"),
  x: innerWidth / 2,
  y: innerHeight / 2,
  rx: innerWidth / 2,
  ry: innerHeight / 2,
  set(hover: boolean, label = "") {
    this.el?.classList.toggle("is-hover", hover);
    this.el?.classList.toggle("is-labelled", !!label);
    if (this.label && this.label.textContent !== label) this.label.textContent = label;
  },
  frame(dt: number) {
    if (!this.el) return;
    const k = 1 - Math.exp(-dt * 18);
    this.rx += (this.x - this.rx) * k;
    this.ry += (this.y - this.ry) * k;
    if (this.dot) this.dot.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(45deg)`;
    if (this.ring) this.ring.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
  },
};

const INTERACTIVE = "a, button, textarea, input, label, [data-tilt]";
const CONTENT = ".panel, .skill, .work, .contact, .hero, .activity, .hud-top, .rail, .foot, .sec-head, .skills-lead";
const LABELS: Record<Target, string> = { avatar: "你好", moon: "月", sky: "花火", water: "波纹" };

// ───────────── Boot ─────────────

function supportsWebGL2() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

async function boot() {
  startClock();
  const reveals = setupReveals(reduced);
  setupTilt(reduced);
  setupMagnetic(reduced);
  if (finePointer) root.classList.add("has-cursor");
  computeAnchors();
  setSoundUi(false);

  let world: World | null = null;
  let api: SceneApi | null = null;

  if (!supportsWebGL2()) {
    root.classList.add("no-webgl");
    loader.set(1, "WebGL2 不可用 · 以静态模式进入");
  } else {
    try {
      loader.set(0.08, "即将启程…");
      await Promise.race([
        Promise.all([
          document.fonts.load('800 64px "Shippori Mincho B1"', "月読統経量酒寄彩葉"),
          document.fonts.load('500 52px "Cormorant Garamond"', "SAKAYORI IROHA"),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ]).catch(() => undefined);
      loader.set(0.22, "ワールド生成中…");
      const [{ World }, { buildScene }] = await Promise.all([import("./world/World.ts"), import("./world/scene.ts")]);
      const canvas = $<HTMLCanvasElement>("#gl")!;
      world = new World(canvas, {
        reducedMotion: reduced,
        mobile,
        events: {
          onStats(fps, tier, auto) {
            const f = $("#fps");
            if (f) f.textContent = String(Math.round(Math.min(fps, 999)));
            const q = $("#quality-label");
            if (q) q.textContent = (auto ? `auto·${tier}` : tier).toLowerCase();
          },
          onArrive() {
            api?.arrive();
            audio.arrive();
          },
        },
      });
      loader.set(0.4, "即将启程…");
      const texture = await new THREE.TextureLoader().loadAsync("/assets/avatar.webp");
      loader.set(0.55, "即将启程…");
      api = buildScene(
        world,
        texture,
        skills.map((s) => s.lantern),
        {
          onBurst: (k) => audio.burst(k),
          onLaunch: () => audio.launch(),
          onGate: (entering) => audio.chime(entering),
        },
      );
      loader.set(0.72, "即将启程…");
      onScroll(world);
      await world.warmUp();
      world.start();
      loader.set(0.95, "即将启程…");
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      console.error(err);
      root.classList.add("no-webgl");
      world = null;
      api = null;
    }
  }

  const gpuNote = $("#gpu-note");
  if (gpuNote) gpuNote.textContent = world ? "adaptive quality · 2K / 60 FPS target" : "static mode";

  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    root.classList.add("is-live");
    reveals.revealNow($("#login")!);
  };
  loader.ready(async (sound) => {
    if (sound) await setSound(true);
    else store.set("sound", "off");
    audio.dive();
    if (world) {
      root.classList.add("is-intro");
      world.startIntro();
    } else reveal();
    loader.leave();
  });
  // Any click, wheel, touch or key during the entry sequence fast-forwards it.
  const skip = () => {
    if (world && !world.introDone && world.introTime >= 0) world.skipIntro();
  };
  for (const type of ["pointerdown", "wheel", "touchstart", "keydown"]) addEventListener(type, skip, { passive: true });

  // HUD controls.
  $("#sound")?.addEventListener("click", () => void setSound(!audio.enabled));
  $("#quality")?.addEventListener("click", () => world?.cycleQuality());
  railLinks.forEach((a, i) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      goToSection(i);
    }),
  );
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]:not([data-rail])').forEach((a) =>
    a.addEventListener("click", (e) => {
      const i = sections.findIndex((s) => `#${s.id}` === a.getAttribute("href"));
      if (i < 0) return;
      e.preventDefault();
      goToSection(i);
    }),
  );
  addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("textarea, input")) return;
    if (!root.classList.contains("is-live")) return;
    if (e.key === "PageDown" || e.key === "ArrowDown") {
      e.preventDefault();
      goToSection(Math.round(scrollToSection(scrollY)) + 1);
    } else if (e.key === "PageUp" || e.key === "ArrowUp") {
      e.preventDefault();
      goToSection(Math.round(scrollToSection(scrollY)) - 1);
    }
  });

  // Scroll + resize.
  addEventListener("scroll", () => onScroll(world), { passive: true });
  let resizeRaf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      world?.resize();
      computeAnchors();
      onScroll(world);
    });
  });
  new ResizeObserver(() => {
    computeAnchors();
    onScroll(world);
  }).observe(document.body);

  // Pointer routing between the DOM and the 3D world.
  const ndc = new THREE.Vector2();
  let overContent = false;
  let hoverTarget: Target | null = null;
  let pendingHover = false;
  addEventListener(
    "pointermove",
    (e) => {
      cursor.x = e.clientX;
      cursor.y = e.clientY;
      ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      world?.setPointer(ndc.x, ndc.y, e.pointerType !== "touch" || e.buttons > 0);
      const t = e.target as HTMLElement;
      const interactive = !!t.closest?.(INTERACTIVE);
      overContent = !!t.closest?.(CONTENT);
      if (interactive || overContent) {
        cursor.set(interactive);
        hoverTarget = null;
      } else pendingHover = true;
    },
    { passive: true },
  );
  addEventListener("pointerout", (e) => {
    if (!e.relatedTarget) world?.setPointer(ndc.x, ndc.y, false);
  });
  addEventListener("pointerdown", (e) => {
    cursor.el?.classList.add("is-down");
    if (!api || !world || !root.classList.contains("is-live")) return;
    const t = e.target as HTMLElement;
    if (t.closest(INTERACTIVE) || t.closest(CONTENT)) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    world.setPointer(ndc.x, ndc.y, true);
    const hit = api.click(ndc);
    if (hit === "avatar") {
      audio.sparkle();
      bubble.show(pick(avatarLines), api.avatar.worldCenter);
    } else if (hit === "moon") {
      audio.lantern();
      bubble.show(pick(moonLines), { x: e.clientX, y: e.clientY });
    } else if (hit === "water") audio.ripple();
  });
  addEventListener("pointerup", () => cursor.el?.classList.remove("is-down"));
  addEventListener("pointercancel", () => world?.setPointer(ndc.x, ndc.y, false));
  document.querySelectorAll<HTMLElement>("a, button").forEach((el) => el.addEventListener("pointerenter", () => audio.hover()));

  // Hovering an expertise card brightens its lantern on the water.
  document.querySelectorAll<HTMLElement>("[data-skill]").forEach((card) => {
    const i = Number(card.dataset.skill);
    card.addEventListener("pointerenter", () => api?.setSkill(i));
    card.addEventListener("pointerleave", () => api?.setSkill(-1));
    card.addEventListener("focusin", () => api?.setSkill(i));
    card.addEventListener("focusout", () => api?.setSkill(-1));
  });

  // Contact: wish lantern, mail link, copy e-mail.
  const form = $<HTMLFormElement>("#wish");
  const text = $<HTMLTextAreaElement>("#wish-text");
  const mail = $<HTMLAnchorElement>("#wish-mail");
  const status = $("#wish-status");
  const updateMail = () => {
    if (!form || !mail) return;
    const body = text?.value.trim() ?? "";
    const subject = encodeURIComponent(form.dataset.subject ?? "");
    mail.href = `mailto:${form.dataset.email}?subject=${subject}${body ? `&body=${encodeURIComponent(body)}` : ""}`;
  };
  text?.addEventListener("input", updateMail);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    api?.launchWish();
    audio.lantern();
    if (status) status.textContent = text?.value.trim() ? "灯笼已放飞 ✦ 想让我收到这封信，就点「用邮件寄出」吧。" : "灯笼已放飞 ✦ 愿望正飞向月亮。";
  });
  const copy = $<HTMLButtonElement>("#copy-email");
  copy?.addEventListener("click", async () => {
    const small = copy.querySelector("small");
    try {
      await navigator.clipboard.writeText(copy.dataset.email ?? "");
      if (small) small.textContent = "已复制 ✓";
      copy.classList.add("is-copied");
    } catch {
      location.href = `mailto:${copy.dataset.email}`;
    }
    setTimeout(() => {
      if (small) small.textContent = "邮箱 · 点击复制";
      copy.classList.remove("is-copied");
    }, 2200);
  });

  // Audio beat drives the scene's pulse; without audio a silent clock does.
  audio.onBeat = (s) => {
    globals.uBeat.value = Math.max(globals.uBeat.value, s * 0.9);
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && audio.enabled) audio.disable();
    else if (!document.hidden && store.get("sound") === "on" && root.classList.contains("is-live")) void audio.enable();
  });

  // UI frame loop: cursor easing, 3D hover probing (once per frame), bubble.
  let last = performance.now();
  let lastBeat = -1;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    cursor.frame(dt);
    if (world && world.introTime >= 0) {
      if (world.introTime >= world.revealAt) reveal();
      if (world.introDone) root.classList.remove("is-intro");
    }
    if (world && api) {
      if (pendingHover && !overContent) {
        pendingHover = false;
        const t = api.hover(ndc);
        if (t !== hoverTarget) {
          hoverTarget = t;
          const special = t === "avatar" || t === "moon";
          cursor.set(special, LABELS[t]);
          if (special) audio.hover();
        }
      }
      bubble.update(world.camera);
      if (!audio.enabled) {
        const beat = Math.floor(now / 1000);
        if (beat !== lastBeat) {
          lastBeat = beat;
          globals.uBeat.value = Math.max(globals.uBeat.value, beat % 4 === 0 ? 0.55 : 0.25);
        }
      }
    }
  };
  requestAnimationFrame(frame);

  Object.assign(window, { __tsukuyomi: { world, api } });
}

void boot();
