// Pure string helpers shared by every view. Runs at build time (Node) and in
// the browser, so nothing here may touch the DOM.

import type { Logotype } from "./content.ts";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const ext = (href: string, html: string, attrs = "") =>
  `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer"${attrs ? ` ${attrs}` : ""}>${html}</a>`;

/** Mail links stay in the tab; everything external opens safely in a new one. */
export const link = (href: string, html: string, attrs = "") =>
  href.startsWith("mailto:") || href.startsWith("#") ? `<a href="${esc(href)}"${attrs ? ` ${attrs}` : ""}>${html}</a>` : ext(href, html, attrs);

// The ∞ with + and −. Contour and strokes adapted from LBEILC/RhineLabUI
// (src/brand.ts, MIT): two loops that do not quite meet at the crossing.
export const MARK_LOOPS =
  "M156 75C127 48 103 15 70 15C37 15 15 39 15 70S38 128 70 128C103 128 127 96 176 52M155 75C182 99 208 128 240 128C273 128 295 105 295 73S273 15 240 15C221 15 207 23 192 38";
export const MARK_SIGNS = "M44 70h50M69 45v50M219 70h44";
/** The same figure-eight as one closed path: used to draw it in, and to knock it out of letters. */
export const MARK_CONTOUR =
  "M295 73C295 41 273 15 240 15C221 15 207 23 192 38C186 43 181 47 176 52C127 96 103 128 70 128C38 128 15 101 15 70C15 39 37 15 70 15C103 15 127 48 156 75C182 99 208 128 240 128C273 128 295 105 295 73Z";

/** The bare mark in currentColor. */
export function mark(cls = "mark", label = "") {
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : `aria-hidden="true"`;
  return `<svg class="${cls}" viewBox="0 0 310 145" ${a11y}><path d="${MARK_LOOPS}" fill="none" stroke="currentColor" stroke-width="26"/><path d="${MARK_SIGNS}" fill="none" stroke="currentColor" stroke-width="15"/></svg>`;
}

/** The mark with a halo in the surface colour, so it cuts into the letters it sits on (PV tiles). */
export function knockMark(cls = "lt__mark") {
  return `<svg class="${cls}" viewBox="-24 -24 358 193" aria-hidden="true"><path d="${MARK_CONTOUR}" fill="var(--knock)" stroke="var(--knock)" stroke-width="54" stroke-linejoin="round"/><path d="${MARK_LOOPS}" fill="none" stroke="currentColor" stroke-width="26"/><path d="${MARK_SIGNS}" fill="none" stroke="currentColor" stroke-width="15"/></svg>`;
}

/** Mark + letter-spaced name underneath, like the PV's RHINE · LAB lockup. */
export function lockup(name: string, cls = "lockup") {
  return `<span class="${cls}" aria-hidden="true">${mark("lockup__mark")}<span class="lockup__name">${esc(name)}</span></span>`;
}

/** A section logotype (CMPT CTRL, STRU, NRG…): big geometric letters with the ∞ laid over one of them. */
export function logotype(t: Logotype, cls = "") {
  const [ml, mi, dx, dy, ms] = t.mark;
  const lines = t.lines
    .map((line, li) => {
      const chars = [...line]
        .map((ch, ci) => {
          const m = li === ml && ci === mi ? `<span class="lt__at" style="--dx:${dx}em;--dy:${dy}em;--ms:${ms}">${knockMark()}</span>` : "";
          return `<span class="lt__c">${esc(ch)}${m}</span>`;
        })
        .join("");
      return `<span class="lt__line">${chars}</span>`;
    })
    .join("");
  const word = t.lines.join(" ");
  return `<span class="lt${cls ? ` ${cls}` : ""}${t.lines.length > 1 ? " lt--two" : ""}" role="img" aria-label="${esc(`${word} — ${t.sub}`)}"><span class="lt__word" aria-hidden="true">${lines}</span><span class="lt__sub" aria-hidden="true">${esc(t.sub)}</span></span>`;
}

/** Black label tag (DIRECTOR, SERVICES SECT., RHINE LAB LLC DATABASE). */
export const tag = (text: string, cls = "") => `<span class="tag${cls ? ` ${cls}` : ""}">${esc(text)}</span>`;

/** "■ TEXT" line with a ghosted echo underneath (the PV's glass panel footers). */
export const squareLine = (text: string, cls = "") =>
  `<p class="sq${cls ? ` ${cls}` : ""}"><span>${esc(text)}</span><span class="sq__echo" aria-hidden="true">${esc(text)}</span></p>`;

export const pad = (n: number, w = 3) => String(n).padStart(w, "0");
