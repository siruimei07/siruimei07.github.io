import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import type { Tier } from "./quality.ts";
import type { Part } from "./World.ts";

// The city of Tsukuyomi across the lake: a mountain town climbing to a
// castle on a flat summit, thousands of lit windows (amber, a little pink,
// a little teal), street lights strewn over the slopes, glowing cherry trees
// along the shore and a few searchlights. Everything is instanced or
// procedural; far-away detail averages out instead of shimmering.

const SHORE = 690; // distance of the far shore (world −z)

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Ground height of the city at (x, z).
export function cityHeight(x: number, z: number) {
  const d = -z;
  const rise = smooth(d, SHORE, 1500);
  const massif = 250 * Math.exp(-Math.pow(x / 470, 2)) * smooth(d, 880, 1420);
  const hills = (58 + 42 * Math.sin(x / 150 + 1.3) + 26 * Math.sin(x / 61 + 0.4)) * rise;
  let h = Math.max(massif, hills) + 10 * rise;
  h = Math.min(h, 236 + 5 * Math.sin(x / 37)); // the flat summit
  return h * smooth(d, SHORE - 30, SHORE + 30);
}

// How built-up the ground is (0..1): densest behind the gate, thinning out
// to the sides and toward the summit.
function density(x: number, z: number) {
  const d = -z;
  return Math.exp(-Math.pow(x / 780, 2)) * smooth(d, SHORE, SHORE + 40) * (1 - 0.6 * smooth(d, 1150, 1450));
}

// The city is the focal point: it takes a thinner haze than the rest.
const CITY_FOG = /* glsl */ `
  vec3 cityFog(vec3 col, vec3 w) {
    vec3 v = w - cameraPosition;
    float dist = length(v);
    float f = 1.0 - exp(-dist * uFogDensity * 0.4);
    return mix(col, fogTint(v / dist), f);
  }
`;

// GLSL twin of density() for the street-light field.
const DENSITY_GLSL = /* glsl */ `
  float cityDensity(vec3 w) {
    float d = -w.z;
    return exp(-pow(w.x / 780.0, 2.0)) * smoothstep(${SHORE.toFixed(1)}, ${(SHORE + 40).toFixed(1)}, d) * (1.0 - 0.6 * smoothstep(1150.0, 1450.0, d));
  }
`;

// Window lights: a grid on each wall. When a window cell shrinks below a pixel
// the pattern fades to its average so the far city twinkles instead of crawling.
const WINDOWS_GLSL = /* glsl */ `
  vec3 windows(vec2 f, float seed, float litP, float warm) {
    vec2 cell = floor(f);
    vec2 inC = fract(f);
    float h = hash12(cell + seed);
    float lit = step(1.0 - litP, h);
    float win = smoothstep(0.18, 0.26, inC.x) * smoothstep(0.82, 0.74, inC.x) * smoothstep(0.22, 0.3, inC.y) * smoothstep(0.8, 0.72, inC.y);
    float hc = fract(h * 13.7 + seed * 0.1);
    vec3 wc = hc < warm ? vec3(1.0, 0.6, 0.3) : hc < warm + 0.14 ? vec3(1.0, 0.4, 0.52) : vec3(0.3, 0.92, 0.86);
    vec3 sharp = wc * win * lit * (0.7 + 0.6 * fract(h * 71.3));
    vec3 avg = mix(vec3(0.3, 0.92, 0.86), vec3(1.0, 0.58, 0.34), warm) * 0.3 * litP;
    float px = max(fwidth(f.x), fwidth(f.y));
    return mix(sharp, avg, smoothstep(0.25, 0.75, px));
  }
`;

type Building = { x: number; y: number; z: number; rot: number; w: number; h: number; d: number; seed: number; roof: number; lit: number; warm: number };

function layoutCity(rnd: () => number, count: number): Building[] {
  const out: Building[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 40) {
    const x = (rnd() * 2 - 1) * 1500;
    const z = -(SHORE + 10 + Math.pow(rnd(), 1.4) * 760);
    if (rnd() > density(x, z)) continue;
    const y = cityHeight(x, z) - 1.5;
    const toCam = Math.atan2(-x, 60 - z);
    const center = Math.exp(-Math.pow(x / 300, 2)) * (1 - smooth(-z, 780, 1050));
    const tower = rnd() < 0.18 * center;
    const w = tower ? 12 + rnd() * 10 : 7 + rnd() * 11;
    const h = tower ? 30 + rnd() * 48 : 6 + rnd() * rnd() * 20;
    out.push({
      x,
      y,
      z,
      rot: toCam + (rnd() - 0.5) * 0.5,
      w,
      h,
      d: w * (0.7 + rnd() * 0.5),
      seed: rnd() * 100,
      roof: tower ? 0.25 : 1,
      lit: 0.32 + 0.3 * rnd(),
      warm: rnd() < 0.8 ? 0.82 : 0.55,
    });
  }
  // The castle keep on the summit: three receding tiers under broad roofs.
  const cz = -1352;
  const cy = cityHeight(0, cz) - 2;
  let y = cy;
  for (const [w, h, d] of [
    [62, 22, 44],
    [46, 17, 32],
    [30, 14, 22],
  ]) {
    out.push({ x: 0, y, z: cz, rot: 0, w, h, d, seed: 7 + y, roof: 0.55, lit: 0.55, warm: 0.9 });
    y += h + 7;
  }
  // Smaller pagodas on the shoulders of the mountain.
  for (const px of [-230, 260, -420]) {
    const pz = -1210 - Math.abs(px) * 0.1;
    let py = cityHeight(px, pz) - 2;
    for (let i = 0; i < 4; i++) {
      const s = 14 - i * 2.4;
      out.push({ x: px, y: py, z: pz, rot: 0.3, w: s, h: 6, d: s, seed: px + i, roof: 0.45, lit: 0.4, warm: 0.9 });
      py += 9;
    }
  }
  return out;
}

export function createCity(): Part {
  const rnd = mulberry32(77);
  const group = new THREE.Group();

  // ——— The mountain and its street lights ———
  const nx = 140;
  const nz = 44;
  const tPos: number[] = [];
  const tIdx: number[] = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = -2100 + (i / nx) * 4200;
      const z = -(SHORE - 40) - (j / nz) * 1150;
      tPos.push(x, cityHeight(x, z) - 0.5, z);
      if (i < nx && j < nz) {
        const a = j * (nx + 1) + i;
        tIdx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    }
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
  tGeo.setIndex(tIdx);
  tGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    tGeo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vNormal;
        void main() { vWorld = position; vNormal = normal; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        ${CITY_FOG}
        ${DENSITY_GLSL}
        varying vec3 vWorld; varying vec3 vNormal;
        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          float dens = cityDensity(vWorld);
          vec3 col = shadeSolid(vec3(0.012, 0.016, 0.024), N, V, 0.02);
          // The town lights the ground from below.
          col += vec3(0.5, 0.2, 0.14) * 0.05 * dens * exp(-max(vWorld.y, 0.0) / 90.0);
          // Street lights and lanterns: a random scatter, averaged when tiny.
          vec2 g = vWorld.xz / 6.5;
          vec2 cell = floor(g);
          float h = hash12(cell);
          vec2 off = vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5;
          float spot = smoothstep(0.26, 0.05, length(fract(g) - 0.5 - off * 0.5));
          float lit = step(h, dens * 0.42);
          vec3 lc = fract(h * 91.7) < 0.85 ? vec3(1.0, 0.62, 0.32) : vec3(1.0, 0.45, 0.55);
          float px = max(fwidth(g.x), fwidth(g.y));
          vec3 lights = mix(lc * spot * lit, vec3(1.0, 0.6, 0.36) * dens * 0.42 * 0.12, smoothstep(0.3, 0.9, px));
          float dist = length(vWorld - cameraPosition);
          col = cityFog(col, vWorld) + lights * 2.0 * (1.0 - 0.5 * uDusk) * exp(-dist * uFogDensity * 0.3);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  terrain.frustumCulled = false;

  // ——— Buildings and their roofs (instanced) ———
  const list = layoutCity(rnd, 2600);
  const n = list.length;
  const aPos = new Float32Array(n * 4);
  const aSize = new Float32Array(n * 4);
  const aInfo = new Float32Array(n * 4);
  list.forEach((b, i) => {
    aPos.set([b.x, b.y, b.z, b.rot], i * 4);
    aSize.set([b.w, b.h, b.d, b.seed], i * 4);
    aInfo.set([b.roof, b.lit, b.warm, 0], i * 4);
  });
  const vert = (roof: boolean) => /* glsl */ `
    attribute vec4 aPos; attribute vec4 aSize; attribute vec4 aInfo;
    varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec4 vSize; varying vec4 vInfo;
    void main() {
      float c = cos(aPos.w), s = sin(aPos.w);
      mat2 R = mat2(c, -s, s, c);
      vec3 sz = aSize.xyz;
      ${roof ? "sz = vec3(aSize.x * 1.32, max(aSize.x * 0.32, 3.0) * aInfo.x, aSize.z * 1.32);" : ""}
      vec3 p = position * sz;
      p.xz = R * p.xz;
      vec3 w = aPos.xyz + vec3(0.0, ${roof ? "aSize.y" : "0.0"}, 0.0) + p;
      vec3 nn = normal; nn.xz = R * nn.xz;
      vWorld = w; vNormal = nn; vLocal = position * sz; vSize = aSize; vInfo = aInfo;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }
  `;
  const frag = (roof: boolean) => /* glsl */ `
    ${COMMON}
    ${CITY_FOG}
    ${WINDOWS_GLSL}
    varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec4 vSize; varying vec4 vInfo;
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      float dist = length(vWorld - cameraPosition);
      float glowK = exp(-dist * uFogDensity * 0.3) * (1.0 - 0.45 * uDusk);
      ${
        roof
          ? `vec3 col = shadeSolid(vec3(0.01, 0.01, 0.015), N, V, 0.25) * 0.8;
      // Eaves catch the light of the street below.
      col += vec3(1.0, 0.5, 0.3) * 0.05 * smoothstep(0.0, -0.4, N.y);
      gl_FragColor = vec4(cityFog(col, vWorld), 1.0);`
          : `vec3 col = shadeSolid(vec3(0.012, 0.011, 0.016), N, V, 0.05) * 0.7;
      // Warm spill from the street, strongest low down.
      col += vec3(0.6, 0.24, 0.16) * 0.03 * exp(-max(vLocal.y, 0.0) / 10.0);
      vec3 emis = vec3(0.0);
      if (abs(N.y) < 0.5) {
        float u = abs(N.x) > abs(N.z) ? vLocal.z : vLocal.x;
        emis = windows(vec2(u, vLocal.y) / vec2(3.1, 3.5), vSize.w + N.x * 3.0 + N.z * 5.0, vInfo.y, vInfo.z);
        emis *= step(1.0, vLocal.y) * step(vLocal.y, vSize.y - 1.0);
      }
      col = cityFog(col, vWorld) + emis * 2.3 * glowK;
      gl_FragColor = vec4(col, 1.0);`
      }
    }
  `;
  const instanced = (base: THREE.BufferGeometry, roof: boolean) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index);
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("normal", base.attributes.normal);
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(aPos, 4));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(aSize, 4));
    g.setAttribute("aInfo", new THREE.InstancedBufferAttribute(aInfo, 4));
    g.instanceCount = n;
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: globals, vertexShader: vert(roof), fragmentShader: frag(roof) }));
    m.frustumCulled = false;
    return m;
  };
  const walls = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), false);
  const roofs = instanced(new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), true);

  // ——— Cherry trees in bloom, glowing pink in the town light ———
  const S = 2400;
  const sPos = new Float32Array(S * 3);
  const sSeed = new Float32Array(S);
  let k = 0;
  let guard = 0;
  while (k < S && guard++ < S * 60) {
    const x = (rnd() * 2 - 1) * 1300;
    const z = -(SHORE + 4 + Math.pow(rnd(), 2.2) * 620);
    // Clumps: groves along the shore and up the lower slopes.
    const clump = 0.5 + 0.5 * Math.sin(x / 47 + Math.sin(z / 33) * 2.0) * Math.sin(z / 29 + x / 91);
    if (rnd() > density(x, z) * clump * 1.4) continue;
    sPos.set([x, cityHeight(x, z) + 3 + rnd() * 6, z], k * 3);
    sSeed[k] = rnd();
    k++;
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos.subarray(0, k * 3), 3));
  sGeo.setAttribute("aSeed", new THREE.BufferAttribute(sSeed.subarray(0, k), 1));
  const sakura = new THREE.Points(
    sGeo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute float aSeed;
        varying float vK; varying float vSeed;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          float size = uPointScale * (11.0 + aSeed * 9.0) / max(dist, 1.0);
          gl_PointSize = clamp(size, 1.5, 90.0);
          vK = exp(-dist * uFogDensity * 0.3) * clamp(size / 3.0, 0.25, 1.0) * (1.0 - 0.4 * uDusk);
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vK; varying float vSeed;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r = length(q);
          float blossom = smoothstep(1.0, 0.35, r) * (0.55 + 0.45 * fbm(q * 0.9 + vSeed * 7.0));
          vec3 pink = mix(vec3(1.0, 0.36, 0.6), vec3(1.0, 0.52, 0.7), vSeed);
          gl_FragColor = vec4(pink * blossom * 0.4 * vK, 1.0);
        }
      `,
    }),
  );
  sakura.frustumCulled = false;
  sakura.renderOrder = 2;

  // ——— Searchlights sweeping slowly over the town ———
  const beams = new THREE.Group();
  const beamGeo = new THREE.CylinderGeometry(30, 5, 900, 24, 1, true).translate(0, 450, 0);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { ...globals, uColor: { value: new THREE.Color() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vH; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vH = position.y / 900.0;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform vec3 uColor;
      varying float vH; varying vec3 vN; varying vec3 vWorld;
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        float core = pow(abs(dot(normalize(vN), V)), 3.0);
        float fall = pow(1.0 - vH, 2.2) * smoothstep(0.0, 0.04, vH);
        gl_FragColor = vec4(uColor * core * fall * 0.035 * (1.0 - uDusk), 1.0);
      }
    `,
  });
  const beamSpec: [number, number, number, THREE.ColorRepresentation, number][] = [
    [-380, -900, 0.12, 0x9ff5ee, 0.0],
    [-150, -1000, -0.08, 0xffffff, 1.7],
    [210, -960, 0.1, 0xffc8e0, 3.1],
    [470, -880, -0.14, 0x9ff5ee, 4.4],
    [40, -1180, 0.05, 0xfff0d8, 2.2],
  ];
  const beamParts = beamSpec.map(([x, z, tilt, color, phase]) => {
    const m = beamMat.clone();
    m.uniforms = { ...globals, uColor: { value: new THREE.Color(color) } };
    const mesh = new THREE.Mesh(beamGeo, m);
    mesh.position.set(x, cityHeight(x, z), z);
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    beams.add(mesh);
    return { mesh, tilt, phase };
  });

  for (const m of [terrain, walls, roofs, sakura, beams]) {
    m.traverse((o) => o.layers.enable(REFLECT_LAYER));
    group.add(m);
  }
  let fullSakura = k;

  return {
    object: group,
    update(ctx) {
      for (const b of beamParts) {
        b.mesh.rotation.z = b.tilt + Math.sin(ctx.time * 0.11 + b.phase) * 0.12;
        b.mesh.rotation.x = Math.sin(ctx.time * 0.07 + b.phase * 1.3) * 0.08;
      }
    },
    setQuality(tier: Tier) {
      // Fewer blossoms on the smallest tier.
      fullSakura = k;
      sGeo.setDrawRange(0, tier.name === "LOW" ? Math.floor(fullSakura * 0.5) : fullSakura);
    },
  };
}
