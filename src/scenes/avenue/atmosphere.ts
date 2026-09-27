import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env, fxDepthTest, fxShared } from "../../engine/toon";

// The air of the district: glowing domes of warm haze over the bright places
// (light scattered by the crowd's lanterns, integrated analytically along each
// view ray and cut short by whatever the ray hits), and searchlight beams that
// sweep slowly across the sky.

const domeVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const domeFrag = /* glsl */ `
${common}
uniform sampler2D tAux;
uniform vec2 uRes;
uniform vec3 uCentre;
uniform vec3 uRadii;
uniform vec3 uColor;
uniform float uK;
varying vec3 vWorld;

float erfA(float x) {
  float x2 = x * x;
  float a = 0.147;
  float v = sqrt(1.0 - exp(-x2 * (1.2732 + a * x2) / (1.0 + a * x2)));
  return x < 0.0 ? -v : v;
}

void main() {
  vec3 dir = normalize(vWorld - cameraPosition);
  vec3 fwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  float sz = texture2D(tAux, gl_FragCoord.xy / uRes).z;
  float tEnd = sz <= 0.0 ? 1e6 : sz / max(dot(dir, fwd), 1e-3);
  // Gaussian density exp(−k |(p − c) / R|²) integrated from the eye to tEnd
  vec3 o = (cameraPosition - uCentre) / uRadii;
  vec3 d = dir / uRadii;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o);
  float ka = sqrt(uK * a);
  float peak = exp(-uK * (c - b * b / a));
  float t0 = b / a;
  float integral = peak * 0.8862 / ka * (erfA(ka * (tEnd + t0)) - erfA(ka * t0));
  // in units of the mean radius: about 1.4 straight through the centre
  float l = integral / dot(uRadii, vec3(1.0 / 3.0));
  vec3 col = uColor * l;
  gl_FragColor = vec4(col, 1.0);
}`;

export class GlowDome {
  readonly mesh: THREE.Mesh;

  constructor(centre: THREE.Vector3, radii: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, k = 1.6) {
    const box = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: domeVert,
      fragmentShader: domeFrag,
      uniforms: {
        tAux: fxShared.tAux,
        uRes: fxShared.uRes,
        uCentre: { value: centre.clone() },
        uRadii: { value: radii.clone() },
        uColor: { value: new THREE.Color(color).multiplyScalar(intensity) },
        uK: { value: k },
      },
      side: THREE.BackSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(box, mat);
    // the box spans ±2 σ-ish of the Gaussian
    this.mesh.position.copy(centre);
    this.mesh.scale.copy(radii).multiplyScalar(1.6);
    this.mesh.frustumCulled = false;
  }
}

const beamVert = /* glsl */ `
varying vec3 vWorld;
varying vec3 vN;
varying float vAlong;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * vec3(normal.x, 0.0, normal.z));
  vAlong = uv.y;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const beamFrag = /* glsl */ `
${common}
${fxDepthTest}
uniform vec3 uColor;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vN;
varying float vAlong;
varying float vViewZ;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  float face = abs(dot(normalize(vN), V));
  float core = pow(face, 3.0);
  float along = vAlong;                // CylinderGeometry uv.y: 0 at the lamp (bottom), 1 at the far end
  float fall = exp(-along * 2.6) * smoothstep(0.0, 0.01, along);
  float shimmer = 0.9 + 0.1 * sin(uTime * 1.3 + along * 30.0);
  gl_FragColor = vec4(uColor * core * fall * shimmer * vis, 1.0);
}`;

export class Searchlight {
  readonly mesh: THREE.Mesh;
  private base: THREE.Vector3;
  private az0: number;
  private el: number;
  private swing: number;
  private rate: number;
  private phase: number;

  constructor(base: THREE.Vector3, o: { az: number; el: number; swing: number; rate: number; length: number; radius: number; color: THREE.ColorRepresentation; intensity: number; phase?: number }) {
    // cylinder along +y: the lamp at y = 0 (radius r0), the far end wide
    const g = new THREE.CylinderGeometry(o.radius, 1.6, o.length, 20, 1, true);
    g.translate(0, o.length / 2, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: beamVert,
      fragmentShader: beamFrag,
      uniforms: { ...fxShared, uColor: { value: new THREE.Color(o.color).multiplyScalar(o.intensity) }, uTime: env.uTime },
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.base = base.clone();
    this.az0 = THREE.MathUtils.degToRad(o.az);
    this.el = THREE.MathUtils.degToRad(o.el);
    this.swing = THREE.MathUtils.degToRad(o.swing);
    this.rate = o.rate;
    this.phase = o.phase ?? 0;
    this.update(0);
  }

  update(t: number) {
    const az = this.az0 + Math.sin(t * this.rate + this.phase) * this.swing;
    const el = this.el + Math.sin(t * this.rate * 0.7 + this.phase * 2.0) * 0.08;
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.mesh.position.copy(this.base);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  }
}
