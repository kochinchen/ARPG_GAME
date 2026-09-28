/**
 * 音量設定（0～1）。與角色存檔分開，存在 localStorage 的獨立 Key（ARCHITECTURE.md 第 1.2 節）。
 */
export interface VolumeSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export const VOLUME_KEY = 'arpg-audio';
export const DEFAULT_VOLUME: Readonly<VolumeSettings> = { master: 0.8, music: 0.55, sfx: 0.8, muted: false };

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** 讀取設定；格式不對的欄位用預設值 */
export function parseVolume(raw: string | null): VolumeSettings {
  let obj: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>;
  } catch {
    // 壞掉的設定：全部用預設值
  }
  return {
    master: clamp01(obj.master, DEFAULT_VOLUME.master),
    music: clamp01(obj.music, DEFAULT_VOLUME.music),
    sfx: clamp01(obj.sfx, DEFAULT_VOLUME.sfx),
    muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULT_VOLUME.muted,
  };
}

/** 滑桿位置 → 實際增益（人耳對音量是對數感知，平方讓滑桿前半段不會一下就太大聲） */
export function sliderGain(v: number): number {
  return v * v;
}

/** 背景音樂：每 5 層換一首（1～4、5～9、…、30～34、35）；與樓層主題的區間一致 */
export function musicTierForFloor(floor: number): number {
  return Math.max(0, Math.min(7, Math.floor(floor / 5)));
}
