import type { MenuId } from "../content";
import { $, $$, Spring } from "./dom";

// The P3R pause menu: leaning words, the selected one inked black under a
// white wedge whose overlap turns the letters red, a cursor that snaps between
// entries with a little overshoot and twitches now and then.

const SCALE = 1.22;

export class Menu {
  readonly root = $("[data-screen=menu]")!;
  readonly items = $$<HTMLAnchorElement>("[data-item]", this.root);
  private cursor = $<SVGSVGElement>("[data-cursor]", this.root)!;
  private desc = $(".menu__desc [data-desc]", this.root);
  private descEn = $(".menu__desc [data-desc-en]", this.root);
  private index = $("[data-menu-index]", this.root);
  private cx = new Spring(0, 24);
  private cy = new Spring(0, 24);
  private cw = new Spring(0, 22);
  private ch = new Spring(0, 22);
  private ca = new Spring(0, 20);
  private twitch = 0;
  private nextTwitch = 2.5;
  selected = 0;
  onSelect: (id: MenuId, i: number) => void = () => {};
  onConfirm: (id: MenuId, i: number) => void = () => {};

  constructor() {
    this.items.forEach((a, i) => {
      a.addEventListener("pointerenter", () => this.select(i));
      a.addEventListener("focus", () => this.select(i));
      a.addEventListener("click", (e) => {
        e.preventDefault();
        this.select(i);
        this.onConfirm(this.id(i), i);
      });
    });
    this.buildCursor();
  }

  id(i = this.selected): MenuId {
    return this.items[i].dataset.item as MenuId;
  }

  private buildCursor() {
    const [red, white, line] = [...this.cursor.children] as SVGElement[];
    // Unit box = the word's box (0..100 both ways, y down).
    white.setAttribute("points", "-9,63 107,-6 101,101");
    red.setAttribute("points", "-5,70 105,93 97,114");
    line.setAttribute("points", "-9,63 101,101");
  }

  /** Where the cursor should sit for item i (client px). */
  private placement(i: number) {
    const a = this.items[i];
    const word = $<HTMLElement>("[data-word]", a)!;
    const li = a.parentElement!;
    const r = word.getBoundingClientRect();
    const ang = parseFloat(getComputedStyle(li).getPropertyValue("--r")) || 0;
    const w = word.offsetWidth * SCALE;
    const h = word.offsetHeight * SCALE;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w, h, a: ang };
  }

  select(i: number, silent = false) {
    const n = this.items.length;
    i = ((i % n) + n) % n;
    const changed = i !== this.selected;
    this.selected = i;
    this.items.forEach((a, k) => a.parentElement!.classList.toggle("is-on", k === i));
    const a = this.items[i];
    if (this.desc) this.desc.textContent = a.dataset.info ?? "";
    if (this.descEn) this.descEn.textContent = a.dataset.infoEn ?? "";
    if (this.index) this.index.textContent = String(i + 1).padStart(2, "0");
    if (changed) this.twitch = 1;
    if (!silent) this.onSelect(this.id(i), i);
  }

  move(d: number) {
    this.select(this.selected + d);
  }

  confirm() {
    this.onConfirm(this.id(), this.selected);
  }

  /** Put the cursor where it belongs without animating (after layout changes). */
  snap() {
    const p = this.placement(this.selected);
    this.cx.snap(p.x);
    this.cy.snap(p.y);
    this.cw.snap(p.w);
    this.ch.snap(p.h);
    this.ca.snap(p.a);
  }

  /** Fly the cursor in from off-screen (menu entrance). */
  flyIn() {
    const p = this.placement(this.selected);
    this.cx.snap(p.x + innerWidth * 0.35);
    this.cy.snap(p.y - innerHeight * 0.3);
    this.cw.snap(p.w * 2.2);
    this.ch.snap(p.h * 0.4);
    this.ca.snap(p.a - 25);
  }

  update(dt: number) {
    if (!this.root.classList.contains("is-open")) return;
    const p = this.placement(this.selected);
    this.cx.target = p.x;
    this.cy.target = p.y;
    this.cw.target = p.w;
    this.ch.target = p.h;
    this.ca.target = p.a;
    const x = this.cx.update(dt);
    const y = this.cy.update(dt);
    const w = this.cw.update(dt);
    const h = this.ch.update(dt);
    let ang = this.ca.update(dt);
    this.nextTwitch -= dt;
    if (this.nextTwitch < 0) {
      this.twitch = 1;
      this.nextTwitch = 2 + Math.random() * 2.5;
    }
    this.twitch = Math.max(0, this.twitch - dt * 7);
    const tw = Math.sin(this.twitch * Math.PI) * this.twitch;
    ang += tw * 3;
    const sx = (w / 100) * (1 + tw * 0.06);
    const sy = (h / 100) * (1 - tw * 0.04);
    this.cursor.style.transform = `translate(${x}px, ${y}px) rotate(${ang}deg) scale(${sx}, ${sy}) translate(-50px, -50px)`;
  }
}
