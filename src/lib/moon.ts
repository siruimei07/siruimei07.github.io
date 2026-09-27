// Moon phases after Meeus, "Astronomical Algorithms" ch. 49: true new / full
// moon instants (good to a few minutes), and from them the phase of the moon
// for any date. Pure functions; used by the HUD, the day-change transition and
// the calendar.

const RAD = Math.PI / 180;
const DAY = 86_400_000;
export const SYNODIC = 29.530588861;

const jdToMs = (jd: number) => (jd - 2440587.5) * DAY;
const msToJd = (ms: number) => ms / DAY + 2440587.5;

/** JDE of the true phase for lunation k (integer = new moon, k + 0.5 = full). */
function truePhase(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;
  let jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * T2 - 0.00000015 * T3 + 0.00000000073 * T4;
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const M = (2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3) * RAD;
  const Mp = (201.5643 + 385.81693528 * k + 0.0107582 * T2 + 0.00001238 * T3 - 0.000000058 * T4) * RAD;
  const F = (160.7108 + 390.67050284 * k - 0.0016118 * T2 - 0.00000227 * T3 + 0.000000011 * T4) * RAD;
  const O = (124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3) * RAD;
  const s = Math.sin;
  const full = Math.abs(k - Math.floor(k) - 0.5) < 1e-6;
  if (full) {
    jde +=
      -0.40614 * s(Mp) + 0.17302 * E * s(M) + 0.01614 * s(2 * Mp) + 0.01043 * s(2 * F) + 0.00734 * E * s(Mp - M) -
      0.00515 * E * s(Mp + M) + 0.00209 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) +
      0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) -
      0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F) +
      0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F) +
      0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  } else {
    jde +=
      -0.4072 * s(Mp) + 0.17241 * E * s(M) + 0.01608 * s(2 * Mp) + 0.01039 * s(2 * F) + 0.00739 * E * s(Mp - M) -
      0.00514 * E * s(Mp + M) + 0.00208 * E * E * s(2 * M) - 0.00111 * s(Mp - 2 * F) - 0.00057 * s(Mp + 2 * F) +
      0.00056 * E * s(2 * Mp + M) - 0.00042 * s(3 * Mp) + 0.00042 * E * s(M + 2 * F) + 0.00038 * E * s(M - 2 * F) -
      0.00024 * E * s(2 * Mp - M) - 0.00017 * s(O) - 0.00007 * s(Mp + 2 * M) + 0.00004 * s(2 * Mp - 2 * F) +
      0.00004 * s(3 * M) + 0.00003 * s(Mp + M - 2 * F) + 0.00003 * s(2 * Mp + 2 * F) - 0.00003 * s(Mp + M + 2 * F) +
      0.00003 * s(Mp - M + 2 * F) - 0.00002 * s(Mp - M - 2 * F) - 0.00002 * s(3 * Mp + M) + 0.00002 * s(4 * Mp);
  }
  // The largest planetary argument (A1); the rest are below a minute.
  const A1 = (299.77 + 0.107408 * k - 0.009173 * T2) * RAD;
  jde += 0.000325 * s(A1);
  return jde;
}

/** Lunation index of the last new moon at or before `ms`. */
function lunationBefore(ms: number): number {
  let k = Math.floor((msToJd(ms) - 2451550.09766) / SYNODIC);
  while (jdToMs(truePhase(k + 1)) <= ms) k++;
  while (jdToMs(truePhase(k)) > ms) k--;
  return k;
}

export type MoonState = {
  /** 0 → new, 0.5 → full, → 1 new again. */
  phase: number;
  /** Days since the last new moon. */
  age: number;
  /** Lit fraction of the disc, 0..1. */
  illumination: number;
  waxing: boolean;
  lastNew: Date;
  nextNew: Date;
  nextFull: Date;
};

export function moonAt(date: Date): MoonState {
  const ms = date.getTime();
  const k = lunationBefore(ms);
  const prev = jdToMs(truePhase(k));
  const next = jdToMs(truePhase(k + 1));
  const phase = (ms - prev) / (next - prev);
  let full = jdToMs(truePhase(k + 0.5));
  if (full <= ms) full = jdToMs(truePhase(k + 1.5));
  return {
    phase,
    age: (ms - prev) / DAY,
    illumination: (1 - Math.cos(phase * 2 * Math.PI)) / 2,
    waxing: phase < 0.5,
    lastNew: new Date(prev),
    nextNew: new Date(next),
    nextFull: new Date(full),
  };
}

/** The full moon nearest to `date` (before or after). */
export function nearestFull(date: Date): Date {
  const ms = date.getTime();
  const k = lunationBefore(ms);
  const a = jdToMs(truePhase(k - 0.5));
  const b = jdToMs(truePhase(k + 0.5));
  return new Date(Math.abs(a - ms) < Math.abs(b - ms) ? a : b);
}

/** Whole local calendar days from `from` to `to` (0 when both fall on the same local date). */
export function localDaysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY);
}

/** Days until the next full moon by local date; 0 when it is full tonight. */
export function daysToFull(date: Date): number {
  const near = nearestFull(date);
  const d = localDaysBetween(date, near);
  if (d === 0) return 0;
  return localDaysBetween(date, moonAt(date).nextFull);
}

// Traditional Japanese names. Around the full moon they count nights from the
// true full moon (十三夜 … 十六夜 … 更待月); elsewhere they follow the phase.
const AROUND_FULL: [number, string, string][] = [
  [-2.75, "十三夜", "Waxing Gibbous"],
  [-1.75, "小望月", "Waxing Gibbous"],
  [-0.75, "満月", "Full Moon"],
  [0.75, "十六夜", "Waning Gibbous"],
  [1.75, "立待月", "Waning Gibbous"],
  [2.75, "居待月", "Waning Gibbous"],
  [3.75, "寝待月", "Waning Gibbous"],
  [4.75, "更待月", "Waning Gibbous"],
];
const BY_PHASE: [number, string, string][] = [
  [0.034, "新月", "New Moon"],
  [0.2, "三日月", "Waxing Crescent"],
  [0.3, "上弦の月", "First Quarter"],
  [0.5, "十日夜", "Waxing Gibbous"],
  [0.7, "更待月", "Waning Gibbous"],
  [0.8, "下弦の月", "Last Quarter"],
  [0.966, "有明月", "Waning Crescent"],
  [1.01, "新月", "New Moon"],
];

export function moonName(date: Date): { ja: string; en: string } {
  const dFull = (date.getTime() - nearestFull(date).getTime()) / DAY;
  if (dFull >= -2.75 && dFull < 5.75) {
    let pick = AROUND_FULL[0];
    for (const row of AROUND_FULL) if (dFull >= row[0]) pick = row;
    return { ja: pick[1], en: pick[2] };
  }
  const p = moonAt(date).phase;
  for (const [lim, ja, en] of BY_PHASE) if (p < lim) return { ja, en };
  return { ja: "新月", en: "New Moon" };
}

/**
 * SVG path of the lit part of a moon disc of radius r centred at (0,0),
 * seen from the northern hemisphere (waxing = lit on the right).
 */
export function moonLitPath(phase: number, r: number): string {
  const p = ((phase % 1) + 1) % 1;
  const k = Math.cos(p * 2 * Math.PI); // 1 new → -1 full → 1 new
  const waxing = p < 0.5;
  const rx = Math.abs(k) * r;
  const f = (n: number) => +n.toFixed(3);
  if (p < 0.004 || p > 0.996) return "";
  // Outer limb: right half when waxing, left half when waning.
  const limbSweep = waxing ? 1 : 0;
  // Terminator: an ellipse arc; bulges toward the lit side before quarter.
  const termSweep = waxing ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
  return `M0 ${f(-r)} A${f(r)} ${f(r)} 0 0 ${limbSweep} 0 ${f(r)} A${f(rx)} ${f(r)} 0 0 ${termSweep} 0 ${f(-r)}Z`;
}

// P3-style time of day for the HUD.
export function timeOfDay(date: Date): { en: string; zh: string; dark: boolean } {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 1) return { en: "Dark Hour", zh: "影时间", dark: true };
  if (h < 5) return { en: "Late Night", zh: "深夜", dark: false };
  if (h < 7) return { en: "Early Morning", zh: "清晨", dark: false };
  if (h < 11.5) return { en: "Morning", zh: "上午", dark: false };
  if (h < 13) return { en: "Lunchtime", zh: "午休", dark: false };
  if (h < 15.5) return { en: "Afternoon", zh: "下午", dark: false };
  if (h < 18) return { en: "After School", zh: "放学后", dark: false };
  return { en: "Evening", zh: "夜晚", dark: false };
}

export const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];
export const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
