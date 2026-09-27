import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";
import { EYE_MENU, EYE_SCREEN, grassDensity, groundY } from "./layout";

// The field of susuki (Miscanthus): clumps of long arching leaves (instanced,
// three levels of detail by distance) and flowering stems whose silver plumes
// are camera-facing ribbons cut out as feathers — a rachis with barbs combed
// toward the tip, alpha-to-coverage edges. Gusts travel across the field as
// broad waves: the stems bow, the plumes swing and turn their silver to the
// moon, then straighten again behind the wave.

/** A travelling gust field shared by leaves and plumes (0 … 1). */
export const gustGlsl = /* glsl */ `
float gustAt(vec2 p, float t) {
  vec2 w = normalize(uWind.xz);
  vec2 q = vec2(dot(p, w), dot(p, vec2(-w.y, w.x)));
  float front = q.x * 0.16 - t * 0.9 + sin(q.y * 0.05 + 1.3) * 1.3 + (vnoise(q * 0.025 + 3.1) - 0.5) * 3.0;
  float g = 0.5 + 0.5 * sin(front);
  g = g * g * (3.0 - 2.0 * g);
  g *= 0.45 + 0.55 * vnoise(vec2(q.x * 0.02 - t * 0.12, q.y * 0.04));
  return g;
}`;

// ------------------------------------------------------------------ geometry

/** A unit clump of `n` leaves arching out from the root (uv.y = 0 at the base … 1 at the tip). */
function clumpGeometry(n: number, widthMul: number, seed: number): THREE.BufferGeometry {
  const rand = rng(seed);
  const SEG = 6;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let v0 = 0;
  for (let l = 0; l < n; l++) {
    const az = (l / n) * Math.PI * 2 + rand() * 0.9;
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const across = new THREE.Vector3(-dir.z, 0, dir.x);
    const L = 0.72 + rand() * 0.5;
    const out = 0.3 + rand() * 0.45;
    const rise = 0.85 + rand() * 0.3;
    const droop = 0.25 + rand() * 0.45;
    const W = 0.024 * widthMul * (0.8 + rand() * 0.45);
    const bx = (rand() - 0.5) * 0.12;
    const bz = (rand() - 0.5) * 0.12;
    const twist = (rand() - 0.5) * 1.2;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const hx = out * L * Math.pow(t, 1.3);
      const hy = L * (rise * t - droop * t * t);
      const P = new THREE.Vector3(bx + dir.x * hx, hy, bz + dir.z * hx);
      const dhx = out * L * 1.3 * Math.pow(Math.max(t, 0.02), 0.3);
      const dhy = L * (rise - 2 * droop * t);
      const T = dir.clone().multiplyScalar(dhx).add(new THREE.Vector3(0, dhy, 0)).normalize();
      const a = across.clone().applyAxisAngle(T, twist * t);
      const N = new THREE.Vector3().crossVectors(a, T).normalize();
      if (N.y < 0) N.negate();
      const w = W * (t < 0.12 ? 0.45 + (t / 0.12) * 0.55 : 1) * (1 - Math.pow(t, 2.4) * 0.92);
      pos.push(P.x - a.x * w, P.y - a.y * w, P.z - a.z * w, P.x + a.x * w, P.y + a.y * w, P.z + a.z * w);
      nrm.push(N.x, N.y, N.z, N.x, N.y, N.z);
      uv.push(0, t, 1, t);
      if (i > 0) {
        const b = v0 + (i - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    v0 += (SEG + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** A ribbon along t (uv.y), two columns at x = ±0.5; denser toward the plume head. */
function plumeStrip(): THREE.BufferGeometry {
  const ts = [0, 0.14, 0.28, 0.42, 0.54, 0.63, 0.7, 0.745, 0.785, 0.825, 0.865, 0.9, 0.935, 0.968, 1];
  const pos: number[] = [];
  const uv: number[] = [];
  const nrm: number[] = [];
  const idx: number[] = [];
  ts.forEach((t, i) => {
    pos.push(-0.5, t, 0, 0.5, t, 0);
    uv.push(0, t, 1, t);
    nrm.push(0, 0, 1, 0, 0, 1);
    if (i > 0) {
      const b = (i - 1) * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------------ materials

function leafMaterial(lights: number) {
  return toonMaterial({
    lights,
    color: 0x3b7a92,
    shade: 0x0f2548,
    ink: 30,
    rim: 0.75,
    step: 0.1,
    soft: 0.05,
    side: THREE.DoubleSide,
    vertexHead: /* glsl */ `varying float vGust; ${gustGlsl}`,
    vertex: /* glsl */ `
      vec3 root = m[3].xyz;
      float g = gustAt(root.xz, uTime);
      float above = max(0.0, wp.y - root.y);
      float k = above * above;
      float fl = sin(uTime * 2.9 + root.x * 1.7 + root.z * 1.3 + uv.y * 2.5) * 0.5 + sin(uTime * 4.7 + root.z * 2.1 + root.x) * 0.3;
      vec2 wd = normalize(uWind.xz);
      wp.xz += wd * k * (0.09 + 0.3 * g) + vec2(-wd.y, wd.x) * k * fl * 0.05;
      wp.y -= k * (0.04 + 0.15 * g) * 0.6;
      vGust = g;`,
    fragmentHead: /* glsl */ `varying float vGust;`,
    fragment: /* glsl */ `
      // leaves lighten toward their tips; a gust shows their paler undersides
      float t = vUv.y;
      base *= 0.78 + 0.34 * t + 0.25 * vGust * t;
      shade *= 0.85 + 0.25 * t;
      // close to the viewer: a dark silhouette
      float nearK = smoothstep(9.0, 2.5, length(vWorldPos - cameraPosition));
      base = mix(base, vec3(0.03, 0.07, 0.17), nearK * 0.75);
      shade = mix(shade, vec3(0.015, 0.035, 0.1), nearK * 0.75);`,
  });
}

function plumeMaterial(pxAngle: THREE.IUniform<number>) {
  return toonMaterial({
    color: 0xc9d3f2,
    shade: 0x7584bd,
    ink: 0,
    rim: 0,
    step: 0.0,
    soft: 0.08,
    lights: 0,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    uniforms: { uPxAngle: pxAngle },
    vertexHead: /* glsl */ `
      attribute vec4 aRoot;   // root xyz, total height
      attribute vec4 aShape;  // lean xz, head fraction, seed
      uniform float uPxAngle;
      varying float vT;
      varying float vHf;
      varying float vAcross;
      varying float vHalfW;
      varying float vStemW;
      varying float vGust;
      varying float vSeed;
      varying float vSide;
      varying float vDist;
      varying float vN;
      ${gustGlsl}`,
    vertex: /* glsl */ `
      float H = aRoot.w;
      float t = uv.y;
      float hf = aShape.z;
      float seed = aShape.w;
      float g = gustAt(aRoot.xz, uTime);
      vec2 wd = normalize(uWind.xz);
      vec2 ws = vec2(-wd.y, wd.x);
      float fl = sin(uTime * (1.9 + seed * 1.6) + seed * 40.0) * 0.6 + sin(uTime * (3.3 + seed) + seed * 13.0) * 0.3;
      vec2 bend = aShape.xy + wd * (0.05 + 0.19 * g + 0.025 * fl) + ws * fl * 0.018;
      // the culm bows as t^2; the panicle arches over further
      float headT = max(0.0, (t - (1.0 - hf)) / hf);
      float arch = 2.6;
      float s2 = t * t + headT * headT * hf * arch;
      float bl2 = dot(bend, bend) + 0.02;
      vec2 off = bend * H * s2;
      vec3 c = aRoot.xyz + vec3(off.x, H * t - H * s2 * bl2 * 0.5, off.y);
      float ds2 = 2.0 * t + 2.0 * headT * arch;
      vec3 T = normalize(vec3(bend.x * H * ds2, H - H * ds2 * bl2 * 0.5, bend.y * H * ds2));
      vec3 toCam = cameraPosition - c;
      float dist = length(toCam);
      toCam /= max(dist, 1e-3);
      vec3 across = cross(T, toCam);
      float al = length(across);
      across = al > 1e-4 ? across / al : vec3(1.0, 0.0, 0.0);
      float px = dist * uPxAngle;
      float stemW = max(0.0068 * H / 1.8, px * 0.55);
      float headW = max(0.1 * H / 1.8, px * 1.6);
      float halfW = headT > 0.0 ? headW : stemW;
      wp.xyz = c + across * position.x * 2.0 * halfW;
      nrm = normalize(vec3(0.0, 0.62, 0.0) + toCam * 0.38);
      vT = t;
      vHf = hf;
      vAcross = position.x * 2.0 * halfW;
      vHalfW = headW;
      vStemW = stemW;
      vGust = g;
      vSeed = seed;
      // which side of the ribbon hangs down: the strands droop on that side
      vSide = clamp(-across.y * 3.0, -1.0, 1.0);
      vDist = dist;
      // how many hairs this plume can show: one per ~6 px of panicle, constant over the plume
      vec3 mid = aRoot.xyz + vec3(0.0, H * 0.85, 0.0);
      float headPx = hf * H / max(length(cameraPosition - mid) * uPxAngle, 1e-6);
      vN = clamp(floor(headPx / 6.0), 3.0, 60.0);`,
    fragmentHead: /* glsl */ `
      varying float vT;
      varying float vHf;
      varying float vAcross;
      varying float vHalfW;
      varying float vStemW;
      varying float vGust;
      varying float vSeed;
      varying float vSide;
      varying float vDist;
      varying float vN;`,
    fragment: /* glsl */ `
      float headT = (vT - (1.0 - vHf)) / vHf;
      float ax = abs(vAcross);
      // near the viewer the grass is a flat dark silhouette against the sky, as the film draws it
      float nearK = smoothstep(11.0, 4.0, vDist);
      vec3 sil = vec3(0.02, 0.05, 0.18);
      if (headT < 0.0) {
        // the culm: a thin blue-green stem
        alpha = smoothstep(vStemW * 1.05, vStemW * 0.7, ax);
        if (alpha < 0.02) discard;
        base = mix(vec3(0.2, 0.36, 0.5) * (0.8 + 0.3 * vT), sil, nearK);
        shade = mix(vec3(0.05, 0.11, 0.25), sil * 0.8, nearK);
      } else {
        float h = saturate(headT);
        // an arched spine near the upper edge, long hairs combed toward the tip on the lower side
        float x = vAcross / vHalfW;
        float xr = -0.55 * vSide;
        float dx = x - xr;
        float ad = abs(dx);
        float lower = step(0.0, dx * (vSide >= 0.0 ? 1.0 : -1.0));
        float reach = mix(1.0 - 0.55 * abs(vSide), 1.0 + 0.55 * abs(vSide), lower);
        float open = 0.8 + 0.4 * fract(vSeed * 7.31);
        float env = (sin(3.14159 * pow(h, 0.55)) * (1.0 - 0.25 * h) * 0.9 + 0.1) * open * reach;
        // cheap early out: well outside the tuft
        if (ad > env * 1.12 + 0.02) discard;
        env *= 0.8 + 0.3 * vnoise(vec2(h * 7.0, vSeed * 13.0 + lower * 5.0));
        // hairs: gently curving, unevenly spaced
        float N = min(15.0 + 6.0 * fract(vSeed * 3.7), vN);
        float ph = h * N - ad * N * 0.5 - ad * ad * N * 0.3 + vnoise(vec2(h * 4.0, vSeed * 17.0)) * 1.2 + vSeed * 7.0;
        float fw = fwidth(ph);
        float strand = abs(fract(ph) - 0.5) * 2.0;
        float sA = smoothstep(0.34 + fw, 0.34 - fw, strand);
        // too fine to draw: a solid tuft whose edge stays ragged with a few coarse locks
        float coarse = max(step(vN, 3.5), smoothstep(0.4, 0.55, fw));
        float len = env * (0.7 + 0.4 * hash11(floor(ph) + vSeed * 91.0));
        len = mix(len, env * (0.62 + 0.3 * vnoise(vec2(h * 9.0 + vSeed * 5.0, ad * 3.0))), coarse);
        sA = mix(sA, 1.0, coarse);
        float fwA = fwidth(ad) + 1e-4;
        float edge = smoothstep(len + fwA, len - fwA, ad);
        float spine = smoothstep(0.07 + fwA, 0.07 - fwA, ad) * step(h, 0.96);
        alpha = max(sA * edge, spine);
        if (alpha < 0.02) discard;
        // silver florets in the field (a passing gust lends them a sheen), flat dark hairs up close
        float rosy = step(0.82, fract(vSeed * 5.1));
        vec3 silver = mix(vec3(0.5, 0.57, 0.82), vec3(0.6, 0.52, 0.72), rosy * 0.6);
        float tip = ad / max(len, 0.05);
        base = silver * (0.56 + 0.26 * tip + 0.38 * vGust);
        shade = mix(vec3(0.18, 0.23, 0.48), vec3(0.26, 0.22, 0.44), rosy * 0.5) * (0.85 + 0.3 * tip);
        base = mix(base, sil * (0.9 + 0.35 * tip), nearK);
        shade = mix(shade, sil * 0.85, nearK);
        // florets light up when the moon is behind them
        vec3 Vd = normalize(vWorldPos - cameraPosition);
        float back = pow(saturate(dot(Vd, uMoonDir)), 12.0);
        emis += vec3(0.5, 0.78, 1.0) * back * (0.3 + 0.5 * vGust) * (1.0 - nearK) * 0.6;
      }`,
  });
}

// ------------------------------------------------------------------ placement

type Clump = { x: number; z: number; y: number; s: number; lod: number; plumes: number; tall: number; hero?: boolean };

const D2R = Math.PI / 180;
const views = [
  { eye: EYE_SCREEN, yaw: 15.5 * D2R, half: 42 * D2R },
  { eye: EYE_MENU, yaw: 3 * D2R, half: 46 * D2R },
];

function visible(x: number, z: number): boolean {
  for (const v of views) {
    const dx = x - v.eye[0];
    const dz = z - v.eye[2];
    const d = Math.hypot(dx, dz);
    if (d < 0.8) continue;
    const az = Math.atan2(dx, -dz);
    let da = az - v.yaw;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    // widen near the eye: a clump beside the camera still reaches into the frame
    const extra = Math.atan2(1.2, d);
    if (Math.abs(da) < v.half + extra) return true;
  }
  return false;
}

const eyeDist = (x: number, z: number) => Math.min(Math.hypot(x - EYE_SCREEN[0], z - EYE_SCREEN[2]), Math.hypot(x - EYE_MENU[0], z - EYE_MENU[2]));

/** Hero clumps around the low viewpoint: (azimuth°, distance m, plume height m, plumes). */
const HERO: [number, number, number, number][] = [
  // tall plumes under the moon
  [26, 5.8, 2.2, 4],
  [31, 4.6, 2.3, 5],
  [35, 3.6, 1.95, 3],
  // framing the right edge
  [49, 2.3, 2.3, 3],
  [52, 3.1, 2.45, 3],
  // low clumps in the bottom-right corner, below the hall
  [42, 2.6, 1.1, 2],
  [47, 1.8, 1.15, 2],
  [53, 2.0, 1.2, 3],
];

export type SusukiField = { group: THREE.Group; update(camera: THREE.PerspectiveCamera, heightPx: number): void };

export function buildSusuki(density: number, extraPlumes: THREE.Vector4[] = []): SusukiField {
  const rand = rng(1509);
  const keep = 0.55 + 0.45 * density;
  const clumps: Clump[] = [];
  const bands: [number, number, number, number][] = [
    // cell size, min eye distance, max eye distance, lod
    [1.12, 0, 30, 0],
    [1.75, 30, 72, 1],
    [2.9, 72, 400, 2],
  ];
  for (const [cell, d0, d1, lod] of bands) {
    for (let x = -90; x < 240; x += cell) {
      for (let z = -240; z < 50; z += cell) {
        const px = x + rand() * cell;
        const pz = z + rand() * cell;
        const d = eyeDist(px, pz) * (0.92 + rand() * 0.16);
        if (d < d0 || d >= d1) continue;
        if (rand() > keep) continue;
        const dens = grassDensity(px, pz);
        if (dens <= 0.02 || rand() > dens * (0.7 + 0.3 * Math.sin(px * 0.21) * Math.sin(pz * 0.17) + 0.3)) continue;
        if (!visible(px, pz)) continue;
        const s = 0.85 + rand() * 0.5;
        // plumes come in drifts: some patches in full bloom, others mostly leaves
        const bloom = 0.5 + 0.3 * Math.sin(px * 0.13 + 1.1) * Math.sin(pz * 0.11 - 0.4) + 0.2 * Math.sin(px * 0.37 + pz * 0.29);
        const maxP = lod === 0 ? 3 : 2;
        let plumes = 0;
        const thin = lod === 2 ? 0.55 : lod === 1 ? 0.85 : 1;
        for (let k = 0; k < maxP; k++) if (rand() < bloom * thin * (k === 0 ? 1 : 0.55)) plumes++;
        clumps.push({ x: px, z: pz, y: groundY(px, pz), s, lod, plumes, tall: 1.3 + rand() * 0.75 });
      }
    }
  }
  for (const [az, d, tall, plumes] of HERO) {
    const x = EYE_SCREEN[0] + Math.sin(az * D2R) * d;
    const z = EYE_SCREEN[2] - Math.cos(az * D2R) * d;
    clumps.push({ x, z, y: groundY(x, z), s: 1.25 + rand() * 0.25, lod: 0, plumes, tall, hero: true });
  }

  // ---- leaves
  const group = new THREE.Group();
  const geos = [clumpGeometry(12, 1, 11), clumpGeometry(6, 1.9, 12), clumpGeometry(3, 3.4, 13)];
  // lantern light only reaches the near grass (the pond bank); far clumps skip the point lights
  const mats = [leafMaterial(1), leafMaterial(0)];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  for (let lod = 0; lod < 3; lod++) {
    const list = clumps.filter((c) => c.lod === lod);
    const mesh = new THREE.InstancedMesh(geos[lod], mats[lod === 0 ? 0 : 1], list.length);
    list.forEach((c, i) => {
      q.setFromAxisAngle(up, rand() * Math.PI * 2);
      const sy = c.s * (c.hero ? 1.25 : 1);
      m.compose(new THREE.Vector3(c.x, c.y - 0.03, c.z), q, new THREE.Vector3(c.s, sy, c.s));
      mesh.setMatrixAt(i, m);
      col.setHSL(0.53 + rand() * 0.06, 0.4 + rand() * 0.2, 0.42 + rand() * 0.16);
      mesh.setColorAt(i, col);
    });
    mesh.frustumCulled = false;
    mesh.renderOrder = -30;
    group.add(mesh);
  }

  // ---- plumes
  const roots: number[] = [];
  const shapes: number[] = [];
  for (const c of clumps) {
    for (let k = 0; k < c.plumes; k++) {
      const a = rand() * Math.PI * 2;
      const r = rand() * 0.14 * c.s;
      const x = c.x + Math.cos(a) * r;
      const z = c.z + Math.sin(a) * r;
      const H = c.tall * (0.82 + rand() * 0.3) * (c.hero ? 1 : c.s * 0.85 + 0.15);
      // hero plumes lean downwind (and so away from the moon); the rest every which way
      const la = c.hero ? Math.atan2(-0.25, 1) + (rand() - 0.5) * 1.1 : rand() * Math.PI * 2;
      const lean = c.hero ? 0.07 + rand() * 0.08 : 0.05 + rand() * 0.14;
      roots.push(x, c.y, z, H);
      const outK = c.hero ? 0 : 0.05;
      shapes.push(Math.cos(la) * lean + Math.cos(a) * outK, Math.sin(la) * lean + Math.sin(a) * outK, 0.19 + rand() * 0.09, rand());
    }
  }
  for (const e of extraPlumes) {
    // plumes set into the vase on the veranda: short, upright-ish, fanned
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand();
      roots.push(e.x, e.y, e.z, e.w * (0.85 + rand() * 0.3));
      shapes.push(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.3, rand());
    }
  }
  const strip = plumeStrip();
  const pg = new THREE.InstancedBufferGeometry();
  pg.index = strip.index;
  pg.setAttribute("position", strip.getAttribute("position"));
  pg.setAttribute("uv", strip.getAttribute("uv"));
  pg.setAttribute("normal", strip.getAttribute("normal"));
  pg.setAttribute("aRoot", new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
  pg.setAttribute("aShape", new THREE.InstancedBufferAttribute(new Float32Array(shapes), 4));
  pg.instanceCount = roots.length / 4;
  const pxAngle = { value: 0.001 };
  const plumes = new THREE.Mesh(pg, plumeMaterial(pxAngle));
  plumes.frustumCulled = false;
  plumes.renderOrder = -20;
  group.add(plumes);

  return {
    group,
    update(camera, heightPx) {
      pxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
    },
  };
}
