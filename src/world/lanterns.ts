import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { COMMON, globals, REFLECT_LAYER } from "./globals.ts";
import { mulberry32 } from "./noise.ts";
import { SKILLS_KEY } from "./rig.ts";
import type { FrameContext, Part } from "./World.ts";

const WATER = 130;
const SKY = 150;
const HEIGHT = 230;

// Paper box on a small wooden float (灯籠流し). aPart: 0 paper, 1 wood.
function floatingLanternGeometry() {
  const paper = new THREE.BoxGeometry(0.72, 0.72, 0.72).translate(0, 0.5, 0).toNonIndexed();
  const float = new THREE.BoxGeometry(0.95, 0.14, 0.95).translate(0, 0.07, 0).toNonIndexed();
  const posts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.07, 0.8, 0.07).translate(sx * 0.37, 0.5, sz * 0.37).toNonIndexed()));
  const tagPart = (g: THREE.BufferGeometry, v: number) => {
    g.deleteAttribute("uv");
    g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1));
    return g;
  };
  return mergeGeometries([tagPart(paper, 0), tagPart(float, 1), ...posts.map((p) => tagPart(p, 1))])!;
}

export function createLanterns(): Part {
  const rnd = mulberry32(3);
  const group = new THREE.Group();

  // ——— Floating lanterns ———
  const fBase = floatingLanternGeometry();
  const fGeo = new THREE.InstancedBufferGeometry();
  for (const k of ["position", "normal", "aPart"]) fGeo.setAttribute(k, fBase.attributes[k]);
  const fData = new Float32Array(WATER * 4);
  for (let i = 0; i < WATER; i++) {
    // Denser just beyond the gate, thinning out toward the moon.
    const z = i < 26 ? 34 - rnd() * 30 : -6 - Math.pow(rnd(), 1.3) * 340;
    let x = (rnd() * 2 - 1) * (i < 26 ? 22 : 55);
    if (Math.abs(x) < 3.5) x += 5 * Math.sign(x || 1);
    fData.set([x, z, (rnd() < 0.5 ? -1 : 1) * (0.06 + rnd() * 0.12), rnd() * 100], i * 4);
  }
  fGeo.setAttribute("aData", new THREE.InstancedBufferAttribute(fData, 4));
  fGeo.instanceCount = WATER;
  const floating = new THREE.Mesh(
    fGeo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute float aPart;
        attribute vec4 aData; // x, z, drift speed, phase
        varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormal; varying float vPart; varying float vSeed;
        void main() {
          float t = uTime;
          float x = mod(aData.x + t * aData.z + 70.0, 140.0) - 70.0;
          vec3 c = vec3(x, 0.02 + sin(t * 0.9 + aData.w) * 0.04, aData.y + sin(t * 0.2 + aData.w) * 0.8);
          float fade = smoothstep(70.0, 60.0, abs(x));
          float rock = sin(t * 0.8 + aData.w * 2.0) * 0.05;
          vec3 p = position;
          p.xy = mat2(cos(rock), -sin(rock), sin(rock), cos(rock)) * p.xy;
          vec3 w = c + p * 0.95 * fade;
          vWorld = w; vLocal = position; vNormal = normal; vPart = aPart; vSeed = aData.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormal; varying float vPart; varying float vSeed;
        void main() {
          vec3 col;
          if (vPart > 0.5) {
            col = shadeSolid(vec3(0.05, 0.03, 0.02), normalize(vNormal), normalize(cameraPosition - vWorld), 0.05);
            col += vec3(1.0, 0.55, 0.22) * 0.25;
          } else {
            float flick = 0.88 + 0.12 * sin(uTime * 8.0 + vSeed * 20.0) * sin(uTime * 3.1 + vSeed * 7.0);
            float h = clamp((vLocal.y - 0.14) / 0.72, 0.0, 1.0);
            vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.5, 0.2), h);
            float top = step(0.5, vNormal.y);
            col = warm * mix(2.4, 1.2, h) * flick * (1.0 - top * 0.6);
          }
          gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
        }
      `,
    }),
  );
  floating.frustumCulled = false;
  floating.layers.enable(REFLECT_LAYER);
  group.add(floating);

  // ——— Sky lanterns ———
  const sBase = new THREE.CylinderGeometry(0.42, 0.3, 1.0, 10, 1, false);
  const sGeo = new THREE.InstancedBufferGeometry();
  sGeo.setIndex(sBase.index);
  sGeo.setAttribute("position", sBase.attributes.position);
  sGeo.setAttribute("normal", sBase.attributes.normal);
  const sData = new Float32Array(SKY * 4);
  const sParams = new Float32Array(SKY * 4);
  for (let i = 0; i < SKY; i++) {
    let x = (rnd() * 2 - 1) * 160;
    if (Math.abs(x) < 12) x += 14 * Math.sign(x || 1);
    sData.set([x, rnd() * HEIGHT, 30 - rnd() * 480, rnd() * 100], i * 4);
    sParams.set([0.5 + rnd() * 0.9, 1 + rnd() * 2.5, 0.9 + rnd() * 0.6, 0], i * 4);
  }
  sGeo.setAttribute("aData", new THREE.InstancedBufferAttribute(sData, 4));
  sGeo.setAttribute("aParams", new THREE.InstancedBufferAttribute(sParams, 4));
  sGeo.instanceCount = SKY;
  const sky = new THREE.Mesh(
    sGeo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute vec4 aData;   // x, y0, z, phase
        attribute vec4 aParams; // speed, sway, scale
        varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormal; varying float vSeed; varying float vFade;
        void main() {
          float t = uTime;
          float y = mod(aData.y + t * aParams.x, ${HEIGHT}.0);
          vec3 c = vec3(aData.x + sin(t * 0.17 + aData.w) * aParams.y, y + 3.0, aData.z + cos(t * 0.13 + aData.w) * aParams.y);
          c += rayPush(c, 7.0, 2.5);
          float g;
          c += shockPush(c, g) * 0.5;
          vFade = smoothstep(0.0, 10.0, y) * (1.0 - smoothstep(${HEIGHT - 60}.0, ${HEIGHT}.0, y)) * mix(0.3, 1.0, uWorld);
          vec3 w = c + position * aParams.z * max(vFade, 0.001);
          vWorld = w; vLocal = position; vNormal = normal; vSeed = aData.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vWorld; varying vec3 vLocal; varying vec3 vNormal; varying float vSeed; varying float vFade;
        void main() {
          float h = clamp(vLocal.y + 0.5, 0.0, 1.0);
          float ribs = 0.82 + 0.18 * cos(atan(vLocal.z, vLocal.x) * 8.0);
          float flick = 0.88 + 0.12 * sin(uTime * 9.0 + vSeed * 20.0) * sin(uTime * 3.7 + vSeed * 7.0);
          vec3 col = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.45, 0.16), h) * mix(2.6, 0.8, h) * ribs * flick;
          col *= 1.0 - 0.8 * step(0.49, abs(vNormal.y));
          gl_FragColor = vec4(applyFog(col * (0.6 + 0.4 * vFade), vWorld), 1.0);
        }
      `,
    }),
  );
  sky.frustumCulled = false;
  sky.layers.enable(REFLECT_LAYER);
  group.add(sky);

  return { object: group };
}

// ——— The three great lanterns of the expertise section (提灯) ———

function chochinGeometry() {
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const y = -0.8 + t * 1.6;
    profile.push(new THREE.Vector2(0.3 + 0.3 * Math.pow(Math.sin(Math.PI * t), 0.7), y));
  }
  const paper = new THREE.LatheGeometry(profile, 48).toNonIndexed();
  const top = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 24).translate(0, 0.86, 0).toNonIndexed();
  const bottom = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 24).translate(0, -0.86, 0).toNonIndexed();
  const cord = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).translate(0, -1.35, 0).toNonIndexed();
  const tag = (g: THREE.BufferGeometry, part: number) => {
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    return g;
  };
  return mergeGeometries([tag(paper, 0), tag(top, 1), tag(bottom, 1), tag(cord, 2)])!;
}

function inkTexture(ch: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = '800 250px "Shippori Mincho B1", "Yu Mincho", serif';
  // LatheGeometry starts its u = 0 seam on +z, which faces the camera; draw
  // the character there (split across both edges) and again on the back.
  for (const x of [0, 512, 1024]) g.fillText(ch, x, 262);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createSkillLanterns(chars: string[]): Part & { setActive(i: number): void } {
  const root = new THREE.Group();
  const geo = chochinGeometry();
  const items = chars.map((ch) => {
    const active = { value: 0 };
    const mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: { ...globals, uInk: { value: inkTexture(ch) }, uActive: active },
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          attribute float aPart;
          varying vec2 vUv; varying float vPart; varying vec3 vWorld; varying vec3 vNormal;
          void main() {
            vUv = uv; vPart = aPart;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * w;
          }
        `,
        fragmentShader: /* glsl */ `
          ${COMMON}
          uniform sampler2D uInk;
          uniform float uActive;
          varying vec2 vUv; varying float vPart; varying vec3 vWorld; varying vec3 vNormal;
          void main() {
            vec3 col;
            if (vPart > 1.5) {
              col = vec3(0.6, 0.06, 0.03) * 0.6;
            } else if (vPart > 0.5) {
              col = shadeSolid(vec3(0.02), normalize(vNormal), normalize(cameraPosition - vWorld), 0.4);
            } else {
              float ribs = smoothstep(0.0, 0.1, abs(fract(vUv.y * 16.0) - 0.5) * 2.0);
              // Candle inside: hottest in the middle, warmer and dimmer toward the caps.
              float glow = 0.45 + 0.55 * pow(sin(3.14159 * vUv.y), 1.5);
              float flick = 0.93 + 0.07 * sin(uTime * 6.0 + vWorld.x) * sin(uTime * 2.3 + vWorld.z);
              vec3 paper = mix(vec3(1.0, 0.42, 0.14), vec3(1.0, 0.68, 0.36), glow) * (1.7 + uActive * 1.4 + uBeat * 0.1) * glow * (0.72 + 0.28 * ribs) * flick;
              float ink = texture2D(uInk, vec2(vUv.x, vUv.y)).a;
              col = mix(paper, vec3(0.025, 0.008, 0.005), ink * 0.94);
            }
            gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
          }
        `,
      }),
    );
    mesh.scale.setScalar(3);
    const holder = new THREE.Group();
    holder.add(mesh);
    root.add(holder);
    return { holder, mesh, active, target: 0, phase: Math.random() * 6 };
  });
  root.traverse((o) => o.layers.enable(REFLECT_LAYER));

  const camPos = new THREE.Vector3(...SKILLS_KEY.pos);
  const forward = new THREE.Vector3(...SKILLS_KEY.target).sub(camPos).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const halfTan = Math.tan(THREE.MathUtils.degToRad(SKILLS_KEY.fov / 2));
  const base: THREE.Vector3[] = items.map(() => new THREE.Vector3());

  return {
    object: root,
    resize(aspect: number) {
      const portrait = aspect < 0.9;
      const dist = portrait ? 40 : 30;
      const spread = portrait ? 8.5 : Math.min(16, 0.62 * dist * halfTan * aspect);
      items.forEach((it, i) => {
        base[i].copy(camPos).addScaledVector(forward, dist).addScaledVector(right, (i - 1) * spread);
        base[i].y = portrait ? 23 : 11.5;
        it.holder.position.copy(base[i]);
        it.holder.lookAt(camPos.x, base[i].y, camPos.z);
      });
    },
    update(ctx: FrameContext) {
      const near = Math.abs(ctx.section - 2) < 1.4;
      root.visible = near;
      if (!near) return;
      items.forEach((it, i) => {
        it.holder.position.y = base[i].y + Math.sin(ctx.time * 0.7 + it.phase) * 0.35;
        it.mesh.rotation.z = Math.sin(ctx.time * 0.5 + it.phase) * 0.04;
        it.mesh.rotation.y = Math.sin(ctx.time * 0.3 + it.phase) * 0.15;
        it.active.value += (it.target - it.active.value) * (1 - Math.exp(-ctx.dt * 6));
      });
    },
    setActive(index: number) {
      items.forEach((it, i) => (it.target = i === index ? 1 : 0));
    },
  };
}

// The visitor's wish: a large lantern released from the water in front of the
// camera that climbs toward the moon, shedding embers.
export function createWishLantern(onEmber: (p: THREE.Vector3) => void): Part & { launch(from: THREE.Vector3): void } {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.3, 1.0, 16),
    new THREE.ShaderMaterial({
      uniforms: { ...globals, uLife: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld;
        void main() { vLocal = position; vNormal = normal; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uLife;
        varying vec3 vLocal; varying vec3 vNormal; varying vec3 vWorld;
        void main() {
          float h = clamp(vLocal.y + 0.5, 0.0, 1.0);
          float ribs = 0.8 + 0.2 * cos(atan(vLocal.z, vLocal.x) * 10.0);
          vec3 col = mix(vec3(1.0, 0.74, 0.44), vec3(1.0, 0.4, 0.14), h) * mix(5.0, 1.5, h) * ribs;
          col *= 1.0 - 0.8 * step(0.49, abs(vNormal.y));
          col *= 0.9 + 0.1 * sin(uTime * 11.0) * sin(uTime * 4.3);
          gl_FragColor = vec4(applyFog(col * uLife, vWorld), 1.0);
        }
      `,
    }),
  );
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.layers.enable(REFLECT_LAYER);
  const start = new THREE.Vector3();
  let age = -1;
  let emberClock = 0;
  const life = (mesh.material as THREE.ShaderMaterial).uniforms.uLife;
  return {
    object: mesh,
    launch(from: THREE.Vector3) {
      start.copy(from);
      age = 0;
      mesh.visible = true;
    },
    update(ctx) {
      if (age < 0) return;
      age += ctx.dt;
      const m = globals.uMoonDir.value;
      const climb = Math.pow(age, 1.35) * 5.5;
      mesh.position.set(
        start.x + m.x * climb + Math.sin(age * 1.3) * 0.6,
        start.y + age * 2.2 + m.y * climb,
        start.z + m.z * climb + Math.cos(age * 1.1) * 0.5,
      );
      mesh.rotation.z = Math.sin(age * 1.7) * 0.12;
      mesh.scale.setScalar(2.2);
      life.value = Math.min(1, age * 2) * (1 - THREE.MathUtils.smoothstep(age, 9, 12));
      emberClock += ctx.dt;
      if (emberClock > 0.06) {
        emberClock = 0;
        onEmber(mesh.position);
      }
      if (age > 12) {
        age = -1;
        mesh.visible = false;
      }
    },
  };
}

// Beyond the modelled lanterns, a carpet of thousands more reaches the
// horizon (灯籠流し): tiny warm points, sized by distance, that thicken into
// a band of light along the skyline and mirror in the water.
export function createLanternField(count = 5200): Part {
  const rnd = mulberry32(21);
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  let i = 0;
  while (i < count) {
    const x = (rnd() * 2 - 1) * 1100;
    const z = 60 - Math.pow(rnd(), 0.75) * 1750;
    // The water along the camera path belongs to the modelled lanterns.
    if (Math.abs(x) < 70 && z > -380) continue;
    pos.set([x, 0.35, z], i * 3);
    seed[i] = rnd();
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms: globals,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${COMMON}
        attribute float aSeed;
        varying float vBright;
        varying float vSeed;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.05 + aSeed * 40.0) * 2.0;
          p.y += sin(uTime * 0.9 + aSeed * 60.0) * 0.03;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = -mv.z;
          float size = uPointScale * 0.85 / max(dist, 1.0);
          gl_PointSize = clamp(size, 1.3, 9.0);
          float fog = exp(-dist * uFogDensity * 0.55);
          vBright = clamp(size / 1.6, 0.3, 1.0) * fog;
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vBright;
        varying float vSeed;
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          // A lantern is a little taller than wide.
          float m = smoothstep(1.0, 0.55, max(abs(q.x) * 1.35, abs(q.y)));
          float flick = 0.85 + 0.15 * sin(uTime * (5.0 + vSeed * 4.0) + vSeed * 30.0);
          vec3 warm = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.62, 0.32), vSeed);
          gl_FragColor = vec4(warm * mix(2.4, 4.5, uDusk) * m * flick * vBright, 1.0);
        }
      `,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = -5;
  points.layers.enable(REFLECT_LAYER);
  return { object: points };
}
