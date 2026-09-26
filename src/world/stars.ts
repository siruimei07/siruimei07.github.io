import * as THREE from "three";
import { common, skyMath } from "../engine/glsl";
import { G } from "./atmos";

// Stars as long-exposure trails. Every star is an instanced ribbon along its
// arc around the celestial pole, from where it was when the "exposure"
// started (tail) to where it is now (head). The trail length is animated:
// grow during the time-lapse, then collapse back into points — each ribbon
// becomes a round dot when its length reaches zero. Clouds occlude stars via
// the cloud buffer's transmittance.

const SEG = 10;

const vert = /* glsl */ `
${common}
${skyMath}
attribute float aSeg;
attribute float aSide;
attribute vec3 iDir;
attribute vec4 iProps; // brightness, hue, twinkle phase, size
uniform vec3 uPole;
uniform float uHead;
uniform float uLen;
uniform mat4 uViewRot;
uniform mat4 uProj;
uniform vec2 uRes;
uniform float uWidth;
uniform float uTime;
varying vec2 vPx; // along (px from tail), across (px)
varying float vLenPx;
varying float vHalf;
varying vec3 vColor;
varying float vBright;
varying float vF;

vec4 project(vec3 d) { return uProj * uViewRot * vec4(d, 0.0); }

void main() {
  float f = aSeg / float(${SEG});
  vec3 dTail = rotateAxis(iDir, uPole, uHead - uLen);
  vec3 dHead = rotateAxis(iDir, uPole, uHead);
  vec3 d = rotateAxis(iDir, uPole, uHead - uLen * (1.0 - f));
  vec3 dn = rotateAxis(iDir, uPole, uHead - uLen * (1.0 - f) + 0.003);
  vec4 c = project(d);
  vec4 cn = project(dn);
  vec4 ct = project(dTail);
  vec4 ch = project(dHead);
  if (c.w <= 0.0 || cn.w <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 s = c.xy / c.w * 0.5 * uRes;
  vec2 sn = cn.xy / cn.w * 0.5 * uRes;
  vec2 tng = normalize(sn - s + vec2(1e-6, 0.0));
  vec2 nrm = vec2(-tng.y, tng.x);
  float size = iProps.w;
  float hw = uWidth * size * 0.5 + 0.35;
  float lenPx = length((ch.xy / max(ch.w, 1e-4) - ct.xy / max(ct.w, 1e-4)) * 0.5 * uRes);
  vec2 off = nrm * aSide * hw;
  float along = f * lenPx;
  if (aSeg < 0.5) { off -= tng * hw; along -= hw; }
  if (aSeg > float(${SEG}) - 0.5) { off += tng * hw; along += hw; }
  vPx = vec2(along, aSide * hw);
  vLenPx = lenPx;
  vHalf = hw;
  vF = f;
  c.xy += off * 2.0 / uRes * c.w;
  c.z = c.w * 0.99999;
  gl_Position = c;
  // Colour: mostly white-cyan-blue like the clip, a few warm stars.
  float h = iProps.y;
  vec3 col = h < 0.45 ? mix(vec3(0.62, 0.92, 1.0), vec3(0.5, 0.95, 0.92), h / 0.45)
           : h < 0.8 ? mix(vec3(0.45, 0.62, 1.0), vec3(0.85, 0.9, 1.0), (h - 0.45) / 0.35)
           : mix(vec3(1.0, 0.95, 0.88), vec3(1.0, 0.82, 0.66), (h - 0.8) / 0.2);
  vColor = col;
  float tw = 0.75 + 0.25 * sin(uTime * (1.3 + iProps.z * 3.0) + iProps.z * 50.0);
  // Extinction near the horizon.
  float horizon = smoothstep(-0.01, 0.16, d.y);
  vBright = iProps.x * mix(tw, 1.0, smoothstep(0.0, 0.02, uLen)) * horizon;
}`;

const frag = /* glsl */ `
uniform sampler2D tClouds;
uniform sampler2D tPano;
uniform float uUsePano;
uniform vec2 uRes;
uniform float uAlpha;
uniform float uLen;
varying vec2 vPx;
varying float vLenPx;
varying float vHalf;
varying vec3 vColor;
varying float vBright;
varying float vF;
void main() {
  // Capsule distance: along in [0, len], across the half-width.
  float a = clamp(vPx.x, 0.0, vLenPx);
  vec2 q = vec2(vPx.x - a, vPx.y);
  float d = length(q) / vHalf;
  float core = exp(-d * d * 3.2);
  // Older part of the trail is dimmer.
  float fade = uLen > 0.0005 ? mix(0.3, 1.0, vF * vF) : 1.0;
  float T = uUsePano > 0.5 ? 1.0 : texture(tClouds, gl_FragCoord.xy / uRes).a;
  vec3 col = vColor * vBright * core * fade * T * uAlpha;
  gl_FragColor = vec4(col, 1.0);
}`;

export class StarTrails {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Rotation angle of the sky (radians). */
  head = 0;
  /** Current trail length (radians). */
  length = 0;
  alpha = 0;

  constructor(count: number, rng: () => number) {
    const geo = new THREE.InstancedBufferGeometry();
    const seg: number[] = [];
    const side: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= SEG; i++) {
      seg.push(i, i);
      side.push(-1, 1);
      if (i < SEG) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(seg.length * 3).fill(0), 3));
    geo.setAttribute("aSeg", new THREE.Float32BufferAttribute(seg, 1));
    geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    const dir = new Float32Array(count * 3);
    const props = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Uniform on the sphere, but skip most of the far-below-horizon part.
      const y = rng() * 1.35 - 0.35;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - y * y);
      dir.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
      const m = rng();
      const bright = 0.05 + Math.pow(m, 9) * 6.0;
      props.set([bright, rng(), rng(), 0.8 + Math.pow(rng(), 3) * 1.4 + Math.pow(m, 6) * 0.8], i * 4);
    }
    geo.setAttribute("iDir", new THREE.InstancedBufferAttribute(dir, 3));
    geo.setAttribute("iProps", new THREE.InstancedBufferAttribute(props, 4));
    geo.instanceCount = count;
    const poleAz = THREE.MathUtils.degToRad(90);
    const poleAlt = THREE.MathUtils.degToRad(25);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uPole: { value: new THREE.Vector3(Math.sin(poleAz) * Math.cos(poleAlt), Math.sin(poleAlt), -Math.cos(poleAz) * Math.cos(poleAlt)) },
        uHead: { value: 0 },
        uLen: { value: 0 },
        uViewRot: { value: new THREE.Matrix4() },
        uProj: { value: new THREE.Matrix4() },
        uRes: G.uRes,
        uWidth: { value: 2.2 },
        uTime: G.uTime,
        tClouds: { value: null },
        tPano: { value: null },
        uUsePano: { value: 0 },
        uAlpha: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -2;
  }

  /** Set per-pass camera data (main view or mirrored reflection view). */
  prepare(camera: THREE.PerspectiveCamera, clouds: THREE.Texture | null, reflect: boolean, resScale: number) {
    const u = this.material.uniforms;
    u.uViewRot.value.copy(camera.matrixWorldInverse).setPosition(0, 0, 0);
    u.uProj.value.copy(camera.projectionMatrix);
    u.tClouds.value = clouds;
    u.uUsePano.value = reflect || !clouds ? 1 : 0;
    u.uHead.value = this.head;
    u.uLen.value = this.length;
    u.uAlpha.value = this.alpha * (reflect ? 0.45 : 1);
    u.uWidth.value = 2.2 * Math.max(0.6, resScale);
  }
}
