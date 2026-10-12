// The page-wide pointer signals every effect layer listens to (MOTION-SPEC
// §4.3, B-09): `rl:idle` (+ `html[data-idle]`) once no input has arrived for
// IDLE_MS, and `rl:paper` for a press and release on the page's empty paper,
// which the halo (B) and the plates' ripple (C) answer. It also keeps the
// last hovering pointer for the ambient effects (src/fx/ambient.ts).

import { IDLE_MS, isPaper } from "../app/fx.ts";

export type IdleDetail = { idle: boolean };
export type PaperDetail = { x: number; y: number; pointerType: string };

/** A press that travels this far is a drag (RhineLabUI archive-drag "moved" threshold). */
const TAP_SLOP = 7;
/** …or that lasts longer than this is a hold. */
const TAP_MS = 500;

/** The last mouse or pen position over the page, in viewport px. */
export const pointer = {
  x: 0,
  y: 0,
  /** A hovering pointer is over the window. */
  inside: false,
  /** Its target is paper (not content or a control). */
  paper: false,
  target: null as Element | null,
};

let idle = false;
export const isIdle = (): boolean => idle;

type MoveFn = (e: PointerEvent) => void;
const moveFns = new Set<MoveFn>();
/** Hovering-pointer moves and leaves (`e.type` is "pointermove" or "pointerout"). Touch never reaches here. */
export function onPointer(fn: MoveFn): () => void {
  moveFns.add(fn);
  return () => {
    moveFns.delete(fn);
  };
}

let started = false;

/** Installs the listeners once; they live as long as the page. */
export function startPointer(): void {
  if (started) return;
  started = true;
  const html = document.documentElement;
  const opt = { capture: true, passive: true } as const;

  // ───────── idle ─────────

  let last = performance.now();
  let timer = 0;
  const setIdle = (v: boolean) => {
    if (v === idle) return;
    idle = v;
    if (v) html.dataset.idle = "1";
    else delete html.dataset.idle;
    dispatchEvent(new CustomEvent<IdleDetail>("rl:idle", { detail: { idle: v } }));
  };
  // one timer, re-armed only when it fires: input just stamps the time
  const check = () => {
    timer = 0;
    const left = IDLE_MS - (performance.now() - last);
    if (left <= 0) setIdle(true);
    else timer = window.setTimeout(check, left + 1);
  };
  const input = () => {
    last = performance.now();
    setIdle(false);
    if (!timer) timer = window.setTimeout(check, IDLE_MS + 1);
  };
  timer = window.setTimeout(check, IDLE_MS + 1);
  for (const type of ["keydown", "wheel", "touchstart", "scroll"]) addEventListener(type, input, opt);

  // ───────── hovering pointer ─────────

  let lastTarget: EventTarget | null = null;
  addEventListener(
    "pointermove",
    (e) => {
      input();
      if (e.pointerType === "touch") return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
      // closest() over a long selector: only when the target changes
      if (e.target !== lastTarget) {
        lastTarget = e.target;
        pointer.target = e.target instanceof Element ? e.target : null;
        pointer.paper = isPaper(e.target);
      }
      for (const fn of moveFns) fn(e);
    },
    opt,
  );
  const leave = (e: PointerEvent) => {
    if (!pointer.inside) return;
    pointer.inside = false;
    pointer.paper = false;
    lastTarget = null;
    for (const fn of moveFns) fn(e);
  };
  // relatedTarget null: the pointer left the window (or the window lost it)
  document.addEventListener("pointerout", (e) => !e.relatedTarget && e.pointerType !== "touch" && leave(e), opt);
  addEventListener("blur", () => leave(new PointerEvent("pointerout")));

  // ───────── paper taps ─────────

  let down: { id: number; x: number; y: number; t: number; type: string } | null = null;
  addEventListener(
    "pointerdown",
    (e) => {
      input();
      down = null;
      if (!e.isPrimary || e.button !== 0 || html.classList.contains("is-booting") || !isPaper(e.target)) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, type: e.pointerType };
    },
    opt,
  );
  addEventListener(
    "pointermove",
    (e) => {
      if (down && e.pointerId === down.id && Math.hypot(e.clientX - down.x, e.clientY - down.y) >= TAP_SLOP) down = null;
    },
    opt,
  );
  addEventListener(
    "pointerup",
    (e) => {
      const d = down;
      down = null;
      if (!d || e.pointerId !== d.id || e.timeStamp - d.t > TAP_MS) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= TAP_SLOP || !isPaper(e.target)) return;
      dispatchEvent(new CustomEvent<PaperDetail>("rl:paper", { detail: { x: d.x, y: d.y, pointerType: d.type } }));
    },
    opt,
  );
  addEventListener("pointercancel", () => (down = null), opt);
}
