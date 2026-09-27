import * as THREE from "three";
import { sceneOf, type MenuId } from "../content";
import { Pipeline, type Mix } from "../engine/Pipeline";
import { Quality, TIERS, type TierName } from "../engine/Quality";
import { env } from "../engine/toon";
import { Confetti } from "../fx/confetti";
import { FishSchool } from "../fx/fish";
import { Hero, heroMenuPose, type HeroPose } from "../fx/hero";
import { Shards } from "../fx/shards";
import type { SceneId } from "../scenes/common/types";
import { SCENE_IDS, type SceneHost, Scenes, type ShotName } from "../scenes/host";
import type { GitHubSnapshot } from "../github";
import { bakeText } from "../ui/bake";
import { Boot } from "../ui/Boot";
import { Daybreak } from "../ui/Daybreak";
import { $, $$, blotPoints, circlePoints, clamp01, coverRadius, ease, holeClip, Spring, tween, wait } from "../ui/dom";
import { Hud } from "../ui/Hud";
import { Menu } from "../ui/Menu";
import { calendarCtl, contactCtl, skillsCtl, systemCtl, worksCtl, type Screens } from "../ui/screens";
import { Tabbar } from "../ui/Tabbar";

// Top-level controller: boot → title (the bridge into Tsukuyomi) → glass
// shatter and the P3 day change → the flooded menu, whose background is the
// scene of the highlighted entry → screens, each over its own scene.
// Owns the frame loop, input, routing, scene crossings, Yachiyo's film band
// and the fish choreography.

type Mode = "boot" | "title" | "busy" | "menu" | "screen";

const params = new URLSearchParams(location.search);
const SCREENS: MenuId[] = ["profile", "skills", "works", "calendar", "contact", "system"];
const TITLE_SCENE: SceneId = "bridge";
const store = {
  get(k: string) {
    try {
      return localStorage.getItem(`tsukuyomi4:${k}`);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(`tsukuyomi4:${k}`, v);
    } catch {
      /* storage may be blocked */
    }
  },
};
const session = {
  get(k: string) {
    try {
      return sessionStorage.getItem(`tsukuyomi4:${k}`);
    } catch {
      return null;
    }
  },
  set(k: string) {
    try {
      sessionStorage.setItem(`tsukuyomi4:${k}`, "1");
    } catch {
      /* ignore */
    }
  },
};

export class App {
  readonly quality: Quality;
  pl!: Pipeline;
  scenes!: Scenes;
  fish!: FishSchool;
  hero!: Hero;
  confetti = new Confetti();
  private shards = new Shards();
  private shattering = false;
  private navy = new THREE.Color().setRGB(0x16 / 255, 0x1a / 255, 0x30 / 255, THREE.LinearSRGBColorSpace);
  private boot = new Boot();
  private hud = new Hud();
  private daybreak = new Daybreak();
  private menu = new Menu();
  private tabbar = new Tabbar();
  private screens: Screens = {};
  private title = $("[data-screen=title]")!;
  mode: Mode = "boot";
  current: MenuId | null = null;
  /** The scene on screen, and the one crossing in over it. */
  cur!: SceneHost;
  private next: SceneHost | null = null;
  private mix: Mix = { k: 0, mode: 0, center: new THREE.Vector2() };
  private crossToken = 0;
  private pendingScene = 0;
  private last = performance.now();
  private reduced: boolean;
  private prefs: { quality: string; motion: string; fps: string };
  private hp = { x: new Spring(0, 6), y: new Spring(0, 6), h: new Spring(0, 6), rot: new Spring(0, 6), alpha: new Spring(0, 8) };
  private moonTrack = false;
  private moonAnchor = new THREE.Vector2();
  private pointer = new THREE.Vector2();
  private pointerS = new THREE.Vector2();
  private fpsEl = $("[data-fps]");
  private fpsAcc = { t: 0, n: 0 };
  private wheelLock = 0;
  private data: GitHubSnapshot | null = null;
  private swipe = $("[data-swipe]");
  timeScale = 1;
  time = 0;

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
    this.boot.progress(0.06);
    await frame();
    this.data = await fetch("/data/github.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    this.pl = new Pipeline(this.canvas, this.quality.current);
    this.pl.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
    this.scenes = new Scenes({ density: this.quality.current.particles }, this.pl);
    this.boot.progress(0.2);
    // the title scene first; the menu's first scene right behind it
    const target = this.hashTarget();
    const firstId: SceneId = target === "title" ? TITLE_SCENE : sceneOf[target === "menu" ? this.menu.id() : target];
    this.cur = await this.scenes.load(firstId);
    this.boot.progress(0.6);
    this.fish = new FishSchool(Math.round(420 * Math.max(0.5, this.quality.current.particles)));
    this.confetti.scene.add(this.fish.mesh);
    this.hero = new Hero(this.reduced);
    await this.hero.load();
    this.pl.heroTexture = this.hero.texture;
    this.boot.progress(0.75);
    await Promise.race([document.fonts.ready, wait(2500)]);
    this.resize();
    addEventListener("resize", () => this.resize());
    this.quality.onChange = (t) => {
      this.pl.setTier(t);
      this.resize();
    };
    this.bindScreens();
    this.bindInput();
    for (const h of this.scenes.all) h.rig.motion = this.reduced ? 0 : 1;
    // Compile the grade programs once (title, sea, blots) so nothing hitches later.
    this.warm();
    this.boot.progress(1);
    Object.assign(window, { __app: this });
    this.loop();
    await wait(200);
    this.boot.done();
    this.hud.onDarkHour = (dark) => (this.pl.post.dark = dark ? 1 : 0);
    this.hud.refresh();
    void this.route(true);
    // the rest of the world builds while the visitor looks at the title
    const order: SceneId[] = [sceneOf[this.menu.id()], ...SCREENS.map((s) => sceneOf[s]), TITLE_SCENE];
    void this.scenes.preload([...new Set(order)].filter((id) => SCENE_IDS.includes(id))).then(() => {
      for (const h of this.scenes.all) h.rig.motion = this.reduced ? 0 : 1;
    });
  }

  private warm() {
    const p = this.pl.post;
    this.cur.update(0.016, 0, this.pointerS, this.pl.width / this.pl.height, this.pl.height);
    p.water = 1;
    p.blotMode = 2;
    p.hero = 1;
    this.pl.render(this.cur.frame());
    p.blotMode = 1;
    this.pl.render(this.cur.frame());
    p.water = 0;
    p.blotMode = 0;
    p.hero = 0;
  }

  // ------------------------------------------------------------------ scenes

  /**
   * Bring a scene on. `ripple` runs a ring out from a point (CSS px); `ink`
   * sweeps a noisy front; `cut` swaps at once (under a cover).
   */
  private async crossTo(id: SceneId, how: "ripple" | "ink" | "cut", shot: ShotName, at?: { x: number; y: number }, dur = 700) {
    const token = ++this.crossToken;
    const host = await this.scenes.load(id);
    if (token !== this.crossToken) return;
    host.rig.motion = this.reduced ? 0 : 1;
    if (host === this.cur && !this.next) {
      host.go(shot, 1.0);
      return;
    }
    // a crossing already running: settle it first
    if (this.next) {
      this.cur = this.next;
      this.next = null;
    }
    if (host === this.cur) return;
    host.snap(shot);
    if (how === "cut" || this.reduced) {
      this.cur = host;
      return;
    }
    const s = this.pl.width / innerWidth;
    const c = at ?? { x: innerWidth / 2, y: innerHeight / 2 };
    this.mix.mode = how === "ripple" ? 0 : 1;
    this.mix.center.set(c.x * s, (innerHeight - c.y) * s);
    this.mix.k = 0;
    this.next = host;
    await tween(dur, (k) => {
      if (token === this.crossToken) this.mix.k = k;
    }, ease.inOut);
    if (token !== this.crossToken || this.next !== host) return;
    this.cur = host;
    this.next = null;
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
    if (this.mode === "boot" || this.mode === "title") {
      this.menu.select(SCREENS.indexOf(target), true);
      await this.enterMenu(true, target);
    }
    if (this.mode === "screen" && this.current !== target) {
      await this.switchScreen(target, false);
      return;
    }
    if (this.mode === "menu") {
      this.menu.select(SCREENS.indexOf(target), true);
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
    this.tabbar.show(false);
    this.hud.show(true);
    if (this.cur.id === TITLE_SCENE && !this.next) this.cur.snap("title");
    else void this.crossTo(TITLE_SCENE, "cut", "title");
    const p = this.pl.post;
    p.mono = 0.14;
    p.water = 0;
    p.flood = 0;
    p.fade = 0;
    p.calm = 0;
    p.focus.set(0, 0, 0);
    this.confetti.ambient = 0;
    this.heroTo(this.heroOff(), true);
    this.hero.pause();
    this.formTitleRing(true);
    $<HTMLElement>("[data-enter]", this.title)?.addEventListener("click", this.onEnterLink);
  }

  private onEnterLink = (e: Event) => {
    e.preventDefault();
    if (this.mode === "title") void this.startGame(undefined, true);
  };

  /** The fish circle the moon on the title. */
  private formTitleRing(instant = false) {
    const m = this.cur.moonNdc();
    const at = this.fish.at(m.x, m.y);
    this.moonAnchor.set(m.x, m.y);
    this.moonTrack = true;
    this.fish.form("ring", this.time, { x: at.x, y: at.y, z: at.z, size: m.r * at.unit * 1.42 }, instant ? 0.01 : 2.2, -0.12);
    if (instant) this.fish.alpha = 0;
  }

  async startGame(at?: { x: number; y: number }, quick = false) {
    if (this.mode !== "title") return;
    this.mode = "busy";
    this.setHash("menu");
    const p = this.pl.post;
    this.moonTrack = false;
    const menuScene = this.scenes.load(sceneOf[this.menu.id()]);
    if (this.reduced || quick) {
      this.title.classList.remove("is-open");
      await menuScene;
      await this.enterMenu(!!this.reduced);
      return;
    }
    // Shatter: bake this frame and the title's big words, break them apart.
    const press = $<HTMLElement>("[data-press]")!.getBoundingClientRect();
    const ix = at?.x ?? press.left + press.width * 0.32;
    const iy = at?.y ?? press.top + press.height * 0.5;
    const frameTex = this.pl.captureFrame(this.cur.frame());
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
    p.mono = 0;
    p.water = 0;
    p.flood = 0;
    await wait(480);
    // the P3 day change: the full walk once per visit, a short one after that
    const seen = !!session.get("daybreak");
    session.set("daybreak");
    const played = this.daybreak.play(new Date(), false, seen);
    const host = await menuScene;
    this.cur = host;
    this.next = null;
    host.snap("menu");
    await played;
    const out = this.daybreak.exit();
    await out.covered;
    this.shattering = false;
    await this.enterMenu(false);
  }

  // ------------------------------------------------------------------ menu

  /** The title's fish ring loosens and fades as the sea comes in (the scenes have their own fish). */
  private releaseFish(dur = 900) {
    const at = this.fish.at(0.2, 0.1);
    this.fish.form("scatter", this.time, { x: at.x, y: at.y, z: at.z - 20, size: at.unit * 0.6 }, 1.6);
    const a0 = this.fish.alpha;
    void tween(this.reduced ? 0 : dur, (k) => (this.fish.alpha = a0 * (1 - k)), ease.out);
    this.pl.post.focus.set(0, 0, 0);
  }

  private async enterMenu(instant: boolean, then?: MenuId) {
    this.mode = "busy";
    this.current = null;
    this.title.classList.remove("is-open", "is-leaving");
    const p = this.pl.post;
    p.mono = 0;
    p.calm = 0.42;
    const host = await this.scenes.load(sceneOf[this.menu.id()]);
    if (this.cur !== host) {
      this.next = null;
      this.cur = host;
    }
    host.snap("menu");
    this.menu.root.classList.add("is-open", "is-entering");
    this.menu.select(this.menu.selected, true);
    this.menu.flyIn();
    if (instant) this.menu.snap();
    this.hud.show(true);
    this.tabbar.show(false);
    this.moonTrack = false;
    this.releaseFish(instant ? 0 : 900);
    this.confetti.ambient = this.reduced ? 0 : 1;
    // Yachiyo slides in from the left
    const pose = heroMenuPose(innerWidth, innerHeight);
    this.heroTo({ ...pose, x: pose.x - innerWidth * 0.35, rot: pose.rot - 6, alpha: 1 }, true);
    this.heroTo({ ...pose, alpha: 1 });
    this.hero.play();
    if (instant || this.reduced) {
      p.flood = 1;
      p.water = 1;
    } else {
      p.floodLine = 1;
      await tween(900, (k) => (p.flood = k), ease.inOut);
      p.water = 1;
    }
    window.setTimeout(() => this.menu.root.classList.remove("is-entering"), 900);
    this.mode = "menu";
    if (!then) this.setHash("menu");
  }

  private heroOff(): HeroPose & { alpha: number } {
    const pose = heroMenuPose(innerWidth, innerHeight);
    return { ...pose, x: pose.x - innerWidth * 0.4, rot: pose.rot - 8, alpha: 0 };
  }

  private async backToTitle(push = true) {
    if (this.mode !== "menu") return;
    this.mode = "busy";
    const p = this.pl.post;
    this.menu.root.classList.add("is-leaving");
    this.heroTo(this.heroOff());
    this.confetti.ambient = 0;
    // under the water, swap to the bridge, then let the water run off
    await this.crossTo(TITLE_SCENE, "ripple", "title", { x: innerWidth * 0.5, y: innerHeight * 0.5 }, this.reduced ? 0 : 600);
    this.hero.pause();
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
          for (const h of this.scenes.all) h.rig.motion = this.reduced ? 0 : 1;
          this.hero.setReduced(this.reduced);
          if (!this.reduced && this.mode === "menu") this.hero.play();
          this.pl.heroTexture = this.hero.texture;
          this.confetti.ambient = this.reduced ? 0 : this.mode === "menu" ? 1 : 0;
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
      // wait for the cursor to rest, then ripple the entry's scene in from it
      const token = ++this.pendingScene;
      window.setTimeout(() => {
        if (token !== this.pendingScene || this.mode !== "menu") return;
        const r = this.menu.items[this.menu.selected].getBoundingClientRect();
        void this.crossTo(sceneOf[id], "ripple", "menu", { x: r.left + r.width * 0.4, y: r.top + r.height * 0.5 }, 650);
      }, 120);
    };
    this.menu.onConfirm = (id) => {
      if (this.mode === "menu") void this.openScreen(id);
    };
    this.tabbar.onGo = (id) => {
      if (this.mode === "screen" && id !== this.current) void this.switchScreen(id);
    };
    this.tabbar.onStep = (d) => this.stepScreen(d);
    $$<HTMLAnchorElement>("[data-back]").forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        void this.closeScreen();
      }),
    );
  }

  private stepScreen(d: number) {
    if (this.mode !== "screen" || !this.current) return;
    const i = SCREENS.indexOf(this.current);
    void this.switchScreen(SCREENS[(i + d + SCREENS.length) % SCREENS.length]);
  }

  private async openScreen(id: MenuId, push = true) {
    if (this.mode !== "menu") return;
    this.mode = "busy";
    this.pendingScene++;
    // make sure the entry's own scene is the one showing
    const host = await this.scenes.load(sceneOf[id]);
    if (this.cur !== host || this.next) await this.crossTo(sceneOf[id], "cut", "menu");
    const el = $<HTMLElement>(`#${id}`)!;
    const item = this.menu.items[this.menu.selected].getBoundingClientRect();
    const cx = item.left + item.width * 0.4;
    const cy = item.top + item.height * 0.5;
    const p = this.pl.post;
    const s = this.pl.width / innerWidth;
    const R = coverRadius(cx, cy) * 1.15;
    el.classList.add("is-open", "is-entering");
    el.style.clipPath = `polygon(${blotPoints(cx, cy, 0, 1, this.time).join(",")})`;
    if (!this.reduced) this.confetti.burst(cx, cy, 40);
    this.cur.go("screen", 1.3);
    this.heroTo(this.heroOff());
    this.confetti.ambient = 0;
    this.tabbar.mark(id);
    // the water drains inside the blot: the scene surfaces in full colour
    p.blotMode = 2;
    await tween(
      this.reduced ? 0 : 620,
      (k) => {
        const r = R * k;
        p.blot.set(cx * s, (innerHeight - cy) * s, r * s * 0.92, 1);
        const pts = blotPoints(cx, cy, r, 1, this.time);
        el.style.clipPath = `polygon(${pts.join(",")})`;
        this.menu.root.style.clipPath = holeClip(pts);
        p.calm = 0.42 * (1 - k);
      },
      ease.inOut,
    );
    p.blotMode = 0;
    p.water = 0;
    p.flood = 0;
    p.calm = 0;
    this.hero.pause();
    el.style.clipPath = "";
    this.menu.root.style.clipPath = "";
    this.menu.root.classList.remove("is-open");
    this.tabbar.show(true);
    this.mode = "screen";
    this.current = id;
    this.screens[id]?.enter?.();
    if (push) this.setHash(id);
    this.focusHead(el);
    window.setTimeout(() => el.classList.remove("is-entering"), 700);
  }

  private focusHead(el: HTMLElement) {
    const h = $<HTMLElement>("h2", el);
    h?.setAttribute("tabindex", "-1");
    h?.focus({ preventScroll: true });
  }

  /** Screen → screen without the menu: a P3R swipe covers the cut. */
  private async switchScreen(id: MenuId, push = true) {
    if (this.mode !== "screen" || !this.current || id === this.current) return;
    this.mode = "busy";
    const from = $<HTMLElement>(`#${this.current}`)!;
    const to = $<HTMLElement>(`#${id}`)!;
    const dir = SCREENS.indexOf(id) > SCREENS.indexOf(this.current) ? 1 : -1;
    const host = this.scenes.load(sceneOf[id]);
    this.tabbar.mark(id);
    await this.sweep(dir, "in");
    from.classList.remove("is-open", "is-entering");
    to.classList.add("is-open", "is-entering");
    this.menu.select(SCREENS.indexOf(id), true);
    const h = await host;
    this.next = null;
    this.crossToken++;
    this.cur = h;
    h.rig.motion = this.reduced ? 0 : 1;
    // arrive with a short push-in so the cut has motion on both sides
    h.snap("menu");
    h.go("screen", this.reduced ? 0.01 : 1.1);
    this.current = id;
    this.screens[id]?.enter?.();
    if (push) this.setHash(id);
    await this.sweep(dir, "out");
    this.mode = "screen";
    this.focusHead(to);
    window.setTimeout(() => to.classList.remove("is-entering"), 700);
  }

  /** The white-and-blue band crossing the screen (in: covers, out: leaves). */
  private async sweep(dir: number, phase: "in" | "out") {
    const sw = this.swipe;
    if (!sw || this.reduced) return;
    const [white, blue] = [...sw.children] as HTMLElement[];
    sw.classList.add("is-on");
    const from = phase === "in" ? -160 * dir : 0;
    const to = phase === "in" ? 0 : 160 * dir;
    await tween(
      phase === "in" ? 260 : 320,
      (k) => {
        const xw = from + (to - from) * k;
        const xb = from + (to - from) * Math.min(1, k * 1.12);
        white.style.transform = `translateX(${xw}vw) skewX(-24deg)`;
        blue.style.transform = `translateX(${xb}vw) skewX(-24deg)`;
      },
      phase === "in" ? ease.in : ease.out,
    );
    if (phase === "out") sw.classList.remove("is-on");
  }

  private async closeScreen(push = true) {
    if (this.mode !== "screen" || !this.current) return;
    this.mode = "busy";
    const el = $<HTMLElement>(`#${this.current}`)!;
    const id = this.current;
    const p = this.pl.post;
    const s = this.pl.width / innerWidth;
    this.tabbar.show(false);
    this.menu.root.classList.add("is-open");
    this.menu.select(SCREENS.indexOf(id), true);
    this.menu.snap();
    this.heroTo({ ...heroMenuPose(innerWidth, innerHeight), alpha: 1 });
    this.hero.play();
    this.cur.go("menu", 1.1);
    const cx = innerWidth * 0.5;
    const cy = innerHeight * 0.5;
    const R = coverRadius(cx, cy);
    // iris out on two offset circles (P3R's "go back"); the sea closes in around it
    p.water = 1;
    p.flood = 1;
    p.blotMode = 2;
    await tween(
      this.reduced ? 0 : 460,
      (k) => {
        const r = R * (1 - k);
        const ox = cx + k * 40;
        const oy = cy - k * 30;
        const pts = circlePoints(ox, oy, r);
        el.style.clipPath = `polygon(${pts.join(",")})`;
        this.menu.root.style.clipPath = holeClip(pts);
        p.blot.set(ox * s, (innerHeight - oy) * s, r * s, 0);
        p.calm = 0.42 * k;
      },
      ease.in,
    );
    p.blotMode = 0;
    p.calm = 0.42;
    el.classList.remove("is-open", "is-entering");
    el.style.clipPath = "";
    this.menu.root.style.clipPath = "";
    this.confetti.ambient = this.reduced ? 0 : 1;
    this.current = null;
    this.mode = "menu";
    if (push) this.setHash("menu");
    this.menu.items[this.menu.selected].focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ Yachiyo's band

  private heroTo(p: HeroPose & { alpha: number }, snap = false) {
    const a = this.hp;
    const set = (s: Spring, v: number) => (snap ? s.snap(v) : (s.target = v));
    set(a.x, p.x);
    set(a.y, p.y);
    set(a.h, p.h);
    set(a.rot, p.rot);
    set(a.alpha, p.alpha);
  }

  private updateHero(dt: number) {
    const a = this.hp;
    const bob = this.reduced ? 0 : Math.sin(this.time * 0.8) * innerHeight * 0.006;
    const sway = this.reduced ? 0 : Math.sin(this.time * 0.55) * 0.5;
    const pose: HeroPose = { x: a.x.update(dt), y: a.y.update(dt) + bob, h: a.h.update(dt), rot: a.rot.update(dt) + sway };
    const alpha = clamp01(a.alpha.update(dt));
    const p = this.pl.post;
    const s = this.pl.width / innerWidth;
    this.hero.update(dt);
    this.pl.heroTexture = this.hero.texture;
    Hero.place(pose, s, this.pl.height, p.heroInv, p.heroBorder, Math.max(6, innerHeight * 0.0065));
    p.heroShadow.set(innerHeight * 0.011 * s, -innerHeight * 0.011 * s);
    p.hero = alpha;
    p.heroWave = this.reduced ? 0 : 1;
    p.heroSeam = this.hero.seam;
  }

  // ------------------------------------------------------------------ input

  private bindInput() {
    addEventListener("pointermove", (e) => this.pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)));
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
    if (this.shattering) {
      if (!["Shift", "Tab", "Control", "Alt", "Meta"].includes(k)) this.daybreak.skipNow();
      return;
    }
    if (this.mode === "title") {
      if (["Shift", "Tab", "Control", "Alt", "Meta", "CapsLock", "Escape", "Backspace"].includes(k)) return;
      if ((e.target as HTMLElement).closest("a") && (k === "Tab" || k === "Enter")) return;
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
      if (k === "q" || k === "Q" || k === "e" || k === "E") {
        e.preventDefault();
        this.stepScreen(k === "q" || k === "Q" ? -1 : 1);
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
    this.fish.resize(innerWidth / innerHeight);
    this.confetti.resize(innerWidth, innerHeight);
    // formations live in view space: re-place them for the new shape
    if (this.mode === "menu") {
      this.menu.snap();
      this.heroTo({ ...heroMenuPose(innerWidth, innerHeight), alpha: 1 }, true);
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
    const dt = Math.min(0.05, raw) * this.timeScale;
    this.time += dt;
    env.uTime.value = this.time;
    this.pointerS.lerp(this.pointer, 1 - Math.exp(-dt * 3));
    const aspect = this.pl.width / this.pl.height;
    this.cur.update(dt, this.time, this.pointerS, aspect, this.pl.height);
    this.next?.update(dt, this.time, this.pointerS, aspect, this.pl.height);
    this.fish.update(this.time);
    if (this.moonTrack) {
      const m = this.cur.moonNdc();
      const a = this.fish.at(m.x, m.y);
      const b = this.fish.at(this.moonAnchor.x, this.moonAnchor.y);
      this.fish.setOffset(a.x - b.x, a.y - b.y);
      if (this.mode === "title" && this.fish.alpha < 0.7) this.fish.alpha = Math.min(0.7, this.fish.alpha + dt * 0.5);
    }
    this.menu.update(dt);
    this.confetti.update(dt);
    this.updateHero(dt);
    this.pl.time = this.time;
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
      const f = this.cur.frame();
      f.overlay = this.confetti.scene;
      f.overlayCamera = this.confetti.camera;
      if (this.next) {
        const g = this.next.frame();
        g.overlay = this.confetti.scene;
        g.overlayCamera = this.confetti.camera;
        this.pl.renderMix(f, g, this.mix);
      } else this.pl.render(f);
    }
    this.quality.update(raw, this.pl.timer.total, raw * 1000, now / 1000);
    if (this.fpsEl && !this.fpsEl.hidden) {
      this.fpsAcc.t += raw;
      this.fpsAcc.n++;
      if (this.fpsAcc.t > 0.5) {
        this.fpsEl.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps · GPU ${this.pl.timer.total.toFixed(1)} ms · ${this.quality.current.name} · ${this.pl.width}×${this.pl.height} · ${this.cur.id}`;
        this.fpsAcc = { t: 0, n: 0 };
      }
    }
  };
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
