import { common } from "../engine/glsl";

// Background of the warp tunnel, timed on the reference clip's clock
// (uT = seconds into 载入动画.mov). Layers, back to front:
//   cave        dark olive-teal organic walls scrolling outward (0.7–2.3 s)
//   membranes   dark translucent teal sheets with brushed radial striations,
//               bright rims and oil-film iridescence (2.0–5.0 s)
//   streaks     radial motion-blurred light fibres (1.7–5.1 s)
//   flow lines  thin filaments wrapping around the bubble, from the stream
//               function of flow past a sphere (1.8–4.9 s)
//   bubble      glassy sphere around the core, with sparkles inside
//   ring        the membrane opening we dive through (1.5–2.3 s)
//   core        warm lamp → white core → a sun with spectral rays (5.0–5.4 s)
export const tunnelBgFrag = /* glsl */ `
${common}
uniform float uT;
uniform vec2 uRes;
uniform vec2 uCore;
uniform float uTravel;
varying vec2 vUv;

float band(float x, float w) { return exp(-x * x / (w * w)); }

vec3 thinFilm(float d) {
  return 0.5 + 0.5 * cos(TAU * (d * vec3(1.0, 1.1, 1.2) + vec3(0.0, 0.33, 0.67)));
}
// Oil on dark water: orange-brown <-> teal <-> steel blue.
vec3 oilFilm(float d) {
  float x = fract(d);
  vec3 c = mix(vec3(1.0, 0.45, 0.14), vec3(0.2, 0.62, 0.62), smoothstep(0.15, 0.5, x));
  c = mix(c, vec3(0.3, 0.42, 0.85), smoothstep(0.55, 0.8, x));
  return mix(c, vec3(1.0, 0.45, 0.14), smoothstep(0.85, 1.0, x));
}

float fbmP(vec2 p) { return fbm2(p, 5); }

void main() {
  float T = uT;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vUv - uCore) * asp;
  float r = length(p);
  float a = atan(p.y, p.x);
  vec2 dir = p / max(r, 1e-4);
  // Tunnel depth coordinate: things far away sit near the core.
  float z = 0.32 / max(r, 0.015) + uTravel;

  float wCave = smoothstep(0.62, 0.9, T) * (1.0 - smoothstep(1.9, 2.5, T));
  float wTunnel = smoothstep(1.75, 2.35, T) * (1.0 - smoothstep(4.85, 5.2, T));
  float wSun = smoothstep(5.02, 5.28, T);
  float wRays = smoothstep(5.3, 5.4, T);
  float wHalo = smoothstep(5.26, 5.4, T);
  vec3 col = vec3(0.0);

  // --- cave: dark folds around the lamp (neutral, barely visible)
  float lr = log(max(r, 1e-3));
  if (wCave > 0.0) {
    // Infinite zoom: two noise layers an octave apart, cross-faded, so the
    // folds swell outward as we move forward without radial smearing.
    float zt = uTravel * 0.35;
    float ph = fract(zt);
    float sc0 = exp2(-ph);
    vec2 qa = p * 2.2 * sc0 + 3.7;
    vec2 qb = p * 4.4 * sc0 + 9.1;
    float n = mix(fbmP(qb), fbmP(qa), ph);
    float n2 = fbmP(p * 5.0 * sc0 + n * 1.2 + 4.0 + floor(zt));
    float mass = smoothstep(0.45, 0.8, n * 0.6 + n2 * 0.45);
    vec3 cc = mix(vec3(0.004, 0.004, 0.0035), vec3(0.018, 0.017, 0.013), mass);
    // Warm light grazing the folds near the lamp.
    cc += vec3(0.05, 0.032, 0.014) * pow(n2, 3.0) * exp(-r * 7.0);
    col += cc * wCave;
  }

  // --- inside the tunnel: mostly darkness; a zoom-blurred nebula of fine
  // striations hugging the core, and an oil-film swirl lower right.
  if (wTunnel > 0.0) {
    float depth = lr * 2.2 - uTravel * 0.5;
    // Fine hair-like radial striations, patchy.
    float fine = vnoise(vec2(a * 260.0, depth * 0.7)) * vnoise(vec2(a * 90.0 + 3.0, depth * 1.3));
    float coarse = fbm2(vec2(a * 3.0, depth * 0.45) + 7.0, 4);
    float patchy = smoothstep(0.42, 0.78, coarse);
    float halo = exp(-r / 0.24) * 2.1 + exp(-r / 0.7) * 0.35;
    vec3 neb = mix(vec3(0.07, 0.13, 0.13), vec3(0.13, 0.12, 0.1), vnoise(vec2(a * 5.0, depth * 0.3)));
    vec3 mc = neb * (0.25 + 1.6 * fine) * patchy * halo * smoothstep(0.03, 0.08, r);
    // Faint translucent sheets further out, lit only along their edges.
    vec2 sq = vec2(cos(a), sin(a)) * (2.0 - lr * 0.6) + vec2(uTravel * 0.2, 0.0);
    float sh = fbmP(sq * 1.1 + 11.0);
    float edgeL = band(sh - 0.62, 0.02) * smoothstep(0.12, 0.4, r);
    mc += vec3(0.14, 0.24, 0.24) * edgeL * 0.18;
    // Oil film: marbled orange / teal / blue, lower right.
    vec2 w = p * 3.2 + vec2(fbm2(p * 4.0 + T * 0.3, 3), fbm2(p * 4.0 + 5.0 - T * 0.25, 3)) * 1.8;
    float marble = fbm2(w + vec2(0.0, uTravel * 0.05), 4);
    float irMask = smoothstep(0.52, 0.72, fbm2(p * 2.4 + vec2(3.0, T * 0.2), 3));
    irMask *= smoothstep(-0.15, 0.7, dot(dir, normalize(vec2(0.75, -0.66)))) * smoothstep(0.12, 0.35, r) * smoothstep(1.1, 0.5, r);
    irMask *= smoothstep(2.25, 2.7, T) * (1.0 - smoothstep(3.9, 4.3, T));
    vec3 film = oilFilm(marble * 1.7 + fine * 0.2);
    mc = mix(mc, film * (0.2 + 0.5 * fine) * (0.4 + marble), irMask * 0.9);
    col += mc * wTunnel;
  }

  // --- radial light fibres (motion blur)
  float wStreak = smoothstep(1.65, 2.1, T) * (1.0 - smoothstep(4.95, 5.15, T));
  if (wStreak > 0.0) {
    float ang = a * 70.0;
    float s1 = pow(vnoise(vec2(ang, floor(z * 0.3) * 13.0)), 8.0);
    float s2 = pow(vnoise(vec2(a * 140.0 + 11.0, z * 0.15)), 14.0);
    float fan = smoothstep(-0.2, 0.9, dot(dir, normalize(vec2(1.0, -0.15)))) * 0.8 + 0.25;
    float radial = smoothstep(0.06, 0.2, r) * smoothstep(1.2, 0.3, r);
    vec3 sc = mix(vec3(0.45, 0.58, 0.6), vec3(0.95, 0.55, 0.38), smoothstep(0.3, 0.8, vnoise(vec2(a * 9.0, 3.0))));
    fan = smoothstep(-0.1, 0.95, dot(dir, normalize(vec2(1.0, -0.2)))) * 0.9 + 0.08;
    col += sc * (s1 * 0.5 + s2 * 1.1) * fan * radial * wStreak * 0.08;
  }

  // --- flow lines around the bubble (stream function of flow past a sphere)
  float Rb = mix(0.095, 0.15, smoothstep(2.2, 4.2, T));
  float wFlow = smoothstep(1.85, 2.3, T) * (1.0 - smoothstep(4.6, 5.0, T));
  if (wFlow > 0.0) {
    float th = a + 0.4 * sin(T * 0.7);
    float rr = max(r, Rb * 1.02);
    float psi = (rr - Rb * Rb / rr) * sin(th) + (rr - Rb * Rb / rr) * 0.35 * cos(th * 2.0 + T * 0.5);
    psi += (fbm2(p * 3.0 + T * 0.15, 3) - 0.5) * 0.12;
    float k = 34.0;
    float lines = abs(fract(psi * k) - 0.5) * 2.0;
    float w = fwidth(psi * k) * 1.2 + 0.02;
    float ln = 1.0 - smoothstep(0.0, w * 1.5, 1.0 - lines);
    // Only some of the isolines, broken into strands.
    float keep = step(0.72, hash11(floor(psi * k) + 3.0)) * smoothstep(0.35, 0.65, vnoise(vec2(floor(psi * k) * 7.0, a * 3.0 + T)));
    float near = smoothstep(Rb * 0.95, Rb * 1.3, r) * smoothstep(0.9, 0.2, r);
    col += vec3(0.5, 0.62, 0.62) * ln * keep * near * wFlow * 0.32;
  }

  // --- bubble: glassy sphere round the core
  float wBub = smoothstep(2.0, 2.4, T) * (1.0 - smoothstep(4.7, 5.0, T));
  if (wBub > 0.0) {
    float d = r / Rb;
    float rimB = band(d - 1.0, 0.06) * 0.22 * (0.4 + vnoise(vec2(a * 6.0, T))) + band(d - 0.9, 0.2) * 0.12;
    float spark = pow(vnoise(p * 180.0 + T * 3.0), 14.0) * step(d, 1.0) * 3.0;
    float swirl = pow(abs(sin((a * 3.0 + d * 9.0 - T * 2.0))), 30.0) * step(d, 1.0) * 0.35;
    col += vec3(0.4, 0.55, 0.55) * (rimB + swirl) * wBub * 0.5 + vec3(0.9, 0.95, 1.0) * spark * wBub * smoothstep(1.0, 0.3, d) * 0.5;
  }

  // --- membrane ring we dive through
  float wRing = smoothstep(1.45, 1.7, T) * (1.0 - smoothstep(2.15, 2.35, T));
  if (wRing > 0.0) {
    float Rr = mix(0.12, 0.95, pow(smoothstep(1.5, 2.3, T), 1.7));
    float wob = 0.05 * sin(a * 2.0 + T * 3.0) + 0.03 * sin(a * 5.0 - T * 5.0) + 0.04 * (vnoise(vec2(a * 4.0, T * 2.0)) - 0.5);
    float d = r - Rr * (1.0 + wob);
    float rim = band(d, 0.02 + Rr * 0.04) * (0.6 + 0.8 * vnoise(vec2(a * 12.0, T * 3.0)));
    float inner = smoothstep(0.02, -0.08, d);
    vec3 rc = vec3(0.015, 0.055, 0.04) * rim + vec3(0.004, 0.014, 0.011) * inner;
    rc += vec3(0.2, 0.32, 0.28) * band(d + 0.006, 0.004) * 0.18 * vnoise(vec2(a * 20.0, T * 4.0));
    col += rc * wRing;
    // Milky light inside the membrane, brightest toward the core.
    col += vec3(0.16, 0.19, 0.17) * inner * exp(-r / (Rr * 0.45)) * wRing * (0.6 + 0.4 * vnoise(p * 30.0 + T));
    // Everything seen through the opening gets a teal-green cast.
    col = mix(col, col * vec3(0.75, 1.15, 1.08) + vec3(0.0, 0.008, 0.007), inner * wRing * 0.8);
  }

  // --- splash: white spray thrown out from around the core
  float wSplash = smoothstep(4.3, 4.5, T) * (1.0 - smoothstep(4.85, 5.05, T));
  if (wSplash > 0.0) {
    float age = T - 4.3;
    float front = 0.08 + age * 0.9;
    float ang = a * 11.0 + vnoise(vec2(a * 4.0, 1.0)) * 6.0;
    float tend = pow(vnoise(vec2(ang, 2.0)), 3.0);
    float sheetS = smoothstep(front, front * 0.4, r) * smoothstep(0.05, 0.12, r);
    float foam = fbm2(p * 18.0 + vec2(age * 3.0, 0.0), 4);
    float spray = smoothstep(0.55, 0.8, foam) * tend * sheetS;
    float drops = pow(vnoise(p * 90.0 + age * 5.0), 18.0) * smoothstep(front * 1.3, front * 0.3, r) * 6.0;
    col += (vec3(0.75, 0.9, 0.92) * spray * 1.6 + vec3(0.9, 0.97, 1.0) * drops) * wSplash;
  }

  // --- core
  {
    float grow = smoothstep(0.7, 1.6, T);
    float Rc = mix(0.034, 0.078, grow) * (1.0 - smoothstep(1.6, 2.3, T) * 0.45);
    Rc = mix(Rc, 0.1, smoothstep(5.0, 5.2, T));
    Rc = mix(Rc, 0.17, smoothstep(5.2, 5.38, T));
    float edgeN = fbm2(vec2(a * 2.0, T * 0.8), 3) - 0.5;
    float rc = r / (Rc * (1.0 + edgeN * mix(0.7, 0.3, smoothstep(1.6, 2.2, T)) * (1.0 - wSun)));
    float disk = smoothstep(1.05, 0.85, rc);
    // Something dark crosses the light early on (a fold of the tunnel wall).
    vec2 notchC = vec2(-0.9, -0.75) * Rc;
    float notch = smoothstep(Rc * 0.95, Rc * 0.75, length(p - notchC + vec2(sin(T * 1.3), cos(T)) * Rc * 0.2));
    disk *= 1.0 - notch * (1.0 - smoothstep(1.4, 1.9, T)) * 0.9;
    float warmth = 1.0 - smoothstep(1.3, 2.0, T);
    vec3 hot = mix(vec3(1.0, 0.92, 0.8), vec3(1.0, 0.72, 0.36), warmth * 0.6);
    hot = mix(hot, vec3(1.0, 0.76, 0.72), wSun);
    // A darker peach rim on the sun disk, like the clip.
    float sunRim = smoothstep(0.7, 0.98, rc) * wSun * (1.0 - wHalo);
    hot = mix(hot, vec3(0.85, 0.55, 0.48), sunRim * 0.6);
    float on = smoothstep(0.66, 0.8, T);
    float I = mix(9.0, 5.0, smoothstep(1.7, 2.4, T));
    I = mix(I, 3.2, wSun);
    I = mix(I, 16.0, wHalo);
    col = mix(col, hot * I, disk * on);
    // Glow & glare.
    float glow = exp(-r / (Rc * 0.9)) * 1.1 + exp(-r / (Rc * 3.0)) * 0.08 + exp(-r * 4.0) * 0.008;
    col += hot * glow * on * mix(1.0, 0.55, wTunnel) * (1.0 - wSun * 0.6 + wHalo * 4.0);
    // Sun rays: spectral (chromatic) spikes.
    if (wSun > 0.0) {
      float spikes = pow(vnoise(vec2(a * 16.0, 1.0)), 7.0) * 0.5 + pow(vnoise(vec2(a * 40.0, 7.0)), 14.0) * 0.8;
      vec3 spec = thinFilm(r * 3.0 + a * 0.2);
      float rays = spikes * exp(-r * 2.2) * smoothstep(Rc * 0.8, Rc * 1.6, r);
      col += mix(vec3(1.0, 0.95, 0.92), spec * 1.4, 0.5) * rays * wRays * 1.3;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}`;
