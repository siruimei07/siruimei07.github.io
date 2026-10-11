// Contract between the app shell (src/app/app.ts) and each screen's behaviour
// module (src/screens/<id>.ts). Markup comes pre-rendered from src/views/.

import type { SectionId } from "../content.ts";
import type { Prefs } from "../app/settings.ts";
import type { Plates } from "../three/plates.ts";

export type ScreenId = "home" | SectionId;

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
}
