import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { GeoBuilder } from "./geo";

// The fish airship: a carp-bodied dirigible the size of a city block,
// skinned in 青海波 (seigaiha) wave scales, with a neon stripe down its flank
// that slowly changes colour, a neon line along the back, rows of paired
// orange lights, a forked tail and fins, and lantern pods hanging from its
// belly. It floats, bobs and sways; the tail sculls slowly.

export type AirshipResult = { group: THREE.Group; update(t: number): void; nose: () => THREE.Vector3 };

const L = 150; // body length
const A = 25; // half-height
const C = 23; // half-width
const M = 0.6; // widest point (0 tail … 1 nose)

/** Body girth profile along u (0 tail … 1 nose). */
function prof(u: number) {
  if (u >= M) {
    const t = (u - M) / (1 - M);
    return Math.pow(Math.max(0, 1 - Math.pow(t, 2.3)), 0.55);
  }
  const t = u / M;
  return 0.12 + 0.88 * Math.pow(Math.sin((t * Math.PI) / 2), 1.5);
}

function bodyGeometry(): THREE.BufferGeometry {
  const NU = 72;
  const NT = 40;
  const pos: number[] = [];
  const uv: number[] = [];
  const part: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NU; i++) {
    const u = i / NU;
    const x = (u - 0.5) * L;
    const p = prof(u);
    const a = A * p;
    const c = C * Math.pow(p, 1.08);
    // the belly hangs a little lower than the back rises
    const yc = -A * 0.08 * p;
    const circ = Math.PI * (3 * (a + c) - Math.sqrt((3 * a + c) * (a + 3 * c)));
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const y = yc + a * Math.cos(th) * (Math.cos(th) < 0 ? 1.08 : 1.0);
      const z = c * Math.sin(th);
      pos.push(x, y, z);
      uv.push(x, (j / NT - 0.5) * circ);
      part.push(0, u, th, p);
    }
  }
  const W = NT + 1;
  for (let i = 0; i < NU; i++)
    for (let j = 0; j < NT; j++) {
      const a = i * W + j;
      const b = a + W;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(part, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fin(shape: THREE.Shape, thick: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -thick / 2);
  return g;
}

/** Nose-to-tail-fin extent of the model (local x from −109 to +75). */
const EXTENT = 184;
const MID = -17;

export function buildAirship(pos: THREE.Vector3, heading: THREE.Quaternion, length: number): AirshipResult {
  const b = new GeoBuilder();
  const body = bodyGeometry();
  const bodyCol = body.getAttribute("aPart");
  // the builder carries part data per add(); add the body vertex by vertex data afterwards
  b.add(body, new THREE.Matrix4(), 0xffffff, [0, 0, 0, 0]);

  const x0 = -L / 2;
  // forked tail (尾びれ) in the vertical plane
  const tail = new THREE.Shape();
  tail.moveTo(0, -3.5);
  tail.bezierCurveTo(-10, -6, -20, -18, -30, -27);
  tail.bezierCurveTo(-26, -14, -22, -6, -19, 0);
  tail.bezierCurveTo(-22, 6, -26, 14, -30, 27);
  tail.bezierCurveTo(-20, 18, -10, 6, 0, 3.5);
  tail.lineTo(0, -3.5);
  b.add(fin(tail, 0.8), new THREE.Matrix4().makeTranslation(x0 + 4, -1, 0), 0xffffff, [1, 0, 0, 0]);
  // dorsal fin
  const dorsal = new THREE.Shape();
  dorsal.moveTo(0, 0);
  dorsal.bezierCurveTo(6, 10, 16, 15, 30, 14);
  dorsal.bezierCurveTo(26, 8, 30, 3, 36, 0);
  dorsal.lineTo(0, 0);
  b.add(fin(dorsal, 0.8), new THREE.Matrix4().makeTranslation(-24, A * 0.92 - 2.5, 0), 0xffffff, [1, 1, 0, 0]);
  // pectoral and pelvic fins, both sides
  const pect = new THREE.Shape();
  pect.moveTo(0, 0);
  pect.bezierCurveTo(-6, -6, -16, -10, -24, -9);
  pect.bezierCurveTo(-18, -4, -10, 0, -6, 2);
  pect.lineTo(0, 0);
  for (const s of [-1, 1]) {
    const m = new THREE.Matrix4().makeRotationX(s * 0.95).premultiply(new THREE.Matrix4().makeTranslation(28, -A * 0.45, s * C * 0.75));
    b.add(fin(pect, 0.6), m, 0xffffff, [1, 2, 0, 0]);
    const m2 = new THREE.Matrix4().makeScale(0.7, 0.7, 0.7).premultiply(new THREE.Matrix4().makeRotationX(s * 0.6)).premultiply(new THREE.Matrix4().makeTranslation(-14, -A * 0.75, s * C * 0.4));
    b.add(fin(pect, 0.6), m2, 0xffffff, [1, 3, 0, 0]);
  }
  // lantern pods on pylons under the belly (glowing ends)
  const pods: [number, number, number][] = [
    [34, -1, 0],
    [14, 1, 1],
    [-6, -1, 2],
    [-26, 1, 3],
  ];
  for (const [px, s, k] of pods) {
    const at = new THREE.Vector3(px, -A * 0.95 - 9, s * C * 0.55);
    const pod = new THREE.CylinderGeometry(3.4, 3.0, 17, 16, 1);
    const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.35).premultiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
    b.add(pod, m, 0xffffff, [2, k, 0, 0]);
    const cap = new THREE.CylinderGeometry(3.1, 3.1, 1.2, 16, 1);
    const mc = new THREE.Matrix4().makeTranslation(0, -8.8, 0).premultiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - 0.35)).premultiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
    b.add(cap, mc, 0xffffff, [3, k, 0, 0]);
    b.beam(new THREE.Vector3(at.x + 2, at.y + 2, at.z), new THREE.Vector3(at.x + 5, -A * 0.6, at.z * 0.8), 1.4, 1.4, 0xffffff, [4, k, 0, 0]);
  }
  const geo = b.build(true);
  // restore the body's own per-vertex part data (u, θ, girth)
  const partAttr = geo.getAttribute("aPart") as THREE.BufferAttribute;
  for (let i = 0; i < bodyCol.count; i++) partAttr.setXYZW(i, bodyCol.getX(i), bodyCol.getY(i), bodyCol.getZ(i), bodyCol.getW(i));

  const mat = toonMaterial({
    color: 0x1b3440,
    shade: 0x07121e,
    ink: 60,
    rim: 1.0,
    step: 0.0,
    soft: 0.1,
    lights: 0,
    fog: 0.45,
    side: THREE.DoubleSide,
    uniforms: { uHue: { value: 0 } },
    vertexHead: /* glsl */ `attribute vec4 aPart; varying vec4 vPart; varying vec3 vObj;`,
    vertex: /* glsl */ `
      vPart = aPart;
      vObj = position;
      // the tail sculls slowly: bend the rear of the body and the tail fin sideways
      vec3 lp = position;
      float k = clamp((-lp.x - ${(0.12 * L).toFixed(1)}) / ${(0.88 * L).toFixed(1)}, 0.0, 1.4);
      lp.z += sin(uTime * 0.55 - lp.x * 0.025) * 7.0 * k * k;
      wp = m * vec4(lp, 1.0);`,
    fragmentHead: /* glsl */ `
      uniform float uHue;
      varying vec4 vPart;
      varying vec3 vObj;
      // 青海波: rows of concentric fans; the lower row overlaps the one above
      float seigaiha(vec2 q, out float ringF) {
        float jTop = floor(q.y / 0.5);
        for (int k = 3; k >= 0; k--) {
          float j = jTop - float(k);
          float off = mod(j, 2.0);
          float cx = 2.0 * floor((q.x - off) / 2.0 + 0.5) + off;
          vec2 c = vec2(cx, j * 0.5);
          float d = length(q - c);
          if (q.y >= c.y - 0.02 && d < 1.0) { ringF = d; return 1.0; }
        }
        ringF = 1.0;
        return 0.0;
      }`,
    fragment: /* glsl */ `
      float kind = vPart.x;
      vec3 stripeC = hsv2rgb(vec3(uHue, 0.72, 1.0));
      if (kind < 0.5) {
        float u = vPart.y;
        float th = vPart.z;
        // scales: seigaiha in metres (uv = along, around)
        vec2 q = vec2(vUv.x, vUv.y) / 4.6;
        float ring;
        seigaiha(q, ring);
        float fr = fract(ring * 3.0);
        float lines = smoothstep(0.17, 0.06, min(fr, 1.0 - fr));
        float px = fwidth(ring * 3.0);
        lines = mix(lines, 0.3, smoothstep(0.3, 0.8, px));
        vec3 scale = mix(vec3(0.008, 0.024, 0.045), vec3(0.07, 0.3, 0.34), lines);
        // the belly is paler (city glow from below)
        float belly = smoothstep(0.2, -0.9, cos(th));
        base = scale * (1.0 + belly * 0.35);
        shade = scale * vec3(0.5, 0.6, 0.8);
        // flank neon stripe (both sides), dorsal line
        float flank = exp(-pow((acos(clamp(cos(th), -1.0, 1.0)) - 1.72) / 0.035, 2.0)) * step(0.12, u) * step(u, 0.96);
        float dorsal = exp(-pow(acos(clamp(cos(th), -1.0, 1.0)) / 0.05, 2.0)) * step(0.05, u);
        float chase = 0.8 + 0.2 * sin(vUv.x * 0.25 - uTime * 4.0);
        emis += stripeC * flank * 5.0 * chase;
        emis += mix(vec3(0.35, 0.45, 1.0), stripeC, 0.3) * dorsal * 3.0;
        // the scales near the stripe catch its light
        float near = exp(-abs(acos(clamp(cos(th), -1.0, 1.0)) - 1.72) / 0.35);
        emis += stripeC * lines * near * 0.35 + vec3(0.2, 0.5, 0.55) * lines * 0.06;
        // paired orange lights in rows along the flanks and belly
        float ang = acos(clamp(cos(th), -1.0, 1.0));
        float along = fract(vUv.x / 8.0);
        float pair = step(abs(along - 0.4), 0.05) + step(abs(along - 0.6), 0.05);
        float rows = step(abs(ang - 1.05), 0.045) + step(abs(ang - 1.45), 0.04) + step(abs(ang - 2.05), 0.04) + step(abs(ang - 2.6), 0.045);
        float dots = pair * rows * step(0.08, u) * step(u, 0.93);
        emis += vec3(1.0, 0.36, 0.05) * dots * 9.0 * (0.85 + 0.15 * sin(uTime * 3.0 + vUv.x));
        // nose light
        emis += vec3(1.0, 0.65, 0.35) * smoothstep(0.985, 1.0, u) * 6.0;
        emis += vec3(0.9, 0.5, 0.25) * base * belly * 0.9;
      } else if (kind < 1.5) {
        // fins: dark membrane with glowing rays and a neon edge
        float rays = smoothstep(0.35, 0.5, abs(fract(atan(vObj.y, vObj.x + 60.0) * 40.0) - 0.5));
        base = mix(vec3(0.006, 0.014, 0.03), vec3(0.03, 0.14, 0.18), rays * 0.6);
        shade = base * 0.6;
        emis += stripeC * rays * 0.25 + vec3(0.2, 0.5, 0.6) * 0.05;
      } else if (kind < 2.5) {
        // lantern pods: black lacquer, glowing rings and rows of lit windows
        float ring = step(0.86, fract(vUv.y * 4.0 + 0.1));
        float win = step(0.55, fract(vUv.x * 14.0)) * step(0.3, fract(vUv.y * 4.0 + 0.1)) * step(fract(vUv.y * 4.0 + 0.1), 0.62);
        vec3 pc = hsv2rgb(vec3(fract(0.9 + vPart.y * 0.07), 0.7, 1.0));
        base = vec3(0.02, 0.006, 0.01);
        shade = base * 0.5;
        emis += pc * ring * 3.0 + vec3(1.0, 0.45, 0.12) * win * 1.6;
      } else if (kind < 3.5) {
        // pod ends glow
        vec3 pc = hsv2rgb(vec3(fract(0.83 + vPart.y * 0.13 + uHue * 0.3), 0.75, 1.0));
        emis += pc * 5.0;
        base = pc * 0.3; shade = base;
      } else {
        base = vec3(0.012, 0.015, 0.025); shade = base * 0.5;
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.position.x = -MID;
  const group = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(mesh);
  group.add(pivot);
  group.position.copy(pos);
  group.scale.setScalar(length / EXTENT);
  pivot.quaternion.copy(heading);
  const base = pos.clone();
  const wob = new THREE.Quaternion();
  const e = new THREE.Euler();
  const noseLocal = new THREE.Vector3(L / 2, 0, 0);

  return {
    group,
    nose: () => mesh.localToWorld(noseLocal.clone()),
    update(t: number) {
      group.position.set(base.x + Math.sin(t * 0.05) * 6, base.y + Math.sin(t * 0.21) * 2.5, base.z + Math.cos(t * 0.04) * 4);
      e.set(Math.sin(t * 0.17) * 0.02, Math.sin(t * 0.07) * 0.03, Math.sin(t * 0.13 + 1) * 0.025);
      pivot.quaternion.copy(heading).multiply(wob.setFromEuler(e));
      mat.uniforms.uHue.value = (0.8 + t * 0.012) % 1;
    },
  };
}
