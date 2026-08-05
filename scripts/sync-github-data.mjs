#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_LOGIN = "siruimei07";
const FIRST_CONTRIBUTION_YEAR = 2025;
const REST_API_ROOT = "https://api.github.com";
const GRAPHQL_API_URL = "https://api.github.com/graphql";
const OUTPUT_PATH = fileURLToPath(new URL("../public/data/github.json", import.meta.url));
const TOKEN = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || "";

const CONTRIBUTION_LEVELS = Object.freeze({
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
});

const CONTRIBUTION_QUERY = `
  query ContributionCalendar($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
            }
          }
        }
      }
    }
  }
`;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function fail(message) {
  throw new Error(message);
}

function expectRecord(value, field) {
  if (!isRecord(value)) fail(`${field} must be an object`);
  return value;
}

function expectArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function expectString(value, field) {
  if (typeof value !== "string" || value.length === 0) fail(`${field} must be a non-empty string`);
  return value;
}

function expectNullableString(value, field) {
  if (value !== null && typeof value !== "string") fail(`${field} must be a string or null`);
  return value;
}

function expectBoolean(value, field) {
  if (typeof value !== "boolean") fail(`${field} must be a boolean`);
  return value;
}

function expectInteger(value, field, { minimum = 0, nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${field} must be ${nullable ? "null or " : ""}an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function expectIsoTimestamp(value, field) {
  expectString(value, field);
  if (!Number.isFinite(Date.parse(value))) fail(`${field} must be a valid ISO timestamp`);
  return value;
}

function expectIsoDate(value, field) {
  expectString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    fail(`${field} must be a valid YYYY-MM-DD date`);
  }
  return value;
}

function redactSecrets(value) {
  let message = String(value);
  for (const secret of [process.env.GITHUB_TOKEN, process.env.GH_TOKEN]) {
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message;
}

function errorMessage(error) {
  return redactSecrets(error instanceof Error ? error.message : error);
}

async function requestJson(url, { label, method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "siruimei07.github.io-data-sync",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    fail(`Network request failed while fetching ${label}: ${errorMessage(error)}`);
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      fail(`GitHub returned invalid JSON for ${label} (HTTP ${response.status})`);
    }
  }

  if (!response.ok) {
    const apiMessage = isRecord(payload) && typeof payload.message === "string"
      ? `: ${redactSecrets(payload.message)}`
      : "";
    fail(`GitHub request for ${label} failed (HTTP ${response.status} ${response.statusText})${apiMessage}`);
  }

  return payload;
}

function normalizeProfile(value) {
  const profile = expectRecord(value, "profile");
  return {
    login: expectString(profile.login, "profile.login"),
    name: expectNullableString(profile.name, "profile.name"),
    avatar_url: expectString(profile.avatar_url, "profile.avatar_url"),
    html_url: expectString(profile.html_url, "profile.html_url"),
    bio: expectNullableString(profile.bio, "profile.bio"),
    location: expectNullableString(profile.location, "profile.location"),
    followers: expectInteger(profile.followers, "profile.followers"),
    following: expectInteger(profile.following, "profile.following"),
    public_repos: expectInteger(profile.public_repos, "profile.public_repos"),
  };
}

function normalizeRepository(value, index) {
  const field = `repositories[${index}]`;
  const repository = expectRecord(value, field);
  return {
    id: expectInteger(repository.id, `${field}.id`, { minimum: -1 }),
    name: expectString(repository.name, `${field}.name`),
    full_name: expectString(repository.full_name, `${field}.full_name`),
    html_url: expectString(repository.html_url, `${field}.html_url`),
    description: expectNullableString(repository.description, `${field}.description`),
    homepage: expectNullableString(repository.homepage, `${field}.homepage`),
    language: expectNullableString(repository.language, `${field}.language`),
    stargazers_count: expectInteger(repository.stargazers_count, `${field}.stargazers_count`),
    forks_count: expectInteger(repository.forks_count, `${field}.forks_count`, { nullable: true }),
    topics: expectArray(repository.topics, `${field}.topics`).map((topic, topicIndex) =>
      expectString(topic, `${field}.topics[${topicIndex}]`)),
    updated_at: repository.updated_at === null
      ? null
      : expectIsoTimestamp(repository.updated_at, `${field}.updated_at`),
    visibility: expectString(repository.visibility, `${field}.visibility`),
    archived: expectBoolean(repository.archived, `${field}.archived`),
    fork: expectBoolean(repository.fork, `${field}.fork`),
  };
}

function normalizeEvent(value, index) {
  const field = `events[${index}]`;
  const event = expectRecord(value, field);
  const repo = expectRecord(event.repo, `${field}.repo`);
  return {
    id: expectString(event.id, `${field}.id`),
    type: expectString(event.type, `${field}.type`),
    created_at: expectIsoTimestamp(event.created_at, `${field}.created_at`),
    repo: { name: expectString(repo.name, `${field}.repo.name`) },
    payload: expectRecord(event.payload, `${field}.payload`),
  };
}

function normalizeContribution(value, index) {
  const field = `contributions[${index}]`;
  const contribution = expectRecord(value, field);
  const level = expectInteger(contribution.level, `${field}.level`);
  if (level > 4) fail(`${field}.level must be between 0 and 4`);
  return {
    date: expectIsoDate(contribution.date, `${field}.date`),
    level,
    count: expectInteger(contribution.count, `${field}.count`),
    label: expectString(contribution.label, `${field}.label`),
  };
}

function normalizeStaticData(value) {
  const data = expectRecord(value, "GitHub data");
  const normalized = {
    generatedAt: expectIsoTimestamp(data.generatedAt, "generatedAt"),
    profile: normalizeProfile(data.profile),
    repositories: expectArray(data.repositories, "repositories").map(normalizeRepository),
    events: expectArray(data.events, "events").map(normalizeEvent),
    contributions: expectArray(data.contributions, "contributions").map(normalizeContribution),
  };

  const seenDates = new Set();
  for (const contribution of normalized.contributions) {
    if (seenDates.has(contribution.date)) fail(`contributions contains duplicate date ${contribution.date}`);
    seenDates.add(contribution.date);
  }

  return normalized;
}

async function fetchAllOwnerRepositories() {
  const repositories = [];
  for (let page = 1; page <= 100; page += 1) {
    const query = new URLSearchParams({
      type: "owner",
      sort: "updated",
      direction: "desc",
      per_page: "100",
      page: String(page),
    });
    const payload = expectArray(
      await requestJson(`${REST_API_ROOT}/users/${GITHUB_LOGIN}/repos?${query}`, {
        label: `owner repositories page ${page}`,
      }),
      `owner repositories page ${page}`,
    );
    repositories.push(...payload);
    if (payload.length < 100) return repositories.map(normalizeRepository);
  }
  fail("Repository pagination exceeded 100 pages; refusing to write an incomplete snapshot");
}

async function fetchRecentPublicEvents() {
  const query = new URLSearchParams({ per_page: "100", page: "1" });
  const payload = expectArray(
    await requestJson(`${REST_API_ROOT}/users/${GITHUB_LOGIN}/events/public?${query}`, {
      label: "recent public events",
    }),
    "recent public events",
  );
  return payload.map(normalizeEvent);
}

async function fetchContributionYear(year, now) {
  const currentYear = now.getUTCFullYear();
  const from = `${year}-01-01T00:00:00.000Z`;
  const to = year === currentYear ? now.toISOString() : `${year}-12-31T23:59:59.999Z`;
  const payload = expectRecord(
    await requestJson(GRAPHQL_API_URL, {
      label: `contribution calendar for ${year}`,
      method: "POST",
      body: JSON.stringify({
        query: CONTRIBUTION_QUERY,
        variables: { login: GITHUB_LOGIN, from, to },
      }),
    }),
    `GraphQL response for ${year}`,
  );

  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    const details = payload.errors
      .map((error) => isRecord(error) && typeof error.message === "string" ? error.message : "Unknown GraphQL error")
      .map(redactSecrets)
      .join("; ");
    fail(`GitHub GraphQL failed for contribution calendar ${year}: ${details}`);
  }

  const user = payload.data?.user;
  if (!isRecord(user)) fail(`GitHub GraphQL did not return user ${GITHUB_LOGIN} for ${year}`);
  const calendar = user.contributionsCollection?.contributionCalendar;
  const weeks = expectArray(calendar?.weeks, `contribution calendar weeks for ${year}`);
  const contributions = [];

  for (const [weekIndex, weekValue] of weeks.entries()) {
    const week = expectRecord(weekValue, `contribution calendar ${year}.weeks[${weekIndex}]`);
    const days = expectArray(week.contributionDays, `contribution calendar ${year}.weeks[${weekIndex}].contributionDays`);
    for (const [dayIndex, dayValue] of days.entries()) {
      const field = `contribution calendar ${year}.weeks[${weekIndex}].contributionDays[${dayIndex}]`;
      const day = expectRecord(dayValue, field);
      const date = expectIsoDate(day.date, `${field}.date`);
      const count = expectInteger(day.contributionCount, `${field}.contributionCount`);
      const level = CONTRIBUTION_LEVELS[day.contributionLevel];
      if (level === undefined) fail(`${field}.contributionLevel is not a recognized GitHub level`);
      contributions.push({
        date,
        level,
        count,
        label: count === 0
          ? `No contributions on ${date}`
          : `${count} ${count === 1 ? "contribution" : "contributions"} on ${date}`,
      });
    }
  }

  return contributions;
}

async function validateExistingSnapshot() {
  let source;
  try {
    source = await readFile(OUTPUT_PATH, "utf8");
  } catch (error) {
    fail(`No GitHub token was provided and the existing snapshot could not be read: ${errorMessage(error)}`);
  }

  let payload;
  try {
    payload = JSON.parse(source);
  } catch {
    fail("No GitHub token was provided and public/data/github.json is not valid JSON");
  }
  normalizeStaticData(payload);
  console.log("No GITHUB_TOKEN or GH_TOKEN found; validated and kept public/data/github.json unchanged.");
}

async function synchronize() {
  if (!TOKEN) {
    await validateExistingSnapshot();
    return;
  }

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const years = Array.from(
    { length: Math.max(0, currentYear - FIRST_CONTRIBUTION_YEAR + 1) },
    (_, index) => FIRST_CONTRIBUTION_YEAR + index,
  );

  console.log(`Synchronizing public GitHub data for ${GITHUB_LOGIN}...`);
  const [profile, repositories, events, ...yearlyContributions] = await Promise.all([
    requestJson(`${REST_API_ROOT}/users/${GITHUB_LOGIN}`, { label: "profile" }).then(normalizeProfile),
    fetchAllOwnerRepositories(),
    fetchRecentPublicEvents(),
    ...years.map((year) => fetchContributionYear(year, now)),
  ]);

  const data = normalizeStaticData({
    generatedAt: new Date().toISOString(),
    profile,
    repositories,
    events,
    contributions: yearlyContributions.flat().sort((left, right) => left.date.localeCompare(right.date)),
  });

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  const temporaryPath = `${OUTPUT_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(temporaryPath, OUTPUT_PATH);
  console.log(
    `Wrote public/data/github.json (${data.repositories.length} repositories, ${data.events.length} events, ${data.contributions.length} contribution days).`,
  );
}

synchronize().catch((error) => {
  console.error(`GitHub data sync failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
