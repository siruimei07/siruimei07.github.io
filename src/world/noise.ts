import * as THREE from "three";

// Tileable gradient noise at four frequencies packed into RGBA. Built once on
// the CPU (~20 ms) so shaders get multi-octave noise for a single fetch.
export function createNoiseTexture(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const periods = [4, 8, 16, 32];
  const grads = periods.map((p) => {
    const g = new Float32Array(p * p * 2);
    for (let i = 0; i < p * p; i++) {
      const a = rand(i * 7.13 + p * 131.7) * Math.PI * 2;
      g[i * 2] = Math.cos(a);
      g[i * 2 + 1] = Math.sin(a);
    }
    return g;
  });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (let c = 0; c < 4; c++) {
        const p = periods[c];
        const g = grads[c];
        const fx = (x / size) * p;
        const fy = (y / size) * p;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const dot = (ix: number, iy: number, dx: number, dy: number) => {
          const i = ((iy % p) * p + (ix % p)) * 2;
          return g[i] * dx + g[i + 1] * dy;
        };
        const n00 = dot(x0, y0, tx, ty);
        const n10 = dot(x0 + 1, y0, tx - 1, ty);
        const n01 = dot(x0, y0 + 1, tx, ty - 1);
        const n11 = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
        const u = fade(tx);
        const v = fade(ty);
        const n = lerp(lerp(n00, n10, u), lerp(n01, n11, u), v);
        data[(y * size + x) * 4 + c] = Math.max(0, Math.min(255, Math.round((n * 0.72 + 0.5) * 255)));
      }
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function rand(n: number) {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
}

// Deterministic PRNG for scene layout, so the world looks the same every load.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
