"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type MouseEvent,
} from "react";
import { ContributionExplorer } from "./ContributionExplorer";
import { ActivityPanel, RepositoriesPanel } from "./GitHubProfilePanels";
import { SummerFlight } from "./SummerFlight";

type ProfileView = "overview" | "repositories" | "activity";
type AvatarMascotPhase =
  | "hidden"
  | "bike-enter"
  | "bike-rest"
  | "bike-exit"
  | "sitter-enter"
  | "sitter-rest";

const MASCOT_STATE_SESSION_KEY = "sirui-avatar-mascot-state-v1";
const MASCOT_SWITCH_SESSION_KEY = "sirui-avatar-mascot-switch-v1";

function Header({ activeView, onSelect }: { activeView: ProfileView; onSelect: (view: ProfileView) => void }) {
  const tabProps = (view: ProfileView) => ({
    className: activeView === view ? "active" : undefined,
    "aria-current": activeView === view ? "page" as const : undefined,
    "aria-controls": `${view}-panel`,
  });

  const select = (event: MouseEvent<HTMLAnchorElement>, view: ProfileView) => {
    event.preventDefault();
    onSelect(view);
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="#overview" aria-label="Sirui Mei profile home" onClick={(event) => select(event, "overview")}>
          <span className="brand-name">siruimei07</span>
        </a>
        <nav className="profile-nav" aria-label="Profile sections">
          <a id="overview-tab" href="#overview" {...tabProps("overview")} onClick={(event) => select(event, "overview")}>Overview</a>
          <a id="repositories-tab" href="#repositories" {...tabProps("repositories")} onClick={(event) => select(event, "repositories")}>
            Repositories <span className="nav-count">ALL</span>
          </a>
          <a id="activity-tab" href="#activity" {...tabProps("activity")} onClick={(event) => select(event, "activity")}>Activity</a>
          <a href="mailto:sirui.mei07@gmail.com">Contact</a>
        </nav>
        <a className="header-github" href="https://github.com/siruimei07" target="_blank" rel="noreferrer">
          GitHub <span aria-hidden="true">-&gt;</span>
        </a>
      </div>
    </header>
  );
}

function SummerBackdrop() {
  return (
    <div className="summer-backdrop" aria-hidden="true">
      <div className="backdrop-wash" />

      <div className="sketch-layer">
        <p className="sketch-copy sketch-main">TILL THE LANDS BECOME AN ORANGE</p>
        <p className="sketch-copy sketch-friends">FRIENDS!!</p>
        <p className="sketch-copy sketch-oranges">ORANGES</p>
        <span className="doodle doodle-cat">= ^ . . ^ =</span>
        <span className="doodle doodle-star-one">*</span>
        <span className="doodle doodle-star-two">+</span>
        <span className="doodle doodle-arrow">------&gt;</span>
        <span className="doodle-orbit" />
      </div>

      <img className="ambient-sticker scene-drink" src="/assets/summer-drink.gif" alt="" />
      <img className="ambient-sticker scene-runner" src="/assets/delivery-run.gif" alt="" />
      <img className="ambient-sticker scene-staff" src="/assets/staff-sitter.gif" alt="" />
      <img className="ambient-sticker scene-raincoat" src="/assets/raincoat-walker.gif" alt="" />
      <img className="ambient-sticker scene-diver" src="/assets/diver.gif" alt="" />
    </div>
  );
}

function ProfileSidebar({
  mascotPhase,
  onMascotAnimationEnd,
}: {
  mascotPhase: AvatarMascotPhase;
  onMascotAnimationEnd: (event: AnimationEvent<HTMLDivElement>) => void;
}) {
  const sitterVisible = mascotPhase === "sitter-enter" || mascotPhase === "sitter-rest";

  return (
    <aside className="profile-sidebar" aria-label="Profile information">
      <div className="avatar-stage">
        {mascotPhase !== "hidden" && (
          <div
            className={`avatar-mascot avatar-mascot-${sitterVisible ? "sitter" : "bike"} avatar-mascot-${mascotPhase}`}
            data-phase={mascotPhase}
            aria-hidden="true"
            onAnimationEnd={onMascotAnimationEnd}
          >
            <img
              src={sitterVisible ? "/assets/staff-sitter.gif" : "/assets/contribution-sweeper.gif"}
              alt=""
            />
          </div>
        )}

        <div className="avatar-frame">
          <img className="avatar" src="/assets/avatar.jpg" alt="Sirui Mei's GitHub avatar" />
          <span className="status-bubble" title="Summer mode" aria-label="Status: summer mode">*</span>
        </div>
      </div>

      <div className="identity">
        <h1>Sirui Mei</h1>
        <p className="username">siruimei07</p>
      </div>

      <p className="bio">Undergraduate student at University of Toronto</p>

      <a className="profile-button" href="https://github.com/siruimei07" target="_blank" rel="noreferrer">
        View GitHub profile
      </a>

      <ul className="profile-details">
        <li><span aria-hidden="true">o</span><strong>5</strong> followers <span className="dot">/</span> <strong>5</strong> following</li>
        <li><span aria-hidden="true">@</span><a href="mailto:sirui.mei07@gmail.com">sirui.mei07@gmail.com</a></li>
      </ul>

      <div className="sidebar-note">
        <span className="note-kicker">CURRENT SEASON</span>
        <p>Learning, building, and keeping things cool.</p>
      </div>

      <div className="sidebar-sticker" aria-hidden="true">
        <span className="sticker-spark spark-one">*</span>
        <span className="sticker-spark spark-two">.</span>
        <img src="/assets/summer-mage.gif" alt="" />
      </div>
    </aside>
  );
}

function RepositorySection() {
  return (
    <section id="repositories" className="section-block repository-section" aria-labelledby="repositories-title">
      <div className="section-heading">
        <div>
          <span className="section-kicker">PINNED WORK</span>
          <h2 id="repositories-title">Popular repositories</h2>
        </div>
        <a href="https://github.com/siruimei07?tab=repositories" target="_blank" rel="noreferrer">See all</a>
      </div>

      <div className="repo-card-stage">
        <img className="edge-sleeper" src="/assets/camera-nap.gif" alt="" aria-hidden="true" />
        <article className="repo-card">
          <div className="repo-topline">
            <a className="repo-name" href="https://github.com/siruimei07/GUI-for-RePKG" target="_blank" rel="noreferrer">
              GUI-for-RePKG
            </a>
            <span className="visibility-pill">Public</span>
          </div>
          <p>An extensible C# WPF frontend with an Endfield-inspired maximal UI, rich motion, responsive navigation, and backend extension points.</p>
          <div className="repo-meta">
            <span><i className="language-dot" />C#</span>
            <span aria-label="4 stars">* 4</span>
            <span className="repo-wave" aria-hidden="true">~~</span>
          </div>
        </article>
      </div>
    </section>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState<ProfileView>("overview");
  const [mascotPhase, setMascotPhase] = useState<AvatarMascotPhase>("hidden");
  const contentRef = useRef<HTMLDivElement>(null);
  const activeViewRef = useRef<ProfileView>("overview");
  const mascotPhaseRef = useRef<AvatarMascotPhase>("hidden");
  const mascotSwitchConsumedRef = useRef(false);
  const mascotSwitchPendingRef = useRef(false);
  const mascotArrivalScheduledRef = useRef(false);
  const reducedMotionRef = useRef(false);
  const mascotTimersRef = useRef(new Set<number>());

  const storeSessionValue = useCallback((key: string, value: string) => {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      // Session storage can be disabled without affecting navigation.
    }
  }, []);

  const commitMascotPhase = useCallback((phase: AvatarMascotPhase) => {
    mascotPhaseRef.current = phase;
    setMascotPhase(phase);
  }, []);

  const scheduleMascotPhase = useCallback((phase: AvatarMascotPhase, delay: number) => {
    const timer = window.setTimeout(() => {
      mascotTimersRef.current.delete(timer);
      commitMascotPhase(phase);
    }, delay);
    mascotTimersRef.current.add(timer);
  }, [commitMascotPhase]);

  useLayoutEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let storedMascot: string | null = null;
    let storedSwitch: string | null = null;
    try {
      storedMascot = window.sessionStorage.getItem(MASCOT_STATE_SESSION_KEY);
      storedSwitch = window.sessionStorage.getItem(MASCOT_SWITCH_SESSION_KEY);
    } catch {
      // The decorative state simply restarts when session storage is unavailable.
    }

    const restoreFrame = window.requestAnimationFrame(() => {
      mascotSwitchConsumedRef.current = storedSwitch === "pending" || storedSwitch === "done";
      mascotSwitchPendingRef.current = storedSwitch === "pending";

      if (storedSwitch === "done" || storedMascot === "sitter-rest") {
        commitMascotPhase("sitter-rest");
        mascotSwitchConsumedRef.current = true;
        mascotSwitchPendingRef.current = false;
        return;
      }

      if (storedMascot === "await-sitter") {
        mascotSwitchConsumedRef.current = true;
        mascotSwitchPendingRef.current = true;
        if (reducedMotionRef.current) {
          commitMascotPhase("sitter-rest");
          storeSessionValue(MASCOT_STATE_SESSION_KEY, "sitter-rest");
          storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "done");
          mascotSwitchPendingRef.current = false;
        } else {
          scheduleMascotPhase("sitter-enter", 1000);
        }
        return;
      }

      if (storedMascot === "bike-rest") {
        if (storedSwitch === "pending" && !reducedMotionRef.current) {
          storeSessionValue(MASCOT_STATE_SESSION_KEY, "await-sitter");
          commitMascotPhase("bike-exit");
        } else {
          commitMascotPhase("bike-rest");
        }
        if (storedSwitch === "pending" && reducedMotionRef.current) {
          commitMascotPhase("sitter-rest");
          storeSessionValue(MASCOT_STATE_SESSION_KEY, "sitter-rest");
          storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "done");
          mascotSwitchPendingRef.current = false;
        }
      }
    });

    return () => window.cancelAnimationFrame(restoreFrame);
  }, [commitMascotPhase, scheduleMascotPhase, storeSessionValue]);

  useEffect(() => () => {
    mascotTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    mascotTimersRef.current.clear();
  }, []);

  const handleContributionRevealComplete = useCallback(() => {
    if (mascotPhaseRef.current !== "hidden" || mascotArrivalScheduledRef.current) return;

    mascotArrivalScheduledRef.current = true;
    if (reducedMotionRef.current) {
      commitMascotPhase(mascotSwitchPendingRef.current ? "sitter-rest" : "bike-rest");
      const restingState = mascotSwitchPendingRef.current ? "sitter-rest" : "bike-rest";
      storeSessionValue(MASCOT_STATE_SESSION_KEY, restingState);
      if (mascotSwitchPendingRef.current) {
        storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "done");
        mascotSwitchPendingRef.current = false;
      }
      return;
    }

    // Let the contribution sweep fully clear before the rider returns by the avatar.
    scheduleMascotPhase("bike-enter", 2000);
  }, [commitMascotPhase, scheduleMascotPhase, storeSessionValue]);

  const beginFirstMascotSwitch = useCallback(() => {
    if (mascotSwitchConsumedRef.current) return;

    mascotSwitchConsumedRef.current = true;
    mascotSwitchPendingRef.current = true;
    storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "pending");

    if (reducedMotionRef.current) {
      commitMascotPhase("sitter-rest");
      storeSessionValue(MASCOT_STATE_SESSION_KEY, "sitter-rest");
      storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "done");
      mascotSwitchPendingRef.current = false;
      return;
    }

    if (mascotPhaseRef.current === "bike-rest") {
      storeSessionValue(MASCOT_STATE_SESSION_KEY, "await-sitter");
      commitMascotPhase("bike-exit");
    }
  }, [commitMascotPhase, storeSessionValue]);

  const advanceMascotPhase = useCallback(() => {
    switch (mascotPhaseRef.current) {
      case "bike-enter":
        commitMascotPhase("bike-rest");
        storeSessionValue(MASCOT_STATE_SESSION_KEY, "bike-rest");
        if (mascotSwitchPendingRef.current) {
          storeSessionValue(MASCOT_STATE_SESSION_KEY, "await-sitter");
          scheduleMascotPhase("bike-exit", 360);
        }
        break;
      case "bike-exit":
        commitMascotPhase("hidden");
        scheduleMascotPhase("sitter-enter", 1000);
        break;
      case "sitter-enter":
        commitMascotPhase("sitter-rest");
        storeSessionValue(MASCOT_STATE_SESSION_KEY, "sitter-rest");
        storeSessionValue(MASCOT_SWITCH_SESSION_KEY, "done");
        mascotSwitchPendingRef.current = false;
        break;
      default:
        break;
    }
  }, [commitMascotPhase, scheduleMascotPhase, storeSessionValue]);

  const handleMascotAnimationEnd = useCallback((event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target) return;
    advanceMascotPhase();
  }, [advanceMascotPhase]);

  useEffect(() => {
    const fallbackDelay = mascotPhase === "bike-enter"
      ? 1900
      : mascotPhase === "bike-exit"
        ? 1450
        : mascotPhase === "sitter-enter"
          ? 1900
          : null;
    if (fallbackDelay === null) return;

    const fallbackTimer = window.setTimeout(() => {
      if (mascotPhaseRef.current === mascotPhase) advanceMascotPhase();
    }, fallbackDelay);
    return () => window.clearTimeout(fallbackTimer);
  }, [advanceMascotPhase, mascotPhase]);

  const selectView = useCallback((view: ProfileView, updateHistory = true) => {
    const changed = activeViewRef.current !== view;
    activeViewRef.current = view;
    setActiveView(view);
    if (updateHistory) window.history.pushState(null, "", `#${view}`);
    if (updateHistory && changed) beginFirstMascotSwitch();
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [beginFirstMascotSwitch]);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.slice(1);
      const view = hash === "repositories" || hash === "activity" ? hash : "overview";
      selectView(view, false);
    };

    const initialTimer = window.setTimeout(syncFromHash, 0);
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.clearTimeout(initialTimer);
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, [selectView]);

  return (
    <>
      <Header activeView={activeView} onSelect={selectView} />
      <div className="app-viewport">
        <SummerBackdrop />

        <main className="profile-shell content-layer">
          <ProfileSidebar mascotPhase={mascotPhase} onMascotAnimationEnd={handleMascotAnimationEnd} />
          <section className="profile-content-frame" aria-label="Scrollable profile activity">
            <div className="scroll-hint" aria-hidden="true">SCROLL / EXPLORE</div>
            <div
              ref={contentRef}
              className="profile-content"
              role="region"
              aria-label={`${activeView} profile content`}
            >
              <div
                id="overview-panel"
                className="profile-tab-panel"
                role="region"
                aria-labelledby="overview-tab"
                hidden={activeView !== "overview"}
              >
                <RepositorySection />
                <ContributionExplorer onRevealComplete={handleContributionRevealComplete} />
                <div className="scroll-end-note" aria-hidden="true">
                  <span>STAY COOL</span>
                  <i />
                  <span>KEEP BUILDING</span>
                </div>
              </div>

              <div
                id="repositories-panel"
                className="profile-tab-panel"
                role="region"
                aria-labelledby="repositories-tab"
                hidden={activeView !== "repositories"}
              >
                <RepositoriesPanel />
              </div>

              <div
                id="activity-panel"
                className="profile-tab-panel"
                role="region"
                aria-labelledby="activity-tab"
                hidden={activeView !== "activity"}
              >
                <ActivityPanel />
              </div>
            </div>
          </section>
        </main>

        <footer id="contact" className="site-footer content-layer">
          <span>&copy; 2026 Sirui Mei</span>
          <div>
            <a href="https://github.com/siruimei07" target="_blank" rel="noreferrer">GitHub</a>
            <a href="mailto:sirui.mei07@gmail.com">Email</a>
            <a href={`#${activeView}`} onClick={(event) => { event.preventDefault(); contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>Back to top</a>
          </div>
        </footer>

        <SummerFlight />
      </div>
    </>
  );
}
