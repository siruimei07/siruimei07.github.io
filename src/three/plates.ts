// Public contract of the 3D archive plates. The implementation is loaded on
// demand (three.js is a large chunk), see createPlates().

export type Formation = "infinity" | "chain" | "hidden";

/** A point on the 3D figure projected to viewport CSS pixels. */
export type Anchor = { x: number; y: number; visible: boolean };

export type PlatesOptions = {
  theme: "light" | "dark";
  reduced: boolean;
  quality: "high" | "low";
};

export interface Plates {
  setFormation(f: Formation, o?: { immediate?: boolean }): void;
  setTheme(t: "light" | "dark"): void;
  setReduced(reduced: boolean): void;
  setQuality(q: "high" | "low"): void;
  /** Pointer in normalised viewport coordinates, -1..1 (y up). */
  setPointer(nx: number, ny: number): void;
  /** Called (at most once per frame) with the projected anchor points of the ∞:
   *  left, cross, right-top, right-bottom, centre. */
  onAnchors(cb: (anchors: Record<string, Anchor>) => void): void;
  /** A short wave through the plates, on navigation. */
  pulse(): void;
  resize(): void;
  dispose(): void;
}

/** Throws if WebGL2 is unavailable. */
export async function createPlates(canvas: HTMLCanvasElement, o: PlatesOptions): Promise<Plates> {
  const { PlatesScene } = await import("./scene.ts");
  return new PlatesScene(canvas, o);
}
