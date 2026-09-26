import * as THREE from "three";
import { FullscreenPass, passMaterial } from "../engine/fsq";
import { common } from "../engine/glsl";

// Wet lens right after surfacing (clip 5.8–6.6 s): bright lights along the
// horizon smear into short vertical streaks, as through a film of water on
// the lens, with a faint glitter. Runs as an fx pass over World A.

const frag = /* glsl */ `
${common}
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uStreak;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec3 col = texture(tScene, uv).rgb;
  // Streak length varies across the screen (uneven water film).
  float film = 0.6 + 0.8 * vnoise(vec2(uv.x * 24.0, uTime * 0.7));
  vec3 st = vec3(0.0);
  for (int i = 1; i <= 12; i++) {
    float o = float(i) * 0.0075 * film;
    vec3 a = texture(tScene, uv + vec2(0.0, o)).rgb;
    vec3 b = texture(tScene, uv - vec2(0.0, o * 0.8)).rgb;
    float w = 1.0 - float(i) / 13.0;
    st += (max(a - 1.4, 0.0) + max(b - 1.4, 0.0)) * w;
  }
  // Glitter: tiny sparkles riding on the streaks.
  float g = pow(hash12(floor(uv * uRes / 2.0) + floor(uTime * 24.0)), 60.0) * 6.0;
  // Slight prism fringe across the streak band.
  vec3 prism = 0.75 + 0.25 * cos(TAU * (uv.x * 7.0 + vec3(0.0, 0.33, 0.67)));
  col += st * (0.3 + g * 0.2) * uStreak * vec3(1.0, 0.9, 0.8) * prism;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Emergence {
  readonly pass: FullscreenPass;
  streak = 0;

  constructor() {
    this.pass = new FullscreenPass(
      passMaterial(frag, {
        tScene: { value: null },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uStreak: { value: 0 },
      }),
    );
  }

  get active() {
    return this.streak > 0.001;
  }

  render(renderer: THREE.WebGLRenderer, src: THREE.Texture, dst: THREE.WebGLRenderTarget, time: number) {
    const u = this.pass.material.uniforms;
    u.tScene.value = src;
    u.uRes.value.set(dst.width, dst.height);
    u.uTime.value = time;
    u.uStreak.value = this.streak;
    this.pass.render(renderer, dst);
  }
}
