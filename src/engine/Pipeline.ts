import * as THREE from "three";
import { FullscreenPass, hdrTarget, passMaterial } from "./fsq";
import { common, tonemap } from "./glsl";
import { GpuTimer } from "./GpuTimer";
import type { Tier } from "./Quality";

// HDR frame: stages render linear radiance into `scene` (half-float, MSAA),
// optional full-screen effects ping-pong through `fx`, then bloom + the
// composite (exposure, grade, tone map, lens) write the canvas.

const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
varying vec2 vUv;
vec3 k(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b)) * uKaris); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, b = texture(tSrc, vUv + t * vec2(0, 2)).rgb, c = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb, f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, h = texture(tSrc, vUv + t * vec2(0, -2)).rgb, i = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, l = texture(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 m = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, n = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 o = (k(j) + k(l) + k(m) + k(n)) * 0.125;
  o += (k(a) + k(c) + k(g) + k(i)) * 0.03125;
  o += (k(b) + k(d) + k(f) + k(h)) * 0.0625;
  o += k(e) * 0.125;
  if (uKaris > 0.0) o = o / max(1e-4, 1.0 - max(o.r, max(o.g, o.b)) * uKaris);
  gl_FragColor = vec4(max(o, 0.0), 1.0);
}`;

const upFrag = /* glsl */ `
uniform sampler2D tSmall;
uniform sampler2D tCur;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture(tSmall, vUv + vec2(-t.x, t.y)).rgb + texture(tSmall, vUv + vec2(0, t.y)).rgb * 2.0 + texture(tSmall, vUv + t).rgb;
  s += texture(tSmall, vUv + vec2(-t.x, 0)).rgb * 2.0 + texture(tSmall, vUv).rgb * 4.0 + texture(tSmall, vUv + vec2(t.x, 0)).rgb * 2.0;
  s += texture(tSmall, vUv - t).rgb + texture(tSmall, vUv + vec2(0, -t.y)).rgb * 2.0 + texture(tSmall, vUv + vec2(t.x, -t.y)).rgb;
  gl_FragColor = vec4(texture(tCur, vUv).rgb + s / 16.0, 1.0);
}`;

const compositeFrag = /* glsl */ `
${common}
${tonemap}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloom;
uniform float uBloomNorm;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uFade;
uniform float uVignette;
uniform float uCA;
uniform float uGrain;
uniform float uSaturation;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uContrast;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  vec2 dc = uv - 0.5;
  vec3 col;
  if (uCA > 0.0) {
    vec2 off = dc * uCA * (0.4 + length(dc));
    col.r = texture(tScene, uv - off).r;
    col.g = texture(tScene, uv).g;
    col.b = texture(tScene, uv + off).b;
  } else {
    col = texture(tScene, uv).rgb;
  }
  col = mix(col, texture(tBloom, uv).rgb * uBloomNorm, uBloom);
  col *= uExposure;
  // Grade in linear light before the tone curve.
  col = col * uGain + uLift * (1.0 - saturate(luma(col) * 2.0));
  float l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  col = max(col, 0.0);
  col = neutralTonemap(col);
  // Gentle S-curve around mid grey in display space.
  vec3 d = linearToSrgb(col);
  d = mix(d, d * d * (3.0 - 2.0 * d), uContrast);
  float v = 1.0 - uVignette * smoothstep(0.35, 1.05, length(dc * vec2(uRes.x / uRes.y, 1.0) * 0.9));
  d *= v;
  // Flash: a display-space white-out (tinted), so it reaches true white.
  d = mix(d, uFlashColor, uFlash);
  d *= 1.0 - uFade;
  // Film grain + dither (breaks 8-bit banding in the dark sky).
  float n = hash12(gl_FragCoord.xy + fract(uTime * 13.7) * 97.0) - 0.5;
  d += n * (uGrain + 1.0 / 255.0);
  gl_FragColor = vec4(d, 1.0);
}`;

export type PostParams = {
  exposure: number;
  bloom: number;
  flash: number;
  flashColor: THREE.Color;
  fade: number;
  vignette: number;
  ca: number;
  grain: number;
  saturation: number;
  lift: THREE.Color;
  gain: THREE.Color;
  contrast: number;
};

export function defaultPost(): PostParams {
  return {
    exposure: 1,
    bloom: 0.085,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    fade: 0,
    vignette: 0.22,
    ca: 0,
    grain: 0.012,
    saturation: 1,
    lift: new THREE.Color(0, 0, 0),
    gain: new THREE.Color(1, 1, 1),
    contrast: 0.08,
  };
}

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  readonly timer: GpuTimer;
  width = 1;
  height = 1;
  scene!: THREE.WebGLRenderTarget; // MSAA HDR target for stages
  fxA!: THREE.WebGLRenderTarget; // single-sample HDR ping-pong
  fxB!: THREE.WebGLRenderTarget;
  /** The HDR texture that post reads (stage output or last fx result). */
  current!: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private downPass: FullscreenPass;
  private upPass: FullscreenPass;
  private composite: FullscreenPass;
  private tier: Tier;
  readonly post = defaultPost();
  time = 0;

  constructor(canvas: HTMLCanvasElement, tier: Tier) {
    this.tier = tier;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(1);
    this.gl = this.renderer.getContext() as WebGL2RenderingContext;
    this.timer = new GpuTimer(this.gl);

    this.downPass = new FullscreenPass(passMaterial(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } }));
    this.upPass = new FullscreenPass(
      passMaterial(upFrag, { tSmall: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } }),
    );
    this.composite = new FullscreenPass(
      passMaterial(compositeFrag, {
        tScene: { value: null },
        tBloom: { value: null },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uBloom: { value: 0.06 },
        uBloomNorm: { value: 1 / 6 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
        uFade: { value: 0 },
        uVignette: { value: 0.2 },
        uCA: { value: 0 },
        uGrain: { value: 0.01 },
        uSaturation: { value: 1 },
        uLift: { value: new THREE.Color() },
        uGain: { value: new THREE.Color(1, 1, 1) },
        uContrast: { value: 0 },
      }),
    );
  }

  setTier(tier: Tier) {
    const msaaChanged = tier.msaa !== this.tier.msaa;
    this.tier = tier;
    if (msaaChanged && this.scene) {
      this.scene.dispose();
      this.scene = this.makeSceneTarget();
    }
  }

  private makeSceneTarget() {
    const rt = hdrTarget(this.width, this.height, { depthBuffer: true, samples: this.tier.msaa });
    return rt;
  }

  // cssW/cssH: canvas CSS size; dpr: devicePixelRatio.
  resize(cssW: number, cssH: number, dpr: number) {
    let w = Math.round(cssW * dpr * this.tier.scale);
    let h = Math.round(cssH * dpr * this.tier.scale);
    const px = w * h;
    if (px > this.tier.maxPixels) {
      const k = Math.sqrt(this.tier.maxPixels / px);
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    w = Math.max(2, w);
    h = Math.max(2, h);
    if (w === this.width && h === this.height && this.scene) return false;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.scene?.dispose();
    this.fxA?.dispose();
    this.fxB?.dispose();
    this.scene = this.makeSceneTarget();
    this.fxA = hdrTarget(w, h);
    this.fxB = hdrTarget(w, h);
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    this.down = [];
    this.up = [];
    let bw = w >> 1;
    let bh = h >> 1;
    for (let i = 0; i < 6 && bw >= 4 && bh >= 4; i++) {
      this.down.push(hdrTarget(bw, bh));
      this.up.push(hdrTarget(bw, bh));
      bw >>= 1;
      bh >>= 1;
    }
    return true;
  }

  beginFrame() {
    this.timer.beginFrame();
    this.current = this.scene;
  }

  /** The target an fx pass should write (not the one it reads). */
  nextFx() {
    return this.current === this.fxA ? this.fxB : this.fxA;
  }

  private bloom() {
    const r = this.renderer;
    const dm = this.downPass.material;
    let src = this.current.texture;
    for (let i = 0; i < this.down.length; i++) {
      const tw = i === 0 ? this.width : this.down[i - 1].width;
      const th = i === 0 ? this.height : this.down[i - 1].height;
      dm.uniforms.tSrc.value = src;
      dm.uniforms.uTexel.value.set(1 / tw, 1 / th);
      dm.uniforms.uKaris.value = i === 0 ? 1 : 0;
      this.downPass.render(r, this.down[i]);
      src = this.down[i].texture;
    }
    const um = this.upPass.material;
    const n = this.down.length;
    // The smallest level seeds the upward chain.
    let small = this.down[n - 1].texture;
    for (let i = n - 2; i >= 0; i--) {
      um.uniforms.tSmall.value = small;
      um.uniforms.tCur.value = this.down[i].texture;
      um.uniforms.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
      um.uniforms.uRadius.value = 1;
      this.upPass.render(r, this.up[i]);
      small = this.up[i].texture;
    }
    return this.up[0].texture;
  }

  finish() {
    const r = this.renderer;
    this.timer.begin("post");
    const bloomTex = this.bloom();
    const u = this.composite.material.uniforms;
    const p = this.post;
    u.tScene.value = this.current.texture;
    u.tBloom.value = bloomTex;
    u.uRes.value.set(this.width, this.height);
    u.uTime.value = this.time;
    u.uExposure.value = p.exposure;
    u.uBloom.value = p.bloom;
    u.uBloomNorm.value = 1 / Math.max(1, this.down.length);
    u.uFlash.value = p.flash;
    u.uFlashColor.value.copy(p.flashColor);
    u.uFade.value = p.fade;
    u.uVignette.value = p.vignette;
    u.uCA.value = p.ca;
    u.uGrain.value = p.grain;
    u.uSaturation.value = p.saturation;
    u.uLift.value.copy(p.lift);
    u.uGain.value.copy(p.gain);
    u.uContrast.value = p.contrast;
    this.composite.render(r, null);
    this.timer.end();
  }
}
