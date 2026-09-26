// GPU time per labelled pass via EXT_disjoint_timer_query_webgl2. Results
// arrive a few frames late; `times` holds a smoothed value per label and
// `total` the smoothed sum for the last complete frame. Falls back to nothing
// when the extension is missing (then Quality uses CPU frame time instead).

type Pending = { q: WebGLQuery; label: string; frame: number };

export class GpuTimer {
  readonly supported: boolean;
  readonly times = new Map<string, number>();
  total = 0;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: Pending[] = [];
  private pool: WebGLQuery[] = [];
  private active: Pending | null = null;
  private frame = 0;
  private frameSums = new Map<number, number>();

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.supported = !!this.ext;
  }

  beginFrame() {
    this.frame++;
    this.poll();
  }

  begin(label: string) {
    if (!this.ext || this.active) return;
    const q = this.pool.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = { q, label, frame: this.frame };
  }

  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  private poll() {
    if (!this.ext) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let lastDoneFrame = -1;
    while (this.pending.length) {
      const p = this.pending[0];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!disjoint) {
        const ms = gl.getQueryParameter(p.q, gl.QUERY_RESULT) / 1e6;
        const prev = this.times.get(p.label);
        this.times.set(p.label, prev === undefined ? ms : prev * 0.9 + ms * 0.1);
        this.frameSums.set(p.frame, (this.frameSums.get(p.frame) ?? 0) + ms);
        lastDoneFrame = p.frame;
      }
      this.pool.push(p.q);
    }
    if (lastDoneFrame >= 0) {
      // A frame is complete once a later frame has started reporting.
      for (const [f, sum] of this.frameSums) {
        if (f < lastDoneFrame) {
          this.total = this.total === 0 ? sum : this.total * 0.9 + sum * 0.1;
          this.lastFrameMs = sum;
          this.frameSums.delete(f);
        }
      }
    }
    if (this.pending.length > 64) this.pending.splice(0, this.pending.length - 64);
  }

  lastFrameMs = 0;
}
