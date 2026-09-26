import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";

export const MOON_RADIUS = THREE.MathUtils.degToRad(1.75); // angular radius

// The maria are painted as the mochi-pounding moon rabbit (月の兎), softened
// and broken up with blotches so it reads as lunar terrain first.
function createMoonTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, size, size);
  const rnd = mulberry32(7);

  // R: maria (dark seas)
  g.filter = "blur(9px)";
  g.fillStyle = "rgba(255,0,0,0.85)";
  const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    g.fill();
  };
  ell(196, 280, 64, 82, -0.2); // body
  ell(170, 188, 40, 36); // head
  ell(132, 112, 15, 60, -0.55); // ears
  ell(168, 102, 14, 58, -0.2);
  ell(248, 250, 40, 16, -0.5); // arms
  ell(338, 352, 58, 34); // mortar
  ell(338, 392, 34, 26);
  g.save();
  g.translate(300, 232);
  g.rotate(0.6);
  g.fillRect(-8, -70, 16, 120); // pestle
  ell(0, -76, 26, 16);
  g.restore();
  g.fillStyle = "rgba(255,0,0,0.35)";
  for (let i = 0; i < 26; i++) ell(rnd() * size, rnd() * size, 18 + rnd() * 50, 14 + rnd() * 40, rnd() * 3);

  // G: bright young craters with ray systems
  g.filter = "blur(1.5px)";
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 1.5 + rnd() * rnd() * 11;
    g.strokeStyle = `rgba(0,${120 + rnd() * 120},0,0.9)`;
    g.lineWidth = 1 + r * 0.25;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
  }
  g.filter = "blur(2px)";
  g.strokeStyle = "rgba(0,90,0,0.35)";
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const l = 40 + rnd() * 120;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(300, 440);
    g.lineTo(300 + Math.cos(a) * l, 440 + Math.sin(a) * l);
    g.stroke();
  }
  g.fillStyle = "rgba(0,255,0,1)";
  ell(300, 440, 7, 7);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}

export function createSky() {
  const moonDir = globals.uMoonDir.value;
  const right = new THREE.Vector3().crossVectors(moonDir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, moonDir).normalize();
  // Celestial pole for the star trails: below the horizon, far to the left
  // of the gate, so the trails sweep across the frame as long steep arcs.
  const pole = new THREE.Vector3(-0.93, -0.22, -0.3).normalize();
  const e1 = new THREE.Vector3(0, 0, -1).addScaledVector(pole, pole.z).normalize(); // φ = 0 faces the gate
  const e2 = new THREE.Vector3().crossVectors(pole, e1).normalize();

  const uniforms = {
    ...globals,
    uMoonTex: { value: createMoonTexture() },
    uMoonRight: { value: right },
    uMoonUp: { value: up },
    uMoonCos: { value: Math.cos(MOON_RADIUS) },
    uMoonSin: { value: Math.sin(MOON_RADIUS) },
    uMoonPulse: { value: 0 },
    // The Milky Way lies on the great circle perpendicular to this axis.
    uGalaxyAxis: { value: new THREE.Vector3(0.62, 0.45, 0.64).normalize() },
    uPole: { value: pole },
    uPoleE1: { value: e1 },
    uPoleE2: { value: e2 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        gl_Position.z = gl_Position.w * 0.999999; // pin to the far plane
      }
    `,
    fragmentShader: /* glsl */ `
      ${COMMON}
      uniform sampler2D uMoonTex;
      uniform vec3 uMoonRight;
      uniform vec3 uMoonUp;
      uniform float uMoonCos;
      uniform float uMoonSin;
      uniform float uMoonPulse;
      uniform vec3 uGalaxyAxis;
      uniform vec3 uPole;
      uniform vec3 uPoleE1;
      uniform vec3 uPoleE2;
      varying vec3 vWorld;

      float starAt(vec3 d, float thresh, out vec3 tint) {
        vec3 sp = d * 260.0;
        vec3 cell = floor(sp);
        float h = hash13(cell);
        tint = mix(vec3(0.75, 0.83, 1.0), vec3(1.0, 0.92, 0.8), hash13(cell + 2.2));
        if (h <= thresh) return 0.0;
        vec3 off = vec3(hash13(cell + 1.7), hash13(cell + 4.1), hash13(cell + 9.3)) - 0.5;
        float dd = length(fract(sp) - 0.5 - off * 0.6);
        return smoothstep(0.09, 0.0, dd) * (h - thresh) / (1.0 - thresh);
      }

      // Star trails, as in a time-lapse at nightfall: stars sit on rings
      // around the pole and each draws an arc as long as the exposure
      // (uTrail seconds). Tails fade from the back as the exposure ends.
      vec3 trails(vec3 dir) {
        float psi = acos(clamp(dot(dir, uPole), -1.0, 1.0));
        float phi = atan(dot(dir, uPoleE2), dot(dir, uPoleE1));
        const float BAND = 0.0045;
        const float SEG = 0.05;
        float pxPsi = max(fwidth(psi), 1e-6);
        float pxPhi = max(fwidth(phi), 1e-6);
        float len = max(min(uTrail, 4.2) * 0.058, pxPhi * 1.5);
        float dens = 0.09 * sin(psi);
        vec3 acc = vec3(0.0);
        for (int layer = 0; layer < 2; layer++) {
          float off = float(layer) * 0.5;
          float bi = floor(psi / BAND + off);
          for (int k = 0; k < 6; k++) {
            vec2 cell = vec2(bi, floor(phi / SEG) - float(k));
            vec2 hc = cell + float(layer) * 31.7;
            float h = hash12(hc);
            if (h > dens) continue;
            float psiS = (bi - off + 0.2 + 0.6 * hash12(hc + 3.3)) * BAND;
            float phiS = (cell.y + hash12(hc + 7.1)) * SEG;
            float along = phi - phiS;
            if (along < -pxPhi || along > len + pxPhi) continue;
            float line = smoothstep(1.25, 0.3, abs(psi - psiS) / pxPsi);
            float ends = smoothstep(-pxPhi, 0.0, along) * smoothstep(-pxPhi, 0.0, len - along);
            float u = along / len;
            float tail = smoothstep(uTrailTail * 1.1 - 0.1, uTrailTail * 1.1, u);
            float hh = hash12(hc + 11.9);
            vec3 tint = hh < 0.48 ? vec3(0.22, 0.95, 0.85) : hh < 0.78 ? vec3(0.35, 0.72, 1.0) : hh < 0.96 ? vec3(0.36, 0.42, 1.0) : vec3(0.85, 0.95, 1.0);
            acc += tint * (0.8 + 1.8 * hash12(hc + 5.5)) * line * ends * tail * mix(0.8, 1.0, u);
          }
        }
        return acc;
      }

      // Cumulus towers: the height of the cloud tops (in cloud units, 10 per
      // radian) at azimuth x. Two great towers frame the gate and the moon.
      float cloudTop(float x) {
        float n1 = textureLod(uNoise, vec2(x * 0.016 + 0.13, 0.41), 0.0).r;
        float n2 = textureLod(uNoise, vec2(x * 0.05 + 0.57, 0.83), 0.0).g;
        float towers = 1.2 * smoothstep(0.5, 0.8, n1);
        towers = max(towers, 2.6 * exp(-pow((x + 4.4) / 1.5, 2.0)));
        towers = max(towers, 2.0 * exp(-pow((x - 3.3) / 1.1, 2.0)));
        towers *= 1.0 - exp(-pow(x / 1.3, 2.0)) * 0.85;
        return 0.12 + towers + 0.4 * n2 * n2;
      }

      // A union of spheres seen side-on: the front-most puff gives the normal
      // (xyz), w = how far inside the silhouette we are (cloud units).
      vec4 cumulus(vec2 P, out float topHere) {
        topHere = cloudTop(P.x);
        float inside = -1.0;
        vec3 N = vec3(0.0, 0.0, 1e-4);
        for (int o = 0; o < 3; o++) {
          float cell = o == 0 ? 0.62 : o == 1 ? 0.31 : 0.16;
          float seed = float(o) * 13.7;
          vec2 ci = floor(P / cell);
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 c = ci + vec2(float(i), float(j));
              vec2 ctr = (c + 0.2 + 0.6 * vec2(hash12(c + seed), hash12(c + seed + 5.3))) * cell;
              float depth = cloudTop(ctr.x) - ctr.y;
              float rad = cell * (0.6 + 0.35 * hash12(c + seed + 9.1));
              rad *= smoothstep(-0.3 * cell, 0.3 * cell, depth) * step(-0.2, ctr.y);
              if (o > 0) rad *= smoothstep(cell * 5.0, cell * 1.5, depth);
              vec2 d = P - ctr;
              float z2 = rad * rad - dot(d, d);
              if (z2 > 0.0) {
                // Soft union: normals blend where puffs meet, so the towers
                // read as billows rather than a heap of balls.
                float z = sqrt(z2) + (o == 0 ? 0.0 : 0.12 * cell);
                inside = max(inside, z2 / (2.0 * rad));
                N += vec3(d, sqrt(z2)) / rad * exp(z * 22.0);
              }
            }
          }
        }
        return vec4(normalize(N), inside);
      }

      void main() {
        vec3 dir = normalize(vWorld - cameraPosition);
        float up = dir.y;
        float md = dot(dir, uMoonDir);
        float mg = max(md, 0.0);
        float night = 1.0 - uDusk;

        // Night: navy, a little lighter toward the horizon. Dusk: lavender
        // blue overhead, pink toward the horizon, the earth's shadow low.
        vec3 nightCol = mix(vec3(0.008, 0.05, 0.1), vec3(0.002, 0.022, 0.062), smoothstep(0.0, 0.55, up));
        nightCol = mix(fogTint(dir), nightCol, smoothstep(-0.02, 0.05, up));
        float sn = max(dot(dir, uSunDir), 0.0);
        vec3 duskCol = mix(vec3(0.66, 0.38, 0.44), vec3(0.13, 0.17, 0.5), smoothstep(0.02, 0.42, up));
        duskCol = mix(duskCol, vec3(0.07, 0.1, 0.34), smoothstep(0.42, 0.9, up));
        duskCol += vec3(0.3, 0.14, 0.18) * exp(-abs(up - 0.05) * 14.0) * (1.0 - sn);
        duskCol += uSunColor * (pow(sn, 3.0) * 0.6 + pow(sn, 24.0) * 1.2 + pow(sn, 900.0) * 14.0);
        // The sky darkens a beat before the clouds lose the sun.
        float skyDusk = smoothstep(0.55, 1.0, uDusk);
        float cloudDusk = smoothstep(0.15, 0.8, uDusk);
        vec3 col = mix(nightCol, duskCol, skyDusk);
        col += cityGlow(dir) * smoothstep(-0.02, 0.02, up);

        float moonHide = 1.0 - smoothstep(0.9, 0.995, md);
        float skyMask = smoothstep(0.0, 0.18, up) * night;
        float still = 1.0 - uTrailFade;

        // Milky Way: a faint dusty band with dark lanes.
        float band = dot(dir, uGalaxyAxis);
        float gw = exp(-band * band / 0.018);
        vec2 guv = vec2(atan(dir.x, dir.z) / 6.28318 * 3.0, band * 2.0);
        float dust = fbm(guv * vec2(1.0, 1.6) + 0.3);
        float lanes = smoothstep(0.42, 0.62, fbm(guv * vec2(2.2, 3.5) + 1.7));
        vec3 galaxy = mix(vec3(0.55, 0.65, 0.95), vec3(0.95, 0.88, 0.75), smoothstep(0.3, 0.0, abs(band))) * gw;
        col += galaxy * (0.012 + dust * 0.03) * (1.0 - lanes * 0.7) * skyMask * moonHide * still;

        // Still stars, and the trails that stand in for them at nightfall.
        if (skyMask > 0.001) {
          vec3 tint;
          float s = starAt(dir, mix(0.982, 0.955, gw), tint);
          float tw = 0.7 + 0.3 * sin(uTime * 1.3 + dir.x * 400.0);
          col += tint * s * 0.9 * tw * skyMask * moonHide * still;
        }
        if (uTrailFade > 0.001 && up > -0.02) {
          // The dark water does not mirror the faint trails.
          col += trails(dir) * uTrailFade * smoothstep(-0.02, 0.06, up) * mix(1.0, moonHide, uMoonK) * (1.0 - uReflecting);
        }

        // The moon rises into view only once the sky has darkened.
        float moonK = uMoonK * (1.0 + uMoonPulse);
        col += vec3(0.85, 0.9, 0.98) * (pow(mg, 18.0) * 0.025 + pow(mg, 160.0) * 0.09 + pow(mg, 900.0) * 0.22 + pow(mg, 4000.0) * 0.9) * moonK;
        float ang = acos(clamp(md, -1.0, 1.0));
        float haloR = asin(uMoonSin) * 3.1;
        col += vec3(0.7, 0.78, 0.9) * exp(-pow((ang - haloR) / 0.012, 2.0)) * 0.012 * uMoonK * (1.0 + uMoonPulse * 3.0);
        if (md > uMoonCos - 0.002) {
          vec2 p = vec2(dot(dir, uMoonRight), dot(dir, uMoonUp)) / uMoonSin;
          float r = length(p);
          float aa = fwidth(r) * 1.5;
          float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
          float z = sqrt(max(1.0 - r * r, 0.0));
          vec4 m = texture2D(uMoonTex, vec2(p.x, -p.y) * 0.5 + 0.5);
          float detail = fbm(p * 0.7 + 0.13) * 0.6 + fbm(p * 2.3 + 0.7) * 0.4;
          float alb = 0.95 - m.r * 0.4 + m.g * 0.3 - (detail - 0.5) * 0.3;
          float limb = mix(0.6, 1.0, pow(z, 0.45));
          vec3 moonCol = vec3(1.0, 0.96, 0.9) * alb * limb * 2.8 * moonK;
          col = mix(col, moonCol + col * 0.4, disc * uMoonK);
        }

        // A moonlit cloud deck: soft dark masses with silver edges where they
        // face the moon, parting in a clear patch around it.
        if (up > 0.03) {
          vec2 base = dir.xz / (up + 0.2) * 0.4;
          vec2 drift = vec2(uTime * 0.0035, uTime * 0.0012);
          vec2 cq = base + drift;
          float d1 = fbm(cq) * 0.72 + fbm(cq * 2.6 + 1.3) * 0.38;
          vec2 moonQ = uMoonDir.xz / (uMoonDir.y + 0.2) * 0.4;
          vec2 toward = normalize(moonQ - base + 1e-4);
          float d2 = fbm(cq + toward * 0.06) * 0.72 + fbm((cq + toward * 0.06) * 2.6 + 1.3) * 0.38;
          float clear = 1.0 - 0.9 * exp(-pow(acos(clamp(md, -1.0, 1.0)) / 0.13, 2.0));
          float dens = smoothstep(0.5, 0.74, d1) * clear * smoothstep(0.03, 0.16, up);
          if (dens > 0.001) {
            float rim = clamp((d1 - d2) * 9.0, 0.0, 1.0);
            float near = pow(mg, 5.0);
            vec3 nightDeck = vec3(0.008, 0.024, 0.044) + vec3(0.1, 0.15, 0.2) * rim * (0.25 + 2.5 * near) * uMoonK + vec3(0.05, 0.07, 0.09) * near * uMoonK;
            vec3 duskDeck = mix(vec3(0.5, 0.32, 0.48), vec3(1.05, 0.66, 0.6), rim);
            col = mix(col, mix(nightDeck, duskDeck, cloudDusk), dens * mix(0.82, 0.35, cloudDusk));
          }
        }

        // Thin, high wisps.
        if (up > 0.0) {
          vec2 cuv = dir.xz / (up + 0.12) * vec2(0.05, 0.12) + vec2(uTime * 0.0022, uTime * 0.0006);
          float n = fbm(cuv);
          float n2 = fbm(cuv * vec2(3.1, 2.2) + 0.37);
          float dens = smoothstep(0.55, 0.82, n * 0.7 + n2 * 0.4);
          dens *= smoothstep(0.08, 0.16, up) * (1.0 - smoothstep(0.3, 0.5, up));
          vec3 cloudN = vec3(0.012, 0.025, 0.05) + uMoonColor * pow(mg, 22.0) * 0.5;
          vec3 cloudD = vec3(0.95, 0.66, 0.6);
          col = mix(col, mix(cloudN, cloudD, cloudDusk) + uFlash * 0.35, dens * 0.48);
        }

        // Cumulus towers on the horizon: cream and salmon with mauve shadows
        // at dusk; deep navy with moonlit rims at night.
        if (up > -0.03 && up < 0.3) {
          vec2 P = vec2(atan(dir.x, -dir.z), asin(up)) * 10.0;
          float topHere;
          vec4 cu = cumulus(P, topHere);
          float px = max(fwidth(P.y), 1e-4);
          float cover = smoothstep(0.0, px * 1.5 + 0.015, cu.w);
          if (cover > 0.0) {
            // Billow detail breaks up the smooth puffs.
            vec2 bd = vec2(fbm(P * 2.6 + 0.3), fbm(P * 2.6 + 4.1)) - 0.5;
            vec3 N = normalize(cu.xyz + vec3(bd * 0.9, 0.0));
            float hgt = clamp(P.y / max(topHere, 0.2), 0.0, 1.0);
            float lam = dot(N, normalize(vec3(-0.66, 0.7, 0.28))) * 0.5 + 0.5;
            // Painted cumulus: mauve shadows, salmon body, cream on the
            // sunlit bulges, darker and pinker toward the base.
            vec3 dC = mix(vec3(0.46, 0.2, 0.36), vec3(1.5, 0.52, 0.3), smoothstep(0.3, 0.66, lam));
            dC = mix(dC, vec3(2.6, 1.72, 0.98), smoothstep(0.64, 0.9, lam) * (0.25 + 0.75 * hgt));
            dC *= mix(0.5, 1.0, smoothstep(0.0, 0.55, hgt));
            float rim = pow(1.0 - N.z, 2.5) * smoothstep(-0.3, 0.8, N.y);
            vec3 nC = vec3(0.004, 0.022, 0.055) * (0.55 + 0.7 * lam) + vec3(0.06, 0.1, 0.16) * rim * (0.6 + 1.4 * pow(mg, 6.0) * uMoonK);
            vec3 cc = mix(nC, dC, cloudDusk) + uFlash * 0.3;
            // Their feet dissolve into the haze on the horizon.
            cc = mix(cc, col, exp(-max(P.y, 0.0) * 2.2) * 0.7);
            col = mix(col, cc, cover);
          }
        }

        // Low haze lying on the horizon.
        col += mix(vec3(0.02, 0.045, 0.08), vec3(0.3, 0.2, 0.28), uDusk) * exp(-abs(up) * 30.0) * (0.35 + 0.65 * pow(mg, 3.0)) * 0.6;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), material);
  mesh.frustumCulled = false;
  // Drawn after the other opaques: its depth sits on the far plane, so early-z
  // skips the sky shader wherever water or geometry covers it.
  mesh.renderOrder = 100;
  mesh.layers.enable(REFLECT_LAYER);

  return { mesh, uniforms };
}

// A few hundred brighter stars as sprites so they can twinkle softly.
export function createStars(count = 700) {
  const rnd = mulberry32(42);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const seed = new Float32Array(count);
  const moon = globals.uMoonDir.value;
  const v = new THREE.Vector3();
  let i = 0;
  while (i < count) {
    v.set(rnd() * 2 - 1, rnd() * 1.1 - 0.05, rnd() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
    v.normalize();
    if (v.y < 0.05 || v.dot(moon) > 0.97) continue;
    pos.set([v.x * 4600, v.y * 4600, v.z * 4600], i * 3);
    const mag = Math.pow(rnd(), 6);
    size[i] = 1.4 + mag * 5;
    const t = rnd();
    const c = t < 0.25 ? [1.0, 0.86, 0.72] : t < 0.7 ? [0.78, 0.86, 1.0] : [0.95, 0.95, 1.0];
    const b = 0.5 + mag * 3.2;
    col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    seed[i] = rnd();
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: globals,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      ${COMMON}
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      varying vec3 vColor;
      varying float vSpike;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w * 0.99999;
        vec3 dir = normalize(position);
        float tw = 0.65 + 0.35 * sin(uTime * (0.7 + aSeed * 2.0) + aSeed * 60.0);
        vColor = aColor * tw * smoothstep(0.04, 0.25, dir.y) * (1.0 - uDusk) * (1.0 - uTrailFade);
        vSpike = smoothstep(4.5, 6.4, aSize);
        gl_PointSize = aSize * uPixelRatio * (1.0 + vSpike);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vSpike;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float core = exp(-dot(p, p) * mix(9.0, 26.0, vSpike));
        float spikes = (exp(-abs(p.x) * 34.0) * (1.0 - abs(p.y)) + exp(-abs(p.y) * 34.0) * (1.0 - abs(p.x))) * vSpike;
        gl_FragColor = vec4(vColor * (core + spikes * 0.35), 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = -9;
  points.layers.enable(REFLECT_LAYER);
  return points;
}
