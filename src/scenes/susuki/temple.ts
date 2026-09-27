import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toonMaterial } from "../../engine/toon";
import { TEMPLE } from "./layout";

// The old hall (本堂): a two-storey building on a stone terrace — a lower
// roof skirt and a hip-and-gable (入母屋) top roof with deep, concave eaves
// whose corners sweep up, bracket sets under the eaves, a veranda (縁) with a
// railing all round, warm light behind the lattice doors, and on the veranda
// the moon-viewing offering: dango piled on a sanbō and susuki in a vase.
// Stone lanterns (灯籠) flank the steps. Built in hall-local space (x across
// the front, z out of the front, y up from the terrace), merged per material.

type V2 = [number, number];

// ------------------------------------------------------------------ dimensions

const BASE_TOP = 1.0; // stone terrace (基壇) top
const FLOOR = 1.85; // veranda / floor level
const LOW = { cx: 8.5, cz: 6.8, bays: [5, 4] as V2, top: 5.35 }; // lower storey column lines
const UP = { cx: 6.0, cz: 4.6, bottom: 8.95, top: 11.35 }; // upper storey
const ROOF1 = { A: 11.6, B: 9.9, a: 6.35, b: 4.95, y0: 6.55, y1: 8.95, p: 1.45, lift: 0.95, thick: 0.34, wallA: LOW.cx, wallB: LOW.cz, soffit: 0.2 };
const ROOF2 = { A: 9.7, B: 7.7, g: 4.7, zg: 4.2, y0: 12.15, y1: 16.3, p: 1.5, lift: 1.05, thick: 0.34, wallA: UP.cx, wallB: UP.cz, soffit: 0.2 };

// ------------------------------------------------------------------ helpers

const withColor = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => {
  const col = new THREE.Color(c);
  const n = g.getAttribute("position").count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
};

const clean = (g: THREE.BufferGeometry) => {
  const out = g.index ? g.toNonIndexed() : g;
  if (!out.getAttribute("uv")) out.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute("position").count * 2), 2));
  if (!out.getAttribute("normal")) out.computeVertexNormals();
  for (const k of Object.keys(out.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) out.deleteAttribute(k);
  return out;
};

function box(w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, color?: THREE.ColorRepresentation) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  const c = clean(g);
  return color !== undefined ? withColor(c, color) : c;
}

function cyl(r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 8, color?: THREE.ColorRepresentation) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1);
  g.translate(x, y + h / 2, z);
  const c = clean(g);
  return color !== undefined ? withColor(c, color) : c;
}

/** Sweep a rectangle (width w across `side`, height h along `up`) along points. */
function sweep(pts: THREE.Vector3[], sides: THREE.Vector3[], ups: THREE.Vector3[], w: number, h: number, y0 = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  // faces come out right for a right-handed frame (side × up = along); mirror the winding otherwise
  const t0 = pts[1].clone().sub(pts[0]);
  const mirror = sides[0].clone().cross(ups[0]).dot(t0) < 0;
  const ring = (i: number) => {
    const p = pts[i];
    const s = sides[i];
    const u = ups[i];
    const c = (a: number, b: number) => p.clone().addScaledVector(s, a * w * 0.5).addScaledVector(u, y0 + b * h);
    return [c(-1, 0), c(1, 0), c(1, 1), c(-1, 1)];
  };
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    if (mirror) [b, d] = [d, b];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const A = ring(i);
    const B = ring(i + 1);
    for (let k = 0; k < 4; k++) {
      const k1 = (k + 1) % 4;
      quad(A[k], A[k1], B[k1], B[k]);
    }
  }
  const s = ring(0);
  const e = ring(pts.length - 1);
  quad(s[0], s[3], s[2], s[1]);
  quad(e[0], e[1], e[2], e[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return clean(g);
}

// ------------------------------------------------------------------ roofs

type RoofSpec = {
  A: number;
  B: number;
  y0: number;
  y1: number;
  p: number;
  lift: number;
  thick: number;
  wallA: number;
  wallB: number;
  soffit: number;
  /** ring roof: inner rectangle */
  a?: number;
  b?: number;
  /** hip-and-gable: gable plane x and gable-foot z */
  g?: number;
  zg?: number;
};

class Roof {
  readonly parts: THREE.BufferGeometry[] = [];
  constructor(private s: RoofSpec) {}

  lift(x: number, z: number) {
    const s = this.s;
    const fx = Math.max(0, (Math.abs(x) - 0.3 * s.A) / (0.7 * s.A));
    const fz = Math.max(0, (Math.abs(z) - 0.3 * s.B) / (0.7 * s.B));
    return s.lift * Math.pow(fx, 2.3) * Math.pow(fz, 2.3);
  }

  /** Height of the tiled top surface (`hip`: the hipped ends, which stop at the gable foot). */
  top(x: number, z: number, hip = false) {
    const s = this.s;
    const ax = Math.abs(x);
    const az = Math.abs(z);
    let h: number;
    if (s.a !== undefined && s.b !== undefined) {
      const v = Math.min((s.A - ax) / (s.A - s.a), (s.B - az) / (s.B - s.b));
      h = s.y0 + (s.y1 - s.y0) * Math.pow(THREE.MathUtils.clamp(v, 0, 1), s.p);
    } else {
      const g = s.g!;
      const zg = s.zg!;
      const hf = s.y0 + (s.y1 - s.y0) * Math.pow(THREE.MathUtils.clamp((s.B - az) / s.B, 0, 1), s.p);
      const hg = s.y0 + (s.y1 - s.y0) * Math.pow((s.B - zg) / s.B, s.p);
      const he = s.y0 + (hg - s.y0) * Math.pow(THREE.MathUtils.clamp((s.A - ax) / (s.A - g), 0, 1), s.p);
      h = !hip && ax <= g + 1e-4 ? hf : Math.min(hf, he);
    }
    return h + this.lift(x, z);
  }

  /** Underside of the eaves: a flatter, hip-shaped soffit rising toward the walls. */
  under(x: number, z: number) {
    const s = this.s;
    const d = Math.min(s.A - Math.abs(x), s.B - Math.abs(z));
    return s.y0 - s.thick + this.lift(x, z) * 0.92 + Math.tan(s.soffit) * d;
  }

  /** A facet over a plan quad (eave start, eave end, top end, top start). */
  facet(q: [V2, V2, V2, V2], h: (x: number, z: number) => number, part: number, alongX: boolean, flip = false, nu = 22, nv = 9) {
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;
      for (let i = 0; i <= nu; i++) {
        const u = i / nu;
        const ex = q[0][0] + (q[1][0] - q[0][0]) * u;
        const ez = q[0][1] + (q[1][1] - q[0][1]) * u;
        const tx = q[3][0] + (q[2][0] - q[3][0]) * u;
        const tz = q[3][1] + (q[2][1] - q[3][1]) * u;
        const x = ex + (tx - ex) * v;
        const z = ez + (tz - ez) * v;
        pos.push(x, h(x, z), z);
        uv.push(alongX ? x : z, v + part * 10);
        if (i > 0 && j > 0) {
          const a = (j - 1) * (nu + 1) + i - 1;
          const b = a + 1;
          const c = a + nu + 1;
          const d = c + 1;
          if (flip) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.parts.push(clean(g));
  }

  /** The eave fascia along one eave edge, from the tiles down to the soffit. */
  fascia(e0: V2, e1: V2, alongX: boolean, n = 26) {
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < n; i++) {
      const pts = [i / n, (i + 1) / n].map((u) => {
        const x = e0[0] + (e1[0] - e0[0]) * u;
        const z = e0[1] + (e1[1] - e0[1]) * u;
        return [x, z, this.top(x, z) + 0.06, this.under(x, z)];
      });
      const [a, b] = pts;
      // quad: bottom a, bottom b, top b, top a (outward facing)
      const T = (p: number[]) => [p[0], p[2], p[1]];
      const D = (p: number[]) => [p[0], p[3], p[1]];
      const tri = [D(a), D(b), T(b), D(a), T(b), T(a)];
      for (const v of tri) {
        pos.push(...v);
        uv.push(alongX ? v[0] : v[2], 25);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    this.parts.push(clean(g));
  }

  /** Points along the top surface from a to b (plan), raised by `dy`. */
  line(a: V2, b: V2, n: number, dy = 0) {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      out.push(new THREE.Vector3(x, this.top(x, z) + dy, z));
    }
    return out;
  }

  /** A raised tile ridge along a plan line (hip ridges, the main ridge), end at `a` sweeping up. */
  ridge(a: V2, b: V2, w: number, h: number, curl = 0) {
    const pts = this.line(a, b, 14, -0.06);
    if (curl > 0) {
      // the eave end of a hip ridge sweeps up and out (鬼瓦 end)
      const d = pts[0].clone().sub(pts[1]).normalize();
      pts.unshift(pts[0].clone().addScaledVector(d, curl * 0.6).add(new THREE.Vector3(0, curl * 0.55, 0)));
    }
    const sides: THREE.Vector3[] = [];
    const ups: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length; i++) {
      const t = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const s = new THREE.Vector3(0, 1, 0).cross(t).normalize();
      sides.push(s);
      ups.push(t.clone().cross(s).normalize().multiplyScalar(t.clone().cross(s).y < 0 ? -1 : 1));
    }
    const g = sweep(pts, sides, ups, w, h);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0, 40);
    this.parts.push(g);
  }

  build(): THREE.BufferGeometry {
    const s = this.s;
    const A = s.A;
    const B = s.B;
    const top = (x: number, z: number) => this.top(x, z);
    const under = (x: number, z: number) => this.under(x, z);
    // the soffit (eave underside) from the eave line to the wall line
    const Aw = s.wallA;
    const Bw = s.wallB;
    this.facet([[-A, B], [A, B], [Aw, Bw], [-Aw, Bw]], under, 1, true, true, 22, 4);
    this.facet([[A, -B], [-A, -B], [-Aw, -Bw], [Aw, -Bw]], under, 1, true, true, 22, 4);
    this.facet([[A, B], [A, -B], [Aw, -Bw], [Aw, Bw]], under, 1, false, true, 18, 4);
    this.facet([[-A, -B], [-A, B], [-Aw, Bw], [-Aw, -Bw]], under, 1, false, true, 18, 4);
    // fascia
    this.fascia([-A, B], [A, B], true);
    this.fascia([A, -B], [-A, -B], true);
    this.fascia([A, B], [A, -B], false, 22);
    this.fascia([-A, -B], [-A, B], false, 22);
    if (s.a !== undefined && s.b !== undefined) {
      const a = s.a;
      const b = s.b;
      this.facet([[-A, B], [A, B], [a, b], [-a, b]], top, 0, true);
      this.facet([[A, -B], [-A, -B], [-a, -b], [a, -b]], top, 0, true);
      this.facet([[A, B], [A, -B], [a, -b], [a, b]], top, 0, false, false, 18);
      this.facet([[-A, -B], [-A, B], [-a, b], [-a, -b]], top, 0, false, false, 18);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.ridge([sx * A, sz * B], [sx * a, sz * b], 0.3, 0.26, 0.5);
    } else {
      const g = s.g!;
      const zg = s.zg!;
      // front / back: the trapezoid up to the gable foot, then the rectangle up to the ridge
      this.facet([[-A, B], [A, B], [g, zg], [-g, zg]], top, 0, true, false, 24, 7);
      this.facet([[-g, zg], [g, zg], [g, 0], [-g, 0]], top, 0, true, false, 16, 8);
      this.facet([[A, -B], [-A, -B], [-g, -zg], [g, -zg]], top, 0, true, false, 24, 7);
      this.facet([[g, -zg], [-g, -zg], [-g, 0], [g, 0]], top, 0, true, false, 16, 8);
      // the hipped ends below the gables
      const hipTop = (x: number, z: number) => this.top(x, z, true);
      this.facet([[A, B], [A, -B], [g, -zg], [g, zg]], hipTop, 0, false, false, 18, 7);
      this.facet([[-A, -B], [-A, B], [-g, zg], [-g, -zg]], hipTop, 0, false, false, 18, 7);
      // gable walls (妻), set back a little behind the barge boards
      for (const sx of [1, -1]) {
        const pos: number[] = [];
        const uv: number[] = [];
        const n = 16;
        const x = sx * (g - 0.12);
        for (let i = 0; i < n; i++) {
          const z0 = -zg + (2 * zg * i) / n;
          const z1 = -zg + (2 * zg * (i + 1)) / n;
          const b0 = this.top(sx * (g + 0.01), z0) - 0.05;
          const b1 = this.top(sx * (g + 0.01), z1) - 0.05;
          const t0 = this.top(sx * (g - 0.01), z0);
          const t1 = this.top(sx * (g - 0.01), z1);
          const quad =
            sx > 0
              ? [x, b0, z0, x, b1, z1, x, t1, z1, x, b0, z0, x, t1, z1, x, t0, z0]
              : [x, b1, z1, x, b0, z0, x, t0, z0, x, b1, z1, x, t0, z0, x, t1, z1];
          pos.push(...quad);
          for (let k = 0; k < 6; k++) uv.push(quad[k * 3 + 2], quad[k * 3 + 1] - s.y0 + 30);
        }
        const gg = new THREE.BufferGeometry();
        gg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        gg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        gg.computeVertexNormals();
        this.parts.push(clean(gg));
        // barge boards (破風) following the gable's top edge, a little proud of it
        const pts: THREE.Vector3[] = [];
        const zEnd = zg + 0.55;
        for (let i = 0; i <= 18; i++) {
          const z = -zEnd + (2 * zEnd * i) / 18;
          pts.push(new THREE.Vector3(sx * (g + 0.12), this.top(sx * (g - 0.01), THREE.MathUtils.clamp(z, -zg, zg)) + 0.18 - Math.max(0, Math.abs(z) - zg) * 0.9, z));
        }
        const sides = pts.map(() => new THREE.Vector3(1, 0, 0));
        const ups = pts.map(() => new THREE.Vector3(0, -1, 0));
        const bb = sweep(pts, sides, ups, 0.2, 0.5);
        const buv = bb.getAttribute("uv") as THREE.BufferAttribute;
        for (let i = 0; i < buv.count; i++) buv.setXY(i, 0, 40);
        this.parts.push(bb);
        // 懸魚: the ornament hanging under the apex of the barge boards
        const gy = this.top(sx * (g - 0.01), 0);
        const orn = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 6, 1);
        orn.rotateZ(Math.PI / 2);
        orn.scale(1, 1.25, 1);
        orn.translate(sx * (g + 0.14), gy - 0.75, 0);
        const og = clean(orn);
        const ouv = og.getAttribute("uv") as THREE.BufferAttribute;
        for (let i = 0; i < ouv.count; i++) ouv.setXY(i, 0, 40);
        this.parts.push(og);
      }
      // hip ridges from the eave corners to the gable feet
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.ridge([sx * A, sz * B], [sx * g, sz * zg], 0.32, 0.3, 0.55);
      // main ridge (大棟)
      const rp = [new THREE.Vector3(-g - 0.35, s.y1 - 0.15, 0), new THREE.Vector3(g + 0.35, s.y1 - 0.15, 0)];
      const rg = sweep(rp, [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)], [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0)], 0.72, 0.85);
      const ruv = rg.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < ruv.count; i++) ruv.setXY(i, 0, 40);
      this.parts.push(rg);
      // 鴟尾 at both ends of the ridge
      for (const sx of [1, -1]) {
        const sh = new THREE.Shape();
        const P: V2[] = [
          [-0.62, 0],
          [0.36, 0],
          [0.47, 0.45],
          [0.46, 0.9],
          [0.36, 1.3],
          [0.16, 1.6],
          [-0.08, 1.78],
          [-0.12, 1.5],
          [-0.2, 1.12],
          [-0.34, 0.66],
          [-0.62, 0.3],
        ];
        sh.moveTo(P[0][0], P[0][1]);
        for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]);
        sh.closePath();
        const ex = new THREE.ExtrudeGeometry(sh, { depth: 0.5, bevelEnabled: false });
        ex.translate(0, 0, -0.25);
        if (sx < 0) ex.scale(-1, 1, 1);
        ex.translate(sx * (g + 0.12), s.y1 + 0.62, 0);
        const eg = clean(ex);
        if (sx < 0) {
          // mirrored: restore the winding
          const p = eg.getAttribute("position") as THREE.BufferAttribute;
          for (let i = 0; i < p.count; i += 3) {
            const bx = p.getX(i + 1);
            const by = p.getY(i + 1);
            const bz = p.getZ(i + 1);
            p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
            p.setXYZ(i + 2, bx, by, bz);
          }
          eg.computeVertexNormals();
        }
        const euv = eg.getAttribute("uv") as THREE.BufferAttribute;
        for (let i = 0; i < euv.count; i++) euv.setXY(i, 0, 40);
        this.parts.push(eg);
      }
    }
    return mergeGeometries(this.parts)!;
  }
}

// ------------------------------------------------------------------ materials

function roofMaterial() {
  return toonMaterial({
    color: 0x22365f,
    shade: 0x0b1336,
    ink: 53,
    rim: 1.0,
    step: 0.18,
    soft: 0.03,
    fragment: /* glsl */ `
      float part = floor(vUv.y / 10.0 + 0.001);
      float v = vUv.y - part * 10.0;
      if (part < 0.5) {
        // tiles: rows running down the slope, and the round tile ends along the eave
        float row = fract(vUv.x / 0.34);
        float groove = smoothstep(0.1, 0.0, abs(row - 0.5) - 0.38);
        float aa = fwidth(vUv.x / 0.34);
        groove *= smoothstep(0.35, 0.12, aa);
        base *= 1.0 - groove * 0.22; shade *= 1.0 - groove * 0.25;
        float endRow = smoothstep(0.045, 0.03, v);
        base = mix(base, base * 0.7, endRow * 0.8); shade = mix(shade, shade * 0.75, endRow);
      } else if (part < 1.5) {
        // eave underside: rafters on a dark board ceiling
        float r = fract(vUv.x / 0.26);
        float raft = step(0.55, r);
        vec3 wood = vec3(0.17, 0.12, 0.19);
        base = mix(wood * 0.7, wood * 1.25, raft);
        shade = mix(vec3(0.028, 0.03, 0.08), vec3(0.06, 0.055, 0.12), raft);
      } else if (part < 2.5) {
        // fascia: pale weathered boards with the rafter ends
        float r = fract(vUv.x / 0.26);
        base = vec3(0.34, 0.34, 0.46);
        shade = vec3(0.09, 0.1, 0.2);
        float endR = step(0.62, r);
        base *= 1.0 - endR * 0.2; shade *= 1.0 - endR * 0.25;
      } else if (part < 3.5) {
        // gable wall (妻): a lattice of dark timbers over plaster
        vec2 q = vec2(vUv.x, v) / 0.42;
        vec2 f = abs(fract(q) - 0.5);
        float lat = step(0.36, max(f.x, f.y));
        base = mix(vec3(0.5, 0.52, 0.66), vec3(0.16, 0.12, 0.2), lat);
        shade = mix(vec3(0.12, 0.14, 0.28), vec3(0.03, 0.03, 0.08), lat);
      } else {
        // ridges, barge boards, ornaments
        base = vec3(0.1, 0.13, 0.25);
        shade = vec3(0.03, 0.04, 0.11);
      }`,
  });
}

// ------------------------------------------------------------------ the hall

export type Temple = { group: THREE.Group; lamps: THREE.Vector3[]; offering: THREE.Vector3; vase: THREE.Vector3 };

export function buildTemple(): Temple {
  const group = new THREE.Group();
  group.position.set(TEMPLE.x, TEMPLE.y, TEMPLE.z);
  group.rotation.y = TEMPLE.yaw;

  // ---- stone: terrace, steps, lanterns' bodies
  const stone: THREE.BufferGeometry[] = [];
  const BX = 11.8;
  const BZ = 9.7;
  stone.push(box(BX * 2 + 0.5, 0.35, BZ * 2 + 0.5, 0, 0.1, 0)); // plinth course
  stone.push(box(BX * 2, BASE_TOP - 0.18, BZ * 2, 0, (BASE_TOP - 0.18) / 2, 0));
  stone.push(box(BX * 2 + 0.25, 0.2, BZ * 2 + 0.25, 0, BASE_TOP - 0.1, 0)); // capstones (葛石)
  for (let i = 0; i < 4; i++) {
    const h = (BASE_TOP * (4 - i)) / 4;
    stone.push(box(6.6 - i * 0.1, h, 0.42, 0, h / 2, BZ + 0.2 + i * 0.42));
  }
  // a stone path from the steps
  for (let i = 0; i < 9; i++) stone.push(box(2.0, 0.12, 1.25, (i % 2) * 0.12 - 0.06, 0.02, BZ + 2.2 + i * 1.45));
  const stoneMesh = new THREE.Mesh(
    mergeGeometries(stone)!,
    toonMaterial({
      color: 0x8391b8,
      shade: 0x283258,
      ink: 50,
      rim: 0.6,
      step: 0.1,
      fragment: /* glsl */ `
        float m = fbm2(vWorldPos.xz * 1.3 + vWorldPos.y * 2.1, 3);
        base *= 0.86 + m * 0.28; shade *= 0.9 + m * 0.2;
        // coursed blocks on the terrace walls
        vec2 q = vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y) * vec2(1.1, 3.2);
        q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
        vec2 f = abs(fract(q) - 0.5);
        float joint = step(0.46, max(f.x * 1.0, f.y)) * step(abs(n.y), 0.5);
        base *= 1.0 - joint * 0.3; shade *= 1.0 - joint * 0.35;`,
    }),
  );
  group.add(stoneMesh);

  // ---- wood: columns, beams, veranda, railing, brackets, upper storey frame
  const wood: THREE.BufferGeometry[] = [];
  const COL = 0x4c3c56;
  const BEAM = 0x584a64;
  const BRK = 0x6c5e76;
  const DECK = 0x6a6076;
  const lowXs: number[] = [];
  const lowZs: number[] = [];
  for (let i = 0; i <= LOW.bays[0]; i++) lowXs.push(-LOW.cx + (2 * LOW.cx * i) / LOW.bays[0]);
  for (let i = 0; i <= LOW.bays[1]; i++) lowZs.push(-LOW.cz + (2 * LOW.cz * i) / LOW.bays[1]);
  const perim = (xs: number[], zs: number[], cx: number, cz: number) => {
    const out: V2[] = [];
    for (const x of xs) out.push([x, cz], [x, -cz]);
    for (const z of zs.slice(1, -1)) out.push([cx, z], [-cx, z]);
    return out;
  };
  const lowCols = perim(lowXs, lowZs, LOW.cx, LOW.cz);
  for (const [x, z] of lowCols) wood.push(cyl(0.3, 0.27, LOW.top - BASE_TOP, x, BASE_TOP, z, 10, COL));
  // head beams (長押 / 頭貫) round the lower storey
  for (const y of [FLOOR + 0.05, 4.55, LOW.top - 0.12]) {
    const hgt = y === FLOOR + 0.05 ? 0.28 : 0.26;
    wood.push(box(LOW.cx * 2 + 0.5, hgt, 0.3, 0, y, LOW.cz, 0, BEAM));
    wood.push(box(LOW.cx * 2 + 0.5, hgt, 0.3, 0, y, -LOW.cz, 0, BEAM));
    wood.push(box(0.3, hgt, LOW.cz * 2 + 0.5, LOW.cx, y, 0, 0, BEAM));
    wood.push(box(0.3, hgt, LOW.cz * 2 + 0.5, -LOW.cx, y, 0, 0, BEAM));
  }
  // veranda (縁): deck ring, its edge beam, short posts, railing, and the wooden stair
  const VX = LOW.cx + 1.75;
  const VZ = LOW.cz + 1.75;
  const deckY = FLOOR - 0.08;
  wood.push(box(VX * 2, 0.16, VZ - LOW.cz, 0, deckY, (VZ + LOW.cz) / 2, 0, DECK));
  wood.push(box(VX * 2, 0.16, VZ - LOW.cz, 0, deckY, -(VZ + LOW.cz) / 2, 0, DECK));
  wood.push(box(VX - LOW.cx, 0.16, LOW.cz * 2, (VX + LOW.cx) / 2, deckY, 0, 0, DECK));
  wood.push(box(VX - LOW.cx, 0.16, LOW.cz * 2, -(VX + LOW.cx) / 2, deckY, 0, 0, DECK));
  wood.push(box(VX * 2 + 0.1, 0.22, 0.16, 0, deckY - 0.18, VZ, 0, BEAM));
  wood.push(box(VX * 2 + 0.1, 0.22, 0.16, 0, deckY - 0.18, -VZ, 0, BEAM));
  wood.push(box(0.16, 0.22, VZ * 2 + 0.1, VX, deckY - 0.18, 0, 0, BEAM));
  wood.push(box(0.16, 0.22, VZ * 2 + 0.1, -VX, deckY - 0.18, 0, 0, BEAM));
  const railH = 0.82;
  const stairHalf = 2.1;
  const railSeg = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    wood.push(box(len, 0.09, 0.1, mx, FLOOR + railH, mz, rot, BEAM));
    wood.push(box(len, 0.07, 0.07, mx, FLOOR + railH * 0.55, mz, rot, BEAM));
    wood.push(box(len, 0.1, 0.08, mx, FLOOR + 0.1, mz, rot, BEAM));
    const n = Math.max(1, Math.round(len / 1.75));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      wood.push(box(0.11, railH, 0.11, x0 + (x1 - x0) * t, FLOOR + railH / 2, z0 + (z1 - z0) * t, rot, BEAM));
    }
  };
  const rx = VX - 0.12;
  const rz = VZ - 0.12;
  railSeg(-rx, rz, -stairHalf, rz);
  railSeg(stairHalf, rz, rx, rz);
  railSeg(rx, rz, rx, -rz);
  railSeg(rx, -rz, -rx, -rz);
  railSeg(-rx, -rz, -rx, rz);
  // 擬宝珠 on the posts by the stair and at the corners
  for (const [x, z] of [[-stairHalf, rz], [stairHalf, rz], [rx, rz], [-rx, rz], [rx, -rz], [-rx, -rz]] as V2[]) {
    const s = new THREE.SphereGeometry(0.1, 8, 6);
    s.scale(1, 1.3, 1);
    s.translate(x, FLOOR + railH + 0.14, z);
    wood.push(withColor(clean(s), BRK));
  }
  // posts under the veranda edge
  for (let x = -VX + 0.3; x <= VX - 0.3; x += 1.72) {
    wood.push(box(0.16, FLOOR - BASE_TOP, 0.16, x, (FLOOR + BASE_TOP) / 2 - 0.08, VZ - 0.1, 0, COL));
    wood.push(box(0.16, FLOOR - BASE_TOP, 0.16, x, (FLOOR + BASE_TOP) / 2 - 0.08, -VZ + 0.1, 0, COL));
  }
  // the wooden stair (階) from the terrace up to the veranda, with its side stringers
  for (let i = 0; i < 4; i++) {
    const y = BASE_TOP + ((FLOOR - BASE_TOP) * (i + 1)) / 4;
    wood.push(box(stairHalf * 2 - 0.2, 0.08, 0.36, 0, y - 0.04, VZ + 1.35 - i * 0.34, 0, DECK));
  }
  for (const sx of [-1, 1]) {
    const st = new THREE.BoxGeometry(0.12, 0.24, 1.7);
    st.rotateX(0.46);
    st.translate(sx * (stairHalf - 0.06), (FLOOR + BASE_TOP) / 2 + 0.05, VZ + 0.8);
    wood.push(withColor(clean(st), BEAM));
  }
  // bracket sets (組物) on every lower column and between them
  const bracket = (x: number, z: number, out: THREE.Vector3, yb: number, big: number) => {
    const rot = Math.atan2(out.x, out.z); // along the wall = perpendicular to out
    const along = new THREE.Vector3(out.z, 0, -out.x);
    const at = (a: number, o: number) => [x + along.x * a + out.x * o, z + along.z * a + out.z * o] as V2;
    const P = (w: number, h: number, d: number, a: number, o: number, y: number, c: THREE.ColorRepresentation) => {
      const [px, pz] = at(a, o);
      wood.push(box(w, h, d, px, y, pz, rot, c));
    };
    P(0.56 * big, 0.26, 0.56 * big, 0, 0, yb + 0.13, BRK); // 大斗
    P(1.7 * big, 0.22, 0.26, 0, 0, yb + 0.37, BRK); // 肘木 along the wall
    for (const a of [-0.68, 0, 0.68]) P(0.3, 0.18, 0.3, a * big, 0, yb + 0.57, BRK); // 巻斗
    P(0.26, 0.22, 1.6 * big, 0, 0.45 * big, yb + 0.76, BRK); // 肘木 projecting out
    for (const o of [0.0, 0.6, 1.15]) P(0.3, 0.17, 0.3, 0, o * big, yb + 0.96, BRK);
    P(1.9 * big, 0.2, 0.24, 0, 1.15 * big, yb + 1.13, BRK); // eave purlin block
  };
  for (const [x, z] of lowCols) {
    const out = new THREE.Vector3(Math.abs(x) >= LOW.cx - 0.01 ? Math.sign(x) : 0, 0, Math.abs(z) >= LOW.cz - 0.01 ? Math.sign(z) : 0).normalize();
    bracket(x, z, out, LOW.top, 1);
  }
  // continuous beam over the brackets (通肘木) and the eave purlin (丸桁)
  for (const [o, y, h] of [[0, LOW.top + 0.57, 0.22], [1.15, LOW.top + 1.13, 0.2]] as [number, number, number][]) {
    wood.push(box((LOW.cx + o) * 2 + 0.6, h, 0.24, 0, y, LOW.cz + o, 0, BEAM));
    wood.push(box((LOW.cx + o) * 2 + 0.6, h, 0.24, 0, y, -LOW.cz - o, 0, BEAM));
    wood.push(box(0.24, h, (LOW.cz + o) * 2 + 0.6, LOW.cx + o, y, 0, 0, BEAM));
    wood.push(box(0.24, h, (LOW.cz + o) * 2 + 0.6, -LOW.cx - o, y, 0, 0, BEAM));
  }
  // intercolumn struts (間斗束)
  for (let i = 0; i < lowXs.length - 1; i++) {
    const x = (lowXs[i] + lowXs[i + 1]) / 2;
    for (const z of [LOW.cz, -LOW.cz]) {
      wood.push(box(0.2, 0.45, 0.2, x, LOW.top + 0.25, z, 0, BRK));
      wood.push(box(0.4, 0.2, 0.4, x, LOW.top + 0.57, z, 0, BRK));
    }
  }
  for (let i = 0; i < lowZs.length - 1; i++) {
    const z = (lowZs[i] + lowZs[i + 1]) / 2;
    for (const x of [LOW.cx, -LOW.cx]) {
      wood.push(box(0.2, 0.45, 0.2, x, LOW.top + 0.25, z, 0, BRK));
      wood.push(box(0.4, 0.2, 0.4, x, LOW.top + 0.57, z, 0, BRK));
    }
  }
  // upper storey: columns, beams, a balcony with railing on the lower roof, brackets
  const upXs = [-UP.cx, -UP.cx / 3, UP.cx / 3, UP.cx];
  const upZs = [-UP.cz, 0, UP.cz];
  const upCols = perim(upXs, upZs, UP.cx, UP.cz);
  for (const [x, z] of upCols) wood.push(cyl(0.25, 0.23, UP.top - (UP.bottom - 0.6), x, UP.bottom - 0.6, z, 10, COL));
  for (const y of [UP.bottom + 0.1, UP.top - 0.12]) {
    wood.push(box(UP.cx * 2 + 0.4, 0.24, 0.26, 0, y, UP.cz, 0, BEAM));
    wood.push(box(UP.cx * 2 + 0.4, 0.24, 0.26, 0, y, -UP.cz, 0, BEAM));
    wood.push(box(0.26, 0.24, UP.cz * 2 + 0.4, UP.cx, y, 0, 0, BEAM));
    wood.push(box(0.26, 0.24, UP.cz * 2 + 0.4, -UP.cx, y, 0, 0, BEAM));
  }
  const bx = UP.cx + 0.95;
  const bz = UP.cz + 0.95;
  const by = UP.bottom - 0.05;
  wood.push(box(bx * 2, 0.14, bz - UP.cz, 0, by, (bz + UP.cz) / 2, 0, DECK));
  wood.push(box(bx * 2, 0.14, bz - UP.cz, 0, by, -(bz + UP.cz) / 2, 0, DECK));
  wood.push(box(bx - UP.cx, 0.14, UP.cz * 2, (bx + UP.cx) / 2, by, 0, 0, DECK));
  wood.push(box(bx - UP.cx, 0.14, UP.cz * 2, -(bx + UP.cx) / 2, by, 0, 0, DECK));
  const upRail = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const rot = Math.atan2(-(z1 - z0), x1 - x0);
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    wood.push(box(len, 0.09, 0.09, mx, by + 0.78, mz, rot, BEAM));
    wood.push(box(len, 0.06, 0.06, mx, by + 0.42, mz, rot, BEAM));
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      wood.push(box(0.1, 0.8, 0.1, x0 + (x1 - x0) * t, by + 0.4, z0 + (z1 - z0) * t, rot, BEAM));
    }
    // brackets carrying the balcony
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      wood.push(box(0.14, 0.34, 0.14, x0 + (x1 - x0) * t, by - 0.24, z0 + (z1 - z0) * t, rot, BRK));
    }
  };
  upRail(-bx + 0.08, bz - 0.08, bx - 0.08, bz - 0.08);
  upRail(bx - 0.08, bz - 0.08, bx - 0.08, -bz + 0.08);
  upRail(bx - 0.08, -bz + 0.08, -bx + 0.08, -bz + 0.08);
  upRail(-bx + 0.08, -bz + 0.08, -bx + 0.08, bz - 0.08);
  for (const [x, z] of upCols) {
    const out = new THREE.Vector3(Math.abs(x) >= UP.cx - 0.01 ? Math.sign(x) : 0, 0, Math.abs(z) >= UP.cz - 0.01 ? Math.sign(z) : 0).normalize();
    bracket(x, z, out, UP.top, 0.9);
  }
  for (const [o, y, h] of [[0, UP.top + 0.51, 0.2], [1.03, UP.top + 1.02, 0.18]] as [number, number, number][]) {
    wood.push(box((UP.cx + o) * 2 + 0.5, h, 0.22, 0, y, UP.cz + o, 0, BEAM));
    wood.push(box((UP.cx + o) * 2 + 0.5, h, 0.22, 0, y, -UP.cz - o, 0, BEAM));
    wood.push(box(0.22, h, (UP.cz + o) * 2 + 0.5, UP.cx + o, y, 0, 0, BEAM));
    wood.push(box(0.22, h, (UP.cz + o) * 2 + 0.5, -UP.cx - o, y, 0, 0, BEAM));
  }
  const woodMesh = new THREE.Mesh(
    mergeGeometries(wood)!,
    toonMaterial({
      color: 0xffffff,
      shade: 0x3a3f66,
      ink: 51,
      rim: 0.8,
      step: 0.12,
      vertexColors: true,
      fragment: /* glsl */ `
        // colour comes from the vertex colours; the shade stays a cool, dark version
        shade = vTint * vec3(0.3, 0.3, 0.46);
        base = vTint;
        // veranda planks (in hall-local x)
        if (n.y > 0.7) {
          vec2 d = vWorldPos.xz - vec2(TX, TZ);
          float lx = d.x * TC - d.y * TS;
          float pl = step(0.9, fract(lx * 3.2));
          base *= 1.0 - pl * 0.22;
        }`,
      defines: { TX: TEMPLE.x.toFixed(3), TZ: TEMPLE.z.toFixed(3), TC: Math.cos(TEMPLE.yaw).toFixed(5), TS: Math.sin(TEMPLE.yaw).toFixed(5) },
    }),
  );
  group.add(woodMesh);

  // ---- walls and doors: plaster, board walls, lattice doors lit from within
  const wallPos: number[] = [];
  const wallUv: number[] = [];
  const wallKind: number[] = [];
  const wallQuad = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, kind: number, inset: V2) => {
    // outward normal: (dz, -dx) of the edge direction
    const ax = x0 + inset[0];
    const az = z0 + inset[1];
    const bx2 = x1 + inset[0];
    const bz2 = z1 + inset[1];
    const q = [ax, y0, az, bx2, y0, bz2, bx2, y1, bz2, ax, y0, az, bx2, y1, bz2, ax, y1, az];
    wallPos.push(...q);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const uu = [0, len, len, 0, len, 0];
    const vv = [y0, y0, y1, y0, y1, y1];
    for (let k = 0; k < 6; k++) {
      wallUv.push(uu[k], vv[k]);
      wallKind.push(kind);
    }
  };
  // lower storey: front (+z) bays — outer bays plaster with windows, three central bays lattice doors
  const inset = 0.06;
  for (let i = 0; i < lowXs.length - 1; i++) {
    const kind = i === 0 || i === lowXs.length - 2 ? 2 : i === 2 ? 1.5 : 1;
    wallQuad(lowXs[i], LOW.cz, lowXs[i + 1], LOW.cz, FLOOR, LOW.top - 0.25, kind, [0, -inset]);
  }
  // back (−z)
  for (let i = 0; i < lowXs.length - 1; i++) wallQuad(lowXs[i + 1], -LOW.cz, lowXs[i], -LOW.cz, FLOOR, LOW.top - 0.25, 0, [0, inset]);
  // sides
  for (let i = 0; i < lowZs.length - 1; i++) {
    const kind = i === 1 || i === 2 ? 3 : 0;
    wallQuad(LOW.cx, lowZs[i + 1], LOW.cx, lowZs[i], FLOOR, LOW.top - 0.25, kind, [-inset, 0]);
    wallQuad(-LOW.cx, lowZs[i], -LOW.cx, lowZs[i + 1], FLOOR, LOW.top - 0.25, kind === 3 ? 2 : 0, [inset, 0]);
  }
  // under the veranda: the dark crawlspace screen between the terrace and the floor
  wallQuad(-LOW.cx, LOW.cz, LOW.cx, LOW.cz, BASE_TOP, FLOOR - 0.1, 4, [0, 0.4]);
  wallQuad(LOW.cx, -LOW.cz, -LOW.cx, -LOW.cz, BASE_TOP, FLOOR - 0.1, 4, [0, -0.4]);
  wallQuad(LOW.cx, LOW.cz, LOW.cx, -LOW.cz, BASE_TOP, FLOOR - 0.1, 4, [0.4, 0]);
  wallQuad(-LOW.cx, -LOW.cz, -LOW.cx, LOW.cz, BASE_TOP, FLOOR - 0.1, 4, [-0.4, 0]);
  // upper storey: front bays lit windows, other sides plaster
  for (let i = 0; i < upXs.length - 1; i++) wallQuad(upXs[i], UP.cz, upXs[i + 1], UP.cz, UP.bottom, UP.top - 0.2, i === 1 ? 1.5 : 2.5, [0, -inset]);
  for (let i = 0; i < upXs.length - 1; i++) wallQuad(upXs[i + 1], -UP.cz, upXs[i], -UP.cz, UP.bottom, UP.top - 0.2, 0, [0, inset]);
  for (let i = 0; i < upZs.length - 1; i++) {
    wallQuad(UP.cx, upZs[i + 1], UP.cx, upZs[i], UP.bottom, UP.top - 0.2, 2.5, [-inset, 0]);
    wallQuad(-UP.cx, upZs[i], -UP.cx, upZs[i + 1], UP.bottom, UP.top - 0.2, 2.5, [inset, 0]);
  }
  // the lower roof meets the upper walls: a plaster band hides the joint
  const wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute("position", new THREE.Float32BufferAttribute(wallPos, 3));
  wallGeo.setAttribute("uv", new THREE.Float32BufferAttribute(wallUv, 2));
  wallGeo.setAttribute("aKind", new THREE.Float32BufferAttribute(wallKind, 1));
  wallGeo.computeVertexNormals();
  const wallMat = toonMaterial({
    color: 0xc6cfe6,
    shade: 0x3b4675,
    ink: 52,
    rim: 0.5,
    step: 0.1,
    side: THREE.DoubleSide,
    vertexHead: /* glsl */ `attribute float aKind; varying float vKind;`,
    vertex: /* glsl */ `vKind = aKind;`,
    fragmentHead: /* glsl */ `varying float vKind;`,
    fragment: /* glsl */ `
      float k = vKind;
      vec2 p = vUv;               // metres along the wall, height (local y)
      float h = p.y;
      vec3 warm = vec3(1.0, 0.6, 0.27);
      float flick = 0.92 + 0.08 * sin(uTime * 7.3 + p.x * 0.7) * sin(uTime * 3.1 + 1.7);
      if (k > 3.5) {
        // dark crawlspace under the floor
        base = vec3(0.05, 0.06, 0.12); shade = vec3(0.02, 0.025, 0.06);
      } else if (k > 0.5 && k < 1.99) {
        // lattice doors (格子戸): dark timber grid over glowing paper
        float bright = k > 1.25 ? 1.35 : 1.0;
        vec2 g = vec2(p.x / 0.2, (h - 1.0) / 0.2);
        vec2 f = abs(fract(g) - 0.5);
        float bar = step(0.37, max(f.x, f.y));
        float aa = max(fwidth(g.x), fwidth(g.y));
        bar = mix(bar, 0.45, smoothstep(0.25, 0.6, aa));
        // door leaves: frames at the bay edges and a mid rail
        float frame = step(fract(p.x / 1.7 + 0.001), 0.04) + step(0.96, fract(p.x / 1.7));
        frame += step(abs(h - 3.0), 0.06);
        bar = max(bar, min(1.0, frame));
        vec3 paper = warm * (1.25 + 0.35 * smoothstep(1.9, 4.5, h)) * bright * flick;
        base = mix(vec3(0.9, 0.7, 0.5), vec3(0.2, 0.14, 0.18), bar);
        shade = mix(vec3(0.5, 0.33, 0.25), vec3(0.05, 0.04, 0.08), bar);
        emis += paper * (1.0 - bar) * 1.25;
      } else if (k > 1.99 && k < 2.99) {
        // plaster with a barred window (連子窓) — some are lit
        float litK = k > 2.25 ? 1.0 : 0.55;
        float win = step(2.6, h) * step(h, 4.3) * step(0.35, fract(p.x / 3.4)) * step(fract(p.x / 3.4), 0.65);
        if (k > 2.4) win = step(UP_LO, h) * step(h, UP_HI) * step(0.2, fract(p.x / 4.0)) * step(fract(p.x / 4.0), 0.8);
        float bars = step(0.5, fract(p.x / 0.16));
        vec3 pl = mix(base, base * 0.8, step(h, 2.25));
        base = mix(pl, mix(vec3(0.16, 0.12, 0.18), warm * 0.8, bars), win);
        shade = mix(shade, mix(vec3(0.04, 0.03, 0.07), warm * 0.4, bars), win);
        emis += warm * win * bars * 0.95 * litK * flick;
      } else {
        // plaster above, boards below
        float boards = step(h, 3.05);
        float seam = step(0.9, fract(p.x / 0.3)) * boards;
        base = mix(base, vec3(0.3, 0.25, 0.34), boards);
        shade = mix(shade, vec3(0.07, 0.06, 0.12), boards);
        base *= 1.0 - seam * 0.25;
      }`,
    defines: { UP_LO: (UP.bottom + 0.55).toFixed(2), UP_HI: (UP.top - 0.55).toFixed(2) },
  });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  group.add(walls);

  // ---- roofs
  const roofMat = roofMaterial();
  const r1 = new Roof(ROOF1).build();
  const r2 = new Roof(ROOF2).build();
  const roof = new THREE.Mesh(mergeGeometries([r1, r2])!, roofMat);
  group.add(roof);

  // ---- the offering on the veranda, left of the stair: sanbō + dango, a vase of susuki
  const off: THREE.BufferGeometry[] = [];
  const ox = -3.3;
  const oz = LOW.cz + 1.05;
  const oy = FLOOR;
  off.push(box(0.3, 0.2, 0.3, ox, oy + 0.1, oz, 0, 0xcdb48f)); // sanbō base
  off.push(box(0.42, 0.05, 0.42, ox, oy + 0.225, oz, 0, 0xd8c29c)); // tray
  off.push(box(0.46, 0.045, 0.04, ox, oy + 0.27, oz + 0.2, 0, 0xd8c29c));
  off.push(box(0.46, 0.045, 0.04, ox, oy + 0.27, oz - 0.2, 0, 0xd8c29c));
  off.push(box(0.04, 0.045, 0.46, ox + 0.2, oy + 0.27, oz, 0, 0xd8c29c));
  off.push(box(0.04, 0.045, 0.46, ox - 0.2, oy + 0.27, oz, 0, 0xd8c29c));
  const paper = new THREE.PlaneGeometry(0.36, 0.36).rotateX(-Math.PI / 2).rotateY(Math.PI / 4);
  paper.translate(ox, oy + 0.255, oz);
  off.push(withColor(clean(paper), 0xf4f6ff));
  // fifteen dango: 3×3, 2×2, and two on top
  const R = 0.052;
  const dango: [number, number, number][] = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) dango.push([(i - 1) * R * 2, 0, (j - 1) * R * 2]);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) dango.push([(i - 0.5) * R * 2, R * 1.45, (j - 0.5) * R * 2]);
  dango.push([-R, R * 2.9, 0], [R, R * 2.9, 0]);
  for (const [dx, dy, dz] of dango) {
    const s = new THREE.SphereGeometry(R, 10, 8);
    s.translate(ox + dx, oy + 0.255 + R + dy, oz + dz);
    off.push(withColor(clean(s), 0xfbfcff));
  }
  // vase
  const vx = ox - 0.75;
  const vz = oz - 0.12;
  const vp = [
    new THREE.Vector2(0.0, 0),
    new THREE.Vector2(0.1, 0),
    new THREE.Vector2(0.15, 0.08),
    new THREE.Vector2(0.16, 0.2),
    new THREE.Vector2(0.11, 0.33),
    new THREE.Vector2(0.065, 0.4),
    new THREE.Vector2(0.09, 0.46),
    new THREE.Vector2(0.08, 0.47),
  ];
  const vase = new THREE.LatheGeometry(vp, 12);
  vase.translate(vx, oy, vz);
  off.push(withColor(clean(vase), 0x39507e));
  const offering = new THREE.Mesh(
    mergeGeometries(off)!,
    toonMaterial({ color: 0xffffff, shade: 0x5a6694, ink: 56, rim: 1.0, step: 0.0, vertexColors: true, fragment: /* glsl */ `base = vTint; shade = vTint * vec3(0.42, 0.45, 0.66);` }),
  );
  group.add(offering);

  // ---- stone lanterns (灯籠): two by the stair, one by the pond (placed from outside)
  const lanternLocal: V2[] = [
    [-4.9, BZ + 2.6],
    [4.9, BZ + 2.6],
  ];
  const lampWorld = lanternLocal.map(([x, z]) => {
    const v = new THREE.Vector3(x, 1.6, z);
    return v.applyAxisAngle(new THREE.Vector3(0, 1, 0), TEMPLE.yaw).add(new THREE.Vector3(TEMPLE.x, TEMPLE.y, TEMPLE.z));
  });
  const door = new THREE.Vector3(0, 3.0, LOW.cz + 1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), TEMPLE.yaw).add(new THREE.Vector3(TEMPLE.x, TEMPLE.y, TEMPLE.z));
  const offW = new THREE.Vector3(ox, oy, oz).applyAxisAngle(new THREE.Vector3(0, 1, 0), TEMPLE.yaw).add(new THREE.Vector3(TEMPLE.x, TEMPLE.y, TEMPLE.z));
  const vaseW = new THREE.Vector3(vx, oy + 0.45, vz).applyAxisAngle(new THREE.Vector3(0, 1, 0), TEMPLE.yaw).add(new THREE.Vector3(TEMPLE.x, TEMPLE.y, TEMPLE.z));
  group.updateMatrixWorld(true);
  return { group, lamps: [door, ...lampWorld], offering: offW, vase: vaseW };
}

/** A Kasuga-style stone lantern, base at the origin; the fire box is flagged in uv.y (> 5). */
export function lanternGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const hex = (r0: number, r1: number, h: number, y: number) => cyl(r0, r1, h, 0, y, 0, 6);
  parts.push(hex(0.5, 0.42, 0.22, 0)); // 基礎
  parts.push(hex(0.36, 0.3, 0.12, 0.22));
  parts.push(cyl(0.17, 0.15, 0.95, 0, 0.34, 0, 10)); // 竿
  parts.push(hex(0.26, 0.4, 0.2, 1.29)); // 中台
  // 火袋: the fire box, flagged for the glow
  const fb = hex(0.27, 0.27, 0.48, 1.49);
  const fuv = fb.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setY(i, fuv.getY(i) + 10);
  parts.push(fb);
  // 笠: the hexagonal roof, flared
  const kasa = new THREE.CylinderGeometry(0.12, 0.62, 0.3, 6, 1);
  kasa.translate(0, 1.97 + 0.15, 0);
  parts.push(clean(kasa));
  parts.push(hex(0.66, 0.62, 0.06, 1.95));
  parts.push(cyl(0.08, 0.1, 0.1, 0, 2.27, 0, 8)); // 請花
  const hoju = new THREE.SphereGeometry(0.12, 10, 8);
  hoju.scale(1, 1.25, 1);
  hoju.translate(0, 2.47, 0);
  parts.push(clean(hoju));
  return mergeGeometries(parts)!;
}

export function lanternMaterial() {
  return toonMaterial({
    color: 0x8a97bc,
    shade: 0x2a3460,
    ink: 55,
    rim: 0.9,
    step: 0.1,
    fragment: /* glsl */ `
      float m = fbm2(vWorldPos.xz * 3.1 + vWorldPos.y * 4.0, 3);
      base *= 0.82 + m * 0.3; shade *= 0.88 + m * 0.22;
      if (vUv.y > 5.0) {
        // window openings of the fire box: warm, flickering
        float u = fract(vUv.x * 6.0);
        float v = vUv.y - 10.0;
        float open = step(0.2, u) * step(u, 0.8) * step(0.18, v) * step(v, 0.86);
        float fl = 0.85 + 0.15 * sin(uTime * 9.0 + vWorldPos.x * 3.0) * sin(uTime * 4.3 + vWorldPos.z);
        emis += vec3(1.0, 0.62, 0.26) * open * 3.2 * fl;
        base = mix(base, vec3(1.0, 0.8, 0.5), open); shade = mix(shade, vec3(0.6, 0.35, 0.2), open);
      }`,
  });
}

/** A snow-viewing lantern (雪見灯籠): a broad low roof on three curved legs, for the pond's edge. */
export function yukimiGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // three legs, each bent outward in two segments
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const top = new THREE.Vector3(Math.cos(a) * 0.2, 0.66, Math.sin(a) * 0.2);
    const mid = new THREE.Vector3(Math.cos(a) * 0.42, 0.34, Math.sin(a) * 0.42);
    const foot = new THREE.Vector3(Math.cos(a) * 0.5, 0.0, Math.sin(a) * 0.5);
    for (const [p, q] of [[top, mid], [mid, foot]] as [THREE.Vector3, THREE.Vector3][]) {
      const len = p.distanceTo(q);
      const leg = new THREE.CylinderGeometry(0.065, 0.075, len + 0.04, 7, 1);
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(p, q).normalize()));
      leg.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
      parts.push(clean(leg));
    }
  }
  parts.push(cyl(0.44, 0.4, 0.1, 0, 0.62, 0, 6)); // 中台
  // 火袋, flagged for the glow
  const fb = cyl(0.3, 0.3, 0.3, 0, 0.72, 0, 6);
  const fuv = fb.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setY(i, fuv.getY(i) + 10);
  parts.push(fb);
  // the broad, low roof and its finial
  parts.push(cyl(0.82, 0.8, 0.07, 0, 1.02, 0, 6));
  const kasa = new THREE.CylinderGeometry(0.1, 0.8, 0.3, 6, 1);
  kasa.translate(0, 1.09 + 0.15, 0);
  parts.push(clean(kasa));
  const hoju = new THREE.SphereGeometry(0.1, 10, 8);
  hoju.scale(1, 1.3, 1);
  hoju.translate(0, 1.47, 0);
  parts.push(clean(hoju));
  return mergeGeometries(parts)!;
}
