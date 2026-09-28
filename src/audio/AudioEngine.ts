import { DEFAULT_VOLUME, parseVolume, sliderGain, VOLUME_KEY, type VolumeSettings } from './AudioSettings';
import { MusicPlayer, type MusicId } from './Music';
import { playSfx, sfxDuration, type SfxName } from './Sfx';
import { impulseResponse } from './Synth';

export interface SfxOptions {
  /** 音量倍率（距離衰減、怪物較小聲） */
  gain?: number;
  /** 左右（-1～1） */
  pan?: number;
  /** 頻率倍率 */
  rate?: number;
  /** 幾秒後播放 */
  delay?: number;
  /** 殘響量（0～1） */
  reverb?: number;
  /** 同一種音效的最短間隔（秒；預設 MIN_GAP） */
  minGap?: number;
}

/** 同時播放的音效上限：怪物很多時丟掉多出來的，避免爆音與效能問題 */
const MAX_VOICES = 28;
/** 同一種音效最短間隔（秒）：十隻怪同時揮刀只會聽到幾聲 */
const MIN_GAP = 0.045;

/**
 * 音效與音樂的輸出：主音量 → 音樂 / 音效兩條匯流排，外加一個共用殘響（地牢的回音）。
 * 瀏覽器規定使用者操作（點擊 / 按鍵）之後才能出聲：unlock() 在第一次操作時呼叫。
 */
export class AudioEngine {
  readonly ctx: AudioContext | null;
  private readonly master: GainNode | null = null;
  private readonly musicBus: GainNode | null = null;
  private readonly sfxBus: GainNode | null = null;
  private readonly reverb: ConvolverNode | null = null;
  private readonly musicDuck: GainNode | null = null;
  readonly music: MusicPlayer | null = null;
  private settings: VolumeSettings;
  private voices = 0;
  private readonly lastPlayed = new Map<string, number>();

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null) {
    this.settings = parseVolume(safeGet(storage));
    const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
    if (!this.ctx) return;
    const ctx = this.ctx;
    // 壓縮器：很多音效疊在一起時不會破音
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    this.musicBus = ctx.createGain();
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus).connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulseResponse(ctx, 2.6, 2.4);
    // 殘響只接到主音量，音樂 / 音效各自的送出量由來源決定
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    this.reverb.connect(wet).connect(this.master);
    this.music = new MusicPlayer(ctx, this.musicDuck, this.reverb);
    this.applyVolume();
  }

  get volume(): VolumeSettings {
    return { ...this.settings };
  }

  setVolume(patch: Partial<VolumeSettings>): void {
    this.settings = parseVolume(JSON.stringify({ ...this.settings, ...patch }));
    this.applyVolume();
    try {
      this.storage?.setItem(VOLUME_KEY, JSON.stringify(this.settings));
    } catch {
      // 無法儲存設定：本次遊戲仍然有效
    }
  }

  resetVolume(): void {
    this.setVolume({ ...DEFAULT_VOLUME });
  }

  private applyVolume(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    this.master!.gain.setTargetAtTime(s.muted ? 0 : sliderGain(s.master), t, 0.03);
    this.musicBus!.gain.setTargetAtTime(sliderGain(s.music), t, 0.03);
    this.sfxBus!.gain.setTargetAtTime(sliderGain(s.sfx), t, 0.03);
  }

  /** 第一次點擊 / 按鍵後才能出聲（瀏覽器的自動播放限制） */
  unlock(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  /** 分頁切到背景：暫停所有聲音（遊戲也停了；計時器變慢會讓音樂斷斷續續） */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** 音樂暫時變小（倒地時）；level = 1 恢復 */
  duckMusic(level: number, seconds = 1): void {
    if (!this.ctx) return;
    this.musicDuck!.gain.setTargetAtTime(Math.max(0.0001, level), this.ctx.currentTime, seconds / 3);
  }

  playMusic(id: MusicId): void {
    this.music?.play(id);
  }

  /** 播放音效；回傳是否真的播放（被節流或超過同時上限時為 false） */
  play(name: SfxName, options: SfxOptions = {}): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.settings.muted) return false;
    const gain = options.gain ?? 1;
    if (gain < 0.02) return false;
    const now = ctx.currentTime;
    const at = now + (options.delay ?? 0);
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (Math.abs(at - last) < (options.minGap ?? MIN_GAP)) return false;
    if (this.voices >= MAX_VOICES) return false;
    this.lastPlayed.set(name, at);

    const out = ctx.createGain();
    out.gain.value = gain;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, options.pan ?? 0));
    out.connect(panner).connect(this.sfxBus!);
    const send = ctx.createGain();
    send.gain.value = options.reverb ?? 0.18;
    panner.connect(send).connect(this.reverb!);
    // 每次播放小幅變化音高，避免機械感
    const rate = (options.rate ?? 1) * (0.96 + ((at * 997) % 1) * 0.08);
    playSfx(ctx, out, at, name, rate);

    this.voices++;
    const life = (options.delay ?? 0) + sfxDuration(name) + 0.1;
    window.setTimeout(() => {
      this.voices--;
      out.disconnect();
      panner.disconnect();
      send.disconnect();
    }, life * 1000);
    return true;
  }
}

function safeGet(storage: Pick<Storage, 'getItem'> | null): string | null {
  try {
    return storage?.getItem(VOLUME_KEY) ?? null;
  } catch {
    return null;
  }
}
