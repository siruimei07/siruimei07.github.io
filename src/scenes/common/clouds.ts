import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env } from "../../engine/toon";
import { rng } from "./util";

// Anime night clouds as camera-facing cards on a far dome: flat-bottomed
// cumulus built from bumps, three flat tones, and a hard silver lining on the
// edges that face the moon behind them. Opaque (alpha-to-coverage edges), so
// they hide the stars and the city hides them.

const vert = /* glsl */ `
attribute vec4 aCloud;   // azimuth, elevation (rad), width, height (rad)
attribute vec2 aSeed;    // seed, drift speed
uniform float uTime;
uniform float uDist;
varying vec2 vP;
varying vec4 vC;
varying vec2 vSeed;
varying float vViewZ;
varying vec3 vDir;
void main() {
  float az = aCloud.x + uTime * aSeed.y;
  float el = aCloud.y;
  vec3 dir = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  vec3 right = normalize(vec3(cos(az), 0.0, sin(az)));
  vec3 up = cross(right, dir) * -1.0;
  up = normalize(vec3(0.0, 1.0, 0.0) - dir * dir.y);
  vec3 wp = cameraPosition + dir * uDist + right * position.x * aCloud.z * uDist * 0.5 + up * (position.y + 0.5) * aCloud.w * uDist;
  vP = vec2(position.x, position.y + 0.5);
  vC = aCloud;
  vSeed = aSeed;
  vDir = dir;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const frag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform vec3 uMoonDir;
uniform vec3 uBody;
uniform vec3 uMid;
uniform vec3 uLining;
uniform vec3 uFront;
uniform float uTime;
varying vec2 vP;
varying vec4 vC;
varying vec2 vSeed;
varying float vViewZ;
varying vec3 vDir;

// One brushed band of cloud: a wavy centre line, a tapered thickness, a
// rounder top and a flatter base. Signed distance in card units.
float band(vec2 p, float A, float s, float fi) {
  float x0 = (hash11(s + fi * 3.1) - 0.5) * A * 0.5;
  float len = A * (0.55 + 0.4 * hash11(s * 1.9 + fi));
  float u = (p.x - x0) / len;
  float taper = 1.0 - u * u;
  if (taper <= 0.0) return 1.0;
  float yc = 0.5 + (hash11(s + fi * 7.7) - 0.5) * 0.35 + sin(p.x * 1.4 / A * 3.0 + s + fi) * 0.07;
  float th = (0.16 + 0.22 * hash11(s * 4.3 + fi)) * pow(taper, 0.6) * (0.65 + 0.7 * fbm2(vec2(p.x * 2.2 / A * 3.0 + s, fi), 3));
  float top = yc + th * (0.55 + 0.35 * vnoise(vec2(p.x * 9.0 + s, fi * 5.0)));
  float bot = yc - th * (0.38 + 0.12 * vnoise(vec2(p.x * 5.0 - s, fi * 3.0)));
  return max(p.y - top, bot - p.y);
}

float cloudSd(vec2 p, float A, float s) {
  float d = band(p, A, s, 0.0);
  d = min(d, band(p, A, s, 1.0));
  d = min(d, band(p, A, s, 2.0));
  return d + (fbm2(p * 9.0 + s * 10.0, 3) - 0.5) * 0.02;
}

void main() {
  float A = vC.z / vC.w * 0.5;
  vec2 p = vec2(vP.x * A, vP.y);
  float s = vSeed.x;
  float sd = cloudSd(p, A, s);
  float a = smoothstep(0.006, -0.006, sd);
  if (a < 0.02) discard;
  // 2D normal of the silhouette from screen-space derivatives (cards face the camera)
  vec2 nrm = normalize(vec2(dFdx(sd), dFdy(sd)) + 1e-6);
  vec3 right = normalize(vec3(-vDir.z, 0.0, vDir.x));
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) - vDir * vDir.y);
  vec2 L = normalize(vec2(dot(uMoonDir, right), dot(uMoonDir, up)) + 1e-4);
  float behind = saturate(dot(uMoonDir, vDir));
  float nearMoon = smoothstep(0.9, 0.997, behind);
  float facing = dot(nrm, L);
  // body: thin parts glow (the moon shines through), thick cores stay dark
  float depthIn = saturate(-sd / 0.12);
  vec3 col = mix(uMid, uBody, smoothstep(0.15, 0.8, depthIn));
  col = mix(col, uLining * 0.55 + uMid * 0.45, (1.0 - depthIn) * nearMoon * 0.5);
  // silver lining on the edges that face the moon
  float lw = 0.012 + nearMoon * 0.02;
  float lining = smoothstep(0.05, 0.35, facing) * smoothstep(-lw, -lw * 0.35, sd);
  col = mix(col, uLining, lining * (0.4 + 1.0 * nearMoon));
  col += uFront * (1.0 - behind) * 0.08;
  gl_FragColor = vec4(col, a);
  gAux = vec4(0.0, 0.0, vViewZ, 0.0);
}`;

/** One cloud: azimuth, elevation, width, height — all in degrees (azimuth 0 = −z). */
export type CloudSpec = [number, number, number, number];

export type CloudOptions = {
  list?: CloudSpec[];
  seed?: number;
  body?: THREE.ColorRepresentation;
  mid?: THREE.ColorRepresentation;
  lining?: THREE.ColorRepresentation;
  front?: THREE.ColorRepresentation;
  /** How fast they drift (deg/s scale). */
  drift?: number;
};

const DEFAULT_LIST: CloudSpec[] = [
  // streaks low over the far shore
  [-40, 0.6, 34, 3.0],
  [-12, 1.0, 20, 2.2],
  [28, 0.8, 30, 2.8],
  [56, 1.6, 26, 3.4],
  // one drifts across the lower part of the moon; a few higher up
  [2.0, 2.2, 20, 2.6],
  [22, 11, 18, 3.2],
  [44, 19, 24, 4.0],
  [-58, 17, 22, 4.2],
  [-30, 27, 26, 4.0],
];

export class Clouds {
  readonly mesh: THREE.Mesh;

  constructor(o: CloudOptions = {}) {
    const rand = rng(o.seed ?? 424242);
    const quad = new THREE.PlaneGeometry(2, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const deg = THREE.MathUtils.degToRad;
    const list = o.list ?? DEFAULT_LIST;
    const drift = o.drift ?? 1;
    const n = list.length;
    const cloud = new Float32Array(n * 4);
    const seed = new Float32Array(n * 2);
    list.forEach(([az, el, w, h], i) => {
      cloud.set([deg(az), deg(el), deg(w), deg(h)], i * 4);
      seed.set([rand() * 100, deg(0.03 + rand() * 0.05) * drift * (rand() < 0.5 ? -1 : 1)], i * 2);
    });
    g.setAttribute("aCloud", new THREE.InstancedBufferAttribute(cloud, 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 2));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: env.uTime,
        uMoonDir: env.uMoonDir,
        uDist: { value: 9000 },
        uBody: { value: new THREE.Color(o.body ?? 0x14307a) },
        uMid: { value: new THREE.Color(o.mid ?? 0x2c57b0) },
        uLining: { value: new THREE.Color(o.lining ?? 0xe2eeff) },
        uFront: { value: new THREE.Color(o.front ?? 0x3a5cad) },
      },
      transparent: false,
    });
    mat.alphaToCoverage = true;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -500;
  }
}
