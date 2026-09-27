import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { env, toonMaterial } from "../../engine/toon";
import type { EnvValues } from "../common/env";
import { GAMING_POLE, POLE_HEIGHT, POLE_X, POLE_ZS, STREET_HALF, streetY, WALK } from "./layout";

// Street furniture: concrete utility poles with cross-arms, insulators and a
// transformer can; the wires that sag between them and drop across the street;
// the seven-colour "gaming pole" where the story begins; a vending machine,
// a curve mirror and street lamps that light the slope.

const tmp = new THREE.Matrix4();

function poleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shaft = new THREE.CylinderGeometry(0.15, 0.21, POLE_HEIGHT, 14, 1);
  shaft.translate(0, POLE_HEIGHT / 2, 0);
  parts.push(shaft);
  const arm = (y: number, len: number) => {
    const a = new THREE.BoxGeometry(len, 0.1, 0.1);
    a.translate(0, y, 0);
    parts.push(a);
    for (const x of [-len / 2 + 0.12, -len / 6, len / 6, len / 2 - 0.12]) {
      const ins = new THREE.CylinderGeometry(0.045, 0.06, 0.22, 8);
      ins.translate(x, y + 0.16, 0);
      parts.push(ins);
    }
  };
  arm(POLE_HEIGHT - 0.6, 1.9);
  arm(POLE_HEIGHT - 1.5, 1.5);
  // transformer can and its bracket
  const can = new THREE.CylinderGeometry(0.34, 0.34, 1.05, 16);
  can.translate(0.55, POLE_HEIGHT - 3.6, 0);
  parts.push(can);
  const lid = new THREE.CylinderGeometry(0.22, 0.36, 0.14, 16);
  lid.translate(0.55, POLE_HEIGHT - 3.0, 0);
  parts.push(lid);
  const br = new THREE.BoxGeometry(0.5, 0.08, 0.08);
  br.translate(0.3, POLE_HEIGHT - 3.4, 0);
  parts.push(br);
  // step bolts
  for (let i = 0; i < 8; i++) {
    const b = new THREE.BoxGeometry(0.22, 0.03, 0.03);
    b.applyMatrix4(tmp.makeRotationY((i % 2) * Math.PI / 2));
    b.translate(0, 2.4 + i * 0.45, 0);
    parts.push(b);
  }
  // the little ad plate every pole wears
  const plate = new THREE.BoxGeometry(0.32, 1.1, 0.02);
  plate.translate(0, 2.3, 0.2);
  parts.push(plate);
  for (const p of parts) if (!p.getAttribute("uv")) p.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(p.getAttribute("position").count * 2), 2));
  const g = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals();
  return g;
}

/** A sagging wire between two points as a thin tube. */
function wire(a: THREE.Vector3, b: THREE.Vector3, sag: number, radius: number, segs = 28): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, radius, 5, false);
}

export class Street {
  readonly group = new THREE.Group();
  readonly gamingPole: THREE.Mesh;
  readonly gamingBase = new THREE.Vector3();
  private rainbowHue = 0;

  constructor(private lights: EnvValues) {
    const poleGeo = poleGeometry();
    const poleMat = toonMaterial({ color: 0xb9c3dd, shade: 0x3a476e, ink: 10, rim: 0.9, step: 0.05 });
    const others = POLE_ZS.filter((_, i) => i !== GAMING_POLE);
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, others.length);
    const rot = new THREE.Quaternion();
    others.forEach((z, i) => {
      tmp.compose(new THREE.Vector3(POLE_X, streetY(z) + 0.1, z), rot, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, tmp);
    });
    poles.frustumCulled = false;
    this.group.add(poles);

    // The gaming pole: same pole, its shaft running a seven-colour gradient.
    const gz = POLE_ZS[GAMING_POLE];
    this.gamingBase.set(POLE_X, streetY(gz) + 0.1, gz);
    this.gamingPole = new THREE.Mesh(
      poleGeo,
      toonMaterial({
        color: 0xc9d2ea,
        shade: 0x46527c,
        ink: 11,
        rim: 1.0,
        uniforms: { uBaseY: { value: this.gamingBase.y } },
        fragmentHead: /* glsl */ `uniform float uBaseY;`,
        fragment: /* glsl */ `
          float y = vWorldPos.y - uBaseY;
          float r = length(vWorldPos.xz - vec2(${POLE_X.toFixed(3)}, ${gz.toFixed(3)}));
          float onShaft = step(r, 0.26) * step(y, ${(POLE_HEIGHT - 2.2).toFixed(2)});
          float hue = fract(y * 0.075 - uTime * 0.22);
          vec3 rgb = hsv2rgb(vec3(hue, 0.78, 1.0));
          // LED-strip banding + a brighter seam that breathes
          float band = 0.72 + 0.28 * step(0.5, fract(y * 3.0 - uTime * 1.6));
          float seam = smoothstep(0.035, 0.0, abs(fract(atan(vWorldPos.z - ${gz.toFixed(3)}, vWorldPos.x - ${POLE_X.toFixed(3)}) / 6.2832 + 0.25) - 0.5)) * step(y, 3.2);
          float breathe = 0.85 + 0.15 * sin(uTime * 2.2);
          emis += onShaft * (rgb * band * 2.6 * breathe + vec3(1.0) * seam * 3.0 * breathe);
          base = mix(base, rgb * 0.8 + 0.2, onShaft * 0.6);`,
      }),
    );
    this.gamingPole.position.copy(this.gamingBase);
    this.gamingPole.quaternion.copy(rot);
    this.group.add(this.gamingPole);

    // Wires: along the pole line, and service drops across to the houses opposite.
    const wires: THREE.BufferGeometry[] = [];
    const top = (z: number) => streetY(z) + POLE_HEIGHT;
    for (let i = 0; i < POLE_ZS.length - 1; i++) {
      const z0 = POLE_ZS[i];
      const z1 = POLE_ZS[i + 1];
      const span = Math.abs(z1 - z0);
      for (const [dx, dy, r, sag] of [
        [-0.83, -0.45, 0.025, 0.55],
        [-0.28, -0.45, 0.025, 0.55],
        [0.28, -0.45, 0.025, 0.55],
        [0.83, -0.45, 0.025, 0.55],
        [-0.63, -1.35, 0.03, 0.7],
        [0.63, -1.35, 0.03, 0.7],
        [0.25, -4.9, 0.06, 1.1],
        [-0.25, -5.6, 0.075, 1.35],
      ] as const) {
        const a = new THREE.Vector3(POLE_X + dx, top(z0) + dy, z0);
        const b = new THREE.Vector3(POLE_X + dx, top(z1) + dy, z1);
        wires.push(wire(a, b, sag * (span / 26), r));
      }
      // service drop across the street every other pole
      if (i % 2 === 0) {
        const z = z0 - 3;
        const a = new THREE.Vector3(POLE_X, top(z0) - 5.2, z0);
        const b = new THREE.Vector3(-(STREET_HALF + WALK + 3.2), streetY(z) + 5.6, z - 4);
        wires.push(wire(a, b, 0.45, 0.018, 20));
        const b2 = new THREE.Vector3(-(STREET_HALF + WALK + 3.2), streetY(z) + 5.0, z + 5);
        wires.push(wire(a, b2, 0.5, 0.016, 20));
      }
    }
    // From the top pole off-screen behind the viewer to the gaming pole
    for (const dx of [-0.83, -0.28, 0.28, 0.83]) wires.push(wire(new THREE.Vector3(POLE_X + dx, top(26) - 0.45, 26), new THREE.Vector3(POLE_X + dx, top(POLE_ZS[0]) - 0.45, POLE_ZS[0]), 0.9, 0.025));
    wires.push(wire(new THREE.Vector3(POLE_X - 0.25, top(26) - 5.6, 26), new THREE.Vector3(POLE_X - 0.25, top(POLE_ZS[0]) - 5.6, POLE_ZS[0]), 1.5, 0.075));
    const wireGeo = mergeGeometries(wires.map((w) => w.toNonIndexed()));
    const wireMesh = new THREE.Mesh(wireGeo, toonMaterial({ color: 0x2a3456, shade: 0x0b1024, ink: 12, rim: 0.5, fog: 0.6 }));
    wireMesh.frustumCulled = false;
    this.group.add(wireMesh);

    this.buildProps();
  }

  private buildProps() {
    // Vending machine on the left, turned a little toward the viewer, glowing.
    const vz = -27;
    const vy = streetY(vz) + 0.16;
    const vx = -(STREET_HALF + WALK) - 0.35;
    const vm = new THREE.Group();
    const housing = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.8), toonMaterial({ color: 0xe3eaf8, shade: 0x3b4a7c, ink: 13, rim: 0.8, lights: 0 }));
    housing.position.set(0, 0.925, 0);
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(0.92, 1.75),
      toonMaterial({
        color: 0xdfe8ff,
        shade: 0x5a6a98,
        ink: 13,
        rim: 0,
        lights: 0,
        fragment: /* glsl */ `
          vec2 p = vUv;
          // product window (upper half): three rows of cans behind glass
          float win = step(0.06, p.x) * step(p.x, 0.94) * step(0.5, p.y) * step(p.y, 0.93);
          float row = floor((p.y - 0.5) / 0.143);
          float fy = fract((p.y - 0.5) / 0.143);
          float cx = fract(p.x * 7.0);
          float can = win * step(0.2, cx) * step(cx, 0.8) * step(0.2, fy) * step(fy, 0.78);
          vec3 cc = hsv2rgb(vec3(hash11(floor(p.x * 7.0) + row * 7.0 + 3.0), 0.5, 1.0));
          float btn = win * step(0.08, fy) * step(fy, 0.14) * step(0.35, cx) * step(cx, 0.65);
          vec3 glow = vec3(0.86, 0.95, 1.0);
          emis += win * glow * 1.6 + can * cc * 1.1 + btn * vec3(0.3, 1.0, 0.6) * 1.5;
          // coin panel and the dark take-out slot
          float coin = step(0.72, p.x) * step(p.x, 0.9) * step(0.3, p.y) * step(p.y, 0.44);
          emis += coin * vec3(0.5, 0.7, 1.0) * 0.8;
          float slot = step(0.12, p.x) * step(p.x, 0.88) * step(0.06, p.y) * step(p.y, 0.2);
          base = mix(base, vec3(0.05, 0.07, 0.16), slot);
          shade = mix(shade, vec3(0.03, 0.04, 0.1), slot);`,
      }),
    );
    front.position.set(0.501, 0.925, 0);
    front.rotation.y = Math.PI / 2;
    vm.add(housing, front);
    vm.position.set(vx, vy, vz);
    vm.rotation.y = -0.25;
    this.group.add(vm);

    // Curve mirror (カーブミラー): orange post, round mirror.
    const mirror = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 8), toonMaterial({ color: 0xff8a3a, shade: 0x8a2f3c, ink: 14 }));
    post.position.y = 1.55;
    const head = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 32), toonMaterial({ color: 0xffa640, shade: 0x9c3b3a, ink: 15, rim: 1 }));
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), toonMaterial({ color: 0xff9a40, shade: 0x8a2f3c, ink: 15 }));
    back.rotation.y = Math.PI;
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.4, 32),
      toonMaterial({
        color: 0x9fc0ff,
        shade: 0x3d5c9c,
        ink: 17,
        rim: 0,
        fragment: /* glsl */ `
          // a convex mirror: a tiny, bent copy of the street's blues and a highlight
          vec2 q = vUv * 2.0 - 1.0;
          float hl = smoothstep(0.2, 0.0, length(q - vec2(-0.35, 0.4)));
          base = mix(vec3(0.25, 0.36, 0.7), vec3(0.62, 0.74, 1.0), smoothstep(-0.6, 0.8, q.y));
          shade = base * 0.7;
          emis += vec3(0.9, 0.95, 1.0) * hl * 0.8 + base * 0.15;`,
      }),
    );
    glass.position.z = 0.012;
    head.add(ring, back, glass);
    head.position.y = 3.1;
    head.rotation.y = 0.9;
    const disc = head;
    mirror.add(post, disc);
    mirror.position.set(-(STREET_HALF + WALK) + 0.25, streetY(-10) + 0.16, -10);
    this.group.add(mirror);

    // Street lamps on the left side (arm + warm head).
    const lampGeo = mergeGeometries(
      [
        (() => {
          const g = new THREE.CylinderGeometry(0.07, 0.09, 6.5, 8);
          g.translate(0, 3.25, 0);
          return g.toNonIndexed();
        })(),
        (() => {
          const g = new THREE.BoxGeometry(1.4, 0.07, 0.07);
          g.translate(0.62, 6.35, 0);
          return g.toNonIndexed();
        })(),
        (() => {
          const g = new THREE.BoxGeometry(0.45, 0.12, 0.22);
          g.translate(1.25, 6.28, 0);
          return g.toNonIndexed();
        })(),
      ].map((g) => {
        if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute("position").count * 2), 2));
        return g;
      }),
    );
    const lampZs = [-58, -112, -166, -222, -284];
    const lamps = new THREE.InstancedMesh(
      lampGeo,
      toonMaterial({
        color: 0x9fb0d8,
        shade: 0x2e3a64,
        ink: 16,
        fragment: /* glsl */ `if (vWorldNormal.y < -0.7) emis += vec3(1.0, 0.8, 0.5) * 4.0;`,
      }),
      lampZs.length,
    );
    lampZs.forEach((z, i) => {
      tmp.makeTranslation(-(STREET_HALF + WALK) + 0.2, streetY(z) + 0.16, z);
      lamps.setMatrixAt(i, tmp);
    });
    lamps.frustumCulled = false;
    this.group.add(lamps);

    // light slots: the vending machine and the three nearest lamps
    const L = this.lights.lamps;
    const C = this.lights.lampCols;
    L[0].set(vx + 1.1, vy + 1.1, vz + 0.8, 5.5);
    C[0].setRGB(0.4, 0.58, 0.85);
    lampZs.slice(0, 3).forEach((z, i) => {
      L[i + 1].set(-(STREET_HALF + WALK) + 1.45, streetY(z) + 6.0, z, 16);
      C[i + 1].setRGB(1.0, 0.72, 0.42);
    });
  }

  update() {
    // The pole's light follows the hue at the shaft's lower third.
    const t = env.uTime.value;
    this.rainbowHue = (((2.5 * 0.075 - t * 0.22) % 1) + 1) % 1;
    const c = new THREE.Color().setHSL(this.rainbowHue, 0.85, 0.6);
    this.lights.poleCol.copy(c).multiplyScalar(1.6 * (0.85 + 0.15 * Math.sin(t * 2.2)));
    this.lights.poleLight.set(this.gamingBase.x, this.gamingBase.y + 2.2, this.gamingBase.z, 15);
  }
}
