import * as THREE from "three";
import { Pipeline } from "../engine/Pipeline";
import { Quality, TIERS, type Tier, type TierName } from "../engine/Quality";
import { Tunnel } from "../stages/Tunnel";
import { pose, lerpPose, WaterWorld, type Pose } from "../stages/WaterWorld";
import { G } from "../world/atmos";
import { createCloudNoise } from "../world/noiseTextures";
import { DiveOverlay } from "../world/portal";
import { Director, P_COVER, T_COVER_UI, T_INTRO_END } from "./Director";
import { $, $$, UI } from "./ui";

// Top-level controller: loading, the entry sequence, the cover in World A,
// the passage through the torii and the chapters in World B. Owns the frame
// loop, input and the adaptive quality.

type CityLike = {
  update(dt: number, now: number): void;
  render(pl: Pipeline): void;
  resize(pl: Pipeline, tier: Tier): void;
  arrive(now: number): void;
  goChapter(i: number, now: number): void;
  pointer(x: number, y: number): void;
  click(ndc: THREE.Vector2, now: number): void;
  lightSkill(id: string | null): void;
  releaseLantern(now: number): void;
  readonly settled: boolean;
};

type Mode = "loading" | "ready" | "intro" | "cover" | "passage" | "city" | "return";

const s = THREE.MathUtils.smoothstep;
const ease = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const params = new URLSearchParams(location.search);
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// The passage (seconds from its start).
const PASS_APPROACH = 1.7;
const PASS_SWITCH = 2.75;
const PASS_END = 4.0;

export class App {
  readonly ui = new UI();
  readonly quality: Quality;
  pl!: Pipeline;
  world!: WaterWorld;
  tunnel!: Tunnel;
  director!: Director;
  city: CityLike | null = null;
  readonly dive = new DiveOverlay();
  mode: Mode = "loading";
  chapter = 0;
  time = 0;
  introT = 0;
  introSpeed = 1;
  private modeT = 0;
  private last = performance.now();
  private fade = 0;
  private fadeTarget = 0;
  private pendingJump: (() => void) | null = null;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private passFrom: Pose = pose(0, 0, 0, 0, 0, 0);
  private tmpPose: Pose = pose(0, 0, 0, 0, 0, 0);
  private navLock = 0;
  private uiShown = false;
  private frameMs = 16.7;
  private cityPromise: Promise<void> | null = null;
  private wantChapter = -1;

  constructor(private canvas: HTMLCanvasElement) {
    const saved = (() => {
      try {
        return localStorage.getItem("tsukuyomi:tier") as TierName | null;
      } catch {
        return null;
      }
    })();
    const locked = params.get("q") as TierName | null;
    this.quality = new Quality(saved ?? "high", locked && TIERS.some((t) => t.name === locked) ? locked : null);
  }

  async init() {
    const ui = this.ui;
    ui.progress(0.08, "点亮渲染器…");
    await frame();
    this.pl = new Pipeline(this.canvas, this.quality.current);
    ui.progress(0.2, "编织云的纹理…");
    await frame();
    const noise = createCloudNoise(this.pl.renderer);
    ui.progress(0.45, "引水入湖…");
    await frame();
    const particles = this.quality.current.particles;
    this.world = new WaterWorld(noise, particles);
    this.tunnel = new Tunnel(particles);
    this.director = new Director(this.world, this.tunnel);
    this.resize();
    addEventListener("resize", () => this.resize());
    this.quality.onChange = (t) => {
      this.pl.setTier(t);
      this.resize();
      try {
        localStorage.setItem("tsukuyomi:tier", t.name);
      } catch {
        /* storage may be blocked */
      }
    };
    ui.progress(0.6, "预热着色器…");
    await frame();
    // Compile every program once so nothing hitches when it first appears.
    this.warm();
    ui.progress(0.85, "月の都を準備中…");
    await frame();
    this.cityPromise = this.loadCity(noise);
    this.bindInput();
    this.loop();
    ui.progress(1, "准备好了");
    this.mode = "ready";
    if (reduced || params.get("skip") === "1") {
      ui.ready(() => this.start(true));
    } else {
      ui.ready(() => this.start(false));
    }
    Object.assign(window, { __app: this });
  }

  private async loadCity(noise: ReturnType<typeof createCloudNoise>) {
    try {
      const mod = await import("../stages/CityWorld");
      this.city = new mod.CityWorld(noise, this.quality.current.particles, this.world);
      this.city.resize(this.pl, this.quality.current);
    } catch (e) {
      console.error("city failed to load", e);
    }
  }

  private warm() {
    const pl = this.pl;
    // Render one frame of each stage offscreen.
    this.introT = 3.2;
    this.director.intro(3.2, pl, 0);
    pl.beginFrame();
    this.tunnel.render(pl);
    pl.finish();
    this.director.intro(16, pl, 0);
    this.world.update(0.016);
    pl.beginFrame();
    this.world.render(pl, 0);
    pl.finish();
    this.introT = 0;
  }

  resize() {
    const pl = this.pl;
    pl.resize(innerWidth, innerHeight, Math.min(devicePixelRatio, 2));
    this.world.resize(pl, this.quality.current);
    this.tunnel.resize(pl.width, pl.height);
    this.city?.resize(pl, this.quality.current);
  }

  // ---------------------------------------------------------------- flow

  start(skip: boolean) {
    this.ui.hideLoader();
    this.mode = "intro";
    this.introT = skip ? T_INTRO_END : 0;
    this.introSpeed = 1;
    this.world.skyLanterns.prefill(40, 90);
    if (!skip) window.setTimeout(() => this.mode === "intro" && this.ui.showSkip(true, () => this.skipIntro()), 1400);
    const hash = location.hash.slice(1);
    const target = this.ui.chapters.findIndex((c) => c.id === hash);
    if (target > 0) this.wantChapter = target;
  }

  skipIntro() {
    if (this.mode !== "intro" || this.introT >= 19.6) return;
    this.ui.showSkip(false);
    this.fadeTo(1, () => {
      this.introT = 19.6;
      this.fadeTo(0);
    });
  }

  private fadeTo(v: number, then?: () => void) {
    this.fadeTarget = v;
    this.pendingJump = then ?? null;
  }

  private enterCover() {
    this.mode = "cover";
    this.chapter = 0;
    this.ui.world("a");
    this.ui.uiOn(true);
    this.ui.setChapter(0);
    this.ui.showSkip(false);
    if (this.wantChapter > 0) {
      const w = this.wantChapter;
      this.wantChapter = -1;
      window.setTimeout(() => this.go(w), 600);
    }
  }

  go(i: number) {
    i = Math.max(0, Math.min(this.ui.chapters.length - 1, i));
    if (this.navLock > this.time) return;
    if (this.mode === "intro") {
      this.skipIntro();
      return;
    }
    if (this.mode === "cover" && i > 0) {
      if (!this.city) {
        this.ui.toast("月之都还在准备中…");
        this.cityPromise?.then(() => this.go(i));
        return;
      }
      this.startPassage(i);
      return;
    }
    if (this.mode === "city") {
      if (i === 0) {
        this.startReturn();
        return;
      }
      if (i === this.chapter) return;
      this.chapter = i;
      this.ui.clearChapter();
      this.city!.goChapter(i, this.time);
      this.navLock = this.time + 1.2;
      return;
    }
  }

  private startPassage(target: number) {
    this.mode = "passage";
    this.modeT = 0;
    this.wantChapter = target;
    this.ui.clearChapter();
    this.ui.uiOn(false);
    const c = this.world.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
    this.passFrom = { pos: c.position.clone(), target: c.position.clone().addScaledVector(dir, 40), fov: c.fov, roll: 0 };
    this.navLock = this.time + PASS_END + 1;
  }

  private startReturn() {
    this.mode = "return";
    this.modeT = 0;
    this.ui.clearChapter();
    this.ui.uiOn(false);
    this.navLock = this.time + 2.2;
  }

  // ---------------------------------------------------------------- input

  private bindInput() {
    let wheelAcc = 0;
    let wheelT = 0;
    addEventListener(
      "wheel",
      (e) => {
        if ((e.target as HTMLElement).closest?.(".panel") && this.panelScrolls(e)) return;
        e.preventDefault();
        const now = performance.now();
        if (now - wheelT > 400) wheelAcc = 0;
        wheelT = now;
        wheelAcc += e.deltaY;
        if (Math.abs(wheelAcc) > 60) {
          this.step(Math.sign(wheelAcc));
          wheelAcc = 0;
        }
      },
      { passive: false },
    );
    let touchY = 0;
    addEventListener("touchstart", (e) => (touchY = e.touches[0].clientY), { passive: true });
    addEventListener(
      "touchend",
      (e) => {
        const dy = touchY - e.changedTouches[0].clientY;
        if (Math.abs(dy) > 50 && !(e.target as HTMLElement).closest?.(".panel")) this.step(Math.sign(dy));
      },
      { passive: true },
    );
    addEventListener("keydown", (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (this.mode === "ready" && (e.key === "Enter" || e.key === " ")) return;
      if (["ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        this.step(1);
      } else if (["ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        this.step(-1);
      } else if (e.key === "Home") this.go(0);
      else if (e.key === "End") this.go(this.ui.chapters.length - 1);
      else if (e.key === "Escape" && this.mode === "intro") this.skipIntro();
    });
    for (const a of $$<HTMLAnchorElement>("[data-rail]")) {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.go(Number(a.dataset.rail));
      });
    }
    $<HTMLAnchorElement>("[data-next]")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.go(1);
    });
    addEventListener("pointermove", (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    this.canvas.addEventListener("click", (e) => this.onCanvasClick(e));
    // Chapter overlays let clicks through to the canvas on empty space.
    document.querySelector(".chapters")?.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a,button,textarea,input,.panel,.cover")) return;
      this.onCanvasClick(e as MouseEvent);
    });
    for (const card of $$<HTMLElement>("[data-skill]")) {
      const on = () => this.city?.lightSkill(card.dataset.skill ?? null);
      const off = () => this.city?.lightSkill(null);
      card.addEventListener("pointerenter", on);
      card.addEventListener("focus", on);
      card.addEventListener("pointerleave", off);
      card.addEventListener("blur", off);
    }
    const form = $<HTMLFormElement>("[data-letter]");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      const ta = $<HTMLTextAreaElement>("textarea", form);
      const text = ta?.value.trim() ?? "";
      this.city?.releaseLantern(this.time);
      const thanks = $<HTMLElement>("[data-thanks]", form);
      if (thanks) thanks.hidden = false;
      const mail = $<HTMLAnchorElement>("[data-mail]", form);
      if (mail && text) mail.href = mail.href.split("&body=")[0] + "&body=" + encodeURIComponent(text);
    });
  }

  private panelScrolls(e: WheelEvent) {
    const p = (e.target as HTMLElement).closest(".panel") as HTMLElement | null;
    if (!p || p.scrollHeight <= p.clientHeight + 2) return false;
    if (e.deltaY > 0 && p.scrollTop + p.clientHeight < p.scrollHeight - 1) return true;
    if (e.deltaY < 0 && p.scrollTop > 0) return true;
    return false;
  }

  private step(dir: number) {
    if (this.mode === "intro") {
      this.skipIntro();
      return;
    }
    if (this.mode === "cover" || this.mode === "city") this.go(this.chapter + dir);
  }

  private onCanvasClick(e: MouseEvent) {
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (this.mode === "intro") {
      this.skipIntro();
      return;
    }
    if (this.mode === "cover") this.world.click(ndc, this.time);
    else if (this.mode === "city") this.city?.click(ndc, this.time);
  }

  // ---------------------------------------------------------------- frame

  private loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(0.05, rawDt);
    this.frameMs = this.frameMs * 0.9 + rawDt * 1000 * 0.1;
    if (this.mode === "loading" || this.mode === "ready") return;
    this.time += dt;
    this.modeT += dt;
    G.uTime.value = this.time;
    const pl = this.pl;
    pl.time = this.time;
    this.quality.update(dt, pl.timer.total, this.frameMs, this.time);
    this.pointerSmooth.lerp(this.pointer, 1 - Math.exp(-dt * 2.5));

    // Fades (skip, returns).
    const fs = this.fadeTarget > this.fade ? 3.2 : 1.6;
    this.fade += Math.sign(this.fadeTarget - this.fade) * Math.min(Math.abs(this.fadeTarget - this.fade), dt * fs);
    if (this.pendingJump && Math.abs(this.fade - this.fadeTarget) < 1e-3) {
      const f = this.pendingJump;
      this.pendingJump = null;
      f();
    }

    pl.beginFrame();
    switch (this.mode) {
      case "intro":
        this.frameIntro(dt);
        break;
      case "cover":
        this.frameCover(dt);
        break;
      case "passage":
        this.framePassage(dt);
        break;
      case "city":
        this.frameCity(dt);
        break;
      case "return":
        this.frameReturn(dt);
        break;
    }
    pl.post.fade = Math.max(pl.post.fade, this.fade);
    pl.finish();
  };

  private frameIntro(dt: number) {
    const pl = this.pl;
    this.introT += dt * this.introSpeed;
    const T = this.introT;
    const f = this.director.intro(T, pl, this.time);
    if (f.stage === "black") {
      pl.renderer.setRenderTarget(pl.scene);
      pl.renderer.setClearColor(0x000000, 1);
      pl.renderer.clear(true, true, false);
      pl.current = pl.scene;
      pl.post.fade = 1 - s(T, 0.62, 0.8);
    } else if (f.stage === "tunnel") {
      this.tunnel.render(pl);
    } else {
      this.world.update(dt);
      this.world.render(pl, this.time);
      pl.post.exposure = this.world.atmos.exposure * this.director.exposureBoost;
    }
    if (!this.uiShown && T >= T_COVER_UI) {
      this.uiShown = true;
      this.enterCover();
      this.mode = "intro"; // keep the intro running until the camera settles
    }
    if (T >= T_INTRO_END) this.mode = "cover";
  }

  private coverPose(out: Pose) {
    // Gentle parallax from the pointer.
    const p = this.pointerSmooth;
    out.pos.copy(P_COVER.pos).add(new THREE.Vector3(p.x * 1.2, p.y * 0.5, 0));
    out.target.copy(P_COVER.target).add(new THREE.Vector3(p.x * 0.6, p.y * 0.4, 0));
    out.fov = P_COVER.fov;
    out.roll = 0;
    return out;
  }

  private frameCover(dt: number) {
    const w = this.world;
    const pl = this.pl;
    this.director.night(pl);
    w.setPose(this.coverPose(this.tmpPose));
    w.update(dt);
    w.render(pl, this.time);
    pl.post.exposure = w.atmos.exposure;
  }

  private framePassage(dt: number) {
    const t = this.modeT;
    const w = this.world;
    const pl = this.pl;
    if (t < PASS_SWITCH) {
      this.director.night(pl);
      // Approach the torii along its axis, then press into the membrane.
      const a = ease(clamp01(t / PASS_APPROACH));
      const b = ease(clamp01((t - PASS_APPROACH) / (PASS_SWITCH - PASS_APPROACH)));
      const axis = pose(0, 5.8, 18, 0, 6.2, 0, 44);
      const touch = pose(0, 5.9, 0.9, 0, 6.0, -10, 58);
      lerpPose(this.passFrom, axis, a, this.tmpPose);
      if (b > 0) lerpPose(this.tmpPose, touch, b, this.tmpPose);
      w.setPose(this.tmpPose);
      w.portal.intensity = s(t, 0.2, 1.4);
      if (t > PASS_APPROACH && !this.rippled) {
        this.rippled = true;
        w.portal.ripple(0.5, 0.5, this.time, 1);
      }
      w.update(dt);
      w.render(pl, this.time);
      pl.post.exposure = w.atmos.exposure * (1 + 1.5 * b);
      this.dive.amount = s(t, PASS_APPROACH + 0.25, PASS_SWITCH - 0.1);
      this.dive.white = s(t, PASS_SWITCH - 0.45, PASS_SWITCH);
    } else {
      if (!this.switched) {
        this.switched = true;
        this.ui.world("b");
        this.city!.arrive(this.time);
        w.portal.intensity = 0;
      }
      this.city!.update(dt, this.time);
      this.city!.render(pl);
      const k = clamp01((t - PASS_SWITCH) / (PASS_END - PASS_SWITCH));
      this.dive.amount = 1 - s(k, 0.1, 1);
      this.dive.white = 1 - s(k, 0, 0.6);
      if (t >= PASS_END) {
        this.switched = false;
        this.rippled = false;
        this.dive.amount = this.dive.white = 0;
        this.mode = "city";
        this.chapter = Math.max(1, this.wantChapter);
        this.wantChapter = -1;
        if (this.chapter !== 1) this.city!.goChapter(this.chapter, this.time);
        this.ui.uiOn(true);
      }
    }
    this.applyDive();
  }

  private rippled = false;
  private switched = false;

  private frameCity(dt: number) {
    const c = this.city!;
    c.pointer(this.pointerSmooth.x, this.pointerSmooth.y);
    c.update(dt, this.time);
    c.render(this.pl);
    if (c.settled && this.ui.active !== this.chapter) this.ui.setChapter(this.chapter);
    this.applyDive();
  }

  private frameReturn(dt: number) {
    const t = this.modeT;
    const pl = this.pl;
    if (t < 0.7) {
      this.city!.update(dt, this.time);
      this.city!.render(pl);
      this.dive.amount = s(t, 0, 0.6);
      this.dive.white = s(t, 0.3, 0.7);
    } else {
      if (!this.switched) {
        this.switched = true;
        this.ui.world("a");
      }
      this.frameCover(dt);
      const k = clamp01((t - 0.7) / 1.3);
      this.dive.amount = 1 - s(k, 0.1, 1);
      this.dive.white = 1 - s(k, 0, 0.6);
      if (t >= 2.0) {
        this.switched = false;
        this.dive.amount = this.dive.white = 0;
        this.mode = "cover";
        this.chapter = 0;
        this.ui.uiOn(true);
        this.ui.setChapter(0);
      }
    }
    this.applyDive();
  }

  private applyDive() {
    if (!this.dive.active) return;
    const pl = this.pl;
    const dst = pl.nextFx();
    this.dive.render(pl.renderer, pl.current.texture, dst, this.time);
    pl.current = dst;
  }
}

function frame() {
  return new Promise<void>((r) => requestAnimationFrame(() => r()));
}
