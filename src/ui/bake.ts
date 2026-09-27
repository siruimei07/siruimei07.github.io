// Draws chosen DOM text into a canvas at the same place and size it has on
// screen — so the title's words can shatter together with the 3D frame.
// Each element's own text node is measured with a Range (ruby text excluded).

export function bakeText(els: Element[], scale: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(innerWidth * scale));
  c.height = Math.max(1, Math.round(innerHeight * scale));
  const g = c.getContext("2d")!;
  g.scale(scale, scale);
  const range = document.createRange();
  for (const el of els) {
    const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (!node) continue;
    const text = node.textContent!.trim();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(el);
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const ls = parseFloat(cs.letterSpacing);
    (g as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = Number.isFinite(ls) ? `${ls}px` : "0px";
    const fill = cs.webkitTextFillColor;
    g.fillStyle = fill && fill !== "rgba(0, 0, 0, 0)" ? fill : cs.color;
    const m = g.measureText(text);
    const asc = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
    const desc = m.fontBoundingBoxDescent ?? parseFloat(cs.fontSize) * 0.2;
    const baseline = r.top + (r.height - (asc + desc)) / 2 + asc;
    g.textBaseline = "alphabetic";
    g.fillText(text, r.left, baseline);
  }
  return c;
}
