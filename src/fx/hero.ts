import * as THREE from "three";

// Yachiyo walking through eight thousand years: the film's letterboxed walk
// (colour stacked over the alpha of her umbrella and feet where they break
// out of the band), played as a texture for the composite pass. Reduced
// motion (or a blocked autoplay) shows the still poster instead.

/** Width / height of one video frame (the crop around her). */
export const HERO_ASPECT = 1320 / 1080;
/** Her centre across the frame (u). */
const ANCHOR_U = 0.545;

export type HeroPose = {
  /** Centre of her figure, CSS px from the top-left. */
  x: number;
  y: number;
  /** Height of the whole frame (band + bars), CSS px. */
  h: number;
  /** Degrees, positive = counter-clockwise (rising to the right). */
  rot: number;
};

/** Where the band sits behind the menu (CSS px). */
export function heroMenuPose(w: number, h: number): HeroPose {
  if (w < h) return { x: w * 0.5, y: h * 0.25, h: Math.min(h * 0.36, w * 0.92), rot: 3 };
  return { x: w * 0.19, y: h * 0.5, h: h * 0.72, rot: 4 };
}

export class Hero {
  readonly video: HTMLVideoElement;
  texture: THREE.Texture | null = null;
  private videoTex: THREE.VideoTexture;
  private poster: THREE.Texture | null = null;
  private lastTime = 0;
  private playing = false;
  /** 1 right after the loop wraps, decays to 0. */
  seam = 0;

  constructor(private reduced: boolean) {
    const v = document.createElement("video");
    v.src = "/assets/yachiyo-walk.mp4";
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.setAttribute("muted", "");
    v.setAttribute("playsinline", "");
    v.setAttribute("aria-hidden", "true");
    this.video = v;
    this.videoTex = new THREE.VideoTexture(v);
    this.videoTex.colorSpace = THREE.NoColorSpace;
    this.videoTex.minFilter = THREE.LinearFilter;
    this.videoTex.magFilter = THREE.LinearFilter;
    this.videoTex.generateMipmaps = false;
  }

  async load() {
    this.poster = await new THREE.TextureLoader().loadAsync("/assets/yachiyo-walk.webp").catch(() => null);
    if (this.poster) {
      this.poster.colorSpace = THREE.NoColorSpace;
      this.poster.generateMipmaps = false;
      this.poster.minFilter = THREE.LinearFilter;
    }
    this.texture = this.poster;
  }

  setReduced(r: boolean) {
    this.reduced = r;
    if (r) this.pause();
  }

  /** Start the walk (or keep the poster when motion is reduced). */
  play() {
    if (this.reduced) {
      this.texture = this.poster;
      return;
    }
    if (this.playing) return;
    this.playing = true;
    this.video
      .play()
      .then(() => {
        if (this.playing) this.texture = this.videoTex;
      })
      .catch(() => {
        this.playing = false;
        this.texture = this.poster;
      });
  }

  pause() {
    this.playing = false;
    this.video.pause();
  }

  update(dt: number) {
    const t = this.video.currentTime;
    if (this.playing && t + 0.25 < this.lastTime) this.seam = 1;
    this.lastTime = t;
    this.seam = Math.max(0, this.seam - dt * 3.2);
  }

  /** Inverse affine (GL render pixels → frame uv) for a pose, and the border sizes in uv. */
  static place(p: HeroPose, pxScale: number, heightPx: number, out: THREE.Matrix3, border: THREE.Vector2, borderCss = 9) {
    const H = p.h * pxScale;
    const W = H * HERO_ASPECT;
    const cx = p.x * pxScale;
    const cy = heightPx - p.y * pxScale; // GL y is up
    const a = THREE.MathUtils.degToRad(p.rot);
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.set(c / W, s / W, -(c * cx + s * cy) / W + ANCHOR_U, -s / H, c / H, (s * cx - c * cy) / H + 0.5, 0, 0, 1);
    border.set((borderCss * pxScale) / H, (borderCss * pxScale) / W);
  }
}
