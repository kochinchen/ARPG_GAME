import { noise, tone, type NoiseOptions, type ToneOptions } from './Synth';

/**
 * 音效配方：每一種音效是一段合成指令。
 * rate 會乘在所有頻率上（Boss 越大隻吼聲越低；每次播放小幅變化，避免連續出招聽起來一模一樣）。
 */
export interface Voice {
  tone(o: ToneOptions, at?: number): void;
  noise(o: NoiseOptions, at?: number): void;
}

interface Recipe {
  /** 整段音效的長度（秒）：之後釋放節點 */
  dur: number;
  play(v: Voice): void;
}

/** 金屬撞擊：幾個不成整數倍的泛音一起衰減 */
function clang(v: Voice, base: number, dur: number, gain: number, at = 0): void {
  for (const [ratio, g] of [
    [1, 1],
    [2.76, 0.6],
    [5.4, 0.35],
    [8.93, 0.2],
  ] as const) {
    v.tone({ type: 'sine', freq: base * ratio, dur: dur / Math.sqrt(ratio), gain: gain * g, attack: 0.001 }, at);
  }
}

/** 揮動的破風聲 */
function whoosh(v: Voice, from: number, to: number, dur: number, gain: number, at = 0): void {
  v.noise({ filter: 'bandpass', freq: from, to, q: 1.4, dur, gain, attack: dur * 0.35 }, at);
}

function boom(v: Voice, gain: number, dur: number, at = 0): void {
  v.tone({ type: 'sine', freq: 110, to: 32, dur, gain, attack: 0.004 }, at);
  v.noise({ filter: 'lowpass', freq: 2400, to: 120, q: 0.7, dur: dur * 1.2, gain: gain * 0.9 }, at);
}

function sparkle(v: Voice, notes: readonly number[], step: number, gain: number, at = 0): void {
  notes.forEach((f, i) => v.tone({ type: 'sine', freq: f, dur: 0.35, gain, attack: 0.002 }, at + i * step));
}

/** 野獸的吼聲：低頻鋸齒波 + 顫音 + 喉音共鳴（帶通）+ 氣音 */
function roar(v: Voice, dur: number, gain: number, falling: boolean): void {
  const end = falling ? 0.45 : 0.8;
  for (const [freq, detune] of [
    [62, 0],
    [93, 12],
    [124, -9],
  ] as const) {
    v.tone({ type: 'sawtooth', freq, to: freq * end, dur, gain: gain * 0.5, attack: 0.18, release: dur * 0.5, detune, lowpass: 380, lowpassTo: 1400, q: 3, vibrato: { rate: 23, depth: freq * 0.08 } });
  }
  v.noise({ filter: 'bandpass', freq: 520, to: falling ? 180 : 900, q: 2.2, dur, gain: gain * 0.9, attack: 0.15, release: dur * 0.5 });
  v.noise({ filter: 'lowpass', freq: 240, to: 90, q: 1, dur: dur * 0.9, gain: gain * 0.7, attack: 0.25 });
}

const RECIPES = {
  // ── 近戰 ──
  swing: {
    dur: 0.24,
    play: (v) => {
      whoosh(v, 700, 2800, 0.2, 0.75);
      v.tone({ type: 'triangle', freq: 1900, to: 1500, dur: 0.12, gain: 0.03 }, 0.07);
    },
  },
  swingQuick: {
    dur: 0.16,
    play: (v) => {
      whoosh(v, 1200, 4200, 0.13, 0.7);
      v.tone({ type: 'triangle', freq: 2600, to: 2200, dur: 0.08, gain: 0.025 }, 0.05);
    },
  },
  swingHeavy: {
    dur: 0.4,
    play: (v) => {
      whoosh(v, 260, 1500, 0.32, 0.6);
      v.tone({ type: 'sine', freq: 140, to: 60, dur: 0.22, gain: 0.25 }, 0.14);
    },
  },
  slam: {
    dur: 0.6,
    play: (v) => {
      boom(v, 0.5, 0.45);
      v.noise({ filter: 'bandpass', freq: 1800, to: 400, q: 0.9, dur: 0.18, gain: 0.25 });
      clang(v, 190, 0.35, 0.05);
    },
  },
  quake: {
    dur: 1.1,
    play: (v) => {
      boom(v, 0.45, 0.5);
      v.noise({ filter: 'lowpass', freq: 380, to: 60, q: 1.2, dur: 1.05, gain: 0.45, attack: 0.03 });
      v.tone({ type: 'sine', freq: 48, to: 30, dur: 0.9, gain: 0.3, attack: 0.05 });
      v.noise({ filter: 'bandpass', freq: 900, q: 0.7, dur: 0.5, gain: 0.08 }, 0.12);
    },
  },
  dash: {
    dur: 0.32,
    play: (v) => {
      whoosh(v, 350, 2200, 0.28, 0.85);
      v.tone({ type: 'sine', freq: 90, to: 160, dur: 0.2, gain: 0.08 });
    },
  },
  parry: {
    dur: 0.7,
    play: (v) => {
      clang(v, 640, 0.7, 0.12);
      v.noise({ filter: 'highpass', freq: 3000, dur: 0.05, gain: 0.25 });
    },
  },
  // ── 弓箭 ──
  bow: {
    dur: 0.3,
    play: (v) => {
      v.tone({ type: 'triangle', freq: 230, to: 150, dur: 0.14, gain: 0.22, lowpass: 1800 });
      v.noise({ filter: 'highpass', freq: 2500, dur: 0.02, gain: 0.2 });
      v.noise({ filter: 'bandpass', freq: 3200, to: 1800, q: 3, dur: 0.22, gain: 0.08, attack: 0.03 }, 0.02);
    },
  },
  bowHeavy: {
    dur: 0.5,
    play: (v) => {
      v.tone({ type: 'triangle', freq: 160, to: 95, dur: 0.22, gain: 0.3, lowpass: 1400 });
      v.noise({ filter: 'highpass', freq: 2000, dur: 0.03, gain: 0.25 });
      v.noise({ filter: 'bandpass', freq: 2400, to: 900, q: 2, dur: 0.4, gain: 0.16, attack: 0.02 }, 0.02);
      v.tone({ type: 'sine', freq: 70, to: 45, dur: 0.18, gain: 0.15 });
    },
  },
  bowMulti: {
    dur: 0.45,
    play: (v) => {
      for (let i = 0; i < 3; i++) {
        v.tone({ type: 'triangle', freq: 240 - i * 25, to: 150, dur: 0.12, gain: 0.15, lowpass: 1800 }, i * 0.035);
        v.noise({ filter: 'bandpass', freq: 3400 - i * 300, to: 1800, q: 3, dur: 0.2, gain: 0.06, attack: 0.03 }, i * 0.035 + 0.02);
      }
    },
  },
  arrowRain: {
    dur: 1.1,
    play: (v) => {
      for (let i = 0; i < 7; i++) {
        const f = 2800 + ((i * 373) % 900);
        v.tone({ type: 'sine', freq: f, to: f * 0.55, dur: 0.35, gain: 0.07, attack: 0.08 }, i * 0.09);
        v.noise({ filter: 'lowpass', freq: 900, to: 300, dur: 0.07, gain: 0.22 }, i * 0.09 + 0.33);
      }
    },
  },
  // ── 火 ──
  fireCast: {
    dur: 0.6,
    play: (v) => {
      v.noise({ filter: 'bandpass', freq: 250, to: 1400, q: 0.8, dur: 0.5, gain: 0.55, attack: 0.25 });
      v.tone({ type: 'sawtooth', freq: 70, to: 110, dur: 0.5, gain: 0.05, attack: 0.2, lowpass: 400 });
    },
  },
  fireBolt: {
    dur: 0.5,
    play: (v) => {
      v.noise({ filter: 'bandpass', freq: 500, to: 1800, q: 0.9, dur: 0.4, gain: 0.32, attack: 0.03 });
      v.noise({ filter: 'highpass', freq: 4000, dur: 0.3, gain: 0.05 }, 0.05);
      v.tone({ type: 'sine', freq: 180, to: 90, dur: 0.25, gain: 0.1 });
    },
  },
  fireBurst: {
    dur: 1,
    play: (v) => {
      boom(v, 0.45, 0.6);
      v.noise({ filter: 'bandpass', freq: 1200, to: 300, q: 0.6, dur: 0.9, gain: 0.25, attack: 0.01 });
      for (let i = 0; i < 5; i++) v.noise({ filter: 'highpass', freq: 3000, dur: 0.02, gain: 0.12 }, 0.1 + i * 0.11);
    },
  },
  // ── 冰 ──
  coldCast: {
    dur: 0.7,
    play: (v) => {
      sparkle(v, [1760, 2349, 2093, 2794], 0.06, 0.04);
      v.noise({ filter: 'highpass', freq: 5000, dur: 0.5, gain: 0.06, attack: 0.2 });
    },
  },
  coldBolt: {
    dur: 0.55,
    play: (v) => {
      v.noise({ filter: 'bandpass', freq: 5000, to: 2500, q: 1.5, dur: 0.35, gain: 0.14, attack: 0.02 });
      sparkle(v, [2637, 3136], 0.05, 0.035);
      v.tone({ type: 'sine', freq: 900, to: 500, dur: 0.2, gain: 0.05 });
    },
  },
  coldBurst: {
    dur: 1,
    play: (v) => {
      v.noise({ filter: 'highpass', freq: 2500, dur: 0.12, gain: 0.35 });
      v.tone({ type: 'sine', freq: 120, to: 50, dur: 0.3, gain: 0.25 });
      sparkle(v, [3136, 2349, 3520, 2637, 4186, 2093], 0.035, 0.05, 0.03);
      v.noise({ filter: 'bandpass', freq: 6000, to: 3000, q: 2, dur: 0.8, gain: 0.07, attack: 0.02 }, 0.05);
    },
  },
  // ── 雷 ──
  lightningCast: {
    dur: 0.5,
    play: (v) => {
      v.tone({ type: 'sawtooth', freq: 60, to: 240, dur: 0.45, gain: 0.08, attack: 0.3, lowpass: 2500, vibrato: { rate: 40, depth: 25 } });
      v.noise({ filter: 'highpass', freq: 6000, dur: 0.4, gain: 0.05, attack: 0.3 });
    },
  },
  zap: {
    dur: 0.35,
    play: (v) => {
      v.tone({ type: 'square', freq: 1400, to: 220, dur: 0.18, gain: 0.08, lowpass: 5000, vibrato: { rate: 90, depth: 400 } });
      v.noise({ filter: 'highpass', freq: 3500, dur: 0.2, gain: 0.18 });
      v.tone({ type: 'sawtooth', freq: 3000, to: 900, dur: 0.1, gain: 0.04 }, 0.08);
    },
  },
  thunder: {
    dur: 1.6,
    play: (v) => {
      v.noise({ filter: 'highpass', freq: 1800, dur: 0.1, gain: 0.45 });
      v.tone({ type: 'square', freq: 2000, to: 300, dur: 0.1, gain: 0.06, vibrato: { rate: 120, depth: 600 } });
      v.noise({ filter: 'lowpass', freq: 700, to: 70, q: 0.8, dur: 1.5, gain: 0.45, attack: 0.04, release: 1.2 }, 0.03);
      v.tone({ type: 'sine', freq: 60, to: 35, dur: 0.8, gain: 0.25 }, 0.02);
    },
  },
  // ── 毒 ──
  poisonCast: {
    dur: 0.55,
    play: (v) => {
      v.tone({ type: 'sine', freq: 300, to: 500, dur: 0.4, gain: 0.14, vibrato: { rate: 18, depth: 90 } });
      v.noise({ filter: 'bandpass', freq: 700, q: 3, dur: 0.45, gain: 0.3, attack: 0.1 });
    },
  },
  poisonBolt: {
    dur: 0.45,
    play: (v) => {
      v.noise({ filter: 'lowpass', freq: 1400, to: 400, dur: 0.18, gain: 0.3 });
      v.tone({ type: 'sine', freq: 420, to: 220, dur: 0.22, gain: 0.1, vibrato: { rate: 25, depth: 60 } }, 0.02);
      v.tone({ type: 'sine', freq: 700, to: 900, dur: 0.08, gain: 0.05 }, 0.15);
    },
  },
  poisonBurst: {
    dur: 1,
    play: (v) => {
      v.noise({ filter: 'bandpass', freq: 2200, to: 1200, q: 1.2, dur: 0.9, gain: 0.4, attack: 0.02, release: 0.6 });
      v.noise({ filter: 'lowpass', freq: 900, to: 200, dur: 0.25, gain: 0.3 });
      for (let i = 0; i < 5; i++) v.tone({ type: 'sine', freq: 380 + i * 70, to: 700 + i * 90, dur: 0.07, gain: 0.05 }, 0.12 + i * 0.12);
    },
  },
  arcaneBolt: {
    dur: 0.45,
    play: (v) => {
      v.tone({ type: 'sine', freq: 600, to: 1200, dur: 0.25, gain: 0.14, vibrato: { rate: 12, depth: 40 } });
      v.noise({ filter: 'bandpass', freq: 1500, to: 800, q: 2, dur: 0.3, gain: 0.28 });
    },
  },
  summon: {
    dur: 1.4,
    play: (v) => {
      for (const f of [110, 131, 156]) v.tone({ type: 'sawtooth', freq: f, to: f * 1.05, dur: 1.2, gain: 0.07, attack: 0.5, release: 0.5, lowpass: 300, lowpassTo: 1600 });
      v.noise({ filter: 'bandpass', freq: 300, to: 1600, q: 1.5, dur: 1, gain: 0.18, attack: 0.8 });
      boom(v, 0.2, 0.4, 0.95);
    },
  },
  // ── 命中 ──
  hit: {
    dur: 0.16,
    play: (v) => {
      v.noise({ filter: 'lowpass', freq: 1600, to: 300, dur: 0.08, gain: 0.25 });
      v.tone({ type: 'sine', freq: 160, to: 70, dur: 0.1, gain: 0.18 });
    },
  },
  crit: {
    dur: 0.35,
    play: (v) => {
      v.noise({ filter: 'lowpass', freq: 2600, to: 400, dur: 0.1, gain: 0.3 });
      v.tone({ type: 'sine', freq: 190, to: 60, dur: 0.14, gain: 0.25 });
      clang(v, 1250, 0.3, 0.035, 0.005);
    },
  },
  playerHurt: {
    dur: 0.3,
    play: (v) => {
      v.noise({ filter: 'lowpass', freq: 900, to: 200, dur: 0.12, gain: 0.3 });
      v.tone({ type: 'sine', freq: 110, to: 55, dur: 0.18, gain: 0.25 });
      v.tone({ type: 'sawtooth', freq: 330, to: 240, dur: 0.16, gain: 0.03, lowpass: 900 }, 0.01);
    },
  },
  // ── 角色 / 物品 ──
  levelUp: {
    dur: 2,
    play: (v) => {
      // C 大調上行琶音 + 最後的和弦
      sparkle(v, [523, 659, 784, 1047, 1319], 0.09, 0.08);
      for (const f of [523, 659, 784, 1047]) v.tone({ type: 'triangle', freq: f, dur: 1.4, gain: 0.06, attack: 0.02, release: 1 }, 0.45);
      v.noise({ filter: 'highpass', freq: 6000, dur: 1.2, gain: 0.05, attack: 0.3, release: 0.8 }, 0.3);
      v.tone({ type: 'sine', freq: 131, dur: 1.2, gain: 0.12, attack: 0.05, release: 0.9 }, 0.45);
    },
  },
  equip: {
    dur: 0.4,
    play: (v) => {
      clang(v, 820, 0.3, 0.06);
      clang(v, 1180, 0.25, 0.05, 0.07);
      v.noise({ filter: 'bandpass', freq: 2000, q: 1, dur: 0.1, gain: 0.12 });
    },
  },
  unequip: {
    dur: 0.35,
    play: (v) => {
      v.noise({ filter: 'bandpass', freq: 2500, to: 900, q: 1.2, dur: 0.15, gain: 0.3 });
      clang(v, 700, 0.22, 0.045, 0.05);
    },
  },
  coins: {
    dur: 0.6,
    play: (v) => {
      [0, 0.05, 0.11, 0.18].forEach((at, i) => clang(v, 2100 + i * 260, 0.25, 0.035, at));
      v.noise({ filter: 'highpass', freq: 5000, dur: 0.25, gain: 0.06 });
    },
  },
  ascend: {
    dur: 1.4,
    play: (v) => {
      sparkle(v, [784, 988, 1175, 1568, 1976], 0.07, 0.06);
      v.tone({ type: 'sawtooth', freq: 200, to: 800, dur: 0.8, gain: 0.05, attack: 0.3, lowpass: 1500 });
      clang(v, 1047, 0.9, 0.05, 0.4);
    },
  },
  drop: {
    dur: 0.3,
    play: (v) => {
      v.tone({ type: 'sine', freq: 190, to: 70, dur: 0.14, gain: 0.3 });
      v.noise({ filter: 'lowpass', freq: 1200, to: 250, dur: 0.1, gain: 0.25 });
      clang(v, 540, 0.15, 0.03, 0.02);
    },
  },
  salvage: {
    dur: 1.1,
    play: (v) => {
      // 敲碎（金屬 + 碎裂）→ 精華升起的光點
      clang(v, 380, 0.3, 0.07);
      v.noise({ filter: 'bandpass', freq: 1800, to: 700, q: 0.8, dur: 0.25, gain: 0.3 });
      for (let i = 0; i < 4; i++) v.noise({ filter: 'highpass', freq: 2500, dur: 0.03, gain: 0.12 }, 0.05 + i * 0.05);
      sparkle(v, [880, 1175, 1480, 1760], 0.08, 0.05, 0.3);
    },
  },
  // ── Boss / 死亡 ──
  bossRoar: { dur: 2.1, play: (v) => roar(v, 2, 0.5, false) },
  bossDeath: { dur: 2.7, play: (v) => roar(v, 2.6, 0.5, true) },
  playerDeath: {
    dur: 3.2,
    play: (v) => {
      boom(v, 0.35, 0.6);
      // 下行的小調和弦 + 喪鐘
      for (const f of [220, 262, 330]) v.tone({ type: 'sawtooth', freq: f, to: f * 0.5, dur: 2.2, gain: 0.05, attack: 0.05, release: 1.5, lowpass: 1200, lowpassTo: 250 });
      clang(v, 110, 3, 0.12, 0.35);
      v.noise({ filter: 'lowpass', freq: 500, to: 80, dur: 1.5, gain: 0.15, attack: 0.3 }, 0.2);
    },
  },
  teleport: {
    dur: 0.9,
    play: (v) => {
      // 上升的嗡鳴 + 閃爍的高音，最後「嗖」一聲
      v.tone({ type: 'sine', freq: 220, to: 880, dur: 0.6, gain: 0.1, attack: 0.1, release: 0.2, vibrato: { rate: 14, depth: 18 } });
      sparkle(v, [1319, 1760, 2093, 2637], 0.07, 0.04, 0.1);
      v.noise({ filter: 'bandpass', freq: 800, to: 4000, q: 1.2, dur: 0.5, gain: 0.25, attack: 0.3 }, 0.3);
    },
  },
  respawn: {
    dur: 1.3,
    play: (v) => {
      v.tone({ type: 'sine', freq: 330, to: 660, dur: 0.8, gain: 0.08, attack: 0.3, release: 0.4 });
      sparkle(v, [659, 880, 1319], 0.12, 0.05, 0.35);
    },
  },
} satisfies Record<string, Recipe>;

export type SfxName = keyof typeof RECIPES;
export const SFX_NAMES = Object.keys(RECIPES) as SfxName[];

export function sfxDuration(name: SfxName): number {
  return RECIPES[name].dur;
}

/** 在 t 秒（AudioContext 時間）播放一個音效到 out */
export function playSfx(ctx: BaseAudioContext, out: AudioNode, t: number, name: SfxName, rate = 1): void {
  const voice: Voice = {
    tone: (o, at = 0) => tone(ctx, out, t + at, { ...o, freq: o.freq * rate, ...(o.to !== undefined ? { to: o.to * rate } : {}) }),
    noise: (o, at = 0) => noise(ctx, out, t + at, { ...o, ...(o.freq !== undefined ? { freq: o.freq * rate } : {}), ...(o.to !== undefined ? { to: o.to * rate } : {}) }),
  };
  RECIPES[name].play(voice);
}
