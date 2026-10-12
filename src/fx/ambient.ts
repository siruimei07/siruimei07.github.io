// The ambient layer and the global pointer (MOTION-SPEC §8.0, work package B).
// #rl-ambient sits just before the 3D canvas, so it paints over the body and
// under the plates and every screen: the paper's vignette (B-01), two faint
// drifting helices (B-02), the cursor's grid lamp (B-03) and crosshair with
// its PV-px readout (B-04), paper click halos (B-06) and the overview's pop
// squares (B-10). It also drives the depth parallax of [data-depth] (B-05),
// the HUD tags' double blinks (B-07) and the hex lamp inside each section
// glass (B-08), and publishes rl:idle / rl:paper (src/fx/pointer.ts).
//
// Everything that moves lives in one field that never reaches under a
// section's glass (its backdrop-filter would re-blur every frame) and, on the
// overview, has soft holes cut round the copy. It stops while the tab is
// hidden or the opening plays, is static under reduced motion and on phones,
// and costs a few transform writes per frame while the pointer moves.
// Self-starting on import; nothing here may throw into the app.

import { F, FINE_QUERY, PHONE_QUERY, POINTER_RATE, TICK, approach, onFrame, unit } from "../app/fx.ts";
import { createBlinks } from "./blink.ts";
import { helixSvg } from "./helix.ts";
import { onPointer, pointer, startPointer, type PaperDetail } from "./pointer.ts";
import { createPops, type Box } from "./pops.ts";

/** The field stays this far left of a section's panel: the glass's 6° tilt reaches ≈ 34u past it, the parallax 5u more. */
const PANEL_MARGIN = 48;
/** Margin of the soft holes round the overview's copy, PV px. */
const COPY_MARGIN = 16;
/** The chrome's own text, which the reticle and its readout never print over. */
const CHROME_TEXT = ".brand a, .pager, .rail__nav, .rail__note, .rail__log, .foot-sect, .foot-sign, .caption";
/** Margin round that text, PV px. */
const CHROME_MARGIN = 8;
/** Parallax travel of the nearest layer (depth 3.3), PV px (atlas §6.10). */
const PARALLAX = 10;
/** The readout ticks "on threes", like the PV's micro-text. */
const READOUT_MS = 3 * TICK;
/** The paper halo (atlas R9): 12 frames. */
const HALO_MS = F(12);

type Glass = { el: HTMLElement; screen: HTMLElement; lamp: HTMLElement; spot: HTMLElement; rect: DOMRect; w: number; h: number; left: number; top: number };

function start() {
  const html = document.documentElement;
  const mq = { phone: matchMedia(PHONE_QUERY), fine: matchMedia(FINE_QUERY), os: matchMedia("(prefers-reduced-motion: reduce)") };

  // ───────── the layer ─────────

  const root = document.createElement("div");
  root.id = "rl-ambient";
  root.setAttribute("aria-hidden", "true");
  root.dataset.tc = "";
  // right: 272u between crossings, 8 base pairs to each; left: drawn 1.4× larger (it is nearer), 380u
  const right = helixSvg({ width: 220, length: 9 * 272, pitch: 272, amp: 96, strand: 12, rung: 5 });
  const left = helixSvg({ width: 300, length: 1200 + 380, pitch: 380, amp: 134, strand: 17, rung: 7 });
  root.innerHTML = `<i class="amb__paper"></i><div class="amb__field"><div class="amb__deep" data-depth="1"><div class="amb__helix amb__helix--right">${right}</div><div class="amb__helix amb__helix--left">${left}</div><div class="amb__pops"></div></div><div class="amb__lamp"><i class="amb__grid"></i></div><div class="amb__cross"><i></i><i></i><i></i><i></i><span class="amb__xy">X 0000 · Y 0000</span></div><div class="amb__halos"></div></div>`;
  const gl = document.getElementById("gl");
  if (gl) gl.before(root);
  else document.body.append(root);
  const $ = (sel: string) => root.querySelector<HTMLElement>(sel)!;
  const field = $(".amb__field");
  const deep = $(".amb__deep");
  const lampEl = $(".amb__lamp");
  const gridEl = $(".amb__grid");
  const crossEl = $(".amb__cross");
  const xyEl = $(".amb__xy");
  const halos = $(".amb__halos");

  const screens = [...document.querySelectorAll<HTMLElement>(".screen[data-screen]")];
  const home = screens.find((s) => s.dataset.screen === "home") ?? null;
  const active = () => screens.filter((s) => s.classList.contains("is-active"));
  // until the shell mirrors data-phase, "settled" means no entry or exit class
  const settled = (s: HTMLElement) =>
    s.classList.contains("is-active") && (s.dataset.phase ? s.dataset.phase === "settled" : !s.classList.contains("is-entering") && !s.classList.contains("is-leaving"));

  // the hex lamp: the glass's own honeycomb, lit near the cursor (B-08)
  const glasses: Glass[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(".sect__glass")) {
    const screen = el.closest<HTMLElement>(".screen");
    if (!screen) continue;
    const lamp = document.createElement("i");
    lamp.className = "glass__lamp";
    lamp.setAttribute("aria-hidden", "true");
    const spot = document.createElement("i");
    lamp.append(spot);
    el.prepend(lamp);
    glasses.push({ el, screen, lamp, spot, rect: el.getBoundingClientRect(), w: 0, h: 0, left: 0, top: 0 });
  }

  // ───────── gates ─────────

  const g = { ready: false, booting: false, hidden: document.hidden, reduced: false, phone: mq.phone.matches, fine: mq.fine.matches };
  const live = () => g.ready && !g.booting && !g.hidden && !g.reduced && !g.phone;
  const pointerFx = () => live() && g.fine;

  // ───────── keep-out geometry (cached; never read per frame) ─────────

  /** The resting section panel plus its margin, while a section is on screen. */
  let panel: Box | null = null;
  /** The overview's copy, measured while it stands still (its builds type and slide it). */
  let copy: Box[] = [];
  let copyStale = true;
  /** The chrome's visible text blocks (fixed: chrome never moves; the caption's width follows its line). */
  let chrome: Box[] = [];
  let depthEls: HTMLElement[] = [deep];
  let depthDirty = true;
  /** The readout's width (fixed: tabular digits), for the reticle's box. */
  let readoutW = 0;
  /** CSS px per PV px, re-read with the layout (matchMedia is not for every frame). */
  let U = unit();

  const frameOrigin = () => ({ x: innerWidth / 2 - 960 * U, y: innerHeight / 2 - 540 * U });
  const boxOf = (r: DOMRect, m: number): Box => ({ l: r.left - m, t: r.top - m, r: r.right + m, b: r.bottom + m });
  const boxes = (sel: string, scope: ParentNode, m: number) =>
    [...scope.querySelectorAll(sel)]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => boxOf(r, m));

  // a soft-edged luminance mask with a hole round each block of copy
  const holeMask = (bs: Box[]) => {
    const w = innerWidth;
    const h = innerHeight;
    const holes = bs.map((b) => `<rect x='${b.l.toFixed(0)}' y='${b.t.toFixed(0)}' width='${(b.r - b.l).toFixed(0)}' height='${(b.b - b.t).toFixed(0)}'/>`).join("");
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><filter id='f' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='${(6 * U).toFixed(1)}'/></filter><mask id='m'><rect x='-60' y='-60' width='${w + 120}' height='${h + 120}' fill='white'/><g filter='url(%23f)'>${holes}</g></mask><rect width='${w}' height='${h}' mask='url(%23m)'/></svg>`;
    return `url("data:image/svg+xml;utf8,${svg}")`;
  };
  let maskFor = "";
  const setMask = (bs: Box[]) => {
    const v = bs.length ? holeMask(bs) : "";
    if (v === maskFor) return;
    maskFor = v;
    field.style.setProperty("-webkit-mask-image", v || null);
    field.style.setProperty("mask-image", v || null);
  };

  /** Re-measures what the field must avoid: on resize, navigation and phase changes only. */
  const relayout = () => {
    const u = (U = unit());
    const sect = active().find((s) => s !== home);
    panel = null;
    if (sect && !g.phone) {
      // layout offsets ignore the shell's transforms and the parallax: the glass's resting place
      const p = sect.querySelector<HTMLElement>(".sect__panel");
      if (p?.offsetWidth) {
        const m = PANEL_MARGIN * u;
        panel = { l: p.offsetLeft - m, t: p.offsetTop - m, r: p.offsetLeft + p.offsetWidth + m, b: p.offsetTop + p.offsetHeight + m };
      }
    }
    if (home && copyStale && !(home.classList.contains("is-active") && !settled(home))) {
      copy = boxes(".home__co, .home__id, .home__centre, .home__hint", home, COPY_MARGIN * u);
      copyStale = false;
    }
    chrome = [...document.querySelectorAll(CHROME_TEXT)]
      .filter((el) => (typeof el.checkVisibility === "function" ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width && r.height)
      .map((r) => boxOf(r, CHROME_MARGIN * u));
    // a section on screen (even one still leaving): the field ends left of its glass
    field.style.width = panel ? `${Math.max(0, Math.floor(panel.l))}px` : "";
    setMask(!panel && !g.phone && home?.classList.contains("is-active") ? copy : []);
    for (const x of glasses) if (x.screen.classList.contains("is-active")) x.rect = x.el.getBoundingClientRect();
    readoutW = xyEl.offsetWidth;
    depthEls = [deep, ...active().flatMap((s) => [...s.querySelectorAll<HTMLElement>("[data-depth]")])];
    depthDirty = true;
    kick();
  };

  // ───────── blinks and pop squares ─────────

  const blinks = createBlinks({ enabled: live, settled });
  const pops = createPops($(".amb__pops"), {
    enabled: () => live() && root.dataset.view === "home",
    keepout: () => ({
      boxes: [...copy, ...boxes(".brand, .pager, .foot-sign, .foot-sect, .caption", document, 0)],
      // the leaders' dots on the ∞ (the overview draws them; every circle there is one)
      dots: [...document.querySelectorAll(".home__leaders circle")].map((c) => ({ x: Number(c.getAttribute("cx")) || 0, y: Number(c.getAttribute("cy")) || 0 })).filter((d) => d.x || d.y),
    }),
    origin: frameOrigin,
  });

  // ───────── per-frame pointer effects ─────────

  const par = { x: 0, y: 0 }; // parallax, −1..1 from the viewport centre
  const sm = { x: 0, y: 0 }; // the smoothed pointer (τ 163 ms), for both lamps
  let lampOn = false;
  let crossOn = false;
  let lit: Glass | null = null;
  let aimedAt: Element | null = null;
  let textAt = -Infinity;
  let textFor = "";
  let running = false;
  let handlerMs = 0;
  let frames = 0;
  const samples: number[] = [];

  const writeDepth = (clear: boolean) => {
    const k = PARALLAX * U;
    for (const el of depthEls) {
      if (clear) el.style.removeProperty("translate");
      else {
        const d = Number(el.dataset.depth) / 3.3 || 0;
        el.style.translate = `${(-d * k * par.x).toFixed(2)}px ${(-d * k * par.y).toFixed(2)}px`;
      }
    }
  };

  const frame = (_now: number, dt: number): boolean | void => {
    const t0 = performance.now();
    frames++;
    const fx = pointerFx();
    let busy = false;
    const u = U;

    // B-05: every layer leans against the pointer from the centre, the nearest by 10u at most
    const on = fx && pointer.inside;
    const tx = on ? Math.max(-1, Math.min(1, (pointer.x / innerWidth) * 2 - 1)) : 0;
    const ty = on ? Math.max(-1, Math.min(1, (pointer.y / innerHeight) * 2 - 1)) : 0;
    const was = par.x + par.y * 7;
    // a leave or blur glides home; reduced motion and the phone layout drop it at once
    const snap = g.reduced || g.phone;
    par.x = snap ? 0 : approach(par.x, tx, POINTER_RATE, dt);
    par.y = snap ? 0 : approach(par.y, ty, POINTER_RATE, dt);
    if (Math.abs(par.x - tx) < 3e-4 && Math.abs(par.y - ty) < 3e-4) {
      par.x = tx;
      par.y = ty;
    } else busy = true;
    if (depthDirty || was !== par.x + par.y * 7) {
      writeDepth(!fx && !par.x && !par.y);
      depthDirty = false;
    }

    // B-03 / B-08: both lamps glide after the pointer
    if (lampOn || lit) {
      sm.x = approach(sm.x, pointer.x, POINTER_RATE, dt);
      sm.y = approach(sm.y, pointer.y, POINTER_RATE, dt);
      if (Math.abs(sm.x - pointer.x) > 0.05 || Math.abs(sm.y - pointer.y) > 0.05) busy = true;
      else {
        sm.x = pointer.x;
        sm.y = pointer.y;
      }
    }
    if (lampOn) {
      const half = 240 * u;
      const cell = 96 * u;
      const lx = Math.round(sm.x - half);
      const ly = Math.round(sm.y - half);
      // the grid stays put in the world: the inner layer is counter-shifted modulo one cell
      const o = frameOrigin();
      const gx = ((((o.x - lx) % cell) + cell) % cell) - cell;
      const gy = ((((o.y - ly) % cell) + cell) % cell) - cell;
      lampEl.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      gridEl.style.transform = `translate3d(${gx.toFixed(2)}px, ${gy.toFixed(2)}px, 0)`;
    }
    if (lit) {
      // viewport → the glass's own (untilted) box; within a few px under its 6° tilt
      const r = lit.rect;
      const x = ((sm.x - r.left) / r.width) * lit.w - lit.left - 200 * u;
      const y = ((sm.y - r.top) / r.height) * lit.h - lit.top - 200 * u;
      lit.spot.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }

    // B-04: the crosshair sits on the raw pointer; its readout ticks every 109 ms
    if (crossOn) {
      crossEl.style.transform = `translate3d(${Math.round(pointer.x)}px, ${Math.round(pointer.y)}px, 0)`;
      const pad = (v: number) => String(Math.max(0, Math.min(9999, Math.round(v / u)))).padStart(4, "0");
      const text = `X ${pad(pointer.x)} · Y ${pad(pointer.y)}`;
      if (text !== textFor) {
        if (t0 - textAt >= READOUT_MS - 1) {
          xyEl.textContent = text;
          textFor = text;
          textAt = t0;
        } else busy = true;
      }
    }

    if (import.meta.env.DEV) {
      samples.push(performance.now() - t0 + handlerMs);
      if (samples.length > 300) samples.shift();
    }
    handlerMs = 0;
    if (!busy) {
      running = false;
      return false;
    }
  };

  // the shared frame loop must never see an exception from here: it would stop every animation
  const tick = (now: number, dt: number) => {
    try {
      return frame(now, dt);
    } catch (e) {
      running = false;
      console.warn("[ambient]", e);
      return false;
    }
  };
  function kick() {
    if (running) return;
    running = true;
    onFrame(tick);
  }
  const safe = (fn: () => void) => () => {
    try {
      fn();
    } catch (e) {
      console.warn("[ambient]", e);
    }
  };

  /** Which lamps show, and over which glass; after every move, leave and gate change. */
  const aim = () => {
    const fx = pointerFx();
    const inside = fx && pointer.inside;
    const overPanel = !!panel && pointer.x >= panel.l && pointer.x <= panel.r && pointer.y >= panel.t && pointer.y <= panel.b;
    const wantLamp = inside && !overPanel && html.dataset.idle !== "1";
    // the reticle and its readout fade rather than be cut by a hole or the field's edge
    const u = U;
    const cb = { l: pointer.x - 28 * u, t: pointer.y - 28 * u, r: pointer.x + 16 * u + readoutW, b: pointer.y + 16 * u + 12 };
    const hit = (b: Box) => cb.l < b.r && cb.r > b.l && cb.t < b.b && cb.b > b.t;
    // …and never print over the chrome's text: section line, signature, caption, rail, lockup
    const cut = (panel && cb.r > panel.l) || (maskFor && copy.some(hit)) || chrome.some(hit);
    const wantCross = wantLamp && pointer.paper && !cut;
    // a lamp that has been out fades in where the pointer is, not where it was
    if (wantLamp && !lampOn && !lit) {
      sm.x = pointer.x;
      sm.y = pointer.y;
    }
    if (wantLamp !== lampOn) root.classList.toggle("is-lamp", (lampOn = wantLamp));
    if (wantCross !== crossOn) root.classList.toggle("is-cross", (crossOn = wantCross));
    // the hex lamp only on a still screen: during the entry the frost (a backdrop-filter) is over it
    const t = inside ? pointer.target : null;
    if (t !== aimedAt || (lit && !settled(lit.screen))) {
      aimedAt = t;
      const el = t?.closest(".sect__glass");
      const next = (el && glasses.find((x) => x.el === el && settled(x.screen))) || null;
      if (next !== lit) {
        lit?.lamp.classList.remove("is-lit");
        if (next && !lit && !lampOn) {
          sm.x = pointer.x;
          sm.y = pointer.y;
        }
        lit = next;
        if (lit) {
          lit.rect = lit.el.getBoundingClientRect();
          lit.w = lit.el.offsetWidth;
          lit.h = lit.el.offsetHeight;
          // the lamp's box starts where the glass's ::after honeycomb does, 48% in
          lit.left = lit.el.clientLeft + 0.48 * lit.el.clientWidth;
          lit.top = lit.el.clientTop;
          lit.lamp.classList.add("is-lit");
        }
      }
    }
    if (fx || par.x || par.y) kick();
  };

  onPointer(
    safe(() => {
      const t0 = performance.now();
      aim();
      handlerMs += performance.now() - t0;
    }),
  );

  // ───────── B-06: the paper halo ─────────

  addEventListener("rl:paper", (e) => {
    if (!g.ready || g.booting || g.reduced || g.hidden) return;
    const { x, y } = (e as CustomEvent<PaperDetail>).detail;
    const r = 50 * U;
    // never cut off by the field's edge at a glass
    if (panel && x + r > panel.l) return;
    // phones: never under the frosted bars (their backdrop-filter would re-blur)
    if (g.phone) {
      const top = document.querySelector(".chrome")?.getBoundingClientRect().bottom ?? 0;
      const bottom = document.querySelector(".rail")?.getBoundingClientRect().top ?? innerHeight;
      if (y - r < top || y + r > bottom) return;
    }
    const h = document.createElement("i");
    h.className = "amb__halo";
    h.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    h.innerHTML = "<i></i><i></i><i></i>";
    halos.append(h);
    window.setTimeout(() => h.remove(), HALO_MS + 80);
  });

  // ───────── state ─────────

  const sync = () => {
    g.booting = html.classList.contains("is-booting");
    g.reduced = html.dataset.motion ? html.dataset.motion === "reduced" : mq.os.matches;
    g.phone = mq.phone.matches;
    g.fine = mq.fine.matches;
    g.hidden = document.hidden;
    root.classList.toggle("is-on", g.ready && !g.booting);
    root.classList.toggle("is-live", live());
    // the overview's pieces leave with the overview, not at the click
    const view = home && active().includes(home) ? "home" : "sect";
    if (root.dataset.view !== view) root.dataset.view = view;
    if (live() && view === "home") pops.start();
    else pops.stop();
    blinks.refresh();
    if (!pointerFx()) {
      root.classList.remove("is-lamp", "is-cross");
      lampOn = crossOn = false;
      lit?.lamp.classList.remove("is-lit");
      lit = null;
      aimedAt = null;
    }
    relayout();
    aim();
  };

  const safeSync = safe(sync);
  let queued = 0;
  const later = () => {
    if (!queued) queued = requestAnimationFrame(() => ((queued = 0), safeSync()));
  };
  const stale = () => {
    copyStale = true;
    later();
  };
  new MutationObserver(later).observe(html, { attributes: true, attributeFilter: ["class", "data-motion", "data-view", "data-screen"] });
  const watch = new MutationObserver(later);
  for (const s of screens) watch.observe(s, { attributes: true, attributeFilter: ["class", "data-phase"] });
  // the chrome lines that retype change size: measured again once a line has stood still a moment
  let retyped = 0;
  const chromeText = new MutationObserver(() => {
    clearTimeout(retyped);
    retyped = window.setTimeout(later, 180);
  });
  for (const el of document.querySelectorAll("[data-caption-text], [data-foot-sect], [data-rail-note], [data-log]")) chromeText.observe(el, { childList: true, characterData: true, subtree: true });
  for (const q of Object.values(mq)) q.addEventListener("change", stale);
  addEventListener("resize", stale);
  addEventListener("rl:nav", later);
  addEventListener("rl:phase", later);
  addEventListener("rl:idle", safe(aim));
  // the layout settles again once the webfonts are in
  void document.fonts.ready.then(stale);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return later();
    // stop at once; everything resumes from where it was
    g.hidden = true;
    pops.stop();
    blinks.stop();
    root.classList.remove("is-live");
  });

  startPointer();
  // the shell marks the opening right after this module runs: decide on the first frame
  requestAnimationFrame(() => {
    g.ready = true;
    safeSync();
  });

  if (import.meta.env.DEV) {
    (window as unknown as { __ambient: unknown }).__ambient = {
      /** B's JS per frame (frame loop plus pointer handlers) over the last 300 frames. */
      stats: () => {
        const n = samples.length;
        const avg = n ? samples.reduce((a, b) => a + b, 0) / n : 0;
        return { frames, samples: n, avg: +avg.toFixed(3), max: +(n ? Math.max(...samples) : 0).toFixed(3), running };
      },
      /** Ambient boxes that reach under a section glass or the overview's copy (should be none). */
      check: () => {
        const out: string[] = [];
        const f = field.getBoundingClientRect();
        for (const s of active()) {
          const gr = s.querySelector(".sect__glass")?.getBoundingClientRect();
          if (gr && f.right > gr.left) out.push(`field under the ${s.dataset.screen} glass: ${f.right.toFixed(0)} > ${gr.left.toFixed(0)}`);
          for (const c of s.querySelectorAll(".home__co, .home__id, .home__centre")) {
            const r = c.getBoundingClientRect();
            if (!copy.some((b) => b.l <= r.left + 1 && b.t <= r.top + 1 && b.r >= r.right - 1 && b.b >= r.bottom - 1)) out.push(`copy outside the holes: ${c.className}`);
          }
        }
        for (const p of root.querySelectorAll(".amb__pop")) {
          const r = p.getBoundingClientRect();
          if (copy.some((b) => r.left < b.r && r.right > b.l && r.top < b.b && r.bottom > b.t)) out.push("pop square on the copy");
        }
        return out;
      },
      state: () => ({ ...g, live: live(), pointerFx: pointerFx(), view: root.dataset.view, lampOn, crossOn, lit: lit?.screen.dataset.screen ?? null, panel, holes: copy.length }),
    };
  }
}

try {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("js")) {
    const go = () => {
      try {
        start();
      } catch (e) {
        console.warn("[ambient] off:", e);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
    else go();
  }
} catch (e) {
  console.warn("[ambient] off:", e);
}
