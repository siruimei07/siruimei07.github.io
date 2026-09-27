import * as THREE from "three";
import { rng } from "../common/util";
import { SHAFTS } from "./ground";
import { groundY, moonDir } from "./layout";
import { fxMaterial } from "./stalk";

// Night air in the grove: slanting shafts of moonlight through the canopy
// gaps (they land where the ground shows its dapples), and drifting motes —
// warm fireflies low over the grass, cool cyan dust higher up.

export function buildShafts(): THREE.Mesh {
  const rows = 10;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= rows; i++) {
    const s = i / rows;
    pos.push(-1, s, 0, 1, s, 0);
    if (i > 0) idx.push((i - 1) * 2, (i - 1) * 2 + 1, i * 2, (i - 1) * 2 + 1, i * 2 + 1, i * 2);
  }
  const strip = new THREE.BufferGeometry();
  strip.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  strip.setIndex(idx);
  const g = new THREE.InstancedBufferGeometry();
  g.index = strip.index;
  g.setAttribute("position", strip.getAttribute("position"));
  const a = new Float32Array(SHAFTS.length * 4);
  const b = new Float32Array(SHAFTS.length * 2);
  SHAFTS.forEach(([x, z, w, s], i) => {
    a.set([x, groundY(x, z), z, w], i * 4);
    // length: from the ground up to where it enters the canopy (~14–17 m high)
    b.set([(13.5 + s * 4) / moonDir.y, s], i * 2);
  });
  g.setAttribute("aShaft", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aShaft2", new THREE.InstancedBufferAttribute(b, 2));
  g.instanceCount = SHAFTS.length;
  const mesh = new THREE.Mesh(
    g,
    fxMaterial(
      /* glsl */ `
      uniform vec3 uMoon;
      attribute vec4 aShaft;
      attribute vec2 aShaft2;
      varying vec2 vQ;
      varying float vViewZ;
      varying float vSeed;
      varying float vLen;
      void main() {
        float s = position.y;
        vec3 A = aShaft.xyz + uMoon * aShaft2.x * s;
        vec3 side = normalize(cross(uMoon, cameraPosition - A));
        float w = aShaft.w * (0.8 + 0.4 * s);
        vec3 p = A + side * position.x * w;
        vec4 vp = viewMatrix * vec4(p, 1.0);
        vQ = vec2(position.x, s);
        vViewZ = -vp.z;
        vSeed = aShaft2.y;
        vLen = aShaft2.x;
        gl_Position = projectionMatrix * vp;
      }`,
      /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vQ;
      varying float vViewZ;
      varying float vSeed;
      varying float vLen;
      void main() {
        float vis = sceneVisible(vViewZ);
        float x = vQ.x;
        float across = pow(saturate(1.0 - x * x), 2.0);
        float s = vQ.y;
        float along = smoothstep(0.0, 0.05, s) * smoothstep(0.85, 0.35, s);
        // leaves passing across the gap make the shaft flicker and stripe
        float m = vnoise(vec2(x * 1.5 + vSeed * 30.0, s * vLen * 0.35 - uTime * 0.25));
        float stripes = 0.6 + 0.4 * vnoise(vec2(x * 4.0 + vSeed * 11.0, uTime * 0.15));
        float k = across * along * (0.45 + 0.55 * m) * stripes;
        gl_FragColor = vec4(uColor * k * vis, 1.0);
      }`,
      { uMoon: { value: moonDir }, uColor: { value: new THREE.Color(0.085, 0.115, 0.2) } },
    ),
  );
  mesh.frustumCulled = false;
  return mesh;
}

export class Motes {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(density: number) {
    const rand = rng(99);
    const nFly = Math.round(46 * density);
    const nDust = Math.round(170 * density);
    const n = nFly + nDust;
    const a = new Float32Array(n * 4);
    const b = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const fly = i < nFly;
      // around the clearing, the path and the shrine; fireflies low over the grass
      const x = -12 + rand() * 26;
      const z = -24 + rand() * 30;
      const y = groundY(x, z) + (fly ? 0.25 + rand() * 1.8 : 0.4 + rand() * 7.5);
      a.set([x, y, z, fly ? 1 : 0], i * 4);
      b.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(a, 4));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(b, 4));
    g.instanceCount = n;
    this.mat = fxMaterial(
      /* glsl */ `
      uniform float uPxAngle;
      attribute vec4 aPos;
      attribute vec4 aSeed;
      varying vec2 vQ;
      varying float vViewZ;
      varying vec3 vCol;
      varying float vA;
      void main() {
        float fly = aPos.w;
        vec3 p = aPos.xyz;
        float t = uTime;
        vec2 ph = aSeed.xy * 6.2832;
        float amp = fly > 0.5 ? 0.9 : 1.4;
        p += vec3(sin(t * (0.21 + aSeed.z * 0.2) + ph.x), 0.4 * sin(t * (0.33 + aSeed.w * 0.2) + ph.y), cos(t * (0.17 + aSeed.w * 0.15) + ph.x * 1.3)) * amp;
        if (fly < 0.5) p.y += mod(t * (0.05 + 0.08 * aSeed.z) + aSeed.w * 6.0, 6.0) - 3.0;
        vec4 vp = viewMatrix * vec4(p, 1.0);
        float depth = max(-vp.z, 0.1);
        float size = fly > 0.5 ? 0.055 : 0.03 + 0.02 * aSeed.z;
        size = max(size, depth * uPxAngle * (fly > 0.5 ? 3.5 : 2.0));
        vp.xy += position.xy * size;
        vQ = position.xy;
        vViewZ = depth;
        // fireflies: slow flashes; dust: a gentle twinkle
        float blink = fly > 0.5 ? pow(saturate(sin(t * (0.7 + aSeed.z * 0.6) + ph.y * 3.0)), 3.0) : 0.55 + 0.45 * sin(t * (2.0 + aSeed.w * 3.0) + ph.x * 7.0);
        vCol = fly > 0.5 ? mix(vec3(1.0, 0.72, 0.3), vec3(0.85, 1.0, 0.45), aSeed.w * 0.6) : mix(vec3(0.72, 0.95, 1.0), vec3(0.95, 0.98, 1.0), aSeed.z);
        vA = blink * (fly > 0.5 ? 2.0 : 1.0) * smoothstep(40.0, 12.0, depth) * smoothstep(1.5, 4.0, depth);
        gl_Position = projectionMatrix * vp;
      }`,
      /* glsl */ `
      varying vec2 vQ;
      varying float vViewZ;
      varying vec3 vCol;
      varying float vA;
      void main() {
        float vis = sceneVisible(vViewZ);
        float r2 = dot(vQ, vQ);
        float k = exp(-r2 * 22.0) * 1.3 + exp(-r2 * 5.0) * 0.28;
        gl_FragColor = vec4(vCol * k * vA * vis, 1.0);
      }`,
      { uPxAngle: { value: 0.001 } },
    );
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
  }

  update(camera: THREE.PerspectiveCamera, heightPx: number) {
    this.mat.uniforms.uPxAngle.value = THREE.MathUtils.degToRad(camera.fov) / Math.max(1, heightPx);
  }
}

/**
 * Ground mist in depth layers: soft bands hung across the view at a few
 * distances. Each one hazes only what lies behind it (depth-tested), so the
 * grove fades into blue mist layer by layer, heaviest near the ground.
 */
export function buildMist(cam: THREE.Vector3, yawDeg: number, groundLevel: number): THREE.Mesh {
  const layers: [number, number, number][] = [
    // distance from the screen camera (m), band height (m), strength
    [16, 3.2, 0.5],
    [27, 4.5, 0.7],
    [42, 6.5, 0.85],
    [64, 9.0, 1.0],
  ];
  const quad = new THREE.PlaneGeometry(2, 2, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  const a = new Float32Array(layers.length * 4);
  layers.forEach(([d, h, k], i) => a.set([d, h, k, i * 0.37], i * 4));
  g.setAttribute("aLayer", new THREE.InstancedBufferAttribute(a, 4));
  g.instanceCount = layers.length;
  const mesh = new THREE.Mesh(
    g,
    fxMaterial(
      /* glsl */ `
      uniform vec3 uCam;
      uniform vec3 uFwd;
      attribute vec4 aLayer;
      varying vec3 vW;
      varying float vViewZ;
      varying vec4 vL;
      void main() {
        // a wide vertical band at distance d in front of the screen camera, facing it
        vec3 right = vec3(-uFwd.z, 0.0, uFwd.x);
        float d = aLayer.x;
        vec3 p = uCam + uFwd * d + right * position.x * (d * 1.7 + 12.0) + vec3(0.0, (position.y * 0.5 + 0.5) * (aLayer.y + 9.0) - 6.0, 0.0);
        vW = p;
        vec4 vp = viewMatrix * vec4(p, 1.0);
        vViewZ = -vp.z;
        vL = aLayer;
        gl_Position = projectionMatrix * vp;
      }`,
      /* glsl */ `
      uniform vec3 uCam;
      uniform vec3 uColor;
      uniform vec3 uMoonC;
      uniform vec3 uMoon;
      varying vec3 vW;
      varying float vViewZ;
      varying vec4 vL;
      void main() {
        float vis = sceneVisible(vViewZ);
        if (vis <= 0.0) discard;
        float h = vW.y - uCam.y;
        float top = vL.y * (0.75 + 0.5 * fbm2(vec2(vW.x * 0.05 + vL.w * 10.0 + uTime * 0.02, vL.w), 2));
        float band = smoothstep(top, top * 0.2, h) * smoothstep(-4.0, 0.0, h);
        float drift = 0.65 + 0.35 * fbm2(vec2((vW.x + vW.z) * 0.08 - uTime * 0.05, h * 0.3 + vL.w * 7.0), 3);
        vec3 dir = normalize(vW - cameraPosition);
        float toMoon = pow(saturate(dot(dir, uMoon) * 0.5 + 0.5), 4.0);
        vec3 col = mix(uColor, uMoonC, toMoon);
        gl_FragColor = vec4(col * band * drift * vL.z * vis, 1.0);
      }`,
      {
        uCam: { value: new THREE.Vector3(cam.x, groundLevel, cam.z) },
        uFwd: { value: new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(yawDeg)), 0, -Math.cos(THREE.MathUtils.degToRad(yawDeg))) },
        uColor: { value: new THREE.Color(0.015, 0.034, 0.078) },
        uMoonC: { value: new THREE.Color(0.032, 0.062, 0.125) },
        uMoon: { value: moonDir },
      },
    ),
  );
  mesh.frustumCulled = false;
  return mesh;
}
