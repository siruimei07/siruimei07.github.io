import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";
import { mulberry32 } from "./layout";

// Night sakura lit by the town: each tree is a dark trunk under a canopy of
// soft pink "blossom clouds" (camera-facing sprites with a petal-noise
// texture, brighter underneath where the lanterns light them), plus petals
// drifting on the wind around the camera.

const canopyVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iPos; // xyz, radius
attribute float iSeed;
uniform vec2 uRes;
varying vec2 vQ;
varying float vSeed;
varying float vDist;
varying float vUp;
void main() {
  vec4 view = viewMatrix * vec4(iPos.xyz, 1.0);
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  view.xy += q * iPos.w;
  vSeed = iSeed;
  vDist = -view.z;
  vUp = q.y;
  gl_Position = projectionMatrix * view;
}`;

const canopyFrag = /* glsl */ `
${common}
uniform vec3 uFogColor;
uniform float uFogDist;
uniform vec3 uMoonColor;
uniform float uTime;
varying vec2 vQ;
varying float vSeed;
varying float vDist;
varying float vUp;
void main() {
  float r = length(vQ);
  // Lumpy outline + petal speckle.
  float a = atan(vQ.y, vQ.x);
  float edge = 0.78 + 0.16 * vnoise(vec2(a * 3.0 + vSeed * 20.0, vSeed * 7.0)) + 0.06 * vnoise(vec2(a * 9.0, vSeed));
  if (r > edge) discard;
  float speck = vnoise(vQ * 14.0 + vSeed * 31.0) * 0.6 + vnoise(vQ * 33.0 - vSeed * 11.0) * 0.4;
  float depth = sqrt(max(0.0, 1.0 - (r / edge) * (r / edge)));
  vec3 pink = mix(vec3(0.95, 0.52, 0.66), vec3(1.0, 0.78, 0.86), speck);
  // Lit from below by the lanterns, rim-lit by the moon on top.
  float below = smoothstep(0.4, -0.9, vUp);
  vec3 col = pink * (0.16 + 0.5 * below + 0.12 * depth) + uMoonColor * smoothstep(0.3, 0.9, vUp) * 0.35;
  col *= 0.75 + 0.5 * speck;
  float fog = 1.0 - exp(-vDist / uFogDist);
  col = mix(col, uFogColor, fog * 0.7);
  float alpha = smoothstep(edge, edge - 0.12, r) * (0.85 + 0.15 * speck);
  gl_FragColor = vec4(col * alpha, alpha);
}`;

const petalVert = /* glsl */ `
${common}
attribute float corner;
attribute vec4 iP; // box position seed xyz, phase
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform vec2 uRes;
varying vec2 vQ;
varying float vA;
varying float vSpin;
void main() {
  float t = uTime + iP.w * 40.0;
  vec3 p = iP.xyz * uBox;
  // Fall with the wind, flutter, wrap in a box around the camera.
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
  // Petal: an ellipse with a notch.
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

export class Sakura {
  readonly canopies: THREE.Mesh;
  readonly trunks: THREE.InstancedMesh;
  readonly petals: THREE.Mesh;
  private petalMat: THREE.ShaderMaterial;

  constructor(trees: THREE.Vector4[], petalCount: number) {
    const rng = mulberry32(5);
    // Canopy blobs: 6–8 per tree, spread over a dome.
    const pos: number[] = [];
    const seed: number[] = [];
    for (const t of trees) {
      const n = 6 + Math.floor(rng() * 3);
      const R = t.w;
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const rr = Math.sqrt(rng()) * R * 0.75;
        const y = t.y + R * 1.25 + (rng() - 0.3) * R * 0.6;
        pos.push(t.x + Math.cos(a) * rr, y, t.z + Math.sin(a) * rr, R * (0.55 + rng() * 0.35));
        seed.push(rng());
      }
    }
    const cg = new THREE.InstancedBufferGeometry();
    quad(cg);
    cg.setAttribute("iPos", new THREE.InstancedBufferAttribute(new Float32Array(pos), 4));
    cg.setAttribute("iSeed", new THREE.InstancedBufferAttribute(new Float32Array(seed), 1));
    cg.instanceCount = seed.length;
    this.canopies = new THREE.Mesh(
      cg,
      new THREE.ShaderMaterial({
        vertexShader: canopyVert,
        fragmentShader: canopyFrag,
        uniforms: { uRes: G.uRes, uFogColor: G.uFogColor, uFogDist: { value: 1300 }, uMoonColor: G.uMoonColor, uTime: G.uTime },
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    this.canopies.frustumCulled = false;
    this.canopies.renderOrder = 2;

    // Trunks.
    const tg = new THREE.CylinderGeometry(0.22, 0.4, 1, 6);
    tg.translate(0, 0.5, 0);
    this.trunks = new THREE.InstancedMesh(
      tg,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.02, 0.015, 0.015) }),
      trees.length,
    );
    const m = new THREE.Matrix4();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.2, 0, (rng() - 0.5) * 0.2)), new THREE.Vector3(1, t.w * 1.3, 1));
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
        uRes: G.uRes,
        uAlpha: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.petals = new THREE.Mesh(pg, this.petalMat);
    this.petals.frustumCulled = false;
    this.petals.renderOrder = 8;
  }

  update(camera: THREE.Camera, petals: number) {
    // Keep the petal box a little ahead of the camera.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    this.petalMat.uniforms.uCenter.value.copy(camera.position).addScaledVector(fwd, 18);
    this.petalMat.uniforms.uAlpha.value = petals;
    this.petals.visible = petals > 0.01;
  }
}
