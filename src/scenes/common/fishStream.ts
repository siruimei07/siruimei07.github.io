import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";

// Tsukuyomi's light-fish in world space: a school streaming along a looped
// 3D path — sardine-like glowing bodies with a forked tail and a sparkling
// trail, bunched into shoals, hidden behind buildings (depth-tested against
// the G-buffer). Additive; add `mesh` to a scene's `fx` and call update(t).

export type FishStreamOptions = {
  /** Control points of the route (world space). */
  path: THREE.Vector3[];
  closed?: boolean;
  count: number;
  /** Spread of the school around the route (m). */
  radius: number;
  /** 1 = round tube, 0 = flat ribbon. */
  flatten?: number;
  /** Fish length (m). */
  size: number;
  /** Swimming speed along the route (m/s). */
  speed: number;
  /** Body colours (they are picked per fish). */
  colors?: THREE.ColorRepresentation[];
  /** Overall brightness. */
  intensity?: number;
  /** 0 = evenly spread along the route, 1 = tight shoals with gaps. */
  shoals?: number;
  /** 0 … 1: length of the sparkle trail behind each fish. */
  trail?: number;
  /** Smallest drawn size in pixels (keeps far fish from flickering). */
  minPx?: number;
  seed?: number;
};

const vert = /* glsl */ `
${common}
precision highp float;
precision highp sampler2D;
uniform sampler2D tPath;
uniform float uN;
uniform float uLen;
uniform float uTime;
uniform float uSpeed;
uniform float uRadius;
uniform float uFlat;
uniform float uSize;
uniform float uShoals;
uniform float uTrail;
uniform float uMinPx;
uniform float uPxAngle;   // radians per pixel (vertical)
uniform vec3 uCols[4];
attribute vec4 aSeed;     // phase, angle, radial, speed jitter
attribute vec4 aSeed2;    // size jitter, colour pick, wobble phase, trail jitter
varying vec2 vQ;
varying float vViewZ;
varying vec3 vCol;
varying float vTrail;
varying float vSpark;

vec3 pathAt(float s) {
  float f = fract(s) * uN;
  float i0 = floor(f);
  float fr = f - i0;
  vec3 a = texelFetch(tPath, ivec2(int(mod(i0, uN)), 0), 0).xyz;
  vec3 b = texelFetch(tPath, ivec2(int(mod(i0 + 1.0, uN)), 0), 0).xyz;
  return mix(a, b, fr);
}

void main() {
  float sp = uSpeed * (0.88 + 0.24 * aSeed.w);
  // shoals: fish crowd toward a few moving centres along the route
  float s0 = aSeed.x + uTime * sp / uLen;
  float bunch = sin(s0 * TAU * 5.0 + aSeed.w * 2.0) * 0.035 * uShoals;
  float s = fract(s0 + bunch);
  vec3 p0 = pathAt(s);
  vec3 p1 = pathAt(s + 1.5 / uLen);
  vec3 T = normalize(p1 - p0 + vec3(1e-5, 0.0, 0.0));
  vec3 S = normalize(cross(T, vec3(0.0, 1.0, 0.0)) + vec3(0.0, 1e-5, 0.0));
  vec3 U = cross(S, T);
  float ang = aSeed.y * TAU + sin(uTime * 0.6 + aSeed.x * 23.0) * 0.35;
  float rad = uRadius * sqrt(aSeed.z) * (1.0 + 0.22 * sin(uTime * 0.8 + aSeed.x * 37.0));
  vec3 wp = p0 + (S * cos(ang) + U * sin(ang) * uFlat) * rad;
  // a little side-to-side swimming
  wp += S * sin(uTime * (5.0 + aSeed2.z * 3.0) + aSeed2.z * 40.0) * uSize * 0.12;

  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vec3 vt = mat3(viewMatrix) * T;
  vec2 along = normalize(vt.xy + vec2(1e-5, 0.0));
  vec2 perp = vec2(-along.y, along.x);
  float depth = max(-vp.z, 0.01);
  float size = uSize * (0.7 + 0.6 * aSeed2.x);
  size = max(size, depth * uPxAngle * uMinPx);
  // quad x: −1 tail … +1 head; the trail extends it backward
  float trail = uTrail * (0.6 + 0.8 * aSeed2.w);
  float x = position.x;
  float ext = x < 0.0 ? 1.0 + trail * 4.0 : 1.0;
  // foreshortening: a fish swimming at the camera stays a dot, not a needle
  float side = clamp(length(vt.xy), 0.25, 1.0);
  vp.xy += along * x * ext * size * side + perp * position.y * size * 0.36;
  gl_Position = projectionMatrix * vp;
  vQ = vec2(x * ext, position.y);
  vTrail = 1.0 + trail * 4.0;
  vViewZ = depth;
  int ci = int(floor(aSeed2.y * 3.999));
  vCol = ci == 0 ? uCols[0] : ci == 1 ? uCols[1] : ci == 2 ? uCols[2] : uCols[3];
  vSpark = aSeed.x * 91.0 + aSeed2.z * 17.0;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
uniform float uTime;
uniform float uIntensity;
varying vec2 vQ;
varying float vViewZ;
varying vec3 vCol;
varying float vTrail;
varying float vSpark;

void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  vec2 q = vQ;
  // body: a pointed ellipse; tail: a forked fan; trail: a fading dotted streak
  float wag = sin(q.x * 4.0 - uTime * 16.0 + vSpark) * 0.08 * (1.0 - q.x);
  q.y += wag;
  float body = length(vec2((q.x - 0.12) / 0.8, q.y / 0.36));
  float inBody = smoothstep(1.0, 0.82, body);
  float rim = smoothstep(0.62, 0.9, body) * inBody;
  float tx = clamp((-q.x - 0.45) / 0.5, 0.0, 1.0);
  float tail = step(-1.0, q.x) * step(q.x, -0.45) * step(abs(q.y), 0.1 + tx * 0.62) * step(tx * 0.3, abs(q.y) + 0.06);
  float a = max(inBody * 0.55 + rim * 0.9, tail * 0.6);
  if (q.x < -1.0) {
    float u = (-q.x - 1.0) / max(vTrail - 1.0, 1e-3);
    float dots = step(0.55, fract(q.x * 2.2 + vSpark)) * (0.6 + 0.4 * sin(uTime * 9.0 + vSpark + q.x * 3.0));
    a = exp(-abs(q.y) * 7.0) * (1.0 - u) * (1.0 - u) * (0.25 + 0.5 * dots);
  }
  float tw = 0.8 + 0.2 * sin(uTime * 3.0 + vSpark);
  vec3 col = vCol * a * tw + vec3(1.0) * rim * 0.6;
  gl_FragColor = vec4(col * uIntensity * vis, 1.0);
}`;

export class FishStream {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(o: FishStreamOptions) {
    const closed = o.closed ?? true;
    const curve = new THREE.CatmullRomCurve3(o.path, closed, "centripetal");
    const N = 256;
    const pts = curve.getSpacedPoints(closed ? N : N - 1).slice(0, N);
    const data = new Float32Array(N * 4);
    pts.forEach((p, i) => data.set([p.x, p.y, p.z, 1], i * 4));
    const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;

    let seed = o.seed ?? 7;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    const n = o.count;
    const a = new Float32Array(n * 4);
    const b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      a.set([rand(), rand(), rand(), rand()], i * 4);
      b.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(a, 4));
    g.setAttribute("aSeed2", new THREE.InstancedBufferAttribute(b, 4));
    g.instanceCount = n;

    const cols = (o.colors ?? [0xbff4ff, 0xe8fbff, 0x8fdcff, 0xffd6f0]).map((c) => new THREE.Color(c));
    while (cols.length < 4) cols.push(cols[cols.length % Math.max(1, cols.length)].clone());
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        ...fxShared,
        tPath: { value: tex },
        uN: { value: N },
        uLen: { value: curve.getLength() },
        uTime: env.uTime,
        uSpeed: { value: o.speed },
        uRadius: { value: o.radius },
        uFlat: { value: o.flatten ?? 1 },
        uSize: { value: o.size },
        uShoals: { value: o.shoals ?? 0.6 },
        uTrail: { value: o.trail ?? 0.5 },
        uMinPx: { value: o.minPx ?? 2.5 },
        uPxAngle: { value: 0.001 },
        uCols: { value: cols.slice(0, 4) },
        uIntensity: { value: o.intensity ?? 1.6 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  /** Call every frame (keeps the minimum pixel size right for the camera). */
  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    this.mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }

  set intensity(v: number) {
    this.mat.uniforms.uIntensity.value = v;
  }
}
