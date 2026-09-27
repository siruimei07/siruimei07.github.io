import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { common, octa } from "../engine/glsl";
import { env, toonMaterial } from "../engine/toon";
import { BRIDGE, CITY_X, CITY_Z, rng } from "./layout";

// Across the bay: the far city (backlit silhouettes, window sparkle, a TV
// tower with light rings, a ferris wheel) and the suspension bridge with its
// illuminated main cables and a train that crosses now and then. Also bakes a
// light strip of the far shore for the sea's reflections.

export type CityResult = { group: THREE.Group; strip: THREE.DataTexture; update(t: number): void };

const box = () => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
};

/** Thin line geometry for the G-buffer (writes aux like any opaque surface). */
function lineMaterial(color: THREE.ColorRepresentation, emissive: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uEmis: { value: emissive }, ...env },
    vertexShader: /* glsl */ `
      varying float vViewZ;
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 vp = viewMatrix * wp;
        vViewZ = -vp.z;
        gl_Position = projectionMatrix * vp;
      }`,
    fragmentShader: /* glsl */ `
      layout(location = 1) out highp vec4 gAux;
      ${common}
      ${octa}
      uniform vec3 uColor;
      uniform float uEmis;
      uniform vec3 uFogCol;
      uniform vec3 uFogDist;
      varying float vViewZ;
      varying vec3 vWorld;
      void main() {
        float d = length(vWorld - cameraPosition);
        float fog = smoothstep(uFogDist.x, uFogDist.y, d) * uFogDist.z;
        vec3 c = mix(uColor * (1.0 + uEmis), uFogCol, fog * 0.8);
        gl_FragColor = vec4(c, 1.0);
        gAux = vec4(0.0, 0.0, vViewZ, 0.0);
      }`,
  });
}

export function buildCity(density: number): CityResult {
  const group = new THREE.Group();
  const rand = rng(7771);

  // ---- far city
  type B = { x: number; z: number; w: number; d: number; h: number };
  const bs: B[] = [];
  for (let x = CITY_X[0]; x < CITY_X[1]; ) {
    const w = 26 + rand() * 50;
    const core = Math.exp(-Math.pow((x + 900) / 1500, 2));
    const rows = 2 + Math.floor(rand() * 3);
    for (let r = 0; r < rows; r++) {
      const h = 18 + rand() * 50 + core * (rand() * 240) * (r === 0 ? 0.6 : 1) + (rand() < 0.04 ? 120 : 0);
      bs.push({ x: x + (rand() - 0.5) * 12, z: CITY_Z + 120 - r * (70 + rand() * 60), w, d: 24 + rand() * 40, h });
    }
    x += w + rand() * 18;
  }
  const bodies = new THREE.InstancedMesh(
    box(),
    toonMaterial({
      color: 0x33549e,
      shade: 0x172a5c,
      ink: 0,
      rim: 1.3,
      step: 0.25,
      fog: 1.0,
      lights: 0,
      vertexHead: /* glsl */ `attribute float aSeed; varying float vSeed; varying vec3 vObj; attribute vec3 aSize; varying vec3 vSize;`,
      vertex: /* glsl */ `vSeed = aSeed; vObj = position * aSize; vSize = aSize;`,
      fragmentHead: /* glsl */ `varying float vSeed; varying vec3 vObj; varying vec3 vSize;`,
      fragment: /* glsl */ `
        if (abs(n.y) < 0.5) {
          vec2 f = vec2(abs(n.x) > 0.5 ? vObj.z : vObj.x, vObj.y);
          vec2 cell = floor(f / vec2(7.0, 4.6));
          float h = hash13(vec3(cell, vSeed));
          vec2 fr = fract(f / vec2(7.0, 4.6));
          float dotm = step(0.3, fr.x) * step(fr.x, 0.7) * step(0.35, fr.y) * step(fr.y, 0.65);
          float lit = step(0.72 - 0.25 * hash11(vSeed), h) * dotm * step(4.0, vObj.y) * step(vObj.y, vSize.y - 3.0);
          vec3 wc = mix(vec3(1.0, 0.7, 0.4), vec3(0.8, 0.9, 1.0), step(0.7, hash11(h * 17.0)));
          emis += wc * lit * 3.2;
          // aviation light on the tall ones
          float top = step(vSize.y - 2.0, vObj.y) * step(150.0, vSize.y);
          emis += vec3(1.0, 0.1, 0.08) * top * step(0.5, fract(uTime * 0.6 + vSeed)) * 6.0;
        }`,
    }),
    bs.length,
  );
  const sizes = new Float32Array(bs.length * 3);
  const seeds = new Float32Array(bs.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  bs.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, -2, b.z), q, new THREE.Vector3(b.w, b.h + 2, b.d));
    bodies.setMatrixAt(i, m);
    sizes.set([b.w, b.h + 2, b.d], i * 3);
    seeds[i] = rand() * 100;
  });
  bodies.geometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
  bodies.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  bodies.frustumCulled = false;
  group.add(bodies);

  // Light strip for the sea: how bright the shore is along x.
  const W = 512;
  const strip = new Float32Array(W);
  for (const b of bs) {
    const u0 = Math.floor(((b.x - b.w / 2 - CITY_X[0]) / (CITY_X[1] - CITY_X[0])) * W);
    const u1 = Math.ceil(((b.x + b.w / 2 - CITY_X[0]) / (CITY_X[1] - CITY_X[0])) * W);
    for (let u = Math.max(0, u0); u < Math.min(W, u1); u++) strip[u] += Math.min(1, b.h / 160) * (0.4 + rand() * 0.6);
  }
  const bytes = new Uint8Array(W * 4);
  for (let u = 0; u < W; u++) {
    const v = Math.min(255, Math.round(Math.pow(Math.min(1, strip[u]), 0.8) * 255 * (rand() < 0.35 ? 0.3 : 1)));
    bytes.set([v, v, v, 255], u * 4);
  }
  const tex = new THREE.DataTexture(bytes, W, 1, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;

  // TV tower: a slender tapered mast with light rings and a glowing deck.
  const towerX = -1450;
  const towerZ = CITY_Z - 260;
  const towerGeo = new THREE.CylinderGeometry(3, 16, 470, 10, 24);
  towerGeo.translate(0, 235, 0);
  const tower = new THREE.Mesh(
    towerGeo,
    toonMaterial({
      color: 0x5a7cc4,
      shade: 0x1c2f66,
      ink: 0,
      rim: 1.5,
      lights: 0,
      fragment: /* glsl */ `
        float y = vWorldPos.y;
        float ring = step(0.9, fract(y / 42.0)) * step(y, 440.0);
        float deck = step(330.0, y) * step(y, 348.0) + step(430.0, y) * step(y, 438.0);
        emis += vec3(0.75, 0.88, 1.0) * ring * 2.2 + vec3(1.0, 0.85, 0.55) * deck * 3.0;
        emis += vec3(1.0, 0.15, 0.1) * step(462.0, y) * (0.5 + 0.5 * step(0.5, fract(uTime * 0.5))) * 5.0;`,
    }),
  );
  tower.position.set(towerX, -2, towerZ);
  group.add(tower);

  // Ferris wheel on the far shore: a lit ring with spokes, slowly turning.
  const wheel = new THREE.Group();
  const ringGeo = new THREE.TorusGeometry(52, 1.4, 6, 96);
  const spokes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 24; i++) {
    const g = new THREE.BoxGeometry(0.8, 104, 0.8);
    g.rotateZ((i / 24) * Math.PI);
    spokes.push(g.toNonIndexed());
  }
  const wheelMat = toonMaterial({
    color: 0x6f8fd0,
    shade: 0x223b74,
    ink: 0,
    lights: 0,
    uniforms: { uCenter: { value: new THREE.Vector3() } },
    fragmentHead: /* glsl */ `uniform vec3 uCenter;`,
    fragment: /* glsl */ `
      vec2 d = vWorldPos.xy - uCenter.xy;
      float a = atan(d.y, d.x);
      float r = length(d);
      float bulbs = step(0.55, fract(a * 96.0 / 6.2832)) * step(49.0, r);
      vec3 c = hsv2rgb(vec3(fract(a / 6.2832 + uTime * 0.05), 0.6, 1.0));
      emis += c * bulbs * 3.0 + c * (1.0 - step(49.0, r)) * 0.9;`,
  });
  const ringMesh = new THREE.Mesh(ringGeo, wheelMat);
  const spokeMesh = new THREE.Mesh(mergeGeometries(spokes), wheelMat);
  wheel.add(ringMesh, spokeMesh);
  const wheelPos = new THREE.Vector3(1250, 64, CITY_Z + 330);
  wheel.position.copy(wheelPos);
  wheelMat.uniforms.uCenter.value.copy(wheelPos);
  group.add(wheel);

  // ---- bridge
  const B = BRIDGE;
  const bridge = new THREE.Group();
  const deckLen = B.x1 - B.x0;
  const deck = new THREE.Mesh(
    (() => {
      const g = new THREE.BoxGeometry(deckLen, 6, 28);
      g.translate((B.x0 + B.x1) / 2, B.deckY, B.z);
      return g;
    })(),
    toonMaterial({
      color: 0x6c89c8,
      shade: 0x1e3166,
      ink: 20,
      rim: 1.0,
      lights: 0,
      fragment: /* glsl */ `
        if (abs(n.z) > 0.5) {
          float lamp = step(0.82, fract(vWorldPos.x / 24.0)) * step(${(B.deckY + 2).toFixed(1)}, vWorldPos.y);
          emis += vec3(1.0, 0.85, 0.55) * lamp * 4.0;
          float truss = step(0.9, fract((vWorldPos.x + (vWorldPos.y - ${B.deckY.toFixed(1)}) * 1.0) / 12.0)) + step(0.9, fract((vWorldPos.x - (vWorldPos.y - ${B.deckY.toFixed(1)}) * 1.0) / 12.0));
          base *= 1.0 - min(truss, 1.0) * 0.35;
        }`,
    }),
  );
  bridge.add(deck);
  // piers under the approach spans
  const piers: THREE.BufferGeometry[] = [];
  for (let x = B.x0 + 60; x < B.x1; x += 240) {
    if (x > B.towerA - 100 && x < B.towerB + 100) continue;
    const g = new THREE.BoxGeometry(14, B.deckY, 18);
    g.translate(x, B.deckY / 2 - 3, B.z);
    piers.push(g.toNonIndexed());
  }
  // towers: two legs + cross beams
  for (const tx of [B.towerA, B.towerB]) {
    for (const dz of [-14, 14]) {
      const leg = new THREE.BoxGeometry(9, B.towerH, 7);
      leg.translate(tx, B.towerH / 2 - 4, B.z + dz);
      piers.push(leg.toNonIndexed());
    }
    for (const y of [B.deckY - 8, B.towerH * 0.72, B.towerH - 10]) {
      const beam = new THREE.BoxGeometry(8, 7, 30);
      beam.translate(tx, y, B.z);
      piers.push(beam.toNonIndexed());
    }
  }
  const towers = new THREE.Mesh(
    mergeGeometries(piers),
    toonMaterial({
      color: 0x9db4e6,
      shade: 0x243a74,
      ink: 21,
      rim: 1.2,
      lights: 0,
      fragment: /* glsl */ `
        emis += vec3(1.0, 0.12, 0.08) * step(${(B.towerH - 6).toFixed(1)}, vWorldPos.y) * step(0.5, fract(uTime * 0.45)) * 7.0;
        // up-lighting on the tower faces
        emis += vec3(0.5, 0.65, 1.0) * smoothstep(${(B.towerH * 0.2).toFixed(1)}, 0.0, vWorldPos.y - ${B.deckY.toFixed(1)}) * 0.25 * step(0.0, n.z);`,
    }),
  );
  bridge.add(towers);

  // Main cables with lights along them, plus suspenders.
  const cablePts = (dz: number) => {
    const pts: THREE.Vector3[] = [];
    const topY = B.towerH - 6;
    const lowY = B.deckY + 12;
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = B.x0 + (deckLen * i) / N;
      let y: number;
      if (x < B.towerA) {
        const t = (x - B.x0) / (B.towerA - B.x0);
        y = THREE.MathUtils.lerp(B.deckY + 2, topY, t) - Math.sin(t * Math.PI) * 18;
      } else if (x > B.towerB) {
        const t = (x - B.towerB) / (B.x1 - B.towerB);
        y = THREE.MathUtils.lerp(topY, B.deckY + 2, t) - Math.sin(t * Math.PI) * 18;
      } else {
        const t = (x - B.towerA) / (B.towerB - B.towerA);
        y = lowY + (topY - lowY) * Math.pow(2 * t - 1, 2);
      }
      pts.push(new THREE.Vector3(x, y, B.z + dz));
    }
    return pts;
  };
  const cableGeo: THREE.BufferGeometry[] = [];
  const hangers: number[] = [];
  for (const dz of [-13, 13]) {
    const pts = cablePts(dz);
    cableGeo.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 1.1, 5, false).toNonIndexed());
    for (let i = 1; i < pts.length - 1; i += 2) {
      const p = pts[i];
      if (p.y - B.deckY < 6) continue;
      hangers.push(p.x, p.y, p.z, p.x, B.deckY + 3, p.z);
    }
  }
  const cables = new THREE.Mesh(
    mergeGeometries(cableGeo),
    toonMaterial({
      color: 0xb7c8f0,
      shade: 0x3b5190,
      ink: 0,
      lights: 0,
      fragment: /* glsl */ `
        float bulb = step(0.6, fract(vWorldPos.x / 16.0));
        emis += vec3(0.85, 0.93, 1.0) * bulb * 3.4;`,
    }),
  );
  bridge.add(cables);
  const hangerGeo = new THREE.BufferGeometry();
  hangerGeo.setAttribute("position", new THREE.Float32BufferAttribute(hangers, 3));
  bridge.add(new THREE.LineSegments(hangerGeo, lineMaterial(0x5c77b8, 0.2)));

  // The train: a string of lit cars running along the deck.
  const cars = 9;
  const carGeo = new THREE.BoxGeometry(19, 3.6, 3.2);
  carGeo.translate(0, 1.8, 0);
  const train = new THREE.InstancedMesh(
    carGeo,
    toonMaterial({
      color: 0xdfe7fb,
      shade: 0x4b5f95,
      ink: 0,
      lights: 0,
      fragment: /* glsl */ `
        if (abs(n.z) > 0.5) {
          float w = step(0.25, fract(vWorldPos.x / 2.2)) * step(0.35, fract((vWorldPos.y - ${(B.deckY + 3).toFixed(1)}) / 3.6)) * step(fract((vWorldPos.y - ${(B.deckY + 3).toFixed(1)}) / 3.6), 0.75);
          emis += vec3(1.0, 0.92, 0.75) * w * 3.5;
        }`,
    }),
    cars,
  );
  train.frustumCulled = false;
  bridge.add(train);

  group.add(bridge);
  void density;

  const period = 70;
  const speed = (deckLen + 600) / 38;
  const update = (t: number) => {
    wheel.rotation.z = t * 0.02;
    const ph = t % period;
    const head = B.x0 - 300 + ph * speed;
    for (let i = 0; i < cars; i++) {
      m.makeTranslation(head - i * 20, B.deckY + 3, B.z + 6);
      train.setMatrixAt(i, m);
    }
    train.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { group, strip: tex, update };
}
