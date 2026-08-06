"use client";

import { useEffect, useId, useState } from "react";

const GITHUB_LOGIN = "siruimei07";
const GITHUB_API = `https://api.github.com/users/${GITHUB_LOGIN}`;
const GITHUB_API_ORIGIN = "https://api.github.com";
const GITHUB_PROFILE_URL = `https://github.com/${GITHUB_LOGIN}`;
const MAX_ACTIVITY_ITEMS = 25;
const MAX_REPOSITORY_PAGES = 100;

type SourceKind = "github" | "snapshot" | "unavailable";

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
  repositories: Resource<GitHubRepository[]>;
  events: Resource<GitHubEvent[]>;
  loadedAt: string;
};

type StaticGitHubData = {
  generatedAt?: unknown;
  repositories?: unknown;
  events?: unknown;
};

type PanelProps = {
  className?: string;
};

type EventDescription = {
  action: string;
  detail?: string;
  url: string;
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

function safeHttpsUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function safeGitHubUrl(value: unknown) {
  const safeUrl = safeHttpsUrl(value);
  if (!safeUrl) return null;
  const url = new URL(safeUrl);
  return url.hostname === "github.com" ? url.href : null;
}

function safeGitHubValue(record: Record<string, unknown> | null, key: string) {
  return safeGitHubUrl(stringValue(record, key));
}

async function fetchGitHubPage<T>(url: string) {
  const requestUrl = new URL(url);
  if (requestUrl.origin !== GITHUB_API_ORIGIN || !requestUrl.pathname.startsWith(`/users/${GITHUB_LOGIN}`)) {
    throw new Error("Refused a GitHub API request outside the configured public profile");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(requestUrl, {
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

  while (nextPage && page <= MAX_REPOSITORY_PAGES) {
    const query = new URLSearchParams({
      type: "owner",
      sort: "updated",
      direction: "desc",
      per_page: "100",
      page: String(page),
    });
    const result = await fetchGitHubPage<GitHubRepository[]>(`${GITHUB_API}/repos?${query}`);
    if (!Array.isArray(result.data)) throw new Error("GitHub returned malformed repository data");
    const normalized = result.data
      .map(normalizeRepository)
      .filter((repository): repository is GitHubRepository => repository !== null);
    if (result.data.length > 0 && normalized.length === 0) {
      throw new Error("GitHub repository data failed runtime validation");
    }
    repositories.push(...normalized);
    nextPage = hasNextPage(result.link);
    page += 1;
  }

  if (nextPage) throw new Error("GitHub repository pagination exceeded the safe page limit");

  return repositories;
}

async function fetchRecentEvents() {
  const query = new URLSearchParams({ per_page: String(MAX_ACTIVITY_ITEMS) });
  const result = await fetchGitHubPage<GitHubEvent[]>(`${GITHUB_API}/events/public?${query}`);
  if (!Array.isArray(result.data)) throw new Error("GitHub returned malformed activity data");
  return result.data
    .map(normalizeEvent)
    .filter((event): event is GitHubEvent => event !== null);
}

async function fetchDeployedSnapshot() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(`/data/github.json?v=${Date.now()}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Saved GitHub data returned ${response.status}`);

    const rawPayload = await response.json() as unknown;
    if (!isRecord(rawPayload)) throw new Error("Saved GitHub data is malformed");
    const payload = rawPayload as StaticGitHubData;
    if (!Array.isArray(payload.repositories) || !Array.isArray(payload.events)) {
      throw new Error("Saved GitHub data is missing repository or activity arrays");
    }

    const repositories = payload.repositories
      .map(normalizeRepository)
      .filter((repository): repository is GitHubRepository => repository !== null);
    const events = payload.events
      .map(normalizeEvent)
      .filter((event): event is GitHubEvent => event !== null)
      .slice(0, MAX_ACTIVITY_ITEMS);
    if (payload.repositories.length > 0 && repositories.length === 0) {
      throw new Error("Saved repository data failed runtime validation");
    }
    if (payload.events.length > 0 && events.length === 0) {
      throw new Error("Saved activity data failed runtime validation");
    }

    const generatedAt = typeof payload.generatedAt === "string"
      && Number.isFinite(Date.parse(payload.generatedAt))
      ? payload.generatedAt
      : null;
    return { repositories, events, generatedAt };
  } finally {
    window.clearTimeout(timeout);
  }
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
  const [deployed, [repositoriesResult, eventsResult]] = await Promise.all([
    fetchDeployedSnapshot().catch(() => null),
    Promise.allSettled([
      fetchAllOwnerRepositories(),
      fetchRecentEvents(),
    ]),
  ]);

  const deployedMessage = deployed?.generatedAt
    ? `Latest deployed snapshot: ${DATE_TIME_FORMAT.format(new Date(deployed.generatedAt))}.`
    : "Using the repository's saved public snapshot.";

  return {
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

function normalizeRepository(value: unknown): GitHubRepository | null {
  if (!isRecord(value)) return null;
  const id = numberValue(value, "id");
  const name = stringValue(value, "name")?.trim();
  const fullName = stringValue(value, "full_name")?.trim();
  const htmlUrl = safeGitHubUrl(stringValue(value, "html_url"));
  if (id === null || !Number.isSafeInteger(id) || !name || !fullName || !htmlUrl) return null;

  const description = stringValue(value, "description")?.trim().slice(0, 1000) || null;
  const homepage = safeHttpsUrl(stringValue(value, "homepage"));
  const language = stringValue(value, "language")?.trim().slice(0, 80) || null;
  const stars = numberValue(value, "stargazers_count");
  const forks = numberValue(value, "forks_count");
  const topicsValue = value.topics;
  const updatedAt = stringValue(value, "updated_at");
  const validUpdatedAt = updatedAt && Number.isFinite(Date.parse(updatedAt)) ? updatedAt : null;

  return {
    id: id as number,
    name: name.slice(0, 200),
    full_name: fullName.slice(0, 260),
    html_url: htmlUrl,
    description,
    homepage,
    language,
    stargazers_count: stars !== null && Number.isSafeInteger(stars) && stars >= 0 ? stars : 0,
    forks_count: forks !== null && Number.isSafeInteger(forks) && forks >= 0 ? forks : null,
    topics: Array.isArray(topicsValue)
      ? topicsValue.filter((topic): topic is string => typeof topic === "string").slice(0, 20).map((topic) => topic.slice(0, 80))
      : [],
    updated_at: validUpdatedAt,
    visibility: stringValue(value, "visibility")?.slice(0, 30) || "public",
    archived: booleanValue(value, "archived") ?? false,
    fork: booleanValue(value, "fork") ?? false,
  };
}

function normalizeEvent(value: unknown): GitHubEvent | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value, "id");
  const type = stringValue(value, "type");
  const createdAt = stringValue(value, "created_at");
  const repo = nestedRecord(value, "repo");
  const repoName = stringValue(repo, "name");
  if (!id || !type || !createdAt || !Number.isFinite(Date.parse(createdAt)) || !repoName) return null;

  return {
    id: id.slice(0, 160),
    type: type.slice(0, 80),
    created_at: createdAt,
    repo: { name: repoName.slice(0, 260) },
    payload: nestedRecord(value, "payload") ?? {},
  };
}

function repoUrl(event: GitHubEvent) {
  const match = /^([A-Za-z0-9.-]+)\/([A-Za-z0-9._-]+)$/.exec(event.repo.name);
  if (!match) return GITHUB_PROFILE_URL;
  return `https://github.com/${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
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
        url: safeGitHubValue(forkee, "html_url") || repoUrl(event),
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
        url: safeGitHubValue(release, "html_url") || repoUrl(event),
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
        url: safeGitHubValue(pullRequest, "html_url") || repoUrl(event),
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
        url: safeGitHubValue(comment, "html_url") || safeGitHubValue(review, "html_url") || safeGitHubValue(pullRequest, "html_url") || repoUrl(event),
      };
    }
    case "IssuesEvent": {
      const issue = nestedRecord(payload, "issue");
      const action = stringValue(payload, "action") || "Updated";
      return {
        action: `${action[0].toUpperCase()}${action.slice(1)} issue`,
        detail: stringValue(issue, "title") || repository,
        url: safeGitHubValue(issue, "html_url") || repoUrl(event),
      };
    }
    case "IssueCommentEvent": {
      const issue = nestedRecord(payload, "issue");
      const comment = nestedRecord(payload, "comment");
      return {
        action: "Commented on an issue",
        detail: stringValue(issue, "title") || repository,
        url: safeGitHubValue(comment, "html_url") || safeGitHubValue(issue, "html_url") || repoUrl(event),
      };
    }
    case "CommitCommentEvent": {
      const comment = nestedRecord(payload, "comment");
      return {
        action: "Commented on a commit",
        detail: repository,
        url: safeGitHubValue(comment, "html_url") || repoUrl(event),
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
        <img className="panel-sticker panel-sticker-repo-shopping" src="/assets/summer-drink.gif" alt="" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
        <img className="panel-sticker panel-sticker-repo-reader" src="/assets/study-reader.gif" alt="" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
        <img className="panel-ui panel-ui-repo-bunny" src="/assets/angelina-ui/16.png" alt="" width={223} height={145} loading="lazy" decoding="async" fetchPriority="low" />
        <img className="panel-ui panel-ui-repo-stars" src="/assets/angelina-ui/22.png" alt="" width={508} height={395} loading="lazy" decoding="async" fetchPriority="low" />
        <img className="panel-ui panel-ui-repo-flower" src="/assets/angelina-ui/25.png" alt="" width={48} height={49} loading="lazy" decoding="async" fetchPriority="low" />
      </div>
    );
  }

  return (
    <div className="github-panel-decor github-panel-decor-activity" aria-hidden="true">
      <img className="panel-sticker panel-sticker-activity-delivery" src="/assets/delivery-run.gif" alt="" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
      <img className="panel-sticker panel-sticker-activity-explorer" src="/assets/raincoat-walker.gif" alt="" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
      <img className="panel-sticker panel-sticker-activity-diver" src="/assets/diver.gif" alt="" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
      <img className="panel-ui panel-ui-activity-lineup" src="/assets/angelina-ui/17.png" alt="" width={270} height={136} loading="lazy" decoding="async" fetchPriority="low" />
      <img className="panel-ui panel-ui-activity-flower" src="/assets/angelina-ui/24.png" alt="" width={83} height={84} loading="lazy" decoding="async" fetchPriority="low" />
      <img className="panel-ui panel-ui-activity-petal" src="/assets/angelina-ui/26.png" alt="" width={49} height={47} loading="lazy" decoding="async" fetchPriority="low" />
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
          {repositories.map((repository, index) => {
            const repositoryUrl = safeGitHubUrl(repository.html_url) ?? GITHUB_PROFILE_URL;
            const homepageUrl = safeHttpsUrl(repository.homepage);
            return (
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
                  width={1024}
                  height={1024}
                  loading="lazy"
                  decoding="async"
                  fetchPriority="low"
                />
              )}
              <header className="github-repository-header">
                <div>
                  <a className="github-repository-name" href={repositoryUrl} target="_blank" rel="noopener noreferrer">
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
                {homepageUrl && (
                  <a href={homepageUrl} target="_blank" rel="noopener noreferrer">Project site</a>
                )}
              </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="github-panel-empty">No public owner repositories are currently available.</p>
      )}

      <a className="github-panel-external-link" href={`https://github.com/${GITHUB_LOGIN}?tab=repositories`} target="_blank" rel="noopener noreferrer">
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
                    <a href={description.url} target="_blank" rel="noopener noreferrer">{description.action}</a>
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
          <a href={`https://github.com/${GITHUB_LOGIN}?tab=overview`} target="_blank" rel="noopener noreferrer">
            Open the public GitHub profile
          </a>
        </div>
      )}

      <a className="github-panel-external-link" href={`https://github.com/${GITHUB_LOGIN}?tab=overview`} target="_blank" rel="noopener noreferrer">
        View full activity on GitHub <span aria-hidden="true">-&gt;</span>
      </a>
    </section>
  );
}
