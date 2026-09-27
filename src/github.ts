// Shapes public/data/github.json (written by scripts/sync-github-data.mjs) into
// what the page needs. Pure functions: used at build time to pre-render HTML.

import { works as curatedWorks, type Work } from "./content.ts";

export type Contribution = { date: string; level: number; count: number };

export type Repository = {
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string | null;
  archived: boolean;
  fork: boolean;
};

export type GitHubSnapshot = {
  generatedAt: string;
  profile: { followers: number; following: number; public_repos: number };
  repositories: Repository[];
  contributions: Contribution[];
};

export type WorkView = Work & { stars: number | null; language: string | null; updated: string | null };

export function mergeWorks(data: GitHubSnapshot | null): WorkView[] {
  const repos = new Map((data?.repositories ?? []).map((r) => [r.name.toLowerCase(), r]));
  const merged: WorkView[] = curatedWorks.map((w) => {
    const r = repos.get(w.repo.toLowerCase());
    return { ...w, stars: r?.stargazers_count ?? null, language: r?.language ?? null, updated: r?.updated_at ?? null };
  });
  const known = new Set(curatedWorks.map((w) => w.repo.toLowerCase()));
  for (const r of data?.repositories ?? []) {
    if (r.fork || known.has(r.name.toLowerCase())) continue;
    merged.push({
      repo: r.name,
      code: (r.language ?? "GIT").slice(0, 3).toUpperCase(),
      title: r.name,
      zh: "公开仓库",
      description: r.description ?? "A public repository on GitHub.",
      stack: r.language ? [r.language] : [],
      state: r.archived ? "archive" : "live",
      href: r.html_url,
      stars: r.stargazers_count,
      language: r.language,
      updated: r.updated_at,
    });
  }
  return merged;
}

export type Stats = { followers: number; repos: number; stars: number; yearContributions: number; activeDays: number };

export function summarize(data: GitHubSnapshot | null): Stats | null {
  if (!data) return null;
  const end = dayNumber(data.generatedAt.slice(0, 10));
  let yearContributions = 0;
  let activeDays = 0;
  for (const c of data.contributions) {
    const d = dayNumber(c.date);
    if (d > end - 365 && d <= end && c.count > 0) {
      yearContributions += c.count;
      activeDays += 1;
    }
  }
  return {
    followers: data.profile.followers,
    repos: data.profile.public_repos,
    stars: data.repositories.filter((r) => !r.fork).reduce((sum, r) => sum + r.stargazers_count, 0),
    yearContributions,
    activeDays,
  };
}

export type HeatCell = { date: string; level: number; count: number; future: boolean };

// 53 columns (weeks, Sunday-first) ending with the week of the snapshot date.
export function heatmap(data: GitHubSnapshot | null): HeatCell[][] {
  const today = dayNumber((data?.generatedAt ?? new Date().toISOString()).slice(0, 10));
  const byDate = new Map((data?.contributions ?? []).map((c) => [c.date, c]));
  const weekday = new Date(today * 86_400_000).getUTCDay();
  const start = today - weekday - 52 * 7;
  const weeks: HeatCell[][] = [];
  for (let w = 0; w < 53; w++) {
    const col: HeatCell[] = [];
    for (let d = 0; d < 7; d++) {
      const n = start + w * 7 + d;
      const date = new Date(n * 86_400_000).toISOString().slice(0, 10);
      const c = byDate.get(date);
      col.push({ date, level: c?.level ?? 0, count: c?.count ?? 0, future: n > today });
    }
    weeks.push(col);
  }
  return weeks;
}

export type HeatStats = { total: number; active: number; longest: number; current: number; best: { date: string; count: number } | null };

/** Totals and streaks over the heatmap's past days. */
export function heatStats(weeks: HeatCell[][]): HeatStats {
  const days = weeks.flat().filter((c) => !c.future);
  let total = 0;
  let active = 0;
  let longest = 0;
  let run = 0;
  let best: HeatStats["best"] = null;
  for (const c of days) {
    total += c.count;
    if (c.count > 0) {
      active++;
      run++;
      longest = Math.max(longest, run);
      if (!best || c.count > best.count) best = { date: c.date, count: c.count };
    } else run = 0;
  }
  // the current streak may end yesterday (today can still be empty)
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue;
    else break;
  }
  return { total, active, longest, current, best };
}

function dayNumber(isoDate: string): number {
  return Math.floor(Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000);
}
