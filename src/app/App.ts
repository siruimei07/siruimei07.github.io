import * as THREE from "three";
import { menu as menuItems, type MenuId } from "../content";
import { Pipeline } from "../engine/Pipeline";
import { Quality, TIERS, type TierName } from "../engine/Quality";
import type { GitHubSnapshot } from "../github";
import { Boot } from "../ui/Boot";
import { Daybreak } from "../ui/Daybreak";
import { $, $$, blotPoints, circlePoints, clamp01, coverRadius, ease, holeClip, Spring, tween, wait } from "../ui/dom";
import { Hud } from "../ui/Hud";
import { Menu } from "../ui/Menu";
import { calendarCtl, contactCtl, skillsCtl, systemCtl, worksCtl, type Screens } from "../ui/screens";
import { Confetti } from "../world/confetti";
import { FishSchool, type Emblem } from "../world/fish";
import { Shards } from "../world/shards";
import { bakeText } from "../ui/bake";
import { STATIONS, World } from "../world/World";

// Top-level controller: boot → title → day change → the flooded menu ⇄
// screens. Owns the frame loop, input, routing, the post settings per mode,
// the avatar layer and the fish choreography.

type Mode = "boot" | "title" | "busy" | "menu" | "screen";

const params = new URLSearchParams(location.search);
const SCREENS: MenuId[] = ["profile", "skills", "works", "calendar", "contact", "system"];
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(`tsukuyomi3:${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`tsukuyomi3:${k}`, v);
    } catch {
      /* storage may be blocked */
    }
  },
};

type AvatarPose = { x: number; y: number; h: number; rot: number; alpha: number };

export class App {
  readonly quality: Quality;
  pl!: Pipeline;
  world!: World;
  fish!: FishSchool;
  confetti = new Confetti();
  private shards = new Shards();
  private shattering = false;
  private navy = new THREE.Color().setRGB(0x16 / 255, 0x1a / 255, 0x30 / 255, THREE.LinearSRGBColorSpace);
  private boot = new Boot();
  private hud = new Hud();
  private daybreak = new Daybreak();
  private menu = new Menu();
  private screens: Screens = {};
  private title = $("[data-screen=title]")!;
  mode: Mode = "boot";
  current: MenuId | null = null;
  private last = performance.now();
  private frameMs = 16.7;
  private reduced: boolean;
  private prefs: { quality: string; motion: string; fps: string };
  private av = { x: new Spring(0, 7), y: new Spring(0, 7), h: new Spring(0, 7), rot: new Spring(0, 6), alpha: new Spring(0, 9) };
  private moonTrack = false;
  private moonAnchor = new THREE.Vector2();
  private fpsEl = $("[data-fps]");
  private fpsAcc = { t: 0, n: 0 };
  private wheelLock = 0;
  private data: GitHubSnapshot | null = null;
  timeScale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const locked = params.get("q") as TierName | null;
    const savedQ = store.get("quality") ?? "auto";
    this.prefs = {
      quality: savedQ,
      motion: store.get("motion") ?? (matchMedia("(prefers-reduced-motion: reduce)").matches ? "reduced" : "full"),
      fps: store.get("fps") ?? "off",
    };
    const fixed = locked && TIERS.some((t) => t.name === locked) ? locked : savedQ !== "auto" ? (savedQ as TierName) : null;
    this.quality = new Quality("high", fixed);
    this.reduced = this.prefs.motion === "reduced";
    document.documentElement.classList.toggle("reduced-motion", this.reduced);
    document.documentElement.classList.toggle("touch", matchMedia("(pointer: coarse)").matches);
  }

  async init() {
    this.boot.progress(0.08);
    await frame();
    this.data = await fetch("/data/github.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    this.pl = new Pipeline(this.canvas, this.quality.current);
    this.boot.progress(0.25);
    await frame();
    const density = this.quality.current.particles;
    this.world = new World(density);
    this.world.motion = this.reduced ? 0 : 1;
    this.boot.progress(0.55);
    await frame();
    this.fish = new FishSchool(Math.round(520 * Math.max(0.5, density)));
    // the fish swim in display space, over the sea grade (like P3R's UI confetti)
    this.confetti.scene.add(this.fish.mesh);
    this.pl.avatarTexture = await new THREE.TextureLoader().loadAsync("/assets/avatar-cut.webp").catch(() => null);
    if (this.pl.avatarTexture) {
      this.pl.avatarTexture.colorSpace = THREE.NoColorSpace;
      this.pl.avatarTexture.anisotropy = 4;
    }
    this.boot.progress(0.7);
    await Promise.race([document.fonts.ready, wait(2500)]);
    this.resize();
    addEventListener("resize", () => this.resize());
    this.quality.onChange = (t) => {
      this.pl.setTier(t);
      this.resize();
    };
    this.bindScreens();
    this.bindInput();
    // Compile every program once (title grade, the sea, blot) so nothing hitches later.
    this.world.snap("title");
    this.world.update(0.016);
    this.pl.post.water = 1;
    this.pl.post.blotMode = 1;
    this.pl.render(this.world.frame(this.pl));
    this.pl.post.water = 0;
    this.pl.post.blotMode = 0;
    this.boot.progress(1);
    Object.assign(window, { __app: this });
    this.loop();
    await wait(250);
    this.boot.done();
    this.hud.onDarkHour = (dark) => (this.pl.post.dark = dark ? 1 : 0);
    this.hud.refresh();
    this.route(true);
  }

  // ------------------------------------------------------------------ routing

  private hashTarget(): "title" | "menu" | MenuId {
    const h = location.hash.slice(1);
    if (SCREENS.includes(h as MenuId)) return h as MenuId;
    if (h === "menu") return "menu";
    return "title";
  }

  private setHash(h: string) {
    const url = h ? `#${h}` : location.pathname + location.search;
    if ((h ? `#${h}` : "") !== location.hash) history.pushState(null, "", url);
  }

  private async route(first = false) {
    const target = this.hashTarget();
    if (target === "title") {
      if (first || this.mode === "boot") this.enterTitle();
      else if (this.mode === "screen") await this.closeScreen(false).then(() => this.backToTitle(false));
      else if (this.mode === "menu") await this.backToTitle(false);
      return;
    }
    if (target === "menu") {
      if (this.mode === "boot" || this.mode === "title") await this.enterMenu(this.mode === "boot" || first);
      else if (this.mode === "screen") await this.closeScreen(false);
      return;
    }
    // a screen
    if (this.mode === "boot" || this.mode === "title") await this.enterMenu(true, target);
    if (this.mode === "screen" && this.current !== target) await this.closeScreen(false);
    if (this.mode === "menu") {
      this.menu.select(SCREENS.indexOf(target));
      await this.openScreen(target, false);
    }
  }

  // ------------------------------------------------------------------ title

  private enterTitle() {
    this.mode = "title";
    this.current = null;
    this.title.classList.add("is-open");
    this.title.classList.remove("is-leaving");
    this.menu.root.classList.remove("is-open", "is-entering", "is-leaving");
    this.hud.show(true);
    this.world.snap("title");
    const p = this.pl.post;
    p.mono = 0.3;
    p.water = 0;
    p.flood = 0;
    p.fade = 0;
    p.calm = 0;
    p.focus.set(0, 0, 0);
    this.confetti.ambient = 0;
    this.avatarTo({ x: 0.2, y: -0.6, h: 0.9, rot: 168, alpha: 0 }, true);
    this.formTitleRing(true);
    $<HTMLElement>("[data-enter]", this.title)?.addEventListener("click", this.onEnterLink);
  }

  private onEnterLink = (e: Event) => {
    e.preventDefault();
    if (this.mode === "title") this.startGame();
  };

  /** The fish circle the moon on the title. */
  private formTitleRing(instant = false) {
    const m = this.moonNdc();
    const at = this.fish.at(m.x, m.y);
    this.moonAnchor.set(m.x, m.y);
    this.moonTrack = true;
    this.fish.form("ring", this.world.time, { x: at.x, y: at.y, z: at.z, size: m.r * at.unit * 1.42 }, instant ? 0.01 : 2.2, -0.12);
    if (instant) this.fish.alpha = 0;
  }

  private moonNdc() {
    const cam = this.world.camera;
    const v = this.world.sky.material.uniforms.uMoonDir.value.clone().multiplyScalar(1000).add(cam.position).project(cam);
    const r = Math.tan(this.world.sky.material.uniforms.uMoonR.value) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    return { x: v.x, y: v.y, r };
  }

  async startGame(at?: { x: number; y: number }) {
    if (this.mode !== "title") return;
    this.mode = "busy";
    this.setHash("menu");
    const p = this.pl.post;
    this.moonTrack = false;
    if (this.reduced) {
      this.title.classList.remove("is-open");
      await this.enterMenu(true);
      return;
    }
    // Shatter: bake this frame and the title's big words, break them apart.
    const press = $<HTMLElement>("[data-press]")!.getBoundingClientRect();
    const ix = at?.x ?? press.left + press.width * 0.32;
    const iy = at?.y ?? press.top + press.height * 0.5;
    const frameTex = this.pl.captureFrame(this.world.frame(this.pl));
    const words = $$("[data-press] span, .title__name ruby, .title__logo b, .title__logo span, .title__logo em");
    const text = new THREE.CanvasTexture(bakeText(words, this.pl.width / innerWidth));
    text.colorSpace = THREE.NoColorSpace;
    this.shards.start(frameTex, text, new THREE.Vector2((ix / innerWidth) * 2 - 1, 1 - (iy / innerHeight) * 2), innerWidth / innerHeight);
    this.shattering = true;
    this.title.classList.remove("is-open");
    this.hud.show(false);
    this.fish.alpha = 0;
    this.confetti.burst(ix, iy, 60);
    void tween(90, (k) => (this.shards.flash = 0.85 * k), ease.out).then(() => tween(380, (k) => (this.shards.flash = 0.85 * (1 - k)), ease.out));
    // the world behind the calendar goes to the menu shot
    this.world.snap(this.stationFor(this.menu.id()));
    p.mono = 0;
    p.water = 0;
    p.flood = 0;
    await wait(520);
    const played = this.daybreak.play(new Date(), false);
    await played;
    const out = this.daybreak.exit();
    await out.covered;
    this.shattering = false;
    await this.enterMenu(false);
  }

  // ------------------------------------------------------------------ menu

  private stationFor(id: MenuId): keyof typeof STATIONS {
    return id;
  }

  private emblemFor(id: MenuId): Emblem {
    return (menuItems.find((m) => m.id === id)?.emblem ?? "scatter") as Emblem;
  }

  private placeEmblem(id: MenuId, dur = 1.3) {
    const portrait = innerWidth < innerHeight;
    const nx = portrait ? 0.35 : 0.6;
    const ny = portrait ? 0.46 : 0.0;
    const k = portrait ? 0.3 : 0.4;
    const at = this.fish.at(nx, ny);
    this.fish.form(this.emblemFor(id), this.world.time, { x: at.x, y: at.y, z: at.z, size: at.unit * k }, dur);
    this.pl.post.focus.set(nx * 0.5 + 0.5, ny * 0.5 + 0.5, k * 0.62);
  }

  private async enterMenu(instant: boolean, then?: MenuId) {
    this.mode = "busy";
    this.current = null;
    this.title.classList.remove("is-open", "is-leaving");
    const p = this.pl.post;
    p.mono = 0;
    this.world.snap(this.stationFor(this.menu.id()));
    this.menu.root.classList.add("is-open", "is-entering");
    this.menu.select(this.menu.selected, true);
    this.menu.flyIn();
    if (instant) this.menu.snap();
    this.hud.show(true);
    this.moonTrack = false;
    this.placeEmblem(this.menu.id(), instant ? 0.01 : 1.6);
    this.confetti.ambient = this.reduced ? 0 : 1;
    p.calm = 0.42;
    // the avatar sinks in from above
    this.avatarTo({ x: 0.22, y: -0.45, h: 0.92, rot: 190, alpha: 1 }, true);
    this.avatarTo(this.menuPose());
    if (instant || this.reduced) {
      p.flood = 1;
      p.water = 1;
      this.fish.alpha = 1;
    } else {
      p.floodLine = 1;
      void tween(700, (k) => (this.fish.alpha = k), ease.out);
      await tween(900, (k) => (p.flood = k), ease.inOut);
      p.water = 1;
    }
    window.setTimeout(() => this.menu.root.classList.remove("is-entering"), 900);
    this.mode = "menu";
    if (!then) this.setHash("menu");
  }

  private menuPose(): AvatarPose {
    const portrait = innerWidth < innerHeight;
    return portrait ? { x: 0.52, y: 0.27, h: 0.5, rot: 172, alpha: 1 } : { x: 0.19, y: 0.56, h: 0.8, rot: 166, alpha: 1 };
  }

  private async backToTitle(push = true) {
    if (this.mode !== "menu") return;
    this.mode = "busy";
    const p = this.pl.post;
    this.menu.root.classList.add("is-leaving");
    this.avatarTo({ x: 0.2, y: -0.55, h: 0.9, rot: 150, alpha: 0 });
    this.confetti.ambient = 0;
    p.water = 0;
    await tween(this.reduced ? 0 : 750, (k) => (p.flood = 1 - k), ease.inOut);
    this.menu.root.classList.remove("is-open", "is-leaving");
    if (push) this.setHash("");
    this.enterTitle();
    this.fish.alpha = 1;
    this.formTitleRing(false);
  }

  // ------------------------------------------------------------------ screens

  private bindScreens() {
    this.screens = {
      skills: skillsCtl(),
      works: worksCtl(),
      calendar: calendarCtl(this.data),
      contact: contactCtl(() => this.toast("信已交给月亮 ✉")),
      system: systemCtl({
        quality: (v) => {
          this.prefs.quality = v;
          store.set("quality", v);
          this.quality.lock(v === "auto" ? null : (v as TierName));
        },
        motion: (v) => {
          this.prefs.motion = v;
          store.set("motion", v);
          this.reduced = v === "reduced";
          this.world.motion = this.reduced ? 0 : 1;
          this.confetti.ambient = this.reduced ? 0 : this.mode === "menu" || this.mode === "screen" ? 1 : 0;
          document.documentElement.classList.toggle("reduced-motion", this.reduced);
        },
        fps: (v) => {
          this.prefs.fps = v;
          store.set("fps", v);
          if (this.fpsEl) this.fpsEl.hidden = v !== "on";
        },
        toTitle: async () => {
          await this.closeScreen(false);
          await this.backToTitle();
        },
        current: () => this.prefs,
      }),
    };
    if (this.fpsEl) this.fpsEl.hidden = this.prefs.fps !== "on";
    this.menu.onSelect = (id) => {
      if (this.mode !== "menu") return;
      this.world.go(this.stationFor(id), 1.25);
      this.placeEmblem(id);
    };
    this.menu.onConfirm = (id) => {
      if (this.mode === "menu") void this.openScreen(id);
    };
    $$<HTMLAnchorElement>("[data-back]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.closeScreen();
      }),
    );
  }

  private async openScreen(id: MenuId, push = true) {
    if (this.mode !== "menu") return;
    this.mode = "busy";
    const el = $<HTMLElement>(`#${id}`)!;
    const item = this.menu.items[this.menu.selected].getBoundingClientRect();
    const cx = item.left + item.width * 0.5;
    const cy = item.top + item.height * 0.5;
    const p = this.pl.post;
    const s = this.pl.width / innerWidth;
    const R = coverRadius(cx, cy) * 1.15;
    el.classList.add("is-open", "is-entering");
    el.style.clipPath = `polygon(${blotPoints(cx, cy, 0, 1, this.world.time).join(",")})`;
    if (!this.reduced) this.confetti.burst(cx, cy, 40);
    this.world.go(this.stationFor(id), 1.2);
    // avatar: upright on PROFILE, gone elsewhere
    this.avatarTo(id === "profile" ? this.profilePose() : { x: -0.3, y: 0.55, h: 0.9, rot: 150, alpha: 0 });
    // the fish loosen into a slow school behind the panels
    const at = this.fish.at(0.1, -0.05);
    this.fish.form("scatter", this.world.time, { x: at.x, y: at.y, z: at.z - 20, size: at.unit * 0.55 }, 1.6);
    void tween(600, (k) => {
      this.fish.alpha = 1 - k * 0.72;
      p.calm = 0.42 + k * 0.5;
      p.focus.z *= 1 - k;
    });
    p.blotMode = 1;
    await tween(
      this.reduced ? 0 : 560,
      (k) => {
        const r = R * k;
        p.blot.set(cx * s, (innerHeight - cy) * s, r * s * 0.92, 1);
        const pts = blotPoints(cx, cy, r, 1, this.world.time);
        el.style.clipPath = `polygon(${pts.join(",")})`;
        this.menu.root.style.clipPath = holeClip(pts);
      },
      ease.inOut,
    );
    p.blotMode = 0;
    el.style.clipPath = "";
    this.menu.root.style.clipPath = "";
    this.menu.root.classList.remove("is-open");
    this.mode = "screen";
    this.current = id;
    this.screens[id]?.enter?.();
    if (push) this.setHash(id);
    $<HTMLElement>("h2", el)?.setAttribute("tabindex", "-1");
    $<HTMLElement>("h2", el)?.focus({ preventScroll: true });
    window.setTimeout(() => el.classList.remove("is-entering"), 700);
  }

  private profilePose(): AvatarPose {
    const portrait = innerWidth < innerHeight;
    return portrait ? { x: 0.5, y: 0.3, h: 0.46, rot: -4, alpha: 1 } : { x: 0.25, y: 0.46, h: 0.9, rot: -5, alpha: 1 };
  }

  private async closeScreen(push = true) {
    if (this.mode !== "screen" || !this.current) return;
    this.mode = "busy";
    const el = $<HTMLElement>(`#${this.current}`)!;
    const id = this.current;
    const p = this.pl.post;
    this.menu.root.classList.add("is-open");
    this.menu.select(SCREENS.indexOf(id), true);
    this.menu.snap();
    this.avatarTo(this.menuPose());
    this.placeEmblem(id, 1.2);
    void tween(500, (k) => {
      this.fish.alpha = 0.28 + k * 0.72;
      p.calm = 0.92 - k * 0.5;
    });
    const cx = innerWidth * 0.5;
    const cy = innerHeight * 0.5;
    const R = coverRadius(cx, cy);
    // iris out on two offset circles (P3R's "go back")
    await tween(
      this.reduced ? 0 : 420,
      (k) => {
        const r = R * (1 - k);
        const pts = circlePoints(cx + k * 40, cy - k * 30, r);
        el.style.clipPath = `polygon(${pts.join(",")})`;
        this.menu.root.style.clipPath = holeClip(pts);
      },
      ease.in,
    );
    el.classList.remove("is-open", "is-entering");
    el.style.clipPath = "";
    this.menu.root.style.clipPath = "";
    this.current = null;
    this.mode = "menu";
    if (push) this.setHash("menu");
    this.menu.items[this.menu.selected].focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ avatar

  /** Target pose in viewport fractions: centre (x, y from the top), height, rotation (deg, cw). */
  private avatarTo(p: AvatarPose, snap = false) {
    const a = this.av;
    const set = (s: Spring, v: number) => (snap ? s.snap(v) : (s.target = v));
    set(a.x, p.x);
    set(a.y, p.y);
    set(a.h, p.h);
    set(a.rot, p.rot);
    set(a.alpha, p.alpha);
  }

  private updateAvatar(dt: number) {
    const a = this.av;
    const t = this.world.time;
    const x = a.x.update(dt);
    const y = a.y.update(dt);
    const h = a.h.update(dt);
    const rot = a.rot.update(dt);
    const alpha = clamp01(a.alpha.update(dt));
    const pl = this.pl;
    const s = pl.width / innerWidth;
    // float in the water: slow bob and sway
    const bob = this.reduced ? 0 : Math.sin(t * 0.8) * 0.012;
    const sway = this.reduced ? 0 : Math.sin(t * 0.55) * 2.2;
    const cx = x * innerWidth * s;
    const cy = (1 - (y + bob)) * innerHeight * s;
    const S = h * innerHeight * s;
    const phi = THREE.MathUtils.degToRad(-(rot + sway));
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    pl.post.avatarInv.set(c / S, sn / S, -(c * cx + sn * cy) / S + 0.5, -sn / S, c / S, (sn * cx - c * cy) / S + 0.5, 0, 0, 1);
    pl.post.avatar = alpha;
    pl.post.avatarWave = this.reduced ? 0 : 1;
  }

  // ------------------------------------------------------------------ input

  private bindInput() {
    addEventListener("pointermove", (e) => this.world.setPointer((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)));
    addEventListener("pointerdown", (e) => {
      if (this.mode === "title" && !(e.target as HTMLElement).closest("a, button")) void this.startGame({ x: e.clientX, y: e.clientY });
    });
    addEventListener("keydown", (e) => this.onKey(e));
    addEventListener(
      "wheel",
      (e) => {
        if (this.mode !== "menu") return;
        const now = performance.now();
        if (now < this.wheelLock || Math.abs(e.deltaY) < 8) return;
        this.wheelLock = now + 140;
        this.menu.move(e.deltaY > 0 ? 1 : -1);
      },
      { passive: true },
    );
    addEventListener("popstate", () => void this.route());
  }

  private onKey(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    const typing = (e.target as HTMLElement).closest("textarea, input");
    if (this.mode === "title") {
      if (["Shift", "Tab", "Control", "Alt", "Meta", "CapsLock"].includes(k)) return;
      if ((e.target as HTMLElement).closest("a") && k === "Tab") return;
      e.preventDefault();
      void this.startGame();
      return;
    }
    if (this.mode === "menu") {
      if (k === "ArrowDown" || k === "s" || k === "S") this.menu.move(1);
      else if (k === "ArrowUp" || k === "w" || k === "W") this.menu.move(-1);
      else if (k === "Enter" || k === " " || k === "ArrowRight") this.menu.confirm();
      else if (k === "Escape" || k === "Backspace") void this.backToTitle();
      else if (/^[1-6]$/.test(k)) {
        this.menu.select(Number(k) - 1);
        this.menu.confirm();
      } else return;
      e.preventDefault();
      return;
    }
    if (this.mode === "screen") {
      if (typing) {
        if (k === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (k === "Escape" || k === "Backspace") {
        e.preventDefault();
        void this.closeScreen();
        return;
      }
      const ctl = this.current ? this.screens[this.current] : undefined;
      if (ctl?.key?.(e)) e.preventDefault();
    }
  }

  // ------------------------------------------------------------------ misc

  toast(text: string) {
    const t = $("[data-toast]");
    if (!t) return;
    t.textContent = text;
    t.classList.add("is-on");
    window.setTimeout(() => t.classList.remove("is-on"), 2800);
  }

  resize() {
    this.pl.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
    this.world.resize(this.pl.width, this.pl.height);
    this.fish.resize(innerWidth / innerHeight);
    this.confetti.resize(innerWidth, innerHeight);
    // formations live in view space: re-place them for the new shape
    if (this.mode === "menu") {
      this.menu.snap();
      this.placeEmblem(this.menu.id(), 0.6);
    } else if (this.mode === "title") {
      this.formTitleRing(false);
    }
  }

  /** Debug / tests: jump anywhere. */
  go(where: "title" | "menu" | MenuId) {
    this.setHash(where === "title" ? "" : where);
    void this.route();
  }

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const raw = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameMs = this.frameMs * 0.9 + raw * 1000 * 0.1;
    const dt = Math.min(0.05, raw) * this.timeScale;
    const w = this.world;
    w.update(dt);
    this.fish.update(w.time);
    if (this.moonTrack) {
      const m = this.moonNdc();
      const a = this.fish.at(m.x, m.y);
      const b = this.fish.at(this.moonAnchor.x, this.moonAnchor.y);
      this.fish.setOffset(a.x - b.x, a.y - b.y);
      if (this.mode === "title" && this.fish.alpha < 0.7) this.fish.alpha = Math.min(0.7, this.fish.alpha + dt * 0.5);
    }
    this.menu.update(dt);
    this.confetti.update(dt);
    this.updateAvatar(dt);
    this.pl.time = w.time;
    if (this.shattering) {
      this.shards.update(raw);
      this.pl.renderPlain(
        [
          [this.shards.scene, this.shards.camera],
          [this.confetti.scene, this.confetti.camera],
        ],
        this.navy,
      );
    } else {
      const f = w.frame(this.pl);
      f.overlay = this.confetti.scene;
      f.overlayCamera = this.confetti.camera;
      this.pl.render(f);
    }
    this.quality.update(raw, this.pl.timer.total, raw * 1000, now / 1000);
    if (this.fpsEl && !this.fpsEl.hidden) {
      this.fpsAcc.t += raw;
      this.fpsAcc.n++;
      if (this.fpsAcc.t > 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps · GPU ${this.pl.timer.total.toFixed(1)} ms · ${this.quality.current.name} · ${this.pl.width}×${this.pl.height}`;
        this.fpsAcc = { t: 0, n: 0 };
      }
    }
  };
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
