// Double-helix strips for the ambient layer (MOTION-SPEC B-02, atlas §3 "DNA
// helix", f272–577): two pale strands half a turn apart that cross every
// `pitch`, with short base-pair rungs between them, drawn straight up a strip
// in PV px. ambient.css scrolls each strip by exactly one pitch per loop; the
// strands look alike, so the loop is seamless.

export type Helix = {
  /** Strip width and length, PV px. */
  width: number;
  length: number;
  /** Distance between two crossings (the visual repeat). */
  pitch: number;
  /** Strand offset from the axis at its widest. */
  amp: number;
  /** Stroke widths. */
  strand: number;
  rung: number;
};

/** Eight base pairs per crossing, like the PV's (34 px apart on the 272 px right helix). */
const RUNGS_PER_PITCH = 8;

export function helixSvg(h: Helix): string {
  const cx = h.width / 2;
  const off = (y: number) => h.amp * Math.sin((Math.PI * y) / h.pitch);
  const f = (v: number) => v.toFixed(1);
  // the curvature radius is ≥ 75 px, so 6 px chords read as a smooth curve
  const strand = (side: 1 | -1) => {
    const pts: string[] = [];
    for (let y = 0; y <= h.length; y += 6) pts.push(`${f(cx + side * off(y))} ${f(y)}`);
    return `M${pts.join("L")}`;
  };
  // each pair is two dashes that stop short of the strands and of each other
  const gap = h.rung;
  const rungs: string[] = [];
  const step = h.pitch / RUNGS_PER_PITCH;
  for (let y = step / 2; y < h.length; y += step) {
    const reach = Math.abs(off(y)) - h.strand * 1.2;
    if (reach - gap < h.rung * 1.5) continue;
    rungs.push(`M${f(cx - reach)} ${f(y)}H${f(cx - gap)}M${f(cx + gap)} ${f(y)}H${f(cx + reach)}`);
  }
  return `<svg viewBox="0 0 ${h.width} ${h.length}" aria-hidden="true" focusable="false"><path d="${strand(1)}${strand(-1)}" stroke-width="${h.strand}"/><path d="${rungs.join("")}" stroke-width="${h.rung}"/></svg>`;
}
