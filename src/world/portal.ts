import * as THREE from "three";
import { FullscreenPass, passMaterial } from "../engine/fsq";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// The light-water membrane that fills a torii's opening (进入鸟居.mov):
// a sheet of teal light with a caustic network, vertical flowing streaks,
// ripple rings spreading from where it is touched, a bright rim and rising
// sparkles. Used on the small torii in World A and on the great gate in B.

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const causticGLSL = /* glsl */ `
// Cheap animated caustic network (iterated domain warp of a sine lattice).
float caustic(vec2 p, float t) {
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
`;

const frag = /* glsl */ `
${common}
${causticGLSL}
uniform float uTime;
uniform float uIntensity;
uniform vec2 uSize;       // metres (w, h)
uniform vec4 uRipple;     // uv centre, start time, strength
uniform float uFlow;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec2 uv = vUv;
  vec2 m = uv * uSize; // metres
  float t = uTime;
  // Ripple rings from the touch point.
  float age = t - uRipple.z;
  vec2 rc = (uv - uRipple.xy) * uSize;
  float rr = length(rc);
  float ring = 0.0;
  if (age > 0.0 && age < 4.0) {
    for (int k = 0; k < 3; k++) {
      float front = (age - float(k) * 0.35) * 5.5;
      if (front <= 0.0) continue;
      float d = rr - front;
      ring += exp(-d * d * 6.0) * exp(-age * 0.8) * uRipple.w;
    }
  }
  vec2 warp = rr > 0.0 ? rc / rr * ring * 0.25 : vec2(0.0);
  float c = caustic((m + warp) * 0.42 + vec2(0.0, t * 0.15), t * 0.55);
  float c2 = caustic((m + warp) * 0.9 + vec2(3.0, t * 0.3), t * 0.8 + 2.0);
  // Vertical streaks of light flowing down.
  float streak = pow(vnoise(vec2(m.x * 3.2, m.y * 0.12 + t * uFlow)), 3.0) * 0.9;
  streak += pow(vnoise(vec2(m.x * 9.0 + 5.0, m.y * 0.25 + t * uFlow * 1.6)), 6.0) * 1.2;
  // Sparkles drifting up.
  vec2 sp = vec2(m.x * 2.2, m.y * 2.2 - t * 1.2);
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  vec2 hsh = hash22(cell);
  float spark = step(0.86, hsh.x) * exp(-dot(f - (hsh - 0.5) * 0.6, f - (hsh - 0.5) * 0.6) * 60.0) * (0.5 + 0.5 * sin(t * 6.0 + hsh.y * 40.0));
  // Edge glow (brighter rim, fading inward).
  vec2 e = min(uv, 1.0 - uv) * uSize;
  float edge = exp(-min(e.x, e.y) * 1.1);
  float base = 0.35 + 0.65 * smoothstep(0.0, 1.0, uv.y) * 0.4;
  vec3 teal = vec3(0.1, 0.95, 0.82);
  vec3 col = teal * (0.22 + c * 0.9 + c2 * 0.35 + streak * 0.45 + ring * 1.6) * base;
  col += vec3(0.75, 1.0, 0.95) * (spark * 2.5 + edge * 1.4);
  // Soft fade at the bottom where it meets the water.
  col *= smoothstep(0.0, 0.05, uv.y);
  gl_FragColor = vec4(col * uIntensity, 1.0);
}`;

export class Portal {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  intensity = 0;

  constructor(width: number, height: number) {
    const geo = new THREE.PlaneGeometry(width, height);
    geo.translate(0, height / 2, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: G.uTime,
        uIntensity: { value: 0 },
        uSize: { value: new THREE.Vector2(width, height) },
        uRipple: { value: new THREE.Vector4(0.5, 0.5, -100, 0) },
        uFlow: { value: 0.6 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  ripple(u: number, v: number, now: number, strength = 1) {
    (this.material.uniforms.uRipple.value as THREE.Vector4).set(u, v, now, strength);
  }

  update() {
    this.material.uniforms.uIntensity.value = this.intensity;
    this.mesh.visible = this.intensity > 0.001;
  }
}

// Full-screen "inside the light-water" effect for the moment of passing
// through: teal glow, concentric rings, caustics, rising bokeh, a white core.
const diveFrag = /* glsl */ `
${common}
${causticGLSL}
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmount;  // 0..1 overall
uniform float uWhite;   // 0..1 white core bloom
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  float t = uTime;
  // Refract the scene through the rippling surface.
  float wob = sin(r * 38.0 - t * 9.0) * 0.006 * uAmount;
  vec3 scene = texture(tScene, uv + p / max(r, 1e-3) * wob).rgb;
  float c = caustic(p * 6.0 + vec2(0.0, t * 0.4), t * 0.9);
  float rings = 0.0;
  for (int k = 0; k < 4; k++) {
    float rad = fract(t * 0.55 + float(k) * 0.25) * 1.2;
    float d = r - rad;
    rings += exp(-d * d * 900.0) * (1.0 - rad / 1.2);
  }
  // Bokeh bubbles rising.
  vec2 bp = p * 7.0 + vec2(0.0, -t * 1.6);
  vec2 id = floor(bp);
  vec2 f = fract(bp) - 0.5;
  vec2 hh = hash22(id);
  float bub = step(0.7, hh.x) * smoothstep(0.32, 0.26, length(f - (hh - 0.5) * 0.4)) * (0.4 + 0.6 * hh.y);
  vec3 teal = vec3(0.12, 0.92, 0.8);
  vec3 fx = teal * (0.55 + c * 1.1 + rings * 2.0) + vec3(0.7, 1.0, 0.95) * bub * 1.2;
  fx += vec3(1.0, 1.0, 0.96) * exp(-r * 3.0) * 2.5 * uWhite;
  vec3 col = mix(scene, scene * 0.3 + fx, uAmount);
  col = mix(col, vec3(1.6, 1.8, 1.75), uWhite * uWhite * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export class DiveOverlay {
  readonly pass = new FullscreenPass(
    passMaterial(diveFrag, {
      tScene: { value: null },
      uRes: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uAmount: { value: 0 },
      uWhite: { value: 0 },
    }),
  );
  amount = 0;
  white = 0;

  get active() {
    return this.amount > 0.001 || this.white > 0.001;
  }

  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, dst: THREE.WebGLRenderTarget, time: number) {
    const u = this.pass.material.uniforms;
    u.tScene.value = src;
    u.uRes.value.set(dst.width, dst.height);
    u.uTime.value = time;
    u.uAmount.value = this.amount;
    u.uWhite.value = this.white;
    this.pass.render(renderer, dst);
  }
}
