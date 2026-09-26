// GPU pass timing via EXT_disjoint_timer_query_webgl2. Results arrive a few
// frames late and are smoothed. When the extension is missing, `available`
// is false and every call is a no-op.

type Pending = { query: WebGLQuery; label: string };

export class GpuTimer {
  available: boolean;
  times = new Map<string, number>();
  frameMs = 0;
  private gl: WebGL2RenderingContext;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: Pending[] = [];
  private active: Pending | null = null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    this.available = !!this.ext;
  }

  begin(label: string) {
    if (!this.ext || this.active || this.pending.length > 24) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = { query, label };
  }

  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  // Collects finished queries; call once per frame.
  poll() {
    if (!this.ext) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let done = 0;
    for (const p of this.pending) {
      if (!gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) {
        const ms = gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6;
        const prev = this.times.get(p.label) ?? ms;
        this.times.set(p.label, prev + (ms - prev) * 0.1);
      }
      gl.deleteQuery(p.query);
      done++;
    }
    if (done) this.pending.splice(0, done);
    let total = 0;
    for (const v of this.times.values()) total += v;
    this.frameMs = total;
  }
}
