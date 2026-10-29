/**
 * Three.js 畫法的光源參數（試驗）：調亮度、陰影、燭光、火把只改這裡。
 * 顏色是 sRGB 色碼；強度是 Three.js 的物理單位（沒有色調壓縮）：光照在線性空間計算，
 * 環境光 intensity ÷ π = 線性亮度比例，畫面上看起來約是它的平方根（0.2 → 線性 6.5% → 畫面約 28%）。
 */
export const THREE_LIGHTING = {
  /** 環境光：燭光、火把照不到的地方剩下的亮度（畫面上約原色的 28%，與 Pixi 畫法亮區外的暗度相同） */
  ambient: { color: 0xc8c4d8, intensity: 0.2 },
  /** 半球光：只留一點上冷下暖的色調 */
  hemisphere: { sky: 0xa8b4d8, ground: 0x3a2c1e, intensity: 0.04 },
  /** 主光（畫面左上方偏前，微弱的冷光）：影子交給燭光，這裡不投影 */
  key: { color: 0xc8d4ff, intensity: 0.12, direction: [0.15, 1.2, 1.1] as const, shadowMap: 2048, shadow: false },
  /** 背光（冷色）：勾出輪廓 */
  rim: { color: 0x9fb4ff, intensity: 0.25, direction: [-1, 0.7, -1] as const },
  /**
   * 主角身上的燭光（點光源）：height 離地高度、toward 往鏡頭偏的距離（World）；
   * intensity 亮度、decay 衰減（距離的幾次方；比真實的 2 柔和很多，亮區才夠大）、reach 照射距離 = 亮區半徑 × reach（之外完全不亮）、
   * flicker 閃爍幅度、shadow 是否投射影子（六個方向的陰影圖，shadowMap 解析度）
   */
  candle: { color: 0xffe2b8, height: 3.2, toward: 1.2, intensity: 4.5, decay: 0.3, reach: 1.35, flicker: 0.03, shadow: true, shadowMap: 512 },
  /** 火把：同時亮著的數量（固定；數量改變時 Three.js 要重新編譯材質）、高度、照射距離、亮度、多遠以內才亮 */
  torch: { count: 4, height: 1.1, range: 5, intensity: 7, reach: 14 },
  /** 材質的粗糙度（1 = 完全不反光） */
  roughness: 0.8,
};
