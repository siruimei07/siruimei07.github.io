// Generative night music + UI sounds, all synthesized with WebAudio (no
// audio files): koto-like plucks in the yo scale (陽音階), a soft shō-like
// drone, and the occasional wind chime (風鈴). Off until the visitor opts in.

const BPM = 60;
const BEAT = 60 / BPM;
// D yo scale: D E G A B.
const YO = [62, 64, 67, 69, 71, 74, 76, 79, 81];
const DRONES = [
  [50, 57, 62, 69],
  [48, 55, 62, 67],
  [47, 54, 62, 69],
  [45, 52, 57, 64],
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  enabled = false;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private sfx!: GainNode;
  private reverb!: ConvolverNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private nextBeat = 0;
  private beatIndex = 0;
  private timer = 0;
  private lastNote = 3;
  onBeat?: (strength: number) => void;

  private setup() {
    const ctx = new AudioContext({ latencyHint: "interactive" });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    this.reverb.connect(wet).connect(this.master);

    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = BEAT * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    const dl = ctx.createBiquadFilter();
    dl.type = "lowpass";
    dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.reverb);
    dl.connect(this.master);

    this.music = ctx.createGain();
    this.music.gain.value = 0.6;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);

    const len = ctx.sampleRate * 1.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  async enable() {
    if (!this.ctx) this.setup();
    const ctx = this.ctx!;
    await ctx.resume();
    this.enabled = true;
    const g = this.master.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setTargetAtTime(0.85, ctx.currentTime, 1.2);
    if (!this.timer) {
      this.nextBeat = ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 100);
    }
  }

  disable() {
    this.enabled = false;
    if (!this.ctx) return;
    const ctx = this.ctx;
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    window.clearInterval(this.timer);
    this.timer = 0;
    window.setTimeout(() => {
      if (!this.enabled) void ctx.suspend();
    }, 1500);
  }

  // Lookahead scheduler: queues notes ~0.3 s ahead on the audio clock.
  private schedule() {
    const ctx = this.ctx!;
    while (this.nextBeat < ctx.currentTime + 0.3) {
      const t = this.nextBeat;
      const b = this.beatIndex;
      if (b % 16 === 0) this.drone(DRONES[Math.floor(b / 16) % DRONES.length], t, BEAT * 16);
      // Sparse koto phrases: stepwise wandering with rests, like a slow improvisation.
      if (Math.random() < (b % 4 === 0 ? 0.75 : 0.4)) {
        this.lastNote = Math.max(0, Math.min(YO.length - 1, this.lastNote + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
        this.koto(mtof(YO[this.lastNote]), t + (Math.random() < 0.3 ? BEAT * 0.5 : 0), 0.07 + Math.random() * 0.04);
        if (Math.random() < 0.15) this.koto(mtof(YO[this.lastNote] - 12), t, 0.05);
      }
      if (Math.random() < 0.06) this.furin(t + Math.random() * BEAT);
      const delayMs = Math.max(0, (t - ctx.currentTime) * 1000);
      const strength = b % 4 === 0 ? 0.8 : 0.35;
      window.setTimeout(() => this.onBeat?.(strength), delayMs);
      this.beatIndex++;
      this.nextBeat += BEAT;
    }
  }

  // A pluck: bright attack that mellows as the lowpass closes, a slight
  // downward bend at the start like a plucked silk string.
  private koto(freq: number, t: number, vol: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;
    f.connect(g).connect(pan);
    pan.connect(this.music);
    pan.connect(this.delay);
    for (const [type, mult, amp] of [["triangle", 1, 1], ["sawtooth", 1, 0.25], ["sine", 2, 0.3]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq * mult * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(freq * mult, t + 0.06);
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(f);
      o.start(t);
      o.stop(t + 2.5);
    }
  }

  // Shō-like drone: stacked soft sines with slow breathing.
  private drone(chord: number[], t: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035, t + 3);
    g.gain.setValueAtTime(0.035, t + dur - 3);
    g.gain.linearRampToValueAtTime(0, t + dur + 2);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1400;
    f.connect(g).connect(this.music);
    for (const m of chord) {
      for (const det of [-4, 5]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = mtof(m);
        o.detune.value = det;
        const og = ctx.createGain();
        og.gain.value = m < 55 ? 0.6 : 0.3;
        o.connect(og).connect(f);
        o.start(t);
        o.stop(t + dur + 2.2);
      }
    }
  }

  // Wind chime: a high glassy tone with inharmonic partials.
  private furin(t: number) {
    const ctx = this.ctx!;
    const base = 1800 + Math.random() * 600;
    for (const [mult, amp] of [[1, 0.02], [2.76, 0.008], [5.4, 0.004]]) {
      const o = ctx.createOscillator();
      o.frequency.value = base * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      o.connect(g).connect(this.music);
      o.start(t);
      o.stop(t + 3.1);
    }
  }

  // ——— Sound effects ———

  private get now() {
    return this.ctx?.currentTime ?? 0;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = "sine", to?: number, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = this.now + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, type: BiquadFilterType, from: number, to: number, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = this.now + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  hover() {
    this.tone(2200, 0.06, 0.012);
  }
  click() {
    this.tone(mtof(81), 0.6, 0.04);
    this.tone(mtof(86), 0.8, 0.03, "sine", undefined, 0.08);
  }
  whoosh() {
    this.noiseHit(1.1, 0.025, "bandpass", 300, 1400);
  }
  ripple() {
    this.tone(440, 0.6, 0.06, "sine", 220);
  }
  launch() {
    this.tone(700, 1.2, 0.012, "sine", 1500);
  }
  burst(strength: number) {
    const v = Math.min(1, strength);
    this.noiseHit(1.6, 0.18 * v, "lowpass", 700, 50);
    this.tone(90, 1.4, 0.14 * v, "sine", 34);
    for (let i = 0; i < 8; i++) this.noiseHit(0.05, 0.02 * v, "highpass", 4500, 3000, 0.5 + Math.random() * 1.2);
  }
  sparkle() {
    [0, 2, 5, 7, 12].forEach((s, i) => this.tone(mtof(74 + s), 1.1, 0.03, "sine", undefined, i * 0.07));
  }
  lantern() {
    [62, 64, 67, 69, 74, 76].forEach((m, i) => this.tone(mtof(m), 1.8, 0.04, "triangle", undefined, i * 0.13));
  }
  // The dive (3.8 s): a filtered rush that rises and quickens, a low swell,
  // and glassy shimmer growing toward the light.
  dive() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(220, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 3.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.linearRampToValueAtTime(0.12, t + 3.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.4);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t);
    s.stop(t + 4.5);
    this.tone(55, 4.2, 0.1, "sine", 110);
    for (let i = 0; i < 14; i++) this.tone(1800 + Math.random() * 2400, 0.8, 0.008 + i * 0.001, "sine", undefined, 0.8 + i * 0.2);
  }
  // Surfacing at the gate: a soft bloom of bells over a warm open chord.
  arrive() {
    [62, 69, 74, 78, 81].forEach((m, i) => this.tone(mtof(m), 3.2, 0.045, "sine", undefined, i * 0.06));
    this.noiseHit(1.8, 0.04, "lowpass", 1200, 200);
  }
  // Passing through the gate: a bell struck softly (higher when entering).
  chime(entering: boolean) {
    const root = entering ? 74 : 69;
    [0, 7, 12].forEach((s, i) => this.tone(mtof(root + s), 2.8, 0.05 - i * 0.012, "sine", undefined, i * 0.02));
    this.noiseHit(1.4, 0.02, "bandpass", 2400, 900);
  }
}
