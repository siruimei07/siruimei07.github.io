import * as THREE from "three";
import { COMMON, globals } from "./globals.ts";

// The entry dive, rendered in screen space straight into the HDR buffer (so
// bloom, fringing and grading apply). It is laid out on the reference clip's
// own clock `uV` (seconds):
//   0.00–0.70  black
//   0.72       a warm light appears at the end of a dark, dusty tunnel
//   0.75–1.85  it swells into a bright opening ringed with glitter and hair
//   1.85–2.05  we pass through: its rim flies outward as a teal ring
//   2.05–3.95  a teal chamber: membranes rushing past, radial streaks, hair
//              filaments, an oil-slick sheen and a warm fan of spray
//   3.95–5.10  glassy sheets of water sweep in until they fill the view
//   5.05–5.47  they break apart into bokeh; the light swells into a sun
//              with spectral rays and burns everything to white

export function createTunnel() {
  const uniforms = {
    ...globals,
    uV: { value: 0 },
    uAspect: { value: 1 },
    uPx: { value: 0.002 }, // one pixel in shader units (2 / height)
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform float uV;
      uniform float uAspect;
      uniform float uPx;
      varying vec2 vUv;

      const float TAU = 6.28318531;

      mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

      // Thin-film interference colours (oil on water).
      vec3 film(float t) { return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67))); }

      // Anti-aliased iso-line of a field, about w pixels wide.
      float isoLine(float f, float level, float w) {
        float d = abs(f - level) / max(fwidth(f), 1e-5);
        return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0, d);
      }

      // Motes flying out of the tunnel. A log-polar grid makes their motion
      // pure perspective; each cell holds at most one mote, smeared along the
      // radius by the speed. Returns brightness (0..~1).
      float motes(float an, float lr, float r, float scroll, float K, float M, float dens, float blur, float sizePx, float seed) {
        vec2 g = vec2(an * K, (lr - scroll) * M);
        float px = uPx * sizePx;
        float acc = 0.0;
        for (int j = 0; j < 3; j++) {
          vec2 cell = vec2(floor(g.x), floor(g.y) - float(j));
          float h = hash12(cell + seed);
          if (h > dens) continue;
          vec2 pc = cell + vec2(0.3 + 0.4 * hash12(cell + seed + 3.1), hash12(cell + seed + 7.7));
          float dl = (g.y - pc.y) / M; // log-radius from the head
          float along = r * max(dl, 0.0) + r * max(-dl - blur, 0.0);
          float perp = r * (g.x - pc.x) / K * TAU;
          float sz = px * (0.6 + 1.2 * fract(h * 91.7));
          float d = length(vec2(perp, along));
          float head = mix(0.35, 1.0, clamp((dl + blur) / max(blur, 1e-4), 0.0, 1.0));
          acc += smoothstep(sz + uPx, sz * 0.3, d) * head * (0.35 + 0.65 * fract(h * 57.3));
        }
        return acc;
      }

      // Round, soft out-of-focus droplets (same grid, no smear). Radii stay
      // inside their cell so no disc is clipped.
      float bokeh(float an, float lr, float r, float scroll, float K, float M, float dens, float seed) {
        vec2 g = vec2(an * K, (lr - scroll) * M);
        float arc = r * TAU / K;
        float acc = 0.0;
        for (int j = 0; j < 3; j++) {
          vec2 cell = vec2(floor(g.x), floor(g.y) - float(j));
          float h = hash12(cell + seed);
          if (h > dens) continue;
          float rad = min(uPx * (4.0 + 11.0 * fract(h * 37.1)) * (0.5 + r), arc * 0.3);
          float ox = mix(0.3, 0.7, hash12(cell + seed + 3.3));
          vec2 pc = cell + vec2(ox, hash12(cell + seed + 7.7));
          float dl = (g.y - pc.y) / M;
          float perp = r * (g.x - pc.x) / K * TAU;
          float d = length(vec2(perp, r * dl));
          float disc = smoothstep(rad, rad * 0.7, d);
          acc += disc * (0.55 + 0.45 * smoothstep(rad * 0.4, rad, d)) * (0.35 + 0.65 * fract(h * 13.3));
        }
        return acc;
      }

      void main() {
        float V = uV;
        vec3 col = vec3(0.0);
        if (V < 0.66) { gl_FragColor = vec4(col, 1.0); return; }

        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0) * 2.0;
        // A slow roll, as if carried by a current.
        p = rot(0.2 * sin(V * 0.55) + 0.05 * V) * p;
        vec2 c = vec2(0.035 + 0.05 * sin(V * 1.3 + 0.4), -0.05 + 0.05 * sin(V * 0.8 + 2.0));
        vec2 d = p - c;
        float r = length(d);
        float a = atan(d.y, d.x);
        float an = a / TAU + 0.5;
        float lr = log(r + 1e-4);
        // Forward travel, accelerating (in log-radius units).
        float travel = 0.55 * V + 0.16 * V * V;

        float appear = smoothstep(0.68, 0.8, V);
        float wB = smoothstep(1.83, 2.03, V); // teal chamber
        float wL = smoothstep(3.7, 4.1, V) * (1.0 - smoothstep(4.98, 5.2, V)); // water sheets
        float wS = smoothstep(4.95, 5.12, V); // break-out and sun

        // ── Tunnel walls: big patches of a textured surface, smeared into
        // radial streaks by the speed (streaks only away from the centre).
        float wz = lr * 0.32 - travel * 0.2;
        float anW = an + V * 0.035 + 0.03 * sin(V * 0.9);
        float patchK = smoothstep(0.42, 0.72, fbm(vec2(anW * 2.0, wz * 0.5 + V * 0.12 + 0.1)));
        float blot = fbm(vec2(anW * 6.0, wz * 0.9 + 0.4));
        float str = fbm(vec2(anW * 16.0, wz * 0.45 + 0.3));
        float str2 = fbm(vec2(anW * 40.0, wz * 0.3 + 0.7));
        float streaks = pow(str * str2 * 2.0, 2.0) * smoothstep(0.15, 0.6, r) * mix(0.2, 0.6, wB);
        float wall = patchK * (0.25 + 0.9 * blot * blot + 1.4 * streaks);
        float lit = exp(-r * 2.2) * smoothstep(0.04, 0.2, r) + 0.12;
        vec3 wallA = mix(vec3(0.05, 0.07, 0.055), mix(vec3(0.2, 0.17, 0.11), vec3(0.08, 0.16, 0.12), smoothstep(1.2, 1.6, V)), lit);
        vec3 wallB = mix(vec3(0.04, 0.12, 0.12), vec3(0.14, 0.26, 0.25), lit);
        float edgeFade = mix(smoothstep(1.3, 0.35, r), 1.0, wB);
        col += mix(wallA, wallB, wB) * wall * edgeFade * (0.3 + 0.9 * lit) * appear * (1.0 - wS * 0.8) * (1.0 - smoothstep(3.4, 4.1, V) * 0.6);
        // A green-teal haze drifting through the chamber.
        float haze = fbm(vec2(an * 2.0, wz * 0.5 + V * 0.05) + 4.3);
        col += vec3(0.03, 0.1, 0.07) * smoothstep(0.5, 0.8, haze) * smoothstep(0.2, 0.9, r) * wB * (1.0 - wS);

        // ── The light at the end: an oval opening that swells, then (after we
        // pass through) a small far light, then the sun at the end.
        float rA = mix(0.075, 0.27, smoothstep(0.74, 1.85, V));
        float rCore = mix(rA, 0.065, wB);
        float rS = 0.1 + 0.8 * max(V - 5.02, 0.0);
        rCore = mix(rCore, rS, wS);
        vec2 dd = d * vec2(1.0, mix(mix(0.78, 0.9, wB), mix(0.82, 1.0, smoothstep(5.3, 5.42, V)), wS));
        float rr = length(dd);
        float edgeN = fbm(vec2(an * 4.0, V * 0.25)) - 0.5;
        float hairN = fbm(vec2(an * 64.0, V * 0.15)) - 0.5;
        float re = rCore * (1.0 + edgeN * 0.4 * (1.0 - wS * 0.8) + hairN * 0.3 * (1.0 - wB));
        float disc = smoothstep(re + uPx * 2.0 + re * 0.3 * smoothstep(5.22, 5.42, V), re * 0.88, rr);
        vec3 coreCol = mix(vec3(1.0, 0.68, 0.28), vec3(0.95, 0.94, 0.88), smoothstep(1.2, 1.75, V));
        float bubbleK = smoothstep(1.35, 1.7, V) * (1.0 - wB);
        coreCol = mix(coreCol, vec3(0.92, 0.88, 0.76), bubbleK);
        coreCol = mix(coreCol, vec3(1.0, 0.93, 0.92), wB);
        coreCol = mix(coreCol, vec3(1.0, 0.8, 0.72), wS);
        float inner = 0.75 + 0.5 * fbm(dd / max(re, 0.02) * 0.35 + vec2(V * 0.12, 0.3));
        // The sun-to-be is a pearl: pink-white above, salmon in its lower part.
        float pearl = mix(1.0, mix(1.0, 0.36, smoothstep(-0.2, 0.9, -dd.y / max(re, 1e-3))), wS * (1.0 - smoothstep(5.32, 5.42, V)));
        col = mix(col, coreCol * mix(mix(mix(2.1, 0.7, bubbleK), 7.0, wB), mix(1.15, 2.2, smoothstep(5.25, 5.42, V)), wS) * inner * pearl, disc * appear);
        col += vec3(0.25, 0.55, 0.42) * exp(-pow((rr - re * 1.05) / (re * 0.1 + uPx), 2.0)) * bubbleK * 0.3;
        float gl = exp(-max(rr - re, 0.0) / max(re * (1.0 - wS * 0.7), 0.03) * 2.6);
        vec3 glowCol = mix(mix(vec3(1.0, 0.56, 0.2), vec3(0.5, 0.56, 0.42), smoothstep(1.2, 1.6, V)), coreCol, wB);
        col += glowCol * (gl * mix(mix(0.9, 0.45, bubbleK), 1.4, wB) * (1.0 - wS * 0.75) + exp(-r * mix(3.0, 4.0, wB)) * mix(0.2, 0.12, wB) * (1.0 - wS)) * appear;
        // Orange fringe on the limb of the sun.
        float limbK = smoothstep(5.25, 5.4, V);
        col += vec3(1.0, 0.42, 0.1) * exp(-abs(rr - re) / (re * 0.07 + uPx)) * 3.0 * limbK;

        // ── The rim of the opening flying outward as we pass through.
        float passK = smoothstep(1.78, 2.2, V);
        if (passK > 0.0 && passK < 1.0) {
          float R = mix(0.27, 1.6, passK * passK);
          float Rn = R * (1.0 + (texture2D(uNoise, vec2(an, 0.13)).r - 0.5) * 0.3);
          float ring = exp(-pow((r - Rn) / (R * 0.03 + uPx * 2.0), 2.0));
          float arcs = smoothstep(0.35, 0.65, fbm(vec2(an * 3.0, 2.0)));
          col += vec3(0.3, 0.85, 0.75) * ring * 0.7 * (1.0 - passK) * arcs;
        }

        // ── Membranes rushing past: faint teal rings, one after another.
        if (wB > 0.0) {
          for (int k = 0; k < 4; k++) {
            float fk = float(k);
            float z = 1.0 - fract(travel * 0.16 + fk * 0.25);
            float R = 0.07 / max(z, 0.02);
            float vis = smoothstep(0.02, 0.2, z) * smoothstep(1.0, 0.75, z);
            float Rn = R * (1.0 + (textureLod(uNoise, vec2(an + fk * 0.37, fk * 0.61), 0.0).r - 0.5) * 0.3);
            float w = R * 0.02 + uPx * 1.2;
            float ring = exp(-pow((r - Rn) / w, 2.0));
            float ring2 = exp(-pow((r - Rn * 0.84) / (w * 0.6), 2.0)) * 0.3;
            float body = smoothstep(Rn, Rn * 0.8, r) * 0.03;
            float bright = smoothstep(0.4, 0.72, dot(textureLod(uNoise, vec2(an * 3.0, fk * 1.7), 0.0), vec4(0.5333, 0.2667, 0.1333, 0.0667))) * 0.65;
            col += (vec3(0.32, 0.86, 0.78) * (ring + ring2) * bright + vec3(0.1, 0.3, 0.28) * body) * vis * wB * (1.0 - wS);
          }
        }

        // ── Hair: long thin filaments streaming out and curling. Iso-lines of
        // the smoothest noise octave give long, clean curves.
        {
          float fr = lr * 0.22 - travel * 0.16;
          float warp = (texture2D(uNoise, vec2(an * 1.0, fr * 0.6 + 0.71)).r - 0.5) * 0.4;
          float F = texture2D(uNoise, vec2(an * 2.0 + warp, fr + 0.23)).r;
          float F2 = texture2D(uNoise, vec2(an * 3.0 - warp, fr * 1.3 + 0.61)).r;
          float lines = isoLine(F, 0.42, 1.0) + isoLine(F, 0.58, 1.0) + isoLine(F2, 0.5, 1.0) * wB;
          float seg = smoothstep(mix(0.6, 0.5, wB), mix(0.72, 0.64, wB), fbm(vec2(an * 2.0 + 0.5, lr * 0.35 - travel * 0.25 + 3.7)));
          // Loops that wrap around the light.
          vec2 q = d * rot(V * 0.3) / (r + 0.35) * 0.55 + vec2(0.0, travel * 0.02);
          float G = texture2D(uNoise, q + 0.113).r;
          float loops = isoLine(G, 0.5, 1.0) * smoothstep(0.55, 0.68, fbm(q * 2.0 + 5.1));
          float amt = mix(0.35, 1.0, wB) * (1.0 - wS) * appear * (1.0 - wL * 0.5);
          vec3 hairCol = mix(vec3(1.0, 0.6, 0.28), vec3(0.85, 0.95, 0.95), wB);
          col += hairCol * (lines * seg + loops * wB * 0.25) * amt * 1.2 * smoothstep(0.12, 0.35, r);
        }

        // ── Oil-slick sheen, low on the right.
        {
          float k = smoothstep(2.35, 2.8, V) * (1.0 - smoothstep(3.45, 3.95, V));
          if (k > 0.0) {
            float fr = lr * 0.35 - travel * 0.2;
            float mask = smoothstep(0.45, 0.65, fbm(vec2(an * 2.0 + 0.61, fr * 0.8 + 1.9)));
            float sector = smoothstep(0.24, 0.06, abs(fract(an - 0.42 + 0.5) - 0.5));
            vec2 oq = d * 1.4 / (0.4 + r) + vec2(0.0, -travel * 0.05);
            vec2 ow = vec2(fbm(oq + 1.7), fbm(oq + 8.3)) - 0.5;
            float th = dot(texture2D(uNoise, oq * 0.35 + ow * 0.5 + 0.29).rg, vec2(0.7, 0.3)) * 1.25 + 0.05;
            float fth = fract(th);
            vec3 sheen = mix(vec3(0.85, 0.4, 0.16), vec3(0.14, 0.26, 0.58), smoothstep(0.15, 0.45, fth));
            sheen = mix(sheen, vec3(0.14, 0.5, 0.48), smoothstep(0.55, 0.75, fth));
            sheen = mix(sheen, vec3(0.85, 0.4, 0.16), smoothstep(0.85, 1.0, fth));
            sheen *= 0.25 + 1.0 * smoothstep(0.35, 0.7, fbm(oq * 2.2 + ow + 5.5));
            col += sheen * mask * sector * k * 0.6 * smoothstep(0.12, 0.45, r);
          }
        }

        // ── A warm fan of spray, up and to the right.
        {
          float k = smoothstep(2.1, 2.45, V) * (1.0 - smoothstep(3.55, 4.05, V));
          if (k > 0.0) {
            float fr = lr * 0.25 - travel * 0.3;
            float rays = pow(fbm(vec2(an * 64.0, fr * 0.4 + 0.2)), 3.0) * 5.0 + pow(fbm(vec2(an * 24.0, fr * 0.3)), 2.0);
            float sector = smoothstep(0.11, 0.02, abs(fract(an - 0.6 + 0.5) - 0.5));
            col += vec3(1.0, 0.52, 0.44) * rays * sector * k * 0.3 * smoothstep(0.06, 0.18, r) * smoothstep(1.2, 0.4, r);
          }
        }

        // ── Dust and glitter.
        {
          float scroll = travel * 0.5;
          float blur = clamp((0.55 + 0.32 * V) * 0.09, 0.03, 0.4);
          float clump = smoothstep(0.55, 0.78, fbm(vec2(an * 2.0, lr * 0.4 - scroll * 0.3) + 1.3));
          float m = motes(an, lr, r, scroll, 240.0, 9.0, 0.006 + 0.2 * clump, blur, 1.2, 0.0)
                  + motes(an, lr, r, scroll * 1.3, 150.0, 7.0, 0.004 + 0.12 * clump, blur * 1.3, 1.5, 17.0);
          // Glitter crowding round the light, heaviest just below it.
          float below = 0.5 + 0.5 * smoothstep(0.3, -0.6, d.y / max(r, 1e-3));
          float g = motes(an, lr, r, scroll * 0.6, 320.0, 14.0, 0.12, blur * 0.3, 1.0, 41.0) * exp(-r * 4.0) * 2.2 * below;
          vec3 dustCol = mix(vec3(1.0, 0.88, 0.62), vec3(0.88, 0.97, 0.95), wB);
          col += dustCol * (m * 1.1 + g) * appear * (1.0 - wS * 0.9) * smoothstep(0.03, 0.12, r);
        }

        // ── Glassy sheets of water sweeping in from the edges: big smooth
        // shapes, dark teal glass with bright banded edges and fine crinkles.
        if (wL > 0.0) {
          float zoom = exp((V - 4.0) * 0.7);
          vec2 q = rot(-0.35 * (V - 4.0)) * d / zoom;
          vec2 w = vec2(texture2D(uNoise, q * 0.3 + vec2(0.2, 0.3)).r, texture2D(uNoise, q * 0.3 + vec2(0.41, 0.7)).r) - 0.5;
          vec4 nq = texture2D(uNoise, q * 0.16 + w * 0.12 + vec2(0.13, 0.71));
          float S = nq.r * 0.75 + nq.g * 0.25 + (abs(d.x) - 0.7) * 0.14 + (r - 0.55) * 0.05;
          float thr = mix(0.66, 0.55, smoothstep(3.8, 4.9, V)) + 0.3 * smoothstep(4.95, 5.18, V);
          float fw = fwidth(S);
          float sheet = smoothstep(thr - fw, thr + fw, S);
          // Treat the sheet as a height field: a plateau with rounded edges
          // plus ripples, lit as glass (specular + fresnel), streaked by speed.
          float streakG = fbm(vec2(an * 20.0, lr * 1.2 - travel * 0.3 + 0.6));
          float h = smoothstep(thr, thr + 0.09, S) + (fbm(q * 1.6 + w + 3.3) - 0.5) * 0.18 + streakG * 0.08;
          vec2 gh = vec2(dFdx(h), dFdy(h)) / uPx * 0.06;
          vec3 N = normalize(vec3(-gh, 1.0));
          vec3 L = normalize(vec3(-0.45, 0.55, 0.7));
          float spec = pow(max(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 50.0);
          float fres = pow(1.0 - N.z, 2.0);
          float cr = 1.0 - abs(2.0 * fbm(q * 2.4 + w * 1.5 + 6.1) - 1.0);
          float crinkle = pow(cr, 16.0) * smoothstep(0.4, 0.65, fbm(q * 0.9 + 2.2));
          vec3 glass = vec3(0.02, 0.075, 0.08) * (0.5 + 1.1 * streakG) + vec3(0.02, 0.07, 0.075) * max(dot(N, L), 0.0);
          glass += vec3(0.8, 0.97, 0.97) * (pow(spec, 1.6) * 2.5 + pow(fres, 2.5) * 0.9 + crinkle * 1.2);
          float foam = smoothstep(0.68, 0.78, fbm(q * 0.7 + w + 9.1)) * smoothstep(4.3, 4.6, V);
          glass = mix(glass, vec3(0.78, 0.86, 0.87) * (0.8 + 0.5 * cr), foam * 0.85);
          col = mix(col, glass + col * 0.35, sheet * wL);
          col += vec3(0.85, 1.0, 1.0) * isoLine(S, thr + 0.006, 1.3) * 0.9 * wL;
          // Between the sheets: a web of bright droplets on the dark.
          float net = pow(1.0 - abs(2.0 * fbm(q * 4.0 + w * 2.0 + 1.9) - 1.0), 24.0) * smoothstep(0.4, 0.7, fbm(q * 1.3 + 7.7));
          col += vec3(0.7, 0.9, 0.9) * net * (1.0 - sheet) * smoothstep(4.4, 4.85, V) * wL * 0.7;
        }

        // ── Breaking out: bokeh droplets, splashes and spectral rays.
        if (wS > 0.0) {
          // Torn fragments of the sheets flying past: bright, glossy shards.
          float wF = smoothstep(5.08, 5.2, V) * (1.0 - smoothstep(5.28, 5.38, V));
          if (wF > 0.0) {
            vec2 q = rot(0.6) * d / exp((V - 5.0) * 2.2);
            float Fr = fbm(vec2(an * 5.0, lr * 0.6 - (V - 5.0) * 1.2) + fbm(q * 1.4) * 0.3) + exp(-r * 2.2) * 0.14 - 0.08;
            float frag = smoothstep(0.62, 0.63, Fr) * smoothstep(rCore * 1.02, rCore * 1.25, r);
            float hf = smoothstep(0.62, 0.67, Fr);
            vec2 gf = vec2(dFdx(hf), dFdy(hf)) / uPx * 0.05;
            vec3 Nf = normalize(vec3(-gf, 1.0));
            float sf = pow(max(dot(Nf, normalize(vec3(-0.3, 0.4, 1.0))), 0.0), 30.0);
            vec3 shard = mix(vec3(0.1, 0.24, 0.25), vec3(0.8, 0.9, 0.9), smoothstep(0.62, 0.72, Fr)) * 1.3 + vec3(0.95, 1.0, 1.0) * (sf * 2.5 + pow(1.0 - Nf.z, 1.5) * 2.0);
            col = mix(col, shard, frag * wF);
          }
          float scroll = travel * 0.8;
          float b = bokeh(an, lr, r, scroll, 40.0, 4.0, 0.3, 3.0) + bokeh(an, lr, r, scroll * 1.2, 28.0, 3.0, 0.25, 9.0);
          col += vec3(1.0, 0.88, 0.8) * b * 1.1 * wS * smoothstep(0.02, 0.15, r - rCore);
          float k = smoothstep(5.28, 5.42, V);
          float rays = pow(fbm(vec2(an * 24.0, 0.37 + V * 0.2)), 8.0) * 60.0 + pow(fbm(vec2(an * 64.0, 0.8)), 10.0) * 120.0;
          float hw = exp(-pow(sin(a) / 0.33, 2.0));
          float fall = exp(-max(r - rCore, 0.0) * 1.6) * smoothstep(rCore * 1.02, rCore * 1.2, r);
          col += film(r * 1.6 - V * 0.5 + 0.1) * rays * hw * fall * k * 0.14;
          col += vec3(1.0, 0.6, 0.35) * exp(-max(r - rCore, 0.0) / (rCore * 0.12)) * k * 0.6;
          // Wide glare as the light swallows the view.
          col += vec3(1.0, 0.86, 0.72) * exp(-max(r - rCore, 0.0) / 0.3) * smoothstep(5.28, 5.46, V) * 1.4;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(tri, material);
  mesh.frustumCulled = false;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  return {
    uniforms,
    render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget) {
      renderer.setRenderTarget(target);
      renderer.render(mesh, cam);
    },
  };
}
