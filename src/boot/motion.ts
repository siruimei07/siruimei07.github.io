// The opening's score: one pure function from PV time to everything on screen.
// Adapted from LBEILC/RhineLabUI (MIT), src/boot-motion.ts, with our copy in
// place of theirs. Time is the PV's own (seconds into the video, white frame at
// 6.76 s); discrete editorial cuts sit on its 25 fps frame numbers, computed
// from that time, so they keep their rhythm at any playback speed, while
// spatial motion follows the continuous measured tracks.

import { boot, brand } from "../content.ts";
import { logoTrack } from "./logo-track.ts";
import { orbitTrack } from "./orbit-track.ts";
import {
  ACCESS_COUNTS,
  brandTrack,
  companyTrack,
  permissionFade,
  permissionTracking,
  progress,
  ringFade,
  scanTrack,
  smooth,
  typed,
  typedAs,
} from "./tracks.ts";

/** Playback speed relative to RhineLabUI's opening: the user asked for 1.0–1.1× its speed. */
export const SPEED = 1.1;

/** Landmarks in PV seconds: the white frame, the welcome card's first cut, the exit and the end. */
export const PV = { start: 6.76, welcome: 22.76, exit: 26.56, end: 26.92 } as const;

/** Where a version starts in the PV, the frame its corner lockup starts sliding in, and the
 *  first frame of a still stretch where the page may do heavy work (the 3D loading): a stall
 *  there only holds a frame that is not moving anyway. */
export type Version = { from: number; brandAt: number; idleAt: number };
/** The whole opening, ≈ 20.2 PV seconds; idle once VISITOR is typed, until REQUEST RECEIVED. */
export const FULL: Version = { from: PV.start, brandAt: 278, idleAt: 333 };
/** A return visit: the welcome card only, the lockup arriving with it; idle after the cut in. */
export const SHORT: Version = { from: PV.welcome, brandAt: 569, idleAt: 576 };

// ───────── our copy, cut the way the PV cuts its own ─────────

const [ID_HEAD, ID_NAME = ""] = boot.lines[0].split(" : ");
const ID_SEP = boot.lines[0].length - ID_HEAD.length - ID_NAME.length;
const PROCESSING = boot.lines[2].replace(/\.+$/, "");
const DOTS = boot.lines[2].length - PROCESSING.length;
/** The glitch frames keep only the line's tail ("SING..."), in place. */
const GLITCH_TAIL = 7;
const POWERED = `${brand.powered[0]} ${brand.powered[1]}`;

/** Captions as [index into boot.captions, from, to] in PV seconds, on the PV subtitles' beats. */
const CAPTIONS: [number, number, number][] = [
  [0, 6.8, 9.04],
  [1, 11.28, 14.4],
  [2, 19.48, 22.0],
  [3, 22.84, PV.exit],
];

const at = (f: number, frames: number[]) => frames.includes(f);

/** The identity line: which of boot.lines, and which characters of it show (the rest keep their room). */
function authLine(f: number) {
  if (f < 363) {
    let to = typedAs(ID_HEAD.length, 12, f, 282, 295);
    // the PV sets the colon down at 299, during the pause, not with the name (the reference waits until 320)
    if (f >= 299) to = ID_HEAD.length + ID_SEP;
    if (f >= 320) to += typedAs(ID_NAME.length, 11, f, 321, 339);
    return { line: 0, from: 0, to };
  }
  if (f < 421) return { line: 1, from: 0, to: typedAs(boot.lines[1].length, 16, f, 367, 389) };
  const all = boot.lines[2].length;
  if (at(f, [479, 485, 486])) return { line: 2, from: all - GLITCH_TAIL, to: all };
  let to = typedAs(PROCESSING.length, 16, f, 423, 440);
  if (f >= 449) to = PROCESSING.length + Math.min(DOTS, 1 + Math.floor((f - 449) / 4));
  return { line: 2, from: 0, to };
}

function caption(t: number) {
  for (const [i, a, b] of CAPTIONS) if (t >= a && t < b) return { i, o: Math.min(progress(t, a, a + 0.08), 1 - progress(t, b - 0.08, b)) };
  return { i: -1, o: 0 };
}

/** Everything on screen at PV time `t`. */
export function bootMotion(t: number, v: Version = FULL) {
  const frame = t * 25;
  const f = Math.floor(frame + 0.00001);
  const scan = scanTrack(frame);
  const orbit = orbitTrack(frame);
  const ringGlitch = at(f, [525, 526, 528, 529]);
  const flash = f - 569;
  const exit = smooth(progress(t, PV.exit, PV.end));
  const lockup = frame - v.brandAt;
  const accessCount = f < 170 ? 0 : ACCESS_COUNTS[Math.min(ACCESS_COUNTS.length - 1, f - 170)];
  return {
    t,
    f,
    access: {
      n: Math.round((accessCount * boot.access.length) / 26),
      o: f >= 170 && f < 227 ? (f === 226 ? 0.25 : 1) : 0,
    },
    logo: {
      o: t >= 9.16 && t < 19.48 ? 1 : 0,
      mark: logoTrack(frame),
      name: typedAs(brand.mark.length, 9, f, 232, 255),
    },
    auth: { o: f >= 281 && f < 487 ? 1 : 0, ...authLine(f) },
    brand: [0, 1, 2].map((line) => brandTrack(lockup, line)),
    /** how much of POWERED BY RHINE LAB is uncovered, 0–1 */
    powered: typed(POWERED.length, f, v.brandAt + 1, v.brandAt + 17) / POWERED.length,
    scan: t >= 19.48 && t < PV.welcome ? scan : null,
    orbit,
    ring: ringGlitch ? { scale: 1.94, o: 0.32, blur: 2.2 } : { scale: 1, o: ringFade(frame), blur: 0 },
    permission: {
      o: t < 21.8 ? progress(t, 19.48, 19.88) : permissionFade(frame),
      track: permissionTracking(frame),
    },
    ornament: t >= 21.84,
    card: {
      on: t >= PV.welcome && t < PV.end,
      // the cut in: black panel / white words, then the words alone, flickering, until 576
      panel: flash >= 0 && flash < 7 ? [1, 0, 0.28, 0, 1, 0, 0][flash] : 0,
      ink: flash >= 0 && flash < 7 ? [0, 0, 0.2, 1, 0, 0, 0.25][flash] : 1,
      company: f >= 588 && !at(f, [590, 591]),
      mask: at(f, [594, 595]),
      bar: companyTrack(frame),
      db: f < 626 || at(f, [628, 629, 631, 634]) ? 0 : 1,
      logo: f >= 588,
    },
    exit,
    /** the paper whitening behind the card as it leaves */
    wash: smooth(progress(t, 26.16, 26.88)),
    cap: caption(t),
  };
}

export type Motion = ReturnType<typeof bootMotion>;
