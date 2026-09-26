import * as THREE from "three";
import { common } from "../../engine/glsl";
import { G } from "../atmos";

// Painted signs: the great gate's plaque (額, "月読" in vertical gold) and the
// three great chōchin over the bridge carrying 統 / 経 / 量. Glyphs are drawn
// into canvases with the page's mincho font and redrawn once it has loaded.

const FONT = '"Shippori Mincho B1", "Noto Serif SC", serif';

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const redraw = () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx);
    tex.needsUpdate = true;
  };
  document.fonts?.load(`800 100px ${FONT}`).then(redraw, () => {});
  return tex;
}

// ---- plaque
const plaqueFrag = /* glsl */ `
${common}
uniform sampler2D tMap;
uniform float uGlow;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 t = texture(tMap, vUv);
  // Channel masks — r: gold lettering, g: frame, b: board.
  vec3 board = vec3(0.03, 0.025, 0.035) * t.b;
  vec3 frame = vec3(0.35, 0.05, 0.03) * t.g;
  float shimmer = 0.85 + 0.15 * sin(uTime * 1.2 + vUv.y * 6.0);
  vec3 gold = vec3(1.0, 0.8, 0.45) * t.r * 3.2 * uGlow * shimmer;
  gl_FragColor = vec4(board + frame + gold, 1.0);
}`;

export function createPlaque(width: number, height: number) {
  const tex = canvasTexture(256, 420, (ctx) => {
    const W = 256;
    const H = 420;
    ctx.fillStyle = "rgb(0,0,255)";
    ctx.fillRect(0, 0, W, H);
    // frame (green channel)
    ctx.fillStyle = "rgb(0,255,0)";
    ctx.fillRect(0, 0, W, 18);
    ctx.fillRect(0, H - 18, W, 18);
    ctx.fillRect(0, 0, 18, H);
    ctx.fillRect(W - 18, 0, 18, H);
    ctx.fillStyle = "rgb(255,0,255)";
    ctx.font = `800 132px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("月", W / 2, H * 0.3);
    ctx.fillText("読", W / 2, H * 0.68);
  });
  tex.colorSpace = THREE.NoColorSpace;
  const geo = new THREE.BoxGeometry(width, height, 0.5);
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: plaqueFrag,
    uniforms: { tMap: { value: tex }, uGlow: { value: 1 }, uTime: G.uTime },
  });
  return new THREE.Mesh(geo, mat);
}

// ---- great chōchin
function chochinGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = t * 2 - 1;
    // Barrel with slight ribs.
    const r = Math.sqrt(1 - y * y * 0.82) * (1 + 0.02 * Math.cos(t * Math.PI * 22));
    pts.push(new THREE.Vector2(r, y * 1.25));
  }
  const g = new THREE.LatheGeometry(pts, 40);
  return g;
}

const chochinVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const chochinFrag = /* glsl */ `
${common}
uniform sampler2D tMap;
uniform float uLit;
uniform float uTime;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 V = normalize(uCamPos - vW);
  float ink = texture(tMap, vUv).r;
  float ribs = smoothstep(0.85, 1.0, abs(sin(vUv.y * 3.14159 * 22.0)));
  float caps = smoothstep(0.08, 0.04, vUv.y) + smoothstep(0.92, 0.96, vUv.y);
  float thin = 0.65 + 0.35 * (1.0 - abs(dot(normalize(vN), V)));
  float fl = 0.93 + 0.07 * sin(uTime * 6.0 + vW.x) * sin(uTime * 2.3);
  vec3 paper = vec3(1.0, 0.56, 0.26) * (1.1 + 1.8 * uLit) * thin * fl;
  paper *= 1.0 - ribs * 0.35;
  vec3 col = mix(paper, vec3(0.05, 0.015, 0.01), ink * 0.92);
  col = mix(col, vec3(0.02, 0.015, 0.012), saturate(caps));
  gl_FragColor = vec4(col, 1.0);
}`;

export class GreatLanterns {
  readonly group = new THREE.Group();
  readonly items: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; base: THREE.Vector3; lit: number; target: number; id: string }[] = [];

  constructor(defs: { id: string; char: string; pos: THREE.Vector3; scale: number }[]) {
    const geo = chochinGeometry();
    for (const d of defs) {
      const tex = canvasTexture(512, 256, (ctx) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 512, 256);
        ctx.fillStyle = "#fff";
        ctx.font = `800 150px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Lathe UV: u around, v up — draw the glyph twice (front and back).
        for (const x of [128, 384]) {
          ctx.save();
          ctx.translate(x, 128);
          ctx.scale(1, -1);
          ctx.fillText(d.char, 0, 6);
          ctx.restore();
        }
      });
      tex.colorSpace = THREE.NoColorSpace;
      const mat = new THREE.ShaderMaterial({
        vertexShader: chochinVert,
        fragmentShader: chochinFrag,
        uniforms: { tMap: { value: tex }, uLit: { value: 0 }, uTime: G.uTime, uCamPos: G.uCamPos },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(d.scale);
      mesh.position.copy(d.pos);
      mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
      this.items.push({ mesh, mat, base: d.pos.clone(), lit: 0, target: 0, id: d.id });
    }
  }

  light(id: string | null) {
    for (const it of this.items) it.target = it.id === id ? 1 : 0;
  }

  update(dt: number, t: number) {
    this.items.forEach((it, i) => {
      it.lit += (it.target - it.lit) * (1 - Math.exp(-dt * 5));
      it.mat.uniforms.uLit.value = it.lit;
      it.mesh.position.set(it.base.x, it.base.y + Math.sin(t * 0.8 + i * 2) * 0.25, it.base.z);
      it.mesh.rotation.z = Math.sin(t * 0.6 + i) * 0.03 + it.lit * Math.sin(t * 2.2) * 0.02;
    });
  }
}
