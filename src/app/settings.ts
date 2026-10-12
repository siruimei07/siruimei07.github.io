// Display preferences, kept in this browser only. Every storage access is
// guarded: private windows and blocked storage simply fall back to defaults.

export type ThemePref = "auto" | "light" | "dark";
export type MotionPref = "auto" | "full" | "reduced";
export type ThreePref = "high" | "low" | "off";

export type Settings = { theme: ThemePref; motion: MotionPref; three: ThreePref };

const KEYS = { theme: "rl.theme", motion: "rl.motion", three: "rl.three" } as const;
const ALLOWED: { [K in keyof Settings]: readonly Settings[K][] } = {
  theme: ["auto", "light", "dark"],
  motion: ["auto", "full", "reduced"],
  three: ["high", "low", "off"],
};
const DEFAULTS: Settings = { theme: "auto", motion: "auto", three: "high" };

function read<K extends keyof Settings>(k: K): Settings[K] {
  try {
    const v = localStorage.getItem(KEYS[k]) as Settings[K] | null;
    if (v && (ALLOWED[k] as readonly string[]).includes(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULTS[k];
}

function write<K extends keyof Settings>(k: K, v: Settings[K]) {
  try {
    if (v === DEFAULTS[k]) localStorage.removeItem(KEYS[k]);
    else localStorage.setItem(KEYS[k], v);
  } catch {
    /* storage unavailable */
  }
}

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const motionQuery = matchMedia("(prefers-reduced-motion: reduce)");

type Listener = (s: Settings) => void;

export class Prefs {
  private state: Settings = { theme: read("theme"), motion: read("motion"), three: read("three") };
  private listeners = new Set<Listener>();

  constructor() {
    const fire = () => this.emit();
    darkQuery.addEventListener("change", fire);
    motionQuery.addEventListener("change", fire);
  }

  get(): Settings {
    return { ...this.state };
  }

  set<K extends keyof Settings>(k: K, v: Settings[K]) {
    if (this.state[k] === v) return;
    this.state[k] = v;
    write(k, v);
    this.emit();
  }

  /** The theme actually shown. */
  theme(): "light" | "dark" {
    if (this.state.theme === "auto") return darkQuery.matches ? "dark" : "light";
    return this.state.theme;
  }

  /** Whether motion should be reduced right now. */
  reduced(): boolean {
    if (this.state.motion === "auto") return motionQuery.matches;
    return this.state.motion === "reduced";
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.get();
    for (const fn of this.listeners) fn(s);
  }
}
