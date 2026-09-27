import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Geometry helpers: mergeable parts (non-indexed, uv, optional colour and a
// per-vertex "kind" id), Japanese hip roofs with concave slopes and lifted
// corners, curved beams (the torii's kasagi), lathe caps.

export type Part = THREE.BufferGeometry;

/** Make a geometry mergeable: non-indexed, with normal + uv (+ colour / kind when given). */
export function prep(g: THREE.BufferGeometry, color?: THREE.ColorRepresentation, kind?: number): Part {
  const out = g.index ? g.toNonIndexed() : g;
  const n = out.getAttribute("position").count;
  if (!out.getAttribute("normal")) out.computeVertexNormals();
  if (!out.getAttribute("uv")) out.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  if (color !== undefined) {
    const c = new THREE.Color(color);
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    out.setAttribute("color", new THREE.Float32BufferAttribute(a, 3));
  }
  if (kind !== undefined) out.setAttribute("aKind", new THREE.Float32BufferAttribute(new Float32Array(n).fill(kind), 1));
  return out;
}

export function merge(parts: Part[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error("bridge: merge failed (attribute mismatch)");
  return g;
}

/** Axis-aligned box from its centre and size. */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** Box whose uv is in metres on every face (u along the face, v up). */
export function facadeBox(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const pos = g.getAttribute("position");
  const nrm = g.getAttribute("normal");
  const uv = g.getAttribute("uv");
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    if (Math.abs(ny) > 0.5) uv.setXY(i, px + w / 2, pz + d / 2);
    else if (Math.abs(nx) > 0.5) uv.setXY(i, pz * -Math.sign(nx) + d / 2, py + h / 2);
    else uv.setXY(i, px * Math.sign(nrm.getZ(i)) + w / 2, py + h / 2);
  }
  g.translate(x, y, z);
  return g;
}

export function cyl(rTop: number, rBot: number, h: number, seg: number, x = 0, y = 0, z = 0, open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open);
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * Hip roof: footprint w (x) × d (z) centred on the origin, eaves at y = 0,
 * ridge (along x) at y = h. Concave slopes, lifted corners, and a fascia band
 * of depth `fascia` hanging from the eave line. Render double-sided.
 */
export function hipRoof(w: number, d: number, h: number, o: { lift?: number; pow?: number; segU?: number; segV?: number; fascia?: number } = {}): THREE.BufferGeometry {
  const a = w / 2;
  const b = d / 2;
  const r = Math.max(0, a - b * 0.9);
  const lift = o.lift ?? 0.07 * Math.min(w, d);
  const pw = o.pow ?? 1.7;
  const su = o.segU ?? 8;
  const sv = o.segV ?? 5;
  const fas = o.fascia ?? 0.05 * Math.min(w, d);
  const pos: number[] = [];
  const uvs: number[] = [];
  type V = [number, number];
  const P = (e0: V, e1: V, r0: V, r1: V, u: number, v: number): [number, number, number] => {
    const ex = e0[0] + (e1[0] - e0[0]) * u;
    const ez = e0[1] + (e1[1] - e0[1]) * u;
    const rx = r0[0] + (r1[0] - r0[0]) * u;
    const rz = r0[1] + (r1[1] - r0[1]) * u;
    const c = Math.pow(Math.abs(2 * u - 1), 4);
    const y = h * Math.pow(v, pw) + lift * c * (1 - v) * (1 - v);
    return [ex + (rx - ex) * v, y, ez + (rz - ez) * v];
  };
  const face = (e0: V, e1: V, r0: V, r1: V) => {
    for (let i = 0; i < su; i++) {
      const u0 = i / su;
      const u1 = (i + 1) / su;
      for (let j = 0; j < sv; j++) {
        const v0 = j / sv;
        const v1 = (j + 1) / sv;
        const p00 = P(e0, e1, r0, r1, u0, v0);
        const p10 = P(e0, e1, r0, r1, u1, v0);
        const p01 = P(e0, e1, r0, r1, u0, v1);
        const p11 = P(e0, e1, r0, r1, u1, v1);
        pos.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
        uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      }
      // fascia under the eave edge of this strip
      const q0 = P(e0, e1, r0, r1, u0, 0);
      const q1 = P(e0, e1, r0, r1, u1, 0);
      pos.push(q0[0], q0[1] - fas, q0[2], q1[0], q1[1] - fas, q1[2], q1[0], q1[1], q1[2]);
      pos.push(q0[0], q0[1] - fas, q0[2], q1[0], q1[1], q1[2], q0[0], q0[1], q0[2]);
      uvs.push(u0, -1, u1, -1, u1, 0, u0, -1, u1, 0, u0, 0);
    }
  };
  // front (+z), back (−z), right (+x), left (−x); the winding keeps normals outward
  face([-a, b], [a, b], [-r, 0], [r, 0]);
  face([a, -b], [-a, -b], [r, 0], [-r, 0]);
  face([a, b], [a, -b], [r, 0], [r, 0]);
  face([-a, -b], [-a, b], [-r, 0], [-r, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A beam along x from −len/2 to len/2 whose centreline rises by curve(x),
 * with a trapezoid section (top depth dt, bottom depth db, height hh).
 * The section's bottom sits on y = curve(x).
 */
export function curvedBeam(len: number, hh: number, dt: number, db: number, curve: (x: number) => number, segs = 24, taper = 0): THREE.BufferGeometry {
  const pos: number[] = [];
  const ring = (x: number) => {
    const y = curve(x);
    const k = 1 - taper * Math.pow(Math.abs(x) / (len / 2), 2);
    return [
      [x, y, db / 2],
      [x, y + hh * k, dt / 2],
      [x, y + hh * k, -dt / 2],
      [x, y, -db / 2],
    ];
  };
  for (let i = 0; i < segs; i++) {
    const x0 = -len / 2 + (len * i) / segs;
    const x1 = -len / 2 + (len * (i + 1)) / segs;
    const A = ring(x0);
    const B = ring(x1);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      pos.push(...A[k], ...B[k], ...B[k2], ...A[k], ...B[k2], ...A[k2]);
    }
  }
  const cap = (x: number, flip: boolean) => {
    const R = ring(x);
    const tri = (i: number, j: number, k: number) => (flip ? pos.push(...R[i], ...R[k], ...R[j]) : pos.push(...R[i], ...R[j], ...R[k]));
    tri(0, 1, 2);
    tri(0, 2, 3);
  };
  cap(-len / 2, false);
  cap(len / 2, true);
  // (winding: front, top, back, bottom faces and both caps all face outward)
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** 擬宝珠 — the onion-shaped bronze cap of a railing post. Base at y = 0. */
export function giboshi(scale = 1, seg = 12): THREE.BufferGeometry {
  const pts: [number, number][] = [
    [0.0, 0.0],
    [0.098, 0.0],
    [0.1, 0.03],
    [0.078, 0.05],
    [0.08, 0.075],
    [0.106, 0.098],
    [0.128, 0.13],
    [0.13, 0.16],
    [0.118, 0.19],
    [0.092, 0.222],
    [0.058, 0.252],
    [0.03, 0.278],
    [0.014, 0.3],
    [0.018, 0.312],
    [0.0, 0.34],
  ];
  const g = new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r * scale, y * scale)),
    seg,
  );
  return g;
}
