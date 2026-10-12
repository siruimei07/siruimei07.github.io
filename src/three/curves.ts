// Plane curves in 1920×1080 frame pixels, reparametrised by arc length so
// plates sit evenly along them and can slide by whole pitches.

export type Vec2 = { x: number; y: number };

/** The overview's figure-eight; views/home.ts draws it flat and places the leader anchors on it. */
export const INF = { cx: 960, cy: 550, a: 430, flat: 0.92 } as const;

export function lemniscate(t: number, out: Vec2): Vec2 {
  const s = Math.sin(t);
  const c = Math.cos(t);
  const d = 1 + s * s;
  out.x = INF.cx + (INF.a * c) / d;
  out.y = INF.cy + (INF.flat * INF.a * s * c) / d;
  return out;
}

/** The section chain: rises from below the bottom edge and leaves past the left
 *  edge, under the logotype tile (frame px, anchored to the viewport's left/bottom). */
const CHAIN: [number, number][] = [
  [620, 1230],
  [540, 950],
  [300, 810],
  [-190, 712],
];

export function chainPath(t: number, out: Vec2): Vec2 {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  out.x = a * CHAIN[0][0] + b * CHAIN[1][0] + c * CHAIN[2][0] + d * CHAIN[3][0];
  out.y = a * CHAIN[0][1] + b * CHAIN[1][1] + c * CHAIN[2][1] + d * CHAIN[3][1];
  return out;
}

/** A curve f(t), t0..t1, with a lookup from arc-length fraction back to t. */
export class ArcCurve {
  readonly length: number;
  private table: Float32Array;
  /** Cumulative arc length at each uniform step of t. */
  private cum: Float64Array;

  constructor(
    readonly fn: (t: number, out: Vec2) => Vec2,
    readonly t0: number,
    readonly t1: number,
    samples = 2048,
  ) {
    const cum = new Float64Array(samples + 1);
    const p = { x: 0, y: 0 };
    fn(t0, p);
    let px = p.x;
    let py = p.y;
    for (let i = 1; i <= samples; i++) {
      fn(t0 + ((t1 - t0) * i) / samples, p);
      cum[i] = cum[i - 1] + Math.hypot(p.x - px, p.y - py);
      px = p.x;
      py = p.y;
    }
    this.length = cum[samples];
    this.cum = cum;
    // invert: uniform arc-length grid → t
    this.table = new Float32Array(samples + 1);
    let j = 0;
    for (let i = 0; i <= samples; i++) {
      const target = (this.length * i) / samples;
      while (j < samples - 1 && cum[j + 1] < target) j++;
      const seg = cum[j + 1] - cum[j] || 1;
      const f = Math.min(1, Math.max(0, (target - cum[j]) / seg));
      this.table[i] = t0 + ((t1 - t0) * (j + f)) / samples;
    }
  }

  /** Parameter at arc-length fraction s (0..1, clamped). */
  tAt(s: number): number {
    const n = this.table.length - 1;
    const x = Math.min(1, Math.max(0, s)) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    return this.table[i] * (1 - f) + this.table[i + 1] * f;
  }

  /** Arc-length fraction (0..1) at parameter t: the inverse of tAt(). */
  sAt(t: number): number {
    const n = this.cum.length - 1;
    const x = Math.min(1, Math.max(0, (t - this.t0) / (this.t1 - this.t0))) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    return (this.cum[i] * (1 - f) + this.cum[i + 1] * f) / (this.length || 1);
  }

  at(t: number, out: Vec2): Vec2 {
    return this.fn(t, out);
  }
}
