// PROJECT ARCHIVE behaviour (MOTION-SPEC §8.4). Choose a file from the index
// (a vertical tab list). On entry the FILE box stutters on and types its
// number, the record builds beside the cassette, a golden glint runs down the
// index to the chosen row, and at the reveal the cassette scan-prints out of
// its stack. A switch clears the old record (P4), retypes the number, hops the
// corners, glints to the new row, lifts the new cassette and advances the
// chain. The cassette leans toward the pointer, spins its reels while hovered
// and turns under a drag, coasting off with RhineLabUI's inertia (÷1.1).

import { approach, corners, F, FINE_QUERY, maskSlide, onFrame, PHONE_QUERY, POINTER_RATE, RLRATE, retype, smooth3, TICK, timeline, typeText, unit, type Cancel, type Timeline } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

/** A timeline plus the text effects its cues started; finish() lands both on their end state. */
type Build = { tl: Timeline; keep(c: Cancel): void; readonly instant: boolean; finish(): void };

function makeBuild(): Build {
  const tl = timeline();
  const cancels: Cancel[] = [];
  let instant = false;
  return {
    tl,
    keep: (c) => void cancels.push(c),
    get instant() {
      return instant;
    },
    finish() {
      if (instant) return;
      instant = true;
      tl.finish();
      cancels.splice(0).forEach((c) => c());
      // every animation ends on the element's own CSS, so dropping them changes nothing visible
      tl.cancel();
    },
  };
}

/** D11 glint speed along the index, PV px per second at 1.1×. */
const GLINT = 550;
/** Cassette tilt toward the pointer and the drag's reach, degrees. */
const TILT_Y = 4;
const TILT_X = 3;
const YAW_MAX = 25;
/** Reel turntable (M6 at 1.1×): 12.9°/s, eased in over 3636 ms; spin-down half-life 364 ms (M8). */
const REEL_DPS = 12.9;
const REEL_RAMP = F(100) / 1000;
const REEL_HALF = F(10) / 1000;
/** RhineLabUI archive drag: friction 2.4/s, back to rest at the M6 rate. */
const FRICTION = RLRATE(2.4);
const RETURN_RATE = 1.1;

export function createWorks(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let rows: HTMLButtonElement[] = [];
  let cards: HTMLElement[] = [];
  let glint: HTMLElement | null = null;
  let current = 0;
  /** The entry's build and its reveal half, and a file switch in flight. */
  let entry: Build | null = null;
  let hero: Build | null = null;
  let swap: Build | null = null;
  let active = false;
  let settled = false;
  /** Rows whose code has retyped on hover during this visit. */
  const hovered = new Set<number>();
  let idleCorners: Cancel = () => {};
  let idleTimer = 0;

  const phone = () => matchMedia(PHONE_QUERY).matches;
  const fine = () => matchMedia(FINE_QUERY).matches && !phone();
  const quiet = () => ctx.reduced();
  const card = (i = current) => cards.find((c) => Number(c.dataset.fileCard) === i) ?? cards[0];
  const part = <T extends Element = HTMLElement>(c: HTMLElement, sel: string) => c.querySelector<T>(sel);
  const u = () => unit();

  // ───────── building a record ─────────

  /** The record's own build (title, data, CONFIDENTIALITY, ACCESS FILE) from `at` on the build's clock.
   *  Called right after the build is made, so effect delays and timeline offsets agree. */
  const buildRecord = (b: Build, c: HTMLElement, at: number, swapping: boolean) => {
    const { tl } = b;
    const title = part(c, ".file__title");
    if (title) {
      // T12 short: 70u from the right with a focus pull
      tl.play(title, [{ translate: `${70 * u()}px 0`, filter: "blur(4px)" }, { translate: "0 0", filter: "blur(0px)" }], { at: at + F(3), dur: F(14), ease: "expo" });
      tl.play(title, [{ opacity: 0 }, { opacity: 1 }], { at: at + F(3), dur: F(8), ease: "linear" });
    }
    // B5 from +260u, a frame pair apart; the values slide out of their left clip after
    c.querySelectorAll<HTMLElement>(".file__side > div").forEach((row, n) => {
      const t = at + F(26) + n * F(2);
      tl.play(row, [{ translate: `${260 * u()}px 0` }, { translate: "0 0" }], { at: t, dur: F(15), ease: "expo" });
      tl.play(row, [{ opacity: 0 }, { opacity: 1 }], { at: t, dur: F(4), ease: "linear" });
      const v = part(row, "[data-slide]");
      if (v) b.keep(maskSlide(v, { delay: t + F(14) }));
    });
    const conf = part(c, "[data-conf]");
    if (conf) b.keep(typeText(conf, (conf.dataset.text ??= conf.textContent ?? ""), { fixed: F(11), delay: at + F(28) }));
    // on an entry the notes come up under the frost with the occlusion bars; a switch fades them in place (P1)
    const desc = part(c, ".file__desc");
    if (desc && swapping) tl.play(desc, [{ opacity: 0 }, { opacity: 1 }], { at: at + F(30), dur: F(13.5), ease: "p1" });
    const go = part(c, ".file__go");
    // B2 first entrance: wiped in from the left (the bleed keeps the focus ring unclipped)
    if (go) tl.play(go, [{ clipPath: "inset(-10px 100% -10px -10px)" }, { clipPath: "inset(-10px -10px -10px -10px)" }], { at: at + F(44), dur: F(12), ease: "wipe" });
  };

  /** S4 + D9: the stack's shadow pops, the stack follows two frames later, the cassette scan-prints. */
  const buildCassette = (b: Build, c: HTMLElement, at: number, rise: boolean) => {
    const { tl } = b;
    const obj = part(c, ".cassette__obj");
    const shade = part(c, ".cassette__shade");
    const stack = part(c, ".cassette__stack");
    const art = part(c, ".cassette__art");
    if (shade) tl.play(shade, [{ scale: "0.6", opacity: 0 }, { scale: "1", opacity: 1 }], { at, dur: F(15), ease: "expo" });
    if (stack) {
      tl.play(stack, [{ scale: "0.6" }, { scale: "1" }], { at: at + F(2), dur: F(15), ease: "expo" });
      tl.play(stack, [{ opacity: 0 }, { opacity: 1 }], { at: at + F(2), dur: F(4), ease: "linear" });
    }
    if (!art || !obj) return;
    if (rise) {
      // C10: the chosen cassette rises out of its stack
      tl.play(art, [{ translate: `0 ${35 * u()}px` }, { translate: "0 0" }], { at: at + F(2), dur: F(18), ease: "expo" });
      tl.play(art, [{ opacity: 0 }, { opacity: 1 }], { at: at + F(2), dur: F(4), ease: "linear" });
      return;
    }
    // D9 scan-print: solid above the glowing slice, a pale ghost below it (masked from now, so nothing flashes)
    obj.classList.add("is-scan");
    tl.play(obj, [{ "--cas-scan": "0%" }, { "--cas-scan": "100%" }], { at: at + F(2), dur: F(22), ease: "inFade" });
    tl.at(at + F(24), () => obj.classList.remove("is-scan"));
  };

  // ───────── the glint (D11) ─────────

  const rowBox = (i: number) => rows[i]?.parentElement ?? null;

  const setGlow = (i: number | null) => rows.forEach((r, j) => r.classList.toggle("is-glow", j === i));

  /** Runs the glint down the index bars from `from` (a row, or the list top) to row `to`, where it stays as a glow. */
  const runGlint = (b: Build, to: number, from: number | null, at: number) => {
    const li = rowBox(to);
    if (!glint || !li) return;
    if (phone() || quiet()) {
      b.tl.at(at, () => setGlow(to));
      return;
    }
    const h = glint.offsetHeight;
    const centre = (box: HTMLElement) => box.offsetTop + box.offsetHeight / 2 - h / 2;
    const fromBox = from === null ? null : rowBox(from);
    const y0 = fromBox ? centre(fromBox) : -h / 2;
    const y1 = centre(li);
    const dur = Math.max(TICK, (Math.abs(y1 - y0) / (GLINT * u())) * 1000);
    b.tl.at(at, () => setGlow(null));
    b.tl.play(glint, [{ translate: `0 ${y0}px` }, { translate: `0 ${y1}px` }], { at, dur, ease: "linear" });
    // on in one frame, off over 182 ms as the glow takes over under the row's bar
    b.tl.play(glint, [{ opacity: 0 }, { opacity: 1 }], { at, dur: 1, ease: "linear", fill: "forwards" });
    b.tl.play(glint, [{ opacity: 1 }, { opacity: 0 }], { at: at + dur, dur: F(5), ease: "linear", fill: "forwards" });
    b.tl.at(at + dur, () => setGlow(to));
  };

  /** Ambient D11: now and then, while the page idles, a glint runs along one other row. */
  const idleGlint = () => {
    const others = rows.filter((_, i) => i !== current);
    const r = others[(Math.random() * others.length) | 0];
    if (!r || !r.offsetWidth) return;
    const w = r.offsetWidth;
    const dur = (w / (GLINT * u())) * 1000;
    const fade = Math.min(0.9, F(5) / dur);
    r.animate(
      [
        { translate: "-100% 0", opacity: 1 },
        { opacity: 1, offset: 1 - fade },
        { translate: `${w}px 0`, opacity: 0 },
      ],
      { duration: dur, easing: "linear", pseudoElement: "::after" },
    );
  };

  /** B's `rl:idle` (and html[data-idle]) says whether the page has been left alone for 2.3 s. */
  let idle = false;
  const scheduleIdle = () => {
    clearTimeout(idleTimer);
    if (!active || !settled || !idle || quiet() || phone() || rows.length < 2) return;
    idleTimer = window.setTimeout(
      () => {
        if (!document.hidden) idleGlint();
        scheduleIdle();
      },
      6000 + Math.random() * 6000,
    );
  };

  // ───────── the cassette: tilt, reels, drag ─────────

  const cas = {
    rx: 0,
    ry: 0,
    tx: 0,
    ty: 0,
    yaw: 0,
    vel: 0,
    mode: "rest" as "rest" | "drag" | "coast" | "return",
    hover: false,
    ramp: 0,
    spin: 0,
    angle: 0,
  };
  let casStop: Cancel | null = null;
  let rect: DOMRect | null = null;

  const casEls = () => {
    const c = card();
    return { box: part(c, "[data-cassette]"), obj: part(c, ".cassette__obj"), reels: [...c.querySelectorAll<SVGGElement>(".cassette__reel")] };
  };

  const paintCassette = () => {
    const { obj, reels } = casEls();
    if (obj) obj.style.transform = cas.rx || cas.ry || cas.yaw ? `rotateX(${cas.rx.toFixed(3)}deg) rotateY(${(cas.ry + cas.yaw).toFixed(3)}deg)` : "";
    // the small reel turns faster: the same tape speed on a smaller hub
    reels.forEach((g, i) => (g.style.transform = cas.angle ? `rotate(${((cas.angle * (i ? 1.73 : 1)) % 360).toFixed(2)}deg)` : ""));
  };

  const casFrame = (_now: number, dt: number) => {
    cas.rx = approach(cas.rx, cas.tx, POINTER_RATE, dt);
    cas.ry = approach(cas.ry, cas.ty, POINTER_RATE, dt);
    if (cas.mode === "coast") {
      const k = Math.exp(-FRICTION * dt);
      cas.yaw += (cas.vel * (1 - k)) / FRICTION;
      cas.vel *= k;
      if (Math.abs(cas.yaw) >= YAW_MAX) {
        cas.yaw = Math.sign(cas.yaw) * YAW_MAX;
        cas.vel = 0;
      }
      if (Math.abs(cas.vel) < 4) cas.mode = "return";
    } else if (cas.mode === "return") {
      cas.yaw = approach(cas.yaw, 0, RETURN_RATE, dt);
      if (Math.abs(cas.yaw) < 0.01) {
        cas.yaw = 0;
        cas.mode = "rest";
      }
    }
    if (cas.hover) {
      cas.ramp = Math.min(1, cas.ramp + dt / REEL_RAMP);
      cas.spin = REEL_DPS * smooth3(cas.ramp);
    } else {
      cas.spin *= Math.pow(0.5, dt / REEL_HALF);
      if (cas.spin < 0.02) cas.spin = 0;
    }
    cas.angle += cas.spin * dt;
    const still = cas.mode === "rest" && !cas.hover && !cas.spin && Math.abs(cas.rx - cas.tx) < 0.005 && Math.abs(cas.ry - cas.ty) < 0.005;
    if (still) {
      cas.rx = cas.tx;
      cas.ry = cas.ty;
    }
    paintCassette();
    if (still) {
      casStop = null;
      return false;
    }
  };

  const wake = () => {
    if (!casStop && active) casStop = onFrame(casFrame);
  };

  const resetCassette = (c: HTMLElement | null) => {
    if (!c) return;
    const obj = part(c, ".cassette__obj");
    if (obj) obj.style.transform = "";
    c.querySelectorAll<SVGGElement>(".cassette__reel").forEach((g) => (g.style.transform = ""));
  };

  const stopCassette = () => {
    casStop?.();
    casStop = null;
    Object.assign(cas, { rx: 0, ry: 0, tx: 0, ty: 0, yaw: 0, vel: 0, mode: "rest", hover: false, ramp: 0, spin: 0 });
    cards.forEach(resetCassette);
  };

  /** Pointer tilt: rotateY = −nx·4°, rotateX = ny·3°, n relative to the cassette's own centre. */
  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch" || !active || !settled || quiet() || !fine()) return;
    rect ??= casEls().box?.getBoundingClientRect() ?? null;
    if (!rect || !rect.width) return;
    const nx = Math.max(-1, Math.min(1, (e.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.75)));
    const ny = Math.max(-1, Math.min(1, (e.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.75)));
    cas.ty = -nx * TILT_Y;
    cas.tx = ny * TILT_X;
    wake();
  };

  const release = () => {
    cas.tx = 0;
    cas.ty = 0;
    cas.hover = false;
    wake();
  };

  const bindCassette = (box: HTMLElement) => {
    let id: number | null = null;
    let x0 = 0;
    let yaw0 = 0;
    let started = false;
    let samples: { t: number; v: number }[] = [];
    let lastMotion = -Infinity;
    let lastDir = 0;
    box.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || quiet() || !fine() || !active) return;
      // resume the spin-up from the current speed (inverse of the smooth ramp)
      let r = 0;
      const want = cas.spin / REEL_DPS;
      for (let lo = 0, hi = 1, k = 0; k < 18; k++) {
        r = (lo + hi) / 2;
        if (smooth3(r) < want) lo = r;
        else hi = r;
      }
      cas.ramp = r;
      cas.hover = true;
      wake();
    });
    box.addEventListener("pointerleave", (e) => {
      if (e.pointerType === "mouse") {
        cas.hover = false;
        wake();
      }
    });
    box.addEventListener("pointerdown", (e) => {
      if (!active || (e.pointerType === "mouse" && e.button !== 0)) return;
      id = e.pointerId;
      x0 = e.clientX;
      yaw0 = cas.yaw;
      started = false;
      samples = [{ t: e.timeStamp, v: cas.yaw }];
      lastMotion = -Infinity;
      lastDir = 0;
      // a grab during the coast takes over at once
      if (cas.mode === "coast" || cas.mode === "return") {
        cas.mode = "drag";
        cas.vel = 0;
      }
    });
    box.addEventListener("pointermove", (e) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - x0;
      // RhineLabUI: a drag only starts past 10px, so a click stays a click
      if (!started) {
        if (Math.abs(dx) < 10) return;
        started = true;
        cas.mode = "drag";
        box.setPointerCapture(e.pointerId);
        box.classList.add("is-drag");
      }
      const w = box.offsetWidth || 1;
      cas.yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, yaw0 + (dx / w) * 2 * YAW_MAX));
      const prev = samples[samples.length - 1];
      const d = Math.sign(cas.yaw - prev.v);
      if (d) {
        lastMotion = e.timeStamp;
        // a reversal starts a fresh estimate
        if (lastDir && d !== lastDir) samples = [prev];
        lastDir = d;
      }
      samples.push({ t: e.timeStamp, v: cas.yaw });
      samples = samples.filter((s) => e.timeStamp - s.t <= 120).slice(-32);
      wake();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      box.classList.remove("is-drag");
      if (!started) {
        // a grab that never moved lets the turn carry on home
        if (cas.mode === "drag") cas.mode = "return";
        wake();
        return;
      }
      started = false;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const fresh = e.timeStamp - lastMotion <= 80 && last.t - first.t >= 8;
      if (quiet()) {
        // reduced: 1:1 while held, straight back on release
        cas.yaw = 0;
        cas.mode = "rest";
        paintCassette();
        return;
      }
      cas.vel = fresh ? ((last.v - first.v) * 1000) / (last.t - first.t) : 0;
      cas.mode = Math.abs(cas.vel) >= 4 ? "coast" : "return";
      wake();
    };
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
  };

  // ───────── entry ─────────

  const finishAll = () => {
    swap?.finish();
    swap = null;
    entry?.finish();
    entry = null;
    hero?.finish();
    hero = null;
  };

  const startAmbient = () => {
    idleCorners();
    idleCorners = () => {};
    const no = part(card(), ".file__no");
    if (no && !quiet() && !phone()) idleCorners = corners(no, "idle");
    scheduleIdle();
  };

  const stopAmbient = () => {
    idleCorners();
    idleCorners = () => {};
    clearTimeout(idleTimer);
  };

  const dock = () => {
    finishAll();
    const c = card();
    const b = makeBuild();
    entry = b;
    const no = part(c, ".file__no");
    const nov = part(c, ".file__nov");
    if (no) b.keep(corners(no, "on"));
    if (nov) b.keep(typeText(nov, nov.dataset.no ?? nov.textContent ?? "", { cps: 1.4 * 27.5, delay: F(3) }));
    buildRecord(b, c, 0, false);
    // the glow arrives with the glint, not before
    setGlow(null);
    runGlint(b, current, null, F(36));
  };

  const reveal = () => {
    hero?.finish();
    hero = makeBuild();
    buildCassette(hero, card(), 0, false);
  };

  // ───────── switching files ─────────

  /** §8.4 file switch: P4 clear, retyped number and corner hop, glint, cassette lift, chain advance; then the record builds. */
  const switchTo = (prev: number, next: number) => {
    finishAll();
    stopAmbient();
    const old = card(prev);
    const c = card(next);
    // the chain moves one cassette pitch with the list (C's conveyor burst)
    ctx.plates()?.advance?.(next > prev ? 1 : -1);
    if (quiet() || !active) {
      old.classList.remove("is-on", "is-out");
      c.classList.add("is-on");
      setGlow(next);
      if (active && settled) startAmbient();
      return;
    }
    const b = makeBuild();
    swap = b;
    const { tl } = b;
    // the FILE box stays; only its line changes
    old.classList.add("is-out");
    c.classList.add("is-on");
    tl.play(old, [{ opacity: 1 }, { opacity: 0 }], { at: 0, dur: F(13), ease: "p4" });
    tl.at(F(13), () => old.classList.remove("is-on", "is-out"));
    const no = part(c, ".file__no");
    const nov = part(c, ".file__nov");
    const was = part(old, ".file__nov")?.textContent ?? "";
    if (nov) {
      nov.textContent = was;
      b.keep(
        retype(nov, nov.dataset.no ?? "", {
          done: () => {
            if (b.instant || !no) return;
            // D7 hop, then the idle stutter resumes
            b.keep(corners(no, "hop"));
            tl.at(performance.now() - tl.t0 + F(14), () => {
              if (!b.instant && active && settled) startAmbient();
            });
          },
        }),
      );
    }
    runGlint(b, next, prev, 0);
    // the rest of the new record builds once the old one has cleared, plus four frames
    const at = F(13) + F(4);
    buildCassette(b, c, at, true);
    buildRecord(b, c, at, true);
    tl.at(at + F(44) + F(12), () => {
      b.finish();
      if (swap === b) swap = null;
      if (active && settled) startAmbient();
    });
  };

  const select = (i: number, focus = false) => {
    const next = (i + rows.length) % rows.length;
    if (next === current) {
      if (focus) rows[current].focus();
      return;
    }
    const prev = current;
    current = next;
    rows.forEach((r, j) => {
      const on = j === current;
      r.classList.toggle("is-on", on);
      r.setAttribute("aria-selected", String(on));
      r.tabIndex = on ? 0 : -1;
    });
    rect = null;
    switchTo(prev, next);
    if (focus) rows[current].focus();
    rows[current].scrollIntoView({ block: "nearest", inline: "nearest", behavior: quiet() ? "auto" : "smooth" });
    const code = rows[current].querySelector<HTMLElement>("[data-code]")?.dataset.code ?? "";
    ctx.caption(`编号：${code}`);
    ctx.log(`> ACCESS FILE ${code}`);
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      rows = [...root.querySelectorAll<HTMLButtonElement>("[data-file]")];
      cards = [...root.querySelectorAll<HTMLElement>("[data-file-card]")];
      glint = root.querySelector("[data-glint]");
      rows.forEach((r, i) => {
        r.addEventListener("click", () => select(i));
        // the code retypes on its first hover per visit (T3 + T1)
        r.addEventListener("pointerenter", (e) => {
          if (e.pointerType !== "mouse" || hovered.has(i) || quiet() || !active) return;
          hovered.add(i);
          const v = r.querySelector<HTMLElement>("[data-code] > [aria-hidden]");
          if (v) retype(v, r.querySelector<HTMLElement>("[data-code]")?.dataset.code ?? v.textContent ?? "");
        });
      });
      for (const box of root.querySelectorAll<HTMLElement>("[data-cassette]")) bindCassette(box);
      root.addEventListener("pointermove", onPointer, { passive: true });
      root.addEventListener("pointerleave", release);
      addEventListener("blur", release);
      idle = document.documentElement.hasAttribute("data-idle");
      addEventListener("rl:idle", (e) => {
        idle = !!(e as CustomEvent<{ idle?: boolean }>).detail?.idle;
        scheduleIdle();
      });
      addEventListener("scroll", () => (rect = null), { passive: true, capture: true });
    },
    enter() {
      active = true;
      settled = false;
      hovered.clear();
      rect = null;
      // a cassette left mid-turn by the last exit starts square
      stopCassette();
      // without the shell's phases the screen is simply there
      if (typeof ctx.phase !== "function") {
        settled = true;
        setGlow(current);
        startAmbient();
      }
    },
    phase(p) {
      if (p === "dock") dock();
      else if (p === "reveal") reveal();
      else if (p === "settled") {
        finishAll();
        settled = true;
        setGlow(current);
        startAmbient();
      } else if (p === "leave") {
        settled = false;
        stopAmbient();
      }
    },
    finish: finishAll,
    leave() {
      active = false;
      settled = false;
      stopAmbient();
      swap?.finish();
      swap = null;
      // the exit carries the cassette as it is; it is squared on the next entry
      casStop?.();
      casStop = null;
    },
    resize() {
      rect = null;
    },
    key(e) {
      const a = document.activeElement;
      const onRow = rows.includes(a as HTMLButtonElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        // on a row; or in the desktop frame right after entering, when focus is on the screen
        // itself (the promised ↑↓ SELECT FILE). Anywhere else the arrows keep scrolling.
        const fresh = (!a || a === root || a === document.body) && !phone();
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
