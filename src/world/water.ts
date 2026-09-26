import * as THREE from "three";
import { hdrTarget } from "../engine/fsq";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// Endless calm water at y = 0: a planar reflection rendered from a mirrored
// camera (oblique near plane so nothing below the surface leaks in), broad
// gentle swells that stretch reflections vertically like the clip, analytic
// click ripples, a moon glitter path at night, and horizon haze.

const MAX_DROPS = 12;

export const rippleGLSL = /* glsl */ `
uniform vec4 uDrops[${MAX_DROPS}]; // x, z, start time, amplitude
uniform float uNow;
// Height and radial slope of all active ripple packets at p.
vec3 ripples(vec2 p) {
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 d = uDrops[i];
    if (d.w <= 0.0) continue;
    float age = uNow - d.z;
    if (age < 0.0 || age > 9.0) continue;
    vec2 q = p - d.xy;
    float r = length(q) + 1e-4;
    float front = age * 3.2;
    float x = r - front;
    float width = 1.6 + age * 0.9;
    float env = exp(-x * x / (width * width)) * exp(-age * 0.45) * d.w / (1.0 + r * 0.12);
    float k = 3.4;
    h += sin(x * k) * env;
    float dh = cos(x * k) * k * env - sin(x * k) * env * 2.0 * x / (width * width);
    g += dh * q / r;
  }
  return vec3(h, g);
}
`;

const vert = /* glsl */ `
uniform mat4 uReflMatrix;
varying vec3 vWorld;
varying vec4 vRefl;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vRefl = uReflMatrix * w;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const frag = /* glsl */ `
${common}
${rippleGLSL}
uniform sampler2D tRefl;
uniform vec2 uReflTexel;
uniform vec3 uCamPos;
uniform vec3 uWaterColor;
uniform vec3 uFogColor;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbTop;
uniform float uTime;
uniform float uMirror;
uniform float uWaveAmp;
uniform float uFogDist;
uniform float uGlitter;
uniform vec4 uFoam; // x, z, start time, strength
varying vec3 vWorld;
varying vec4 vRefl;

// Swell normal: a handful of long waves crossing the view, plus fine chop.
vec2 swellSlope(vec2 p, float fade) {
  vec2 s = vec2(0.0);
  float t = uTime;
  const int N = 5;
  vec2 dirs[5] = vec2[](vec2(0.12, 1.0), vec2(-0.35, 0.94), vec2(0.5, 0.86), vec2(-0.08, 1.0), vec2(0.9, 0.44));
  float lens[5] = float[](38.0, 21.0, 13.0, 7.5, 4.2);
  float amps[5] = float[](0.22, 0.14, 0.09, 0.05, 0.03);
  for (int i = 0; i < N; i++) {
    vec2 d = normalize(dirs[i]);
    float k = TAU / lens[i];
    float w = sqrt(9.81 * k);
    float ph = dot(d, p) * k - w * t * 0.55 + float(i) * 1.7;
    float a = amps[i] * (i >= 3 ? fade : 1.0);
    s += d * cos(ph) * a * k;
  }
  // Fine chop from value-noise gradients.
  vec2 q = p * 0.9 + vec2(t * 0.25, -t * 0.18);
  float e = 0.35;
  float n0 = fbm2(q, 3);
  s += vec2(fbm2(q + vec2(e, 0.0), 3) - n0, fbm2(q + vec2(0.0, e), 3) - n0) / e * 0.18 * fade * fade;
  return s * uWaveAmp;
}

void main() {
  vec3 toCam = uCamPos - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float fade = 1.0 - smoothstep(60.0, 420.0, dist);
  vec2 slope = swellSlope(vWorld.xz, fade);
  vec3 rp = ripples(vWorld.xz);
  slope += rp.yz * 0.55;
  vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));

  float NdV = saturate(dot(N, V));
  float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
  F = mix(F, 1.0, uMirror);

  // Reflection: screen-space projective lookup, displaced mostly vertically
  // so lanterns and the torii smear into columns like the clip.
  vec2 ruv = vRefl.xy / vRefl.w;
  float dk = 1.0 / (1.0 + dist * 0.035);
  vec2 off = vec2(N.x * 0.35, N.z * 1.6) * 0.09 * dk + vec2(0.0, rp.x * 0.02 * dk);
  vec3 refl = texture(tRefl, ruv + off).rgb * 0.5;
  refl += texture(tRefl, ruv + off * 1.9 + vec2(0.0, uReflTexel.y * 2.0)).rgb * 0.25;
  refl += texture(tRefl, ruv + off * 0.4 - vec2(0.0, uReflTexel.y * 2.0)).rgb * 0.25;

  vec3 body = uWaterColor * (0.55 + 0.45 * saturate(N.y)) + uAmbTop * 0.04;
  // Water tints what it reflects (slightly darker, toward its own colour).
  refl = mix(refl, refl * normalize(uWaterColor + 0.25) * 1.25, 0.5) * 0.62;
  vec3 col = mix(body, refl, F);

  // Churned water where the camera broke the surface.
  float fAge = uTime - uFoam.z;
  if (uFoam.w > 0.0 && fAge > 0.0 && fAge < 3.0) {
    float fr = length(vWorld.xz - uFoam.xy);
    float rad = 1.2 + fAge * 2.6;
    float n = fbm2(vWorld.xz * 1.8 + vec2(fAge * 0.5, 0.0), 4);
    float m = smoothstep(rad, rad * 0.35, fr) * smoothstep(0.52, 0.7, n + 0.2 * (1.0 - fAge / 3.0));
    m *= 0.35 + 0.65 * smoothstep(0.3, 0.7, vnoise(vWorld.xz * 6.0 + fAge * 2.0));
    float bub = pow(vnoise(vWorld.xz * 14.0 + fAge), 8.0) * 3.0 * smoothstep(rad * 1.2, 0.0, fr);
    float fade = exp(-fAge * 1.3);
    col = mix(col, vec3(1.0, 0.94, 0.97) * (0.5 + uAmbTop), saturate(m * 0.6 + bub) * fade * uFoam.w);
  }

  // Moon glitter: many tiny facets catching the moon.
  vec3 Hm = normalize(V + uMoonDir);
  float gl = pow(saturate(dot(N, Hm)), 900.0) * 60.0 + pow(saturate(dot(N, Hm)), 90.0) * 0.6;
  col += uMoonColor * gl * uGlitter;

  // Haze toward the horizon.
  float fog = 1.0 - exp(-dist / uFogDist);
  vec2 hs = normalize(uSunDir.xz + 1e-5);
  vec2 hd = normalize(-V.xz + 1e-5);
  float toward = dot(hd, hs) * 0.5 + 0.5;
  vec3 haze = mix(mix(uHorizon, uGlow, pow(saturate(toward), 2.5) * 0.9), uFogColor, 0.55);
  col = mix(col, haze, fog * 0.85);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly reflCamera = new THREE.PerspectiveCamera();
  /** Undistorted projection for the sky pass (the oblique one skews far rays). */
  readonly reflSkyCamera = new THREE.PerspectiveCamera();
  reflTarget!: THREE.WebGLRenderTarget;
  private drops: THREE.Vector4[];
  private dropCursor = 0;

  constructor() {
    this.drops = Array.from({ length: MAX_DROPS }, () => new THREE.Vector4(0, 0, -100, 0));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        tRefl: { value: null },
        uReflTexel: { value: new THREE.Vector2(1, 1) },
        uReflMatrix: { value: new THREE.Matrix4() },
        uCamPos: G.uCamPos,
        uWaterColor: G.uWaterColor,
        uFogColor: G.uFogColor,
        uHorizon: G.uHorizon,
        uGlow: G.uGlow,
        uSunDir: G.uSunDir,
        uMoonDir: G.uMoonDir,
        uMoonColor: G.uMoonColor,
        uAmbTop: G.uAmbTop,
        uTime: G.uTime,
        uNow: G.uTime,
        uDrops: { value: this.drops },
        uMirror: { value: 0.08 },
        uWaveAmp: { value: 1 },
        uFogDist: { value: 2200 },
        uGlitter: { value: 1 },
        uFoam: { value: new THREE.Vector4(0, 0, -100, 0) },
      },
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.scale.set(24000, 1, 24000);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  resize(w: number, h: number, scale: number) {
    const rw = Math.max(2, Math.round(w * scale));
    const rh = Math.max(2, Math.round(h * scale));
    if (this.reflTarget && this.reflTarget.width === rw && this.reflTarget.height === rh) return;
    this.reflTarget?.dispose();
    this.reflTarget = hdrTarget(rw, rh, { depthBuffer: true });
    this.material.uniforms.tRefl.value = this.reflTarget.texture;
    this.material.uniforms.uReflTexel.value.set(1 / rw, 1 / rh);
  }

  // Slots 0–1 are reserved for scripted drops (surfacing); clicks cycle the rest.
  addDrop(x: number, z: number, amp: number, now: number) {
    const d = this.drops[2 + this.dropCursor];
    d.set(x, z, now, amp);
    this.dropCursor = (this.dropCursor + 1) % (MAX_DROPS - 2);
  }

  setDrop(slot: number, x: number, z: number, amp: number, at: number) {
    this.drops[slot].set(x, z, at, amp);
  }

  /** Ripple height at a point (CPU mirror of the shader, for bobbing objects). */
  rippleHeight(x: number, z: number, now: number) {
    let h = 0;
    for (const d of this.drops) {
      if (d.w <= 0) continue;
      const age = now - d.z;
      if (age < 0 || age > 9) continue;
      const r = Math.hypot(x - d.x, z - d.y) + 1e-4;
      const xx = r - age * 3.2;
      const width = 1.6 + age * 0.9;
      const env = (Math.exp((-xx * xx) / (width * width)) * Math.exp(-age * 0.45) * d.w) / (1 + r * 0.12);
      h += Math.sin(xx * 3.4) * env;
    }
    return h;
  }

  // Mirror `camera` across y = 0 into reflCamera (+ oblique clip) and set the
  // projective texture matrix used by the water shader.
  updateReflection(camera: THREE.PerspectiveCamera) {
    this.mesh.position.set(camera.position.x, 0, camera.position.z);
    this.mesh.updateMatrixWorld();
    const rc = this.reflCamera;
    rc.copy(camera, false);
    const p = camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    rc.position.set(p.x, -p.y, p.z);
    rc.up.set(up.x, -up.y, up.z);
    rc.lookAt(p.x + dir.x, -(p.y + dir.y), p.z + dir.z);
    rc.updateMatrixWorld();
    rc.updateProjectionMatrix();
    this.reflSkyCamera.copy(rc, false);
    this.reflSkyCamera.updateMatrixWorld();
    this.reflSkyCamera.updateProjectionMatrix();

    // Oblique near plane = the water plane (Lengyel).
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(rc.matrixWorldInverse);
    const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = rc.projectionMatrix.elements;
    const q = new THREE.Vector4(
      (Math.sign(clip.x) + pm[8]) / pm[0],
      (Math.sign(clip.y) + pm[9]) / pm[5],
      -1,
      (1 + pm[10]) / pm[14],
    );
    clip.multiplyScalar(2 / clip.dot(q));
    pm[2] = clip.x;
    pm[6] = clip.y;
    pm[10] = clip.z + 1 - 0.0005;
    pm[14] = clip.w;
    rc.projectionMatrixInverse.copy(rc.projectionMatrix).invert();

    const m = this.material.uniforms.uReflMatrix.value as THREE.Matrix4;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  }
}
