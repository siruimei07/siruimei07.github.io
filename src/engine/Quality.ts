// Adaptive quality. Measures real GPU time (timer queries) — or CPU frame
// time when timer queries are unavailable — and walks a ladder of tiers so the
// page holds 60 fps: step down quickly when over budget, probe upward slowly
// when there is plenty of headroom.

export type TierName = "ultra" | "high" | "medium" | "low";

export type Tier = {
  name: TierName;
  scale: number; // render resolution relative to CSS px × DPR
  maxPixels: number; // hard cap on render pixels
  msaa: number;
  particles: number; // multiplier for particle / instance counts
  bloomLevels: number;
};

export const TIERS: Tier[] = [
  { name: "low", scale: 0.6, maxPixels: 1280 * 720, msaa: 0, particles: 0.4, bloomLevels: 4 },
  { name: "medium", scale: 0.8, maxPixels: 1920 * 1080, msaa: 2, particles: 0.65, bloomLevels: 5 },
  { name: "high", scale: 0.9, maxPixels: 2304 * 1296, msaa: 4, particles: 1, bloomLevels: 6 },
  { name: "ultra", scale: 1, maxPixels: 2560 * 1440, msaa: 4, particles: 1, bloomLevels: 6 },
];

export const tierIndex = (n: TierName) => TIERS.findIndex((t) => t.name === n);

export class Quality {
  index: number;
  locked: boolean;
  onChange: (t: Tier) => void = () => {};
  private over = 0;
  private under = 0;
  private cooldown = 2;
  private justUpgraded = false;
  private failedUp = new Map<number, number>(); // tier index -> time when an upgrade to it failed

  constructor(initial: TierName | null, lockedName: TierName | null) {
    this.locked = !!lockedName;
    this.index = tierIndex(lockedName ?? initial ?? "high");
  }

  get current() {
    return TIERS[this.index];
  }

  /** Pin a tier (SYSTEM screen) or hand control back to the governor. */
  lock(name: TierName | null) {
    this.locked = !!name;
    if (name) this.set(tierIndex(name));
  }

  set(index: number) {
    const i = Math.max(0, Math.min(TIERS.length - 1, index));
    if (i === this.index) return;
    this.index = i;
    this.over = this.under = 0;
    this.cooldown = 1.5;
    this.onChange(this.current);
  }

  // gpuMs: smoothed GPU ms per frame (0 if unknown); frameMs: CPU frame delta.
  update(dt: number, gpuMs: number, frameMs: number, now: number) {
    if (this.locked) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const cost = gpuMs > 0 ? gpuMs : frameMs * 0.8;
    const overBudget = gpuMs > 0 ? cost > 12.5 : frameMs > 19;
    const headroom = gpuMs > 0 ? cost < 6.5 : frameMs < 15 && frameMs > 0;
    this.over = overBudget ? this.over + dt : Math.max(0, this.over - dt * 2);
    this.under = headroom ? this.under + dt : 0;
    if (this.over > 0.6 && this.index > 0) {
      if (this.justUpgraded) this.failedUp.set(this.index, now);
      this.justUpgraded = false;
      this.set(this.index - 1);
      return;
    }
    const failedAt = this.failedUp.get(this.index + 1) ?? -1e9;
    if (this.under > 4 && this.index < TIERS.length - 1 && now - failedAt > 30) {
      this.set(this.index + 1);
      this.justUpgraded = true;
      return;
    }
    if (this.under > 1) this.justUpgraded = false;
  }
}
