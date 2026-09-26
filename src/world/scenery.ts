import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import type { Part } from "./World.ts";

// Everything static around the torii: ink-wash mountains, the far shore with
// its village and pagoda, pine islands and stone lanterns.

export const ISLANDS = [
  { x: -46, z: -74, r: 11, pines: 3, lantern: true },
  { x: 54, z: -158, r: 8, pines: 2, lantern: true },
  { x: -96, z: -206, r: 6, pines: 1, lantern: false },
  { x: 78, z: -292, r: 7, pines: 2, lantern: false },
  { x: -62, z: 22, r: 5, pines: 1, lantern: false },
];

const STONE = new THREE.Color(0.075, 0.075, 0.08);
const ROCK = new THREE.Color(0.03, 0.032, 0.038);
const PINE = new THREE.Color(0.01, 0.022, 0.016);
const BARK = new THREE.Color(0.035, 0.022, 0.018);
const DARK = new THREE.Color(0.022, 0.022, 0.03);

type Tagged = THREE.BufferGeometry;

// aColor: rgb albedo + gloss. aLamp: xyz local position inside a lantern's
// firebox (w = 1 for firebox faces), used to cut the glowing paper windows.
function tag(geo: THREE.BufferGeometry, c: THREE.Color, gloss = 0.1, lamp = false): Tagged {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 4);
  const lampAttr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b, gloss], i * 4);
    if (lamp) lampAttr.set([g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i), 1], i * 4);
  }
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 4));
  g.setAttribute("aLamp", new THREE.BufferAttribute(lampAttr, 4));
  return g;
}

function place(g: THREE.BufferGeometry, m: THREE.Matrix4) {
  g.applyMatrix4(m);
  return g;
}

function stoneLantern(m: THREE.Matrix4): Tagged[] {
  const parts: Tagged[] = [];
  const add = (geo: THREE.BufferGeometry, y: number, c = STONE, lamp = false) => {
    geo.translate(0, y, 0);
    if (lamp) {
      // Firebox local coordinates are captured before the world transform.
      const t = tag(geo.clone().translate(0, -y, 0), c, 0.05, true);
      t.translate(0, y, 0);
      parts.push(place(t, m));
    } else parts.push(place(tag(geo, c, 0.05), m));
  };
  add(new THREE.CylinderGeometry(0.95, 1.05, 0.35, 6), 0.18);
  add(new THREE.CylinderGeometry(0.3, 0.36, 2.2, 12), 1.45);
  add(new THREE.CylinderGeometry(0.78, 0.55, 0.42, 6), 2.75);
  add(new THREE.BoxGeometry(0.95, 0.9, 0.95), 3.4, STONE, true);
  add(new THREE.ConeGeometry(1.3, 0.85, 6, 1), 4.28);
  add(new THREE.SphereGeometry(0.24, 10, 8), 4.85);
  return parts;
}

function pine(rnd: () => number, m: THREE.Matrix4): Tagged[] {
  const parts: Tagged[] = [];
  const h = 7 + rnd() * 5;
  const lean = (rnd() - 0.5) * 0.9;
  const pts = [0, 0.3, 0.6, 1].map((t) => new THREE.Vector3(Math.sin(t * 2.2) * lean * h * 0.25 * t, t * h, Math.cos(t * 1.7) * lean * 0.6 * t));
  const curve = new THREE.CatmullRomCurve3(pts);
  parts.push(place(tag(new THREE.TubeGeometry(curve, 12, 0.32, 6, false), BARK, 0.05), m));
  // Foliage pads: lumpy, cloud-like clusters (a few overlapping blobs each)
  // rather than clean discs, so the silhouette reads as needles, not plates.
  const pads = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < pads; i++) {
    const t = 0.45 + (i / pads) * 0.6 + rnd() * 0.05;
    const p = curve.getPoint(Math.min(1, t));
    const side = (i % 2 ? 1 : -1) * (1.2 + rnd() * 1.6) * (1 - t * 0.4);
    const w = (2.0 + rnd() * 1.4) * (1 - t * 0.3);
    for (let b = 0; b < 4; b++) {
      const blob = mergeVertices(new THREE.IcosahedronGeometry(1, 2).deleteAttribute("normal").deleteAttribute("uv"));
      const bp = blob.attributes.position;
      for (let k = 0; k < bp.count; k++) {
        const j = 0.75 + rnd() * 0.5;
        bp.setXYZ(k, bp.getX(k) * j, bp.getY(k) * (0.7 + rnd() * 0.5), bp.getZ(k) * j);
      }
      blob.scale(w * (0.55 + rnd() * 0.3), 0.45 + rnd() * 0.25, w * (0.45 + rnd() * 0.25));
      blob.translate(p.x + side + (rnd() - 0.5) * w, p.y + 0.2 + (rnd() - 0.3) * 0.5, p.z + (rnd() - 0.5) * w * 0.8);
      blob.computeVertexNormals();
      parts.push(place(tag(blob, PINE, 0.0), m));
    }
  }
  return parts;
}

// Weathered rock: merged vertices so the displacement stays continuous and
// the normals come out smooth instead of faceted.
function island(_rnd: () => number, x: number, z: number, r: number): Tagged {
  const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 4).deleteAttribute("normal").deleteAttribute("uv"));
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const k =
      0.85 +
      0.22 * Math.sin(v.x * 3.1 + x) * Math.cos(v.z * 2.7 + z) +
      0.1 * Math.sin(v.x * 7.3 + v.z * 5.1 + x * 0.3) +
      0.05 * Math.sin(v.y * 13.0 + v.x * 11.0);
    p.setXYZ(i, v.x * r * k, Math.max(v.y, -0.2) * r * 0.42 * k, v.z * r * 0.85 * k);
  }
  geo.computeVertexNormals();
  geo.translate(x, -0.6, z);
  return tag(geo, ROCK, 0.04);
}

function pagoda(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const w = 22 - i * 2.6;
    const h = 7.5 - i * 0.4;
    parts.push(new THREE.BoxGeometry(w * 0.62, h, w * 0.62).translate(0, y + h / 2, 0));
    parts.push(new THREE.ConeGeometry(w * 0.86, 4.2, 4, 1).rotateY(Math.PI / 4).translate(0, y + h + 1.2, 0));
    y += h + 2.6;
  }
  parts.push(new THREE.CylinderGeometry(0.35, 0.6, 18, 8).translate(0, y + 9, 0));
  for (let r = 0; r < 9; r++) parts.push(new THREE.CylinderGeometry(1.4, 1.4, 0.35, 12).translate(0, y + 3 + r * 1.4, 0));
  return mergeGeometries(parts.map((p) => tag(p, DARK, 0.05)))!;
}

const SOLID_VERT = /* glsl */ `
  attribute vec4 aColor;
  attribute vec4 aLamp;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec4 vLamp;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vColor = aColor;
    vLamp = aLamp;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const SOLID_FRAG = /* glsl */ `
  ${COMMON}
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec4 vColor;
  varying vec4 vLamp;
  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = shadeSolid(vColor.rgb, N, V, vColor.a);
    if (vLamp.w > 0.5) {
      // Paper windows of the firebox, with a thin cross frame.
      float hcoord = abs(N.x) > 0.5 ? vLamp.z : vLamp.x;
      float win = step(abs(hcoord), 0.3) * step(abs(vLamp.y), 0.3) * step(abs(N.y), 0.5);
      float frame = step(abs(hcoord), 0.025) + step(abs(vLamp.y), 0.025);
      float flick = 0.85 + 0.15 * sin(uTime * 7.0 + vWorld.x * 3.0) * sin(uTime * 2.3 + vWorld.z);
      col += vec3(1.0, 0.62, 0.3) * 3.2 * win * (1.0 - min(frame, 1.0)) * flick;
    }
    gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  }
`;

export function createScenery(): Part {
  const group = new THREE.Group();
  const rnd = mulberry32(11);
  const solids: Tagged[] = [];

  // Stone lanterns flanking the approach to the torii, plus a few on islands.
  const lanternAt = (x: number, z: number, s = 1.5, rot = 0) =>
    solids.push(...stoneLantern(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.15, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0)), new THREE.Vector3(s, s, s))));
  lanternAt(-13, 7, 1.6, 0.3);
  lanternAt(13, 7, 1.6, -0.3);
  for (const x of [-13, 13]) solids.push(tag(new THREE.CylinderGeometry(2.2, 2.6, 0.9, 10).translate(x, -0.2, 7), ROCK, 0.05));

  for (const isl of ISLANDS) {
    solids.push(island(rnd, isl.x, isl.z, isl.r));
    for (let i = 0; i < isl.pines; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * isl.r * 0.45;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(isl.x + Math.cos(a) * d, isl.r * 0.3, isl.z + Math.sin(a) * d),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
        new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + rnd() * 0.4),
      );
      solids.push(...pine(rnd, m));
    }
    if (isl.lantern) lanternAt(isl.x + isl.r * 0.35, isl.z + isl.r * 0.3, 1.2, rnd());
  }

  // Far shore: a low strip of land across the moon side.
  const shore: THREE.BufferGeometry[] = [];
  const moonDir = globals.uMoonDir.value;
  const moonAz = Math.atan2(moonDir.z, moonDir.x);
  for (let i = 0; i < 70; i++) {
    const a = moonAz + (i / 69 - 0.5) * 2.4;
    const r = 860 + Math.sin(i * 1.7) * 40;
    const w = 90;
    shore.push(new THREE.BoxGeometry(w, 4 + Math.abs(Math.sin(i * 0.9)) * 5, 60).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * r, 1, Math.sin(a) * r));
  }
  solids.push(...shore.map((s) => tag(s, DARK, 0.02)));

  const pag = pagoda();
  const pd = 930;
  pag.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(moonDir.x * pd, 2, moonDir.z * pd), new THREE.Quaternion(), new THREE.Vector3(3, 3, 3)));
  solids.push(pag);

  const solid = new THREE.Mesh(mergeGeometries(solids)!, new THREE.ShaderMaterial({ uniforms: globals, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG }));
  solid.frustumCulled = false;

  // Village on the far shore: dark houses under hip roofs, a few warm windows.
  const H = 110;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.ConeGeometry(0.74, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const houseInfo = new Float32Array(H * 4);
  const housePos = new Float32Array(H * 4);
  for (let i = 0; i < H; i++) {
    let a = moonAz + (rnd() - 0.5) * 2.2;
    if (Math.abs(a - moonAz) < 0.05) a += 0.08 * Math.sign(a - moonAz || 1);
    const r = 830 + rnd() * 80;
    const w = 8 + rnd() * 12;
    const h = 5 + rnd() * rnd() * 14;
    housePos.set([Math.cos(a) * r, Math.sin(a) * r, rnd() * Math.PI, 5], i * 4);
    houseInfo.set([w, h, w * (0.7 + rnd() * 0.5), rnd()], i * 4);
  }
  const houseVert = (isRoof: boolean) => /* glsl */ `
    attribute vec4 aPos;
    attribute vec4 aInfo;
    varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec4 vInfo;
    void main() {
      float c = cos(aPos.z), s = sin(aPos.z);
      mat2 rot = mat2(c, -s, s, c);
      vec3 sz = aInfo.xyz;
      ${isRoof ? "sz = vec3(aInfo.x * 1.35, 3.0 + aInfo.w * 3.0, aInfo.z * 1.35);" : ""}
      vec3 p = position * sz;
      p.xz = rot * p.xz;
      vec3 w = vec3(aPos.x, aPos.w + ${isRoof ? "aInfo.y" : "0.0"}, aPos.y) + p;
      vec3 n = normal; n.xz = rot * n.xz;
      vWorld = w; vNormal = n; vLocal = position; vInfo = aInfo;
      gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    }
  `;
  const houseFrag = (isRoof: boolean) => /* glsl */ `
    ${COMMON}
    varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal; varying vec4 vInfo;
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = shadeSolid(vec3(${isRoof ? "0.018, 0.018, 0.024" : "0.03, 0.028, 0.032"}), N, V, 0.05) * 0.8;
      ${
        isRoof
          ? ""
          : `if (abs(N.y) < 0.5) {
        vec2 f = vec2(abs(N.x) > 0.5 ? vLocal.z * vInfo.z : vLocal.x * vInfo.x, vLocal.y * vInfo.y);
        vec2 cell = floor(f / vec2(3.0, 3.2));
        vec2 inCell = fract(f / vec2(3.0, 3.2));
        float win = step(0.25, inCell.x) * step(inCell.x, 0.75) * step(0.3, inCell.y) * step(inCell.y, 0.7);
        float lit = step(0.86, hash12(cell + vInfo.w * 31.0 + N.xz * 7.0));
        col += vec3(1.0, 0.6, 0.28) * win * lit * 1.4;
      }`
      }
      gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
    }
  `;
  const instanced = (base: THREE.BufferGeometry, isRoof: boolean) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(base.index);
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("normal", base.attributes.normal);
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(housePos, 4));
    g.setAttribute("aInfo", new THREE.InstancedBufferAttribute(houseInfo, 4));
    g.instanceCount = H;
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: globals, vertexShader: houseVert(isRoof), fragmentShader: houseFrag(isRoof) }));
    m.frustumCulled = false;
    return m;
  };

  // Ink-wash ridges: each layer darkens toward its crest, dissolves into mist
  // at its base, and the fog pushes farther layers back.
  const ridge = (radius: number, height: number, seed: number, ink: number) => {
    const seg = 320;
    const pos: number[] = [];
    const hf: number[] = [];
    const idx: number[] = [];
    const r2 = mulberry32(seed);
    const ph = [r2() * 6, r2() * 6, r2() * 6, r2() * 6];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const h =
        height *
        (0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 7 + ph[1]) + 0.08 * Math.sin(a * 17 + ph[2]) + 0.05 * Math.sin(a * 41 + ph[3]));
      const x = Math.cos(a) * radius;
      const z = -200 + Math.sin(a) * radius;
      pos.push(x, -2, z, x, Math.max(h, 6), z);
      hf.push(0, 1);
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aH", new THREE.Float32BufferAttribute(hf, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: globals,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `attribute float aH; varying float vH; varying vec3 vWorld; void main(){ vH = aH; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          ${COMMON}
          varying float vH; varying vec3 vWorld;
          void main() {
            vec3 dir = normalize(vWorld - cameraPosition);
            vec3 mist = fogTint(dir) * 1.25;
            vec3 inkCol = vec3(0.004, 0.007, 0.014) * ${ink.toFixed(2)};
            float brush = fbm(vec2(atan(vWorld.x, vWorld.z + 200.0) * 6.0, vH * 0.8)) - 0.5;
            vec3 col = mix(mist, inkCol, smoothstep(0.05, 0.75, vH + brush * 0.25));
            col += uMoonColor * 0.02 * smoothstep(0.9, 1.0, vH) * pow(max(dot(dir, uMoonDir), 0.0), 6.0);
            gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
          }
        `,
      }),
    );
    m.frustumCulled = false;
    return m;
  };
  const ridges = [ridge(1450, 105, 5, 1.0), ridge(2050, 175, 9, 1.4), ridge(2800, 280, 13, 1.8)];

  for (const m of [solid, instanced(box, false), instanced(roof, true), ...ridges]) {
    m.layers.enable(REFLECT_LAYER);
    group.add(m);
  }
  return { object: group };
}
