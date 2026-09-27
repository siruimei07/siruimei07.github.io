// Small DOM and animation helpers shared by the UI modules.

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const ease = {
  linear: (x: number) => x,
  inOut: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  out: (x: number) => 1 - Math.pow(1 - x, 3),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x: number) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  outBack: (x: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  },
  in: (x: number) => x * x * x,
};

/** Runs `fn(progress)` every frame for `ms`; resolves when done. */
export function tween(ms: number, fn: (t: number) => void, e: (x: number) => number = ease.inOut): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      fn(1);
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = clamp01((now - t0) / ms);
      fn(e(k));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A critically damped follower for smooth values that retarget any time. */
export class Spring {
  value: number;
  target: number;
  private v = 0;
  constructor(v = 0, private k = 10) {
    this.value = v;
    this.target = v;
  }
  update(dt: number) {
    const w = this.k;
    const x = this.value - this.target;
    const a = -w * w * x - 2 * w * this.v;
    this.v += a * dt;
    this.value += this.v * dt;
    return this.value;
  }
  snap(v: number) {
    this.value = this.target = v;
    this.v = 0;
  }
}

/** Points of the wavy blot (P3R sub-menu mask), matching the composite shader. */
export function blotPoints(cx: number, cy: number, r: number, wobble: number, time: number, n = 96): string[] {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // shader angle is measured in GL pixel space (y up); CSS y points down
    const ga = -a;
    const rr = r * (1 + wobble * (0.06 * Math.sin(ga * 5 + time * 2) + 0.035 * Math.sin(ga * 9 - time * 3)));
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)}px ${(cy + Math.sin(a) * rr).toFixed(1)}px`);
  }
  return pts;
}

export const blotPolygon = (cx: number, cy: number, r: number, wobble: number, time: number) => `polygon(${blotPoints(cx, cy, r, wobble, time).join(",")})`;

/** The whole viewport minus a shape (evenodd hole), for the layer being left behind. */
export function holeClip(pts: string[]) {
  const w = innerWidth;
  const h = innerHeight;
  return `polygon(evenodd, 0px 0px, ${w}px 0px, ${w}px ${h}px, 0px ${h}px, 0px 0px, ${pts.join(",")}, ${pts[0]})`;
}

export function circlePoints(cx: number, cy: number, r: number, n = 72): string[] {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)}px ${(cy + Math.sin(a) * r).toFixed(1)}px`);
  }
  return pts;
}

/** Distance from a point to the farthest viewport corner (px). */
export function coverRadius(x: number, y: number) {
  const w = innerWidth;
  const h = innerHeight;
  return Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y));
}
