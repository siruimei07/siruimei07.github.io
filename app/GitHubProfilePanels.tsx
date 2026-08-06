"use client";

import { useEffect, useId, useState } from "react";

const GITHUB_LOGIN = "siruimei07";
const GITHUB_API = `https://api.github.com/users/${GITHUB_LOGIN}`;
const MAX_ACTIVITY_ITEMS = 25;

type SourceKind = "github" | "snapshot" | "unavailable";

type GitHubProfile = {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
  bio: string | null;
  location: string | null;
  followers: number | null;
  following: number | null;
  public_repos: number | null;
};

type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  homepage: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number | null;
  topics: string[];
  updated_at: string | null;
  visibility: string;
  archived: boolean;
  fork: boolean;
};

type GitHubEvent = {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: Record<string, unknown>;
};

type Resource<T> = {
  data: T;
  source: SourceKind;
  message?: string;
};

type GitHubSnapshot = {
  profile: Resource<GitHubProfile>;
  repositories: Resource<GitHubRepository[]>;
  events: Resource<GitHubEvent[]>;
  loadedAt: string;
};

type StaticGitHubData = {
  generatedAt?: string;
  profile?: GitHubProfile;
  repositories?: GitHubRepository[];
  events?: GitHubEvent[];
};

type PanelProps = {
  className?: string;
};

type EventDescription = {
  action: string;
  detail?: string;
  url: string;
};

const FALLBACK_PROFILE: GitHubProfile = {
  login: GITHUB_LOGIN,
  name: "Sirui Mei",
  avatar_url: "/assets/avatar.jpg",
  html_url: `https://github.com/${GITHUB_LOGIN}`,
  bio: "Undergraduate student at University of Toronto",
  location: null,
  followers: 5,
  following: 5,
  public_repos: 1,
};

// This is deliberately labelled as a saved snapshot in the interface. Fields
// whose latest value is not known are left null instead of being invented.
const FALLBACK_REPOSITORIES: GitHubRepository[] = [
  {
    id: -1,
    name: "GUI-for-RePKG",
    full_name: `${GITHUB_LOGIN}/GUI-for-RePKG`,
    html_url: `https://github.com/${GITHUB_LOGIN}/GUI-for-RePKG`,
    description: "An extensible C# WPF frontend with an Endfield-inspired maximal UI, rich motion, responsive navigation, and backend extension points.",
    homepage: null,
    language: "C#",
    stargazers_count: 4,
    forks_count: null,
    topics: [],
    updated_at: null,
    visibility: "public",
    archived: false,
    fork: false,
  },
];

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", { notation: "compact" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

class GitHubRequestError extends Error {
  readonly status: number;
  readonly rateLimitReset: Date | null;

  constructor(message: string, status: number, rateLimitReset: Date | null) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
    this.rateLimitReset = rateLimitReset;
  }
}

function parseRateLimitReset(value: string | null) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000) : null;
}

async function fetchGitHubPage<T>(url: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: string } | null;
      const message = body?.message || `GitHub returned ${response.status}`;
      throw new GitHubRequestError(
        message,
        response.status,
        parseRateLimitReset(response.headers.get("x-ratelimit-reset")),
      );
    }

    return {
      data: await response.json() as T,
      link: response.headers.get("link"),
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

function hasNextPage(linkHeader: string | null) {
  return Boolean(linkHeader?.split(",").some((link) => /rel="next"/.test(link)));
}

async function fetchAllOwnerRepositories() {
  const repositories: GitHubRepository[] = [];
  let page = 1;
  let nextPage = true;

  while (nextPage) {
    const query = new URLSearchParams({
      type: "owner",
      sort: "updated",
      direction: "desc",
      per_page: "100",
      page: String(page),
    });
    const result = await fetchGitHubPage<GitHubRepository[]>(`${GITHUB_API}/repos?${query}`);
    repositories.push(...result.data);
    nextPage = hasNextPage(result.link);
    page += 1;
  }

  return repositories;
}

async function fetchRecentEvents() {
  const query = new URLSearchParams({ per_page: "100" });
  const result = await fetchGitHubPage<GitHubEvent[]>(`${GITHUB_API}/events/public?${query}`);
  return result.data;
}

async function fetchDeployedSnapshot() {
  const response = await fetch(`/data/github.json?v=${Date.now()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error(`Saved GitHub data returned ${response.status}`);

  const payload = await response.json() as StaticGitHubData;
  return {
    profile: payload.profile?.login ? payload.profile : FALLBACK_PROFILE,
    repositories: Array.isArray(payload.repositories) ? payload.repositories : FALLBACK_REPOSITORIES,
    events: Array.isArray(payload.events) ? payload.events : [],
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
  };
}

function publicErrorMessage(error: unknown) {
  if (error instanceof GitHubRequestError) {
    if ((error.status === 403 || error.status === 429) && error.rateLimitReset) {
      return `GitHub's public API limit was reached. It resets ${DATE_TIME_FORMAT.format(error.rateLimitReset)}.`;
    }
    if (error.status === 403 || error.status === 429) {
      return "GitHub's public API limit was reached. Please try again later.";
    }
    if (error.status === 404) {
      return "This public GitHub profile could not be found.";
    }
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return "GitHub took too long to respond. Please try again.";
  }

  return "Live GitHub data is temporarily unavailable. Check the connection and try again.";
}

async function loadGitHubSnapshot(): Promise<GitHubSnapshot> {
  const [deployed, [profileResult, repositoriesResult, eventsResult]] = await Promise.all([
    fetchDeployedSnapshot().catch(() => null),
    Promise.allSettled([
      fetchGitHubPage<GitHubProfile>(GITHUB_API).then((result) => result.data),
      fetchAllOwnerRepositories(),
      fetchRecentEvents(),
    ]),
  ]);

  const deployedMessage = deployed?.generatedAt
    ? `Latest deployed snapshot: ${DATE_TIME_FORMAT.format(new Date(deployed.generatedAt))}.`
    : "Using the repository's saved public snapshot.";

  return {
    profile: profileResult.status === "fulfilled"
      ? { data: profileResult.value, source: "github" }
      : {
          data: deployed?.profile ?? FALLBACK_PROFILE,
          source: "snapshot",
          message: `${deployedMessage} ${publicErrorMessage(profileResult.reason)}`,
        },
    repositories: repositoriesResult.status === "fulfilled"
      ? { data: repositoriesResult.value, source: "github" }
      : {
          data: deployed?.repositories ?? FALLBACK_REPOSITORIES,
          source: "snapshot",
          message: `${deployedMessage} ${publicErrorMessage(repositoriesResult.reason)}`,
        },
    events: eventsResult.status === "fulfilled"
      ? { data: eventsResult.value, source: "github" }
      : deployed
        ? {
            data: deployed.events,
            source: "snapshot",
            message: `${deployedMessage} ${publicErrorMessage(eventsResult.reason)}`,
          }
        : { data: [], source: "unavailable", message: publicErrorMessage(eventsResult.reason) },
    loadedAt: new Date().toISOString(),
  };
}

let snapshotRequest: Promise<GitHubSnapshot> | null = null;

function requestGitHubSnapshot() {
  snapshotRequest ??= loadGitHubSnapshot();
  return snapshotRequest;
}

function useGitHubSnapshot() {
  const [retryKey, setRetryKey] = useState(0);
  const [state, setState] = useState<{
    loading: boolean;
    snapshot: GitHubSnapshot | null;
  }>({ loading: true, snapshot: null });

  useEffect(() => {
    let active = true;

    requestGitHubSnapshot().then((snapshot) => {
      if (active) setState({ loading: false, snapshot });
    });

    return () => {
      active = false;
    };
  }, [retryKey]);

  const retry = () => {
    snapshotRequest = null;
    setState((current) => ({ loading: true, snapshot: current.snapshot }));
    setRetryKey((key) => key + 1);
  };

  return { ...state, retry };
}

function combineClassNames(base: string, className?: string) {
  return className ? `${base} ${className}` : base;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function nestedRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return isRecord(value) ? value : null;
}

function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function numberValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arrayLengthValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.length : null;
}

function booleanValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
}

function repoUrl(event: GitHubEvent) {
  return `https://github.com/${event.repo.name}`;
}

function describeEvent(event: GitHubEvent): EventDescription {
  const payload = event.payload;
  const repository = event.repo.name;
  const defaultDescription = {
    action: "Updated public GitHub activity",
    detail: repository,
    url: repoUrl(event),
  };

  switch (event.type) {
    case "PushEvent": {
      const sizeCandidates = [
        numberValue(payload, "size"),
        numberValue(payload, "distinct_size"),
        arrayLengthValue(payload, "commits"),
      ];
      const size = sizeCandidates.find((value) => value !== null && value > 0) ?? null;
      const ref = stringValue(payload, "ref")?.replace("refs/heads/", "");
      return {
        action: size === null ? "Pushed commits" : `Pushed ${size} ${size === 1 ? "commit" : "commits"}`,
        detail: ref ? `${repository} / ${ref}` : repository,
        url: repoUrl(event),
      };
    }
    case "CreateEvent": {
      const refType = stringValue(payload, "ref_type") || "item";
      const ref = stringValue(payload, "ref");
      return {
        action: refType === "repository" ? "Created a repository" : `Created ${refType}${ref ? ` ${ref}` : ""}`,
        detail: repository,
        url: repoUrl(event),
      };
    }
    case "DeleteEvent": {
      const refType = stringValue(payload, "ref_type") || "item";
      const ref = stringValue(payload, "ref");
      return {
        action: `Deleted ${refType}${ref ? ` ${ref}` : ""}`,
        detail: repository,
        url: repoUrl(event),
      };
    }
    case "ForkEvent": {
      const forkee = nestedRecord(payload, "forkee");
      return {
        action: "Forked a repository",
        detail: stringValue(forkee, "full_name") || repository,
        url: stringValue(forkee, "html_url") || repoUrl(event),
      };
    }
    case "WatchEvent":
      return { action: "Starred a repository", detail: repository, url: repoUrl(event) };
    case "PublicEvent":
      return { action: "Made a repository public", detail: repository, url: repoUrl(event) };
    case "ReleaseEvent": {
      const release = nestedRecord(payload, "release");
      return {
        action: `${stringValue(payload, "action") || "Published"} a release`,
        detail: stringValue(release, "name") || stringValue(release, "tag_name") || repository,
        url: stringValue(release, "html_url") || repoUrl(event),
      };
    }
    case "PullRequestEvent": {
      const pullRequest = nestedRecord(payload, "pull_request");
      const merged = booleanValue(pullRequest, "merged");
      const action = merged ? "Merged" : stringValue(payload, "action") || "Updated";
      const number = numberValue(payload, "number");
      return {
        action: `${action[0].toUpperCase()}${action.slice(1)} pull request${number ? ` #${number}` : ""}`,
        detail: stringValue(pullRequest, "title") || repository,
        url: stringValue(pullRequest, "html_url") || repoUrl(event),
      };
    }
    case "PullRequestReviewEvent":
    case "PullRequestReviewCommentEvent": {
      const pullRequest = nestedRecord(payload, "pull_request");
      const comment = nestedRecord(payload, "comment");
      const review = nestedRecord(payload, "review");
      return {
        action: event.type === "PullRequestReviewEvent" ? "Reviewed a pull request" : "Commented on a pull request",
        detail: stringValue(pullRequest, "title") || repository,
        url: stringValue(comment, "html_url") || stringValue(review, "html_url") || stringValue(pullRequest, "html_url") || repoUrl(event),
      };
    }
    case "IssuesEvent": {
      const issue = nestedRecord(payload, "issue");
      const action = stringValue(payload, "action") || "Updated";
      return {
        action: `${action[0].toUpperCase()}${action.slice(1)} issue`,
        detail: stringValue(issue, "title") || repository,
        url: stringValue(issue, "html_url") || repoUrl(event),
      };
    }
    case "IssueCommentEvent": {
      const issue = nestedRecord(payload, "issue");
      const comment = nestedRecord(payload, "comment");
      return {
        action: "Commented on an issue",
        detail: stringValue(issue, "title") || repository,
        url: stringValue(comment, "html_url") || stringValue(issue, "html_url") || repoUrl(event),
      };
    }
    case "CommitCommentEvent": {
      const comment = nestedRecord(payload, "comment");
      return {
        action: "Commented on a commit",
        detail: repository,
        url: stringValue(comment, "html_url") || repoUrl(event),
      };
    }
    case "MemberEvent": {
      const member = nestedRecord(payload, "member");
      return {
        action: `${stringValue(payload, "action") || "Updated"} a collaborator`,
        detail: stringValue(member, "login") || repository,
        url: repoUrl(event),
      };
    }
    case "GollumEvent":
      return { action: "Updated the wiki", detail: repository, url: `${repoUrl(event)}/wiki` };
    default:
      return defaultDescription;
  }
}

function DataSourceNotice({ resource }: { resource: Resource<unknown> }) {
  if (resource.source === "github") {
    return (
      <p className="github-source github-source-live" role="status">
        <span className="github-source-dot" aria-hidden="true" />
        Live public data from GitHub
      </p>
    );
  }

  return (
    <div className={`github-source github-source-${resource.source}`} role="status">
      <span className="github-source-dot" aria-hidden="true" />
      <span>
        {resource.source === "snapshot" ? "Showing a saved public snapshot." : "Live activity is unavailable."}
        {resource.message ? ` ${resource.message}` : ""}
      </span>
    </div>
  );
}

function PanelDecorations({ variant }: { variant: "repositories" | "activity" }) {
  if (variant === "repositories") {
    return (
      <div className="github-panel-decor github-panel-decor-repositories" aria-hidden="true">
        <img className="panel-sticker panel-sticker-repo-shopping" src="/assets/summer-drink.gif" alt="" />
        <img className="panel-sticker panel-sticker-repo-reader" src="/assets/study-reader.gif" alt="" />
        <img className="panel-ui panel-ui-repo-bunny" src="/assets/angelina-ui/16.png" alt="" />
        <img className="panel-ui panel-ui-repo-stars" src="/assets/angelina-ui/22.png" alt="" />
        <img className="panel-ui panel-ui-repo-flower" src="/assets/angelina-ui/25.png" alt="" />
      </div>
    );
  }

  return (
    <div className="github-panel-decor github-panel-decor-activity" aria-hidden="true">
      <img className="panel-sticker panel-sticker-activity-delivery" src="/assets/delivery-run.gif" alt="" />
      <img className="panel-sticker panel-sticker-activity-explorer" src="/assets/raincoat-walker.gif" alt="" />
      <img className="panel-sticker panel-sticker-activity-diver" src="/assets/diver.gif" alt="" />
      <img className="panel-ui panel-ui-activity-lineup" src="/assets/angelina-ui/17.png" alt="" />
      <img className="panel-ui panel-ui-activity-flower" src="/assets/angelina-ui/24.png" alt="" />
      <img className="panel-ui panel-ui-activity-petal" src="/assets/angelina-ui/26.png" alt="" />
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="github-panel-loading" role="status" aria-live="polite">
      <span className="github-loading-ripple" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function RepositoriesPanel({ className }: PanelProps) {
  const headingId = useId();
  const { loading, snapshot, retry } = useGitHubSnapshot();

  if (!snapshot && loading) {
    return (
      <section id="repositories" className={combineClassNames("github-panel github-repositories-panel", className)} aria-busy="true">
        <PanelDecorations variant="repositories" />
        <LoadingPanel label="Loading public repositories from GitHub..." />
      </section>
    );
  }

  if (!snapshot) return null;
  const repositories = snapshot.repositories.data;

  return (
    <section
      id="repositories"
      className={combineClassNames("github-panel github-repositories-panel", className)}
      aria-labelledby={headingId}
      aria-busy={loading}
      data-source={snapshot.repositories.source}
    >
      <PanelDecorations variant="repositories" />

      <div className="github-panel-heading">
        <div>
          <p className="github-panel-kicker">ALL PUBLIC WORK</p>
          <h2 id={headingId}>Repositories</h2>
          <p className="github-panel-summary">
            {repositories.length} owner {repositories.length === 1 ? "repository" : "repositories"}, ordered by latest update
          </p>
        </div>
        <div className="github-panel-actions">
          <DataSourceNotice resource={snapshot.repositories} />
          <button className="github-refresh-button" type="button" onClick={retry} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh GitHub data"}
          </button>
        </div>
      </div>

      {repositories.length > 0 ? (
        <div className="github-repository-grid">
          {repositories.map((repository, index) => (
            <article
              className={combineClassNames(
                "github-repository-card",
                index === 0 ? "github-repository-card-with-camera" : undefined,
              )}
              key={repository.id}
            >
              {index === 0 && (
                <img
                  className="panel-sticker panel-sticker-repo-camera"
                  src="/assets/camera-nap.gif"
                  alt=""
                  aria-hidden="true"
                />
              )}
              <header className="github-repository-header">
                <div>
                  <a className="github-repository-name" href={repository.html_url} target="_blank" rel="noreferrer">
                    {repository.name}
                  </a>
                  {repository.fork && <span className="github-repository-fork">Fork</span>}
                  {repository.archived && <span className="github-repository-archived">Archived</span>}
                </div>
                <span className="github-visibility-pill">{repository.visibility || "public"}</span>
              </header>

              <p className="github-repository-description">
                {repository.description || "No public description has been added to this repository."}
              </p>

              {repository.topics.length > 0 && (
                <ul className="github-repository-topics" aria-label={`${repository.name} topics`}>
                  {repository.topics.map((topic) => <li key={topic}>{topic}</li>)}
                </ul>
              )}

              <footer className="github-repository-meta">
                {repository.language && (
                  <span className="github-repository-language">
                    <i className="github-language-dot" aria-hidden="true" />
                    {repository.language}
                  </span>
                )}
                <span title={`${repository.stargazers_count} stars`} aria-label={`${repository.stargazers_count} stars`}>
                  <span aria-hidden="true">★</span> {NUMBER_FORMAT.format(repository.stargazers_count)}
                </span>
                {repository.forks_count !== null && (
                  <span title={`${repository.forks_count} forks`} aria-label={`${repository.forks_count} forks`}>
                    <span aria-hidden="true">⑂</span> {NUMBER_FORMAT.format(repository.forks_count)}
                  </span>
                )}
                {repository.updated_at && (
                  <time dateTime={repository.updated_at} title={DATE_TIME_FORMAT.format(new Date(repository.updated_at))}>
                    Updated {DATE_FORMAT.format(new Date(repository.updated_at))}
                  </time>
                )}
                {repository.homepage && (
                  <a href={repository.homepage} target="_blank" rel="noreferrer">Project site</a>
                )}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <p className="github-panel-empty">No public owner repositories are currently available.</p>
      )}

      <a className="github-panel-external-link" href={`https://github.com/${GITHUB_LOGIN}?tab=repositories`} target="_blank" rel="noreferrer">
        View repositories on GitHub <span aria-hidden="true">-&gt;</span>
      </a>
    </section>
  );
}

export function ActivityPanel({ className }: PanelProps) {
  const headingId = useId();
  const { loading, snapshot, retry } = useGitHubSnapshot();

  if (!snapshot && loading) {
    return (
      <section id="activity" className={combineClassNames("github-panel github-activity-panel", className)} aria-busy="true">
        <PanelDecorations variant="activity" />
        <LoadingPanel label="Loading recent public activity from GitHub..." />
      </section>
    );
  }

  if (!snapshot) return null;
  const events = snapshot.events.data.slice(0, MAX_ACTIVITY_ITEMS);

  return (
    <section
      id="activity"
      className={combineClassNames("github-panel github-activity-panel", className)}
      aria-labelledby={headingId}
      aria-busy={loading}
      data-source={snapshot.events.source}
    >
      <PanelDecorations variant="activity" />

      <div className="github-panel-heading">
        <div>
          <p className="github-panel-kicker">RECENT PUBLIC EVENTS</p>
          <h2 id={headingId}>Activity</h2>
          <p className="github-panel-summary">
            {events.length > 0
              ? `Showing ${events.length} most recent public ${events.length === 1 ? "event" : "events"}`
              : "Public activity is available directly from GitHub"}
          </p>
        </div>
        <div className="github-panel-actions">
          <DataSourceNotice resource={snapshot.events} />
          <button className="github-refresh-button" type="button" onClick={retry} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh GitHub data"}
          </button>
        </div>
      </div>

      {events.length > 0 ? (
        <ol className="github-activity-list">
          {events.map((event) => {
            const description = describeEvent(event);
            return (
              <li className="github-activity-item" key={event.id}>
                <span className="github-activity-marker" aria-hidden="true">+</span>
                <article>
                  <div className="github-activity-item-heading">
                    <a href={description.url} target="_blank" rel="noreferrer">{description.action}</a>
                    <time dateTime={event.created_at}>{DATE_TIME_FORMAT.format(new Date(event.created_at))}</time>
                  </div>
                  {description.detail && <p>{description.detail}</p>}
                  <span className="github-event-type">{event.type.replace(/Event$/, "")}</span>
                </article>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="github-activity-empty">
          <p>
            {snapshot.events.source === "github"
              ? "GitHub has no recent public events to show for this profile."
              : "Recent events are not cached, so no activity has been invented while GitHub is unavailable."}
          </p>
          <a href={`https://github.com/${GITHUB_LOGIN}?tab=overview`} target="_blank" rel="noreferrer">
            Open the public GitHub profile
          </a>
        </div>
      )}

      <a className="github-panel-external-link" href={`https://github.com/${GITHUB_LOGIN}?tab=overview`} target="_blank" rel="noreferrer">
        View full activity on GitHub <span aria-hidden="true">-&gt;</span>
      </a>
    </section>
  );
}
