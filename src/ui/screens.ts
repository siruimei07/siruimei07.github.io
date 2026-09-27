import { calendarText, contact, type MenuId } from "../content";
import type { GitHubSnapshot } from "../github";
import { daysToFull, localDaysBetween, moonAt, moonLitPath, moonName, MONTHS_EN, nearestFull, WEEKDAYS_EN } from "../lib/moon";
import { $, $$ } from "./dom";

// Behaviour inside each screen: list selection, tabs, the calendar grid, the
// letter to the moon, and the SYSTEM switches. Each screen can take arrow keys.

export interface ScreenCtl {
  key?(e: KeyboardEvent): boolean;
  enter?(): void;
}

export type SystemHooks = {
  quality(v: string): void;
  motion(v: string): void;
  fps(v: string): void;
  toTitle(): void;
  current(): { quality: string; motion: string; fps: string };
};

function listNav(buttons: HTMLElement[], get: () => number, set: (i: number) => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const n = buttons.length;
      set((get() + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
      buttons[get()]?.focus({ preventScroll: true });
      return true;
    }
    return false;
  };
}

export function skillsCtl(): ScreenCtl {
  const root = $("#skills")!;
  const rows = $$<HTMLButtonElement>("[data-skill]", root);
  const cards = $$<HTMLElement>("[data-skill-card]", root);
  let cur = 0;
  const set = (i: number) => {
    cur = i;
    rows.forEach((r, k) => r.classList.toggle("is-on", k === i));
    cards.forEach((c, k) => c.classList.toggle("is-on", k === i));
  };
  rows.forEach((r, i) => {
    r.addEventListener("click", () => set(i));
    r.addEventListener("pointerenter", () => set(i));
    r.addEventListener("focus", () => set(i));
  });
  return { key: listNav(rows, () => cur, set) };
}

export function worksCtl(): ScreenCtl {
  const root = $("#works")!;
  const tabs = $$<HTMLButtonElement>("[data-tab]", root);
  const quests = $$<HTMLElement>("[data-quest]", root);
  const panel = $("[data-quest-panel]", root);
  let tab = 0;
  let cur = 0;
  const visible = () => quests.filter((q) => !q.parentElement!.hidden);
  const set = (q: HTMLElement) => {
    quests.forEach((x) => x.classList.toggle("is-on", x === q));
    cur = visible().indexOf(q);
    if (panel) {
      const no = $(".quest__no", q)?.textContent ?? "";
      const title = $(".quest__title", q)?.innerHTML ?? "";
      const state = $(".quest__state", q)?.outerHTML ?? "";
      panel.innerHTML = `<p class="quest-panel__no">REQUEST ${no}</p><h3 class="quest-panel__title">${title}</h3>${state}<div class="quest-panel__body">${$(".quest__detail", q)?.innerHTML ?? ""}</div>`;
      panel.classList.remove("is-flash");
      void panel.offsetWidth;
      panel.classList.add("is-flash");
    }
  };
  const setTab = (i: number) => {
    tab = (i + tabs.length) % tabs.length;
    const id = tabs[tab].dataset.tab;
    tabs.forEach((t, k) => t.classList.toggle("is-on", k === tab));
    for (const q of quests) {
      const li = q.parentElement!;
      li.hidden = id !== "all" && li.dataset.state !== id;
    }
    const v = visible();
    if (v.length) set(v[0]);
  };
  tabs.forEach((t, i) => t.addEventListener("click", () => setTab(i)));
  if (quests[0]) set(quests[0]);
  quests.forEach((q) => {
    q.addEventListener("pointerenter", () => set(q));
    q.addEventListener("focus", () => set(q));
    q.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("a")) return;
      set(q);
    });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Enter") $<HTMLAnchorElement>("a", q)?.click();
    });
  });
  return {
    key(e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        setTab(tab + (e.key === "ArrowRight" ? 1 : -1));
        return true;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const v = visible();
        if (!v.length) return true;
        const i = (cur + (e.key === "ArrowDown" ? 1 : -1) + v.length) % v.length;
        set(v[i]);
        v[i].focus({ preventScroll: true });
        return true;
      }
      return false;
    },
  };
}

export function calendarCtl(data: GitHubSnapshot | null): ScreenCtl {
  const root = $("#calendar")!;
  const grid = $("[data-cal-grid]", root)!;
  const byDate = new Map((data?.contributions ?? []).map((c) => [c.date, c]));
  const today = new Date();
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let sel = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const detail = (d: Date) => {
    const m = moonAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21));
    const name = moonName(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21));
    const c = byDate.get(iso(d));
    const set = (s: string, html: string) => {
      const e = $(s, root);
      if (e) e.innerHTML = html;
    };
    set("[data-day-date]", `${d.getMonth() + 1}/${d.getDate()}<small>${WEEKDAYS_EN[d.getDay()].toUpperCase()}${localDaysBetween(today, d) === 0 ? ` · ${calendarText.today}` : ""}</small>`);
    $<SVGPathElement>("[data-day-icon] .moon-lit", root)?.setAttribute("d", moonLitPath(m.phase, 44));
    set("[data-day-moon]", `${name.ja}<small>${name.en} · 月龄 ${m.age.toFixed(1)} · ${Math.round(m.illumination * 100)}%</small>`);
    set("[data-day-count]", c && c.count > 0 ? `<b>${c.count}</b> ${calendarText.contributions}` : calendarText.none);
    const dFull = daysToFull(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
    set("[data-day-full]", dFull === 0 ? `${calendarText.fullTonight} ☾` : `${calendarText.toFull} ${dFull} ${calendarText.days}`);
  };

  const render = () => {
    const y = view.getFullYear();
    const mo = view.getMonth();
    $("[data-cal-month]", root)!.textContent = String(mo + 1);
    $("[data-cal-year]", root)!.textContent = String(y);
    $("[data-cal-mname]", root)!.textContent = MONTHS_EN[mo];
    const first = new Date(y, mo, 1);
    const start = new Date(y, mo, 1 - first.getDay());
    const cells: string[] = WEEKDAYS_EN.map((w) => `<span class="cal__dow">${w.toUpperCase()}</span>`);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      if (i >= 35 && d.getMonth() !== mo) break;
      const m = moonAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21));
      const full = localDaysBetween(d, nearestFull(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12))) === 0;
      const c = byDate.get(iso(d));
      const cls = [
        "cal__cell",
        d.getMonth() !== mo ? "is-out" : "",
        d.getDay() === 0 ? "is-sun" : d.getDay() === 6 ? "is-sat" : "",
        localDaysBetween(today, d) === 0 ? "is-today" : "",
        full ? "is-full" : "",
        iso(d) === iso(sel) ? "is-sel" : "",
      ]
        .filter(Boolean)
        .join(" ");
      cells.push(
        `<button type="button" class="${cls}" data-date="${iso(d)}" aria-label="${iso(d)}"><b>${d.getDate()}</b><svg viewBox="-50 -50 100 100" aria-hidden="true"><circle r="44" class="moon-dark"/><path class="moon-lit" d="${moonLitPath(m.phase, 44)}"/></svg><span class="cal__heat" data-level="${c?.level ?? 0}"></span></button>`,
      );
    }
    grid.innerHTML = cells.join("");
    $$<HTMLButtonElement>(".cal__cell", grid).forEach((b) => {
      const [yy, mm, dd] = b.dataset.date!.split("-").map(Number);
      const d = new Date(yy, mm - 1, dd);
      const pick = () => {
        sel = d;
        $$(".cal__cell", grid).forEach((x) => x.classList.toggle("is-sel", x === b));
        detail(d);
      };
      b.addEventListener("click", pick);
      b.addEventListener("pointerenter", pick);
      b.addEventListener("focus", pick);
    });
    detail(sel);
  };
  const shift = (k: number) => {
    view = new Date(view.getFullYear(), view.getMonth() + k, 1);
    render();
  };
  $("[data-cal-prev]", root)?.addEventListener("click", () => shift(-1));
  $("[data-cal-next]", root)?.addEventListener("click", () => shift(1));
  render();
  return {
    key(e) {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" ? -7 : 7;
        sel = new Date(sel.getFullYear(), sel.getMonth(), sel.getDate() + step);
        if (sel.getMonth() !== view.getMonth() || sel.getFullYear() !== view.getFullYear()) view = new Date(sel.getFullYear(), sel.getMonth(), 1);
        render();
        return true;
      }
      if (e.key === "PageUp" || e.key === "PageDown") {
        shift(e.key === "PageDown" ? 1 : -1);
        return true;
      }
      return false;
    },
    enter() {
      view = new Date(today.getFullYear(), today.getMonth(), 1);
      sel = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      render();
    },
  };
}

export function contactCtl(onSent: () => void): ScreenCtl {
  const root = $("#contact")!;
  const rows = $$<HTMLButtonElement>("[data-link]", root);
  const cards = $$<HTMLElement>("[data-card]", root);
  let cur = 0;
  const set = (i: number) => {
    if (i === cur && rows[i].classList.contains("is-on")) return;
    cur = i;
    rows.forEach((r, k) => r.classList.toggle("is-on", k === i));
    cards.forEach((c, k) => {
      c.classList.toggle("is-on", k === i);
      if (k === i) {
        // replay the flip
        const card = $(".arcana__card", c);
        if (card) {
          card.style.animation = "none";
          void card.offsetWidth;
          card.style.animation = "";
        }
      }
    });
  };
  rows.forEach((r, i) => {
    r.addEventListener("click", () => {
      set(i);
      const l = contact.links[i];
      if (l.id === "github") window.open(l.href, "_blank", "noopener,noreferrer");
    });
    r.addEventListener("pointerenter", () => set(i));
    r.addEventListener("focus", () => set(i));
  });
  const form = $<HTMLFormElement>("[data-letter]", root);
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = ($<HTMLTextAreaElement>("textarea", form)?.value ?? "").trim();
    const href = `mailto:${contact.links[0].value}?subject=${encodeURIComponent(contact.subject)}&body=${encodeURIComponent(text)}`;
    location.href = href;
    const t = $("[data-thanks]", form);
    if (t) t.hidden = false;
    onSent();
  });
  return { key: listNav(rows, () => cur, set) };
}

export function systemCtl(h: SystemHooks): ScreenCtl {
  const root = $("#system")!;
  const sync = () => {
    const c = h.current();
    for (const [name, v] of Object.entries(c)) $$(`[data-${name}]`, root).forEach((b) => b.classList.toggle("is-on", b.dataset[name] === v));
  };
  for (const name of ["quality", "motion", "fps"] as const) {
    $$<HTMLButtonElement>(`[data-${name}]`, root).forEach((b) =>
      b.addEventListener("click", () => {
        h[name](b.dataset[name]!);
        sync();
      }),
    );
  }
  $("[data-to-title]", root)?.addEventListener("click", (e) => {
    e.preventDefault();
    h.toTitle();
  });
  sync();
  const rows = $$<HTMLElement>(".config__row", root);
  let cur = 0;
  return {
    key(e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        cur = (cur + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length;
        $<HTMLElement>("button, a", rows[cur])?.focus();
        return true;
      }
      return false;
    },
    enter: sync,
  };
}

export type Screens = Partial<Record<MenuId, ScreenCtl>>;
