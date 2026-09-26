import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import type { FrameContext, Part } from "./World.ts";

// The great torii (大鳥居) standing in the water — a ryōbu torii with four
// support legs, modelled after the floating gate at Itsukushima. Passing
// through its opening is the entrance to Tsukuyomi.

export const GATE_Z = 0;
export const GATE_OPENING = { halfWidth: 6.4, height: 13 };

const VERMILION = new THREE.Color(0.55, 0.045, 0.024);
const BLACK = new THREE.Color(0.016, 0.015, 0.018);

function paint(geo: THREE.BufferGeometry, c: THREE.Color, gloss: number) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b, gloss], i * 4);
  geo.setAttribute("aColor", new THREE.BufferAttribute(col, 4));
  geo.deleteAttribute("uv");
  return geo;
}

function bend(geo: THREE.BufferGeometry, k: number) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + k * p.getX(i) * p.getX(i));
  geo.computeVertexNormals();
  return geo;
}

function gateGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const X = 7.6;
  for (const side of [-1, 1]) {
    const pillar = new THREE.CylinderGeometry(0.92, 1.08, 18.6, 32, 1, true);
    pillar.rotateZ(side * 0.022);
    pillar.translate(side * X, 9.3, 0);
    parts.push(paint(pillar, VERMILION, 0.45));
    const base = new THREE.CylinderGeometry(1.3, 1.45, 1.3, 32);
    base.translate(side * (X + 0.2), 0.25, 0);
    parts.push(paint(base, BLACK, 0.2));
    for (const dz of [-2.7, 2.7]) {
      const leg = new THREE.CylinderGeometry(0.42, 0.5, 9.6, 20, 1, true);
      leg.translate(side * X, 4.8, dz);
      parts.push(paint(leg, VERMILION, 0.4));
      const legBase = new THREE.CylinderGeometry(0.62, 0.7, 0.8, 20);
      legBase.translate(side * X, 0.2, dz);
      parts.push(paint(legBase, BLACK, 0.2));
      const cap = new THREE.ConeGeometry(0.95, 0.7, 4, 1);
      cap.rotateY(Math.PI / 4);
      cap.translate(side * X, 9.9, dz);
      parts.push(paint(cap, BLACK, 0.3));
    }
    for (const y of [3.4, 8.4]) {
      const tie = new THREE.BoxGeometry(0.34, 0.42, 5.9);
      tie.translate(side * X, y, 0);
      parts.push(paint(tie, VERMILION, 0.4));
    }
  }
  const nuki = new THREE.BoxGeometry(20.2, 1.0, 0.72);
  nuki.translate(0, 13.6, 0);
  parts.push(paint(nuki, VERMILION, 0.45));
  const strut = new THREE.BoxGeometry(0.9, 2.5, 0.6);
  strut.translate(0, 15.35, 0);
  parts.push(paint(strut, VERMILION, 0.45));
  const shimaki = bend(new THREE.BoxGeometry(22.4, 0.95, 1.15, 48, 1, 1), 0.005);
  shimaki.translate(0, 17.1, 0);
  parts.push(paint(shimaki, VERMILION, 0.45));
  const kasagi = bend(new THREE.BoxGeometry(25.6, 1.2, 1.75, 64, 1, 1), 0.0085);
  kasagi.translate(0, 18.2, 0);
  parts.push(paint(kasagi, BLACK, 0.7));
  return mergeGeometries(parts)!;
}

function plaqueTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 384;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#fff";
  g.lineWidth = 10;
  g.strokeRect(14, 14, 228, 356);
  g.lineWidth = 3;
  g.strokeRect(32, 32, 192, 320);
  g.fillStyle = "#fff";
  g.font = '800 128px "Shippori Mincho B1", "Yu Mincho", serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("月", 128, 124);
  g.fillText("読", 128, 262);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createTorii(): Part & { pass(): void } {
  const group = new THREE.Group();

  const gate = new THREE.Mesh(
    gateGeometry(),
    new THREE.ShaderMaterial({
      uniforms: globals,
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec4 vColor;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vColor = aColor;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec4 vColor;
        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          // Weathered lacquer: faint vertical streaks.
          float wear = 0.82 + 0.18 * fbm(vWorld.xy * vec2(0.35, 0.05) + vWorld.z * 0.1);
          vec3 albedo = vColor.rgb * wear;
          vec3 col = shadeSolid(albedo, N, V, vColor.a);
          // Warm light from the stone lanterns in front, fading with height.
          float front = max(dot(N, normalize(vec3(0.0, 0.25, 1.0))), 0.0);
          col += albedo * vec3(1.0, 0.55, 0.25) * (0.5 * front + 0.12) * exp(-max(vWorld.y, 0.0) * 0.1);
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }
      `,
    }),
  );
  gate.position.z = GATE_Z;
  gate.layers.enable(REFLECT_LAYER);
  group.add(gate);

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 2.2),
    new THREE.ShaderMaterial({
      uniforms: { ...globals, uMap: { value: plaqueTexture() } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vWorld;
        void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform sampler2D uMap;
        varying vec2 vUv; varying vec3 vWorld;
        void main() {
          float a = texture2D(uMap, vUv).a;
          vec3 base = vec3(0.01, 0.01, 0.016);
          vec3 gold = vec3(1.0, 0.76, 0.42) * 1.3;
          gl_FragColor = vec4(applyFog(mix(base, gold, a), vWorld), 1.0);
        }
      `,
    }),
  );
  plaque.position.set(0, 15.35, GATE_Z + 0.31);
  plaque.layers.enable(REFLECT_LAYER);
  group.add(plaque);

  // The veil across the opening: almost invisible from afar, golden ripples
  // as you approach, a soft flash as you pass through.
  const veilU = { uNear: { value: 0 }, uPass: { value: 0 } };
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(GATE_OPENING.halfWidth * 2, GATE_OPENING.height, 1, 1),
    new THREE.ShaderMaterial({
      uniforms: { ...globals, ...veilU },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uNear;
        uniform float uPass;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - vec2(0.5, 0.38)) * vec2(1.0, 1.1);
          float r = length(p);
          float rings = pow(0.5 + 0.5 * sin(r * 46.0 - uTime * 1.6 - uPass * 12.0), 10.0) * exp(-r * 2.6);
          float film = fbm(vUv * vec2(1.5, 2.0) + vec2(0.0, uTime * 0.02));
          float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec3 gold = vec3(1.0, 0.82, 0.55);
          float k = rings * (0.015 + uNear * 0.22) + film * 0.006 * (0.3 + uNear) + uPass * exp(-r * 2.2) * 0.9;
          gl_FragColor = vec4(gold * k * edge, 1.0);
        }
      `,
    }),
  );
  veil.position.set(0, GATE_OPENING.height / 2, GATE_Z);
  veil.renderOrder = 9;
  group.add(veil);

  return {
    object: group,
    update(ctx: FrameContext) {
      const d = Math.abs(ctx.camera.position.z - GATE_Z);
      veilU.uNear.value = 1 - THREE.MathUtils.smoothstep(d, 4, 40);
      veilU.uPass.value *= Math.exp(-ctx.dt * 1.6);
    },
    pass() {
      veilU.uPass.value = 1;
    },
  };
}
