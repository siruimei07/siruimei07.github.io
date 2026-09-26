import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { MESA, SHORE_Z, terrainHeight, type Building } from "./layout";

// The hill under the city: a displaced grid with dark earth and stone walls
// on the steep parts (the mesa cliffs), lit from below by the town — a baked
// "light carpet" texture made from the building positions gives the warm
// glow between the houses seen in 场景1.

const X0 = -760;
const X1 = 760;
const Z0 = -1260;
const Z1 = SHORE_Z + 20;

function glowTexture(list: Building[]) {
  const N = 256;
  const data = new Float32Array(N * N);
  for (const b of list) {
    const u = (b.x - X0) / (X1 - X0);
    const v = (b.z - Z0) / (Z1 - Z0);
    const cx = u * N;
    const cy = v * N;
    const amt = b.kind === 2 ? 0.7 : b.kind === 1 ? 1.4 : 1;
    const rad = 3;
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        const x = Math.floor(cx) + dx;
        const y = Math.floor(cy) + dy;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        data[y * N + x] += amt * Math.exp(-d2 / 2.5);
      }
    }
  }
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, data[i]);
  const bytes = new Uint8Array(N * N * 4);
  for (let i = 0; i < data.length; i++) {
    const v = Math.min(1, Math.pow(data[i] / (max * 0.45), 0.7));
    bytes[i * 4] = bytes[i * 4 + 1] = bytes[i * 4 + 2] = Math.round(v * 255);
    bytes[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(bytes, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const vert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vGlowUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vGlowUv = vec2((w.x - ${X0.toFixed(1)}) / ${(X1 - X0).toFixed(1)}, (w.z - ${Z0.toFixed(1)}) / ${(Z1 - Z0).toFixed(1)});
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${common}
uniform sampler2D tGlow;
uniform vec3 uCamPos;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbTop;
uniform vec3 uAmbBottom;
uniform vec3 uFogColor;
uniform float uFogDist;
uniform float uLights;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vGlowUv;
void main() {
  vec3 N = normalize(vNormal);
  float steep = 1.0 - smoothstep(0.55, 0.8, N.y);
  vec3 earth = vec3(0.028, 0.03, 0.03) * (0.8 + 0.4 * fbm2(vWorld.xz * 0.05, 3));
  vec3 stone = vec3(0.1, 0.1, 0.11) * (0.75 + 0.5 * fbm2(vWorld.xy * vec2(0.08, 0.3) + vWorld.z * 0.05, 3));
  // Stone courses on the walls.
  stone *= 1.0 - 0.25 * smoothstep(0.85, 1.0, fract(vWorld.y / 1.6));
  vec3 alb = mix(earth, stone, steep);
  vec3 amb = mix(uAmbBottom, uAmbTop, N.y * 0.5 + 0.5);
  vec3 col = alb * (amb * 1.2 + uMoonColor * saturate(dot(N, uMoonDir)) * 1.8);
  // Warm light carpet between the houses.
  float g = texture(tGlow, vGlowUv).r;
  vec3 glow = vec3(1.0, 0.5, 0.2) * g * g * 0.55 + vec3(1.0, 0.72, 0.42) * pow(g, 5.0) * 0.6;
  col += glow * uLights * (1.0 - steep * 0.6);
  float dist = length(uCamPos - vWorld);
  float fog = 1.0 - exp(-dist / uFogDist);
  col = mix(col, uFogColor, fog * 0.8);
  col += glow * uLights * fog * 0.3;
  gl_FragColor = vec4(col, 1.0);
}`;

export function createTerrain(list: Building[]) {
  const segX = 220;
  const segZ = 180;
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
  }
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      tGlow: { value: glowTexture(list) },
      uCamPos: G.uCamPos,
      uMoonDir: G.uMoonDir,
      uMoonColor: G.uMoonColor,
      uAmbTop: G.uAmbTop,
      uAmbBottom: G.uAmbBottom,
      uFogColor: G.uFogColor,
      uFogDist: { value: 1500 },
      uLights: { value: 1 },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  void MESA;
  return mesh;
}
