import * as THREE from "three";

// Geometry plumbing for the pagoda street: a builder that bakes many small
// transformed parts (boxes, lathes, tubes…) into one indexed geometry with a
// per-vertex tint and a free vec4 "part" attribute for the shaders, so each
// material is one draw call.

const _m3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();

export type Tint = THREE.ColorRepresentation | [number, number, number];

export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private part: number[] = [];
  private idx: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }

  /** Append a geometry transformed by `m`, tinted, with a part vec4 on every vertex. */
  add(g: THREE.BufferGeometry, m: THREE.Matrix4, tint: Tint = 0xffffff, part: [number, number, number, number] = [0, 0, 0, 0]) {
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const uv = g.getAttribute("uv");
    const base = this.pos.length / 3;
    _m3.getNormalMatrix(m);
    const c = Array.isArray(tint) ? tint : new THREE.Color(tint).toArray();
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) _n.fromBufferAttribute(n, i).applyMatrix3(_m3).normalize();
      else _n.set(0, 1, 0);
      this.nrm.push(_n.x, _n.y, _n.z);
      if (uv) this.uv.push(uv.getX(i), uv.getY(i));
      else this.uv.push(0, 0);
      this.col.push(c[0], c[1], c[2]);
      this.part.push(part[0], part[1], part[2], part[3]);
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  /** Axis-aligned (then rotated about y by `rotY` around the box centre) box. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, tint: Tint = 0xffffff, part: [number, number, number, number] = [0, 0, 0, 0]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromAxisAngle(Y, rotY), new THREE.Vector3(sx, sy, sz));
    return this.add(UNIT_BOX, m, tint, part);
  }

  /** A box between two points (its local z runs a → b), with a cross-section w × h. */
  beam(a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, tint: Tint = 0xffffff, part: [number, number, number, number] = [0, 0, 0, 0], up = Y) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const z = d.clone().normalize();
    let x = new THREE.Vector3().crossVectors(up, z);
    if (x.lengthSq() < 1e-6) x = new THREE.Vector3(1, 0, 0);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(z, x);
    const m = new THREE.Matrix4().makeBasis(x.multiplyScalar(w), y.multiplyScalar(h), z.multiplyScalar(len));
    m.setPosition(a.clone().add(b).multiplyScalar(0.5));
    return this.add(UNIT_BOX, m, tint, part);
  }

  build(withPart = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    if (withPart) g.setAttribute("aPart", new THREE.Float32BufferAttribute(this.part, 4));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export const Y = new THREE.Vector3(0, 1, 0);
export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** Points of a hanging chain between a and b (parabolic sag, metres). */
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    out.push(p);
  }
  return out;
}

/** A thin tube through points (no caps), as geometry for the builder. */
export function tube(pts: THREE.Vector3[], radius: number, radial = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, Math.max(2, pts.length * 2), radius, radial, false);
}

export const deg = THREE.MathUtils.degToRad;
