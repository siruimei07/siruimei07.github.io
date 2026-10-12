// CONTACT behaviour: the C-023 file box builds itself on entry (MOTION-SPEC
// §8.6: wire, end cap, stamp bar, outline, then the fields typed at the PV's
// three rates), the address copies to the clipboard, the Toronto clock rolls
// its digits, and the message form opens the visitor's mail client with the
// text filled in — the rings spin once. The rings also turn their knob toward
// the pointer on a critically damped spring and settle back when idle.

import { contact, identity } from "../content.ts";
import { corners, damp, F, FINE_QUERY, flicker, onFrame, PHONE_QUERY, RLRATE, rollText, SEQ, timeline, typeText, type Cancel, type Spring, type Timeline } from "../app/fx.ts";
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
      tl.cancel();
    },
  };
}

/** The knob of the outer ring sits at 352° (clockwise from 3 o'clock). */
const KNOB = 352;
/** RhineLabUI selection spring (4.2/s) at 1.1×. */
const TURN_RATE = RLRATE(4.2);
/** CT-02: FILE NUMBER at a character a frame, CHANNEL STATUS on twos, OPEN a little slower still. */
const FIELD_RATES = [1, 0.5, 0.45];

export function createContact(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let clockTimer = 0;
  let clockOn = false;
  let entry: Build | null = null;
  let active = false;
  let settled = false;
  let led: HTMLElement | null = null;
  let clock: HTMLElement | null = null;
  const hovered = new Set<HTMLElement>();
  const zone = identity.timezone;
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  let offsetFmt: Intl.DateTimeFormat | null = null;
  try {
    offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" });
  } catch {
    /* older engines: no offset shown */
  }

  const quiet = () => ctx.reduced();

  const set = (sel: string, text: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };

  // ───────── the clock: digits roll (R9 at 1.1×) ─────────

  const tick = () => {
    const now = new Date();
    if (clock) rollText(clock, timeFmt.format(now));
    const p = Object.fromEntries(dateFmt.formatToParts(now).map((x) => [x.type, x.value]));
    set("[data-local-date]", `${p.year}-${p.month}-${p.day} ${String(p.weekday).toUpperCase()}`);
    const off = offsetFmt?.formatToParts(now).find((x) => x.type === "timeZoneName")?.value;
    set("[data-local-zone]", `${off ? `${off} · ` : ""}${identity.homebase.toUpperCase()}`);
  };

  /** Ticks on the second boundary, so the roll lands with the real second. */
  const startClock = () => {
    stopClock();
    clockOn = true;
    const loop = () => {
      // a hidden tab keeps the beat but rolls nothing
      if (!document.hidden) tick();
      clockTimer = window.setTimeout(loop, 1000 - (Date.now() % 1000) + 5);
    };
    loop();
  };

  const stopClock = () => {
    clockOn = false;
    clearTimeout(clockTimer);
  };

  // ───────── rings: turn toward the pointer ─────────

  const turn: Spring = { value: 0, velocity: 0 };
  let turnTarget = 0;
  let turnStop: Cancel | null = null;
  let ringsBox: DOMRect | null = null;
  /** The ring layers that turn (their own <svg>s: a compositor-only rotation). */
  let groups: SVGSVGElement[] = [];

  const paintRings = () => {
    const [a, b, c] = groups;
    const t = turn.value;
    if (a) a.style.transform = t ? `rotate(${t.toFixed(2)}deg)` : "";
    // the inner rings counter-turn a little: parallax inside the emblem
    if (b) b.style.transform = t ? `rotate(${(-0.35 * t).toFixed(2)}deg)` : "";
    if (c) c.style.transform = t ? `rotate(${(0.2 * t).toFixed(2)}deg)` : "";
  };

  const turnTo = (deg: number) => {
    // shortest way round from where the spring is now
    const d = ((((deg - turn.value) % 360) + 540) % 360) - 180;
    turnTarget = turn.value + d;
    turnStop ??= onFrame((_now, dt) => {
      damp(turn, turnTarget, TURN_RATE, dt);
      const still = Math.abs(turn.value - turnTarget) < 0.01 && Math.abs(turn.velocity) < 0.01;
      if (still) {
        turn.value = turnTarget;
        turn.velocity = 0;
      }
      paintRings();
      if (still) {
        turnStop = null;
        return false;
      }
    });
  };

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType === "touch" || !active || !settled || quiet() || !matchMedia(FINE_QUERY).matches || matchMedia(PHONE_QUERY).matches) return;
    ringsBox ??= root.querySelector("[data-rings]")?.getBoundingClientRect() ?? null;
    if (!ringsBox || !ringsBox.width) return;
    const x = e.clientX - (ringsBox.left + ringsBox.width / 2);
    const y = e.clientY - (ringsBox.top + ringsBox.height / 2);
    if (Math.hypot(x, y) < 4) return;
    turnTo((Math.atan2(y, x) * 180) / Math.PI - KNOB);
  };

  const resetRings = () => {
    turnStop?.();
    turnStop = null;
    turn.value = 0;
    turn.velocity = 0;
    turnTarget = 0;
    paintRings();
  };

  // ───────── one-shot effects ─────────

  const spin = () => {
    const emblem = root.querySelector<HTMLElement>("[data-rings]");
    if (!emblem || quiet()) return;
    emblem.classList.remove("is-spin");
    // restart the animation even when sent twice in a row
    void emblem.getBoundingClientRect();
    emblem.classList.add("is-spin");
    // the LED blinks 3 on / 3 off while the emblem turns (CT-04)
    if (led) {
      const stop = flicker(led, SEQ.ledBlink, { loop: true });
      window.setTimeout(stop, F(40));
    }
  };

  /** R9 halo at a control (the copy button's acknowledgement). */
  const halo = (at: HTMLElement) => {
    if (quiet()) return;
    const h = document.createElement("i");
    h.className = "comms__halo";
    h.setAttribute("aria-hidden", "true");
    at.append(h);
    h.animate([{ scale: "0.4", opacity: 1 }, { scale: "1", opacity: 0 }], { duration: F(12), easing: "cubic-bezier(0.16, 1, 0.3, 1)" }).finished.then(
      () => h.remove(),
      () => h.remove(),
    );
  };

  // ───────── entry (§8.6, t0 = dock) ─────────

  /** CT-02: FILE NUMBER, CHANNEL STATUS and OPEN typed one after another; the LED blinks meanwhile. */
  const typeFields = (b: Build, at: number) => {
    const parts = [...root.querySelectorAll<HTMLElement>("[data-type]")];
    const texts = parts.map((el) => (el.dataset.text ??= el.textContent ?? ""));
    parts.forEach((el) => (el.textContent = ""));
    if (led) led.style.visibility = "hidden";
    let blink: Cancel = () => {};
    const steady = () => {
      blink();
      if (led) led.style.visibility = "";
    };
    b.keep(steady);
    const step = (i: number) => {
      if (b.instant) return;
      if (i >= parts.length) {
        steady();
        return;
      }
      if (i === 1 && led) {
        led.style.visibility = "";
        blink = flicker(led, SEQ.ledBlink, { loop: true });
      }
      b.keep(typeText(parts[i], texts[i], { cps: 27.5 * FIELD_RATES[i], pv: i === 0, done: () => step(i + 1) }));
    };
    b.tl.at(at, () => {
      if (b.instant) parts.forEach((el, i) => (el.textContent = texts[i]));
      else step(0);
    });
    // a finish before the cue leaves nothing half typed
    b.keep(() => parts.forEach((el, i) => (el.textContent = texts[i])));
  };

  const dock = () => {
    entry?.finish();
    const b = makeBuild();
    entry = b;
    typeFields(b, F(63));
    const time = root.querySelector<HTMLElement>(".comms__time");
    if (time) b.keep(corners(time, "on", { delay: F(18) }));
    // the clock starts blank and rolls into the time
    stopClock();
    if (clock) rollText(clock, "--:--:--", { instant: true });
    b.tl.at(F(26), () => active && startClock());
    b.keep(() => {
      if (!clockOn && active) startClock();
    });
  };

  const finishAll = () => {
    entry?.finish();
    entry = null;
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      led = root.querySelector("[data-led]");
      clock = root.querySelector("[data-local-time]");
      groups = [".rings__a", ".rings__b", ".rings__c"].map((s) => root.querySelector<SVGSVGElement>(s)).filter((g): g is SVGSVGElement => !!g);
      for (const b of root.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
        b.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(b.dataset.copy!);
            halo(b.parentElement ?? b);
            ctx.toast(contact.copied);
            ctx.log("> COPY MAIL ADDRESS");
          } catch {
            location.href = `mailto:${b.dataset.copy}`;
          }
        });
      }
      // a channel's code flickers on (F2) the first time it is hovered in a visit
      for (const row of root.querySelectorAll<HTMLElement>(".channel")) {
        row.addEventListener("pointerenter", (e) => {
          const code = row.querySelector<HTMLElement>(".channel__no");
          if (e.pointerType !== "mouse" || !code || hovered.has(code) || quiet()) return;
          hovered.add(code);
          flicker(code, SEQ.labelFlicker);
        });
      }
      root.querySelector("[data-rings]")?.addEventListener("animationend", (e) => {
        if ((e as AnimationEvent).animationName === "rings-spin") (e.currentTarget as Element).classList.remove("is-spin");
      });
      root.addEventListener("pointermove", onPointer, { passive: true });
      addEventListener("resize", () => (ringsBox = null));
      addEventListener("scroll", () => (ringsBox = null), { passive: true, capture: true });
      // idle: the rings go back to rest
      addEventListener("rl:idle", (e) => {
        if ((e as CustomEvent<{ idle?: boolean }>).detail?.idle && active) turnTo(0);
      });
      const form = root.querySelector<HTMLFormElement>("[data-letter]");
      const area = form?.querySelector("textarea");
      const chars = form?.querySelector<HTMLElement>("[data-chars]");
      if (chars) rollText(chars, chars.textContent ?? "000", { instant: true });
      area?.addEventListener("input", () => {
        // CT-08: the counter rolls, retargeting as the visitor types
        if (chars) rollText(chars, String(area.value.length).padStart(3, "0"));
      });
      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = (area?.value ?? "").trim();
        const href = `mailto:${identity.email}?subject=${encodeURIComponent(contact.subject)}${text ? `&body=${encodeURIComponent(text)}` : ""}`;
        spin();
        location.href = href;
        const thanks = form.querySelector<HTMLElement>("[data-thanks]");
        if (thanks) thanks.textContent = contact.thanks;
        ctx.log("> TRANSMIT MESSAGE");
      });
    },
    enter() {
      active = true;
      settled = false;
      ringsBox = null;
      hovered.clear();
      resetRings();
      // without the shell's phases (or before the dock) the clock simply runs
      if (typeof ctx.phase !== "function") {
        settled = true;
        startClock();
      }
    },
    phase(p) {
      if (p === "dock") dock();
      else if (p === "settled") {
        finishAll();
        settled = true;
        if (!clockOn) startClock();
      } else if (p === "leave") settled = false;
    },
    finish: finishAll,
    leave() {
      // the exit carries the build as it stands; the next entry restarts it
      active = false;
      settled = false;
      stopClock();
      turnStop?.();
      turnStop = null;
    },
    resize() {
      ringsBox = null;
    },
  };
}
