/**
 * Web Audio 合成的基本零件：振盪器、雜訊、濾波、包絡。
 * 所有音效與音樂都由程式即時合成，不需要音效檔（可攜版仍是單一 HTML）。
 */

export type Wave = OscillatorType;

export interface ToneOptions {
  type?: Wave;
  /** 起始頻率（Hz） */
  freq: number;
  /** 結束頻率（滑音；省略 = 不變） */
  to?: number;
  /** 長度（秒，含釋放） */
  dur: number;
  gain?: number;
  attack?: number;
  /** 0 = 從頭衰減到尾；> 0 = 維持到 dur - release 才釋放 */
  release?: number;
  detune?: number;
  /** 低通濾波（可滑動） */
  lowpass?: number;
  lowpassTo?: number;
  q?: number;
  /** 頻率顫音：{ rate Hz, depth Hz } */
  vibrato?: { rate: number; depth: number };
}

export interface NoiseOptions {
  dur: number;
  gain?: number;
  attack?: number;
  release?: number;
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
}

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 秒白雜訊（每個 AudioContext 共用一份） */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // 雜訊不影響遊戲結果，用簡單 LCG 即可（不需要 core/Rng 的可重現性，但也保持可重現）
    let s = 12345;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = (s / 4294967296) * 2 - 1;
    }
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

/** 包絡：attack 上升、維持、最後 release 秒指數衰減到無聲 */
function envelope(param: AudioParam, t: number, peak: number, dur: number, attack: number, release: number): void {
  const a = Math.max(0.002, attack);
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  if (release > 0 && dur - release > a) param.setValueAtTime(Math.max(0.0002, peak), t + dur - release);
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

export function tone(ctx: BaseAudioContext, out: AudioNode, t: number, o: ToneOptions): void {
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  const g = ctx.createGain();
  envelope(g.gain, t, o.gain ?? 0.3, o.dur, o.attack ?? 0.005, o.release ?? 0);
  let node: AudioNode = osc;
  if (o.lowpass !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = o.q ?? 0.8;
    f.frequency.setValueAtTime(o.lowpass, t);
    if (o.lowpassTo !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.lowpassTo), t + o.dur);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  let lfo: OscillatorNode | null = null;
  if (o.vibrato) {
    lfo = ctx.createOscillator();
    lfo.frequency.value = o.vibrato.rate;
    const depth = ctx.createGain();
    depth.gain.value = o.vibrato.depth;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + o.dur + 0.05);
  }
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
}

export function noise(ctx: BaseAudioContext, out: AudioNode, t: number, o: NoiseOptions): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  const g = ctx.createGain();
  envelope(g.gain, t, o.gain ?? 0.3, o.dur, o.attack ?? 0.003, o.release ?? 0);
  let node: AudioNode = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq ?? 1000, t);
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + o.dur);
    node.connect(f);
    node = f;
  }
  node.connect(g).connect(out);
  // 每次從雜訊的不同位置開始，連續播放時不會聽起來一模一樣
  src.start(t, (t * 7.31) % 1.5);
  src.stop(t + o.dur + 0.05);
}

/** 殘響用的脈衝響應：隨時間衰減的雜訊（地牢石室的回音） */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  let s = 987654;
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = ((s / 4294967296) * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
}

/** MIDI 音高 → 頻率 */
export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
