import * as THREE from "three";
import { toonMaterial } from "../../engine/toon";
import { STREET_HALF, STREET_Z, streetY, TERRACE_Y, TERRACE_Z } from "./layout";

// The ground: hexagonal paving stones on the climbing street (as in the
// film), pale gravel on the temple terrace, warm pools of lantern light under
// the eaves and a scatter of sakura petals.

export function buildGround(): THREE.Object3D {
  // rows along z: flat behind the viewer, the climb, the step up, the terrace
  const zs = [900, 60, STREET_Z[1], STREET_Z[1] - 0.01, TERRACE_Z, -1500];
  const ys = [streetY(60), streetY(60), streetY(STREET_Z[1]), streetY(STREET_Z[1]), TERRACE_Y, TERRACE_Y];
  const X = 1500;
  const pos: number[] = [];
  const idx: number[] = [];
  zs.forEach((z, i) => {
    pos.push(-X, ys[i], z, X, ys[i], z);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = toonMaterial({
    color: 0x6c6878,
    shade: 0x1c1c30,
    ink: 2,
    rim: 0.2,
    step: 0.0,
    fog: 1.0,
    fragment: /* glsl */ `
      vec2 p = vWorldPos.xz;
      float street = step(abs(p.x), ${STREET_HALF.toFixed(2)} + 0.3) * step(${STREET_Z[1].toFixed(2)}, p.y);
      float terrace = step(p.y, ${TERRACE_Z.toFixed(2)} + 0.01);
      // hex stones: distance to the nearest hex centre
      vec2 s = p / 0.62;
      vec2 r = vec2(1.0, 1.7320508);
      vec2 h = r * 0.5;
      vec2 a = mod(s, r) - h;
      vec2 b = mod(s - h, r) - h;
      vec2 gv = dot(a, a) < dot(b, b) ? a : b;
      vec2 id = s - gv;
      vec2 q = abs(gv);
      float hexd = max(dot(q, normalize(r)), q.x);
      float joint = smoothstep(0.43, 0.48, hexd);
      float px = fwidth(s.x);
      joint *= smoothstep(0.6, 0.25, px);
      float tone = hash12(floor(id * 10.0));
      vec3 stone = mix(vec3(0.06, 0.05, 0.07), vec3(0.1, 0.07, 0.08), tone);
      vec3 earth = vec3(0.03, 0.025, 0.03);
      vec3 gravel = vec3(0.16, 0.16, 0.2) * (0.9 + 0.2 * hash12(floor(p * 9.0)));
      vec3 c = mix(earth, stone, street);
      c = mix(c, c * 0.35, joint * street);
      c = mix(c, gravel, terrace);
      // warm pools under the eaves and lantern ropes
      float edge = smoothstep(${STREET_HALF.toFixed(2)} + 0.6, ${STREET_HALF.toFixed(2)} - 2.4, abs(p.x));
      float pool = (1.0 - edge) * 0.6 + 0.4 * (0.5 + 0.5 * sin(p.y * 0.72));
      // scattered petals
      float pet = step(0.93, hash12(floor(p * 7.0))) * step(0.55, vnoise(p * 0.3));
      c = mix(c, vec3(1.0, 0.5, 0.65), pet * 0.8);
      base = c; shade = c * 0.55;
      float camDist = length(p - cameraPosition.xz);
      emis += vec3(1.0, 0.52, 0.24) * c * pool * 0.9 * exp(-camDist / 90.0);`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return mesh;
}
