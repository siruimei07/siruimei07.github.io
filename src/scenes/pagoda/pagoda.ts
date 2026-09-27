import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { catenary, GeoBuilder, tube } from "./geo";

// 五重塔 — the vermilion five-storey pagoda of the old town. Square storeys
// taper upward; each carries a curved hip roof whose eaves sweep up at the
// corners (反り), stacked three-step bracket sets (三手先), a railed balcony
// on the upper storeys, lattice doors and slatted windows, a red neon tube
// along every eave and a lantern at every corner. The bronze spire (相輪)
// holds nine rings, the water flame and the jewel; chains run down to the top
// roof's corners. Everything is baked into a handful of merged meshes.

export type PagodaResult = {
  group: THREE.Group;
  /** Corner lanterns (world space). */
  lanterns: THREE.Vector3[];
  /** World-space top of the spire (for fish routes). */
  top: THREE.Vector3;
  height: number;
  update(t: number): void;
};

type Storey = {
  k: number;
  b: number; // wall half-width
  E: number; // eave half-width (mid-side)
  yB: number; // floor
  yWT: number; // wall top
  yE: number; // eave bottom (mid-side)
  T: number; // fascia height
  yTop: number; // where the roof meets the storey above
  Htop: number;
  ySoffWall: number;
};

const PLAT = 1.5;
const LIFT = 0.95;
const BOW = 0.85;
const liftF = (u: number) => Math.pow(Math.abs(u), 3.2);
const bowF = (u: number) => Math.pow(Math.abs(u), 4);

function storeys(): Storey[] {
  const out: Storey[] = [];
  let yB = PLAT;
  for (let k = 0; k < 5; k++) {
    const b = 5.2 - 0.38 * k;
    const over = 3.75 - 0.1 * k;
    const hw = k === 0 ? 5.0 : 3.1;
    const yWT = yB + hw;
    const brk = 1.6;
    const purlinR = 2.16;
    const slope = 0.26;
    const next = yWT + 3.3;
    out.push({
      k,
      b,
      E: b + over,
      yB,
      yWT,
      yE: yWT + brk - (over - purlinR) * slope,
      T: 0.62,
      yTop: k < 4 ? next : yWT + 3.9,
      Htop: k < 4 ? 5.2 - 0.38 * (k + 1) + 1.05 : 1.3,
      ySoffWall: yWT + brk + purlinR * slope,
    });
    yB = next;
  }
  return out;
}

const side = (s: number) => {
  const th = (s * Math.PI) / 2;
  return { d: new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), t: new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)) };
};

/** A (nu+1)×(nv+1) grid; fn gives the point, the uv (metres along, across). */
function grid(nu: number, nv: number, fn: (u: number, v: number) => { p: THREE.Vector3; uv: [number, number] }, flip: boolean) {
  const pos: number[] = [];
  const uvs: number[] = [];
  for (let j = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++) {
      // denser toward the corners, where the eave sweeps up
      const x = -1 + (2 * i) / nu;
      const u = Math.sin((x * Math.PI) / 2);
      const r = fn(u, j / nv);
      pos.push(r.p.x, r.p.y, r.p.z);
      uvs.push(r.uv[0], r.uv[1]);
    }
  const idx: number[] = [];
  const w = nu + 1;
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * w + i;
      const b = a + 1;
      const c = a + w;
      const d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const I4 = new THREE.Matrix4();

// Warm light rising from the lantern-lit precinct and street below.
const upGlsl = /* glsl */ `
  float upl = uUp.z * exp(-max(vWorldPos.y - uUp.x, 0.0) / uUp.y);
  emis += uUpCol * base * upl * saturate(-n.y * 0.7 + 0.5);`;
const upHead = /* glsl */ `uniform vec3 uUpCol; uniform vec4 uUp;`;

export function buildPagoda(pos: THREE.Vector3, rot: number): PagodaResult {
  const S = storeys();
  const top = new GeoBuilder();
  const under = new GeoBuilder();
  const wood = new GeoBuilder();
  const walls = new GeoBuilder();
  const rails = new GeoBuilder();
  const neon = new GeoBuilder();
  const spire = new GeoBuilder();
  const stone = new GeoBuilder();
  const lanterns: THREE.Vector3[] = [];

  const VERM: [number, number, number] = [0.5, 0.05, 0.03];
  const VERM_D: [number, number, number] = [0.3, 0.03, 0.022];
  const BLOCK: [number, number, number] = [0.58, 0.1, 0.035];

  // stone platform with steps
  stone.box(0, PLAT / 2, 0, 2 * 7.6, PLAT, 2 * 7.6, 0, 0xffffff);
  for (let i = 0; i < 5; i++) stone.box(0, (PLAT * (i + 0.5)) / 5, 7.6 + 1.6 - i * 0.32, 3.4, PLAT * ((i + 1) / 5), 0.34, 0, 0xffffff);

  for (const st of S) {
    const { k, b, E, yB, yWT, yE, T, yTop, Htop, ySoffWall } = st;
    for (let s = 0; s < 4; s++) {
      const { d, t } = side(s);
      const outline = (H: number, C: number, L: number, y0: number, u: number) => {
        const f = H + C * bowF(u);
        return new THREE.Vector3().addScaledVector(d, f).addScaledVector(t, u * f).setY(y0 + L * liftF(u));
      };
      // roof top (tiles): eave top → the balcony / spire base above
      const gTop = grid(
        26,
        7,
        (u, v) => {
          const H = THREE.MathUtils.lerp(E + 0.05, Htop, v);
          const y = yE + T + (yTop - yE - T) * Math.pow(v, 1.35);
          const p = outline(H, BOW * (1 - v) * (1 - v), LIFT * Math.pow(1 - v, 2.2), y, u);
          return { p, uv: [u * H, v * (E - Htop)] };
        },
        true,
      );
      top.add(gTop, I4, 0xffffff, [0, k, s, 0]);
      // fascia: the thick eave edge with two rows of rafter ends
      const gFas = grid(
        26,
        1,
        (u, v) => {
          const p = outline(E + 0.05 * v, BOW, LIFT, yE + T * v, u);
          return { p, uv: [u * E, v] };
        },
        true,
      );
      under.add(gFas, I4, 0xffffff, [1, k, s, E]);
      // soffit: rafters rising from the eave to the wall
      const gSof = grid(
        26,
        4,
        (u, v) => {
          const H = THREE.MathUtils.lerp(E, b + 0.02, v);
          const y = THREE.MathUtils.lerp(yE, ySoffWall, v);
          const p = outline(H, BOW * (1 - v) * (1 - v), LIFT * (1 - v) * (1 - v), y, u);
          return { p, uv: [u * H, v * (E - b)] };
        },
        false,
      );
      under.add(gSof, I4, 0xffffff, [2, k, s, E]);

      // neon tube along the eave's lower edge
      const npts: THREE.Vector3[] = [];
      for (let i = 0; i <= 28; i++) {
        const x = -1 + (2 * i) / 28;
        const u = Math.sin((x * Math.PI) / 2);
        npts.push(outline(E + 0.1, BOW, LIFT, yE - 0.05, u));
      }
      neon.add(tube(npts, 0.075, 5), I4, 0xffffff, [0, k, s, 0]);
      // corner lantern hangs under the up-swept tip
      const tip = outline(E - 0.15, BOW, LIFT, yE, 1);
      lanterns.push(tip.clone().setY(tip.y - 0.75));

      // walls: recessed infill between the columns (shader draws doors / windows)
      const wg = new THREE.PlaneGeometry(2 * b, yWT - yB);
      const wm = new THREE.Matrix4().makeBasis(t.clone(), new THREE.Vector3(0, 1, 0), d.clone());
      wm.setPosition(d.clone().multiplyScalar(b - 0.1).setY((yB + yWT) / 2));
      walls.add(wg, wm, 0xffffff, [k, s, b, yWT - yB]);

      // columns (corners shared: one per side at u = −1) and the ±1/3 posts
      for (const u of [-1, -1 / 3, 1 / 3]) {
        const c = d.clone().multiplyScalar(b).addScaledVector(t, u * b);
        wood.box(c.x, (yB + yWT) / 2, c.z, 0.52, yWT - yB, 0.52, (s * Math.PI) / 2, VERM);
      }
      // tie beams: sill, head (and a middle rail on the tall first storey)
      const beamYs = k === 0 ? [yB + 0.18, yWT - 0.2, yB + (yWT - yB) * 0.58] : [yB + 0.14, yWT - 0.2];
      for (const y of beamYs) {
        const c = d.clone().multiplyScalar(b + 0.08);
        wood.box(c.x, y, c.z, 0.36, y === yWT - 0.2 ? 0.4 : 0.26, 2 * b + 0.52, (s * Math.PI) / 2, VERM);
      }

      // bracket sets (三手先) on the two inner columns and the corner
      const armBox = (base: THREE.Vector3, dir: THREE.Vector3, r0: number, r1: number, y: number, w: number, h: number, col: [number, number, number]) => {
        const a = base.clone().addScaledVector(dir, r0).setY(y);
        const e = base.clone().addScaledVector(dir, r1).setY(y);
        wood.beam(a, e, w, h, col);
      };
      const tierY = (i: number) => yWT + 0.3 + i * 0.34;
      for (const u of [-1 / 3, 1 / 3]) {
        const wpt = d.clone().multiplyScalar(b).addScaledVector(t, u * b);
        wood.box(wpt.x, yWT + 0.15, wpt.z, 0.64, 0.3, 0.64, (s * Math.PI) / 2, BLOCK);
        for (let i = 0; i < 3; i++) {
          const y = tierY(i) + 0.13;
          armBox(wpt, d, -0.3, 0.72 * (i + 1), y, 0.26, 0.26, i % 2 ? VERM_D : VERM);
          const tipP = wpt.clone().addScaledVector(d, 0.72 * (i + 1) - 0.12);
          wood.box(tipP.x, tierY(i) + 0.3, tipP.z, 0.36, 0.1, 0.36, (s * Math.PI) / 2, BLOCK);
          // lateral arm across the tip
          const la = tipP.clone().addScaledVector(t, -0.78).setY(y);
          const lb = tipP.clone().addScaledVector(t, 0.78).setY(y);
          wood.beam(la, lb, 0.22, 0.24, i % 2 ? VERM : VERM_D);
        }
      }
      // small blocks between the sets (間斗束)
      for (const u of [-2 / 3, 0, 2 / 3]) {
        const wpt = d.clone().multiplyScalar(b + 0.05).addScaledVector(t, u * b);
        wood.box(wpt.x, yWT + 0.45, wpt.z, 0.3, 0.6, 0.3, (s * Math.PI) / 2, VERM_D);
      }
      // corner set: arms along both sides' normals and the diagonal
      const corner = d.clone().multiplyScalar(b).addScaledVector(t, -b);
      const diag = d.clone().sub(t).normalize();
      const dPrev = t.clone().negate();
      wood.box(corner.x, yWT + 0.15, corner.z, 0.7, 0.3, 0.7, (s * Math.PI) / 2, BLOCK);
      for (let i = 0; i < 3; i++) {
        const y = tierY(i) + 0.13;
        armBox(corner, diag, -0.3, 0.72 * (i + 1) * 1.38, y, 0.28, 0.26, VERM);
        armBox(corner, d, -0.3, 0.72 * (i + 1), y, 0.24, 0.24, VERM_D);
        armBox(corner, dPrev, -0.3, 0.72 * (i + 1), y, 0.24, 0.24, VERM_D);
        const tipP = corner.clone().addScaledVector(diag, 0.72 * (i + 1) * 1.38 - 0.14);
        wood.box(tipP.x, tierY(i) + 0.3, tipP.z, 0.4, 0.1, 0.4, (s * Math.PI) / 2 + Math.PI / 4, BLOCK);
      }
      // eave purlin resting on the top tier
      {
        const c = d.clone().multiplyScalar(b + 2.16);
        wood.box(c.x, yWT + 1.46, c.z, 0.3, 0.28, 2 * (b + 2.16), (s * Math.PI) / 2, VERM_D);
        const c2 = d.clone().multiplyScalar(b + 1.44);
        wood.box(c2.x, yWT + 1.12, c2.z, 0.26, 0.24, 2 * (b + 1.44), (s * Math.PI) / 2, VERM);
      }

      // balcony with railing (upper storeys)
      if (k > 0) {
        const R = b + 1.05;
        const fc = d.clone().multiplyScalar(b + 0.52);
        wood.box(fc.x, yB - 0.13, fc.z, 1.05, 0.26, 2 * R, (s * Math.PI) / 2, VERM_D);
        const rr = b + 0.95;
        const n = Math.round((2 * rr) / 0.95);
        for (let i = 0; i <= n; i++) {
          const u = -1 + (2 * i) / n;
          const c = d.clone().multiplyScalar(rr).addScaledVector(t, u * rr);
          const tall = i === 0 || i === n;
          wood.box(c.x, yB + (tall ? 0.55 : 0.47), c.z, 0.12, tall ? 1.1 : 0.94, 0.12, (s * Math.PI) / 2, VERM);
        }
        for (const [y, h] of [
          [yB + 0.9, 0.1],
          [yB + 0.56, 0.08],
          [yB + 0.12, 0.1],
        ] as const) {
          const c = d.clone().multiplyScalar(rr);
          wood.box(c.x, y, c.z, 0.13, h, 2 * rr + 0.1, (s * Math.PI) / 2, VERM);
        }
        const pg = new THREE.PlaneGeometry(2 * rr, 0.38);
        const pm = new THREE.Matrix4().makeBasis(t.clone(), new THREE.Vector3(0, 1, 0), d.clone());
        pm.setPosition(d.clone().multiplyScalar(rr).setY(yB + 0.34));
        rails.add(pg, pm, 0xffffff, [k, s, rr, 0]);
      }
    }
  }

  // ---- spire (相輪)
  const T5 = S[4];
  const y0 = T5.yTop;
  const lathe = (pts: [number, number][], segs = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  const at = (y: number) => new THREE.Matrix4().makeTranslation(0, y, 0);
  const BRONZE: [number, number, number] = [0.42, 0.26, 0.1];
  const GOLD: [number, number, number] = [0.85, 0.55, 0.18];
  spire.box(0, y0 + 0.45, 0, 2.5, 0.9, 2.5, 0, BRONZE); // 露盤
  spire.add(lathe([[0.0, 0.0], [1.2, 0.0], [1.15, 0.35], [0.95, 0.7], [0.55, 0.95], [0.0, 1.02]]), at(y0 + 0.9), BRONZE); // 伏鉢
  spire.add(lathe([[0.25, 0.0], [0.6, 0.12], [1.0, 0.38], [1.05, 0.5], [0.3, 0.5]]), at(y0 + 1.85), GOLD); // 請花
  spire.add(new THREE.CylinderGeometry(0.17, 0.2, 10.4, 10), at(y0 + 1.9 + 5.2), BRONZE);
  for (let i = 0; i < 9; i++) {
    const R = 1.02 - 0.04 * i;
    const g = new THREE.TorusGeometry(R, 0.12, 6, 24).rotateX(Math.PI / 2);
    spire.add(g, at(y0 + 2.8 + i * 0.62), i % 2 ? BRONZE : GOLD);
    spire.add(new THREE.CylinderGeometry(R * 0.35, R * 0.35, 0.06, 10), at(y0 + 2.8 + i * 0.62), BRONZE);
  }
  // water flame (水煙): two crossed flame plates
  const flame = new THREE.Shape();
  flame.moveTo(0, 0);
  flame.bezierCurveTo(0.9, 0.1, 0.95, 0.7, 0.55, 1.0);
  flame.bezierCurveTo(0.85, 1.2, 0.6, 1.6, 0.2, 1.75);
  flame.bezierCurveTo(0.35, 1.45, 0.1, 1.3, 0.0, 1.9);
  flame.bezierCurveTo(-0.1, 1.3, -0.35, 1.45, -0.2, 1.75);
  flame.bezierCurveTo(-0.6, 1.6, -0.85, 1.2, -0.55, 1.0);
  flame.bezierCurveTo(-0.95, 0.7, -0.9, 0.1, 0, 0);
  const fg = new THREE.ExtrudeGeometry(flame, { depth: 0.08, bevelEnabled: false, curveSegments: 6 });
  fg.translate(0, 0, -0.04);
  spire.add(fg, at(y0 + 8.45), GOLD);
  spire.add(fg, at(y0 + 8.45).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), GOLD);
  spire.add(new THREE.SphereGeometry(0.3, 12, 8), at(y0 + 10.55), GOLD); // 竜車
  spire.add(lathe([[0.0, 0.0], [0.26, 0.08], [0.34, 0.3], [0.22, 0.55], [0.0, 0.85]]), at(y0 + 10.8), GOLD); // 宝珠
  // chains to the top roof's corners
  const chainTop = new THREE.Vector3(0, y0 + 7.9, 0);
  for (let s = 0; s < 4; s++) {
    const { d, t } = side(s);
    const f = T5.E + BOW - 0.3;
    const c = d.clone().multiplyScalar(f).addScaledVector(t, f).setY(T5.yE + T5.T + LIFT - 0.1);
    spire.add(tube(catenary(chainTop, c, 0.55, 14), 0.045, 4), I4, BRONZE);
  }
  const height = y0 + 11.7;

  // ---- materials
  const up = { uUpCol: { value: new THREE.Color(1.0, 0.52, 0.26) }, uUp: { value: new THREE.Vector4(0, 12, 0.55, 0) } };
  const matTop = toonMaterial({
    color: 0x3b4660,
    shade: 0x0d1226,
    ink: 21,
    rim: 1.0,
    step: 0.2,
    uniforms: up,
    fragmentHead: upHead,
    fragment: /* glsl */ `
      // round-tile channels running down the slope, a pale ridge line on the hips
      float ch = abs(fract(vUv.x / 0.34) - 0.5);
      float line = smoothstep(0.05, 0.16, ch);
      base *= 0.72 + 0.28 * line; shade *= 0.8 + 0.2 * line;
      ${upGlsl}`,
  });
  const matUnder = toonMaterial({
    color: 0xffffff,
    shade: 0xffffff,
    ink: 22,
    rim: 0.5,
    step: 0.1,
    uniforms: up,
    vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart;`,
    vertex: /* glsl */ `vPart = aPart;`,
    fragmentHead: /* glsl */ `varying vec4 vPart; ${upHead}`,
    fragment: /* glsl */ `
      vec3 dark = vec3(0.022, 0.004, 0.004);
      vec3 red = vec3(0.3, 0.018, 0.009);
      if (vPart.x < 1.5) {
        // fascia: two rows of rafter ends (white-tipped 木口) on dark red
        float u = vUv.x;
        float row = vUv.y < 0.5 ? 0.0 : 1.0;
        float fy = fract(vUv.y * 2.0);
        float cell = fract(u / (row < 0.5 ? 0.42 : 0.38) + row * 0.5);
        float dotm = step(0.28, cell) * step(cell, 0.72) * step(0.22, fy) * step(fy, 0.8);
        float px = fwidth(u / 0.4);
        dotm = mix(dotm, 0.2, smoothstep(0.35, 0.8, px));
        vec3 c = mix(red * 0.5, vec3(0.8, 0.62, 0.3), dotm);
        base = c; shade = c * vec3(0.55, 0.5, 0.62);
        emis += vec3(1.0, 0.7, 0.4) * dotm * 0.05;
      } else {
        // soffit: rafters over dark boards, the purlin line
        float u = vUv.x;
        float r = abs(fract(u / 0.42) - 0.5);
        float raft = smoothstep(0.2, 0.14, r);
        float px = fwidth(u / 0.42);
        raft = mix(raft, 0.45, smoothstep(0.3, 0.7, px));
        vec3 c = mix(dark, red, raft);
        float purl = smoothstep(0.1, 0.0, abs(vUv.y - 1.55));
        c = mix(c, red * 1.1, purl);
        base = c; shade = c;
      }
      ${upGlsl}`,
  });
  const matWood = toonMaterial({
    color: 0xffffff,
    shade: 0x5a4a78,
    ink: 23,
    rim: 0.9,
    step: 0.12,
    vertexColors: true,
    uniforms: up,
    fragmentHead: upHead,
    fragment: upGlsl,
  });
  const matWall = toonMaterial({
    color: 0xffffff,
    shade: 0xffffff,
    ink: 24,
    rim: 0.4,
    step: 0.1,
    uniforms: up,
    vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart;`,
    vertex: /* glsl */ `vPart = aPart;`,
    fragmentHead: /* glsl */ `varying vec4 vPart; ${upHead}`,
    fragment: /* glsl */ `
      // uv: x along the wall (0 … 2b), y up (0 … hw)
      float b = vPart.z;
      float hw = vPart.w;
      float x = (vUv.x - 0.5) * 2.0 * b;
      float y = vUv.y * hw;
      float bay = floor((x / b + 1.0) * 1.5);           // 0, 1, 2
      float bx = fract((x / b + 1.0) * 1.5);            // 0 … 1 in the bay
      vec3 plaster = vec3(0.13, 0.01, 0.007);
      vec3 red = vec3(0.4, 0.02, 0.01);
      vec3 interior = vec3(0.008, 0.002, 0.002);
      vec3 c = plaster;
      float glow = 0.0;
      float openTop = hw - 0.75;
      if (y > 0.3 && y < openTop) {
        if (bay == 1.0) {
          // lattice doors (格子戸), warm light behind
          float gx = abs(fract(x / 0.23) - 0.5);
          float gy = abs(fract(y / 0.23) - 0.5);
          float lat = max(smoothstep(0.3, 0.38, gx), smoothstep(0.3, 0.38, gy));
          float frame = step(abs(bx - 0.5), 0.46);
          c = mix(interior, red, lat);
          glow = (1.0 - lat) * frame;
          c = mix(red * 0.8, c, frame);
        } else {
          // slatted windows (連子窓) in the upper part, red boards below
          float win = step(y, openTop - 0.1) * step(openTop - 0.1 - min(1.8, hw * 0.45), y) * step(abs(bx - 0.5), 0.34);
          float sl = smoothstep(0.26, 0.4, abs(fract(x / 0.16) - 0.5));
          c = mix(red * 0.85, mix(interior, red * 1.05, sl), win);
          glow = win * (1.0 - sl) * 0.5;
          // carved filigree on the boards, glowing faintly red (as in the film)
          float fil = abs(sin(x * 5.3 + sin(y * 4.1 + bay) * 1.7) * cos(y * 5.9 + sin(x * 3.7) * 1.3));
          float fl = smoothstep(0.12, 0.0, fil) * (1.0 - win) * step(0.12, bx) * step(bx, 0.88);
          c = mix(c, red * 1.4, fl);
          emis += vec3(1.0, 0.04, 0.03) * fl * 0.35;
        }
      }
      float px = fwidth(x / 0.23);
      c = mix(c, mix(red * 0.6, plaster * 0.5, 0.3), smoothstep(0.5, 1.2, px) * 0.6);
      base = c; shade = c * vec3(0.5, 0.45, 0.6);
      float flick = 0.9 + 0.1 * sin(uTime * 2.3 + vPart.x * 3.0 + vPart.y);
      emis += vec3(1.0, 0.32, 0.07) * glow * (vPart.x < 0.5 ? 1.5 : 0.9) * flick;
      ${upGlsl}`,
  });
  const matRail = toonMaterial({
    color: 0xffffff,
    shade: 0xffffff,
    ink: 25,
    rim: 0.6,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    uniforms: up,
    vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart;`,
    vertex: /* glsl */ `vPart = aPart;`,
    fragmentHead: /* glsl */ `varying vec4 vPart; ${upHead}`,
    fragment: /* glsl */ `
      // 卍-ish lattice (組子): diagonal cross grid, open gaps
      float x = vUv.x * 2.0 * vPart.z;
      float y = vUv.y * 0.38;
      vec2 q = vec2(x + y, x - y) / 0.19;
      vec2 g = abs(fract(q) - 0.5);
      float bar = max(smoothstep(0.34, 0.42, g.x), smoothstep(0.34, 0.42, g.y));
      float edge = step(0.9, vUv.y) + step(vUv.y, 0.1);
      alpha = max(bar, edge);
      if (alpha < 0.5) discard;
      vec3 red = vec3(0.5, 0.03, 0.012);
      base = red; shade = red * vec3(0.45, 0.4, 0.55);
      ${upGlsl}`,
  });
  const matNeon = toonMaterial({
    color: 0x000000,
    shade: 0x000000,
    ink: 0,
    rim: 0,
    lights: 0,
    fog: 0.25,
    vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart;`,
    vertex: /* glsl */ `vPart = aPart;`,
    fragmentHead: /* glsl */ `varying vec4 vPart;`,
    fragment: /* glsl */ `
      // neon: a hot core, gentle hum, a chase of brighter pulses
      float chase = 0.8 + 0.2 * sin(vUv.x * 40.0 - uTime * 3.0 + vPart.y * 1.7);
      float hum = 0.93 + 0.07 * sin(uTime * 47.0 + vPart.y);
      vec3 neon = vec3(1.0, 0.1, 0.16);
      float core = pow(saturate(dot(n, normalize(cameraPosition - vWorldPos))), 0.6);
      emis = (neon * 3.4 + vec3(1.0, 0.6, 0.6) * core * 1.6) * chase * hum;
      base = vec3(0.0); shade = vec3(0.0);`,
  });
  const matSpire = toonMaterial({
    color: 0xffffff,
    shade: 0x3a3048,
    ink: 26,
    rim: 1.0,
    step: 0.1,
    vertexColors: true,
    uniforms: up,
    fragmentHead: upHead,
    fragment: /* glsl */ `
      // a warm gleam where the gold faces the lanterns below
      float gl = pow(saturate(-n.y * 0.5 + 0.5), 3.0);
      emis += vec3(1.0, 0.65, 0.3) * base * gl * 0.18;
      ${upGlsl}`,
  });
  const matStone = toonMaterial({ color: 0x8c8a96, shade: 0x262a44, ink: 27, rim: 0.4, uniforms: up, fragmentHead: upHead, fragment: upGlsl });

  const group = new THREE.Group();
  const mk = (b: GeoBuilder, m: THREE.Material, part = false) => {
    const mesh = new THREE.Mesh(b.build(part), m);
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  mk(top, matTop, true);
  mk(under, matUnder, true);
  mk(wood, matWood);
  mk(walls, matWall, true);
  mk(rails, matRail, true);
  mk(neon, matNeon, true);
  mk(spire, matSpire);
  mk(stone, matStone);

  group.position.copy(pos);
  group.rotation.y = rot;
  group.updateMatrixWorld(true);
  const worldLanterns = lanterns.map((p) => p.applyMatrix4(group.matrixWorld));
  up.uUp.value.x = pos.y;

  return {
    group,
    lanterns: worldLanterns,
    top: new THREE.Vector3(0, height, 0).applyMatrix4(group.matrixWorld),
    height,
    update() {},
  };
}
