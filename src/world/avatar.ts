import * as THREE from "three";
import { globals, REFLECT_LAYER } from "./globals.ts";
import type { FrameContext, Part } from "./World.ts";

export const AVATAR_POS = new THREE.Vector3(6.4, 8.2, 17);

// ACES fit matrices from the composite pass, inverted so the portrait comes out
// of tone mapping looking like the original image.
const IN = new THREE.Matrix3().set(0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777);
const OUT = new THREE.Matrix3().set(1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602);

function ringGeometry(r0: number, r1: number, seg = 160) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.push(c * r0, s * r0, 0, c * r1, s * r1, 0);
    uv.push(i / seg, 0, i / seg, 1);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function textRingTexture() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  const unit = "SAKAYORI IROHA  ·  酒寄 彩葉  ·  月読  ·  ";
  g.font = '500 52px "Cormorant Garamond", "Shippori Mincho B1", serif';
  const w = g.measureText(unit).width;
  const reps = Math.max(1, Math.round(c.width / w));
  g.save();
  g.scale(c.width / (w * reps), 1);
  for (let i = 0; i < reps; i++) g.fillText(unit, i * w, 50);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function additive(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, ...uniforms },
    vertexShader: RING_VERT,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function createAvatar(texture: THREE.Texture): Part & {
  hitTest(ray: THREE.Ray): boolean;
  poke(): void;
  setHover(on: boolean): void;
  worldCenter: THREE.Vector3;
} {
  const group = new THREE.Group();
  group.position.copy(AVATAR_POS);
  const card = new THREE.Group();
  group.add(card);

  const hover = { value: 0 };
  const glitch = { value: 0 };
  const burst = { value: 10 };

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const portrait = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 4.6),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: globals.uTime,
        uExposure: globals.uExposure,
        uMap: { value: texture },
        uHover: hover,
        uGlitch: glitch,
        uInvIn: { value: IN.clone().invert() },
        uInvOut: { value: OUT.clone().invert() },
      },
      transparent: true,
      vertexShader: RING_VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uExposure; uniform float uHover; uniform float uGlitch;
        uniform sampler2D uMap; uniform mat3 uInvIn; uniform mat3 uInvOut;
        varying vec2 vUv;
        float hash(float n) { return fract(sin(n) * 43758.5453); }
        vec3 invFit(vec3 y) {
          y = clamp(y, 0.0, 0.96);
          vec3 A = 1.0 - 0.983729 * y;
          vec3 B = 0.0245786 - 0.432951 * y;
          vec3 C = -(0.000090537 + 0.238081 * y);
          return (-B + sqrt(B * B - 4.0 * A * C)) / (2.0 * A);
        }
        vec3 invAces(vec3 c) { return max(uInvIn * invFit(uInvOut * c), 0.0) / uExposure; }
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float aa = fwidth(r) * 1.2;
          // A gentle ripple wobbles the image for a moment after a click.
          vec2 uv = vUv + p * sin(r * 30.0 - uTime * 8.0) * 0.004 * uGlitch;
          vec2 iuv = (uv - 0.5) / 0.84 + 0.5;
          vec3 col = invAces(texture2D(uMap, iuv).rgb);
          float inner = 1.0 - smoothstep(0.84 - aa, 0.84 + aa, r);
          // Moonlight sheen drifting across the glass, and a soft inner vignette.
          float sheen = exp(-pow((vUv.x + vUv.y * 0.6 - fract(uTime * 0.05) * 2.4 + 0.4) * 5.0, 2.0));
          col += vec3(1.0, 0.95, 0.85) * sheen * 0.08 * inner;
          col *= 1.0 - pow(r / 0.84, 6.0) * 0.35;
          // Thin gold rim of a round window (丸窓), then a hairline outer ring.
          float ring = smoothstep(0.852 - aa, 0.852 + aa, r) * (1.0 - smoothstep(0.878 - aa, 0.878 + aa, r));
          vec3 rim = vec3(1.0, 0.8, 0.5) * (0.9 + uHover * 0.9);
          float outer = smoothstep(0.945 - aa, 0.945, r) * (1.0 - smoothstep(0.951, 0.951 + aa, r));
          vec3 outCol = col * inner + rim * ring + vec3(0.9, 0.88, 0.8) * 0.5 * outer;
          float alpha = max(inner, max(ring, outer * 0.8));
          gl_FragColor = vec4(outCol, alpha);
        }
      `,
    }),
  );
  portrait.renderOrder = 8;
  card.add(portrait);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    additive(
      /* glsl */ `
      uniform float uTime; uniform float uBeat; uniform float uHover;
      varying vec2 vUv;
      void main() {
        float r = length(vUv * 2.0 - 1.0);
        float g = exp(-r * r * 10.0) * 0.1 + exp(-pow((r - 0.47) / 0.02, 2.0)) * 0.06;
        vec3 c = vec3(1.0, 0.86, 0.66);
        gl_FragColor = vec4(c * g * (1.0 + uBeat * 0.3 + uHover * 0.8), 1.0);
      }`,
      { uHover: hover },
    ),
  );
  glow.position.z = -0.1;
  glow.renderOrder = 7;
  card.add(glow);

  const textRing = new THREE.Mesh(
    ringGeometry(2.72, 3.02),
    additive(
      /* glsl */ `
      uniform float uTime; uniform sampler2D uMap; uniform float uHover;
      varying vec2 vUv;
      void main() {
        float m = texture2D(uMap, vec2(vUv.x * 2.0, vUv.y)).r;
        vec3 c = vec3(0.95, 0.9, 0.8);
        float edge = exp(-pow((vUv.y - 0.03) / 0.03, 2.0)) + exp(-pow((vUv.y - 0.97) / 0.03, 2.0));
        gl_FragColor = vec4(c * (m * (0.75 + uHover * 0.6) + edge * 0.18), 1.0);
      }`,
      { uMap: { value: textRingTexture() }, uHover: hover },
    ),
  );
  card.add(textRing);

  const tickRing = new THREE.Mesh(
    ringGeometry(3.3, 3.48, 256),
    additive(
      /* glsl */ `
      uniform float uTime; uniform float uBeat;
      varying vec2 vUv;
      void main() {
        float t = fract(vUv.x * 120.0);
        float major = step(0.9, fract(vUv.x * 12.0 + 0.05));
        float tick = step(t, 0.12) * mix(step(0.6, vUv.y), 1.0, major);
        gl_FragColor = vec4(vec3(0.9, 0.87, 0.78) * tick * (0.45 + uBeat * 0.3), 1.0);
      }`,
      {},
    ),
  );
  tickRing.rotation.x = 1.22;
  group.add(tickRing);

  const arcRing = new THREE.Mesh(
    ringGeometry(3.85, 3.92, 256),
    additive(
      /* glsl */ `
      uniform float uTime; uniform float uBurst;
      varying vec2 vUv;
      void main() {
        // A short vermilion arc with a small bright head, like a seal stroke.
        float x = fract(vUv.x - uTime * 0.03);
        float seg = smoothstep(0.0, 0.02, x) * (1.0 - smoothstep(0.16, 0.2, x));
        float head = exp(-pow((x - 0.18) * 60.0, 2.0));
        vec3 c = vec3(0.9, 0.3, 0.2) * (seg * 0.7 + head * 2.5);
        gl_FragColor = vec4(c, 1.0);
      }`,
      { uBurst: burst },
    ),
  );
  arcRing.rotation.set(0.35, 1.05, 0);
  group.add(arcRing);

  // Expanding shock ring on click.
  const shock = new THREE.Mesh(
    ringGeometry(1, 1.06, 128),
    additive(
      /* glsl */ `
      uniform float uBurst;
      varying vec2 vUv;
      void main() {
        float a = exp(-uBurst * 2.2);
        gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * 1.4, 1.0);
      }`,
      { uBurst: burst },
    ),
  );
  card.add(shock);

  group.traverse((o) => o.layers.enable(REFLECT_LAYER));

  const plane = new THREE.Plane();
  const hit = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const look = new THREE.Quaternion();
  const lookMatrix = new THREE.Matrix4();
  const tilt = new THREE.Quaternion();
  const e = new THREE.Euler();
  const localHit = new THREE.Vector2();
  let hovering = false;
  const worldCenter = new THREE.Vector3();

  const base = AVATAR_POS.clone();
  let baseScale = 0.82;
  return {
    object: group,
    worldCenter,
    // Keep the hologram inside the right-hand third of the hero frame on any
    // aspect; on portrait screens it floats above the text instead.
    resize(aspect: number) {
      // Upper right of the hero frame, clear of the gate's pillar.
      if (aspect < 0.9) base.set(0, 26, 16);
      else base.set(THREE.MathUtils.clamp(5.6 * aspect, 7.5, 13), 13.2, 16);
      group.position.copy(base);
      baseScale = aspect < 0.9 ? 1 : 0.82;
    },
    update(ctx: FrameContext) {
      const t = ctx.time;
      // The medallion opens with the page copy at the end of the entry.
      const k = globals.uReveal.value;
      group.visible = k > 0.001;
      group.scale.setScalar(baseScale * (1 - Math.pow(1 - k, 3)));
      group.position.set(base.x, base.y + Math.sin(t * 0.8) * 0.25, base.z);
      worldCenter.copy(group.position);
      // Face the camera, then tilt toward the cursor.
      // Matrix4.lookAt(eye, target) points local +z from target to eye, which
      // is exactly the direction the portrait plane faces.
      lookMatrix.lookAt(ctx.camera.position, group.position, THREE.Object3D.DEFAULT_UP);
      look.setFromRotationMatrix(lookMatrix);
      const tx = hovering ? localHit.y * -0.35 : Math.sin(t * 0.5) * 0.06;
      const ty = hovering ? localHit.x * 0.35 : Math.sin(t * 0.37) * 0.08;
      tilt.setFromEuler(e.set(tx, ty, 0));
      look.multiply(tilt);
      card.quaternion.slerp(look, 1 - Math.exp(-ctx.dt * 6));
      textRing.rotation.z = -t * 0.12;
      tickRing.rotation.z = t * 0.2;
      arcRing.rotation.z = -t * 0.3;
      hover.value += ((hovering ? 1 : 0) - hover.value) * (1 - Math.exp(-ctx.dt * 8));
      glitch.value *= Math.exp(-ctx.dt * 1.5);
      burst.value += ctx.dt;
      const s = 2.4 + burst.value * 9;
      shock.scale.setScalar(s);
    },
    hitTest(ray: THREE.Ray) {
      card.getWorldDirection(normal);
      plane.setFromNormalAndCoplanarPoint(normal, group.position);
      if (!ray.intersectPlane(plane, hit)) return false;
      const d = hit.clone().sub(group.position);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(card.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(card.quaternion);
      localHit.set(d.dot(right) / 2.3, d.dot(up) / 2.3);
      return d.length() < 2.4;
    },
    setHover(on: boolean) {
      hovering = on;
    },
    poke() {
      glitch.value = 1;
      burst.value = 0;
    },
  };
}
