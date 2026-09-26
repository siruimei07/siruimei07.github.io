// DOM motion: staggered reveals, decoding text, count-ups, 3D card tilt and
// magnetic buttons. All updates are transform/opacity only.

const GLYPHS = "アイウエオカキクケコサシスセソツクヨミ月読01#$%&*+<>/";

export function scramble(el: HTMLElement, duration = 900) {
  const final = el.dataset.final ?? el.textContent ?? "";
  el.dataset.final = final;
  const start = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const revealed = Math.floor(p * final.length);
    let out = "";
    for (let i = 0; i < final.length; i++) {
      const ch = final[i];
      if (i < revealed || ch === " ") out += ch;
      else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count ?? "0");
  if (!Number.isFinite(target) || target <= 0) return;
  const start = performance.now();
  const dur = 1400;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    el.textContent = String(Math.round(target * e));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function setupReveals(reduced: boolean, onSectionEnter?: (el: Element) => void) {
  // The hero (#login) is revealed on login, not by scrolling.
  const items = [...document.querySelectorAll<HTMLElement>("[data-reveal]")].filter((el) => !el.closest("#login"));
  // Stagger siblings that share a parent.
  const groups = new Map<Element | null, number>();
  for (const el of items) {
    const n = groups.get(el.parentElement) ?? 0;
    el.style.setProperty("--d", `${Math.min(n, 8) * 160}ms`);
    groups.set(el.parentElement, n + 1);
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add("is-in");
        io.unobserve(el);
        if (!reduced) {
          const targets = el.matches("[data-scramble]") ? [el] : [...el.querySelectorAll<HTMLElement>("[data-scramble]")];
          for (const t of targets) setTimeout(() => scramble(t), 180);
        }
        for (const c of el.querySelectorAll<HTMLElement>("[data-count]")) countUp(c);
        onSectionEnter?.(el);
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" },
  );
  for (const el of items) io.observe(el);
  return {
    // The hero reveals on login rather than on load.
    revealNow(root: ParentNode) {
      // Line by line, unhurried.
      [...root.querySelectorAll<HTMLElement>("[data-reveal]")].forEach((el, i) => {
        el.style.setProperty("--d", `${i * 220}ms`);
        el.classList.add("is-in");
        io.unobserve(el);
      });
      if (!reduced) for (const t of root.querySelectorAll<HTMLElement>("[data-scramble]")) setTimeout(() => scramble(t, 1200), 500);
    },
  };
}

export function setupTilt(reduced: boolean) {
  if (reduced || !matchMedia("(pointer: fine)").matches) return;
  for (const el of document.querySelectorAll<HTMLElement>("[data-tilt]")) {
    let raf = 0;
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 7}deg) rotateY(${(x - 0.5) * 9}deg) translateZ(0)`;
        el.style.setProperty("--mx", `${x * 100}%`);
        el.style.setProperty("--my", `${y * 100}%`);
      });
    });
    el.addEventListener("pointerleave", () => {
      cancelAnimationFrame(raf);
      el.style.transform = "";
    });
  }
}

export function setupMagnetic(reduced: boolean) {
  if (reduced || !matchMedia("(pointer: fine)").matches) return;
  for (const el of document.querySelectorAll<HTMLElement>("[data-magnetic]")) {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.28}px)`;
    });
    el.addEventListener("pointerleave", () => {
      el.style.transform = "";
    });
  }
}
