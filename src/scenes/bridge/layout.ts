import * as THREE from "three";
import { dirFromAzEl } from "../common/env";

// The plan of 月見橋: a long straight bridge runs from behind the viewer
// (+z) across a still lake to the shrine plaza (−z), where a vermilion torii
// stands before the gate hall; beyond the shore forest the hillside city of
// Tsukuyomi climbs to a ridge crowned by a table mountain, the full moon
// above it. Units: metres, y up, the lake at y = 0.

export const DECK_Y = 2.0; // deck top above the water
export const RAIL_X = 3.55; // railing centreline (±x)
export const EDGE_X = 3.85; // outer edge of the deck
export const BAY = 3.0; // post spacing
export const Z_NEAR = 36; // the bridge starts behind the viewer…
export const Z_FAR = -120; // …and lands on the shrine plaza
export const NBAYS = Math.round((Z_NEAR - Z_FAR) / BAY);
export const TORII_Z = -126;
export const TORII_HALF = 4.7; // pillar x
export const TORII_H = 12.2; // pillar height
export const GATE_Z = -152;
export const SHORE_Z = -121; // embankment line either side of the bridge end
export const EYE = DECK_Y + 1.6;

/** The wooden lantern post by the right railing (its base, in the water). */
export const POST = new THREE.Vector3(4.4, -0.6, -9);
export const POST_LIGHT_Y = DECK_Y + 3.66;

/** Shore lanterns along the far embankment: x = ±(X0 + k·DX). */
export const SHORE_LAMPS = { z: SHORE_Z - 2.2, y: DECK_Y + 1.25, x0: 11, dx: 9, n: 44 };

// The moon hangs high over the city, a little right of the bridge axis.
export const MOON_AZ = 5;
export const MOON_EL = 25;
export const moonDir = dirFromAzEl(MOON_AZ, MOON_EL);

// ---------------------------------------------------------------- the hill

const smooth = THREE.MathUtils.smoothstep;

/** Where the city slope reaches its crest (z) for a given x. */
export const ridgeZ = (x: number) => -1150 + 110 * Math.sin(x * 0.0016 + 0.7) - 0.00005 * x * x;

/** Crest height for a given x. */
export const ridgeH = (x: number) => 300 + 42 * Math.sin(x * 0.0029 + 1.2) + 26 * Math.sin(x * 0.0081 + 0.3) + 60 * smooth(Math.abs(x), 700, 2200);

/** Table mountain behind the crest, a flat top over the city's centre. */
export const MESA = { x: 20, z: -1360, top: 468, r0: 120, r1: 215 };

/** Terrain height (shore forest → city slope → crest → mountains). */
export function hillY(x: number, z: number): number {
  const base = -272;
  const zr = ridgeZ(x);
  const hr = ridgeH(x);
  let y = DECK_Y - 0.1;
  if (z < base) {
    const s = THREE.MathUtils.clamp((base - z) / (base - zr), 0, 1);
    // terraced slope: gentle at the foot, steep in the middle, rounded crest
    const f = Math.pow(s, 1.3);
    y += hr * f;
    // shoulders and gullies across the slope
    y += (Math.sin(x * 0.011) * 6 + Math.sin(x * 0.027 + z * 0.01) * 3) * s * (1 - s) * 4;
    if (z < zr) {
      // behind the crest: rolling mountains fading back
      const b = Math.min(1, (zr - z) / 900);
      y = DECK_Y + hr * (1 - 0.25 * b) + 90 * Math.sin(x * 0.0021 + 2.0) * b + 40 * Math.sin(x * 0.006) * b;
    }
  } else {
    y += Math.sin(x * 0.05) * 0.4 + Math.sin(z * 0.08 + x * 0.02) * 0.3;
  }
  // the mesa
  const r = Math.hypot((x - MESA.x) * 0.95, (z - MESA.z) * 1.3);
  const mesa = MESA.top * (1 - smooth(r, MESA.r0, MESA.r1));
  const lip = MESA.top - 6 * smooth(r, MESA.r0 * 0.2, MESA.r0);
  return Math.max(y, Math.min(mesa, lip));
}

/** Rough normalised slope parameter (0 at the foot, 1 at the crest). */
export function slopeS(x: number, z: number) {
  return THREE.MathUtils.clamp((-272 - z) / (-272 - ridgeZ(x)), 0, 1);
}
