import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { hipRoof, merge, unitBox } from "./city";
import { DECK, DRUM, LANTERNS, RAIL, SILL, STEPS, STONE_LANTERNS, stepY } from "./layout";

// The stage itself: the waxed hinoki deck that mirrors the balustrade and the
// glow of the town below, the stone threshold and the steps coming up through
// the gate, the vermilion balustrade with its knobbed posts, the two lacquered
// drum posts at the opening, a pair of stone lanterns, and the roof of the
// lower gate just beyond the edge.

const VERMILION = 0xd8432a;
const VERMILION_SHADE = 0x5a1830;
const f = (x: number) => x.toFixed(3);

/** Where the balustrade posts stand along the front (|x| from the opening outward). */
export const RAIL_X0 = DRUM.x + DRUM.r + 0.05;
const FRONT_SPANS = Math.round((DECK.x1 - RAIL_X0) / RAIL.spacing);
export const RAIL_SP = (DECK.x1 - RAIL_X0) / FRONT_SPANS;
const SIDE_Z1 = -0.4;
const SIDE_SPANS = Math.round((SIDE_Z1 - RAIL.z) / RAIL.spacing);
const SIDE_SP = (SIDE_Z1 - RAIL.z) / SIDE_SPANS;
/** Small lanterns sitting on the top rail (every other span), as on the film's railings. */
export const RAIL_LANTERNS: THREE.Vector3[] = [];
for (const s of [-1, 1]) {
  for (const k of [1, 3, 5]) if (k < FRONT_SPANS) RAIL_LANTERNS.push(new THREE.Vector3(s * (RAIL_X0 + (k + 0.5) * RAIL_SP), RAIL.top + 0.16, RAIL.z));
  for (const k of [1, 3, 5]) if (k < SIDE_SPANS) RAIL_LANTERNS.push(new THREE.Vector3(s * RAIL.side, RAIL.top + 0.16, RAIL.z + (k + 0.5) * SIDE_SP));
}

const deckFrag = /* glsl */ `
  vec3 P = vWorldPos;
  vec3 Vd = normalize(P - cameraPosition);
  bool stone = P.z > ${f(DECK.zBack)};
  float gz, tone, seam, fade;
  if (!stone) {
    // hinoki planks across the view, staggered butt joints
    float rowf = P.z / 0.3;
    float row = floor(rowf);
    float fz = fract(rowf);
    float colf = P.x / 3.9 + hash11(row * 1.37 + 0.5);
    float ci = floor(colf);
    float fx = fract(colf);
    tone = hash12(vec2(row, ci));
    gz = fwidth(rowf);
    float gx = fwidth(colf);
    float seamZ = 1.0 - smoothstep(gz * 0.6, gz * 1.6 + 0.02, min(fz, 1.0 - fz));
    float seamX = 1.0 - smoothstep(gx * 0.6, gx * 1.6 + 0.004, min(fx, 1.0 - fx));
    fade = smoothstep(0.75, 0.25, gz);
    seam = max(seamZ, seamX * 0.9) * fade;
    float grain = vnoise(vec2(P.x * 1.7 + ci * 13.0, P.z * 26.0));
    base *= 0.84 + 0.22 * tone + (grain - 0.5) * 0.12 * fade;
  } else {
    // granite slabs of the threshold
    vec2 s = vec2(P.x / 1.25 + step(0.5, fract(P.z / 0.9 * 0.5)) * 0.5, P.z / 0.9);
    vec2 sf = fract(s);
    vec2 si = floor(s);
    tone = hash12(si);
    vec2 sw = fwidth(s);
    gz = sw.y;
    fade = smoothstep(0.75, 0.25, gz);
    seam = max(1.0 - smoothstep(sw.y * 0.6, sw.y * 1.6 + 0.02, min(sf.y, 1.0 - sf.y)), 1.0 - smoothstep(sw.x * 0.6, sw.x * 1.6 + 0.02, min(sf.x, 1.0 - sf.x))) * fade;
    base = vec3(0.04, 0.042, 0.068) * (0.85 + 0.3 * tone);
    shade = vec3(0.02, 0.022, 0.045);
  }
  base *= 1.0 - seam * 0.6;

  // ---- glossy reflection (waxed hinoki): soft and streaked toward the viewer.
  // Trace the mirrored ray against the balustrade, the newel posts and the
  // stone lanterns; past them the warm glow of the town, then the night sky.
  vec3 R = vec3(Vd.x, -Vd.y, Vd.z);
  R.xz += (vec2(hash11(tone * 91.0), hash11(tone * 37.0)) - 0.5) * vec2(0.02, 0.008);
  R = normalize(R);
  float cosV = saturate(-Vd.y);
  float F = mix(0.05, 0.75, pow(1.0 - cosV, 5.0)) * (stone ? 0.55 : 1.0);
  vec3 refl = mix(uGlow, uSky, smoothstep(0.0, 0.14, R.y));
  float tHit = 1e9;
  if (R.z < -1e-4) {
    float t = (${f(RAIL.z)} - P.z) / R.z;
    vec3 H = P + R * t;
    float ax = abs(H.x);
    if (ax < ${f(DECK.x1 + 0.1)} && ax > ${f(RAIL_X0 - 0.12)} && H.y < ${f(RAIL.top + 0.2)}) {
      float dp = abs(fract((ax - ${f(RAIL_X0)}) / ${f(RAIL_SP)} + 0.5) - 0.5) * ${f(RAIL_SP)};
      float post = smoothstep(0.13, 0.08, dp);
      // the rails blur into one darker band in a glossy (not mirror) floor; the lower panel is solid
      refl = mix(refl, uRailC, max(post, H.y < 0.6 ? 0.85 : 0.35));
      tHit = t;
    }
  }
  for (int i = 0; i < 2; i++) {
    vec2 c = vec2(i == 0 ? -${f(DRUM.x)} : ${f(DRUM.x)}, ${f(RAIL.z)});
    vec2 o = P.xz - c;
    float a = dot(R.xz, R.xz);
    float b = dot(o, R.xz);
    float cc = dot(o, o) - ${f((DRUM.r * 1.2) ** 2)};
    float disc = b * b - a * cc;
    if (disc > 0.0) {
      float t = (-b - sqrt(disc)) / a;
      float hy = P.y + R.y * t;
      if (t > 0.0 && t < tHit && hy < ${f(DRUM.h + 0.5)}) {
        refl = mix(uRailC, vec3(0.12, 0.14, 0.14), step(${f(DRUM.h)}, hy));
        tHit = t;
      }
    }
  }
  for (int i = 0; i < 2; i++) {
    vec4 L = uStone[i];
    vec2 o = P.xz - L.xz;
    float a = dot(R.xz, R.xz);
    float b = dot(o, R.xz);
    float cc = dot(o, o) - 0.09;
    float disc = b * b - a * cc;
    if (disc > 0.0) {
      float t = (-b - sqrt(disc)) / a;
      float hy = P.y + R.y * t;
      if (t > 0.0 && t < tHit && hy < 2.2) refl = vec3(0.07, 0.07, 0.13);
    }
  }
  // lights: long, soft streaks of the stone lanterns and the rail lanterns
  vec3 streak = vec3(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 Ld = normalize(uStone[i].xyz - P);
    float dh = length(normalize(Ld.xz) - normalize(R.xz));
    float dv = abs(Ld.y - R.y);
    streak += vec3(1.0, 0.6, 0.28) * exp(-dh * dh * 900.0 - dv * dv * 26.0) * 1.2;
  }
  for (int i = 0; i < ${RAIL_LANTERNS.length}; i++) {
    vec3 Ld = normalize(uRailL[i].xyz - P);
    float dh = length(normalize(Ld.xz) - normalize(R.xz));
    float dv = abs(Ld.y - R.y);
    streak += vec3(1.0, 0.56, 0.26) * exp(-dh * dh * 1800.0 - dv * dv * 34.0) * 0.8;
  }
  emis += (refl + streak) * F;
  base *= 1.0 - F * 0.55;
  shade *= 1.0 - F * 0.55;

  // ---- light: the glow rising from below the balustrade, with the long
  // shadows of the posts fanning toward the viewer; lantern pools.
  float glowK = smoothstep(-2.0, ${f(RAIL.z + 0.5)}, P.z);
  vec3 S = vec3(0.0, 3.0, -140.0);
  vec3 D = normalize(S - P);
  float ts = (${f(RAIL.z)} - P.z) / D.z;
  vec3 Hs = P + D * ts;
  float axs = abs(Hs.x);
  float dps = abs(fract((axs - ${f(RAIL_X0)}) / ${f(RAIL_SP)} + 0.5) - 0.5) * ${f(RAIL_SP)};
  float wS = fwidth(Hs.x) * 0.7;
  float sh = smoothstep(0.13 + wS, 0.09, dps) * step(axs, ${f(DECK.x1)}) * step(${f(RAIL_X0 - 0.15)}, axs);
  sh = max(sh, smoothstep(${f(DRUM.r)} + wS, ${f(DRUM.r - 0.06)}, abs(axs - ${f(DRUM.x)})));
  emis += uGlow * 0.16 * glowK * (1.0 - sh * 0.85) * (1.0 - seam * 0.5);
  base *= 1.0 - sh * 0.35 * glowK;
  vec3 pool = vec3(0.0);
  for (int i = 0; i < ${LANTERNS.length}; i++) {
    float v = saturate(1.0 - length(P.xz - uLant[i].xz) / 4.6);
    v *= v;
    pool += vec3(1.0, 0.55, 0.26) * (floor(v * 3.0 + 0.4) / 3.0 * 0.8 + v * 0.2);
  }
  for (int i = 0; i < 2; i++) {
    float v = saturate(1.0 - length(P.xz - uStone[i].xz) / 3.2);
    v *= v;
    pool += vec3(1.0, 0.6, 0.3) * (floor(v * 3.0 + 0.4) / 3.0 * 0.8 + v * 0.2) * 1.2;
  }
  for (int i = 0; i < ${RAIL_LANTERNS.length}; i++) {
    float v = saturate(1.0 - length(P.xz - uRailL[i].xz) / 2.4);
    v *= v;
    pool += vec3(1.0, 0.58, 0.28) * (floor(v * 3.0 + 0.4) / 3.0 * 0.8 + v * 0.2) * 0.75;
  }
  // lantern light on waxed wood: warm pools, plus a low warm ambience everywhere
  emis += pool * (base * 1.1 + vec3(0.07, 0.035, 0.015)) * (1.0 - seam * 0.4);
  emis += vec3(0.05, 0.022, 0.01) * (1.0 - F) * (stone ? 0.3 : 1.0);`;

/** The deck (wood) and the threshold (stone): one mesh, one shader. */
function deck(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(DECK.x1 - DECK.x0 + 0.6, SILL.z1 - DECK.zFront + 0.3, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate((DECK.x0 + DECK.x1) / 2, 0, (SILL.z1 + DECK.zFront) / 2 - 0.15);
  const mat = toonMaterial({
    color: 0x5c3826,
    shade: 0x24141c,
    ink: 3,
    rim: 0,
    step: -0.5,
    lights: 0.6,
    uniforms: {
      uLant: { value: LANTERNS.map((p) => new THREE.Vector4(p.x, p.y, p.z, 1)) },
      uStone: { value: STONE_LANTERNS.map((p) => new THREE.Vector4(p.x, p.y, p.z, 1)) },
      uRailL: { value: RAIL_LANTERNS.map((p) => new THREE.Vector4(p.x, p.y, p.z, 1)) },
      uGlow: { value: new THREE.Color(1.0, 0.5, 0.28) },
      uSky: { value: new THREE.Color(0.015, 0.035, 0.11) },
      uRailC: { value: new THREE.Color(0.2, 0.035, 0.04) },
    },
    fragmentHead: /* glsl */ `
      uniform vec4 uLant[${LANTERNS.length}];
      uniform vec4 uStone[2];
      uniform vec4 uRailL[${RAIL_LANTERNS.length}];
      uniform vec3 uGlow;
      uniform vec3 uSky;
      uniform vec3 uRailC;`,
    fragment: deckFrag,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  return m;
}

/** Steps down from the threshold, their side walls, and the plinth under everything. */
function steps(): THREE.Object3D {
  const grp = new THREE.Group();
  const n = STEPS.n;
  const box = unitBox();
  const mat = toonMaterial({
    color: 0x1b2136,
    shade: 0x0a0d1c,
    ink: 4,
    rim: 0.3,
    step: 0.3,
    lights: 0.8,
    fragment: /* glsl */ `
      // granite blocks: staggered vertical joints on the risers, a worn pale nosing
      float row = floor(-vWorldPos.y / ${f(STEPS.rise)} + 0.01);
      float u = vWorldPos.x / 1.6 + hash11(row * 3.7) ;
      float fx = fract(u);
      float gx = fwidth(u);
      float joint = (1.0 - smoothstep(gx * 0.6, gx * 1.6 + 0.01, min(fx, 1.0 - fx))) * step(0.5, abs(n.z));
      float tone = hash12(vec2(floor(u), row));
      base *= 0.85 + 0.25 * tone; shade *= 0.85 + 0.3 * tone;
      base *= 1.0 - joint * 0.5; shade *= 1.0 - joint * 0.5;
      // the tread's front edge catches the light from the deck
      float nose = step(0.7, n.y) * smoothstep(0.9, 0.98, fract((vWorldPos.z - ${f(STEPS.z0)}) / ${f(STEPS.run)}));
      float lip = step(0.5, n.z) * smoothstep(0.035, 0.0, fract(-vWorldPos.y / ${f(STEPS.rise)} + 0.02));
      emis += vec3(0.3, 0.3, 0.42) * max(nose, lip) * 0.45;
      // warm light spilling down the top steps
      float spill = smoothstep(${f(STEPS.z0 + 3.0)}, ${f(STEPS.z0)}, vWorldPos.z);
      emis += vec3(0.5, 0.26, 0.2) * spill * 0.12 * (0.4 + 0.6 * step(0.7, n.y));`,
  });
  const im = new THREE.InstancedMesh(box, mat, n);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const top = stepY(i);
    const z0 = STEPS.z0 + i * STEPS.run;
    m.compose(new THREE.Vector3(0, top - 1.2, z0 + STEPS.run / 2 - 0.6), new THREE.Quaternion(), new THREE.Vector3(STEPS.half * 2, 1.2, STEPS.run + 1.2));
    im.setMatrixAt(i, m);
  }
  im.frustumCulled = false;
  im.renderOrder = 3;
  grp.add(im);

  // side walls (袖石) with a sloped top, and the plinth blocks the pillars stand on
  const z0 = STEPS.z0 - 0.3;
  const z1 = STEPS.z0 + n * STEPS.run;
  const y0 = 0.45;
  const y1 = stepY(n - 1) + 0.45;
  const wallParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const xi = s * (STEPS.half + 0.02);
    const xo = s * (STEPS.half + 1.1);
    const P = [
      [xi, y0, z0],
      [xi, y1, z1],
      [xo, y1, z1],
      [xo, y0, z0],
    ];
    const bot = -6;
    const v: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    const lo = (p: number[]) => [p[0], bot, p[2]];
    quad(P[0], P[1], P[2], P[3]); // top
    quad(lo(P[0]), lo(P[1]), P[1], P[0]); // inner face
    quad(P[3], P[2], lo(P[2]), lo(P[3])); // outer face
    quad(P[1], lo(P[1]), lo(P[2]), P[2]); // end face
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    // make faces point outward regardless of side
    if (s < 0) {
      const a = g.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < a.count; i += 3) {
        const x = a.getX(i + 1);
        const y = a.getY(i + 1);
        const z = a.getZ(i + 1);
        a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
        a.setXYZ(i + 2, x, y, z);
      }
    }
    g.computeVertexNormals();
    wallParts.push(g);
  }
  const walls = new THREE.Mesh(
    merge(wallParts),
    toonMaterial({
      color: 0x1a2034,
      shade: 0x0a0c1c,
      ink: 5,
      rim: 0.5,
      step: 0.25,
      lights: 0.8,
      fragment: /* glsl */ `
        float c = floor(vWorldPos.z / 1.1);
        float fz = fract(vWorldPos.z / 1.1);
        float gz = fwidth(vWorldPos.z / 1.1);
        float j = 1.0 - smoothstep(gz * 0.6, gz * 1.6 + 0.01, min(fz, 1.0 - fz));
        base *= (1.0 - j * 0.4) * (0.9 + 0.2 * hash11(c)); shade *= (1.0 - j * 0.4);`,
    }),
  );
  walls.renderOrder = 3;
  grp.add(walls);
  return grp;
}

/** Onion-shaped post cap (擬宝珠). */
function giboshi(r: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  const prof: [number, number][] = [
    [0.0, 0.0],
    [1.0, 0.0],
    [1.05, 0.12],
    [0.78, 0.2],
    [0.8, 0.3],
    [1.15, 0.5],
    [1.18, 0.7],
    [0.95, 0.95],
    [0.55, 1.15],
    [0.2, 1.35],
    [0.08, 1.5],
    [0.0, 1.55],
  ];
  for (const [x, y] of prof) pts.push(new THREE.Vector2(x * r, y * r));
  return new THREE.LatheGeometry(pts, 12);
}

/** The balustrade: posts, caps, three rails, and the little struts. */
function balustrade(): THREE.Object3D {
  const grp = new THREE.Group();
  const posts: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    for (let k = 0; k <= FRONT_SPANS; k++) posts.push(new THREE.Vector3(s * (RAIL_X0 + k * RAIL_SP), 0, RAIL.z));
    for (let k = 1; k <= SIDE_SPANS; k++) posts.push(new THREE.Vector3(s * RAIL.side, 0, RAIL.z + k * SIDE_SP));
  }
  const railMat = toonMaterial({
    color: VERMILION,
    shade: VERMILION_SHADE,
    ink: 6,
    rim: 0.9,
    step: 0.1,
    fragment: /* glsl */ `
      // lacquer: a hard highlight band, darker toward the floor
      emis += vec3(0.35, 0.08, 0.04) * smoothstep(0.6, 0.0, vWorldPos.y) * 0.25;`,
  });
  const postGeo = unitBox();
  postGeo.scale(0.2, RAIL.top + 0.08, 0.2);
  const pm = new THREE.InstancedMesh(postGeo, railMat, posts.length);
  const capGeo = giboshi(0.13);
  const capMat = toonMaterial({
    color: 0x3f4a44,
    shade: 0x10141c,
    ink: 7,
    rim: 1.2,
    step: 0.2,
    fragment: /* glsl */ `
      // patinated bronze with a gilt band
      float band = step(0.05, vUv.y) * step(vUv.y, 0.16);
      base = mix(base, vec3(0.95, 0.72, 0.32), band);
      shade = mix(shade, vec3(0.4, 0.26, 0.12), band);
      emis += vec3(1.0, 0.7, 0.3) * band * 0.25;`,
  });
  const cm = new THREE.InstancedMesh(capGeo, capMat, posts.length);
  const m = new THREE.Matrix4();
  posts.forEach((p, i) => {
    m.makeTranslation(p.x, 0, p.z);
    pm.setMatrixAt(i, m);
    m.makeTranslation(p.x, RAIL.top + 0.08, p.z);
    cm.setMatrixAt(i, m);
  });
  pm.frustumCulled = cm.frustumCulled = false;
  pm.renderOrder = cm.renderOrder = 4;
  grp.add(pm, cm);

  // rails as merged geometry along each run
  const parts: THREE.BufferGeometry[] = [];
  const run = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    const add = (g: THREE.BufferGeometry, y: number) => {
      g.rotateY(ang);
      g.translate(mid.x, y, mid.z);
      parts.push(g);
    };
    const top = new THREE.CylinderGeometry(0.06, 0.06, len + 0.2, 10);
    top.rotateX(Math.PI / 2);
    add(top, RAIL.top - 0.04);
    add(new THREE.BoxGeometry(0.09, 0.11, len), 0.58);
    add(new THREE.BoxGeometry(0.17, 0.17, len), 0.085);
    // struts (束) under the top rail at quarter spans
    const dir = b.clone().sub(a).normalize();
    const nS = Math.max(1, Math.round(len / RAIL.spacing));
    for (let k = 0; k < nS; k++) {
      for (const fr of [0.5]) {
        const p = a.clone().addScaledVector(dir, ((k + fr) / nS) * len);
        const s = new THREE.BoxGeometry(0.08, 0.38, 0.08);
        s.translate(p.x, 0.82, p.z);
        parts.push(s);
        const blk = new THREE.BoxGeometry(0.2, 0.08, 0.14);
        blk.rotateY(ang);
        blk.translate(p.x, RAIL.top - 0.13, p.z);
        parts.push(blk);
      }
    }
  };
  for (const s of [-1, 1]) {
    run(new THREE.Vector3(s * RAIL_X0, 0, RAIL.z), new THREE.Vector3(s * DECK.x1, 0, RAIL.z));
    run(new THREE.Vector3(s * RAIL.side, 0, RAIL.z), new THREE.Vector3(s * RAIL.side, 0, SIDE_Z1));
  }
  const rails = new THREE.Mesh(merge(parts), railMat);
  rails.renderOrder = 4;
  grp.add(rails);

  // small lanterns sitting on the top rail: a glowing paper box under a dark cap
  const rlBody = new THREE.BoxGeometry(0.17, 0.22, 0.17);
  const rlBodies = new THREE.InstancedMesh(
    rlBody,
    toonMaterial({
      color: 0x000000,
      shade: 0x000000,
      ink: 14,
      rim: 0,
      lights: 0,
      fog: 0.3,
      fragment: /* glsl */ `
        // paper panes in a thin wooden frame, flickering softly
        vec2 q = abs(vUv - 0.5) * 2.0;
        float frame = max(step(0.8, max(q.x, q.y)), step(q.x, 0.07));
        float fl = 0.88 + 0.12 * sin(uTime * 6.0 + vWorldPos.x * 3.0 + vWorldPos.z);
        float side = step(abs(n.y), 0.5);
        emis += side * mix(vec3(1.0, 0.66, 0.34) * 2.6 * fl * (1.1 - q.y * 0.3), vec3(0.06, 0.025, 0.02), frame);`,
    }),
    RAIL_LANTERNS.length,
  );
  const rlCapGeo = merge([
    (() => {
      const g = new THREE.CylinderGeometry(0.02, 0.15, 0.09, 4);
      g.rotateY(Math.PI / 4);
      g.translate(0, 0.155, 0);
      return g;
    })(),
    new THREE.BoxGeometry(0.2, 0.03, 0.2).translate(0, -0.125, 0),
  ]);
  const rlCaps = new THREE.InstancedMesh(rlCapGeo, capMat, RAIL_LANTERNS.length);
  RAIL_LANTERNS.forEach((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    rlBodies.setMatrixAt(i, m);
    rlCaps.setMatrixAt(i, m);
  });
  rlBodies.frustumCulled = rlCaps.frustumCulled = false;
  rlBodies.renderOrder = rlCaps.renderOrder = 4;
  grp.add(rlBodies, rlCaps);

  // the lower panels (腰板): dark boards with battens, glowing faintly at the seams
  const panelParts: THREE.BufferGeometry[] = [];
  const panelRun = (a: THREE.Vector3, b: THREE.Vector3) => {
    const len = a.distanceTo(b);
    const g = new THREE.BoxGeometry(0.035, 0.4, len);
    g.rotateY(Math.atan2(b.x - a.x, b.z - a.z));
    g.translate((a.x + b.x) / 2, 0.37, (a.z + b.z) / 2);
    panelParts.push(g);
  };
  for (const s of [-1, 1]) {
    panelRun(new THREE.Vector3(s * RAIL_X0, 0, RAIL.z), new THREE.Vector3(s * DECK.x1, 0, RAIL.z));
    panelRun(new THREE.Vector3(s * RAIL.side, 0, RAIL.z), new THREE.Vector3(s * RAIL.side, 0, SIDE_Z1));
  }
  const panels = new THREE.Mesh(
    merge(panelParts),
    toonMaterial({
      color: 0x3a2a36,
      shade: 0x160f1e,
      ink: 13,
      rim: 0.2,
      step: 0.1,
      lights: 0.6,
      fragment: /* glsl */ `
        float u = (abs(n.x) > 0.5 ? vWorldPos.z : vWorldPos.x) / 0.34;
        float bat = smoothstep(0.1, 0.0, abs(fract(u) - 0.5) - 0.38);
        base = mix(base, base * 1.5 + vec3(0.04, 0.01, 0.01), bat); shade = mix(shade, shade * 1.4, bat);`,
    }),
  );
  panels.renderOrder = 4;
  grp.add(panels);

  // the two newel posts (親柱) at the opening: round, lacquered, gilt fittings, big bronze giboshi
  const prof: [number, number][] = [
    [0.0, 0.0],
    [1.3, 0.0],
    [1.3, 0.1],
    [1.05, 0.12],
    [1.0, 0.2],
    [0.96, 0.9],
    [1.08, 0.92],
    [1.08, 0.97],
    [0.9, 1.0],
    [0.0, 1.0],
  ];
  const ng = new THREE.LatheGeometry(
    prof.map(([x, y]) => new THREE.Vector2(x * DRUM.r, y * DRUM.h)),
    28,
  );
  const newelMat = toonMaterial({
    color: VERMILION,
    shade: VERMILION_SHADE,
    ink: 8,
    rim: 1.1,
    step: 0.05,
    fragment: /* glsl */ `
      float yy = vWorldPos.y / ${f(DRUM.h)};
      // black-lacquered foot, gilt bands (金物) near the foot and the neck
      float foot = step(yy, 0.12);
      float band = step(0.12, yy) * step(yy, 0.2) + step(0.84, yy) * step(yy, 0.9);
      base = mix(base, vec3(0.08, 0.07, 0.1), foot); shade = mix(shade, vec3(0.03, 0.03, 0.06), foot);
      base = mix(base, vec3(0.92, 0.68, 0.32), band); shade = mix(shade, vec3(0.36, 0.2, 0.12), band);
      emis += vec3(1.0, 0.66, 0.3) * band * 0.25;`,
  });
  const newels: THREE.BufferGeometry[] = [];
  const bigCaps: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const d = ng.clone();
    d.translate(s * DRUM.x, 0, RAIL.z);
    newels.push(d);
    const c = giboshi(0.36);
    c.translate(s * DRUM.x, DRUM.h, RAIL.z);
    bigCaps.push(c);
  }
  const nm = new THREE.Mesh(merge(newels), newelMat);
  const bc = new THREE.Mesh(merge(bigCaps), capMat);
  nm.renderOrder = bc.renderOrder = 4;
  grp.add(nm, bc);

  // the stair going down through the opening toward the lower gate
  const stair: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const top = -(i + 1) * 0.2;
    const g = unitBox();
    g.scale(DRUM.x * 2 - 0.5, 1.0, 0.36 + 1.0);
    g.translate(0, top - 1.0, RAIL.z - 0.2 - i * 0.36 - 0.18 + 0.5);
    stair.push(g);
  }
  const sm = new THREE.Mesh(
    merge(stair),
    toonMaterial({ color: 0x3a3f5c, shade: 0x12152a, ink: 12, rim: 0.3, step: 0.3, emissive: 0x160a10 }),
  );
  sm.renderOrder = 4;
  grp.add(sm);
  return grp;
}

/** Kasuga-style stone lanterns; the fire box glows through its windows. */
function stoneLanterns(): THREE.Object3D {
  const parts: THREE.BufferGeometry[] = [];
  const hex = (rt: number, rb: number, h: number, y: number) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, 6);
    g.translate(0, y + h / 2, 0);
    parts.push(g);
  };
  hex(0.46, 0.5, 0.16, 0); // base
  hex(0.3, 0.42, 0.14, 0.16);
  const pole = new THREE.CylinderGeometry(0.11, 0.13, 0.8, 12);
  pole.translate(0, 0.3 + 0.4, 0);
  parts.push(pole);
  hex(0.38, 0.24, 0.16, 1.1); // middle platform
  hex(0.26, 0.26, 0.42, 1.26); // fire box (windows via shader)
  // umbrella roof with upturned corners
  const roof = new THREE.CylinderGeometry(0.1, 0.58, 0.3, 6);
  const pa = roof.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pa.count; i++) {
    const r = Math.hypot(pa.getX(i), pa.getZ(i));
    if (r > 0.5) pa.setY(i, pa.getY(i) + 0.07);
  }
  roof.computeVertexNormals();
  roof.translate(0, 1.68 + 0.15, 0);
  parts.push(roof);
  const knob = new THREE.SphereGeometry(0.12, 10, 8);
  knob.scale(1, 1.2, 1);
  knob.translate(0, 2.08, 0);
  parts.push(knob);
  hex(0.14, 0.18, 0.08, 1.98);
  const geo = merge(parts);
  const mat = toonMaterial({
    color: 0x6f7896,
    shade: 0x1f2440,
    ink: 9,
    rim: 1.0,
    step: 0.15,
    lights: 0.8,
    fragment: /* glsl */ `
      // the fire box windows (y 1.30…1.64 above the base)
      float yl = vWorldPos.y;
      float inBox = step(1.31, yl) * step(yl, 1.63);
      vec2 d = vWorldPos.xz - (vWorldPos.x < 0.0 ? vec2(${f(STONE_LANTERNS[0].x)}, ${f(STONE_LANTERNS[0].z)}) : vec2(${f(STONE_LANTERNS[1].x)}, ${f(STONE_LANTERNS[1].z)}));
      float a = atan(d.y, d.x) / 6.2832 * 6.0 + 0.5;
      float win = step(0.2, fract(a)) * step(fract(a), 0.8) * step(1.36, yl) * step(yl, 1.58);
      float moss = smoothstep(0.4, 0.8, vnoise(vWorldPos.xz * 9.0 + vWorldPos.y * 5.0)) * step(0.6, n.y);
      base = mix(base, vec3(0.3, 0.42, 0.34), moss * 0.6);
      base = mix(base, vec3(1.0, 0.7, 0.35), inBox * win);
      emis += vec3(1.0, 0.58, 0.24) * inBox * win * 5.5 * (0.9 + 0.1 * sin(uTime * 7.0 + vWorldPos.x));
      // glow licking the underside of the roof
      emis += vec3(0.8, 0.4, 0.18) * step(n.y, -0.3) * smoothstep(1.9, 1.7, yl) * step(1.6, yl) * 1.2;`,
  });
  const im = new THREE.InstancedMesh(geo, mat, STONE_LANTERNS.length);
  const m = new THREE.Matrix4();
  STONE_LANTERNS.forEach((p, i) => {
    m.makeTranslation(p.x, 0, p.z);
    im.setMatrixAt(i, m);
  });
  im.frustumCulled = false;
  im.renderOrder = 5;
  return im;
}

/** The roof of the lower gate, just past the opening between the drum posts. */
function lowerGate(): THREE.Object3D {
  const g = new THREE.Group();
  const body = unitBox();
  body.scale(7.2, 2.6, 3.6);
  body.translate(0, -3.4, RAIL.z - 5.2);
  const bm = new THREE.Mesh(
    body,
    toonMaterial({
      color: 0xa13a2e,
      shade: 0x3a1028,
      ink: 10,
      rim: 0.5,
      emissive: 0x401208,
    }),
  );
  const roof = hipRoof(5.0, 1.4, 1.9, 0.12, 0.25);
  roof.scale(1, 1, 0.62);
  roof.translate(0, -1.0, RAIL.z - 5.2);
  const rm = new THREE.Mesh(
    roof,
    toonMaterial({
      color: 0x3b4468,
      shade: 0x121634,
      ink: 11,
      rim: 1.2,
      step: 0.2,
      fragment: /* glsl */ `
        // tile rows down the slope and warm light under the eaves
        float rows = step(0.78, fract((vWorldPos.x) * 3.0));
        base *= 1.0 - rows * 0.2 * step(0.3, n.y); shade *= 1.0 - rows * 0.25 * step(0.3, n.y);
        emis += vec3(1.0, 0.5, 0.24) * smoothstep(-0.1, -0.6, n.y) * 1.6;
        emis += vec3(1.0, 0.72, 0.4) * step(abs(n.y), 0.3) * 0.9;`,
    }),
  );
  bm.renderOrder = rm.renderOrder = 6;
  g.add(bm, rm);
  return g;
}

export function buildStage(): THREE.Group {
  const g = new THREE.Group();
  g.add(deck(), steps(), balustrade(), stoneLanterns(), lowerGate());
  return g;
}
