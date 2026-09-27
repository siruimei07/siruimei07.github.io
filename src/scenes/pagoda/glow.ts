import * as THREE from "three";
import { common } from "../../engine/glsl";
import { fxDepthTest, fxShared } from "../../engine/toon";

// Soft light in the sky itself: the moonlit haze that rises behind the
// pagoda (it backlights the tower so its silhouette reads, in colour and in
// the menu's blue grade) and the warm glow the city throws up onto the haze
// along the horizon. Camera-facing cards far out, drawn additively and only
// where the sky shows (depth-tested against the G-buffer).

export type SkyGlowSpec = { az: number; el: number; radius: number; color: THREE.ColorRepresentation; squash?: number };

const DIST = 6000;

const vert = /* glsl */ `
attribute vec4 aGlow;   // az, el (rad), angular radius (rad), vertical squash
attribute vec3 aColor;
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
void main() {
  float az = aGlow.x, el = aGlow.y;
  vec3 dir = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));
  vec3 right = normalize(vec3(cos(az), 0.0, sin(az)));
  vec3 up = normalize(cross(right, dir));
  float r = tan(aGlow.z) * ${DIST.toFixed(1)};
  vec3 wp = cameraPosition + dir * ${DIST.toFixed(1)} + right * position.x * r + up * position.y * r * aGlow.w;
  vec4 vp = viewMatrix * vec4(wp, 1.0);
  vViewZ = -vp.z;
  vQ = position.xy;
  vCol = aColor;
  gl_Position = projectionMatrix * vp;
}`;

const frag = /* glsl */ `
${common}
${fxDepthTest}
varying vec2 vQ;
varying vec3 vCol;
varying float vViewZ;
void main() {
  float vis = sceneVisible(vViewZ);
  if (vis <= 0.0) discard;
  float r2 = dot(vQ, vQ);
  float g = exp(-r2 * 3.2) - exp(-3.2);
  if (g <= 0.0) discard;
  // a touch of dither so the gradient never bands
  g += (ign(gl_FragCoord.xy) - 0.5) * 0.004;
  gl_FragColor = vec4(vCol * g * vis, 1.0);
}`;

export function buildSkyGlow(list: SkyGlowSpec[]) {
  const quad = new THREE.PlaneGeometry(2, 2);
  const g = new THREE.InstancedBufferGeometry();
  g.index = quad.index;
  g.setAttribute("position", quad.getAttribute("position"));
  const a = new Float32Array(list.length * 4);
  const c = new Float32Array(list.length * 3);
  const col = new THREE.Color();
  const D = THREE.MathUtils.degToRad;
  list.forEach((s, i) => {
    a.set([D(s.az), D(s.el), D(s.radius), s.squash ?? 1], i * 4);
    col.set(s.color);
    c.set([col.r, col.g, col.b], i * 3);
  });
  g.setAttribute("aGlow", new THREE.InstancedBufferAttribute(a, 4));
  g.setAttribute("aColor", new THREE.InstancedBufferAttribute(c, 3));
  g.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...fxShared },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}
