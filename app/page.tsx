"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { ContributionExplorer } from "./ContributionExplorer";
import { ActivityPanel, RepositoriesPanel } from "./GitHubProfilePanels";
import { SummerFlight } from "./SummerFlight";

type ProfileView = "overview" | "repositories" | "activity";

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

function ProfileSidebar() {
  return (
    <aside className="profile-sidebar" aria-label="Profile information">
      <div className="avatar-frame">
        <img className="avatar" src="/assets/avatar.jpg" alt="Sirui Mei's GitHub avatar" />
        <span className="status-bubble" title="Summer mode" aria-label="Status: summer mode">*</span>
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
  const contentRef = useRef<HTMLDivElement>(null);

  const selectView = useCallback((view: ProfileView, updateHistory = true) => {
    setActiveView(view);
    if (updateHistory) window.history.pushState(null, "", `#${view}`);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

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
          <ProfileSidebar />
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
                <ContributionExplorer />
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
