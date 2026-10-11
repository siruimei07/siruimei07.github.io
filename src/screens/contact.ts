// CONTACT behaviour: the file box types itself in on entry, the address
// copies to the clipboard, the Toronto clock ticks, and the message form opens
// the visitor's mail client with the text filled in — the rings spin once.

import { contact, identity } from "../content.ts";
import { typeText } from "../app/fx.ts";
import type { ScreenContext, ScreenModule } from "./types.ts";

const CPS = 38;

export function createContact(): ScreenModule {
  let root: HTMLElement;
  let ctx: ScreenContext;
  let timer = 0;
  let cancels: (() => void)[] = [];
  const zone = identity.timezone;
  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  let offsetFmt: Intl.DateTimeFormat | null = null;
  try {
    offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "shortOffset" });
  } catch {
    /* older engines: no offset shown */
  }

  const set = (sel: string, text: string) => {
    const el = root.querySelector<HTMLElement>(sel);
    if (el && el.textContent !== text) el.textContent = text;
  };

  const tick = () => {
    const now = new Date();
    set("[data-local-time]", timeFmt.format(now));
    const p = Object.fromEntries(dateFmt.formatToParts(now).map((x) => [x.type, x.value]));
    set("[data-local-date]", `${p.year}-${p.month}-${p.day} ${String(p.weekday).toUpperCase()}`);
    const off = offsetFmt?.formatToParts(now).find((x) => x.type === "timeZoneName")?.value;
    set("[data-local-zone]", `${off ? `${off} · ` : ""}${identity.homebase.toUpperCase()}`);
  };

  // FILE NUMBER / CHANNEL STATUS appear one after the other, after the wire has drawn in
  const typeIn = () => {
    cancels.forEach((f) => f());
    const parts = [...root.querySelectorAll<HTMLElement>("[data-type]")];
    let delay = 620;
    cancels = parts.map((el) => {
      const text = (el.dataset.text ??= el.textContent ?? "");
      const c = typeText(el, text, { cps: CPS, delay, instant: ctx.reduced() });
      delay += (text.length / CPS) * 1000 + 90;
      return c;
    });
  };

  const spin = () => {
    const svg = root.querySelector<SVGElement>("[data-rings]");
    if (!svg || ctx.reduced()) return;
    svg.classList.remove("is-spin");
    // restart the animation even when sent twice in a row
    void svg.getBoundingClientRect();
    svg.classList.add("is-spin");
  };

  return {
    init(el, c) {
      root = el;
      ctx = c;
      for (const b of root.querySelectorAll<HTMLButtonElement>("[data-copy]")) {
        b.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(b.dataset.copy!);
            ctx.toast(contact.copied);
            ctx.log("> COPY MAIL ADDRESS");
          } catch {
            location.href = `mailto:${b.dataset.copy}`;
          }
        });
      }
      root.querySelector("[data-rings]")?.addEventListener("animationend", (e) => {
        if ((e as AnimationEvent).animationName === "rings-spin") (e.currentTarget as Element).classList.remove("is-spin");
      });
      const form = root.querySelector<HTMLFormElement>("[data-letter]");
      const area = form?.querySelector("textarea");
      const chars = form?.querySelector<HTMLElement>("[data-chars]");
      area?.addEventListener("input", () => {
        if (chars) chars.textContent = String(area.value.length).padStart(3, "0");
      });
      form?.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = (area?.value ?? "").trim();
        const href = `mailto:${identity.email}?subject=${encodeURIComponent(contact.subject)}${text ? `&body=${encodeURIComponent(text)}` : ""}`;
        spin();
        location.href = href;
        const thanks = form.querySelector<HTMLElement>("[data-thanks]");
        if (thanks) thanks.textContent = contact.thanks;
        ctx.log("> TRANSMIT MESSAGE");
      });
    },
    enter() {
      typeIn();
      tick();
      clearInterval(timer);
      timer = window.setInterval(tick, 1000);
    },
    leave() {
      clearInterval(timer);
      cancels.forEach((f) => f());
      cancels = [];
    },
  };
}
