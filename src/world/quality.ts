// Adaptive quality: keeps the frame rate at or above 60 by trading internal
// resolution, MSAA and effect budgets. Downgrades quickly when frames drop,
// probes upward slowly, and remembers a tier that failed so it cannot flap.

export type Tier = {
  name: string;
  scale: number; // fraction of the (budget-capped) device resolution
  msaa: number;
  reflection: number; // reflection target size relative to the main target
  particles: number; // fraction of particle budgets drawn
  god: number; // god-ray samples
};

export const TIERS: Tier[] = [
  { name: "LOW", scale: 0.58, msaa: 0, reflection: 0.3, particles: 0.45, god: 20 },
  { name: "MED", scale: 0.72, msaa: 2, reflection: 0.36, particles: 0.7, god: 28 },
  { name: "HIGH", scale: 0.86, msaa: 4, reflection: 0.42, particles: 1, god: 36 },
  { name: "ULTRA", scale: 1, msaa: 4, reflection: 0.6, particles: 1, god: 48 },
];

// Never shade more than a 2560×1440 frame, whatever the display.
export const PIXEL_BUDGET = 2560 * 1440;

const SLOW_MS = 1000 / 56; // below ~56 fps counts as a miss
const GPU_BUDGET_MS = 13.5; // leaves ~3 ms of a 60 Hz frame for CPU + compositor
const PROBE_AFTER_MS = 7000;

export class QualityGovernor {
  tier: number;
  auto = true;
  fps = 60;
  private ema = 16.7;
  private slowFor = 0;
  private stableFor = 0;
  private graceUntil = 0;
  private ceiling = TIERS.length - 1;
  private lastProbe = { tier: -1, at: 0 };

  private initial: number;

  constructor(initial: number) {
    this.initial = Math.max(0, Math.min(TIERS.length - 1, initial));
    this.tier = this.initial;
  }

  get current(): Tier {
    return TIERS[this.tier];
  }

  // Ignore frame times for a while (shader warm-up, resize, tab restore).
  grace(now: number, ms = 1500) {
    this.graceUntil = Math.max(this.graceUntil, now + ms);
    this.slowFor = 0;
    this.stableFor = 0;
  }

  // Returns true when the tier changed. `gpuMs` (0 when unknown) is the
  // measured GPU time per frame; it reveals headroom even under vsync.
  sample(dt: number, now: number, gpuMs = 0): boolean {
    if (dt <= 0 || dt > 250) return false;
    this.ema += (dt - this.ema) * 0.06;
    this.fps += (1000 / dt - this.fps) * 0.08;
    if (!this.auto || now < this.graceUntil) return false;

    if (this.ema > SLOW_MS || gpuMs > GPU_BUDGET_MS) {
      this.slowFor += dt;
      this.stableFor = 0;
    } else {
      this.slowFor = Math.max(0, this.slowFor - dt * 0.5);
      this.stableFor += dt;
    }

    if (this.slowFor > 900 && this.tier > 0) {
      // A probe that failed right away marks its tier as the ceiling.
      if (this.lastProbe.tier === this.tier && now - this.lastProbe.at < 6000) this.ceiling = this.tier - 1;
      this.tier -= 1;
      this.grace(now, 1200);
      return true;
    }
    const headroom = gpuMs > 0 ? gpuMs < GPU_BUDGET_MS * 0.6 : this.ema < 1000 / 59;
    if (this.stableFor > PROBE_AFTER_MS && headroom && this.tier < this.ceiling) {
      this.tier += 1;
      this.lastProbe = { tier: this.tier, at: now };
      this.grace(now, 1500);
      return true;
    }
    return false;
  }

  setManual(tier: number | null, now: number) {
    if (tier === null) {
      this.auto = true;
      this.ceiling = TIERS.length - 1;
      this.tier = this.initial;
    } else {
      this.auto = false;
      this.tier = tier;
    }
    this.grace(now);
  }
}

// A first guess from the GPU string; the governor corrects it within seconds.
export function guessTier(gl: WebGL2RenderingContext, mobile: boolean): number {
  if (mobile) return 0;
  let name = "";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    name = "";
  }
  if (/RTX\s?[2-9]0[6-9]0|RTX\s?[3-9]0[5-9]0|RX\s?[6-9][7-9]\d0|Apple M\d (Pro|Max|Ultra)/i.test(name)) return 3;
  if (/RTX|GTX 1[06-9]|RX\s?[5-9]\d{2,3}|Radeon Pro|Apple M\d/i.test(name)) return 2;
  if (/Intel|UHD|Iris|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(name)) return 1;
  return 2;
}
