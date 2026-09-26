import * as THREE from "three";
import { common } from "../engine/glsl";
import { G } from "./atmos";

// A humpback whale drawn by a drone show: several thousand points on a
// procedurally sampled body (cross-section rings), long pectoral fins,
// swept flukes, a small dorsal hump and ventral grooves. It swims — the
// body bends in a vertical travelling wave that grows toward the flukes,
// the pectorals flap slowly — while following a slow loop across the sky.
// On first appearance the drones take off from the water and fly into
// formation.

// Local space: +x toward the head, y up, z to the whale's left. Length 1.
function bodyRadius(s: number) {
  // s: 0 snout .. 1 fluke notch. Returns [halfWidth, halfHeight, centreY].
  const head = THREE.MathUtils.smoothstep(s, 0, 0.12);
  const girth = Math.pow(Math.sin(Math.PI * Math.min(1, s / 0.92) * 0.98 + 0.02), 0.72);
  const taper = 1 - THREE.MathUtils.smoothstep(s, 0.6, 0.93) * 0.8;
  const r = 0.105 * (0.35 + 0.65 * head) * girth * taper + 0.006;
  const hw = r * (1 - THREE.MathUtils.smoothstep(s, 0.7, 0.95) * 0.55); // tail stock is laterally compressed
  const hh = r * (0.88 + 0.1 * THREE.MathUtils.smoothstep(s, 0.7, 0.95));
  const cy = -0.012 * Math.sin(Math.PI * s) - 0.018 * (1 - head); // lower jaw hangs a little
  return [hw, hh, cy];
}

type Pt = { x: number; y: number; z: number; s: number; kind: number; side: number; w: number };

function sampleWhale(spacing: number, rng: () => number): Pt[] {
  const pts: Pt[] = [];
  // Body rings.
  const rings = Math.round(1 / spacing);
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    const [hw, hh, cy] = bodyRadius(s);
    const circ = Math.PI * (3 * (hw + hh) - Math.sqrt((3 * hw + hh) * (hw + 3 * hh)));
    const n = Math.max(4, Math.round(circ / spacing));
    const jitter = rng();
    for (let k = 0; k < n; k++) {
      const a = ((k + jitter * 0.5) / n) * Math.PI * 2;
      let y = cy + Math.sin(a) * hh;
      const z = Math.cos(a) * hw;
      // Dorsal hump near the tail.
      if (Math.sin(a) > 0.8) y += 0.012 * Math.exp(-Math.pow((s - 0.66) / 0.03, 2));
      // Ventral grooves: slightly denser, brighter lines on the throat.
      const groove = s > 0.04 && s < 0.45 && Math.sin(a) < -0.35 ? 1 : 0;
      pts.push({ x: 0.5 - s, y, z, s, kind: groove ? 3 : 0, side: 0, w: groove ? 1.25 : 1 });
    }
  }
  // Pectoral fins: long blades, root at s≈0.3, swept back and down.
  for (const side of [-1, 1]) {
    const len = 0.31;
    const steps = Math.round(len / spacing);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps; // root → tip
      const chord = THREE.MathUtils.lerp(0.075, 0.018, Math.pow(u, 0.8));
      const cn = Math.max(2, Math.round(chord / spacing) + 1);
      const rootS = 0.29;
      const bx = 0.5 - rootS - u * 0.13;
      const by = -0.035 - u * 0.12;
      const bz = side * (0.07 + u * 0.24);
      for (let j = 0; j < cn; j++) {
        const v = j / (cn - 1);
        // Knobbly leading edge (humpback tubercles).
        const bump = v < 0.15 ? 0.004 * Math.sin(u * 40) : 0;
        pts.push({ x: bx - v * chord + bump, y: by, z: bz, s: rootS, kind: 1, side, w: v < 0.12 || u > 0.97 ? 1.3 : 0.9 });
      }
    }
  }
  // Flukes.
  for (const side of [-1, 1]) {
    const span = 0.17;
    const steps = Math.round(span / spacing);
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const chord = THREE.MathUtils.lerp(0.075, 0.02, Math.pow(u, 1.3));
      const cn = Math.max(2, Math.round(chord / spacing) + 1);
      const lead = -0.5 + 0.01 - u * 0.05; // swept back
      for (let j = 0; j < cn; j++) {
        const v = j / (cn - 1);
        const notch = u < 0.08 ? (0.08 - u) * 0.25 : 0;
        pts.push({ x: lead - v * chord + notch * v, y: 0.0, z: side * (0.006 + u * span), s: 1, kind: 2, side, w: v > 0.85 || u > 0.97 ? 1.3 : 0.9 });
      }
    }
  }
  // Eyes.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) pts.push({ x: 0.5 - 0.135 + k * 0.004, y: -0.018, z: side * 0.068, s: 0.135, kind: 4, side, w: 2.2 });
  }
  return pts;
}

const vert = /* glsl */ `
${common}
attribute float corner;
attribute vec3 iBase;
attribute vec4 iInfo; // s, kind, side, weight
attribute vec4 iRand; // twinkle phase, assembly delay, launch x, launch z
uniform float uTime;
uniform float uScale;
uniform mat4 uWhale; // whale local -> world (no scale)
uniform float uAssemble;
uniform vec3 uLaunchCentre;
uniform vec2 uLaunchSpread;
uniform vec2 uRes;
uniform float uPx;
uniform float uSwim;
varying vec2 vQ;
varying vec3 vCol;
varying float vI;

void main() {
  float s = iInfo.x;
  float kind = iInfo.y;
  vec3 p = iBase;
  // Swim: vertical travelling wave, stronger toward the tail.
  float w = uTime * 1.25 * uSwim;
  float amp = 0.055 * pow(s, 2.2);
  float yOff = amp * sin(w - s * 4.2);
  float slope = amp * 4.2 * -cos(w - s * 4.2) * 0.8;
  p.y += yOff;
  // Rotate the local cross-section by the body slope (keeps flukes rigid).
  if (kind > 1.5 && kind < 2.5) {
    float ang = -slope * 1.6;
    vec2 xy = p.xy - vec2(-0.5, yOff);
    p.xy = vec2(xy.x * cos(ang) - xy.y * sin(ang), xy.x * sin(ang) + xy.y * cos(ang)) + vec2(-0.5, yOff);
  }
  // Pectoral fins: slow flap about the body axis at the root.
  if (kind > 0.5 && kind < 1.5) {
    float flap = (0.22 * sin(uTime * 0.55 + 1.3) - 0.1) * iInfo.z;
    vec2 yz = p.yz - vec2(-0.03, 0.07 * iInfo.z);
    p.yz = vec2(yz.x * cos(flap) - yz.y * sin(flap), yz.x * sin(flap) + yz.y * cos(flap)) + vec2(-0.03, 0.07 * iInfo.z);
  }
  vec3 formation = (uWhale * vec4(p * uScale, 1.0)).xyz;
  // Drones take off from the water and fly into formation.
  float delay = iRand.y * 0.45;
  float k = smoothstep(0.0, 1.0, clamp((uAssemble - delay) / 0.55, 0.0, 1.0));
  vec3 launch = uLaunchCentre + vec3((iRand.z - 0.5) * uLaunchSpread.x, 0.5, (iRand.w - 0.5) * uLaunchSpread.y);
  vec3 mid = mix(launch, formation, 0.5) + vec3(0.0, 40.0 + iRand.x * 60.0, 0.0);
  vec3 a = mix(launch, mid, k);
  vec3 b = mix(mid, formation, k);
  vec3 world = mix(a, b, k);

  vec4 c = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (c.w < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec2 q = vec2(corner == 1.0 || corner == 2.0 ? 1.0 : -1.0, corner >= 2.0 ? 1.0 : -1.0);
  vQ = q;
  float px = 0.34 * iInfo.w * uRes.y * projectionMatrix[1][1] * 0.5 / c.w;
  float minPx = uPx * (0.8 + 0.2 * iInfo.w);
  float drawPx = max(px, minPx);
  c.xy += q * drawPx * 2.0 / uRes * c.w;
  gl_Position = c;
  // Colour: cool white drones, pale blue grooves, warm eyes.
  vec3 col = vec3(0.78, 0.92, 1.0);
  if (kind > 2.5 && kind < 3.5) col = vec3(0.55, 0.78, 1.0);
  if (kind > 3.5) col = vec3(1.0, 0.82, 0.55);
  float tw = 0.78 + 0.22 * sin(uTime * (2.0 + iRand.x * 3.0) + iRand.x * 40.0);
  // Small drones stay energy-correct: shrink brightness with size.
  float energy = min(1.0, (px * px) / (drawPx * drawPx) + 0.35);
  vCol = col;
  vI = tw * energy * (0.6 + 0.4 * k) * iInfo.w;
}`;

const frag = /* glsl */ `
uniform float uAlpha;
uniform float uGain;
varying vec2 vQ;
varying vec3 vCol;
varying float vI;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float g = exp(-r2 * 3.2);
  gl_FragColor = vec4(vCol * g * vI * uAlpha * uGain, 1.0);
}`;

export class ParticleWhale {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly count: number;
  /** 0 = drones on the water, 1 = in formation. */
  assemble = 0;
  alpha = 0;
  time = 0;
  private matrix = new THREE.Matrix4();
  private pos = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  path: (t: number, out: THREE.Vector3) => THREE.Vector3;
  pathTime = 0;

  constructor(rng: () => number, density = 1, length = 88) {
    const spacing = 0.0105 / Math.sqrt(density);
    const pts = sampleWhale(spacing, rng);
    this.count = pts.length;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(12).fill(0), 3));
    geo.setAttribute("corner", new THREE.Float32BufferAttribute([0, 1, 2, 3], 1));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const base = new Float32Array(pts.length * 3);
    const info = new Float32Array(pts.length * 4);
    const rnd = new Float32Array(pts.length * 4);
    pts.forEach((p, i) => {
      base.set([p.x, p.y, p.z], i * 3);
      info.set([p.s, p.kind, p.side, p.w], i * 4);
      // Delay grows from head to tail so the whale "draws" itself.
      // Launch pad: the drones start from a neat grid on the lake.
      const cols = 90;
      const gx = (i % cols) / (cols - 1);
      const gz = (Math.floor(i / cols) % 60) / 59;
      rnd.set([rng(), THREE.MathUtils.clamp(p.s * 0.8 + rng() * 0.2, 0, 1), gx, gz], i * 4);
    });
    geo.setAttribute("iBase", new THREE.InstancedBufferAttribute(base, 3));
    geo.setAttribute("iInfo", new THREE.InstancedBufferAttribute(info, 4));
    geo.setAttribute("iRand", new THREE.InstancedBufferAttribute(rnd, 4));
    geo.instanceCount = pts.length;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: length },
        uWhale: { value: this.matrix },
        uAssemble: { value: 0 },
        uLaunchCentre: { value: new THREE.Vector3(40, 0, -200) },
        uLaunchSpread: { value: new THREE.Vector2(260, 160) },
        uRes: G.uRes,
        uPx: { value: 1.6 },
        uSwim: { value: 1 },
        uAlpha: { value: 0 },
        uGain: { value: 2.6 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    // Default path: a slow, wide loop in front of the viewer.
    // Default path: a slow ellipse high over the lake, crossing the view.
    this.path = (t, out) => {
      const a = t * 0.045 + 1.2;
      return out.set(70 + Math.sin(a) * 330, 150 + Math.sin(t * 0.09) * 14, -330 + Math.cos(a) * 85);
    };
  }

  update(dt: number) {
    this.time += dt;
    this.pathTime += dt;
    const t = this.pathTime;
    const p = this.path(t, this.pos);
    const ahead = this.path(t + 0.6, new THREE.Vector3());
    const fwd = ahead.clone().sub(p).normalize();
    // Bank into the turn a little.
    const ahead2 = this.path(t + 3, new THREE.Vector3());
    const turn = new THREE.Vector3().subVectors(ahead2, ahead).normalize().cross(fwd).y;
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(fwd, THREE.MathUtils.clamp(turn * 2.5, -0.35, 0.35));
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd, up);
    // lookAt makes -z face along fwd; our whale's head is +x: rotate.
    this.quat.setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
    this.matrix.compose(p, this.quat, new THREE.Vector3(1, 1, 1));
    const u = this.material.uniforms;
    u.uTime.value = this.time;
    u.uAssemble.value = this.assemble;
    u.uAlpha.value = this.alpha;
    this.mesh.visible = this.alpha > 0.001;
  }
}
