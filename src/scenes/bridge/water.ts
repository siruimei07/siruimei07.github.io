import * as THREE from "three";
import { common } from "../../engine/glsl";
import { env } from "../../engine/toon";
import { WARM, type CityMap } from "./bridge";
import { cityMapGlsl } from "./glsl";
import { SHORE_LAMPS, SHORE_Z } from "./layout";

// The lake under the bridge, glassy and dark: the city's colours reflected
// as vertical streaks broken by slow ripples, long warm streaks under the
// shore lanterns, the moon's glossy road, and dark fish shadows gliding
// just under the surface near the bridge.

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
uniform vec3 uSkyLo;
uniform vec3 uSkyHi;
uniform vec3 uLantern;
uniform vec4 uLamps;     // z, y, x0, dx
uniform float uLampN;
${cityMapGlsl}
varying vec3 vWorld;
varying float vViewZ;

float ripple(vec2 p, float t) {
  float h = sin(p.y * 0.9 + t * 0.8 + sin(p.x * 0.07) * 2.0) * 0.35;
  h += (vnoise(p * vec2(0.18, 0.9) + vec2(t * 0.05, t * 0.35)) - 0.5) * 1.0;
  h += (vnoise(p * vec2(0.5, 2.2) + vec2(-t * 0.1, t * 0.6)) - 0.5) * 0.4;
  return h;
}

// dark shapes of fish drifting under the surface, in lanes
float fishShadow(vec2 p, float t) {
  float acc = 0.0;
  for (int f = 0; f < 2; f++) {
    float ang = f == 0 ? 0.5 : -2.4;
    vec2 dir = vec2(sin(ang), -cos(ang));
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p, dir);
    float across = dot(p, nrm);
    float laneW = 2.2;
    float lane = floor(across / laneW);
    float la = (fract(across / laneW) - 0.5) * laneW;
    float spd = 0.7 + 0.6 * hash11(lane * 3.7 + float(f) * 5.0);
    float seg = 8.0 + 6.0 * hash11(lane * 1.3 + float(f) * 7.0);
    float s = along - t * spd;
    float si = floor(s / seg);
    float sf = s - si * seg;
    float h = hash12(vec2(lane, si) + float(f) * 13.0);
    if (h < 0.5) {
      float c = seg * (0.3 + 0.4 * hash11(h * 91.0));
      float lat = (hash11(h * 37.0) - 0.5) * laneW * 0.5;
      float len = 0.8 + 0.9 * hash11(h * 53.0);
      float x = (sf - c) / len;
      float y = (la - lat + sin(x * 2.5 - t * 5.0 + h * 20.0) * 0.07 * len) / len;
      float body = length(vec2((x - 0.1) / 0.85, y / 0.24));
      float tail = step(-1.25, x) * step(x, -0.7) * step(abs(y), (-x - 0.7) * 0.5 + 0.03);
      acc = max(acc, max(smoothstep(1.0, 0.55, body), tail * 0.8));
    }
  }
  return acc;
}

void main() {
  vec3 toP = vWorld - cameraPosition;
  float dist = length(toP);
  vec3 V = toP / dist;
  vec2 p = vWorld.xz;
  float t = uTime;
  // gentle, anisotropic ripples; flatter far away
  float e = 0.08 + dist * 0.004;
  float h0 = ripple(p, t);
  float hx = ripple(p + vec2(e, 0.0), t);
  float hz = ripple(p + vec2(0.0, e), t);
  float amp = 0.035 / (1.0 + dist * 0.004);
  vec3 n = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp * 1.8));

  float farK = smoothstep(20.0, 420.0, dist);
  vec3 col = mix(uNear, uFar, farK);

  vec3 R = reflect(V, n);
  R.y = abs(R.y);
  float fres = 0.05 + 0.95 * pow(1.0 - saturate(dot(-V, n)), 5.0);
  // the sky and the city
  vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.5, R.y));
  float md = acos(clamp(dot(R, uMoonDir), -1.0, 1.0));
  sky += vec3(0.4, 0.55, 0.95) * exp(-md / 0.12) * 0.45;
  vec4 cm = cityMap(vWorld, R, 0.02 + 0.03 * (1.0 - farK));
  // break the city's reflection into vertical streaks
  float streak = 0.55 + 0.45 * step(0.45, vnoise(vec2(p.x * 0.35, p.y * 3.5 + t * 0.6)));
  vec3 refl = mix(sky, vec3(0.004, 0.006, 0.016) + cm.rgb * streak * 0.55, cm.a);
  // shore lanterns: long warm streaks
  if (R.z < -1e-3) {
    float tt = (uLamps.x - vWorld.z) / R.z;
    vec2 hit = vWorld.xy + R.xy * tt;
    float ax = abs(hit.x);
    float k = floor((ax - uLamps.z) / uLamps.w + 0.5);
    if (k >= 0.0 && k < uLampN) {
      float dx = ax - (uLamps.z + k * uLamps.w);
      float dy = hit.y - uLamps.y;
      float sx = 0.1 + tt * 0.0022;
      float sy = 0.3 + tt * 0.05;
      float g = exp(-dx * dx / (sx * sx)) * exp(-dy * dy / (sy * sy));
      float dash = 0.5 + 0.5 * step(0.4, vnoise(vec2(p.x * 2.0, p.y * 9.0 + t * 1.3)));
      refl += uLantern * g * dash * 3.5;
    }
  }
  // the moon's glossy road
  float da = atan(R.x, -R.z) - atan(uMoonDir.x, -uMoonDir.z);
  float de = asin(clamp(R.y, 0.0, 1.0)) - asin(uMoonDir.y);
  float road = exp(-da * da / 0.0016) * exp(-de * de / 0.12);
  // and a broad field of glints around it: the ripples catch the moon well off its line
  float wide = exp(-da * da / 0.03) * exp(-de * de / 0.25);
  float glint = step(0.62, vnoise(vec2(p.x * 1.5, p.y * 7.0) + vec2(t * 0.2, t * 1.1)));
  float spark = step(0.8, vnoise(vec2(p.x * 2.6, p.y * 11.0) + vec2(-t * 0.3, t * 1.6)));
  refl += vec3(0.8, 0.88, 1.0) * (road * (0.4 + 1.6 * glint) + wide * spark * 1.1);

  col = mix(col, refl, fres);
  // fish shadows near the bridge
  float fish = fishShadow(p, t) * (1.0 - smoothstep(35.0, 90.0, dist));
  col *= 1.0 - fish * 0.72;
  gl_FragColor = vec4(col, 1.0);
  gAux = vec4(0.0, 0.0, vViewZ, 0.0);
}`;

export function buildWater(map: CityMap): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(8000, 4000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, SHORE_Z - 1 + 2000); // from the far embankment back past the viewer
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      uTime: env.uTime,
      uMoonDir: env.uMoonDir,
      uNear: { value: new THREE.Color(0x050f20) },
      uFar: { value: new THREE.Color(0x0c2246) },
      uSkyLo: { value: new THREE.Color(0x0e2250) },
      uSkyHi: { value: new THREE.Color(0x07143a) },
      uLantern: { value: WARM },
      uLamps: { value: new THREE.Vector4(SHORE_LAMPS.z, SHORE_LAMPS.y, SHORE_LAMPS.x0, SHORE_LAMPS.dx) },
      uLampN: { value: SHORE_LAMPS.n },
      tCity: { value: map.tex },
      uMap: { value: map.map },
      uEye: { value: map.eye },
      uMapGain: { value: map.gain },
    },
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}
