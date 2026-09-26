import * as THREE from "three";

// HDR post chain, hand-written so every pass is budgeted:
//   scene (MSAA, half-float) → 13-tap Karis prefilter → downsample chain →
//   moonbeams (1/4) → tent upsample → composite (ACES filmic, classical
//   grade, vignette, film grain, dither).

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const DOWN13 = /* glsl */ `
  vec3 s(vec2 o) { return texture2D(tSrc, vUv + o * uTexel).rgb; }
`;

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
}

function rt(w: number, h: number, opts: THREE.RenderTargetOptions = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    depthBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    ...opts,
  });
}

// Ink-blue shadows for the moonlit world.
const NIGHT_SHADOW = new THREE.Color(0.0022, 0.0075, 0.02);

export type PostParams = {
  exposure: number;
  bloom: number;
  god: number;
  godSamples: number;
  vignette: number;
  grain: number;
  flash: number;
  ca?: number; // radial chromatic aberration (entry sequence only)
  shadow?: THREE.Color; // colour lifted into the shadows by the grade
  sat?: number; // saturation (1 = as rendered)
  sun: THREE.Vector2; // moon position in screen uv
  sunVisible: number;
  time: number;
};

export class PostPipeline {
  scene: THREE.WebGLRenderTarget;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private god!: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private levels = 6;
  private width = 1;
  private height = 1;

  private prefilter = pass(
    /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee;
    varying vec2 vUv;
    ${DOWN13}
    float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    void main() {
      vec3 a = s(vec2(-2,-2)), b = s(vec2(0,-2)), c = s(vec2(2,-2));
      vec3 d = s(vec2(-1,-1)), e = s(vec2(1,-1));
      vec3 f = s(vec2(-2,0)), g = s(vec2(0,0)), h = s(vec2(2,0));
      vec3 i = s(vec2(-1,1)), j = s(vec2(1,1));
      vec3 k = s(vec2(-2,2)), l = s(vec2(0,2)), m = s(vec2(2,2));
      // Karis average (boxes weighted by 1 / (1 + luma)) keeps single-pixel
      // highlights — stars, glints, sparks — from flickering the bloom.
      vec3 b0 = (d + e + i + j) * 0.25, b1 = (a + b + f + g) * 0.25, b2 = (b + c + g + h) * 0.25;
      vec3 b3 = (f + g + k + l) * 0.25, b4 = (g + h + l + m) * 0.25;
      float w0 = 0.5 / (1.0 + luma(b0)), w1 = 0.125 / (1.0 + luma(b1)), w2 = 0.125 / (1.0 + luma(b2));
      float w3 = 0.125 / (1.0 + luma(b3)), w4 = 0.125 / (1.0 + luma(b4));
      vec3 col = (b0 * w0 + b1 * w1 + b2 * w2 + b3 * w3 + b4 * w4) / (w0 + w1 + w2 + w3 + w4);
      col = min(col, vec3(60.0));
      float br = max(col.r, max(col.g, col.b));
      float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
      rq = rq * rq / (4.0 * uKnee + 1e-4);
      col *= max(rq, br - uThreshold) / max(br, 1e-4);
      gl_FragColor = vec4(col, 1.0);
    }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.95 }, uKnee: { value: 0.55 } },
  );

  private downMat = pass(
    /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 uTexel;
    varying vec2 vUv;
    ${DOWN13}
    void main() {
      vec3 a = s(vec2(-2,-2)), b = s(vec2(0,-2)), c = s(vec2(2,-2));
      vec3 d = s(vec2(-1,-1)), e = s(vec2(1,-1));
      vec3 f = s(vec2(-2,0)), g = s(vec2(0,0)), h = s(vec2(2,0));
      vec3 i = s(vec2(-1,1)), j = s(vec2(1,1));
      vec3 k = s(vec2(-2,2)), l = s(vec2(0,2)), m = s(vec2(2,2));
      vec3 col = (d+e+i+j) * 0.125 + (a+c+k+m) * 0.03125 + (b+f+h+l) * 0.0625 + g * 0.125;
      gl_FragColor = vec4(col, 1.0);
    }`,
    { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } },
  );

  private upMat = pass(
    /* glsl */ `
    uniform sampler2D tLow; uniform sampler2D tHigh; uniform vec2 uTexel; uniform float uScatter;
    varying vec2 vUv;
    void main() {
      vec2 t = uTexel;
      vec3 c = texture2D(tLow, vUv).rgb * 4.0;
      c += (texture2D(tLow, vUv + vec2(-t.x, 0)).rgb + texture2D(tLow, vUv + vec2(t.x, 0)).rgb
          + texture2D(tLow, vUv + vec2(0, -t.y)).rgb + texture2D(tLow, vUv + vec2(0, t.y)).rgb) * 2.0;
      c += texture2D(tLow, vUv - t).rgb + texture2D(tLow, vUv + t).rgb
         + texture2D(tLow, vUv + vec2(-t.x, t.y)).rgb + texture2D(tLow, vUv + vec2(t.x, -t.y)).rgb;
      c /= 16.0;
      gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + c * uScatter, 1.0);
    }`,
    { tLow: { value: null }, tHigh: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.85 } },
  );

  private godMat = pass(
    /* glsl */ `
    uniform sampler2D tSrc; uniform vec2 uSun; uniform float uAspect; uniform int uSamples;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 delta = (uv - uSun) * 0.92 / float(uSamples);
      float decay = 1.0;
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 64; i++) {
        if (i >= uSamples) break;
        uv -= delta;
        vec2 dd = (uv - uSun) * vec2(uAspect, 1.0);
        float mask = exp(-dot(dd, dd) * 14.0);
        acc += texture2D(tSrc, uv).rgb * mask * decay;
        decay *= 0.965;
      }
      gl_FragColor = vec4(acc / float(uSamples) * 3.0, 1.0);
    }`,
    { tSrc: { value: null }, uSun: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uSamples: { value: 40 } },
  );

  private compositeMat = pass(
    /* glsl */ `
    uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tGod;
    uniform float uExposure; uniform float uBloom; uniform float uGod;
    uniform float uVignette; uniform float uGrain; uniform float uFlash; uniform float uCA; uniform vec3 uShadow; uniform float uSat;
    uniform float uAspect; uniform float uTime; uniform vec2 uRes;
    varying vec2 vUv;

    vec3 aces(vec3 c) {
      const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
      const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
      c = inM * c;
      vec3 a = c * (c + 0.0245786) - 0.000090537;
      vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
      return clamp(outM * (a / b), 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

    void main() {
      vec2 uv = vUv;
      vec3 col;
      if (uCA > 0.0) {
        // Lens fringing, stronger toward the edges.
        vec2 o = (uv - 0.5) * uCA * (0.4 + 1.6 * length(uv - 0.5));
        col = vec3(texture2D(tScene, uv + o).r, texture2D(tScene, uv).g, texture2D(tScene, uv - o).b);
        col += vec3(texture2D(tBloom, uv + o * 2.0).r, texture2D(tBloom, uv).g, texture2D(tBloom, uv - o * 2.0).b) * uBloom;
      } else {
        col = texture2D(tScene, uv).rgb;
        col += texture2D(tBloom, uv).rgb * uBloom;
      }
      col += texture2D(tGod, uv).rgb * uGod;

      col = aces(col * uExposure);

      // Classical grade: ink-blue shadows, warm moonlit highlights, a touch
      // less saturation than life.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      col += uShadow * (1.0 - smoothstep(0.0, 0.3, l));
      col *= mix(vec3(1.0), vec3(1.04, 1.01, 0.95), smoothstep(0.35, 1.0, l));

      vec2 vd = (uv - 0.5) * vec2(uAspect * 0.75, 1.0);
      col *= 1.0 - uVignette * smoothstep(0.2, 0.95, length(vd));
      col = clamp(col, 0.0, 1.0);

      vec3 srgb = toSRGB(col);
      // White-outs blend in display space, so they fade evenly to the eye.
      // Pure white at full strength, blushing pink as it lifts.
      srgb = mix(srgb, mix(vec3(1.0, 0.86, 0.95), vec3(1.0, 0.985, 0.99), smoothstep(0.55, 1.0, uFlash)), uFlash);
      vec2 px = uv * uRes;
      float n = hash(px + fract(uTime * 7.3) * 311.0) - 0.5;
      srgb += n * uGrain * (1.0 - srgb * 0.5);
      srgb += (hash(px * 1.37 + 17.0) - 0.5) / 255.0;
      gl_FragColor = vec4(srgb, 1.0);
    }`,
    {
      tScene: { value: null },
      tBloom: { value: null },
      tGod: { value: null },
      uExposure: { value: 1 },
      uBloom: { value: 0.06 },
      uGod: { value: 0.35 },
      uVignette: { value: 0.4 },
      uGrain: { value: 0.035 },
      uFlash: { value: 0 },
      uCA: { value: 0 },
      uShadow: { value: new THREE.Color(0.004, 0.008, 0.02) },
      uSat: { value: 0.92 },
      uAspect: { value: 1 },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
    },
  );

  constructor(width: number, height: number, samples: number) {
    this.scene = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.quad = new THREE.Mesh(tri, this.compositeMat);
    this.quad.frustumCulled = false;
    this.setSize(width, height, samples);
  }

  setSize(width: number, height: number, samples: number) {
    this.width = width;
    this.height = height;
    if (this.scene.samples !== samples) {
      this.scene.dispose();
      this.scene = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    } else {
      this.scene.setSize(width, height);
    }
    for (const t of [...this.down, ...this.up]) t.dispose();
    this.god?.dispose();
    this.down = [];
    this.up = [];
    let w = Math.ceil(width / 2);
    let h = Math.ceil(height / 2);
    for (let i = 0; i < this.levels; i++) {
      this.down.push(rt(w, h));
      if (i < this.levels - 1) this.up.push(rt(w, h));
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
    }
    this.god = rt(this.down[1].width, this.down[1].height);
    this.compositeMat.uniforms.uRes.value.set(width, height);
    this.compositeMat.uniforms.uAspect.value = width / height;
    this.godMat.uniforms.uAspect.value = width / height;
  }

  private blit(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quad, this.cam);
  }

  // Runs every pass after the scene has been rendered into `this.scene`.
  finish(renderer: THREE.WebGLRenderer, p: PostParams) {
    const src = this.scene.texture;

    const pf = this.prefilter.uniforms;
    pf.tSrc.value = src;
    pf.uTexel.value.set(1 / this.width, 1 / this.height);
    this.blit(renderer, this.prefilter, this.down[0]);

    for (let i = 1; i < this.levels; i++) {
      const d = this.downMat.uniforms;
      d.tSrc.value = this.down[i - 1].texture;
      d.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
      this.blit(renderer, this.downMat, this.down[i]);
    }

    const g = this.godMat.uniforms;
    g.tSrc.value = this.down[1].texture;
    g.uSun.value.copy(p.sun);
    g.uSamples.value = p.godSamples;
    if (p.god > 0.001 && p.sunVisible > 0.001) this.blit(renderer, this.godMat, this.god);

    for (let i = this.levels - 2; i >= 0; i--) {
      const u = this.upMat.uniforms;
      const low = i === this.levels - 2 ? this.down[this.levels - 1] : this.up[i + 1];
      u.tLow.value = low.texture;
      u.tHigh.value = this.down[i].texture;
      u.uTexel.value.set(1 / low.width, 1 / low.height);
      this.blit(renderer, this.upMat, this.up[i]);
    }

    const c = this.compositeMat.uniforms;
    c.tScene.value = src;
    c.tBloom.value = this.up[0].texture;
    c.tGod.value = this.god.texture;
    c.uExposure.value = p.exposure;
    c.uBloom.value = p.bloom;
    c.uGod.value = p.sunVisible > 0.001 ? p.god * p.sunVisible : 0;
    c.uVignette.value = p.vignette;
    c.uGrain.value = p.grain;
    c.uFlash.value = p.flash;
    c.uCA.value = p.ca ?? 0;
    c.uShadow.value.copy(p.shadow ?? NIGHT_SHADOW);
    c.uSat.value = p.sat ?? 0.92;
    c.uTime.value = p.time;
    this.blit(renderer, this.compositeMat, null);
  }
}
