// CONTACT: the PV's file box (4:20 FILE NUMBER / CONFIDENTIALITY, a wire from
// the left ending in a square) turned into channel status; the open channels;
// Toronto local time as a FILE readout; a message typed into a terminal that
// leaves through the visitor's own mail client; and the PERMISSION AUTHORIZED
// rings (0:20) beside it, which spin once when the message is sent.

import { contact, identity, sectionById, worksText } from "../content.ts";
import { esc, link, pad } from "../markup.ts";
import { sectionScreen } from "./section.ts";

/** Point on a circle around (120,120), angle in degrees clockwise from 3 o'clock. */
function at(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [120 + r * Math.cos(a), 120 + r * Math.sin(a)];
}

function arc(r: number, from: number, to: number): string {
  const [x0, y0] = at(r, from);
  const [x1, y1] = at(r, to);
  const large = to - from > 180 ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

function dot(r: number, deg: number, size: number, cls: string): string {
  const [x, y] = at(r, deg);
  return `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}"/>`;
}

// Proportions measured from the PV frame at 0:20.5 (outer arc r≈420 px).
function rings(): string {
  return `<svg class="rings" viewBox="0 0 240 240" aria-hidden="true" data-rings>
    <g class="rings__a"><path class="rings__ink" pathLength="1" d="${arc(104, 72, 352)}"/>${dot(104, 352, 4.4, "rings__knob")}</g>
    <g class="rings__b"><path class="rings__white" pathLength="1" d="${arc(83, 184, 478)}"/>${dot(83, 184, 2.2, "rings__pip")}</g>
    <g class="rings__c"><path class="rings__thin" pathLength="1" d="${arc(27, 152, 266)}"/><path class="rings__thin" pathLength="1" d="${arc(27, 332, 440)}"/></g>
    <g class="rings__d">${dot(50, 174, 2.4, "rings__dot")}${dot(50, 352, 2.4, "rings__dot")}</g>
  </svg>`;
}

export function renderContact(): string {
  const s = sectionById.contact;
  const channels = contact.channels
    .map(
      (c, i) => `<li class="channel channel--${c.id}">
      <p class="channel__label"><span class="channel__no" aria-hidden="true">CH-${pad(i + 1, 2)}</span><span>${esc(c.label)}</span><small class="zh">${esc(c.zh)}</small></p>
      ${link(c.href, esc(c.value), `class="channel__value"`)}
      <p class="channel__act">${c.id === "mail" ? `<button type="button" class="btn" data-copy="${esc(c.value)}">${esc(contact.copy)}</button>` : link(c.href, "OPEN ›", `class="btn" aria-label="OPEN ${esc(c.label)} ${esc(c.value)}"`)}</p>
    </li>`,
    )
    .join("");
  const body = `<div class="comms">
  <div class="comms__file">
    <i class="comms__wire" aria-hidden="true"></i>
    <p class="comms__box"><span data-type>${esc(worksText.file)}: ${esc(s.code)}</span><span><span data-type>${esc(contact.file)}: </span><b data-type>${esc(contact.open)}</b><i class="comms__led" aria-hidden="true"></i></span></p>
  </div>
  <ul class="comms__channels" data-reveal>${channels}</ul>
  <div class="comms__time cornered" data-reveal>
    <p class="comms__time-h"><span class="tag">${esc(contact.local)}</span><small class="zh">${esc(contact.localZh)}</small></p>
    <p class="comms__clock"><b data-local-time>--:--:--</b></p>
    <p class="comms__zone"><span data-local-date>${esc(identity.homebase.toUpperCase())}</span><span data-local-zone>${esc(identity.timezone)}</span></p>
  </div>
  <form class="comms__form" data-letter data-reveal action="mailto:${esc(identity.email)}" method="get" enctype="text/plain">
    <p class="comms__lead zh">${esc(contact.lead)}</p>
    <div class="comms__term">
      <p class="comms__term-h"><label for="letter-text">${esc(contact.message)}</label><span aria-hidden="true">${esc(s.code)} · <span data-chars>000</span>/800</span></p>
      <div class="comms__field">
        <span class="comms__prompt" aria-hidden="true">&gt;</span>
        <textarea id="letter-text" name="body" rows="3" maxlength="800" placeholder="${esc(contact.placeholder)}"></textarea>
        <i class="comms__caret" aria-hidden="true"></i>
      </div>
      <p class="comms__send"><span class="comms__thanks zh" data-thanks role="status"></span><button class="btn btn--ink" type="submit">${esc(contact.send)} <small>${esc(contact.sendZh)}</small></button></p>
    </div>
    <input type="hidden" name="subject" value="${esc(contact.subject)}" />
  </form>
  <div class="comms__rings">${rings()}</div>
</div>`;
  return sectionScreen(s, { ghost: "CHANNEL", body });
}
