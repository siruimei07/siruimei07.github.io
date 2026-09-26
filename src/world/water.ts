import * as THREE from "three";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";

const MAX_RIPPLES = 8;

// A calm, mirror-still water plane: planar reflection rendered at reduced
// resolution with mipmaps for gloss, long gentle swells, a soft moon road and
// quiet click ripples.
export class Water {
  mesh: THREE.Mesh;
  target: THREE.WebGLRenderTarget;
  private reflCam = new THREE.PerspectiveCamera();
  private texMatrix = new THREE.Matrix4();
  private ripples: THREE.Vector4[] = [];
  private rippleIdx = 0;
  uniforms: Record<string, THREE.IUniform>;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(512, 256, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
    });
    for (let i = 0; i < MAX_RIPPLES; i++) this.ripples.push(new THREE.Vector4(0, 0, -99, 0));

    this.uniforms = {
      ...globals,
      tReflect: { value: this.target.texture },
      uTexMatrix: { value: this.texMatrix },
      uRipples: { value: this.ripples },
      uCursor: { value: new THREE.Vector3(0, 0, 0) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform mat4 uTexMatrix;
        varying vec3 vWorld;
        varying vec4 vRefl;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vRefl = uTexMatrix * w;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform sampler2D tReflect;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        uniform vec3 uCursor;
        varying vec3 vWorld;
        varying vec4 vRefl;

        void main() {
          vec3 toCam = cameraPosition - vWorld;
          float dist = length(toCam);
          vec3 V = toCam / dist;
          vec2 p = vWorld.xz;

          // Long, slow swells plus a whisper of fine ripples up close.
          vec2 s = vec2(0.0);
          s += vec2(0.35, 1.0) * cos(dot(p, vec2(0.035, 0.1)) - uTime * 0.55) * 0.018;
          s += vec2(-0.8, 0.6) * cos(dot(p, vec2(-0.07, 0.052)) - uTime * 0.42) * 0.012;
          s += (texture2D(uNoise, p * 0.02 + vec2(uTime * 0.003, uTime * 0.002)).rg - 0.5) * 0.05;
          s += (texture2D(uNoise, p * 0.09 + vec2(-uTime * 0.008, uTime * 0.006)).ba - 0.5) * 0.03 * (1.0 - smoothstep(15.0, 120.0, dist));

          // Click ripples: expanding damped rings.
          float rippleGlow = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age > 0.0 && age < 8.0) {
              vec2 d = p - r.xy;
              float dd = length(d);
              float x = dd - age * 6.5;
              float env = exp(-x * x / (4.0 + age * 4.0)) * exp(-age * 0.5) * r.w;
              s += (d / max(dd, 1e-3)) * cos(x * 1.6) * env * 0.35;
              rippleGlow += env * (0.5 + 0.5 * sin(x * 1.6));
            }
          }
          // Cursor wake.
          vec2 dc = p - uCursor.xz;
          float dcl = length(dc);
          s += dc / max(dcl, 1e-3) * sin(dcl * 2.0 - uTime * 3.5) * exp(-dcl * 0.4) * 0.08 * uCursor.y;

          vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
          float nv = max(dot(N, V), 0.0);
          float fresnel = 0.02 + 0.98 * pow(1.0 - nv, 5.0);

          // Mirror-like reflection, softening a little with distance.
          float atten = 1.0 / (1.0 + dist * 0.003);
          vec2 ruv = vRefl.xy / vRefl.w + vec2(s.x * 0.03, s.y * 0.14) * atten;
          float lod = clamp(0.25 + dist * 0.0025 + length(s) * 3.0, 0.0, 4.5);
          vec2 smear = vec2(0.0, 0.006 * atten + 0.002);
          vec3 refl = textureLod(tReflect, ruv, lod).rgb * 0.5
                    + textureLod(tReflect, ruv + smear, lod + 0.5).rgb * 0.25
                    + textureLod(tReflect, ruv - smear, lod + 0.5).rgb * 0.25;

          vec3 deep = vec3(0.002, 0.004, 0.009) + uFlash * 0.04;
          vec3 col = mix(deep, refl, clamp(fresnel * 1.1 + 0.18, 0.0, 1.0));

          // A soft moon road of glints.
          vec2 g1 = texture2D(uNoise, p * 0.28 + uTime * vec2(0.012, -0.008)).rg - 0.5;
          vec2 g2 = texture2D(uNoise, p * 0.47 - uTime * vec2(0.01, 0.014)).gr - 0.5;
          vec3 Ng = normalize(vec3(-(g1.x + g2.x) * 0.45 - s.x, 1.0, -(g1.y + g2.y) * 0.45 - s.y));
          float sm = max(dot(reflect(-V, Ng), uMoonDir), 0.0);
          col += vec3(1.0, 0.95, 0.85) * pow(sm, 1800.0) * 9.0 * smoothstep(10.0, 70.0, dist) * uMoonK;

          col += vec3(0.8, 0.85, 0.95) * rippleGlow * 0.05;
          col = applyFog(col, vWorld);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const geo = new THREE.PlaneGeometry(12000, 12000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.position.set(0, 0, -150);
    this.mesh.frustumCulled = false;
  }

  setSize(w: number, h: number) {
    this.target.setSize(Math.max(64, Math.round(w)), Math.max(32, Math.round(h)));
  }

  addRipple(x: number, z: number, strength = 1) {
    this.ripples[this.rippleIdx].set(x, z, globals.uTime.value, strength);
    this.rippleIdx = (this.rippleIdx + 1) % MAX_RIPPLES;
  }

  setCursor(x: number, z: number, on: number) {
    (this.uniforms.uCursor.value as THREE.Vector3).set(x, on, z);
  }

  // Mirrors the camera across y = 0 and renders reflectable layers. `ratio` is
  // reflection height / main render height, used to keep sprite sizes right.
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, ratio: number) {
    const cam = this.reflCam;
    const e = camera.matrixWorld.elements;
    const pos = new THREE.Vector3(e[12], e[13], e[14]);
    const fwd = new THREE.Vector3(-e[8], -e[9], -e[10]);
    const upv = new THREE.Vector3(e[4], e[5], e[6]);
    cam.position.set(pos.x, -pos.y, pos.z);
    cam.up.set(upv.x, -upv.y, upv.z);
    cam.lookAt(pos.x + fwd.x, -(pos.y + fwd.y), pos.z + fwd.z);
    cam.near = camera.near;
    cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    // A mirrored view flips screen x, so any lens shift must flip too.
    cam.projectionMatrix.elements[8] = -camera.projectionMatrix.elements[8];
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.layers.set(REFLECT_LAYER);

    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.texMatrix.multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);

    const prevScale = globals.uPointScale.value;
    const prevRatio = globals.uPixelRatio.value;
    const res = globals.uResolution.value;
    const prevW = res.x;
    const prevH = res.y;
    globals.uPointScale.value = prevScale * ratio;
    globals.uPixelRatio.value = prevRatio * ratio;
    res.set(this.target.width, this.target.height);

    this.mesh.visible = false;
    globals.uReflecting.value = 1;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, cam);
    globals.uReflecting.value = 0;
    this.mesh.visible = true;

    globals.uPointScale.value = prevScale;
    globals.uPixelRatio.value = prevRatio;
    res.set(prevW, prevH);
  }
}
