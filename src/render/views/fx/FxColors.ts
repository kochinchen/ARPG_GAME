/** 特效粒子的種類（ImpactFx 負責模擬與繪製） */
export type FxParticleKind = 'ember' | 'flake' | 'spark' | 'smoke' | 'dust' | 'debris' | 'shard' | 'drop' | 'wind' | 'mote';

/** 兩個顏色依比例混合（k = 0 → a、1 → b） */
export function mix(a: number, b: number, k: number): number {
  const c = (s: number) => Math.round(((a >> s) & 0xff) * (1 - k) + ((b >> s) & 0xff) * k);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
