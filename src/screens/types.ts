// Contract between the app shell (src/app/app.ts) and each screen's behaviour
// module (src/screens/<id>.ts). Markup comes pre-rendered from src/views/.

import type { SectionId } from "../content.ts";
import type { Prefs } from "../app/settings.ts";
import type { Plates } from "../three/plates.ts";

export type ScreenId = "home" | SectionId;

/** A screen's entry lifecycle, mirrored as `data-phase` on its root (MOTION-SPEC §4.2).
 *  Sections: enter (the card flies in and holds) → dock (t0) → reveal (the frost
 *  clears) → settled → leave. The overview: enter (the build) → settled.
 *  An entry overtaken before it settles gets phase("leave") but keeps its data-phase
 *  (the root gains .is-held, which freezes its CSS builds where they are); every
 *  exit sets `data-exit` on the root. JS builds hold too instead of finishing. */
export type Phase = "enter" | "dock" | "reveal" | "settled" | "leave";
export type NavKind = "initial" | "boot-home" | "home-sect" | "sect-sect" | "sect-home";
export type PhaseInfo = {
  kind: NavKind;
  /** First visit to this screen in this page load: full decryption. */
  first: boolean;
  /** No frost or decryption: revisit, phone layout, or reduced motion. */
  fast: boolean;
  /** performance.now() at "dock" (sections) or "enter" (home). */
  t0: number;
};

export type ScreenContext = {
  prefs: Prefs;
  /** true when motion should be reduced right now (settings or OS). */
  reduced(): boolean;
  /** Navigate like a link would (updates history). */
  go(id: ScreenId): void;
  /** Short status message at the top of the screen. */
  toast(message: string): void;
  /** Append a line to the left rail's COMMAND ENTERED log. */
  log(line: string): void;
  /** Replace the bottom-centre narrator caption. */
  caption(text: string): void;
  /** The live 3D plates, once loaded (null when 3D is off or unavailable). */
  plates(): Plates | null;
  /** Replay the opening sequence. */
  replayBoot(): void;
  /** Complete the current entry now (the screen's own input should finish it). */
  finishReveal(): void;
  /** The current screen's phase. */
  phase(): Phase;
};

export interface ScreenModule {
  /** Called once with the screen's root element. */
  init(root: HTMLElement, ctx: ScreenContext): void;
  /** The screen became active. `first` is true the first time. */
  enter?(from: ScreenId | null, first: boolean): void;
  /** The screen is about to be replaced. */
  leave?(): void;
  /** Keyboard input while this screen is active. Return true if handled. */
  key?(e: KeyboardEvent): boolean;
  /** Viewport size changed while active. */
  resize?(): void;
  /** A phase began. For "settled" after an early finish, info.kind is the same and finish() ran first. */
  phase?(p: Phase, info: PhaseInfo): void;
  /** Jump every JS-driven build of this screen to its end state now. */
  finish?(): void;
}
