"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
} from "react";

type ContributionLevel = 0 | 1 | 2 | 3 | 4;
type RevealPhase = "preparing" | "running" | "done";
type DataStatus = "loading" | "github" | "snapshot" | "error";

type ContributionEntry = {
  date: string;
  level: ContributionLevel;
  count: number;
  label: string;
};

type GraphSlot = {
  key: string;
  date: string | null;
  isFuture: boolean;
};

type MonthMarker = {
  label: string;
  column: number;
};

type GraphModel = {
  key: string;
  from: string;
  to: string;
  columns: number;
  slots: GraphSlot[];
  months: MonthMarker[];
};

type ContributionPayload = {
  contributions?: ContributionEntry[];
};

const FIRST_PROFILE_YEAR = 2025;
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SWEEPER_LOAD_GRACE_MS = 1400;
const SWEEPER_ANIMATION_MS = 3900;

// A small, truthful last-known snapshot keeps the profile useful if GitHub is
// temporarily unreachable. The same dates are replaced by the GitHub Pages
// data snapshot as soon as the static JSON request succeeds.
const CONTRIBUTION_SNAPSHOT: ContributionEntry[] = [
  { date: "2025-09-11", level: 4, count: 1, label: "1 contribution on September 11th." },
  { date: "2026-08-03", level: 1, count: 3, label: "3 contributions on August 3rd." },
  { date: "2026-08-04", level: 4, count: 13, label: "13 contributions on August 4th." },
  { date: "2026-08-05", level: 1, count: 3, label: "3 contributions on August 5th." },
  { date: "2026-08-06", level: 1, count: 1, label: "1 contribution on August 6th." },
];

const DATE_LABEL = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short" });

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + amount);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function createMonthMarkers(slots: GraphSlot[]) {
  const markers: MonthMarker[] = [];
  let previousMonth = -1;
  let previousColumn = -1;

  slots.forEach((slot, index) => {
    if (!slot.date) return;
    const date = parseIsoDate(slot.date);
    const month = date.getMonth();
    if (month === previousMonth) return;

    const column = Math.floor(index / 7) + 1;
    previousMonth = month;
    if (column === previousColumn) return;

    markers.push({ label: MONTH_LABEL.format(date), column });
    previousColumn = column;
  });

  return markers;
}

function createRollingModel(today: Date): GraphModel {
  const startOfCurrentWeek = addDays(today, -today.getDay());
  const graphStart = addDays(startOfCurrentWeek, -(52 * 7));
  const slots = Array.from({ length: 53 * 7 }, (_, index) => {
    const date = addDays(graphStart, index);
    const isFuture = date.getTime() > today.getTime();
    return {
      key: `rolling-${toIsoDate(date)}`,
      date: isFuture ? null : toIsoDate(date),
      isFuture,
    };
  });

  const from = toIsoDate(graphStart);
  const to = toIsoDate(today);
  return {
    key: `rolling:${from}:${to}`,
    from,
    to,
    columns: 53,
    slots,
    months: createMonthMarkers(slots),
  };
}

function createYearModel(year: number, today: Date): GraphModel {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const graphStart = addDays(yearStart, -yearStart.getDay());
  const graphEnd = addDays(yearEnd, 6 - yearEnd.getDay());
  const slotCount = Math.round((graphEnd.getTime() - graphStart.getTime()) / 86_400_000) + 1;
  const slots = Array.from({ length: slotCount }, (_, index) => {
    const date = addDays(graphStart, index);
    const belongsToYear = date.getFullYear() === year;
    const isFuture = belongsToYear && date.getTime() > today.getTime();
    return {
      key: `year-${year}-${toIsoDate(date)}`,
      date: belongsToYear ? toIsoDate(date) : null,
      isFuture: !belongsToYear || isFuture,
    };
  });

  const fetchEnd = year === today.getFullYear() ? today : yearEnd;
  const from = toIsoDate(yearStart);
  const to = toIsoDate(fetchEnd);
  return {
    key: `year:${year}:${from}:${to}`,
    from,
    to,
    columns: slotCount / 7,
    slots,
    months: createMonthMarkers(slots),
  };
}

function createGraphModel(today: Date, selectedYear: number | null) {
  return selectedYear === null
    ? createRollingModel(today)
    : createYearModel(selectedYear, today);
}

function snapshotForRange(from: string, to: string) {
  return CONTRIBUTION_SNAPSHOT.filter((entry) => entry.date >= from && entry.date <= to);
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function normalizeEntries(payload: ContributionPayload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.contributions)) {
    throw new Error("Malformed contribution response");
  }

  const entriesByDate = new Map<string, ContributionEntry>();
  payload.contributions.forEach((entry) => {
    const validLevel = Number.isSafeInteger(entry?.level) && entry.level >= 0 && entry.level <= 4;
    const validCount = Number.isSafeInteger(entry?.count) && entry.count >= 0;
    if (!isRealIsoDate(entry?.date) || !validLevel || !validCount) return;

    const fallbackLabel = `${entry.count} contributions on ${entry.date}`;
    const label = typeof entry.label === "string" && entry.label.trim()
      ? entry.label.trim().slice(0, 240)
      : fallbackLabel;
    entriesByDate.set(entry.date, {
      date: entry.date,
      level: entry.level as ContributionLevel,
      count: entry.count,
      label,
    });
  });

  return [...entriesByDate.values()].sort((left, right) => left.date.localeCompare(right.date));
}

function ContributionGraph({
  model,
  entries,
  total,
  today,
  periodLabel,
  alignToEnd,
}: {
  model: GraphModel;
  entries: ContributionEntry[];
  total: number;
  today: Date;
  periodLabel: string;
  alignToEnd: boolean;
}) {
  const scrollRegion = useRef<HTMLDivElement>(null);
  const entryMap = new Map(entries.map((entry) => [entry.date, entry]));
  const todayIso = toIsoDate(today);
  const calendarWidth = model.columns * 11 - 2;
  const graphStyle = {
    gridTemplateColumns: `34px ${calendarWidth}px`,
    width: `${34 + calendarWidth}px`,
  } satisfies CSSProperties;

  useLayoutEffect(() => {
    if (!alignToEnd) return;
    const animationFrame = window.requestAnimationFrame(() => {
      const element = scrollRegion.current;
      if (element) element.scrollLeft = element.scrollWidth - element.clientWidth;
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [alignToEnd, model.key]);

  return (
    <div
      ref={scrollRegion}
      className="contribution-scroll"
      role="region"
      aria-label={`${periodLabel} contribution calendar; scroll horizontally when needed`}
    >
      <div className="contribution-graph" style={graphStyle}>
        <div
          className="month-labels"
          aria-hidden="true"
          style={{ gridTemplateColumns: `repeat(${model.columns}, 9px)` }}
        >
          {model.months.map((month) => (
            <span key={`${month.label}-${month.column}`} style={{ gridColumn: month.column }}>{month.label}</span>
          ))}
        </div>
        <div className="weekday-labels" aria-hidden="true">
          <span>Mon</span>
          <span>Wed</span>
          <span>Fri</span>
        </div>
        <div className="contribution-grid" role="img" aria-label={`${total} public contributions, ${periodLabel}`}>
          {model.slots.map((slot) => {
            const contribution = slot.date ? entryMap.get(slot.date) : undefined;
            const isToday = slot.date === todayIso;
            const title = slot.date
              ? slot.isFuture
                ? `Future date: ${DATE_LABEL.format(parseIsoDate(slot.date))}`
                : contribution?.label || `No contributions on ${DATE_LABEL.format(parseIsoDate(slot.date))}`
              : "Outside the selected contribution period";
            return (
              <span
                key={slot.key}
                aria-hidden="true"
                className={`heat-cell level-${contribution?.level ?? 0}${slot.isFuture ? " future-cell" : ""}${isToday ? " today-cell" : ""}`}
                title={title}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActivitySummary({
  entries,
  status,
  periodLabel,
}: {
  entries: ContributionEntry[];
  status: DataStatus;
  periodLabel: string;
}) {
  const activeEntries = entries
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.date.localeCompare(left.date));
  const highlights = activeEntries.slice(0, 3);
  const largestCount = Math.max(1, ...highlights.map((entry) => entry.count));

  if (highlights.length === 0) {
    const unavailable = status === "error";
    return (
      <div className="timeline archive-timeline">
        <article className="timeline-item archive-item">
          <span className="timeline-icon" aria-hidden="true">+</span>
          <div className="timeline-copy">
            <h3>{unavailable ? "Live contribution data is temporarily unavailable" : "No public contributions recorded"}</h3>
            <p><span>{periodLabel}</span></p>
          </div>
          <span className="archive-label">{unavailable ? "RETRYING" : "CLEAR SKIES"}</span>
        </article>
      </div>
    );
  }

  return (
    <div className="timeline">
      {highlights.map((entry) => (
        <article className="timeline-item" key={entry.date}>
          <span className="timeline-icon" aria-hidden="true">+</span>
          <div className="timeline-copy">
            <h3>{entry.count} public {entry.count === 1 ? "contribution" : "contributions"}</h3>
            <p>
              <time dateTime={entry.date}>{DATE_LABEL.format(parseIsoDate(entry.date))}</time>
              <span>GitHub activity</span>
            </p>
          </div>
          <div className="activity-meter" aria-label={`${entry.count} contributions`}>
            <i style={{ width: `${Math.max(18, (entry.count / largestCount) * 100)}%` }} />
          </div>
        </article>
      ))}
    </div>
  );
}

export function ContributionExplorer({
  active = true,
  onRevealComplete,
}: {
  active?: boolean;
  onRevealComplete?: () => void;
}) {
  const [today, setToday] = useState(() => startOfLocalDay(new Date()));
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  // Render the server response fully visible. Hydration opts into the decorative
  // reveal before paint, so a missing script can never leave the graph masked.
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("done");
  const [revealConfigured, setRevealConfigured] = useState(false);
  const [sweeperReady, setSweeperReady] = useState(false);
  const graph = useMemo(() => createGraphModel(today, selectedYear), [selectedYear, today]);
  const [result, setResult] = useState<{
    key: string;
    entries: ContributionEntry[];
    status: DataStatus;
  }>(() => ({ key: graph.key, entries: snapshotForRange(graph.from, graph.to), status: "loading" }));
  const cache = useRef(new Map<string, ContributionEntry[]>());
  const sweeperImage = useRef<HTMLImageElement>(null);
  const revealCompletionSent = useRef(false);
  const onRevealCompleteRef = useRef(onRevealComplete);

  useEffect(() => {
    onRevealCompleteRef.current = onRevealComplete;
  }, [onRevealComplete]);

  const currentResult = result.key === graph.key
    ? result
    : { key: graph.key, entries: snapshotForRange(graph.from, graph.to), status: "loading" as const };
  const total = currentResult.entries.reduce((sum, entry) => sum + entry.count, 0);
  const periodLabel = selectedYear === null
    ? `${DATE_LABEL.format(parseIsoDate(graph.from))} through ${DATE_LABEL.format(today)}`
    : `calendar year ${selectedYear}`;
  const title = currentResult.status === "error" && currentResult.entries.length === 0
    ? "Contribution data unavailable"
    : selectedYear === null
      ? `${total} contributions in the last year`
      : `${total} contributions in ${selectedYear}`;
  const years = Array.from(
    { length: Math.max(1, today.getFullYear() - FIRST_PROFILE_YEAR + 1) },
    (_, index) => today.getFullYear() - index,
  );

  useEffect(() => {
    let midnightTimer = 0;

    const updateToday = () => {
      const now = new Date();
      setToday(startOfLocalDay(now));
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = window.setTimeout(updateToday, nextMidnight.getTime() - now.getTime() + 1000);
    };

    updateToday();
    return () => window.clearTimeout(midnightTimer);
  }, []);

  useEffect(() => {
    if (!active) return;
    const refreshTimer = window.setInterval(() => setRefreshTick((tick) => tick + 1), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 8000);
    let requestActive = true;
    const saved = cache.current.get(graph.key);
    const fallback = snapshotForRange(graph.from, graph.to);

    setResult({
      key: graph.key,
      entries: saved ?? fallback,
      status: saved ? "github" : "loading",
    });

    fetch(`/data/github.json?v=${refreshTick}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`GitHub data request failed with ${response.status}`);
        return response.json() as Promise<ContributionPayload>;
      })
      .then((payload) => {
        if (!requestActive) return;
        const entries = normalizeEntries(payload)
          .filter((entry) => entry.date >= graph.from && entry.date <= graph.to);
        cache.current.set(graph.key, entries);
        setResult({ key: graph.key, entries, status: "github" });
      })
      .catch((error: unknown) => {
        if (!requestActive) return;
        if (controller.signal.aborted && error instanceof DOMException && error.name === "AbortError") {
          setResult({ key: graph.key, entries: fallback, status: fallback.length ? "snapshot" : "error" });
          return;
        }
        setResult({ key: graph.key, entries: fallback, status: fallback.length ? "snapshot" : "error" });
      })
      .finally(() => window.clearTimeout(abortTimer));

    return () => {
      requestActive = false;
      window.clearTimeout(abortTimer);
      controller.abort();
    };
  }, [active, graph.from, graph.key, graph.to, refreshTick]);

  useLayoutEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const prepareFrame = window.requestAnimationFrame(() => {
      if (!reduceMotion) setRevealPhase("preparing");
      setRevealConfigured(true);
    });
    return () => window.cancelAnimationFrame(prepareFrame);
  }, []);

  useEffect(() => {
    if (!revealConfigured || revealPhase !== "done" || revealCompletionSent.current) return;
    revealCompletionSent.current = true;
    onRevealCompleteRef.current?.();
  }, [revealConfigured, revealPhase]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finishImmediately = () => {
      setRevealPhase("done");
    };

    const handleMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) finishImmediately();
    };

    reduceMotion.addEventListener("change", handleMotionChange);
    if (reduceMotion.matches) finishImmediately();

    return () => {
      reduceMotion.removeEventListener("change", handleMotionChange);
    };
  }, []);

  useEffect(() => {
    if (revealPhase !== "preparing") return;

    // A cached image can finish before React attaches onLoad during hydration.
    // Inspecting `complete` and keeping a short fail-open timer handles both
    // that case and an unavailable decorative asset.
    const image = sweeperImage.current;
    if (image?.complete) setSweeperReady(true);

    const loadGraceTimer = window.setTimeout(
      () => setSweeperReady(true),
      SWEEPER_LOAD_GRACE_MS,
    );
    return () => window.clearTimeout(loadGraceTimer);
  }, [revealPhase]);

  useEffect(() => {
    if (revealPhase !== "preparing" || !sweeperReady) return;

    // Do not wait for the network request: the truthful local snapshot is
    // already rendered and live GitHub data can replace it during the sweep.
    // This effect deliberately has no persistent ref guard; React Strict Mode
    // may probe it twice in development, and the second pass must reschedule it.
    const startTimer = window.setTimeout(() => {
      setRevealPhase("running");
    }, 220);
    return () => window.clearTimeout(startTimer);
  }, [revealPhase, sweeperReady]);

  useEffect(() => {
    if (revealPhase !== "running") return;

    // The timeout is a fail-open path for throttled/disabled CSS animations.
    const finishTimer = window.setTimeout(
      () => setRevealPhase("done"),
      SWEEPER_ANIMATION_MS,
    );
    return () => window.clearTimeout(finishTimer);
  }, [revealPhase]);

  const finishRevealAnimation = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.currentTarget !== event.target || event.animationName !== "contribution-wipe") return;
    setRevealPhase("done");
  };

  const statusLabel = currentResult.status === "github"
    ? "Synced from the latest GitHub Pages contribution snapshot"
    : currentResult.status === "snapshot"
      ? "Showing the latest saved public snapshot while GitHub reconnects"
      : currentResult.status === "error"
        ? "GitHub contribution data is temporarily unavailable"
        : "Loading the latest deployed GitHub contributions";

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {title}. {statusLabel}.
      </p>

      <section className="section-block contribution-section" aria-labelledby="contributions-title">
        <div className="contribution-heading">
          <div>
            <span className="section-kicker">CONTRIBUTION CALENDAR</span>
            <h2 id="contributions-title">{title}</h2>
          </div>
          <span className="contribution-settings">
            {selectedYear === null ? `THROUGH ${toIsoDate(today)}` : `${selectedYear} / JAN - DEC`}
          </span>
        </div>

        <div className="contribution-layout" id="contribution-period-panel">
          <div
            className={`contribution-card reveal-${revealPhase}`}
            aria-busy={currentResult.status === "loading" || revealPhase !== "done"}
          >
            <div className="contribution-reveal-stage">
              <div className="contribution-data" onAnimationEnd={finishRevealAnimation}>
                <div key={graph.key} className="year-data">
                  <ContributionGraph
                    model={graph}
                    entries={currentResult.entries}
                    total={total}
                    today={today}
                    periodLabel={periodLabel}
                    alignToEnd={selectedYear === null}
                  />
                  <div className="contribution-footer">
                    <span>{statusLabel}</span>
                    <span className="legend" aria-label="Contribution intensity legend">
                      Less
                      {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heat-cell level-${level}`} />)}
                      More
                    </span>
                  </div>
                </div>
              </div>

              {revealPhase !== "done" && (
                <div className="contribution-sweep-layer" aria-hidden="true">
                  <div className="sweep-guide">MAPPING THE TIDE...</div>
                  <div className="sweep-character">
                    <span className="sweep-wash" />
                    <span className="sweep-crop">
                      <img
                        ref={sweeperImage}
                        src="/assets/contribution-sweeper.gif"
                        alt=""
                        width={1024}
                        height={1024}
                        decoding="async"
                        fetchPriority="high"
                        onLoad={() => setSweeperReady(true)}
                        onError={() => setSweeperReady(true)}
                      />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="year-selector" role="group" aria-label="Select contribution period">
            <button
              className={`year-pill latest-pill${selectedYear === null ? " active" : ""}`}
              type="button"
              aria-pressed={selectedYear === null}
              aria-controls="contribution-period-panel"
              onClick={() => setSelectedYear(null)}
            >
              Latest
            </button>
            {years.map((year) => (
              <button
                key={year}
                className={`year-pill${selectedYear === year ? " active" : ""}`}
                type="button"
                aria-pressed={selectedYear === year}
                aria-controls="contribution-period-panel"
                onClick={() => setSelectedYear((current) => current === year ? null : year)}
              >
                {year}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="activity" className="section-block activity-section" aria-labelledby="activity-title">
        <img className="activity-reader" src="/assets/study-reader.gif" alt="" aria-hidden="true" width={1024} height={1024} loading="lazy" decoding="async" fetchPriority="low" />
        <div className="activity-title-row">
          <span className="section-kicker">{selectedYear === null ? "LATEST / THROUGH TODAY" : `YEAR ${selectedYear}`}</span>
          <h2 id="activity-title">Contribution activity</h2>
        </div>
        <div className="activity-month">
          <strong>{periodLabel}</strong>
          <span />
        </div>
        <ActivitySummary
          key={graph.key}
          entries={currentResult.entries}
          status={currentResult.status}
          periodLabel={periodLabel}
        />
        <a
          className="show-more"
          href={`https://github.com/siruimei07?tab=overview&from=${graph.from}&to=${graph.to}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open this period on GitHub
        </a>
      </section>
    </>
  );
}
