import * as THREE from "three";
import { common } from "../engine/glsl";
import { env } from "../engine/toon";

// The bay, painted the anime way: flat deep blue that lightens with distance,
// a moon road of hard-edged glints broken into horizontal dashes, drawn water
// lines near the shore, and stretched reflections of the far city lights.

const vert = /* glsl */ `
varying vec3 vWorld;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 vp = viewMatrix * wp;
  vViewZ = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;

const frag = /* glsl */ `
layout(location = 1) out highp vec4 gAux;
${common}
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uNear;
uniform vec3 uFar;
uniform vec3 uHorizon;
uniform vec3 uGlint;
uniform vec3 uLine;
uniform vec3 uCityLight;
uniform sampler2D tCity;   // 1D-ish light strip of the far shore (x → intensity)
uniform vec2 uCityRange;   // x range covered by tCity
uniform float uCityZ;
varying vec3 vWorld;
varying float vViewZ;

float waveH(vec2 p, float t) {
  // long swell across x, fine chop; anisotropic like painted water
  float h = sin(p.y * 0.045 + t * 0.9 + sin(p.x * 0.003) * 3.0) * 0.6;
  h += (vnoise(p * vec2(0.012, 0.07) + vec2(t * 0.05, t * 0.25)) - 0.5) * 1.6;
  h += (vnoise(p * vec2(0.03, 0.16) + vec2(-t * 0.08, t * 0.4)) - 0.5) * 0.7;
  return h;
}

void main() {
  vec3 toP = vWorld - cameraPosition;
  float dist = length(toP);
  vec3 V = toP / dist;
  vec2 p = vWorld.xz;
  // normal from finite differences; flatter far away (no shimmer)
  float e = 0.8 + dist * 0.004;
  float h0 = waveH(p, uTime);
  float hx = waveH(p + vec2(e, 0.0), uTime);
  float hz = waveH(p + vec2(0.0, e), uTime);
  float amp = 0.55 / (1.0 + dist * 0.0012);
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp * 1.6));

  float far = smoothstep(150.0, 5200.0, dist);
  vec3 col = mix(uNear, uFar, pow(far, 0.8));
  col = mix(col, uHorizon, smoothstep(0.55, 1.0, far) * 0.7);

  // Moon road.
  vec3 r = reflect(V, n);
  float mu = dot(r, uMoonDir);
  float road = smoothstep(0.985, 0.998, mu);
  float glint = step(0.9975 - 0.0022 * (1.0 - far), mu);
  // break glints into horizontal dashes
  float dash = step(0.45, vnoise(vec2(p.x * 0.05, p.y * 0.9) + vec2(uTime * 0.3, uTime * 1.4)));
  col += uGlint * road * 0.22;
  col = mix(col, uGlint * 1.8, glint * dash * (0.4 + 0.6 * far));
  // Drawn water lines (near shore only).
  float lines = 0.0;
  if (dist < 2600.0) {
    float f = fbm2(p * vec2(0.004, 0.02) + vec2(uTime * 0.02, uTime * 0.06), 3);
    float band = abs(fract(f * 7.0) - 0.5);
    float w = 0.018 + dist * 0.00001;
    lines = smoothstep(w, w * 0.4, band) * smoothstep(2600.0, 900.0, dist) * step(0.55, vnoise(p * 0.01));
  }
  col = mix(col, uLine, lines * 0.55);
  // Far city reflected: stretched vertically, broken by the swell.
  float cx = (p.x - uCityRange.x) / (uCityRange.y - uCityRange.x);
  if (cx > 0.0 && cx < 1.0 && vWorld.z > uCityZ) {
    float wob = (h0 * 0.004 + n.x * 0.06);
    float city = texture2D(tCity, vec2(cx + wob * 0.02, 0.5)).r;
    float reach = smoothstep(uCityZ + 2600.0, uCityZ + 150.0, vWorld.z);
    float streak = step(0.62, vnoise(vec2(p.x * 0.11, p.y * 0.5 + uTime * 0.8))) * step(0.5, city);
    col += uCityLight * city * reach * streak * 0.55;
  }
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0, 0.0, vViewZ, 0.0);
}`;

export class Sea {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;

  constructor(cityStrip: THREE.Texture, cityRange: [number, number], cityZ: number) {
    const geo = new THREE.PlaneGeometry(30000, 16000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: env.uTime,
        uMoonDir: env.uMoonDir,
        uNear: { value: new THREE.Color(0x040d2e) },
        uFar: { value: new THREE.Color(0x10296a) },
        uHorizon: { value: new THREE.Color(0x1d4290) },
        uGlint: { value: new THREE.Color(1.0, 0.94, 0.78) },
        uLine: { value: new THREE.Color(0x4f86d8) },
        uCityLight: { value: new THREE.Color(1.0, 0.82, 0.6) },
        tCity: { value: cityStrip },
        uCityRange: { value: new THREE.Vector2(cityRange[0], cityRange[1]) },
        uCityZ: { value: cityZ },
      },
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(0, 0, -7000);
    this.mesh.frustumCulled = false;
  }
}
