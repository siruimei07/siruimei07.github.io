import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared, toonMaterial } from "../../engine/toon";
import { rng } from "../common/util";

// Neon: glyph icons drawn with glowing tubes — a pink octopus-ish blob, a
// green fish, a red swirl, a cat face, a cyan fish — floating in front of
// the buildings as in the film (additive, depth-tested, flickering now and
// then), and vertical signboards on the facades whose abstract, kanji-like
// strokes glow (opaque boards with emissive strokes).

export type GlyphSpec = { p: THREE.Vector3; size: number; glyph: number; color: THREE.ColorRepresentation; yaw: number; flicker?: number };
export type BoardSpec = { p: THREE.Vector3; w: number; h: number; yaw: number; color: THREE.ColorRepresentation; seed: number };

const glyphVert = /* glsl */ `
attribute vec4 aGlyph;   // glyph id, size, flicker, seed
attribute vec3 aColor;
attribute vec3 aPos;
attribute float aYaw;
uniform float uTime;
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
varying vec4 vG;
void main() {
  float s = aGlyph.y;
  vec3 right = vec3(cos(aYaw), 0.0, -sin(aYaw));
  // a gentle bob
  vec3 wp = aPos + vec3(0.0, sin(uTime * 0.8 + aGlyph.w * 6.0) * 0.08 * s, 0.0);
  wp += right * position.x * s * 1.25 + vec3(0.0, 1.0, 0.0) * position.y * s * 1.25;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy * 1.25;
  vCol = aColor;
  vG = aGlyph;
}`;

const glyphFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform float uTime;
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
varying vec4 vG;

float sdCircle(vec2 p, float r) { return length(p) - r; }
float sdEllipse(vec2 p, vec2 r) { float k = length(p / r); return (k - 1.0) * min(r.x, r.y); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

// outline distance (0 on the tube) of each glyph; dots add small filled marks
float glyph(vec2 p, float id, out float dots) {
  float d = 1e3;
  dots = 1e3;
  if (id < 0.5) {
    // octopus: round head, a skirt of four tentacle curls
    float sil = min(sdCircle(p - vec2(0.0, 0.18), 0.5), sdBox(p - vec2(0.0, -0.18), vec2(0.42, 0.26)));
    for (int i = 0; i < 4; i++) sil = min(sil, sdCircle(p - vec2(-0.36 + float(i) * 0.24, -0.46), 0.13));
    d = abs(sil);
    dots = min(sdCircle(p - vec2(-0.17, 0.2), 0.07), sdCircle(p - vec2(0.17, 0.2), 0.07));
    dots = min(dots, sdSeg(p, vec2(-0.08, 0.02), vec2(0.08, 0.02)) - 0.02);
  } else if (id < 1.5) {
    // fish: body, forked tail, eye, a gill line
    vec2 q = p - vec2(-0.5, 0.0);
    float tail = max(sdBox(q + vec2(0.2, 0.0), vec2(0.2, 0.34)), abs(q.y) - 0.1 + q.x * 1.2);
    float gill = max(abs(sdCircle(p - vec2(0.62, 0.0), 0.36)), 0.3 - p.x);
    d = min(abs(min(sdEllipse(p - vec2(0.12, 0.0), vec2(0.58, 0.32)), tail)), gill + 0.01);
    dots = sdCircle(p - vec2(0.44, 0.08), 0.06);
  } else if (id < 2.5) {
    // swirl: a curling spiral with a round head
    float r = length(p);
    float a = atan(p.y, p.x);
    for (int k = 0; k < 3; k++) {
      float th = a + 6.2832 * float(k);
      if (th < 13.0) d = min(d, abs(r - (0.1 + 0.055 * th)));
    }
    dots = sdCircle(p - vec2(0.28, 0.42), 0.07);
  } else if (id < 3.5) {
    // cat face: head, ears, eyes, whiskers
    d = abs(sdEllipse(p - vec2(0.0, -0.05), vec2(0.55, 0.45)));
    d = min(d, min(sdSeg(p, vec2(-0.48, 0.2), vec2(-0.36, 0.62)), sdSeg(p, vec2(0.48, 0.2), vec2(0.36, 0.62))));
    d = min(d, min(sdSeg(p, vec2(-0.36, 0.62), vec2(-0.14, 0.38)), sdSeg(p, vec2(0.36, 0.62), vec2(0.14, 0.38))));
    d = min(d, min(sdSeg(p, vec2(0.3, -0.12), vec2(0.7, -0.05)), sdSeg(p, vec2(-0.3, -0.12), vec2(-0.7, -0.05))));
    dots = min(sdCircle(p - vec2(-0.2, 0.0), 0.07), sdCircle(p - vec2(0.2, 0.0), 0.07));
  } else {
    // a lantern-and-wave emblem
    float wave = max(abs(p.y - 0.12 * sin(p.x * 9.0)), abs(p.x) - 0.4);
    d = min(abs(sdCircle(p, 0.55)), wave);
    dots = sdCircle(p - vec2(0.0, 0.3), 0.08);
  }
  return d;
}

void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float dots;
  float d = glyph(vQ, vG.x, dots);
  float w = 0.028;
  float core = smoothstep(w, w * 0.35, d) + smoothstep(0.02, 0.0, dots);
  float halo = exp(-d / 0.06) * 0.45 + exp(-d / 0.2) * 0.12;
  // flicker: a few signs stutter every so often
  float f = 1.0;
  if (vG.z > 0.5) {
    float tt = uTime * 1.3 + vG.w * 17.0;
    float burst = step(0.86, fract(tt * 0.13)) * step(0.5, fract(tt * 7.0));
    f = 1.0 - burst * 0.85;
  }
  vec3 c = vCol * (halo * 2.2 + core * 2.6) + mix(vCol, vec3(1.0), 0.55) * core * 2.2;
  gl_FragColor = vec4(c * f * vis, 1.0);
}`;

export function buildNeon(glyphs: GlyphSpec[], boards: BoardSpec[]) {
  const group = new THREE.Group();
  const fxGroup = new THREE.Group();

  // ---- floating glyphs (fx)
  if (glyphs.length) {
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    const n = glyphs.length;
    const gl = new Float32Array(n * 4);
    const col = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    const yaw = new Float32Array(n);
    const c = new THREE.Color();
    glyphs.forEach((s, i) => {
      gl.set([s.glyph, s.size, s.flicker ?? 0, i * 0.37], i * 4);
      c.set(s.color);
      col.set([c.r, c.g, c.b], i * 3);
      pos.set([s.p.x, s.p.y, s.p.z], i * 3);
      yaw[i] = s.yaw;
    });
    g.setAttribute("aGlyph", new THREE.InstancedBufferAttribute(gl, 4));
    g.setAttribute("aColor", new THREE.InstancedBufferAttribute(col, 3));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(pos, 3));
    g.setAttribute("aYaw", new THREE.InstancedBufferAttribute(yaw, 1));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: glyphVert,
      fragmentShader: glyphFrag,
      uniforms: { ...fxShared, uTime: env.uTime },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    fxGroup.add(mesh);
  }

  // ---- vertical signboards (opaque): dark lacquer boards, glowing strokes
  if (boards.length) {
    const geo = new THREE.BoxGeometry(1, 1, 0.12);
    const mesh = new THREE.InstancedMesh(
      geo,
      toonMaterial({
        color: 0x1a1420,
        shade: 0x07050c,
        ink: 45,
        rim: 0.6,
        lights: 0,
        vertexHead: /* glsl */ `attribute vec4 aBoard; varying vec4 vBoard; varying vec3 vLocal; varying vec3 vLN;`,
        vertex: /* glsl */ `vBoard = aBoard; vLocal = position; vLN = normal;`,
        fragmentHead: /* glsl */ `varying vec4 vBoard; varying vec3 vLocal; varying vec3 vLN;
          float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }`,
        fragment: /* glsl */ `
          // front and back faces carry the strokes; the edge is a neon frame
          vec2 sz = vBoard.xy;
          vec2 p = vLocal.xy * sz;                 // metres on the board
          float face = step(0.5, abs(vLN.z));
          float frame = max(step(sz.x * 0.5 - 0.06, abs(p.x)), step(sz.y * 0.5 - 0.06, abs(p.y)));
          // glyph cells stacked down the board: random strokes, not real characters
          float cell = sz.x * 0.86;
          float rows = floor(sz.y / cell);
          float row = floor((p.y + sz.y * 0.5) / cell);
          vec2 q = vec2(p.x / cell, fract((p.y + sz.y * 0.5) / cell) - 0.5) * 2.0;
          float d = 1e3;
          float sd = vBoard.w * 13.1 + row * 7.7;
          for (int k = 0; k < 4; k++) {
            float h1 = hash11(sd + float(k) * 3.1);
            float h2 = hash11(sd + float(k) * 5.7 + 1.0);
            float h3 = hash11(sd + float(k) * 9.3 + 2.0);
            vec2 a, b;
            if (h1 < 0.4) { a = vec2(-0.55, (h2 - 0.5) * 1.2); b = vec2(0.55, (h2 - 0.5) * 1.2 + (h3 - 0.5) * 0.3); }
            else if (h1 < 0.75) { a = vec2((h2 - 0.5) * 1.1, -0.6); b = vec2((h2 - 0.5) * 1.1 + (h3 - 0.5) * 0.3, 0.6); }
            else { a = vec2(-0.5, 0.5 * sign(h2 - 0.5)); b = vec2(0.5 * sign(h3 - 0.5), -0.3); }
            d = min(d, sdSeg(q, a, b));
          }
          float inCell = step(row, rows - 1.0) * step(abs(q.x), 0.9);
          float stroke = smoothstep(0.13, 0.07, d) * inCell;
          float px = fwidth(q.y);
          stroke = mix(stroke, 0.25 * inCell, smoothstep(0.08, 0.2, px));
          vec3 nc = vTint;
          float on = face * max(stroke, frame * 0.8);
          float fl = 0.9 + 0.1 * sin(uTime * 13.0 + vBoard.w * 5.0);
          base = mix(base, nc * 0.3, on);
          emis += nc * on * 3.2 * fl;`,
      }),
      boards.length,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const info = new Float32Array(boards.length * 4);
    const c = new THREE.Color();
    boards.forEach((b, i) => {
      q.setFromAxisAngle(up, b.yaw);
      m.compose(b.p, q, new THREE.Vector3(b.w, b.h, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.set(b.color));
      info.set([b.w, b.h, 0, b.seed], i * 4);
    });
    mesh.geometry.setAttribute("aBoard", new THREE.InstancedBufferAttribute(info, 4));
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return { group, fx: fxGroup };
}

/** A handful of random vertical boards along the two street rows. */
export function streetBoards(streetHalf: number, yAt: (z: number) => number): BoardSpec[] {
  const rand = rng(777);
  const out: BoardSpec[] = [];
  const cols = [0xff4fa0, 0x5af0ff, 0xffb347, 0x9dff5a, 0xff3a3a, 0xc080ff];
  for (let z = 18; z > -42; z -= 7 + rand() * 6) {
    for (const side of [-1, 1]) {
      if (rand() < 0.35) continue;
      const h = 2.6 + rand() * 2.2;
      const w = 0.62 + rand() * 0.2;
      const y = yAt(z) + 4.6 + rand() * 2.4 + h / 2;
      // hung out from the facade, perpendicular to it (readable down the street)
      out.push({ p: new THREE.Vector3(side * (streetHalf - 0.3), y, z), w, h, yaw: 0, color: cols[Math.floor(rand() * cols.length)], seed: rand() * 100 });
    }
  }
  return out;
}
