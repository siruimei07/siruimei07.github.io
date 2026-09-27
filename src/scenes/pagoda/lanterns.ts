import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { catenary, GeoBuilder, tube } from "./geo";

// 提灯: round paper lanterns — along every eave, at the pagoda's corners and
// strung across the street on sagging ropes. One instanced mesh for all of
// them (ribbed paper that glows, black lacquer caps), one merged mesh for the
// ropes. They sway a little on their hooks.

export type LanternSpec = { p: THREE.Vector3; s: number; hue: number };

function lanternGeometry(): THREE.BufferGeometry {
  // unit lantern: body radius 0.5, height 1 (y −0.5 … 0.5), caps above and below
  const prof: THREE.Vector2[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = -0.46 + 0.92 * t;
    const r = 0.2 + 0.3 * Math.pow(Math.sin(Math.PI * t), 0.55);
    prof.push(new THREE.Vector2(r, y));
  }
  const b = new GeoBuilder();
  b.add(new THREE.LatheGeometry(prof, 12), new THREE.Matrix4(), 0xffffff);
  const cap = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12);
  b.add(cap, new THREE.Matrix4().makeTranslation(0, 0.5, 0), 0x000000);
  b.add(cap, new THREE.Matrix4().makeTranslation(0, -0.5, 0), 0x000000);
  const hook = new THREE.CylinderGeometry(0.03, 0.03, 0.35, 5);
  b.add(hook, new THREE.Matrix4().makeTranslation(0, 0.72, 0), 0x000000);
  return b.build();
}

export class Lanterns {
  readonly specs: LanternSpec[] = [];
  private ropes = new GeoBuilder();

  add(p: THREE.Vector3, s = 0.55, hue = 0) {
    this.specs.push({ p: p.clone(), s, hue });
  }

  /** A rope from a to b with `n` lanterns hanging from it. */
  string(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number, s = 0.5, hue = 0, rope = true) {
    const pts = catenary(a, b, sag, 24);
    if (rope) this.ropes.add(tube(pts, 0.022, 4), new THREE.Matrix4(), 0xffffff);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = a.clone().lerp(b, t);
      p.y -= sag * 4 * t * (1 - t) + s * 0.95;
      this.add(p, s, hue);
    }
  }

  build(): THREE.Object3D {
    const group = new THREE.Group();
    const geo = lanternGeometry();
    const n = this.specs.length;
    const mesh = new THREE.InstancedMesh(
      geo,
      toonMaterial({
        color: 0xffffff,
        shade: 0xffffff,
        ink: 40,
        rim: 0,
        lights: 0,
        fog: 0.6,
        vertexColors: true,
        vertexHead: /* glsl */ `varying vec3 vLocal; attribute float aSeed; varying float vSeed;`,
        vertex: /* glsl */ `
          vLocal = position;
          vSeed = aSeed;
          // sway on the hook
          float sw = sin(uTime * (0.9 + fract(aSeed * 7.1) * 0.6) + aSeed * 6.28) * 0.05 + sin(uTime * 2.3 + aSeed * 3.0) * 0.012;
          float arm = (0.7 - position.y);
          vec3 sc = vec3(length(instanceMatrix[0].xyz));
          wp.x += sw * arm * sc.x;
          wp.z += sw * 0.6 * arm * sc.x;`,
        fragmentHead: /* glsl */ `varying vec3 vLocal; varying float vSeed;`,
        fragment: /* glsl */ `
          // vTint = instance colour (paper) × vertex colour (caps are black)
          float paper = step(0.1, luma(vTint));
          float y = vLocal.y;
          float rib = smoothstep(0.035, 0.0, abs(fract(y * 11.0) - 0.5) - 0.42);
          float r = length(vLocal.xz);
          // brighter where the paper bulges toward the viewer, a hot core
          vec3 V2 = normalize(cameraPosition - vWorldPos);
          float face = saturate(dot(n, V2));
          float flick = 0.88 + 0.12 * sin(uTime * (7.0 + vSeed * 5.0) + vSeed * 40.0) * sin(uTime * 3.1 + vSeed * 9.0);
          vec3 glow = vTint * (0.9 + 1.6 * pow(face, 2.0)) * (1.0 - rib * 0.5) * flick;
          glow += vec3(1.0, 0.6, 0.25) * pow(face, 6.0) * 0.5 * flick;
          // a dark band printed round the middle of some lanterns
          float band = step(0.72, fract(vSeed * 3.7)) * smoothstep(0.1, 0.08, abs(y));
          glow *= 1.0 - band * 0.7;
          base = mix(vec3(0.02), vTint * 0.3, paper);
          shade = base;
          emis += glow * paper;`,
      }),
      n,
    );
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const seeds = new Float32Array(n);
    this.specs.forEach((l, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 2.39996) % (Math.PI * 2));
      m.compose(l.p, q, new THREE.Vector3(l.s, l.s * 1.05, l.s));
      mesh.setMatrixAt(i, m);
      // hue 0: warm orange; 1: red; 2: pale yellow-white
      if (l.hue === 1) c.setRGB(1.0, 0.07, 0.02);
      else if (l.hue === 2) c.setRGB(1.0, 0.48, 0.16);
      else c.setRGB(1.0, 0.24 + ((i * 37) % 11) * 0.008, 0.045);
      mesh.setColorAt(i, c);
      seeds[i] = ((i * 0.618034) % 1) * 10;
    });
    mesh.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    group.add(mesh);
    if (this.ropes.vertexCount > 0) {
      const ropes = new THREE.Mesh(this.ropes.build(), toonMaterial({ color: 0x3a2a2a, shade: 0x0a0810, ink: 41, rim: 0.3, fog: 0.8 }));
      ropes.frustumCulled = false;
      group.add(ropes);
    }
    return group;
  }
}
