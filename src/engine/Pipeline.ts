import * as THREE from "three";
import { FullscreenPass, hdrTarget, passMaterial } from "./fsq";
import { common, octa, tonemap } from "./glsl";
import { GpuTimer } from "./GpuTimer";
import type { Tier } from "./Quality";
import { fxShared } from "./toon";

// The toon frame:
//   1. gbuf + gaux — MSAA, drawn in two passes: shaded colour (HDR), then aux
//      (view normal, view depth, ink id) with each material's aux twin (see auxTwin)
//   2. ink    — screen-space lines from depth / normal / id discontinuities → lit
//   3. fx     — additive and transparent effects into lit (they depth-test against aux)
//   (1–3 run once per scene; while two scenes cross, a mix pass blends them)
//   4. bloom  — 13-tap down / tent up chain
//   5. composite → screen: P3R grade, the "sea of the heart" water treatment,
//      Yachiyo's film band, flood / blot masks, flash, grain.
//   6. overlay — fish, confetti and other display-space geometry, straight to the screen.

const inkFrag = /* glsl */ `
${common}
${octa}
uniform sampler2D tColor;
uniform sampler2D tAux;
uniform vec2 uTexel;
uniform vec2 uRes;
uniform float uWidth;
uniform vec3 uInk;
uniform float uInkKeep;
uniform vec2 uInkFade;
uniform float uCrease;
uniform vec3 uRimCol;
uniform vec3 uMoonScreen; // px, px, 1 if in front of the camera
uniform float uRimWidth;
uniform float uGain;
uniform float uDebug;
varying vec2 vUv;

// aux.w packs the ink group (integer part) and the rim strength (fraction / 0.45)
float inkId(float w) { return floor(w + 0.01); }

void main() {
  vec4 col = texture2D(tColor, vUv);
  col.rgb *= uGain;
  vec4 c = texture2D(tAux, vUv);
  if (uDebug > 0.5) {
    if (uDebug < 1.5) { gl_FragColor = vec4(vec3(fract(c.z / 50.0)), 1.0); return; }
    if (uDebug < 2.5) { gl_FragColor = vec4(octDecode(c.xy) * 0.5 + 0.5, 1.0); return; }
    if (uDebug < 3.5) { float i = inkId(c.w); gl_FragColor = vec4(hash11(i * 7.13), hash11(i * 3.1), hash11(i * 1.7), 1.0) * step(0.5, i); return; }
  }
  float id = inkId(c.w);
  if (id < 0.5 || c.z <= 0.0) { gl_FragColor = vec4(col.rgb, 1.0); return; }
  float rimK = fract(c.w) / 0.45;
  vec2 o = uTexel * uWidth;
  vec4 s0 = texture2D(tAux, vUv + vec2(-o.x, 0.0));
  vec4 s1 = texture2D(tAux, vUv + vec2(o.x, 0.0));
  vec4 s2 = texture2D(tAux, vUv + vec2(0.0, -o.y));
  vec4 s3 = texture2D(tAux, vUv + vec2(0.0, o.y));
  vec4 s4 = texture2D(tAux, vUv + o * vec2(-0.7, -0.7));
  vec4 s5 = texture2D(tAux, vUv + o * vec2(0.7, -0.7));
  vec4 s6 = texture2D(tAux, vUv + o * vec2(-0.7, 0.7));
  vec4 s7 = texture2D(tAux, vUv + o * vec2(0.7, 0.7));
  float z = c.z;
  float far = 0.0;
  #define FAR(s) far = max(far, s.z <= 0.0 ? 1e5 : s.z);
  FAR(s0) FAR(s1) FAR(s2) FAR(s3) FAR(s4) FAR(s5) FAR(s6) FAR(s7)
  float lapX = abs((s0.z > 0.0 ? s0.z : z) + (s1.z > 0.0 ? s1.z : z) - 2.0 * z);
  float lapY = abs((s2.z > 0.0 ? s2.z : z) + (s3.z > 0.0 ? s3.z : z) - 2.0 * z);
  float gap = (far - z) / z;
  float sil = smoothstep(0.012, 0.03, gap) * smoothstep(0.004, 0.02, max(lapX, lapY) / z + step(1e4, far));
  vec3 n = octDecode(c.xy);
  float cr = 0.0;
  #define CREASE(s) if (inkId(s.w) > 0.5 && abs(s.z - z) < z * 0.05) cr = max(cr, 1.0 - dot(n, octDecode(s.xy)));
  CREASE(s0) CREASE(s1) CREASE(s2) CREASE(s3)
  float crease = smoothstep(0.2, 0.42, cr) * uCrease;
  float idE = 0.0;
  #define IDE(s) if (inkId(s.w) > 0.5 && abs(inkId(s.w) - id) > 0.5 && id > inkId(s.w) && abs(s.z - z) < z * 0.08) idE = 1.0;
  IDE(s0) IDE(s1) IDE(s2) IDE(s3)
  float e = max(sil, max(crease, idE * 0.85));
  float fade = 1.0 - smoothstep(uInkFade.x, uInkFade.y, z);
  e *= fade;

  // Screen-space rim: step toward the moon on screen; if we fall off this
  // surface onto something far behind (or the sky), we are on a lit rim.
  float rim = 0.0;
  if (rimK > 0.02) {
    vec2 px = vUv * uRes;
    vec2 dir = uMoonScreen.z > 0.5 ? normalize(uMoonScreen.xy - px + 1e-3) : vec2(0.0, 1.0);
    vec4 r = texture2D(tAux, vUv + dir * uRimWidth * uTexel);
    float rz = r.z <= 0.0 ? 1e5 : r.z;
    rim = smoothstep(0.03, 0.08, (rz - z) / z) * rimK * (1.0 - smoothstep(uInkFade.x, uInkFade.y * 1.6, z) * 0.6);
  }
  vec3 lit = col.rgb + uRimCol * rim * (0.35 + luma(col.rgb) * 2.0);
  vec3 ink = col.rgb * uInkKeep + uInk;
  if (uDebug > 4.5) { gl_FragColor = vec4(vec3(e), 1.0); return; }
  if (uDebug > 3.5) { gl_FragColor = vec4(sil, crease, rim, 1.0); return; }
  gl_FragColor = vec4(mix(lit, ink, e), 1.0);
}`;

const downFrag = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uKaris;
varying vec2 vUv;
vec3 k(vec3 c) { return c / (1.0 + max(c.r, max(c.g, c.b)) * uKaris); }
void main() {
  vec2 t = uTexel;
  vec3 a = texture2D(tSrc, vUv + t * vec2(-2, 2)).rgb, b = texture2D(tSrc, vUv + t * vec2(0, 2)).rgb, c = texture2D(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture2D(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture2D(tSrc, vUv + t * vec2(-2, -2)).rgb, h = texture2D(tSrc, vUv + t * vec2(0, -2)).rgb, i = texture2D(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture2D(tSrc, vUv + t * vec2(-1, 1)).rgb, l = texture2D(tSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 m = texture2D(tSrc, vUv + t * vec2(-1, -1)).rgb, n = texture2D(tSrc, vUv + t * vec2(1, -1)).rgb;
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
varying vec2 vUv;
void main() {
  vec2 t = uTexel;
  vec3 s = texture2D(tSmall, vUv + vec2(-t.x, t.y)).rgb + texture2D(tSmall, vUv + vec2(0, t.y)).rgb * 2.0 + texture2D(tSmall, vUv + t).rgb;
  s += texture2D(tSmall, vUv + vec2(-t.x, 0)).rgb * 2.0 + texture2D(tSmall, vUv).rgb * 4.0 + texture2D(tSmall, vUv + vec2(t.x, 0)).rgb * 2.0;
  s += texture2D(tSmall, vUv - t).rgb + texture2D(tSmall, vUv + vec2(0, -t.y)).rgb * 2.0 + texture2D(tSmall, vUv + vec2(t.x, -t.y)).rgb;
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + s / 16.0, 1.0);
}`;

const compositeFrag = /* glsl */ `
${common}
${tonemap}
uniform sampler2D tLit;
uniform sampler2D tBloom;
uniform sampler2D tSoft;
uniform sampler2D tHero;
uniform vec2 uRes;
uniform float uTime;
uniform float uStepTime;
uniform float uExposure;
uniform float uBloom;
uniform float uBloomNorm;
uniform float uMono;
uniform float uWater;
uniform float uFlood;
uniform float uFloodLine;
uniform vec4 uBlot;       // centre (px), radius (px), wobble
uniform float uBlotMode;  // 0 off, 1 ring reveal (outside = normal, inside = water-zoom)
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uFade;
uniform float uVignette;
uniform float uGrain;
uniform float uDark;
uniform float uCalm;      // 0 menu … 1 screens: more blur, darker, quieter caustics
uniform float uSea;       // per-scene luminance gain under the sea grade
uniform vec3 uFocus;      // emblem centre (uv) + radius: the sea hushes behind the fish
// Yachiyo's film band (display space): inverse affine from pixels to frame uv
// (0…1, y up). The video stacks colour (top half) over her pop-out alpha.
uniform float uHero;
uniform mat3 uHeroInv;
uniform vec4 uHeroBand;   // band v bottom, v top, border (uv y), border (uv x)
uniform vec2 uHeroShadow; // px offset of the hard shadow
uniform vec3 uHeroShadowCol;
uniform float uHeroWave;
uniform float uHeroSeam;  // 1 → 0 after the loop wraps
uniform vec3 uRampA;
uniform vec3 uRampB;
uniform vec3 uRampC;
uniform vec3 uRampD;
uniform vec3 uRampE;
varying vec2 vUv;

// The P3R sea: luminance posterised onto a five-stop blue ramp.
vec3 ramp(float l) {
  l = clamp(l, 0.0, 1.0) * 4.0;
  float s = floor(l);
  float f = smoothstep(0.42, 0.58, fract(l)); // mostly flat bands, soft seams
  vec3 a = s < 1.0 ? uRampA : s < 2.0 ? uRampB : s < 3.0 ? uRampC : uRampD;
  vec3 b = s < 1.0 ? uRampB : s < 2.0 ? uRampC : s < 3.0 ? uRampD : uRampE;
  return mix(a, b, f);
}

// Stepped caustic web: |n1 - n2| ridges of two drifting value-noise fields.
float caustic(vec2 p, float t) {
  float a = fbm2(p + vec2(t * 0.35, -t * 0.9), 3);
  float b = fbm2(p * 1.13 + vec2(-t * 0.28, -t * 0.7) + 7.3, 3);
  return 1.0 - smoothstep(0.0, 0.035, abs(a - b));
}

float bubbles(vec2 px, float t) {
  float cell = 180.0;
  vec2 p = px / cell;
  float acc = 0.0;
  for (int k = 0; k < 2; k++) {
    vec2 q = p + vec2(float(k) * 0.5, 0.0);
    vec2 id = floor(q + vec2(0.0, 0.0));
    float h = hash12(id + float(k) * 17.0);
    if (h > 0.55) continue;
    float speed = 0.35 + h * 0.8;
    vec2 c = vec2(0.2 + 0.6 * hash12(id + 3.1), fract(-t * speed * 0.25 + hash12(id + 9.7)) );
    vec2 lp = fract(q) - c;
    lp.x += sin(t * 1.7 + h * 30.0) * 0.04;
    float r = mix(0.03, 0.1, hash12(id + 5.3));
    float d = length(lp * vec2(1.0, 1.0));
    float ring = smoothstep(r, r - 0.012, d) - smoothstep(r - 0.018, r - 0.03, d);
    float glint = smoothstep(0.02, 0.0, length(lp - vec2(-r * 0.35, r * 0.4)));
    acc += (ring * 0.7 + glint) * smoothstep(0.0, 0.2, c.y) * smoothstep(1.0, 0.8, c.y);
  }
  return acc;
}

vec3 display(vec3 hdr) {
  return linearToSrgb(neutralTonemap(max(hdr, 0.0)));
}

// Window of the film band plus its border (b = border in uv units).
float heroWindow(vec2 h, vec2 b, vec2 aa) {
  vec4 B = uHeroBand;
  return smoothstep(B.x - b.y - aa.y, B.x - b.y + aa.y, h.y) * smoothstep(B.y + b.y + aa.y, B.y + b.y - aa.y, h.y)
       * smoothstep(-b.x - aa.x, -b.x + aa.x, h.x) * smoothstep(1.0 + b.x + aa.x, 1.0 + b.x - aa.x, h.x);
}

float heroPop(vec2 h) {
  float in01 = step(0.0, h.x) * step(h.x, 1.0) * step(0.0, h.y) * step(h.y, 1.0);
  return texture2D(tHero, vec2(h.x, h.y * 0.5)).r * in01;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;

  // Where the sea is: global amount, the rising flood line, and the blot.
  float floodEdge = uFlood * (uRes.y + 80.0) - 40.0 + sin(px.x * 0.012 + uTime * 5.0) * 10.0 + sin(px.x * 0.031 - uTime * 7.0) * 5.0;
  float flooded = uFlood >= 1.0 ? 1.0 : smoothstep(floodEdge + 1.5, floodEdge - 1.5, px.y);
  float water = max(uWater, flooded);

  // Blot (P3R sub-menu transition): wobbly disc around uBlot.xy.
  // Mode 1: the sea zooms inside it. Mode 2: the water drains inside it (the
  // scene surfaces in full colour) behind a foam rim.
  float blotIn = 0.0;
  float foam = 0.0;
  if (uBlotMode > 0.5) {
    vec2 d = px - uBlot.xy;
    float ang = atan(d.y, d.x);
    float r = uBlot.z * (1.0 + uBlot.w * (0.06 * sin(ang * 5.0 + uTime * 2.0) + 0.035 * sin(ang * 9.0 - uTime * 3.0)));
    float dist = length(d);
    blotIn = smoothstep(r + 1.5, r - 1.5, dist);
    if (uBlotMode > 1.5) {
      water *= 1.0 - blotIn;
      float e = dist - r;
      foam = exp(-e * e / 18.0) + smoothstep(0.0, 26.0, e) * smoothstep(60.0, 26.0, e) * 0.25;
      foam *= step(1.0, uBlot.z);
      blotIn = 0.0;
    }
  }

  vec2 wob = vec2(sin(uv.y * 21.0 + uTime * 1.3) + sin(uv.y * 47.0 - uTime * 2.1) * 0.35, cos(uv.x * 17.0 + uTime * 1.1)) * 0.0022 * water;
  vec2 suv = uv + wob;
  if (blotIn > 0.0) suv = mix(suv, (suv - uBlot.xy / uRes) * 0.62 + uBlot.xy / uRes, blotIn);
  vec3 lit = texture2D(tLit, suv).rgb;
  vec3 bloom = texture2D(tBloom, suv).rgb * uBloomNorm;
  vec3 hdr = (lit + bloom * uBloom) * uExposure;
  vec3 col = display(hdr);

  // Title grade: push toward the P3R blue duotone, keep bloom colour as accent.
  if (uMono > 0.0) {
    float l = luma(col);
    vec3 duo = mix(mix(uRampA, uRampC, smoothstep(0.0, 0.45, l)), uRampE, smoothstep(0.45, 1.0, l));
    vec3 accent = display(bloom * uBloom * uExposure * 1.4) - display(vec3(0.0));
    col = mix(col, duo + accent * 0.55, uMono);
  }

  // The sea of the heart.
  if (water > 0.0 || blotIn > 0.0) {
    vec3 soft = texture2D(tSoft, suv).rgb * uExposure;
    vec3 base = display(mix(lit * uExposure, soft, 0.6 + 0.38 * uCalm));
    float l = luma(base) * uSea;
    l = pow(l, 0.85) * 1.12 + 0.03;
    l = mix(l, l * 0.5 + 0.06, uCalm);
    // brighter toward the surface (screen top), darker in the depths
    l += (uv.y - 0.5) * 0.22;
    vec3 sea = ramp(l);
    vec2 cp = vec2(uv.x * aspect, uv.y) * 3.2;
    float ts = uStepTime;
    float c1 = caustic(cp, ts);
    float c2 = caustic(cp * 1.7 + 3.0, ts * 1.3);
    float band = smoothstep(0.15, 0.95, uv.y);
    sea += (uRampE * c1 * 0.28 * band + uRampD * c2 * 0.16 * (0.4 + band)) * (1.0 - 0.55 * uCalm);
    sea += vec3(0.85, 0.97, 1.0) * bubbles(px * (1440.0 / uRes.y), ts) * 0.35;
    // light from above, the dark below
    sea = mix(sea, uRampA * 0.55, smoothstep(0.45, -0.05, uv.y) * 0.55);
    sea += uRampE * smoothstep(0.55, 1.05, uv.y) * 0.16;
    // quieter, deeper sea behind panels and around the fish emblem
    sea = mix(sea, sea * 0.6 + uRampA * 0.22, uCalm * 0.7);
    if (uFocus.z > 0.0) {
      float fd = length((uv - uFocus.xy) * vec2(aspect, 1.0)) / uFocus.z;
      sea = mix(sea, sea * 0.62 + uRampA * 0.25, smoothstep(1.25, 0.35, fd) * 0.7);
    }
    // coloured glow survives the remap (the rainbow pole, the moon, fish)
    vec3 glow = display(bloom * uBloom * uExposure * 1.2) - display(vec3(0.0));
    sea += glow * 0.8 * (1.0 - 0.75 * uCalm);
    if (blotIn > 0.0) {
      vec3 zoom = vec3(sea.r * 0.35, sea.g * 0.62, sea.b * 1.05);
      sea = mix(sea, zoom, blotIn);
    }
    col = mix(col, sea, max(water, blotIn));
    col = mix(col, vec3(0.9, 0.99, 1.0), clamp(foam, 0.0, 1.0) * 0.9);
    // the flood line itself: a bright wavy meniscus with a darker lip below
    if (uFlood > 0.0 && uFlood < 1.0) {
      float dl = px.y - floodEdge;
      float line = exp(-dl * dl / 6.0);
      float lip = smoothstep(0.0, -26.0, dl) * smoothstep(-60.0, -26.0, dl);
      col = mix(col, vec3(0.9, 0.99, 1.0), line * uFloodLine);
      col -= lip * 0.06 * uFloodLine;
    }
  }

  // Yachiyo walks through the eras inside a letterboxed film band; her
  // umbrella and feet break out over its white border, as in the film.
  if (uHero > 0.0) {
    vec2 h = (uHeroInv * vec3(px, 1.0)).xy;
    vec2 hs = (uHeroInv * vec3(px - uHeroShadow, 1.0)).xy;
    float sway = uHeroWave * (sin(h.y * 7.0 + uTime * 1.3) * 0.0022 + sin(h.y * 23.0 - uTime * 2.1) * 0.0007);
    h.x += sway;
    hs.x += sway;
    vec2 aa = fwidth(h) * 0.75 + 1e-5;
    vec2 bw = uHeroBand.wz;
    float band = heroWindow(h, vec2(0.0), aa);
    float win = heroWindow(h, bw, aa);
    float popA = heroPop(h) * (1.0 - band);
    // hard P3R shadow under the window and her
    float shadow = max(heroWindow(hs, bw, aa), heroPop(hs));
    col = mix(col, uHeroShadowCol, shadow * 0.88 * uHero);
    col = mix(col, vec3(1.0), (win - band) * uHero);
    // the film; at the loop seam the band shivers and flashes like a cut
    vec2 fh = h;
    fh.x += uHeroSeam * band * 0.012 * sin(h.y * 90.0 + uTime * 60.0);
    vec3 film = texture2D(tHero, vec2(fh.x, 0.5 + fh.y * 0.5)).rgb;
    // outside the band the colour was stored premultiplied by the pop alpha
    vec3 popCol = film / max(heroPop(h), 0.08);
    film = mix(popCol, film, band);
    film = mix(film, vec3(0.9, 0.97, 1.0), uHeroSeam * 0.55 * band);
    col = mix(col, film, clamp(band + popA, 0.0, 1.0) * uHero);
  }

  // Dark Hour (00:00–01:00 local): the sickly green of the hidden hour.
  if (uDark > 0.0) {
    float l = luma(col);
    col = mix(col, vec3(l * 0.55, l * 1.05 + 0.03, l * 0.5), uDark * 0.55);
  }

  float v = 1.0 - uVignette * smoothstep(0.45, 1.15, length((uv - 0.5) * vec2(aspect, 1.0) * 0.95));
  col *= v;
  col = mix(col, uFlashColor, uFlash);
  col *= 1.0 - uFade;
  float n = hash12(px + fract(uTime * 13.7) * 97.0) - 0.5;
  col += n * (uGrain + 1.0 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export type PostParams = {
  exposure: number;
  bloom: number;
  mono: number;
  water: number;
  flood: number;
  floodLine: number;
  blot: THREE.Vector4;
  blotMode: number;
  flash: number;
  flashColor: THREE.Color;
  fade: number;
  vignette: number;
  grain: number;
  dark: number;
  calm: number;
  focus: THREE.Vector3;
  /** Yachiyo's film band: opacity, pixel → frame-uv transform, borders, loop-seam pulse. */
  hero: number;
  heroInv: THREE.Matrix3;
  heroBorder: THREE.Vector2;
  heroShadow: THREE.Vector2;
  heroWave: number;
  heroSeam: number;
};

export function defaultPost(): PostParams {
  return {
    exposure: 1,
    bloom: 0.22,
    mono: 0,
    water: 0,
    flood: 0,
    floodLine: 1,
    blot: new THREE.Vector4(),
    blotMode: 0,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    fade: 0,
    vignette: 0.18,
    grain: 0.01,
    dark: 0,
    calm: 0,
    focus: new THREE.Vector3(),
    hero: 0,
    heroInv: new THREE.Matrix3(),
    heroBorder: new THREE.Vector2(0.012, 0.01),
    heroShadow: new THREE.Vector2(14, -14),
    heroWave: 1,
    heroSeam: 0,
  };
}

// P3R sea ramp: abyss → royal → azure → cyan → foam.
export const RAMP = [0x061446, 0x0f34b8, 0x1f6ef0, 0x4cc4ff, 0xc9f4ff].map((h) => new THREE.Color(h));

/** Where the letterboxed band sits in the hero video frame (v, bottom → top). */
export const HERO_BAND = new THREE.Vector2(0.087, 0.9037);

const _v = new THREE.Vector3();

/** Per-scene look: multiplies / overrides for the ink pass and the grade. */
export type FrameLook = {
  exposure?: number;
  bloom?: number;
  inkFade?: [number, number];
  inkWidth?: number;
  rim?: THREE.Color;
  /** Luminance gain under the sea grade. */
  sea?: number;
};

export type Frame = {
  camera: THREE.Camera;
  /** World direction toward the rim light (the moon). */
  lightDir?: THREE.Vector3;
  opaque: THREE.Scene;
  fx?: THREE.Scene;
  overlay?: THREE.Scene;
  overlayCamera?: THREE.Camera;
  /** Runs right before this frame's scene is drawn (per-scene lighting). */
  before?: () => void;
  look?: FrameLook;
};

/** How two scenes cross: 0 = ripple from a point, 1 = ink dissolve. */
export type Mix = { k: number; mode: 0 | 1; center: THREE.Vector2 };

// Why two passes and not one draw into two attachments: ANGLE on Direct3D 11
// (Chrome and Edge on Windows) links every program for a single colour output
// and, the first time it draws into two attachments, recompiles its pixel
// shader synchronously — 20–200 ms per program on a first visit, seconds per
// scene. A scene material still declares both outputs; in the colour pass its
// aux output simply has nowhere to go. For the aux pass it gets a twin that
// shares its uniforms and writes gAux as its only output.
const AUX_DECL = /layout\s*\(\s*location\s*=\s*1\s*\)\s*out\s+highp\s+vec4\s+gAux\s*;/;
const MAIN = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)/;
const twins = new WeakMap<THREE.Material, THREE.Material | null>();

function auxTwin(m: THREE.Material): THREE.Material | null {
  let twin = twins.get(m);
  if (twin !== undefined) return twin;
  twin = null;
  const s = m as THREE.ShaderMaterial;
  if (s.isShaderMaterial && AUX_DECL.test(s.fragmentShader) && MAIN.test(s.fragmentShader)) {
    const t = s.clone();
    t.uniforms = s.uniforms;
    t.defines = s.defines;
    // coverage came from the colour's alpha; the aux alpha carries the ink id
    t.alphaToCoverage = false;
    t.fragmentShader =
      s.fragmentShader.replace(AUX_DECL, "highp vec4 gAux = vec4(0.0);").replace(MAIN, "void gbufMain()") +
      `\nvoid main() {\n  gbufMain();\n${s.alphaToCoverage ? "  if (gl_FragColor.a < 0.5) discard;\n" : ""}  gl_FragColor = gAux;\n}\n`;
    twin = t;
  }
  twins.set(m, twin);
  return twin;
}

type Drawable = THREE.Object3D & { material?: THREE.Material | THREE.Material[] };

const mixFrag = /* glsl */ `
${common}
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uK;
uniform int uMode;
uniform vec2 uCenter; // px (GL, y up)
uniform vec2 uRes;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 px = gl_FragCoord.xy;
  float m;
  vec2 off = vec2(0.0);
  float edge = 0.0;
  if (uMode == 0) {
    // a wobbly ring runs out from the cursor; the water bends at its front
    vec2 d = px - uCenter;
    float r = length(d);
    float ang = atan(d.y, d.x);
    float maxR = length(max(uCenter, uRes - uCenter)) * 1.08;
    float R = uK * maxR * (1.0 + 0.045 * sin(ang * 6.0 + uTime * 3.0) + 0.025 * sin(ang * 11.0 - uTime * 2.0));
    float x = r - R;
    m = smoothstep(3.0, -3.0, x);
    float band = exp(-x * x / (2.0 * 55.0 * 55.0));
    off = (d / max(r, 1.0)) * band * 26.0 * (1.0 - uK);
    edge = exp(-x * x / (2.0 * 4.0 * 4.0)) * (1.0 - uK) * 0.9;
  } else {
    // ink: a noisy front sweeping across with a bright lip
    float n = fbm2(px / uRes.y * 5.0 + 3.1, 4);
    float g = (px.x / uRes.x) * 0.55 + (px.y / uRes.y) * 0.25 + n * 0.5;
    float x = g - (uK * 1.6 - 0.3);
    m = smoothstep(0.02, -0.02, x);
    edge = exp(-x * x / (2.0 * 0.012 * 0.012)) * 0.8;
  }
  vec3 a = texture2D(tA, vUv + off / uRes).rgb;
  vec3 b = texture2D(tB, vUv - off / uRes * 0.6).rgb;
  vec3 c = mix(a, b, m) + vec3(0.85, 0.95, 1.2) * edge;
  gl_FragColor = vec4(c, 1.0);
}`;

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly gl: WebGL2RenderingContext;
  readonly timer: GpuTimer;
  width = 1;
  height = 1;
  /** G-buffer colour and aux, each its own MSAA target (see auxTwin). */
  gbuf!: THREE.WebGLRenderTarget;
  gaux!: THREE.WebGLRenderTarget;
  lit!: THREE.WebGLRenderTarget;
  private swapped: Drawable[] = [];
  private swappedMat: (THREE.Material | THREE.Material[])[] = [];
  private hidden: THREE.Object3D[] = [];
  private clearKeep = new THREE.Color();
  /** Per-scene lit buffers while two scenes cross (allocated on first use). */
  private litA: THREE.WebGLRenderTarget | null = null;
  private litB: THREE.WebGLRenderTarget | null = null;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private inkPass: FullscreenPass;
  private mixPass: FullscreenPass;
  private downPass: FullscreenPass;
  private upPass: FullscreenPass;
  private composite: FullscreenPass;
  private tier: Tier;
  readonly post = defaultPost();
  /** Yachiyo's film (video or poster), colour stacked over pop-out alpha. */
  heroTexture: THREE.Texture | null = null;
  /** Display-space copy of a frame (for the title shatter). */
  capture: THREE.WebGLRenderTarget | null = null;
  time = 0;
  private bloomNow = 1;
  private seaNow = 1;

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

    this.inkPass = new FullscreenPass(
      passMaterial(inkFrag, {
        tColor: { value: null },
        tAux: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uWidth: { value: 1.4 },
        uInk: { value: new THREE.Color(0.012, 0.018, 0.05) },
        uInkKeep: { value: 0.22 },
        uInkFade: { value: new THREE.Vector2(260, 900) },
        uCrease: { value: 1 },
        uRes: { value: new THREE.Vector2() },
        uRimCol: { value: new THREE.Color(0.62, 0.8, 1.0) },
        uMoonScreen: { value: new THREE.Vector3() },
        uRimWidth: { value: 3 },
        uGain: { value: 1 },
        uDebug: { value: Number(new URLSearchParams(location.search).get("dbg") ?? 0) },
      }),
    );
    this.mixPass = new FullscreenPass(
      passMaterial(mixFrag, {
        tA: { value: null },
        tB: { value: null },
        uK: { value: 0 },
        uMode: { value: 0 },
        uCenter: { value: new THREE.Vector2() },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
      }),
    );
    this.downPass = new FullscreenPass(passMaterial(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uKaris: { value: 0 } }));
    this.upPass = new FullscreenPass(passMaterial(upFrag, { tSmall: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() } }));
    this.composite = new FullscreenPass(
      passMaterial(compositeFrag, {
        tLit: { value: null },
        tBloom: { value: null },
        tSoft: { value: null },
        tHero: { value: null },
        uRes: { value: new THREE.Vector2() },
        uTime: { value: 0 },
        uStepTime: { value: 0 },
        uExposure: { value: 1 },
        uBloom: { value: 0.2 },
        uBloomNorm: { value: 1 / 6 },
        uSea: { value: 1 },
        uMono: { value: 0 },
        uWater: { value: 0 },
        uFlood: { value: 0 },
        uFloodLine: { value: 1 },
        uBlot: { value: new THREE.Vector4() },
        uBlotMode: { value: 0 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
        uFade: { value: 0 },
        uVignette: { value: 0.2 },
        uGrain: { value: 0.01 },
        uDark: { value: 0 },
        uCalm: { value: 0 },
        uFocus: { value: new THREE.Vector3() },
        uHero: { value: 0 },
        uHeroInv: { value: new THREE.Matrix3() },
        uHeroBand: { value: new THREE.Vector4(HERO_BAND.x, HERO_BAND.y, 0.012, 0.01) },
        uHeroShadow: { value: new THREE.Vector2() },
        uHeroShadowCol: { value: new THREE.Color(0.02, 0.04, 0.16) },
        uHeroWave: { value: 1 },
        uHeroSeam: { value: 0 },
        uRampA: { value: RAMP[0] },
        uRampB: { value: RAMP[1] },
        uRampC: { value: RAMP[2] },
        uRampD: { value: RAMP[3] },
        uRampE: { value: RAMP[4] },
      }),
    );
  }

  setTier(tier: Tier) {
    const rebuild = tier.msaa !== this.tier.msaa || tier.bloomLevels !== this.tier.bloomLevels;
    this.tier = tier;
    if (rebuild && this.gbuf) this.allocate(this.width, this.height);
  }

  private makeGbuf(w: number, h: number, nearest: boolean) {
    // aux must not blend its depth across edges when sampled with offsets
    const filter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      samples: this.tier.msaa,
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: filter,
      magFilter: filter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    rt.resolveDepthBuffer = false;
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  }

  /**
   * Run `draw` with every material under `root` swapped for its aux twin
   * (objects without one are hidden), then put everything back.
   */
  private withAux<T>(root: THREE.Object3D, draw: () => T): T {
    const objs = this.swapped;
    const mats = this.swappedMat;
    const hidden = this.hidden;
    root.traverse((o: Drawable) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) {
        objs.push(o);
        mats.push(m);
        o.material = m.map((x) => auxTwin(x)) as THREE.Material[];
        return;
      }
      const twin = auxTwin(m);
      if (twin) {
        objs.push(o);
        mats.push(m);
        o.material = twin;
      } else if (o.visible) {
        hidden.push(o);
        o.visible = false;
      }
    });
    try {
      return draw();
    } finally {
      for (let i = 0; i < objs.length; i++) objs[i].material = mats[i];
      for (const o of hidden) o.visible = true;
      objs.length = mats.length = hidden.length = 0;
    }
  }

  /** The aux pass: clear to "far, no ink" and draw the twins. */
  private drawAux(root: THREE.Object3D, camera: THREE.Camera) {
    const r = this.renderer;
    r.setRenderTarget(this.gaux);
    const alpha = r.getClearAlpha();
    r.getClearColor(this.clearKeep);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.setClearColor(this.clearKeep, alpha);
    this.withAux(root, () => r.render(root, camera));
  }

  private allocate(w: number, h: number) {
    this.gbuf?.dispose();
    this.gaux?.dispose();
    this.lit?.dispose();
    this.litA?.dispose();
    this.litB?.dispose();
    this.litA = this.litB = null;
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    this.gbuf = this.makeGbuf(w, h, false);
    this.gaux = this.makeGbuf(w, h, true);
    this.lit = hdrTarget(w, h);
    this.down = [];
    this.up = [];
    let bw = w >> 1;
    let bh = h >> 1;
    for (let i = 0; i < this.tier.bloomLevels && bw >= 4 && bh >= 4; i++) {
      this.down.push(hdrTarget(bw, bh));
      this.up.push(hdrTarget(bw, bh));
      bw >>= 1;
      bh >>= 1;
    }
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
    if (w === this.width && h === this.height && this.gbuf) return false;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.allocate(w, h);
    return true;
  }

  private bloom() {
    const r = this.renderer;
    const dm = this.downPass.material;
    let src = this.lit.texture;
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
    let small = this.down[n - 1].texture;
    for (let i = n - 2; i >= 0; i--) {
      um.uniforms.tSmall.value = small;
      um.uniforms.tCur.value = this.down[i].texture;
      um.uniforms.uTexel.value.set(1 / this.down[i + 1].width, 1 / this.down[i + 1].height);
      this.upPass.render(r, this.up[i]);
      small = this.up[i].texture;
    }
    return this.up[0].texture;
  }

  /** Draw one frame into `capture` instead of the screen and return it. */
  captureFrame(f: Frame): THREE.Texture {
    if (!this.capture || this.capture.width !== this.width || this.capture.height !== this.height) {
      this.capture?.dispose();
      this.capture = new THREE.WebGLRenderTarget(this.width, this.height, { depthBuffer: false, stencilBuffer: false });
      this.capture.texture.colorSpace = THREE.NoColorSpace;
    }
    this.render({ ...f, overlay: undefined }, this.capture);
    return this.capture.texture;
  }

  /** The shatter: shards (and confetti) over a flat colour, nothing else. */
  renderPlain(layers: [THREE.Scene, THREE.Camera][], clear: THREE.Color) {
    const r = this.renderer;
    this.timer.beginFrame();
    r.setRenderTarget(null);
    r.setClearColor(clear, 1);
    r.clear(true, false, false);
    for (const [scene, camera] of layers) r.render(scene, camera);
  }

  /** Warm up every program a scene uses (without drawing it to the screen). */
  async compile(f: Frame) {
    const r = this.renderer;
    f.before?.();
    r.setRenderTarget(this.gbuf);
    const colour = r.compileAsync(f.opaque, f.camera);
    r.setRenderTarget(this.gaux);
    // compileAsync gathers its materials synchronously, so the twins can go straight back
    const aux = this.withAux(f.opaque, () => r.compileAsync(f.opaque, f.camera));
    r.setRenderTarget(this.lit);
    const fx = f.fx ? r.compileAsync(f.fx, f.camera) : null;
    r.setRenderTarget(null);
    await Promise.all([colour, aux, fx]);
  }

  /**
   * Draw one part of a scene off screen (hidden or not, in view or not), so
   * its buffers, textures and draw-time shader variants are on the GPU
   * before the scene first crosses in. The next real frame overwrites it all.
   */
  upload(f: Frame, part: THREE.Object3D, fx: boolean) {
    const r = this.renderer;
    const { visible, frustumCulled } = part;
    part.visible = true;
    part.frustumCulled = false;
    f.before?.();
    if (fx) {
      fxShared.tAux.value = this.gaux.texture;
      r.setRenderTarget(this.lit);
      r.render(part, f.camera);
    } else {
      r.setRenderTarget(this.gbuf);
      r.render(part, f.camera);
      r.setRenderTarget(this.gaux);
      this.withAux(part, () => r.render(part, f.camera));
    }
    part.visible = visible;
    part.frustumCulled = frustumCulled;
    r.setRenderTarget(null);
  }

  /** G-buffer → ink (+ rim) → fx, into `out`. */
  private scene(f: Frame, out: THREE.WebGLRenderTarget) {
    const r = this.renderer;
    const t = this.timer;
    f.before?.();
    const look = f.look ?? {};
    t.begin("scene");
    r.setRenderTarget(this.gbuf);
    r.clear(false, true, false);
    r.render(f.opaque, f.camera);
    t.end();

    t.begin("aux");
    this.drawAux(f.opaque, f.camera);
    t.end();

    t.begin("ink");
    const im = this.inkPass.material.uniforms;
    im.tColor.value = this.gbuf.texture;
    im.tAux.value = this.gaux.texture;
    im.uTexel.value.set(1 / this.width, 1 / this.height);
    im.uWidth.value = (look.inkWidth ?? 1.4) * Math.max(1.0, this.height / 1000);
    im.uInkFade.value.set(...(look.inkFade ?? [260, 900]));
    im.uRimCol.value.copy(look.rim ?? RIM);
    im.uGain.value = look.exposure ?? 1;
    im.uRes.value.set(this.width, this.height);
    im.uRimWidth.value = 3.2 * Math.max(1, this.height / 1000);
    // where the moon sits on screen (the rims face it)
    if (f.lightDir) {
      const cam = f.camera as THREE.PerspectiveCamera;
      _v.copy(f.lightDir).multiplyScalar(1000).add(cam.position).project(cam);
      const front = _v.z < 1;
      im.uMoonScreen.value.set((_v.x * 0.5 + 0.5) * this.width, (_v.y * 0.5 + 0.5) * this.height, front ? 1 : 0);
    } else im.uMoonScreen.value.set(0, 0, 0);
    this.inkPass.render(r, out);
    t.end();

    if (f.fx && f.fx.children.length) {
      t.begin("fx");
      fxShared.tAux.value = this.gaux.texture;
      r.setRenderTarget(out);
      r.render(f.fx, f.camera);
      t.end();
    }
  }

  render(f: Frame, target: THREE.WebGLRenderTarget | null = null) {
    this.timer.beginFrame();
    fxShared.uRes.value.set(this.width, this.height);
    this.scene(f, this.lit);
    this.bloomNow = f.look?.bloom ?? 1;
    this.seaNow = f.look?.sea ?? 1;
    this.finish(f, target);
  }

  /** Two scenes at once: `a` fades out, `b` in, by `mix.k` (0 → 1). */
  renderMix(a: Frame, b: Frame, mix: Mix) {
    this.timer.beginFrame();
    fxShared.uRes.value.set(this.width, this.height);
    if (!this.litA) this.litA = hdrTarget(this.width, this.height);
    if (!this.litB) this.litB = hdrTarget(this.width, this.height);
    this.scene(a, this.litA);
    this.scene(b, this.litB);
    const t = this.timer;
    t.begin("mix");
    const m = this.mixPass.material.uniforms;
    m.tA.value = this.litA.texture;
    m.tB.value = this.litB.texture;
    m.uK.value = mix.k;
    m.uMode.value = mix.mode;
    m.uCenter.value.copy(mix.center);
    m.uRes.value.set(this.width, this.height);
    m.uTime.value = this.time;
    this.mixPass.render(this.renderer, this.lit);
    t.end();
    this.bloomNow = THREE.MathUtils.lerp(a.look?.bloom ?? 1, b.look?.bloom ?? 1, mix.k);
    this.seaNow = THREE.MathUtils.lerp(a.look?.sea ?? 1, b.look?.sea ?? 1, mix.k);
    this.finish(b, null);
  }

  private finish(f: Frame, target: THREE.WebGLRenderTarget | null) {
    const r = this.renderer;
    const t = this.timer;
    t.begin("post");
    const bloomTex = this.bloom();
    const u = this.composite.material.uniforms;
    const p = this.post;
    u.tLit.value = this.lit.texture;
    u.tBloom.value = bloomTex;
    u.tSoft.value = (this.up[1] ?? this.up[0]).texture;
    u.tHero.value = this.heroTexture;
    u.uRes.value.set(this.width, this.height);
    u.uTime.value = this.time;
    u.uStepTime.value = Math.floor(this.time * 9) / 9;
    u.uExposure.value = p.exposure;
    u.uBloom.value = p.bloom * this.bloomNow;
    u.uSea.value = this.seaNow;
    u.uBloomNorm.value = 1 / Math.max(1, this.down.length);
    u.uMono.value = p.mono;
    u.uWater.value = p.water;
    u.uFlood.value = p.flood;
    u.uFloodLine.value = p.floodLine;
    u.uBlot.value.copy(p.blot);
    u.uBlotMode.value = p.blotMode;
    u.uFlash.value = p.flash;
    u.uFlashColor.value.copy(p.flashColor);
    u.uFade.value = p.fade;
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uDark.value = p.dark;
    u.uCalm.value = p.calm;
    u.uFocus.value.copy(p.focus);
    u.uHero.value = this.heroTexture ? p.hero : 0;
    u.uHeroInv.value.copy(p.heroInv);
    u.uHeroBand.value.set(HERO_BAND.x, HERO_BAND.y, p.heroBorder.x, p.heroBorder.y);
    u.uHeroShadow.value.copy(p.heroShadow);
    u.uHeroWave.value = p.heroWave;
    u.uHeroSeam.value = p.heroSeam;
    this.composite.render(r, target);
    if (f.overlay && !target) r.render(f.overlay, f.overlayCamera ?? f.camera);
    t.end();
  }
}

const RIM = new THREE.Color(0.62, 0.8, 1.0);
