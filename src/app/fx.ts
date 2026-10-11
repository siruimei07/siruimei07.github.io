// Small text effects shared by every screen: typewriter, decode-scramble and
// rolling numbers. Each one returns a cancel function and respects `instant`.

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/#";

type Cancel = () => void;

/** Types `text` into `el` one character at a time. */
export function typeText(el: HTMLElement, text: string, opts: { cps?: number; instant?: boolean; delay?: number } = {}): Cancel {
  if (opts.instant) {
    el.textContent = text;
    return () => {};
  }
  const cps = opts.cps ?? 34;
  const chars = [...text];
  let raf = 0;
  let start = 0;
  el.textContent = "";
  const tick = (now: number) => {
    if (!start) start = now + (opts.delay ?? 0);
    const n = Math.max(0, Math.min(chars.length, Math.floor(((now - start) / 1000) * cps)));
    el.textContent = chars.slice(0, n).join("");
    if (n < chars.length) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = text;
  };
}

/** Letters cycle through glyphs and settle left to right (Latin text only; CJK is left alone). */
export function scramble(el: HTMLElement, opts: { duration?: number; instant?: boolean } = {}): Cancel {
  const target = el.dataset.text ?? el.textContent ?? "";
  el.dataset.text = target;
  if (opts.instant || !/[A-Z0-9]/i.test(target)) {
    el.textContent = target;
    return () => {};
  }
  const dur = opts.duration ?? 420;
  const chars = [...target];
  let raf = 0;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const settled = Math.floor(p * chars.length);
    el.textContent = chars
      .map((c, i) => (i < settled || c === " " || !/[A-Z0-9]/i.test(c) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join("");
    if (p < 1) raf = requestAnimationFrame(tick);
    else el.textContent = target;
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = target;
  };
}

/** Counts an integer up from 0 to `data-count` (or the given value). */
export function rollNumber(el: HTMLElement, opts: { to?: number; duration?: number; instant?: boolean } = {}): Cancel {
  const to = opts.to ?? Number(el.dataset.count ?? el.textContent ?? 0);
  if (opts.instant || !Number.isFinite(to) || to === 0) {
    el.textContent = String(to);
    return () => {};
  }
  const dur = opts.duration ?? 900;
  let raf = 0;
  const t0 = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(to * e));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    el.textContent = String(to);
  };
}
