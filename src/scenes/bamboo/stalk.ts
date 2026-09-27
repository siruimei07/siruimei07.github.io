import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared, toonMaterial } from "../../engine/toon";
import type { EnvValues } from "../common/env";
import { rng } from "../common/util";
import { leafMaterial, NEAR_SPRAY, sprayGeometry } from "./grove";
import { STALK_H, STALK_R } from "./layout";
import { stalkHueGlsl, swayGlsl } from "./shaders";

// 竹取物語: "among the bamboo there was one stalk whose foot shone; inside the
// tube it glowed." Here it glows the way the film's gaming pole does — every
// internode an LED segment, the rainbow climbing slowly — with the joint near
// its foot blazing white where the light pours out. It throws its colours on
// the ground and the culms around it, and sparkles rise from it.

const SEED = 0.37;
/** The joint section that blazes: between these heights (m above the base). */
export const JOINT: [number, number] = [0.72, 1.08];

const stalkVertexHead = /* glsl */ `
uniform vec3 uRoot;
${swayGlsl}`;

const stalkVertex = /* glsl */ `
  wp.xz += culmSway(uRoot.xz, uv.y, ${SEED.toFixed(2)}) * ${STALK_H.toFixed(2)};`;

export class ShiningStalk {
  readonly opaque = new THREE.Group();
  readonly fx = new THREE.Group();
  private sprayMat: THREE.ShaderMaterial;
  private sparkles: THREE.ShaderMaterial | null = null;
  private hueColor = new THREE.Color();
  private white = new THREE.Color(1.5, 1.45, 1.4);

  constructor(
    private base: THREE.Vector3,
    private lights: EnvValues,
    density: number,
  ) {
    const geo = new THREE.CylinderGeometry(0.9, 1, 1, 22, 60, true);
    geo.translate(0, 0.5, 0);
    const stalk = new THREE.Mesh(
      geo,
      toonMaterial({
        color: 0xd9e6f2,
        shade: 0x506a9a,
        ink: 6,
        rim: 1.0,
        uniforms: { uRoot: { value: base } },
        vertexHead: stalkVertexHead,
        vertex: stalkVertex,
        fragmentHead: /* glsl */ `
          uniform vec3 uRoot;
          ${stalkHueGlsl}`,
        fragment: /* glsl */ `
          float y = vWorldPos.y - uRoot.y;
          float u = y / STALK_SP;
          float f = fract(u);
          float w = fwidth(u);
          vec3 rgb = hsv2rgb(vec3(stalkHue(y), 0.92, 1.0));
          float dn = min(f, 1.0 - f);
          float node = smoothstep(0.075 + w, 0.025, dn);
          // each internode a lit tube, LED pixels chasing upward inside it
          float tube = 0.62 + 0.38 * sin(3.14159 * f);
          float chase = 0.8 + 0.2 * step(0.5, fract(y * 6.0 - uTime * 1.1));
          float face = pow(saturate(dot(n, V)), 0.5);
          float fall = mix(1.0, 0.4, smoothstep(1.5, ${STALK_H.toFixed(1)}, y));
          float breathe = 0.88 + 0.12 * sin(uTime * 1.3);
          // the blazing joint where the light pours out
          float joint = smoothstep(${JOINT[0].toFixed(2)} + 0.02, ${JOINT[0].toFixed(2)} + 0.06, y) * smoothstep(${JOINT[1].toFixed(2)} - 0.02, ${JOINT[1].toFixed(2)} - 0.06, y);
          base = rgb * 0.3 + 0.04;
          shade = rgb * 0.16 + 0.02;
          emis += rgb * (1.5 * tube * chase * fall * breathe) * (0.45 + 0.55 * face);
          emis += mix(rgb, vec3(1.0), 0.35) * node * 1.8 * fall * breathe;
          emis += joint * (vec3(1.0, 0.97, 0.92) * 9.0 * (0.75 + 0.25 * face) + rgb * 2.5) * breathe;
          // a warm glow at the very foot
          emis += vec3(1.0, 0.9, 0.8) * smoothstep(0.5, 0.0, y) * 1.2;`,
      }),
    );
    stalk.position.copy(base);
    stalk.scale.set(STALK_R, STALK_H, STALK_R);
    stalk.frustumCulled = false;
    this.opaque.add(stalk);

    // its own leaves: lit from below by its colours
    const rand = rng(2525);
    this.sprayMat = leafMaterial(0x6aa98c, 0x16384a, 7);
    const sprays: THREE.Matrix4[] = [];
    const roots: number[] = [];
    const q = new THREE.Quaternion();
    const qa = new THREE.Quaternion();
    for (let i = 0; i < 26; i++) {
      const t = 0.45 + Math.pow(rand(), 0.7) * 0.55;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2).multiply(qa.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.2 + rand() * 0.4 - t * 0.2));
      const s = 0.9 + rand() * 0.5;
      sprays.push(new THREE.Matrix4().compose(new THREE.Vector3(base.x, base.y + STALK_H * t, base.z), q.clone(), new THREE.Vector3(s, s, s)));
      roots.push(base.x, base.z, t, SEED);
    }
    const sprayGeo = sprayGeometry(11, NEAR_SPRAY);
    const sprayMesh = new THREE.InstancedMesh(sprayGeo, this.sprayMat, sprays.length);
    sprays.forEach((m, i) => sprayMesh.setMatrixAt(i, m));
    sprayGeo.setAttribute("aRoot", new THREE.InstancedBufferAttribute(new Float32Array(roots), 4));
    sprayGeo.setAttribute("aHeight", new THREE.InstancedBufferAttribute(new Float32Array(sprays.length).fill(STALK_H), 1));
    sprayMesh.frustumCulled = false;
    this.opaque.add(sprayMesh);

    this.buildFx(density);
  }

  private buildFx(density: number) {
    // 1. a soft coloured haze along the stalk (camera-facing ribbon)
    const rows = 48;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      pos.push(-1, t, 0, 1, t, 0);
      if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
    }
    const rib = new THREE.BufferGeometry();
    rib.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    rib.setIndex(idx);
    const ribbon = new THREE.Mesh(
      rib,
      fxMaterial(
        /* glsl */ `
        uniform vec3 uRoot;
        uniform float uH;
        varying vec2 vQ;
        varying float vY;
        varying float vViewZ;
        ${swayGlsl}
        void main() {
          float t = position.y;
          vec3 a = uRoot + vec3(0.0, t * uH, 0.0);
          a.xz += culmSway(uRoot.xz, t, ${SEED.toFixed(2)}) * uH;
          vec4 vp = viewMatrix * vec4(a, 1.0);
          float w = mix(0.85, 0.45, t) + 0.35 * exp(-pow((t * uH - 0.9) / 0.6, 2.0));
          vp.x += position.x * w;
          vQ = vec2(position.x, t);
          vY = t * uH;
          vViewZ = -vp.z;
          gl_Position = projectionMatrix * vp;
        }`,
        /* glsl */ `
        uniform float uGain;
        varying vec2 vQ;
        varying float vY;
        varying float vViewZ;
        ${stalkHueGlsl}
        void main() {
          float vis = sceneVisible(vViewZ - 0.3);
          float across = exp(-vQ.x * vQ.x * 4.0) * 0.7 + exp(-vQ.x * vQ.x * 22.0) * 0.6;
          vec3 c = hsv2rgb(vec3(stalkHueSmooth(vY), 0.75, 1.0));
          float k = mix(1.0, 0.3, smoothstep(1.0, 15.0, vY)) * smoothstep(0.0, 0.3, vY);
          k += 1.6 * exp(-pow((vY - 0.9) / 0.45, 2.0));
          gl_FragColor = vec4(c * across * k * 0.3 * uGain * vis, 1.0);
        }`,
        { uRoot: { value: this.base }, uH: { value: STALK_H }, uGain: { value: 1 } },
      ),
    );
    ribbon.frustumCulled = false;
    this.fx.add(ribbon);

    // 2. the joint's burst: a white core and slow rays pouring out
    const burst = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      fxMaterial(
        /* glsl */ `
        uniform vec3 uCenter;
        uniform float uSize;
        varying vec2 vQ;
        varying float vViewZ;
        void main() {
          vec4 vp = viewMatrix * vec4(uCenter, 1.0);
          vp.xy += position.xy * uSize;
          vQ = position.xy;
          vViewZ = -vp.z;
          gl_Position = projectionMatrix * vp;
        }`,
        /* glsl */ `
        uniform float uGain;
        varying vec2 vQ;
        varying float vViewZ;
        ${stalkHueGlsl}
        void main() {
          float vis = sceneVisible(vViewZ - 0.4);
          vec2 q = vQ * vec2(1.0, 1.35);
          float r = length(q);
          float a = atan(q.y, q.x);
          float core = exp(-r * r * 60.0) * 2.2 + exp(-r * r * 9.0) * 0.5;
          float rays = pow(saturate(sin(a * 7.0 + uTime * 0.25) * 0.5 + 0.5), 10.0) + pow(saturate(sin(a * 11.0 - uTime * 0.18 + 1.3) * 0.5 + 0.5), 14.0) * 0.8;
          rays *= smoothstep(1.0, 0.1, r) * smoothstep(0.02, 0.15, r) * (0.6 + 0.4 * sin(uTime * 1.3 + a * 3.0));
          vec3 c = hsv2rgb(vec3(stalkHue(0.9) + a * 0.05, 0.55, 1.0));
          vec3 col = vec3(1.0, 0.97, 0.9) * core + c * rays * 0.5;
          gl_FragColor = vec4(col * uGain * vis * 0.6, 1.0);
        }`,
        {
          uCenter: { value: new THREE.Vector3(this.base.x, this.base.y + (JOINT[0] + JOINT[1]) / 2, this.base.z) },
          uSize: { value: 2.5 },
          uGain: { value: 1 },
        },
      ),
    );
    burst.frustumCulled = false;
    this.fx.add(burst);

    // 3. sparkles spiralling up out of the joint
    const n = Math.round(150 * density);
    const seeds = new Float32Array(n * 4);
    const rand = rng(1717);
    for (let i = 0; i < n; i++) seeds.set([rand(), rand(), rand(), rand()], i * 4);
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = n;
    const sparkles = new THREE.Mesh(
      g,
      fxMaterial(
        /* glsl */ `
        uniform vec3 uRoot;
        uniform float uPxAngle;
        attribute vec4 aSeed;
        varying vec2 vQ;
        varying float vViewZ;
        varying vec3 vCol;
        varying float vA;
        ${stalkHueGlsl}
        void main() {
          float period = 5.0 + aSeed.x * 6.0;
          float ph = fract(uTime / period + aSeed.y);
          float y = ${((JOINT[0] + JOINT[1]) / 2).toFixed(2)} + ph * (5.0 + aSeed.z * 9.0);
          float rad = 0.14 + ph * (0.3 + 1.6 * aSeed.w) + 0.05 * sin(uTime * 2.0 + aSeed.x * 30.0);
          float ang = aSeed.x * 6.2832 + ph * (2.0 + aSeed.z * 5.0) * (aSeed.w > 0.5 ? 1.0 : -1.0);
          vec3 p = uRoot + vec3(cos(ang) * rad, y, sin(ang) * rad);
          vec4 vp = viewMatrix * vec4(p, 1.0);
          float depth = max(-vp.z, 0.1);
          float size = max(0.035 + 0.05 * aSeed.z, depth * uPxAngle * 3.0);
          float tw = 0.55 + 0.45 * sin(uTime * (6.0 + aSeed.w * 8.0) + aSeed.y * 50.0);
          vp.xy += position.xy * size * (0.7 + 0.6 * tw);
          vQ = position.xy;
          vViewZ = depth;
          vCol = hsv2rgb(vec3(stalkHue(y - ph * 2.0), 0.55, 1.0));
          vA = smoothstep(0.0, 0.06, ph) * smoothstep(1.0, 0.55, ph) * tw;
          gl_Position = projectionMatrix * vp;
        }`,
        /* glsl */ `
        varying vec2 vQ;
        varying float vViewZ;
        varying vec3 vCol;
        varying float vA;
        void main() {
          float vis = sceneVisible(vViewZ);
          vec2 q = abs(vQ);
          float star = exp(-dot(q, q) * 14.0) + (exp(-q.x * 16.0) * exp(-q.y * 2.6) + exp(-q.y * 16.0) * exp(-q.x * 2.6)) * 0.55;
          vec3 c = mix(vCol, vec3(1.0), exp(-dot(q, q) * 40.0));
          gl_FragColor = vec4(c * star * vA * 2.2 * vis, 1.0);
        }`,
        { uRoot: { value: this.base }, uPxAngle: { value: 0.001 } },
      ),
    );
    sparkles.frustumCulled = false;
    this.fx.add(sparkles);
    this.sparkles = sparkles.material as THREE.ShaderMaterial;
  }

  update(t: number, camera: THREE.PerspectiveCamera, heightPx: number) {
    // the light it throws follows the colour of the blazing joint
    const hue = (((Math.floor(0.9 / 0.36) * 0.045 - t * 0.085) % 1) + 1) % 1;
    const breathe = 0.88 + 0.12 * Math.sin(t * 1.3);
    this.hueColor.setHSL(hue, 0.9, 0.6);
    this.lights.poleCol.copy(this.hueColor).multiplyScalar(2.4 * breathe).lerp(this.white, 0.25);
    this.lights.poleLight.set(this.base.x, this.base.y + 1.0, this.base.z, 9);
    // its own crown catches a little of the colour
    this.sprayMat.uniforms.uEmissive.value.copy(this.hueColor).multiplyScalar(0.05);
    if (this.sparkles) this.sparkles.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }
}

/** Additive fx material: depth-tests itself against the G-buffer. */
export function fxMaterial(vertexBody: string, fragmentBody: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      ${common}
      uniform float uTime;
      uniform vec3 uWind;
      ${vertexBody}`,
    fragmentShader: /* glsl */ `
      ${common}
      ${fxDepthTest}
      uniform float uTime;
      ${fragmentBody}`,
    uniforms: { ...fxShared, uTime: env.uTime, uWind: env.uWind, ...uniforms },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
