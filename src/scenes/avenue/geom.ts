import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Procedural building blocks shared by the towers and the precinct: a curved
// hip roof with swept-up corners (the silhouette that makes a skyscraper read
// as Kyoto), a paper-lantern lathe and a blossom-cloud tree.

/** Every merged part carries the same attributes: position, normal, uv, aPart (and an index). */
function finish(g: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = g.getAttribute("position").count;
  if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  if (!g.index) g.setIndex([...Array(n).keys()]);
  return g;
}

/** A (segS × segT) grid surface p(s, t); normals smooth inside, winding flipped to face `out`. */
function sheet(segS: number, segT: number, p: (s: number, t: number) => THREE.Vector3, out: (c: THREE.Vector3) => THREE.Vector3, part: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  for (let j = 0; j <= segT; j++)
    for (let i = 0; i <= segS; i++) {
      const v = p(i / segS, j / segT);
      pos.push(v.x, v.y, v.z);
      uv.push(i / segS, j / segT);
    }
  const idx: number[] = [];
  for (let j = 0; j < segT; j++)
    for (let i = 0; i < segS; i++) {
      const a = j * (segS + 1) + i;
      const b = a + 1;
      const c = a + segS + 1;
      const d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // orient: compare the first quad's normal with the expected outward direction
  const pa = p(0.5, 0.25);
  const pb = p(0.5 + 0.01, 0.25);
  const pc = p(0.5, 0.25 + 0.01);
  const nrm = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
  if (nrm.dot(out(pa)) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
  }
  g.computeVertexNormals();
  return finish(g, part);
}

export type RoofOptions = {
  /** Ridge half-length in unit coordinates (0 = pyramid, 0.5 = gable-long). */
  rx: number;
  segS: number;
  segT: number;
  /** Corner sweep (unit y). */
  lift?: number;
  /** Fascia depth under the eave (unit y). */
  fascia?: number;
  /** Adds a ridge beam. */
  ridge?: boolean;
};

/**
 * Unit hip roof: eave rectangle x, z ∈ [−0.5, 0.5] at y = 0, ridge at y = 1
 * along x. Concave profile (flat at the eave, steep at the top), corners that
 * sweep up, a fascia band and a flat soffit. aPart: 0 long slopes, 1 hip ends,
 * 2 fascia, 3 ridge / soffit.
 */
export function hipRoof(o: RoofOptions): THREE.BufferGeometry {
  const { rx, segS, segT } = o;
  const lift = o.lift ?? 0.16;
  const fas = o.fascia ?? 0.07;
  const prof = (t: number) => 0.28 * t + 0.72 * t * t;
  const corner = (s: number) => {
    const c = Math.max(0, (Math.abs(2 * s - 1) - 0.3) / 0.7);
    return c * c;
  };
  const up = (s: number, t: number) => lift * corner(s) * (1 - t) * (1 - t);
  const parts: THREE.BufferGeometry[] = [];
  const centre = (c: THREE.Vector3) => new THREE.Vector3(c.x, c.y - 0.5, c.z);
  // long slopes (±z)
  for (const sz of [1, -1]) {
    parts.push(
      sheet(
        segS,
        segT,
        (s, t) => {
          const ex = -0.5 + s;
          const x = THREE.MathUtils.lerp(ex, ex * 2 * rx, t);
          const z = THREE.MathUtils.lerp(0.5 * sz, 0, t);
          // the swept corner also flies out a little
          const k = 1 + up(s, t) * 0.35;
          return new THREE.Vector3(x * k, prof(t) + up(s, t), z * k);
        },
        centre,
        0,
      ),
    );
  }
  // hip ends (±x): triangles that end in the ridge's end point
  for (const sx of [1, -1]) {
    parts.push(
      sheet(
        Math.max(2, Math.round(segS * 0.6)),
        segT,
        (s, t) => {
          const ez = -0.5 + s;
          const x = THREE.MathUtils.lerp(0.5 * sx, rx * sx, t);
          const z = THREE.MathUtils.lerp(ez, 0, t);
          const k = 1 + up(s, t) * 0.35;
          return new THREE.Vector3(x * k, prof(t) + up(s, t), z * k);
        },
        centre,
        1,
      ),
    );
  }
  // fascia: the eave edge extruded down, following the sweep
  const edge = (s: number, side: number): THREE.Vector3 => {
    // perimeter walk: side 0 = +z, 1 = +x, 2 = −z, 3 = −x (s along each)
    const u = -0.5 + s;
    let x = 0;
    let z = 0;
    if (side === 0) [x, z] = [u, 0.5];
    else if (side === 1) [x, z] = [0.5, -u];
    else if (side === 2) [x, z] = [-u, -0.5];
    else [x, z] = [-0.5, u];
    const k = 1 + up(s, 0) * 0.35;
    return new THREE.Vector3(x * k, up(s, 0), z * k);
  };
  for (let side = 0; side < 4; side++) {
    parts.push(
      sheet(
        segS,
        1,
        (s, t) => {
          const e = edge(s, side);
          return new THREE.Vector3(e.x, e.y - fas * t, e.z);
        },
        (c) => new THREE.Vector3(c.x, 0, c.z),
        2,
      ),
    );
  }
  // soffit (flat, facing down)
  const soffit = new THREE.PlaneGeometry(1, 1);
  soffit.rotateX(Math.PI / 2);
  soffit.translate(0, -fas, 0);
  parts.push(finish(soffit, 3));
  if (o.ridge !== false && rx > 0.02) {
    const r = new THREE.BoxGeometry(rx * 2 + 0.04, 0.05, 0.05);
    r.translate(0, 1.0, 0);
    parts.push(finish(r, 3));
  }
  const g = mergeGeometries(parts);
  return g;
}

/** Chōchin: a ribbed paper barrel, unit height (y ∈ [−0.5, 0.5]), unit diameter. */
export function lanternGeometry(seg = 28, rows = 14): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const y = -0.44 + t * 0.88;
    const r = 0.5 * Math.pow(Math.max(0, 1 - Math.pow(y / 0.5, 2)), 0.42) + 0.02;
    pts.push(new THREE.Vector2(Math.max(0.16, r), y));
  }
  const g = new THREE.LatheGeometry(pts, seg);
  return g;
}

/** Lacquered cap ring for the lantern (top and bottom). */
export function lanternCaps(seg = 20): THREE.BufferGeometry {
  const a = new THREE.CylinderGeometry(0.2, 0.22, 0.08, seg);
  a.translate(0, 0.47, 0);
  const b = new THREE.CylinderGeometry(0.22, 0.2, 0.08, seg);
  b.translate(0, -0.47, 0);
  return mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]);
}

/** A cloud of blossom: a few squashed blobs around a short trunk (unit ~1 m radius, base at y = 0). */
export function blossomTree(seed: number): THREE.BufferGeometry {
  let s = seed;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const parts: THREE.BufferGeometry[] = [];
  const blobs = 6;
  for (let i = 0; i < blobs; i++) {
    const g = new THREE.IcosahedronGeometry(1, i === 0 ? 1 : 0);
    const a = (i / blobs) * Math.PI * 2 + r();
    const rr = i === 0 ? 0 : 0.55 + r() * 0.25;
    const sc = i === 0 ? 0.85 : 0.5 + r() * 0.25;
    g.scale(sc, sc * 0.72, sc);
    g.translate(Math.cos(a) * rr, 0.95 + r() * 0.3 + (i === 0 ? 0.25 : 0), Math.sin(a) * rr);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const trunk = new THREE.CylinderGeometry(0.06, 0.1, 0.9, 5);
  trunk.translate(0, 0.45, 0);
  parts.push(trunk.toNonIndexed());
  for (const p of parts) p.deleteAttribute("uv");
  // keep the blobs' own (smooth, sphere-like) normals
  return mergeGeometries(parts);
}

/** Unit box with its base at y = 0 (for instanced sections). */
export function baseBox(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}
