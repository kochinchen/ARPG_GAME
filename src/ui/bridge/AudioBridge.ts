import { reactive } from 'vue';

/**
 * UI → 音量設定（不是遊戲狀態，不經過 CommandQueue；由 main.ts 連接 AudioEngine）。
 */
export interface VolumeState {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export interface AudioActions {
  /** 套用並儲存；回傳實際套用後的設定 */
  set(patch: Partial<VolumeState>): VolumeState;
  /** 試聽音效音量 */
  preview(): void;
}

let actions: AudioActions | null = null;

export const volume = reactive<VolumeState>({ master: 0.8, music: 0.55, sfx: 0.8, muted: false });

export const audioBridge = {
  connect(value: AudioActions, initial: VolumeState): void {
    actions = value;
    Object.assign(volume, initial);
  },
  set(patch: Partial<VolumeState>): void {
    Object.assign(volume, actions ? actions.set(patch) : patch);
  },
  preview(): void {
    actions?.preview();
  },
};
