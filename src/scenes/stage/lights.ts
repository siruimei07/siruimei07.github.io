import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";
import { rng } from "../common/util";
import { landY, MESA, mesaMask } from "./layout";

// Additive light over the town (fx scene): thousands of twinkling points that
// keep the far city sparkling at any distance, searchlight beams sweeping the
// sky, and a warm haze of light rising from the streets just past the stage.

const sparkVert = /* glsl */ `
${common}
attribute vec4 aPos;
attribute vec3 aCol;
uniform float uTime;
uniform float uPxAngle;
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
void main() {
  vec4 vp = viewMatrix * vec4(aPos.xyz, 1.0);
  float depth = max(-vp.z, 0.01);
  float px = mix(1.3, 3.0, fract(aPos.w * 7.13));
  vp.xy += position.xy * depth * uPxAngle * px;
  gl_Position = projectionMatrix * vp;
  vQ = position.xy;
  float tw = 0.5 + 0.5 * sin(uTime * (0.8 + fract(aPos.w * 3.3) * 3.5) + aPos.w * 50.0);
  vC = aCol * (0.35 + 0.65 * tw * tw);
  vViewZ = depth;
}`;

const sparkFrag = /* glsl */ `
${common}
${fxDepthTest}
varying vec2 vQ;
varying vec3 vC;
varying float vViewZ;
void main() {
  float vis = sceneVisible(vViewZ - 6.0);
  if (vis <= 0.0) discard;
  float r = length(vQ);
  float a = smoothstep(1.0, 0.0, r);
  a *= a;
  gl_FragColor = vec4(vC * a * vis, 1.0);
}`;

const beamVert = /* glsl */ `
${common}
attribute vec4 aBase;   // xyz, seed
attribute vec4 aBeam;   // length, radius, sweep amplitude (rad), colour pick
uniform float uTime;
uniform vec3 uCols[3];
varying float vT;
varying vec3 vC;
varying float vViewZ;
varying float vFace;
void main() {
  float ph = aBase.w * 6.2832;
  float sw = aBeam.z;
  float a = sin(uTime * (0.07 + fract(aBase.w * 5.1) * 0.08) + ph) * sw;
  float b = cos(uTime * (0.05 + fract(aBase.w * 3.7) * 0.06) + ph * 1.7) * sw * 0.6;
  vec3 dir = normalize(vec3(sin(a), 1.0, sin(b)));
  vec3 s1 = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  vec3 s2 = cross(s1, dir);
  float t = position.y;               // 0 … 1 along the beam
  float r = aBeam.y * (0.25 + 0.75 * t);
  vec3 wp = aBase.xyz + dir * t * aBeam.x + (s1 * position.x + s2 * position.z) * r;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * vp;
  vT = t;
  int ci = int(aBeam.w);
  vC = ci == 0 ? uCols[0] : ci == 1 ? uCols[1] : uCols[2];
  vViewZ = -vp.z;
  vec3 nrm = normalize(s1 * position.x + s2 * position.z);
  vec3 V = normalize(cameraPosition - wp);
  vFace = abs(dot(nrm, V));
}`;

const beamFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform float uGain;
varying float vT;
varying vec3 vC;
varying float vViewZ;
varying float vFace;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float fall = pow(1.0 - vT, 3.2) * smoothstep(0.0, 0.08, vT);
  float core = pow(vFace, 2.5);
  gl_FragColor = vec4(vC * fall * core * uGain * vis, 1.0);
}`;

const hazeVert = /* glsl */ `
varying vec3 vW;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const hazeFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform vec3 uCol;
uniform vec3 uCol2;
uniform float uY0;
uniform float uY1;
uniform float uTime;
varying vec3 vW;
varying float vViewZ;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float h = saturate((vW.y - uY0) / (uY1 - uY0));
  float a = pow(1.0 - h, 2.4) * smoothstep(0.0, 0.08, h);
  float az = atan(vW.x, -vW.z);
  a *= 0.75 + 0.25 * vnoise(vec2(az * 14.0 + uTime * 0.02, h * 3.0));
  vec3 c = mix(uCol, uCol2, h);
  gl_FragColor = vec4(c * a * vis, 1.0);
}`;

export type TownLights = { group: THREE.Group; update(camera: THREE.PerspectiveCamera, heightPx: number): void };

export function buildTownLights(density: number): TownLights {
  const group = new THREE.Group();
  const rand = rng(4242);

  // ---- sparkle points
  const n = Math.round(14000 * density);
  const pos: number[] = [];
  const col: number[] = [];
  const warm = [new THREE.Color(1.0, 0.62, 0.3), new THREE.Color(1.0, 0.8, 0.55), new THREE.Color(1.0, 0.45, 0.45), new THREE.Color(1.0, 0.55, 0.2)];
  const cool = [new THREE.Color(0.45, 0.8, 1.0), new THREE.Color(0.7, 0.8, 1.0), new THREE.Color(0.7, 0.55, 1.0), new THREE.Color(0.5, 1.0, 0.9)];
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const az = THREE.MathUtils.degToRad(-85 + rand() * 212);
    const d = Math.sqrt(THREE.MathUtils.lerp(190 * 190, 5600 * 5600, rand()));
    const x = Math.sin(az) * d;
    const z = -Math.cos(az) * d;
    const onMesa = mesaMask(x, z, 60) > 0.001;
    if (onMesa && rand() < 0.85) continue;
    const y = onMesa ? MESA.h * (0.25 + rand() * 0.6) : landY(x, z) + 2 + Math.pow(rand(), 2) * 45;
    const nearK = 1 - THREE.MathUtils.smoothstep(d, 700, 3000);
    const pick = rand() < nearK * 0.85 + 0.08 ? warm : cool;
    const c = pick[Math.floor(rand() * pick.length)].clone().multiplyScalar(1.2 + rand() * 1.6);
    pos.push(x, y, z, rand() * 100);
    col.push(c.r, c.g, c.b);
    k++;
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  const sg = new THREE.InstancedBufferGeometry();
  sg.index = quad.index;
  sg.setAttribute("position", quad.getAttribute("position"));
  sg.setAttribute("aPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 4));
  sg.setAttribute("aCol", new THREE.InstancedBufferAttribute(new Float32Array(col), 3));
  sg.instanceCount = k;
  const sparkMat = new THREE.ShaderMaterial({
    vertexShader: sparkVert,
    fragmentShader: sparkFrag,
    uniforms: { ...fxShared, uTime: env.uTime, uPxAngle: { value: 0.001 } },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const spark = new THREE.Mesh(sg, sparkMat);
  spark.frustumCulled = false;
  group.add(spark);

  // ---- searchlights
  const beams: [number, number, number, number, number][] = [
    // az, d, length, sweep, colour
    [-30, 1200, 520, 0.06, 0],
    [-9, 1500, 600, 0.07, 1],
    [52, 1300, 560, 0.06, 0],
    [66, 2100, 640, 0.05, 1],
  ];
  const bg = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  bg.translate(0, 0.5, 0);
  const g2 = new THREE.InstancedBufferGeometry();
  g2.index = bg.index;
  g2.setAttribute("position", bg.getAttribute("position"));
  const base = new Float32Array(beams.length * 4);
  const par = new Float32Array(beams.length * 4);
  beams.forEach(([az, d, len, sw, c], i) => {
    const a = THREE.MathUtils.degToRad(az);
    const x = Math.sin(a) * d;
    const z = -Math.cos(a) * d;
    base.set([x, landY(x, z) + 20, z, rand()], i * 4);
    par.set([len, len * 0.09, sw, c], i * 4);
  });
  g2.setAttribute("aBase", new THREE.InstancedBufferAttribute(base, 4));
  g2.setAttribute("aBeam", new THREE.InstancedBufferAttribute(par, 4));
  g2.instanceCount = beams.length;
  const beamMat = new THREE.ShaderMaterial({
    vertexShader: beamVert,
    fragmentShader: beamFrag,
    uniforms: {
      ...fxShared,
      uTime: env.uTime,
      uGain: { value: 0.16 },
      uCols: { value: [new THREE.Color(1.0, 0.45, 0.25), new THREE.Color(0.35, 0.85, 1.0), new THREE.Color(0.8, 0.5, 1.0)] },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const beamMesh = new THREE.Mesh(g2, beamMat);
  beamMesh.frustumCulled = false;
  group.add(beamMesh);

  // ---- warm haze over the near town, cool haze further out
  const hazeMat = (r: number, y0: number, y1: number, c1: THREE.Color, c2: THREE.Color) => {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, 96, 1, true, -Math.PI * 0.62, Math.PI * 1.25);
    g.rotateY(Math.PI);
    g.translate(0, (y0 + y1) / 2, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: hazeVert,
      fragmentShader: hazeFrag,
      uniforms: { ...fxShared, uCol: { value: c1 }, uCol2: { value: c2 }, uY0: { value: y0 }, uY1: { value: y1 }, uTime: env.uTime },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    group.add(mesh);
  };
  hazeMat(300, -45, 45, new THREE.Color(0.13, 0.05, 0.035), new THREE.Color(0.06, 0.02, 0.05));
  hazeMat(1400, -10, 220, new THREE.Color(0.035, 0.03, 0.07), new THREE.Color(0.012, 0.02, 0.06));

  return {
    group,
    update(camera, heightPx) {
      sparkMat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
    },
  };
}
