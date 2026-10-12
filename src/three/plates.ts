// Public contract of the 3D archive plates (MOTION-SPEC §4.5). The
// implementation is loaded on demand (three.js is a large chunk), see
// createPlates().

export type Formation = "infinity" | "chain" | "hidden";

/** A point on the 3D figure projected to viewport CSS pixels. */
export type Anchor = { x: number; y: number; visible: boolean };

/** Where a selection wave starts: a viewport point (CSS px) or an ∞ anchor id. */
export type PulseFrom = { x: number; y: number } | { anchor: string };

export type PlatesOptions = {
  theme: "light" | "dark";
  reduced: boolean;
  quality: "high" | "low";
};

export interface Plates {
  /** Formation changes travel on per-plate springs; `immediate` places them. */
  setFormation(f: Formation, o?: { immediate?: boolean }): void;
  setTheme(t: "light" | "dark"): void;
  setReduced(reduced: boolean): void;
  setQuality(q: "high" | "low"): void;
  /** Kept for compatibility: the scene follows the pointer with its own listeners. */
  setPointer(nx: number, ny: number): void;
  /** Called (at most once per frame) with the projected anchor points of the ∞:
   *  left, cross, right-top, right-bottom, centre. */
  onAnchors(cb: (anchors: Record<string, Anchor>) => void): void;
  /** RhineLabUI selection wave from a source (viewport px or an ∞ anchor id).
   *  Default: the chain's tile end, or the ∞ "centre" anchor. */
  pulse(from?: PulseFrom): void;
  /** Lift and brighten the plates around one ∞ anchor (callout hover or focus); null clears. */
  highlight?(anchor: string | null): void;
  /** Advance the section chain by whole cassette pitches with one conveyor burst. */
  advance?(steps: number): void;
  resize(): void;
  dispose(): void;
}

/** Throws if WebGL2 is unavailable. */
export async function createPlates(canvas: HTMLCanvasElement, o: PlatesOptions): Promise<Plates> {
  const { PlatesScene } = await import("./scene.ts");
  return new PlatesScene(canvas, o);
}
