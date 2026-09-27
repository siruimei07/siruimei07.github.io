import { daysToFull, moonAt, moonLitPath, moonName, MONTHS_EN, WEEKDAYS_EN } from "../lib/moon";
import { calendarText } from "../content";
import { $, clamp01, ease } from "./dom";

// The P3 day-change: a dark screen, a blue band falling across it, and the
// dates walking up a diagonal line — each with its real moon — until today
// settles in the band, rings ripple out, and the band floods the screen.

const DAY = 86_400_000;
const BEFORE = 6; // days that walk in before today
const AFTER = 2;

export class Daybreak {
  private root = $("[data-daybreak]")!;
  private raf = 0;
  private skip = false;
  private bandDeg = 18;

  /** Build and play; resolves when today has landed (the exit keeps running). */
  play(now = new Date(), reduced = false): Promise<void> {
    const r = this.root;
    r.innerHTML = "";
    const W = innerWidth;
    const H = innerHeight;
    const vh = H / 100;
    const portrait = W < H;
    const cx = W * (portrait ? 0.46 : 0.5);
    const cy = H * 0.5;
    const theta = (portrait ? 58 : 36) * (Math.PI / 180);
    const dir = { x: Math.cos(theta), y: -Math.sin(theta) };
    const spacing = (portrait ? 10.5 : 11.5) * vh;

    this.bandDeg = portrait ? 24 : 18;
    const band = el("div", "db__band");
    band.style.transform = `rotate(${this.bandDeg}deg) scaleX(0)`;
    const line = el("div", "db__line");
    line.style.transform = `rotate(${-theta}rad) scaleX(0)`;
    line.style.left = `${cx}px`;
    line.style.top = `${cy}px`;
    line.style.marginLeft = "-95vmax";
    const month = el("div", "db__month");
    month.innerHTML = `<b>${now.getMonth() + 1}</b><span>${now.getFullYear()}<small>${MONTHS_EN[now.getMonth()]}</small></span>`;
    const rings = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    rings.setAttribute("class", "db__rings");
    rings.style.transform = `translate(${cx}px, ${cy}px)`;
    const ringEls = [0, 1, 2].map(() => {
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", "0");
      rings.appendChild(c);
      return c;
    });
    r.append(band, month, line, rings);

    type D = { k: number; label: HTMLElement; icon: SVGSVGElement };
    const days: D[] = [];
    for (let k = -BEFORE; k <= AFTER; k++) {
      const d = new Date(now.getTime() + k * DAY);
      const m = moonAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21));
      const dow = d.getDay();
      const label = el("div", "db__day");
      label.innerHTML = `<span class="db__num">${d.getDate()}</span><span class="db__dow${dow === 0 ? " db__dow--sun" : dow === 6 ? " db__dow--sat" : ""}">${WEEKDAYS_EN[dow].toUpperCase()}</span>`;
      const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.setAttribute("viewBox", "-50 -50 100 100");
      icon.setAttribute("class", `db__icon${k === 0 ? " is-today" : ""}`);
      icon.innerHTML = `<circle r="44" class="moon-dark"/><path class="moon-lit" d="${moonLitPath(m.phase, 44)}"/>${k === 0 ? `<circle r="48" class="moon-ring"/>` : ""}`;
      r.append(label, icon);
      days.push({ k, label, icon });
    }
    const name = moonName(now);
    const toFull = daysToFull(now);
    const note = el("p", "db__note");
    note.innerHTML = `<b>${name.ja}</b>${toFull === 0 ? calendarText.fullTonight : `${calendarText.toFull} ${toFull} ${calendarText.days}`}`;
    note.style.opacity = "0";
    r.append(note);

    r.classList.add("is-on");
    this.skip = reduced;
    const onSkip = () => (this.skip = true);
    r.addEventListener("pointerdown", onSkip, { once: true });

    const T_SCROLL = 1.55;
    const T_LAND = 1.65;
    const T_END = 2.45;
    let t0 = performance.now();
    return new Promise((resolve) => {
      let landed = false;
      const frame = (nowMs: number) => {
        if (this.skip && !landed) t0 = Math.min(t0, nowMs - T_END * 1000);
        const t = (nowMs - t0) / 1000;
        // band + line draw in
        const bk = ease.outExpo(clamp01(t / 0.45));
        band.style.transform = `rotate(${this.bandDeg}deg) scaleX(${bk})`;
        line.style.transform = `rotate(${-theta}rad) scaleX(${ease.outExpo(clamp01((t - 0.05) / 0.5))})`;
        month.style.opacity = String(clamp01((t - 0.15) / 0.3));
        month.style.transform = `translateX(${(1 - ease.out(clamp01((t - 0.15) / 0.5))) * -6}vw)`;
        // dates walk up the line and decelerate onto today
        const sk = ease.outExpo(clamp01(t / T_SCROLL));
        const s = -BEFORE + 0.5 + (BEFORE - 0.5) * sk;
        for (const d of days) {
          const u = d.k - s;
          const px = cx + dir.x * u * spacing;
          const py = cy + dir.y * u * spacing;
          const alpha = clamp01(1.4 - Math.abs(u) * 0.22) * clamp01((t - 0.1) / 0.3);
          const lw = d.label.offsetWidth;
          d.label.style.transform = `translate(${px - lw - 1.6 * vh}px, ${py - 4.2 * vh}px)`;
          d.label.style.opacity = alpha.toFixed(3);
          const pop = d.k === 0 ? 1 + 0.45 * Math.exp(-Math.max(0, t - T_LAND) * 7) * (t > T_LAND ? 1 : 0) : 1;
          const isz = 5.2 * vh * pop;
          d.icon.style.width = d.icon.style.height = `${isz}px`;
          d.icon.style.transform = `translate(${px + 1.8 * vh - (isz - 5.2 * vh) / 2}px, ${py - isz / 2 + 1.2 * vh}px)`;
          d.icon.style.opacity = alpha.toFixed(3);
        }
        // ripples around today
        ringEls.forEach((c, i) => {
          const rt = t - T_LAND - i * 0.16;
          const k = clamp01(rt / 0.9);
          c.setAttribute("r", String((3 + k * 14) * vh));
          c.style.opacity = rt < 0 ? "0" : String((1 - k) * 0.9);
        });
        const nk = ease.out(clamp01((t - T_LAND - 0.1) / 0.4));
        note.style.opacity = String(nk);
        note.style.transform = `translate(${cx + 7.2 * vh}px, ${cy + 3.2 * vh + (1 - nk) * 2 * vh}px)`;
        if (!landed && t >= T_END) {
          landed = true;
          resolve();
        }
        if (t < T_END + 0.05) this.raf = requestAnimationFrame(frame);
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  /**
   * The band swells into a full blue screen (resolves then, so the caller can
   * start what lies beneath), and a hard diagonal wipe carries it away.
   */
  exit(): { covered: Promise<void>; done: Promise<void> } {
    const r = this.root;
    const band = $<HTMLElement>(".db__band", r);
    const t0 = performance.now();
    let coveredResolve!: () => void;
    const covered = new Promise<void>((res) => (coveredResolve = res));
    const done = new Promise<void>((resolve) => {
      let signalled = false;
      const f = (now: number) => {
        const t = (now - t0) / 1000;
        const k = ease.inExpo(clamp01(t / 0.32));
        if (band) band.style.transform = `rotate(${this.bandDeg}deg) scaleY(${1 + k * 9})`;
        // everything but the band dissolves into it
        for (const el of r.children) if (el !== band) (el as HTMLElement).style.opacity = String(1 - clamp01((t - 0.12) / 0.2));
        if (!signalled && t >= 0.32) {
          signalled = true;
          coveredResolve();
        }
        // diagonal wipe: the left edge of the overlay slides off to the right
        const w = ease.inOut(clamp01((t - 0.42) / 0.42));
        if (t > 0.42) {
          const x0 = w * 130 - 15;
          r.style.clipPath = `polygon(${x0}% 0, 115% 0, 115% 100%, ${x0 - 25}% 100%)`;
        }
        if (t < 0.86) requestAnimationFrame(f);
        else resolve();
      };
      requestAnimationFrame(f);
    }).then(() => {
      r.classList.remove("is-on");
      r.style.clipPath = "";
      r.innerHTML = "";
    });
    return { covered, done };
  }

  cancel() {
    cancelAnimationFrame(this.raf);
    this.root.classList.remove("is-on");
    this.root.innerHTML = "";
  }
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}
