import * as THREE from "three";

// P3R's "confetti": sharp little polygons in pink, red, cyan and white,
// additively blended over the finished frame (they skip the sea grade).
// A few always drift; bursts spray from a point on transitions.

type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; life: number; max: number; col: THREE.Color; burst: boolean };

// Display-space colours: this pass writes straight to the screen, so the hex
// values go in as-is (no sRGB → linear conversion).
const COLS = [0xff4fa8, 0xff2346, 0x5ad7ff, 0xffffff, 0xff7ac8].map((c) =>
  new THREE.Color().setRGB(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255, THREE.LinearSRGBColorSpace),
);

export class Confetti {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mesh: THREE.InstancedMesh;
  private bits: Bit[] = [];
  private aspect = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  /** 0..1, how many ambient bits drift (menu = 1, title = 0). */
  ambient = 0;
  private readonly max: number;

  constructor(max = 140) {
    this.max = max;
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([0, 1, 0, -0.62, -0.7, 0, 0.9, -0.45, 0], 3));
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(tri, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
    this.camera.left = -this.aspect;
    this.camera.right = this.aspect;
    this.camera.updateProjectionMatrix();
  }

  private spawn(burst: boolean, x = 0, y = 0) {
    if (this.bits.length >= this.max) return;
    const a = Math.random() * Math.PI * 2;
    const sp = burst ? 0.9 + Math.random() * 1.8 : 0.04 + Math.random() * 0.06;
    this.bits.push({
      x: burst ? x : (Math.random() * 2 - 1) * this.aspect,
      y: burst ? y : -1.1 - Math.random() * 0.2,
      vx: burst ? Math.cos(a) * sp : (Math.random() - 0.5) * 0.05,
      vy: burst ? Math.sin(a) * sp : sp,
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * (burst ? 14 : 2.5),
      s: burst ? 0.012 + Math.random() * 0.028 : 0.008 + Math.random() * 0.02,
      life: 0,
      max: burst ? 0.7 + Math.random() * 0.6 : 9 + Math.random() * 8,
      col: COLS[Math.floor(Math.random() * COLS.length)],
      burst,
    });
  }

  /** Spray from a point given in CSS pixels. */
  burst(px: number, py: number, n = 36) {
    const x = (px / innerWidth) * 2 * this.aspect - this.aspect;
    const y = 1 - (py / innerHeight) * 2;
    for (let i = 0; i < n; i++) this.spawn(true, x, y);
  }

  update(dt: number) {
    const ambientTarget = Math.round(34 * this.ambient);
    const ambientNow = this.bits.filter((b) => !b.burst).length;
    if (ambientNow < ambientTarget && Math.random() < dt * 6) this.spawn(false);
    let k = 0;
    const c = new THREE.Color();
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life += dt;
      if (b.life > b.max || (!b.burst && b.y > 1.2) || (!b.burst && this.ambient === 0 && b.life > 0.8)) {
        this.bits.splice(i, 1);
        continue;
      }
      const drag = b.burst ? Math.exp(-dt * 3.2) : 1;
      b.vx *= drag;
      b.vy = b.vy * drag - (b.burst ? dt * 0.8 : 0);
      b.x += b.vx * dt + (b.burst ? 0 : Math.sin(b.life * 0.9 + b.rot) * dt * 0.02);
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      const fade = b.burst ? 1 - b.life / b.max : Math.min(1, b.life / 1.2) * Math.min(1, (b.max - b.life) / 1.5);
      this.e.set(b.rot * 0.7, b.rot * 0.4, b.rot);
      this.q.setFromEuler(this.e);
      this.m.compose(new THREE.Vector3(b.x, b.y, 0), this.q, new THREE.Vector3(b.s, b.s, b.s));
      this.mesh.setMatrixAt(k, this.m);
      c.copy(b.col).multiplyScalar(0.85 * fade);
      this.mesh.setColorAt(k, c);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
