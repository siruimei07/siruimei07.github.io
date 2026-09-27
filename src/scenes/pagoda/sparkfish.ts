import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";

// Great fish drawn in sparkling points, like the ones that swim round the
// airship in the film: an outline of glittering dots (body, forked tail,
// dorsal and pectoral fins, gill, eye), a lateral line and a haze of scale
// sparkles inside. Each fish swims along a closed route and its body bends
// with the route; the tail beats. One additive, depth-tested draw for all.

export type BigFish = { path: THREE.Vector3[]; length: number; speed: number; phase: number };

const N_PATH = 256;

const vert = /* glsl */ `
${common}
precision highp sampler2D;
uniform sampler2D tPaths;
uniform float uTime;
uniform float uPxAngle;
uniform vec4 uFish[4];     // length, speed / pathLength, phase, pathLength
attribute vec4 aPt;        // x (−0.5 tail … 0.5 head), y (up), z (side), kind
attribute vec3 aSeed;      // fish id, twinkle seed, size
varying vec2 vQ;
varying float vViewZ;
varying vec3 vCol;
varying float vB;
varying float vStar;

vec3 pathAt(float fish, float s) {
  float f = fract(s) * ${N_PATH.toFixed(1)};
  float i0 = floor(f);
  vec3 a = texelFetch(tPaths, ivec2(int(mod(i0, ${N_PATH.toFixed(1)})), int(fish)), 0).xyz;
  vec3 b = texelFetch(tPaths, ivec2(int(mod(i0 + 1.0, ${N_PATH.toFixed(1)})), int(fish)), 0).xyz;
  return mix(a, b, f - i0);
}

void main() {
  int id = int(aSeed.x);
  vec4 F = uFish[0];
  if (id == 1) F = uFish[1];
  if (id == 2) F = uFish[2];
  if (id == 3) F = uFish[3];
  float L = F.x;
  float s0 = F.z + uTime * F.y;
  // the body follows the route: each point sits at its own arc position
  float s = s0 + aPt.x * L / F.w;
  vec3 p0 = pathAt(aSeed.x, s);
  vec3 p1 = pathAt(aSeed.x, s + 2.0 / F.w);
  vec3 T = normalize(p1 - p0 + vec3(1e-5, 0.0, 0.0));
  vec3 up0 = abs(T.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 B = normalize(cross(T, up0));
  vec3 N = cross(B, T);
  // tail beat: sideways wave growing toward the tail
  float beat = sin(uTime * 2.2 - aPt.x * 7.0 + F.z * 20.0) * 0.07 * pow(0.5 - aPt.x, 1.6);
  vec3 wp = p0 + N * aPt.y * L + B * (aPt.z + beat) * L;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  float depth = max(-vp.z, 0.01);
  float kind = aPt.w;
  float star = step(0.985, fract(aSeed.y * 7.31)) * step(kind, 1.5);
  float size = L * (kind < 1.5 ? 0.0065 : 0.0045) * aSeed.z * (1.0 + star * 2.5);
  size = max(size, depth * uPxAngle * (kind < 1.5 ? 2.2 : 1.6) * (1.0 + star * 1.5));
  vp.xy += position.xy * size;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  vViewZ = depth;
  float tw = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * (2.0 + aSeed.y * 7.0) + aSeed.y * 60.0), 2.0);
  vec3 c = mix(vec3(0.75, 0.95, 1.0), vec3(0.9, 1.0, 0.55), step(0.82, fract(aSeed.y * 3.3)) * step(kind, 1.5));
  c = mix(c, vec3(1.0, 0.8, 0.95), step(0.95, fract(aSeed.y * 5.1)));
  vB = (kind < 0.5 ? 1.25 : kind < 1.5 ? 0.9 : kind < 2.5 ? 0.8 : 0.4) * tw;
  vCol = c;
  vStar = star;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
varying vec2 vQ;
varying float vViewZ;
varying vec3 vCol;
varying float vB;
varying float vStar;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float r = length(vQ);
  float a = exp(-r * r * 6.0) * 1.2 + exp(-r * r * 30.0) * 1.5;
  if (vStar > 0.5) {
    float cross = exp(-abs(vQ.x) * 20.0) * exp(-abs(vQ.y) * 1.8) + exp(-abs(vQ.y) * 20.0) * exp(-abs(vQ.x) * 1.8);
    a = cross * 1.4 + exp(-r * r * 25.0) * 2.0;
  }
  gl_FragColor = vec4(vCol * a * vB * vis * 1.6, 1.0);
}`;

/** Points of one fish in its own frame (x −0.5 tail … 0.5 head, y up, z side), kind in w. */
function fishPoints(rand: () => number, density: number): number[] {
  const pts: number[] = [];
  const push = (x: number, y: number, z: number, kind: number) => pts.push(x, y, z, kind);
  const h = (x: number) => (x < -0.32 ? 0.025 : 0.17 * Math.pow(Math.max(0, Math.sin((Math.PI * (x + 0.32)) / 0.84)), 0.62) + 0.02 * (1 - Math.min(1, (x + 0.32) * 5)));
  const k = density;
  // body outline (0)
  for (let i = 0; i < 150 * k; i++) {
    const x = -0.32 + (i / (150 * k)) * 0.82;
    push(x, h(x) + (rand() - 0.5) * 0.004, 0, 0);
    push(x, -h(x) * 0.92 + (rand() - 0.5) * 0.004, 0, 0);
  }
  // forked tail outline and rays (0 / 1)
  const tail: [number, number, number, number][] = [
    [-0.32, 0.025, -0.5, 0.2],
    [-0.5, 0.2, -0.41, 0.0],
    [-0.41, 0.0, -0.5, -0.19],
    [-0.5, -0.19, -0.32, -0.025],
  ];
  for (const [x0, y0, x1, y1] of tail)
    for (let i = 0; i < 30 * k; i++) {
      const t = rand();
      push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0, 0);
    }
  for (let r = 0; r < 6; r++) {
    const ty = -0.17 + (r / 5) * 0.34;
    for (let i = 0; i < 10 * k; i++) {
      const t = rand();
      push(-0.32 - t * 0.16, 0.02 * Math.sign(ty) + ty * t, 0, 1);
    }
  }
  // dorsal fin (1)
  for (let i = 0; i < 40 * k; i++) {
    const t = rand();
    const x = -0.08 + t * 0.3;
    const top = h(x) + 0.1 * Math.sin(Math.PI * Math.min(1, t * 1.3));
    push(x, top, 0, 1);
    if (i % 3 === 0) push(x, h(x) + (top - h(x)) * rand(), 0, 1);
  }
  // pectoral fins, both sides (1)
  for (const side of [-1, 1])
    for (let i = 0; i < 24 * k; i++) {
      const t = rand();
      const a = -0.6 - t * 0.9;
      push(0.2 + Math.cos(a) * 0.1 * rand(), -0.06 + Math.sin(a) * 0.12 * t, side * 0.05, 1);
    }
  // gill arc and eye (2)
  for (let i = 0; i < 24 * k; i++) {
    const a = -1.2 + (i / (24 * k)) * 2.4;
    push(0.3 + Math.cos(a) * 0.05 - 0.05, Math.sin(a) * 0.12, 0.03, 2);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    push(0.39 + Math.cos(a) * 0.018, 0.05 + Math.sin(a) * 0.018, 0.035, 2);
  }
  // lateral line (2)
  for (let i = 0; i < 40 * k; i++) {
    const x = -0.3 + (i / (40 * k)) * 0.6;
    push(x, 0.01 * Math.sin(x * 12), 0.04, 2);
  }
  // scale sparkles inside, a little thickness (3)
  for (let i = 0; i < 420 * k; i++) {
    const x = -0.32 + rand() * 0.8;
    const y = (rand() * 2 - 1) * h(x) * 0.9;
    push(x, y, (rand() * 2 - 1) * h(x) * 0.45, 3);
  }
  return pts;
}

export function buildSparkFish(fish: BigFish[], density: number) {
  const rand = rng(9090);
  const tex = new Float32Array(N_PATH * 4 * 4);
  const info: THREE.Vector4[] = [];
  fish.forEach((f, row) => {
    const curve = new THREE.CatmullRomCurve3(f.path, true, "centripetal");
    const pts = curve.getSpacedPoints(N_PATH).slice(0, N_PATH);
    pts.forEach((p, i) => tex.set([p.x, p.y, p.z, 1], (row * N_PATH + i) * 4));
    const len = curve.getLength();
    info.push(new THREE.Vector4(f.length, f.speed / len, f.phase, len));
  });
  while (info.length < 4) info.push(new THREE.Vector4(1, 0, 0, 1));
  const dt = new THREE.DataTexture(tex, N_PATH, 4, THREE.RGBAFormat, THREE.FloatType);
  dt.minFilter = dt.magFilter = THREE.NearestFilter;
  dt.needsUpdate = true;

  const all: number[] = [];
  const seeds: number[] = [];
  fish.forEach((_, id) => {
    const pts = fishPoints(rand, density);
    for (let i = 0; i < pts.length; i += 4) {
      all.push(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]);
      seeds.push(id, rand(), 0.7 + rand() * 0.6);
    }
  });
  const quad = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  g.setAttribute("aPt", new THREE.InstancedBufferAttribute(new Float32Array(all), 4));
  g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(new Float32Array(seeds), 3));
  g.instanceCount = all.length / 4;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...fxShared, tPaths: { value: dt }, uTime: env.uTime, uPxAngle: { value: 0.001 }, uFish: { value: info } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return {
    mesh,
    update(camera: THREE.PerspectiveCamera, heightPx: number) {
      mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
    },
  };
}
