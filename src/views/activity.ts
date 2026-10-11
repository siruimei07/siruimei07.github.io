// ACTIVITY LOG: the year's figures as FILE boxes, a 53 × 7 calendar of cells
// (one tab stop; the arrows walk the days and a readout reports each one), and
// the latest public events printed like the rail's COMMAND ENTERED log.

import { activityText, sectionById } from "../content.ts";
import { heatmap, heatStats, type GitHubSnapshot, type HeatCell, type HeatStats } from "../github.ts";
import { esc, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEK_LABELS = ["", "MON", "", "WED", "", "FRI", ""];
/** Unit under each figure; the best day shows its date instead. */
const UNITS: Record<string, string> = { total: "COMMITS", active: "DAYS", longest: "DAYS", current: "DAYS" };
const KEYS = { week: "WEEK", day: "DAY", ends: "FIRST / LATEST" };

/** One sentence for screen readers: the calendar itself is a picture. */
function summary(st: HeatStats): string {
  const best = st.best ? `最多的一天是 ${st.best.date}，${st.best.count} ${activityText.contributions}。` : "";
  return `近 53 周共 ${st.total} ${activityText.contributions}，其中 ${st.active} 天有提交；最长连续 ${st.longest} 天，当前连续 ${st.current} 天。${best}`;
}

function monthRow(weeks: HeatCell[][]): string {
  let last = -1;
  return weeks
    .map((w, i) => {
      const m = Number(w[0].date.slice(5, 7)) - 1;
      // the last two columns have no room for a label before the edge
      const label = m !== last && i > 0 && i < 51 ? MONTHS[m] : "";
      last = m;
      return label ? `<span style="--c:${i + 1}">${label}</span>` : "";
    })
    .join("");
}

function renderHeat(weeks: HeatCell[][], st: HeatStats): string {
  const cells = weeks
    .map((w, i) =>
      w
        .map((c, d) => {
          const best = st.best && c.date === st.best.date;
          const tip = c.future ? "" : `${c.date} · ${c.count > 0 ? `${c.count} ${activityText.contributions}` : activityText.none}`;
          return `<i class="heat__c${c.future ? " is-future" : ""}${best ? " is-best" : ""}" style="--c:${i + 1};--r:${d + 1}" data-l="${c.level}" data-date="${c.date}" data-n="${c.count}"${tip ? ` title="${esc(tip)}"` : ""}></i>`;
        })
        .join(""),
    )
    .join("");
  return `<section class="heat" data-heat data-reveal aria-labelledby="h-heat">
    <header class="heat__head">
      <h3 id="h-heat"><span class="tag">${esc(activityText.heat)}</span><small class="zh">${esc(activityText.heatZh)}</small></h3>
      <p class="heat__sel" data-heat-sel><span>${esc(activityText.select)}</span><b data-heat-sel-text>—</b></p>
    </header>
    <p class="sr-only" id="heat-sum">${esc(summary(st))}</p>
    <div class="heat__scroll" data-heat-scroll>
      <div class="heat__body">
        <div class="heat__months" aria-hidden="true">${monthRow(weeks)}</div>
        <div class="heat__days" aria-hidden="true">${WEEK_LABELS.map((l) => `<span>${l}</span>`).join("")}</div>
        <div class="heat__grid" data-heat-grid role="group" aria-label="${esc(`${activityText.heat} · ${activityText.heatZh}`)}" aria-describedby="heat-sum">${cells}</div>
      </div>
    </div>
    <footer class="heat__foot">
      <p class="keys heat__keys" data-heat-keys hidden><span><kbd>←</kbd><kbd>→</kbd>${KEYS.week}</span><span><kbd>↑</kbd><kbd>↓</kbd>${KEYS.day}</span><span><kbd>HOME</kbd><kbd>END</kbd>${KEYS.ends}</span></p>
      <p class="heat__legend" aria-hidden="true"><span>${esc(activityText.less)}</span><i data-l="0"></i><i data-l="1"></i><i data-l="2"></i><i data-l="3"></i><i data-l="4"></i><span>${esc(activityText.more)}</span><i class="is-best"></i><span>${esc(activityText.stats[4].en)}</span></p>
    </footer>
  </section>`;
}

function renderEvents(data: GitHubSnapshot | null): string {
  const events = (data?.events ?? []).slice(0, 8);
  const rows = events.length
    ? events
        .map((e) => {
          const verb = activityText.eventVerb[e.type] ?? e.type.replace(/Event$/, "").toUpperCase();
          const when = e.created_at.slice(0, 16).replace("T", " ");
          const repo = e.repo?.name ?? "";
          return `<li><time datetime="${esc(e.created_at)}">${esc(when)}</time><span class="events__cmd">&gt; ${esc(verb)}</span><a href="https://github.com/${esc(repo)}" target="_blank" rel="noopener noreferrer">${esc(repo)}</a></li>`;
        })
        .join("")
    : `<li class="events__none">&gt; ${esc(activityText.noEvents)}</li>`;
  const snap = data?.generatedAt ? `${activityText.synced} ${data.generatedAt.slice(0, 16).replace("T", " ")} UTC` : "";
  return `<section class="events" data-reveal aria-labelledby="h-events">
    <header class="events__head">
      <h3 id="h-events"><span class="tag tag--xs">${esc(activityText.events)}</span><small class="zh">${esc(activityText.eventsZh)}</small></h3>
      ${snap ? `<p class="events__snap">${esc(snap)}</p>` : ""}
    </header>
    <ol class="events__list">${rows}<li class="events__idle" aria-hidden="true">&gt; <i></i></li></ol>
  </section>`;
}

export function renderActivity(data: GitHubSnapshot | null): string {
  const s = sectionById.activity;
  const weeks = heatmap(data);
  const st = heatStats(weeks);
  const values: Record<string, number> = { total: st.total, active: st.active, longest: st.longest, current: st.current, best: st.best?.count ?? 0 };
  const stats = activityText.stats
    .map((k, i) => {
      const hi = k.id === "total";
      // every box keeps its unit row (empty without a best day), so the figures stay level
      const unit = k.id === "best" ? `<small>${st.best ? `<i aria-hidden="true"></i>${esc(st.best.date.slice(5).replace("-", "/"))}` : ""}</small>` : `<small>${UNITS[k.id]}</small>`;
      return `<div class="logs__stat cornered${hi ? " is-hi" : ""}${k.id === "best" ? " is-best" : ""}"><dt><span class="logs__no" aria-hidden="true">${pad(i + 1, 2)}</span><span class="tag${hi ? " tag--lime" : ""}">${esc(k.en)}</span><small class="zh">${esc(k.zh)}</small></dt><dd><b data-count="${values[k.id]}">${values[k.id]}</b>${unit}</dd></div>`;
    })
    .join("");
  const body = `<div class="logs">
  <dl class="logs__stats" data-reveal>${stats}</dl>
  ${renderHeat(weeks, st)}
  ${renderEvents(data)}
</div>`;
  return sectionScreen(s, { ghost: "RECORD", body });
}
