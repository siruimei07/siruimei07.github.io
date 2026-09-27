import * as THREE from "three";

// P3's glass break. The last frame (with the title's words baked in) is cut
// into Voronoi shards — small near the impact, large far away — which crack,
// catch a white edge, and burst toward the viewer and fall.

const vert = /* glsl */ `
attribute vec2 aCenter;   // shard centroid, NDC
attribute vec2 aLocal;    // vertex offset from the centroid, NDC-x units scaled by aspect
attribute vec4 aSeed;
attribute float aEdge;    // 0 at the centroid, 1 on the rim
uniform float uT;
uniform vec2 uImpact;
uniform float uAspect;
varying vec2 vUv;
varying float vEdge;
varying float vAlpha;
varying float vLight;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 d = aCenter - uImpact;
  d.x *= uAspect;
  float dist = length(d);
  vec2 dir = dist > 1e-4 ? d / dist : vec2(0.0, 1.0);
  float delay = 0.06 + dist * 0.18;
  float t = max(0.0, uT - delay);
  vec2 local = aLocal;
  // tumble: a flattening tilt about a random in-plane axis, a spin, a shrink
  float tilt = t * (2.0 + aSeed.z * 7.0);
  vec2 axis = normalize(vec2(cos(aSeed.w * 6.2832), sin(aSeed.w * 6.2832)));
  float along = dot(local, axis);
  vec2 perpv = local - axis * along;
  local = axis * along * cos(tilt) + perpv;
  local = rot(t * (aSeed.y - 0.5) * 9.0) * local;
  local *= 1.0 + t * (0.5 + aSeed.x * 0.9);          // toward the viewer
  vec2 move = dir * t * (0.9 + aSeed.x * 1.6) + vec2(0.0, -t * t * 1.6);
  move.x /= uAspect;
  vec2 p = aCenter + move + vec2(local.x / uAspect, local.y);
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = (aCenter + vec2(aLocal.x / uAspect, aLocal.y)) * 0.5 + 0.5;
  vEdge = aEdge;
  vAlpha = 1.0 - smoothstep(0.55, 1.1, t);
  vLight = abs(sin(tilt)) * 0.5 + (0.5 + 0.5 * cos(tilt)) * 0.1;
}`;

const frag = /* glsl */ `
uniform sampler2D tFrame;
uniform sampler2D tText;
uniform float uT;
uniform float uFlash;
varying vec2 vUv;
varying float vEdge;
varying float vAlpha;
varying float vLight;
void main() {
  vec3 c = texture2D(tFrame, vUv).rgb;
  vec4 tx = texture2D(tText, vUv);
  c = mix(c, tx.rgb, tx.a);
  float crack = smoothstep(0.86, 1.0, vEdge) * smoothstep(0.0, 0.08, uT);
  c += vec3(0.8, 0.95, 1.0) * vLight * 0.7;
  c = mix(c, vec3(1.0), crack * 0.9);
  c = mix(c, vec3(1.0), uFlash);
  gl_FragColor = vec4(c, vAlpha);
}`;

export class Shards {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private mesh: THREE.Mesh | null = null;
  active = false;
  t = 0;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { tFrame: { value: null }, tText: { value: null }, uT: { value: 0 }, uFlash: { value: 0 }, uImpact: { value: new THREE.Vector2() }, uAspect: { value: 1 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /** Fracture the screen around an impact point (NDC). */
  start(frame: THREE.Texture, text: THREE.Texture, impact: THREE.Vector2, aspect: number, count = 70) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    const seeds: THREE.Vector2[] = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.pow(Math.random(), 1.7) * 2.2;
      seeds.push(new THREE.Vector2(impact.x + (Math.cos(a) * r) / aspect, impact.y + Math.sin(a) * r));
    }
    for (let i = 0; i < 10; i++) seeds.push(new THREE.Vector2(Math.random() * 2 - 1, Math.random() * 2 - 1));
    const pos: number[] = [];
    const center: number[] = [];
    const local: number[] = [];
    const seed: number[] = [];
    const edge: number[] = [];
    const rect: THREE.Vector2[] = [new THREE.Vector2(-1, -1), new THREE.Vector2(1, -1), new THREE.Vector2(1, 1), new THREE.Vector2(-1, 1)];
    for (let i = 0; i < seeds.length; i++) {
      let poly = rect.map((v) => v.clone());
      const si = seeds[i];
      for (let j = 0; j < seeds.length && poly.length; j++) {
        if (i === j) continue;
        const sj = seeds[j];
        // keep the half-plane closer to si (in aspect-corrected space)
        const mid = si.clone().add(sj).multiplyScalar(0.5);
        const n = new THREE.Vector2((sj.x - si.x) * aspect * aspect, sj.y - si.y);
        poly = clip(poly, mid, n);
      }
      if (poly.length < 3) continue;
      const c = poly.reduce((acc, v) => acc.add(v), new THREE.Vector2()).multiplyScalar(1 / poly.length);
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        for (const [v, e] of [
          [c, 0],
          [a, 1],
          [b, 1],
        ] as [THREE.Vector2, number][]) {
          pos.push(v.x, v.y, 0);
          center.push(c.x, c.y);
          local.push((v.x - c.x) * aspect, v.y - c.y);
          seed.push(...s);
          edge.push(e);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aCenter", new THREE.Float32BufferAttribute(center, 2));
    g.setAttribute("aLocal", new THREE.Float32BufferAttribute(local, 2));
    g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 4));
    g.setAttribute("aEdge", new THREE.Float32BufferAttribute(edge, 1));
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    const u = this.mat.uniforms;
    u.tFrame.value = frame;
    (u.tText.value as THREE.Texture | null)?.dispose();
    u.tText.value = text;
    u.uImpact.value.copy(impact);
    u.uAspect.value = aspect;
    u.uT.value = 0;
    this.t = 0;
    this.active = true;
  }

  set flash(v: number) {
    this.mat.uniforms.uFlash.value = v;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    this.mat.uniforms.uT.value = this.t;
    if (this.t > 1.8) this.active = false;
  }
}

/** Sutherland–Hodgman against the half-plane dot(p - m, n) <= 0. */
function clip(poly: THREE.Vector2[], m: THREE.Vector2, n: THREE.Vector2): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  const side = (p: THREE.Vector2) => (p.x - m.x) * n.x + (p.y - m.y) * n.y;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if (sa <= 0 !== sb <= 0) {
      const t = sa / (sa - sb);
      out.push(a.clone().lerp(b, t));
    }
  }
  return out;
}
