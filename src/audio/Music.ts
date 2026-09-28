import { Rng } from '../core/Rng';
import { mtof, noise, tone, type Wave } from './Synth';

/**
 * 背景音樂：程式即時編曲（和弦進行 + 固定種子產生的旋律），不需要音樂檔。
 * 標題畫面一首，地牢每 5 層一首（與樓層主題對應：地窖、墓穴、聖堂、熔岩、要塞、深淵、神殿、王座）。
 */
export type MusicId = 'title' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 16 格一小節：x = 一般、X = 重音、- = 休止 */
type Pattern = string;

export interface Song {
  name: string;
  bpm: number;
  /** 主音（MIDI） */
  root: number;
  /** 7 聲音階（相對主音的半音數） */
  scale: readonly number[];
  /** 和弦根音（音階的第幾級，0 起算） */
  progression: readonly number[];
  chordBars: number;
  seed: number;
  /** 殘響量（0～1） */
  reverb: number;
  drone?: number;
  pad?: { gain: number; wave: Wave; cutoff: number; choir?: boolean };
  bass?: { gain: number; pattern: Pattern; wave?: Wave };
  arp?: { gain: number; pattern: Pattern; wave: Wave; octave: number };
  melody?: { gain: number; style: 'bell' | 'lead'; octave: number; density: number };
  drums?: { gain: number; kick?: Pattern; taiko?: Pattern; snare?: Pattern; hat?: Pattern; tom?: Pattern };
}

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const PHRYGIAN_DOM = [0, 1, 4, 5, 7, 8, 10];
const LOCRIAN = [0, 1, 3, 5, 6, 8, 10];

export const SONGS: Record<MusicId, Song> = {
  title: {
    name: '深淵的呼喚',
    bpm: 68,
    root: 50,
    scale: AEOLIAN,
    progression: [0, 5, 2, 6],
    chordBars: 2,
    seed: 101,
    reverb: 0.55,
    drone: 0.1,
    pad: { gain: 0.05, wave: 'sawtooth', cutoff: 1100, choir: true },
    melody: { gain: 0.07, style: 'bell', octave: 1, density: 0.32 },
    drums: { gain: 0.5, taiko: 'X-------x-----x-' },
  },
  0: {
    name: '遺棄地窖',
    bpm: 64,
    root: 45,
    scale: AEOLIAN,
    progression: [0, 0, 5, 4],
    chordBars: 2,
    seed: 201,
    reverb: 0.6,
    drone: 0.09,
    pad: { gain: 0.035, wave: 'sawtooth', cutoff: 650 },
    arp: { gain: 0.025, pattern: 'x-------------x-', wave: 'triangle', octave: 2 },
    melody: { gain: 0.05, style: 'bell', octave: 1, density: 0.16 },
  },
  1: {
    name: '古老墓穴',
    bpm: 72,
    root: 50,
    scale: PHRYGIAN,
    progression: [0, 1, 0, 6],
    chordBars: 2,
    seed: 301,
    reverb: 0.55,
    drone: 0.08,
    pad: { gain: 0.045, wave: 'sawtooth', cutoff: 900, choir: true },
    bass: { gain: 0.1, pattern: 'x-------x-------' },
    melody: { gain: 0.04, style: 'lead', octave: 0, density: 0.2 },
    drums: { gain: 0.45, tom: 'x-------x---x---' },
  },
  2: {
    name: '地下聖堂',
    bpm: 80,
    root: 52,
    scale: HARMONIC,
    progression: [0, 3, 4, 0],
    chordBars: 2,
    seed: 401,
    reverb: 0.65,
    pad: { gain: 0.035, wave: 'square', cutoff: 1400 },
    bass: { gain: 0.08, pattern: 'x-------x-------' },
    arp: { gain: 0.03, pattern: 'x-x-x-x-x-x-x-x-', wave: 'triangle', octave: 1 },
    melody: { gain: 0.06, style: 'bell', octave: 1, density: 0.28 },
    drums: { gain: 0.3, kick: 'x-------x-------' },
  },
  3: {
    name: '熔岩礦坑',
    bpm: 96,
    root: 48,
    scale: PHRYGIAN_DOM,
    progression: [0, 1, 0, 6],
    chordBars: 2,
    seed: 501,
    reverb: 0.35,
    drone: 0.07,
    pad: { gain: 0.04, wave: 'sawtooth', cutoff: 850 },
    bass: { gain: 0.12, pattern: 'x--x--x-x--x--x-', wave: 'sawtooth' },
    melody: { gain: 0.045, style: 'lead', octave: 1, density: 0.3 },
    drums: { gain: 0.6, taiko: 'X--x--x-X---x-x-', hat: '--x---x---x---x-' },
  },
  4: {
    name: '破碎要塞',
    bpm: 108,
    root: 43,
    scale: AEOLIAN,
    progression: [0, 5, 6, 4],
    chordBars: 2,
    seed: 601,
    reverb: 0.35,
    pad: { gain: 0.045, wave: 'sawtooth', cutoff: 1700 },
    bass: { gain: 0.11, pattern: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth' },
    melody: { gain: 0.05, style: 'lead', octave: 1, density: 0.35 },
    drums: { gain: 0.55, kick: 'X-------X-x-----', snare: '----x--x----x-xx', hat: 'x-x-x-x-x-x-x-x-' },
  },
  5: {
    name: '深淵通道',
    bpm: 58,
    root: 47,
    scale: LOCRIAN,
    progression: [0, 4, 1, 0],
    chordBars: 2,
    seed: 701,
    reverb: 0.75,
    drone: 0.11,
    pad: { gain: 0.045, wave: 'sawtooth', cutoff: 560 },
    melody: { gain: 0.05, style: 'bell', octave: 1, density: 0.14 },
    drums: { gain: 0.45, kick: 'x---------------' },
  },
  6: {
    name: '深淵神殿',
    bpm: 112,
    root: 42,
    scale: HARMONIC,
    progression: [0, 5, 3, 4],
    chordBars: 2,
    seed: 801,
    reverb: 0.45,
    pad: { gain: 0.045, wave: 'sawtooth', cutoff: 1300, choir: true },
    bass: { gain: 0.11, pattern: 'x--x--x-x--x--x-', wave: 'sawtooth' },
    arp: { gain: 0.02, pattern: 'xxxxxxxxxxxxxxxx', wave: 'triangle', octave: 1 },
    melody: { gain: 0.05, style: 'lead', octave: 1, density: 0.4 },
    drums: { gain: 0.55, kick: 'X---x---X---x---', snare: '----X-------X---', taiko: 'X-------X-------' },
  },
  7: {
    name: '王座廳',
    bpm: 124,
    root: 48,
    scale: HARMONIC,
    progression: [0, 5, 3, 4, 0, 5, 6, 4],
    chordBars: 1,
    seed: 901,
    reverb: 0.45,
    drone: 0.07,
    pad: { gain: 0.05, wave: 'sawtooth', cutoff: 1500, choir: true },
    bass: { gain: 0.12, pattern: 'x-x-x-x-x-x-x-x-', wave: 'sawtooth' },
    arp: { gain: 0.02, pattern: 'xxxxxxxxxxxxxxxx', wave: 'square', octave: 1 },
    melody: { gain: 0.055, style: 'lead', octave: 1, density: 0.45 },
    drums: { gain: 0.6, kick: 'X-x-X--xX-x-X--x', snare: '----X-------X-xX', taiko: 'X-------X-------', hat: 'x-x-x-x-x-x-x-x-' },
  },
};

/** 音階的第 degree 級（可超過 7 = 高八度）→ MIDI */
export function scaleNote(song: Pick<Song, 'root' | 'scale'>, degree: number): number {
  const n = song.scale.length;
  const octave = Math.floor(degree / n);
  return song.root + song.scale[((degree % n) + n) % n]! + 12 * octave;
}

/** 一個循環（整個和弦進行）的旋律：每格一個音級或 null；強拍偏向和弦音，其餘以級進為主 */
export function composeMelody(song: Song, variant: number): (number | null)[] {
  const rng = new Rng(song.seed * 31 + variant);
  const density = song.melody?.density ?? 0;
  const steps = song.progression.length * song.chordBars * 16;
  const out: (number | null)[] = [];
  let degree = 7;
  let hold = 0;
  for (let s = 0; s < steps; s++) {
    if (hold > 0) {
      hold--;
      out.push(null);
      continue;
    }
    const pos = s % 16;
    const chord = song.progression[Math.floor(s / 16 / song.chordBars) % song.progression.length]!;
    const weight = pos % 8 === 0 ? 2.2 : pos % 4 === 0 ? 1.3 : pos % 2 === 0 ? 0.7 : 0.25;
    if (!rng.chance(Math.min(0.95, density * weight))) {
      out.push(null);
      continue;
    }
    if (pos % 8 === 0) {
      // 強拍：最近的和弦音
      const tones = [0, 2, 4].flatMap((i) => [chord + i, chord + i + 7, chord + i + 14]);
      degree = tones.reduce((best, t) => (Math.abs(t - degree) < Math.abs(best - degree) ? t : best), tones[0]!);
    } else {
      degree += rng.pick([-2, -1, -1, 1, 1, 2, 0]);
    }
    degree = Math.max(3, Math.min(12, degree));
    out.push(degree);
    // 長音：之後幾格不再出新音
    hold = rng.pick([0, 1, 1, 3]);
  }
  return out;
}

const LOOKAHEAD = 0.25;

export class MusicPlayer {
  private current: { id: MusicId; song: Song; bus: GainNode; send: GainNode; step: number; next: number; melodies: (number | null)[][] } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly reverb: AudioNode,
  ) {}

  get playing(): MusicId | null {
    return this.current?.id ?? null;
  }

  /** 換曲：舊曲淡出、新曲淡入 */
  play(id: MusicId, fade = 2): void {
    if (this.current?.id === id) return;
    this.fadeOutCurrent(fade);
    const song = SONGS[id];
    const t = this.ctx.currentTime;
    const bus = this.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(1, t + fade);
    bus.connect(this.out);
    const send = this.ctx.createGain();
    send.gain.value = song.reverb;
    bus.connect(send).connect(this.reverb);
    // A A B A：兩個旋律變奏
    const a = composeMelody(song, 0);
    const b = composeMelody(song, 1);
    this.current = { id, song, bus, send, step: 0, next: t + 0.1, melodies: [a, a, b, a] };
    this.timer ??= setInterval(() => this.schedule(), 50);
    this.schedule();
  }

  stop(fade = 1.5): void {
    this.fadeOutCurrent(fade);
    this.current = null;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private fadeOutCurrent(fade: number): void {
    const c = this.current;
    if (!c) return;
    const t = this.ctx.currentTime;
    c.bus.gain.cancelScheduledValues(t);
    c.bus.gain.setValueAtTime(Math.max(0.0001, c.bus.gain.value), t);
    c.bus.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    window.setTimeout(
      () => {
        c.bus.disconnect();
        c.send.disconnect();
      },
      (fade + 3) * 1000,
    );
  }

  private schedule(): void {
    const c = this.current;
    if (!c) return;
    const now = this.ctx.currentTime;
    // 分頁在背景時計時器會變慢：跳過錯過的拍子，不要一次補一大堆音
    if (c.next < now) c.next = now + 0.05;
    const stepDur = 60 / c.song.bpm / 4;
    while (c.next < now + LOOKAHEAD) {
      this.playStep(c.song, c.bus, c.step, c.next, stepDur, c.melodies);
      c.step++;
      c.next += stepDur;
    }
  }

  private playStep(song: Song, out: AudioNode, step: number, t: number, stepDur: number, melodies: (number | null)[][]): void {
    const ctx = this.ctx;
    const pos = step % 16;
    const bar = Math.floor(step / 16);
    const cycleBars = song.progression.length * song.chordBars;
    const chord = song.progression[Math.floor(bar / song.chordBars) % song.progression.length]!;
    const chordStart = pos === 0 && bar % song.chordBars === 0;
    const hit = (p: Pattern | undefined): string => p?.[pos] ?? '-';

    if (chordStart) {
      const len = song.chordBars * 16 * stepDur;
      if (song.drone) {
        const f = mtof(scaleNote(song, chord) - 24);
        tone(ctx, out, t, { type: 'sine', freq: f, dur: len + 0.8, gain: song.drone, attack: 0.8, release: 1 });
        tone(ctx, out, t, { type: 'triangle', freq: f * 2, dur: len + 0.8, gain: song.drone * 0.25, attack: 0.8, release: 1 });
      }
      if (song.pad) {
        const p = song.pad;
        for (const i of [0, 2, 4]) {
          const f = mtof(scaleNote(song, chord + i));
          for (const detune of [-7, 7]) {
            tone(ctx, out, t, { type: p.wave, freq: f, dur: len + 1.2, gain: p.gain, attack: 0.9, release: 1.2, detune, lowpass: p.cutoff, q: p.choir ? 4 : 0.7, ...(p.choir ? { vibrato: { rate: 5, depth: f * 0.006 } } : {}) });
          }
        }
      }
    }

    const b = hit(song.bass?.pattern);
    if (song.bass && b !== '-') {
      // 重音拍偶爾改彈五度
      const degree = b === 'X' || (pos === 12 && bar % 2 === 1) ? chord + 4 : chord;
      tone(ctx, out, t, { type: song.bass.wave ?? 'triangle', freq: mtof(scaleNote(song, degree) - 12), dur: stepDur * 3, gain: song.bass.gain, lowpass: 700, lowpassTo: 200, q: 2 });
    }

    const a = hit(song.arp?.pattern);
    if (song.arp && a !== '-') {
      const order = [0, 2, 4, 7, 4, 2];
      const degree = chord + order[step % order.length]!;
      tone(ctx, out, t, { type: song.arp.wave, freq: mtof(scaleNote(song, degree) + 12 * song.arp.octave), dur: stepDur * 2, gain: song.arp.gain, lowpass: 2600, lowpassTo: 800 });
    }

    if (song.melody) {
      const variant = melodies[Math.floor(bar / cycleBars) % melodies.length]!;
      const degree = variant[step % (cycleBars * 16)];
      if (degree !== null && degree !== undefined) {
        const f = mtof(scaleNote(song, degree) + 12 * song.melody.octave);
        const g = song.melody.gain;
        if (song.melody.style === 'bell') {
          tone(ctx, out, t, { type: 'sine', freq: f, dur: 2.2, gain: g });
          tone(ctx, out, t, { type: 'sine', freq: f * 2.76, dur: 0.8, gain: g * 0.25 });
        } else {
          tone(ctx, out, t, { type: 'square', freq: f, dur: stepDur * 4, gain: g * 0.6, attack: 0.03, release: stepDur * 2, lowpass: 1800, vibrato: { rate: 5.5, depth: f * 0.01 } });
          tone(ctx, out, t, { type: 'sawtooth', freq: f, dur: stepDur * 4, gain: g * 0.4, attack: 0.03, release: stepDur * 2, detune: 8, lowpass: 1400 });
        }
      }
    }

    const d = song.drums;
    if (d) {
      const accent = (c: string) => (c === 'X' ? 1 : 0.65) * d.gain;
      const k = hit(d.kick);
      if (k !== '-') tone(ctx, out, t, { type: 'sine', freq: 130, to: 42, dur: 0.3, gain: 0.5 * accent(k) });
      const tk = hit(d.taiko);
      if (tk !== '-') {
        tone(ctx, out, t, { type: 'sine', freq: 95, to: 52, dur: 0.6, gain: 0.55 * accent(tk) });
        noise(ctx, out, t, { filter: 'lowpass', freq: 600, to: 120, dur: 0.25, gain: 0.25 * accent(tk) });
      }
      const tm = hit(d.tom);
      if (tm !== '-') tone(ctx, out, t, { type: 'sine', freq: 150, to: 85, dur: 0.35, gain: 0.35 * accent(tm) });
      const s = hit(d.snare);
      if (s !== '-') {
        noise(ctx, out, t, { filter: 'bandpass', freq: 1900, q: 0.8, dur: 0.16, gain: 0.22 * accent(s) });
        tone(ctx, out, t, { type: 'triangle', freq: 210, to: 160, dur: 0.1, gain: 0.12 * accent(s) });
      }
      const h = hit(d.hat);
      if (h !== '-') noise(ctx, out, t, { filter: 'highpass', freq: 7500, dur: 0.045, gain: 0.07 * accent(h) });
    }
  }
}
