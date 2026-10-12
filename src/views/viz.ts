// Specimen drawings for the three research sections, in the PV's glass-panel
// language: hairlines, crosshairs, one orange core. Deterministic (seeded), so
// the pre-rendered HTML is stable between builds. Strokes carry pathLength="1"
// so the screen can draw them in with one stroke-dashoffset rule; bars, dots and
// paths carry --k for a staggered entrance. Each figure also brings the hooks
// for its live readout (MOTION-SPEC §8.3): a probe overlay in the same viewBox
// and the readout's labels; the numbers behind them are exported for the screen.

export const VIZ_W = 520;
export const VIZ_H = 380;

/** The sampling distribution's centre and spread, in viewBox units. */
export const STATS = { mu: 270, sd: 62 } as const;
/** The density curve's height at x (viewBox units): the drawn curve and the readout's dot. */
export const statsY = (x: number): number => 330 - 228 * Math.exp(-((x - STATS.mu) ** 2) / (2 * STATS.sd * STATS.sd));
/** Where supply meets demand (Q*, P*). */
export const ECON = { qs: 268, ps: 182 } as const;
/** The Monte Carlo grid: paths start at (x0, y0) and step n times to `end`. */
export const QUANT = { x0: 40, y0: 220, end: 470, n: 46 } as const;
/** The plot's value axes: x from 40 to 500, the price axis from y 330 (0) up to 30 (1). */
export const AXIS = { x0: 40, x1: 500, y0: 330, y1: 30 } as const;

export type Viz = {
  svg: string;
  /** The orange core in viewBox units: the screen's crosshair runs through it. */
  core: [number, number];
  /** Radius of the dashed outer ring around the core, in viewBox units. */
  ring: number;
  /** What the drawing shows, in words (figure caption and SVG label). */
  label: string;
  /** The probe overlay (aria-hidden, same viewBox) and the readout's static labels. */
  probe: string;
  readout: string;
};

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => {
  const u = Math.max(1e-9, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};

const f = (n: number) => n.toFixed(1);

const frame = (inner: string, label: string) =>
  `<svg class="viz" viewBox="0 0 ${VIZ_W} ${VIZ_H}" role="img" aria-label="${label}">
  <g class="viz__grid">${Array.from({ length: 9 }, (_, i) => `<path d="M${90 + i * 50} 30V330"/>`).join("")}${Array.from({ length: 6 }, (_, i) => `<path d="M40 ${280 - i * 50}H500"/>`).join("")}</g>
  <g class="viz__axis"><path pathLength="1" d="M40 330H500M40 330V30"/>${Array.from({ length: 10 }, (_, i) => `<path d="M${40 + i * 50} 330v6"/>`).join("")}${Array.from({ length: 7 }, (_, i) => `<path d="M34 ${330 - i * 50}h6"/>`).join("")}</g>
  ${inner}
</svg>`;

/** The probe: a hairline at the pointer's x and `dots` points on the curves (moved by the screen). */
const probe = (dots: number, extra = "") =>
  `<svg class="lab__probe" viewBox="0 0 ${VIZ_W} ${VIZ_H}" aria-hidden="true" focusable="false"><path class="lab__px" d="M0 30V330"/>${extra}${'<circle class="lab__pd" r="3"/>'.repeat(dots)}</svg>`;

/** Readout labels with empty value slots (the screen fills [data-r]). */
const readout = (parts: [string, string, string?][]) =>
  parts.map(([label, key, cls]) => `${label ? `<span>${label}</span> ` : ""}<b data-r="${key}"${cls ? ` class="${cls}"` : ""}></b>`).join(" · ");

/** Sampling distribution: histogram, density, sample points and a confidence bracket. */
function stats(): Viz {
  const r = rng(7);
  const { mu, sd } = STATS;
  const bins = new Array(18).fill(0);
  const dots: string[] = [];
  for (let i = 0; i < 420; i++) {
    const x = mu + gauss(r) * sd;
    const b = Math.floor((x - 40) / 25);
    if (b >= 0 && b < bins.length) bins[b]++;
    if (i < 70) dots.push(`<circle style="--k:${i % 18}" cx="${f(x)}" cy="${f(300 - r() * 26)}" r="2.2"/>`);
  }
  const peak = Math.max(...bins);
  const bars = bins.map((c, i) => `<rect style="--k:${i}" x="${40 + i * 25 + 3}" y="${f(330 - (c / peak) * 220)}" width="19" height="${f((c / peak) * 220)}"/>`).join("");
  const curve = Array.from({ length: 93 }, (_, i) => {
    const x = 40 + i * 5;
    return `${i ? "L" : "M"}${x} ${f(statsY(x))}`;
  }).join("");
  const label = "抽样分布：直方图、密度曲线与 95% 置信区间";
  return {
    core: [mu, 102],
    ring: 34,
    label,
    svg: frame(
      `<g class="viz__bars">${bars}</g>
  <path class="viz__line" pathLength="1" d="${curve}"/>
  <g class="viz__dots">${dots.join("")}</g>
  <g class="viz__cross"><circle cx="${mu}" cy="102" r="20"/></g>
  <g class="viz__ci"><path pathLength="1" d="M${f(mu - 1.96 * sd)} 60v-12H${f(mu + 1.96 * sd)}v12"/><text x="${mu}" y="38">95% CI</text></g>
  <circle class="viz__core" cx="${mu}" cy="102" r="6"/>
  <text class="viz__note" x="${mu + 44}" y="98">E[X] = μ</text>
  <text class="viz__note viz__note--dim" x="46" y="352">N = 420</text>`,
      label,
    ),
    probe: probe(1),
    readout: readout([
      ["Z", "z"],
      ["φ", "pdf"],
      ["Φ", "cdf"],
    ]),
  };
}

/** Supply meets demand: two curves, the equilibrium ring and its projections. */
function econ(): Viz {
  const { qs, ps } = ECON;
  const label = "供给与需求曲线相交于均衡点";
  return {
    core: [qs, ps],
    ring: 44,
    label,
    svg: frame(
      `<path class="viz__band" d="M70 300C170 270 330 140 470 60L480 300C340 250 180 120 70 70Z"/>
  <path class="viz__line" data-curve="s" pathLength="1" d="M70 300C170 270 330 140 470 60"/>
  <path class="viz__line viz__line--b" data-curve="d" pathLength="1" d="M70 70C180 120 340 250 480 300"/>
  <path class="viz__dash" d="M${qs} ${ps}V330M${qs} ${ps}H40"/>
  <g class="viz__cross"><circle cx="${qs}" cy="${ps}" r="26"/></g>
  <circle class="viz__core" cx="${qs}" cy="${ps}" r="6"/>
  <text class="viz__note" x="478" y="56">S</text><text class="viz__note" x="486" y="304">D</text>
  <text class="viz__note" x="${qs - 10}" y="352">Q*</text><text class="viz__note" x="10" y="${ps + 5}">P*</text>
  <g class="viz__dots">${Array.from({ length: 26 }, (_, i) => `<circle style="--k:${i}" cx="${70 + i * 16}" cy="${f(300 - 240 * Math.pow(i / 25, 1.25) + Math.sin(i * 1.7) * 9)}" r="2.2"/>`).join("")}</g>`,
      label,
    ),
    // the dashed projections from both meeting points to the price axis
    probe: probe(2, '<path class="lab__pp"/>'),
    readout: readout([
      ["Q", "q"],
      ["P(S)", "ps"],
      ["P(D)", "pd"],
      ["", "state", "lab__state"],
    ]),
  };
}

/** Monte Carlo price paths, one highlighted, with its drawdown band. */
function quant(): Viz {
  const r = rng(11);
  const { x0, y0, end, n } = QUANT;
  // the paths stop short of the plot's right edge, so the core's outer ring stays whole
  const step = (end - x0) / n;
  const paths: string[] = [];
  let best = "";
  let bestEnd = Infinity;
  let bestY = 120;
  for (let p = 0; p < 22; p++) {
    let y: number = y0;
    let d = `M${x0} ${y}`;
    for (let i = 1; i <= n; i++) {
      y += gauss(r) * 9 - 1.4;
      y = Math.max(40, Math.min(320, y));
      d += `L${f(x0 + i * step)} ${f(y)}`;
    }
    paths.push(d);
    if (Math.abs(y - 120) < bestEnd) {
      bestEnd = Math.abs(y - 120);
      best = d;
      bestY = Number(f(y));
    }
  }
  const label = "蒙特卡洛模拟的价格路径，其中一条被高亮";
  return {
    core: [end, bestY],
    ring: 32,
    label,
    svg: frame(
      `<rect class="viz__band" x="40" y="150" width="${end - 40}" height="130"/>
  <g class="viz__paths">${paths.map((d, i) => `<path style="--k:${i}" data-path="${i}" pathLength="1" d="${d}"/>`).join("")}</g>
  <path class="viz__line viz__line--hi" pathLength="1" d="${best}"/>
  <g class="viz__cross"><circle cx="${end}" cy="${bestY}" r="18"/></g>
  <circle class="viz__core" cx="${end}" cy="${bestY}" r="6"/>
  <text class="viz__note" x="50" y="208">S₀</text><text class="viz__note viz__note--dim" x="46" y="352">N = 22 PATHS · T = 46</text>`,
      label,
    ),
    probe: probe(1),
    readout: readout([
      ["PATH", "path"],
      ["S(t)", "s"],
      ["t", "t"],
    ]),
  };
}

export const VIZ = { stats, econ, quant } as const;
