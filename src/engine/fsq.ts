import * as THREE from "three";

// One oversized triangle that covers the viewport; every full-screen pass
// (clouds, bloom, composite, transitions) draws with it.
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export const fsVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export class FullscreenPass {
  readonly mesh: THREE.Mesh;
  private readonly scene = new THREE.Scene();

  constructor(public material: THREE.ShaderMaterial) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, layer = 0) {
    renderer.setRenderTarget(target, layer);
    renderer.render(this.scene, camera);
  }
}

export function passMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, extra: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: fsVertex,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...extra,
  });
}

export function hdrTarget(w: number, h: number, opts: Partial<THREE.RenderTargetOptions> = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
    ...opts,
  });
  rt.texture.colorSpace = THREE.NoColorSpace;
  return rt;
}
