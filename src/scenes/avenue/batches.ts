import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { baseBox, hipRoof } from "./geom";

// Every building in the scene is built from two instanced primitives: a box
// section (walls drawn by a style shader) and a curved hip roof. Towers, the
// pagoda caps and drums, the low-rise rows along the avenue and the temple
// all go through here, so the whole city is a handful of draw calls.

export const Style = {
  /** warm window bands */ Bands: 0,
  /** warm window grid */ Grid: 1,
  /** cool, sparse offices */ Cool: 2,
  /** pagoda drum: vermilion posts, lit shoji */ Drum: 3,
  /** tower cornice with an LED line */ Cornice: 4,
  /** low-rise traditional row: shops below, shoji above */ Row: 5,
  /** temple hall: vermilion pillars, white plaster */ Temple: 6,
  /** plain (pillars, plant rooms, stone) */ Plain: 7,
  /** lit paper lantern box / gate panel */ Glow: 8,
} as const;

type BoxInst = { x: number; y: number; z: number; w: number; h: number; d: number; rot: number; style: number; seed: number; col: THREE.Color };
type RoofInst = { x: number; y: number; z: number; w: number; h: number; d: number; rot: number; col: THREE.Color; ridge: boolean; near: boolean };

const bodyShader = /* glsl */ `
  vec3 ln = vLocalN;
  float st = floor(vStyle + 0.5);
  float seed = vSeed;
  float hs = hash11(seed * 1.37 + 0.1);
  if (abs(ln.y) < 0.5) {
    bool sx = abs(ln.x) > 0.5;
    float faceW = sx ? vSize.z : vSize.x;
    float u = (sx ? vLocal.z * sign(ln.x) : -vLocal.x * sign(ln.z)) + faceW * 0.5;
    float face = sx ? (ln.x > 0.0 ? 1.0 : 2.0) : (ln.z > 0.0 ? 3.0 : 4.0);
    if (st < 2.5) {
      // ---- tower windows: a lit band per floor, broken into runs of panes
      float grid = step(0.5, st) * step(st, 1.5);
      float cool = step(1.5, st);
      float FH = 3.6;
      float fy = vWorldPos.y / FH;
      float fl = floor(fy);
      float fv = fract(fy);
      // spacing of the floor lines on screen (not fwidth: grazing faces would over-blur)
      float pf = length(vec2(dFdx(fy), dFdy(fy)));
      float detail = 1.0 - smoothstep(0.24, 0.45, pf);
      float b0 = mix(0.3, 0.26, grid);
      float b1 = mix(0.73, 0.7, grid);
      float aa = pf * 0.7 + 1e-4;
      float band = smoothstep(b0 - aa, b0 + aa, fv) - smoothstep(b1 - aa, b1 + aa, fv);
      float cw = mix(2.7, 2.3, grid);
      float cu = u / cw;
      float ci = floor(cu);
      float fu = fract(cu);
      float pu = fwidth(cu);
      float runLen = mix(3.0 + floor(hash12(vec2(fl, seed)) * 9.0), 1.0, grid);
      float run = floor(ci / runLen);
      float hr = hash13(vec3(run + face * 37.0, fl, seed));
      float litFrac = mix(mix(0.8, 0.6, grid), 0.42, cool) * (0.8 + 0.3 * hs);
      float on = step(1.0 - litFrac, hr);
      on *= step(0.07, hash12(vec2(fl * 3.1 + face, seed)));
      // slow flicker: a few runs switch now and then
      float fk = step(0.9, hash11(hr * 91.7));
      float epoch = floor(uTime * (0.05 + 0.1 * hash11(hr * 7.3)) + hr * 13.0);
      on = mix(on, step(0.45, hash13(vec3(run, fl, epoch + seed))), fk);
      float gap = mix(0.05, 0.2, grid);
      float pane = smoothstep(gap - pu, gap + pu, fu) * smoothstep(1.0 - gap + pu, 1.0 - gap - pu, fu);
      pane = mix(1.0, pane, smoothstep(0.6, 0.25, pu));
      float hc = hash11(hr * 13.7);
      vec3 wc = mix(vec3(1.0, 0.62, 0.42), vec3(1.0, 0.84, 0.66), hc);
      wc = mix(wc, vec3(1.0, 0.48, 0.5), step(0.87, hash11(hr * 3.1)));
      wc = mix(wc, vec3(0.74, 0.86, 1.0), cool * step(0.35, hash11(hr * 5.9)));
      float lum = mix(0.8, 1.7, hash11(hr * 7.7)) * (0.7 + 0.5 * hs) * uWin;
      float e = band * on * pane * lum;
      // melted far away: darker than the true mean (the bright bands roll off in the tone curve)
      float avg = (b1 - b0) * litFrac * 0.42 * uWin * (0.7 + 0.5 * hs);
      e = mix(avg, e, detail);
      wc = mix(vec3(1.0, 0.6, 0.42), wc, detail);
      // distance dims the city a little so the haze stays deep
      float dcam = length(vWorldPos - cameraPosition);
      e *= mix(1.0, 0.55, smoothstep(700.0, 2600.0, dcam));
      emis += wc * e;
      float glass = band * (1.0 - on) * detail;
      base = mix(base, base * 0.5 + vec3(0.015, 0.012, 0.03), glass);
      shade = mix(shade, shade * 0.6, glass);
      // the lowest floors: shopfronts glow along the street
      float shop = (1.0 - smoothstep(4.0, 5.5, vWorldPos.y)) * step(0.6, vWorldPos.y);
      emis += vec3(1.0, 0.66, 0.4) * shop * 1.6 * step(0.35, hash12(vec2(floor(u / 6.0), seed + face)));
    } else if (st < 3.5) {
      // ---- pagoda drum: vermilion posts, glowing shoji between
      float cu = u / 3.0;
      float fu = fract(cu);
      float pu = fwidth(cu);
      float post = 1.0 - smoothstep(0.15 - pu, 0.15 + pu, fu);
      float hy = vLocal.y / vSize.y;
      float lintel = max(step(0.8, hy), step(hy, 0.12));
      float panel = (1.0 - post) * (1.0 - lintel);
      float lat = max(step(0.86, fract(u / 0.75)), step(0.84, fract(vLocal.y / 0.8)));
      lat *= smoothstep(0.5, 0.2, fwidth(u / 0.75));
      vec3 red = vec3(0.72, 0.13, 0.08);
      base = mix(base, red, max(post, lintel * 0.7));
      shade = mix(shade, red * 0.3, max(post, lintel * 0.7));
      base = mix(base, vec3(0.9, 0.8, 0.66), panel);
      shade = mix(shade, vec3(0.45, 0.3, 0.3), panel);
      float lit = step(0.22, hash12(vec2(floor(cu), seed + face)));
      emis += vec3(1.0, 0.74, 0.46) * panel * (1.0 - lat * 0.55) * lit * 2.3;
    } else if (st < 4.5) {
      // ---- cornice: a dark band with an LED line
      float which = hash11(seed * 3.3);
      vec3 lc = which < 0.45 ? vec3(1.0, 0.18, 0.12) : which < 0.72 ? vec3(1.0, 0.55, 0.28) : which < 0.88 ? vec3(1.0, 0.38, 0.75) : vec3(0.5, 0.88, 1.0);
      float has = step(0.35, hash11(seed * 7.1));
      float y = vLocal.y;
      float wdt = max(0.16, fwidth(y) * 0.9);
      float led = smoothstep(wdt, 0.0, abs(y - vSize.y * 0.35)) * (0.16 / wdt);
      float bulbs = mix(1.0, 0.45 + 0.55 * step(0.4, fract(u / 0.9)), smoothstep(0.5, 0.2, fwidth(u / 0.9)));
      emis += lc * led * has * bulbs * 4.0;
    } else if (st < 5.5) {
      // ---- low-rise row: plaster, timber posts, shops below, shoji above
      float FH = 3.3;
      float fy = vLocal.y / FH;
      float fl = floor(fy);
      float fv = fract(fy);
      float cu = u / 2.7;
      float fu = fract(cu);
      float pu = fwidth(cu);
      float post = 1.0 - smoothstep(0.09 - pu, 0.09 + pu, fu);
      float beam = 1.0 - smoothstep(0.05, 0.09, fv);
      vec3 wood = vec3(0.14, 0.07, 0.06);
      float hb = hash12(vec2(floor(cu), seed + face));
      if (fl < 0.5) {
        float open = (1.0 - post) * step(0.1, fv) * step(fv, 0.64);
        float noren = (1.0 - post) * step(0.64, fv) * step(fv, 0.82);
        float shopLit = step(0.25, hb);
        vec3 nc = hash11(floor(cu * 0.5) + seed) < 0.55 ? vec3(0.6, 0.07, 0.07) : vec3(0.08, 0.12, 0.36);
        base = mix(base, nc, noren);
        shade = mix(shade, nc * 0.45, noren);
        base = mix(base, vec3(0.25, 0.16, 0.12), open);
        emis += vec3(1.0, 0.7, 0.4) * open * shopLit * 3.0 + nc * noren * 0.5;
      } else {
        float win = (1.0 - post) * step(0.26, fv) * step(fv, 0.8);
        float lat = max(step(0.85, fract(u / 0.7)), step(0.85, fract(vLocal.y / 0.7)));
        lat *= smoothstep(0.5, 0.2, fwidth(u / 0.7));
        float lit = step(0.3, hash12(vec2(floor(cu), fl + seed * 1.7 + face)));
        base = mix(base, vec3(0.92, 0.86, 0.74), win);
        emis += vec3(1.0, 0.82, 0.58) * win * lit * (1.0 - lat * 0.5) * 2.1;
      }
      base = mix(base, wood, max(post, beam));
      shade = mix(shade, wood * 0.5, max(post, beam));
    } else if (st < 6.5) {
      // ---- temple: vermilion pillars, lattice doors glowing, white plaster above
      float cu = u / 4.2;
      float fu = fract(cu);
      float pu = fwidth(cu);
      float hy = vLocal.y / vSize.y;
      float pillar = 1.0 - smoothstep(0.1 - pu, 0.1 + pu, fu);
      float plaster = step(0.72, hy);
      float plinth = step(hy, 0.06);
      vec3 red = vec3(0.74, 0.14, 0.08);
      float door = (1.0 - pillar) * (1.0 - plaster) * (1.0 - plinth);
      float lat = max(step(0.82, fract(u / 0.6)), step(0.82, fract(vLocal.y / 0.6)));
      lat *= smoothstep(0.5, 0.2, fwidth(u / 0.6));
      base = mix(base, red, pillar);
      shade = mix(shade, red * 0.3, pillar);
      base = mix(base, vec3(0.95, 0.92, 0.86), plaster);
      base = mix(base, vec3(0.45, 0.2, 0.12), door);
      emis += vec3(1.0, 0.76, 0.46) * door * (1.0 - lat * 0.6) * 2.6;
    } else if (st > 7.5) {
      // ---- glowing paper panel (gate lanterns, shrine boxes)
      emis += vec3(1.0, 0.62, 0.36) * 2.6;
    }
  } else if (ln.y > 0.5) {
    // flat tops: the parapet reads as a lighter border
    float bx = min(vSize.x * 0.5 - abs(vLocal.x), vSize.z * 0.5 - abs(vLocal.z));
    float rimB = 1.0 - smoothstep(0.5, 0.9, bx);
    base *= 1.0 + rimB * 0.8;
    shade *= 1.0 + rimB * 0.5;
  }
`;

const roofShader = /* glsl */ `
  float part = floor(vPart + 0.5);
  if (part < 1.5) {
    // tile rows running down the slope, courses across; they melt away at distance
    float across = part < 0.5 ? vLocal.x : vLocal.z;
    float f = across / 0.95;
    float pf = fwidth(f);
    float s = abs(fract(f) - 0.5) * 2.0;
    float groove = smoothstep(0.55 - pf * 2.0, 0.8 + pf * 2.0, s);
    float lod = smoothstep(0.45, 0.18, pf);
    float k = mix(0.9, 1.0 - groove * 0.5, lod);
    base *= k;
    shade *= mix(0.92, 1.0 - groove * 0.4, lod);
    // the eave course and the hips catch the city glow
    float eave = 1.0 - smoothstep(0.0, 0.05, vUv.y);
    base = mix(base, base * 1.8 + vec3(0.05, 0.03, 0.03), eave * 0.6);
  } else if (part < 2.5) {
    // fascia: warm wood lit from below by the streets
    base = vec3(0.42, 0.2, 0.14);
    shade = vec3(0.2, 0.08, 0.08);
    emis += vec3(0.5, 0.18, 0.1) * 0.35 * uFascia;
  } else {
    base *= 0.8;
  }
`;

export class Batches {
  boxes: BoxInst[] = [];
  roofs: RoofInst[] = [];

  box(x: number, y: number, z: number, w: number, h: number, d: number, rot: number, style: number, seed: number, col: THREE.ColorRepresentation) {
    this.boxes.push({ x, y, z, w, h, d, rot, style, seed, col: new THREE.Color(col) });
  }

  /** A roof whose eave rectangle (w × d) sits at height y. */
  roof(x: number, y: number, z: number, w: number, h: number, d: number, rot: number, col: THREE.ColorRepresentation, near: boolean) {
    // ridge along the longer side
    let r = rot;
    let ww = w;
    let dd = d;
    if (d > w) {
      r += Math.PI / 2;
      ww = d;
      dd = w;
    }
    this.roofs.push({ x, y, z, w: ww, h, d: dd, rot: r, col: new THREE.Color(col), ridge: ww / dd > 1.25, near });
  }

  build(eye: THREE.Vector3, uniforms: { uWin: THREE.IUniform; uFascia: THREE.IUniform }): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const byDist = <T extends { x: number; y: number; z: number }>(a: T, b: T) =>
      Math.hypot(a.x - eye.x, a.y - eye.y, a.z - eye.z) - Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z);

    // ---- sections
    const boxes = this.boxes.sort(byDist);
    const bodyMat = toonMaterial({
      color: 0xffffff,
      shade: new THREE.Color(0.42, 0.36, 0.5),
      ink: 2,
      rim: 0.8,
      step: 0.1,
      soft: 0.03,
      uniforms: { uWin: uniforms.uWin },
      vertexHead: /* glsl */ `
        attribute vec3 aSize;
        attribute vec2 aInfo;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying float vSeed;
        flat varying float vStyle;`,
      vertex: /* glsl */ `
        vLocal = position * aSize;
        vLocalN = normal;
        vSize = aSize;
        vSeed = aInfo.x;
        vStyle = aInfo.y;`,
      fragmentHead: /* glsl */ `
        uniform float uWin;
        varying vec3 vLocal;
        varying vec3 vLocalN;
        varying vec3 vSize;
        flat varying float vSeed;
        flat varying float vStyle;`,
      fragment: bodyShader,
    });
    const body = new THREE.InstancedMesh(baseBox(), bodyMat, boxes.length);
    const size = new Float32Array(boxes.length * 3);
    const info = new Float32Array(boxes.length * 2);
    boxes.forEach((b, i) => {
      q.setFromAxisAngle(Y, b.rot);
      m.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d));
      body.setMatrixAt(i, m);
      body.setColorAt(i, b.col);
      size.set([b.w, b.h, b.d], i * 3);
      info.set([b.seed, b.style], i * 2);
    });
    body.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(size, 3));
    body.geometry.setAttribute("aInfo", new THREE.InstancedBufferAttribute(info, 2));
    body.frustumCulled = false;
    out.push(body);

    // ---- roofs: pyramid / ridged, near (smooth) / far (coarse)
    const variants: [boolean, boolean][] = [
      [false, true],
      [true, true],
      [false, false],
      [true, false],
    ];
    for (const [ridge, near] of variants) {
      const list = this.roofs.filter((r) => r.ridge === ridge && r.near === near).sort(byDist);
      if (!list.length) continue;
      const geo = hipRoof({ rx: ridge ? 0.22 : 0.035, segS: near ? 9 : 3, segT: near ? 5 : 2, lift: 0.17, fascia: 0.07 });
      const mat = toonMaterial({
        color: 0xffffff,
        shade: new THREE.Color(0.4, 0.34, 0.5),
        ink: 3,
        rim: 1.0,
        step: 0.2,
        soft: 0.03,
        uniforms: { uFascia: uniforms.uFascia },
        vertexHead: /* glsl */ `
          attribute vec3 aSize;
          attribute float aPart;
          varying vec3 vLocal;
          varying float vPart;`,
        vertex: /* glsl */ `
          vLocal = position * aSize;
          vPart = aPart;`,
        fragmentHead: /* glsl */ `
          uniform float uFascia;
          varying vec3 vLocal;
          varying float vPart;`,
        fragment: roofShader,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      const sz = new Float32Array(list.length * 3);
      list.forEach((r, i) => {
        q.setFromAxisAngle(Y, r.rot);
        m.compose(new THREE.Vector3(r.x, r.y, r.z), q, new THREE.Vector3(r.w, r.h, r.d));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, r.col);
        sz.set([r.w, r.h, r.d], i * 3);
      });
      mesh.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sz, 3));
      mesh.frustumCulled = false;
      out.push(mesh);
    }
    return out;
  }
}

/** Eave perimeter point of a roof built with hipRoof (unit s along side 0…3), in world space. */
export function eavePoint(r: { x: number; y: number; z: number; w: number; h: number; d: number; rot: number }, side: number, s: number, lift = 0.17) {
  const c = Math.max(0, (Math.abs(2 * s - 1) - 0.3) / 0.7);
  const up = lift * c * c;
  const u = -0.5 + s;
  let x = 0;
  let z = 0;
  if (side === 0) [x, z] = [u, 0.5];
  else if (side === 1) [x, z] = [0.5, -u];
  else if (side === 2) [x, z] = [-u, -0.5];
  else [x, z] = [-0.5, u];
  const k = 1 + up * 0.35;
  const lx = x * k * r.w;
  const lz = z * k * r.d;
  const cs = Math.cos(r.rot);
  const sn = Math.sin(r.rot);
  return new THREE.Vector3(r.x + lx * cs + lz * sn, r.y + up * r.h, r.z - lx * sn + lz * cs);
}
