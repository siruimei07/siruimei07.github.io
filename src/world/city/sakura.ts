import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { mulberry32 } from "./layout";

// Night sakura lit by the town. Each canopy is a pointillist cloud of small
// blossom clusters (several hundred per tree, packed into a few lumpy lobes),
// brightest underneath where the lanterns light them and frosted with
// moonlight on top; dark trunks below; petals drift on the wind around the
// camera.

const blossomVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iPos; // xyz, radius
attribute vec4 iInfo; // height in canopy (0 bottom .. 1 top), hue, seed, twinkle
uniform float uTime;
uniform vec2 uRes;
uniform float uPx;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;
varying float vDist;
void main() {
  vec3 p = iPos.xyz;
  // A breath of wind through the branches.
  float sway = sin(uTime * 0.9 + p.x * 0.05 + p.z * 0.04) * 0.12 * iInfo.x;
  p.x += sway;
  vec4 view = viewMatrix * vec4(p, 1.0);
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float dist = -view.z;
  vDist = dist;
  float px = iPos.w * uRes.y * projectionMatrix[1][1] * 0.5 / max(dist, 0.1);
  float draw = max(px, uPx);
  float energy = min(1.0, (px * px) / (draw * draw) + 0.15);
  view.xy += q * iPos.w * (draw / max(px, 1e-3));
  gl_Position = projectionMatrix * view;
  vec3 deep = vec3(0.86, 0.36, 0.52);
  vec3 pale = vec3(1.0, 0.8, 0.88);
  vec3 c = mix(deep, pale, iInfo.y);
  // Lantern light from below, moonlight on top.
  float lamp = mix(1.0, 0.35, iInfo.x);
  vec3 moon = vec3(0.55, 0.62, 0.85) * smoothstep(0.55, 1.0, iInfo.x) * 0.5;
  float tw = 0.85 + 0.15 * sin(uTime * (1.5 + iInfo.w * 3.0) + iInfo.z * 40.0);
  vCol = c * (0.22 + lamp * 0.62) * tw + moon * pale;
  vA = energy;
}`;

const blossomFrag = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDist;
uniform float uGain;
varying vec2 vQ;
varying vec3 vCol;
varying float vA;
varying float vDist;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float m = exp(-r2 * 2.6);
  vec3 col = vCol;
  float fog = 1.0 - exp(-vDist / uFogDist);
  col = mix(col, uFogColor, fog * 0.6);
  float a = m * vA * 0.85;
  gl_FragColor = vec4(col * a * uGain, a);
}`;

const petalVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iP; // box position seed xyz, phase
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
varying vec2 vQ;
varying float vA;
varying float vSpin;
void main() {
  float t = uTime + iP.w * 40.0;
  vec3 p = iP.xyz * uBox;
  p += vec3(t * 0.9, -t * 0.55, t * -0.35);
  p += vec3(sin(t * 1.7 + iP.w * 9.0), sin(t * 1.1 + iP.w * 5.0) * 0.4, cos(t * 1.3 + iP.w * 7.0)) * 0.6;
  p = mod(p - uCenter + uBox * 0.5, uBox) - uBox * 0.5 + uCenter;
  vec4 view = viewMatrix * vec4(p, 1.0);
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float spin = t * 2.0 + iP.w * 30.0;
  vSpin = spin;
  vec2 qq = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * (q * vec2(1.0, 0.55 + 0.45 * sin(t * 3.0 + iP.w * 20.0)));
  view.xy += qq * 0.09;
  vA = smoothstep(uBox.z * 0.5, uBox.z * 0.3, length(p - uCenter)) * smoothstep(0.3, 1.5, -view.z);
  gl_Position = projectionMatrix * view;
}`;

const petalFrag = /* glsl */ `
uniform float uAlpha;
varying vec2 vQ;
varying float vA;
varying float vSpin;
void main() {
  vec2 q = vQ;
  float d = length(q * vec2(1.0, 1.4));
  float notch = smoothstep(0.25, 0.0, length(q - vec2(0.0, 0.95)));
  float m = smoothstep(1.0, 0.8, d) * (1.0 - notch);
  vec3 col = mix(vec3(1.0, 0.72, 0.82), vec3(1.0, 0.9, 0.94), 0.5 + 0.5 * sin(vSpin));
  gl_FragColor = vec4(col * 0.9 * m * vA * uAlpha, m * vA * uAlpha * 0.9);
}`;

function quad(geo: THREE.InstancedBufferGeometry) {
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
  geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
}

const premul = {
  transparent: true,
  depthWrite: false,
  premultipliedAlpha: true,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
} as const;

export class Sakura {
  readonly canopies: THREE.Mesh;
  readonly trunks: THREE.InstancedMesh;
  readonly petals: THREE.Mesh;
  private petalMat: THREE.ShaderMaterial;

  constructor(trees: THREE.Vector4[], petalCount: number, perTree = 520) {
    const rng = mulberry32(5);
    const pos: number[] = [];
    const info: number[] = [];
    for (const t of trees) {
      const R = t.w;
      // 4–6 lobes make the canopy lumpy.
      const lobes: THREE.Vector4[] = [];
      const nl = 4 + Math.floor(rng() * 3);
      for (let i = 0; i < nl; i++) {
        const a = rng() * Math.PI * 2;
        const rr = rng() * R * 0.55;
        lobes.push(new THREE.Vector4(Math.cos(a) * rr, R * (1.15 + rng() * 0.45), Math.sin(a) * rr, R * (0.5 + rng() * 0.3)));
      }
      for (let i = 0; i < perTree; i++) {
        const L = lobes[Math.floor(rng() * lobes.length)];
        // Points concentrated toward the lobe surface.
        const u = rng() * 2 - 1;
        const phi = rng() * Math.PI * 2;
        const rad = L.w * Math.pow(rng(), 0.35);
        const sx = Math.sqrt(1 - u * u);
        const x = t.x + L.x + sx * Math.cos(phi) * rad;
        const y = t.y + L.y + u * rad * 0.62;
        const z = t.z + L.z + sx * Math.sin(phi) * rad;
        const h = THREE.MathUtils.clamp((y - (t.y + R * 0.8)) / (R * 1.4), 0, 1);
        pos.push(x, y, z, 0.28 + rng() * 0.3);
        info.push(h, rng(), rng(), rng());
      }
    }
    const cg = new THREE.InstancedBufferGeometry();
    quad(cg);
    cg.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 4));
    cg.setAttribute("iInfo", new THREE.InstancedBufferAttribute(new Float32Array(info), 4));
    cg.instanceCount = info.length / 4;
    this.canopies = new THREE.Mesh(
      cg,
      new THREE.ShaderMaterial({
        vertexShader: blossomVert,
        fragmentShader: blossomFrag,
        uniforms: { uTime: G.uTime, uRes: G.uRes, uPx: { value: 1.3 }, uFogColor: G.uFogColor, uFogDist: { value: 1300 }, uGain: { value: 1.6 } },
        ...premul,
      }),
    );
    this.canopies.frustumCulled = false;
    this.canopies.renderOrder = 2;

    // Trunks: dark, slightly leaning.
    const tg = new THREE.CylinderGeometry(0.2, 0.42, 1, 6);
    tg.translate(0, 0.5, 0);
    this.trunks = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.014, 0.014) }), trees.length);
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => {
      m.compose(
        new THREE.Vector3(t.x, t.y - 0.3, t.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2)),
        new THREE.Vector3(1, t.w * 1.25, 1),
      );
      this.trunks.setMatrixAt(i, m);
    });
    this.trunks.frustumCulled = false;

    // Petals.
    const pg = new THREE.InstancedBufferGeometry();
    quad(pg);
    const pp = new Float32Array(petalCount * 4);
    for (let i = 0; i < petalCount; i++) pp.set([rng(), rng(), rng(), rng()], i * 4);
    pg.setAttribute("iP", new THREE.InstancedBufferAttribute(pp, 4));
    pg.instanceCount = petalCount;
    this.petalMat = new THREE.ShaderMaterial({
      vertexShader: petalVert,
      fragmentShader: petalFrag,
      uniforms: {
        uTime: G.uTime,
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(60, 36, 60) },
        uAlpha: { value: 1 },
      },
      ...premul,
      side: THREE.DoubleSide,
    });
    this.petals = new THREE.Mesh(pg, this.petalMat);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 8;
  }

  update(camera: THREE.Camera, petals: number) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this.petalMat.uniforms.uCenter.value.copy(camera.position).addScaledVector(fwd, 18);
    this.petalMat.uniforms.uAlpha.value = petals;
    this.petals.visible = petals > 0.01;
  }
}
