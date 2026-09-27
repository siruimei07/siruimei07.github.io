import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { box, cyl, giboshi, hipRoof, merge, prep } from "./geo";
import { bridgeDefs, cityMapGlsl, lanternGlsl, reflectGlsl } from "./glsl";
import { BAY, DECK_Y, EDGE_X, NBAYS, POST, POST_LIGHT_Y, RAIL_X, Z_FAR, Z_NEAR } from "./layout";

// 月見橋 itself: a long wooden deck, wet from the evening rain, mirroring the
// railings, the lanterns, the torii and the city; vermilion 高欄 railings
// with bronze 擬宝珠 caps and a little lantern in every bay; and the tall
// wooden lantern post by the right railing near the viewer.

export const WARM = new THREE.Color(1.0, 0.56, 0.24);

export type CityMap = { tex: THREE.Texture; map: THREE.Vector4; eye: THREE.Vector3; gain: number };

const cityUniforms = (m: CityMap) => ({
  tCity: { value: m.tex },
  uMap: { value: m.map },
  uEye: { value: m.eye },
  uMapGain: { value: m.gain },
});

export function buildBridge(map: CityMap): THREE.Group {
  const group = new THREE.Group();
  const len = Z_NEAR - Z_FAR;

  // ------------------------------------------------------------------ deck
  const deckGeo = box(EDGE_X * 2, 0.7, len, 0, DECK_Y - 0.35, (Z_NEAR + Z_FAR) / 2);
  const deck = new THREE.Mesh(
    deckGeo,
    toonMaterial({
      color: 0x625c6c,
      shade: 0x2a2b44,
      ink: 1,
      rim: 0.2,
      step: 0.0,
      lights: 1,
      uniforms: {
        ...cityUniforms(map),
        uLanternCol: { value: WARM },
        uRailRefl: { value: new THREE.Color(0xd24a2e) },
        uSkyLo: { value: new THREE.Color(0x10224a) },
        uSkyHi: { value: new THREE.Color(0x050e28) },
        uShadowDir: { value: new THREE.Vector3(0.5, 0.52, -0.69).normalize() },
        uPostL: { value: new THREE.Vector3(POST.x, POST_LIGHT_Y, POST.z) },
      },
      fragmentHead: /* glsl */ `
        ${bridgeDefs}
        uniform vec3 uLanternCol;
        uniform vec3 uRailRefl;
        uniform vec3 uSkyLo;
        uniform vec3 uSkyHi;
        uniform vec3 uShadowDir;
        uniform vec3 uPostL;
        ${cityMapGlsl}
        ${lanternGlsl}
        ${reflectGlsl}

        float railShadow(vec3 P, vec3 L) {
          float sx = sign(L.x);
          float t = (sx * RAIL_X - P.x) / L.x;
          if (t <= 0.0) return 0.0;
          float h = t * L.y;
          float z = P.z + t * L.z;
          float pen = 0.012 + t * 0.03;
          float lant, glow;
          float s = railCover(h, z, pen, pen * 0.6, lant, glow);
          return s * (1.0 - lant);
        }

        // what a ray leaving the deck at P in direction R sees
        vec3 reflScene(vec3 P, vec3 R) {
          vec3 acc = vec3(0.0);
          float keep = 1.0;
          float tT = R.z < -1e-4 ? (TORII_Z - P.z) / R.z : 1e9;
          // 1. the railing on the side the ray heads to
          if (abs(R.x) > 1e-4) {
            float sx = sign(R.x);
            float tR = (sx * RAIL_X - P.x) / R.x;
            if (tR > 0.0 && tR < tT) {
              float h = tR * R.y;
              float z = P.z + tR * R.z;
              float lant, glow;
              float s = railCover(h, z, 0.012 + tR * 0.05, 0.006 + tR * 0.012, lant, glow);
              vec3 rc = uRailRefl * (0.08 + 0.55 * glow);
              vec3 c = mix(rc, uLanternCol * 3.0, lant);
              acc += c * s * keep;
              keep *= 1.0 - s;
              // the lantern post beyond the right railing
              if (sx > 0.0) {
                float tp = (uPostL.x - P.x) / R.x;
                float hp = tp * R.y;
                float zp = P.z + tp * R.z;
                float bl = 0.02 + tp * 0.04;
                float boxL = nearS(abs(zp - uPostL.z), 0.3, bl) * bandS(hp, uPostL.y - DECK_Y - 0.36, uPostL.y - DECK_Y + 0.36, bl);
                float pil = nearS(abs(zp - uPostL.z), 0.13, bl * 0.5) * step(hp, uPostL.y - DECK_Y);
                acc += (uLanternCol * 3.5 * boxL + vec3(0.02, 0.012, 0.012) * pil) * keep;
                keep *= 1.0 - max(boxL, pil);
              }
            }
          }
          // 2. the torii, then the gate hall behind it
          if (tT < 1e8 && keep > 0.01) {
            float x = P.x + tT * R.x;
            float h = tT * R.y;
            float bl = 0.02 + tT * 0.02;
            float black;
            float s = toriiCover(x, h, bl, black);
            vec3 tc = uRailRefl * mix(1.1, 0.35, saturate(h / TORII_H)) * 0.9;
            tc = mix(tc, vec3(0.01, 0.008, 0.012), black);
            acc += tc * s * keep;
            keep *= 1.0 - s;
            float tg = (GATE_Z - P.z) / R.z;
            vec4 g = gateLook(P.x + tg * R.x, tg * R.y, 0.03 + tg * 0.02, uLanternCol);
            acc += g.rgb * g.a * keep;
            keep *= 1.0 - g.a;
          }
          // 3. the city and the sky
          vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.6, R.y));
          float md = acos(clamp(dot(R, uMoonDir), -1.0, 1.0));
          sky += vec3(0.45, 0.58, 0.95) * exp(-md / 0.1) * 0.5;
          vec4 cm = cityMap(P, R, 0.012);
          vec3 farC = mix(sky, vec3(0.006, 0.008, 0.02) + cm.rgb, cm.a);
          // glossy moon streak: tight in azimuth, long in elevation
          float da = atan(R.x, -R.z) - atan(uMoonDir.x, -uMoonDir.z);
          float de = asin(clamp(R.y, -1.0, 1.0)) - asin(uMoonDir.y);
          farC += vec3(0.75, 0.85, 1.0) * exp(-da * da / 0.0009) * exp(-de * de / 0.08) * 1.1;
          acc += farC * keep;
          return acc;
        }
      `,
      fragment: /* glsl */ `
        if (n.y > 0.5) {
          vec3 P = vWorldPos;
          // transverse boards, two per width with a staggered butt joint
          float bz = (Z_NEAR - P.z) / 0.52;
          float bid = floor(bz);
          float bf = fract(bz);
          float hb = hash11(bid * 1.37 + 5.0);
          float jx = (hb - 0.5) * 3.2;
          float hb2 = hash12(vec2(bid, step(jx, P.x)));
          float aa = fwidth(bz);
          float farK = smoothstep(0.12, 0.45, aa);
          float seam = 1.0 - smoothstep(0.03, 0.03 + aa * 1.5, min(bf, 1.0 - bf));
          seam = mix(seam, 0.08, farK);
          float joint = (1.0 - smoothstep(0.018, 0.018 + fwidth(P.x) * 1.5, abs(P.x - jx))) * (1.0 - farK);
          float grain = vnoise(vec2(P.x * 1.1 + hb * 30.0, bz * 6.0)) * 0.6 + vnoise(vec2(P.x * 5.0, bz * 19.0 + hb * 9.0)) * 0.4;
          grain = mix(grain, 0.5, farK);
          float tone = 0.84 + 0.22 * hb2 + (grain - 0.5) * 0.2;
          // puddles (the seams hold water)
          float wet = smoothstep(0.4, 0.62, fbm2(P.xz * vec2(0.3, 0.14) + vec2(3.1, 7.7), 3));
          wet = max(wet, seam * 0.6);
          base *= tone * mix(1.0, 0.72, wet);
          shade *= tone * mix(1.0, 0.8, wet);
          base = mix(base, base * 0.45, max(seam, joint) * 0.8);
          shade = mix(shade, shade * 0.4, max(seam, joint) * 0.85);
          // the railing's moon shadow falls across the deck
          float sh = railShadow(P, uShadowDir);
          base = mix(base, shade * 1.1, sh * 0.85);
          // painted light pools under the rail lanterns
          float pool = lanternLight(P, 3.3);
          pool = floor(pool * 3.0 + 0.3) / 3.0 * 0.8 + pool * 0.3;
          emis += uLanternCol * pool * (base * 1.8 + 0.02);
          // wet sheen: the deck mirrors the railing, the lanterns, the torii, the city
          vec3 Vd = normalize(P - cameraPosition);
          vec2 jit = vec2(vnoise(P.xz * vec2(2.2, 0.9)), vnoise(P.xz * vec2(0.9, 2.6) + 4.0)) - 0.5;
          vec3 nw = normalize(vec3(jit.x * 0.035, 1.0, jit.y * 0.06));
          vec3 R = reflect(Vd, nw);
          float fres = 0.04 + 0.96 * pow(1.0 - saturate(-Vd.y), 5.0);
          emis += reflScene(P, R) * fres * mix(0.22, 0.9, wet);
        } else {
          // the fascia beam: vermilion with a dark lower band
          float yy = vWorldPos.y - DECK_Y;
          vec3 red = vec3(0.62, 0.08, 0.04);
          base = mix(vec3(0.05, 0.04, 0.06), red, step(-0.32, yy));
          shade = base * 0.35 + vec3(0.02, 0.02, 0.05);
          float g = lanternLight(vWorldPos, 2.4);
          emis += uLanternCol * g * base * 0.8;
        }
      `,
    }),
  );
  deck.frustumCulled = false;
  deck.name = "deck";
  group.add(deck);

  // ------------------------------------------------------------------ railings
  const railMat = toonMaterial({
    color: 0xc23c27,
    shade: 0x521524,
    ink: 2,
    rim: 0.75,
    step: 0.2,
    soft: 0.05,
    lights: 1,
    uniforms: { uLanternCol: { value: WARM } },
    fragmentHead: /* glsl */ `
      ${bridgeDefs}
      uniform vec3 uLanternCol;
      ${lanternGlsl}`,
    fragment: /* glsl */ `
      float g = lanternLight(vWorldPos, 2.7);
      g = floor(g * 3.0 + 0.35) / 3.0 * 0.6 + g * 0.3;
      emis += uLanternCol * g * (base * 1.2 + 0.01);
      // a little lacquer sheen on the round top rail
      float top = smoothstep(0.6, 0.9, n.y);
      base *= 1.0 + top * 0.12;`,
  });

  // one bay: the rails from z = 0 to −BAY and the post at its far end
  const bayParts = [
    (() => {
      const g = new THREE.CylinderGeometry(0.062, 0.062, BAY, 10, 1, true);
      g.rotateX(Math.PI / 2);
      g.translate(0, 1.0, -BAY / 2);
      return g;
    })(),
    box(0.085, 0.1, BAY, 0, 0.52, -BAY / 2),
    box(0.19, 0.95, 0.19, 0, 0.645, -BAY),
    box(0.23, 0.05, 0.23, 0, 1.145, -BAY),
    box(0.07, 0.37, 0.07, 0, 0.755, -BAY * 0.25),
    box(0.07, 0.37, 0.07, 0, 0.755, -BAY * 0.75),
    box(0.07, 0.3, 0.07, 0, 0.32, -BAY * 0.25),
    box(0.07, 0.3, 0.07, 0, 0.32, -BAY * 0.75),
  ].map((g) => prep(g));
  const bayGeo = merge(bayParts);
  const nb = NBAYS * 2;
  const rails = new THREE.InstancedMesh(bayGeo, railMat, nb);
  const caps = new THREE.InstancedMesh(
    giboshi(1, 14),
    toonMaterial({
      color: 0x5e9a82,
      shade: 0x1b3339,
      ink: 3,
      rim: 1.0,
      step: 0.1,
      lights: 1,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `
        ${bridgeDefs}
        uniform vec3 uLanternCol;
        ${lanternGlsl}`,
      fragment: /* glsl */ `
        float g = lanternLight(vWorldPos, 2.6);
        emis += uLanternCol * g * (base * 1.2 + 0.02);
        // verdigris streaks
        float v = vnoise(vec2(atan(vWorldPos.z - floor(vWorldPos.z), 1.0) * 8.0, vWorldPos.y * 30.0));
        base *= 0.9 + 0.2 * v;`,
    }),
    nb + 2,
  );
  const lanterns = new THREE.InstancedMesh(
    merge([prep(box(0.13, 0.2, 0.13, 0, 0.67, 0)), prep(box(0.17, 0.035, 0.17, 0, 0.787, 0)), prep(box(0.03, 0.04, 0.03, 0, 0.824, 0))]),
    toonMaterial({
      color: 0xffb070,
      shade: 0x80402c,
      ink: 4,
      rim: 0.3,
      lights: 0,
      uniforms: { uLanternCol: { value: WARM } },
      fragmentHead: /* glsl */ `
        ${bridgeDefs}
        uniform vec3 uLanternCol;
        ${lanternGlsl}`,
      fragment: /* glsl */ `
        float yy = vWorldPos.y - DECK_Y;
        float k = floor((Z_NEAR - vWorldPos.z) / BAY);
        float fl = lanternFlick(k, sign(vWorldPos.x));
        if (yy > 0.768) {
          base = vec3(0.06, 0.045, 0.05); shade = vec3(0.02, 0.018, 0.03);
          emis += uLanternCol * 0.25 * fl;
        } else {
          // paper with a thin frame; hottest in the middle
          vec2 q = abs(vec2(abs(n.x) > 0.5 ? vWorldPos.z - (Z_NEAR - (k + 0.5) * BAY) : vWorldPos.x - sign(vWorldPos.x) * RAIL_X, yy - 0.67));
          float frame = step(0.052, q.x) + step(0.088, q.y);
          float core = 1.0 - smoothstep(0.0, 0.1, q.y);
          emis += uLanternCol * fl * (1.9 + 1.8 * core) * (1.0 - 0.75 * min(frame, 1.0));
        }`,
    }),
    nb,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const s of [-1, 1]) {
    for (let k = 0; k < NBAYS; k++) {
      const z0 = Z_NEAR - k * BAY;
      m.compose(new THREE.Vector3(s * RAIL_X, DECK_Y, z0), q, one);
      rails.setMatrixAt(i, m);
      m.makeTranslation(s * RAIL_X, DECK_Y + 1.17, z0 - BAY);
      caps.setMatrixAt(i, m);
      m.makeTranslation(s * RAIL_X, DECK_Y, z0 - BAY / 2);
      lanterns.setMatrixAt(i, m);
      i++;
    }
  }
  // the big end posts at the shrine end get bigger caps
  for (const s of [-1, 1]) {
    m.compose(new THREE.Vector3(s * RAIL_X, DECK_Y + 1.52, Z_FAR), q, new THREE.Vector3(1.6, 1.6, 1.6));
    caps.setMatrixAt(i++, m);
  }
  rails.name = "rails";
  caps.name = "caps";
  lanterns.name = "lanterns";
  for (const im of [rails, caps, lanterns]) {
    im.frustumCulled = false;
    group.add(im);
  }

  // low rails (地覆) and the thick end posts
  const lowParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    lowParts.push(prep(box(0.26, 0.17, len, s * RAIL_X, DECK_Y + 0.085, (Z_NEAR + Z_FAR) / 2)));
    lowParts.push(prep(box(0.32, 1.52, 0.32, s * RAIL_X, DECK_Y + 0.76, Z_FAR)));
  }
  const low = new THREE.Mesh(merge(lowParts), railMat);
  low.frustumCulled = false;
  group.add(low);

  group.add(buildLanternPost());
  return group;
}

/** 木灯籠: a tall wooden pillar rising from the water with a paper lantern box and a little roof. */
function buildLanternPost(): THREE.Group {
  const g = new THREE.Group();
  const boxY = POST_LIGHT_Y; // centre of the light box
  const wood = 0x3b2a2c;
  const dark = 0x1a1418;
  const parts: THREE.BufferGeometry[] = [];
  const pillarTop = boxY - 0.44;
  parts.push(prep(box(0.27, pillarTop - POST.y, 0.27, 0, (pillarTop + POST.y) / 2, 0), wood));
  // a collar where it passes the deck and a brace to the railing post
  parts.push(prep(box(0.34, 0.16, 0.34, 0, DECK_Y - 0.25, 0), dark));
  parts.push(prep(box(POST.x - RAIL_X, 0.1, 0.1, -(POST.x - RAIL_X) / 2, DECK_Y + 0.3, 0), wood));
  // platform under the light box, with brackets
  parts.push(prep(box(0.74, 0.07, 0.74, 0, boxY - 0.405, 0), dark));
  parts.push(prep(box(0.5, 0.06, 0.08, 0, boxY - 0.47, 0), wood));
  parts.push(prep(box(0.08, 0.06, 0.5, 0, boxY - 0.47, 0), wood));
  // the frame of the light box
  for (const [x, z] of [
    [-0.27, -0.27],
    [0.27, -0.27],
    [-0.27, 0.27],
    [0.27, 0.27],
  ])
    parts.push(prep(box(0.055, 0.74, 0.055, x, boxY, z), dark));
  parts.push(prep(box(0.62, 0.05, 0.62, 0, boxY + 0.36, 0), dark));
  parts.push(prep(box(0.62, 0.04, 0.62, 0, boxY - 0.36, 0), dark));
  // roof and finial
  const roof = hipRoof(1.06, 1.06, 0.4, { lift: 0.09, pow: 1.5, segU: 6, segV: 4, fascia: 0.05 });
  roof.translate(0, boxY + 0.4, 0);
  parts.push(prep(roof, 0x2a2430));
  parts.push(prep(cyl(0.03, 0.05, 0.1, 8, 0, boxY + 0.78, 0), dark));
  parts.push(prep(new THREE.SphereGeometry(0.06, 10, 8).translate(0, boxY + 0.92, 0), 0x4a7c6c));
  const frame = new THREE.Mesh(
    merge(parts),
    toonMaterial({
      color: 0xffffff,
      shade: 0x5a5a78,
      ink: 7,
      rim: 0.9,
      step: 0.15,
      vertexColors: true,
      side: THREE.DoubleSide,
      uniforms: { uLanternCol: { value: WARM }, uBoxY: { value: boxY } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol; uniform float uBoxY;`,
      fragment: /* glsl */ `
        // the lantern's own glow on its frame, roof underside and pillar top
        float dy = vWorldPos.y - uBoxY;
        float nearG = exp(-dy * dy * 3.0);
        emis += uLanternCol * base * nearG * 1.6;
        if (!gl_FrontFacing) emis += uLanternCol * 0.5 * step(0.3, dy);`,
    }),
  );
  const paper = new THREE.Mesh(
    prep(box(0.5, 0.68, 0.5, 0, boxY, 0)),
    toonMaterial({
      color: 0xfff0d8,
      shade: 0xd8a070,
      ink: 8,
      rim: 0.2,
      lights: 0,
      uniforms: { uLanternCol: { value: WARM }, uBoxY: { value: boxY }, uC: { value: new THREE.Vector2(POST.x, POST.z) } },
      fragmentHead: /* glsl */ `uniform vec3 uLanternCol; uniform float uBoxY; uniform vec2 uC;`,
      fragment: /* glsl */ `
        // shoji: a kumiko lattice over glowing paper, brighter at the heart
        vec2 q = vec2(abs(n.x) > 0.5 ? vWorldPos.z - uC.y : vWorldPos.x - uC.x, vWorldPos.y - uBoxY);
        vec2 cell = abs(fract(q / vec2(0.125, 0.17) + 0.5) - 0.5);
        float bar = max(1.0 - smoothstep(0.035, 0.07, cell.x), 1.0 - smoothstep(0.035, 0.07, cell.y));
        float fl = 0.9 + 0.06 * sin(uTime * 7.3) + 0.04 * sin(uTime * 17.1 + 1.3);
        float heart = exp(-dot(q, q) * 9.0);
        emis += uLanternCol * fl * (1.8 + 3.2 * heart) * (1.0 - bar * 0.75);
        if (n.y > 0.5 || n.y < -0.5) emis *= 0.4;`,
    }),
  );
  g.add(frame, paper);
  g.position.set(POST.x, 0, POST.z);
  return g;
}
