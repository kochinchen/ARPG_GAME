/**
 * Three.js 畫法的光源參數（試驗）：調亮度、陰影、火把只改這裡。
 * 顏色是 sRGB 色碼；強度是 Three.js 的物理單位（沒有色調壓縮，受光面約 = 原色 × 環境光 + 主光）。
 */
export const THREE_LIGHTING = {
  /** 環境光：沒照到主光的面也有原色約 65% 的亮度（站著的角色大多是側面，太低會整片發黑） */
  ambient: { color: 0xfff4e8, intensity: 2 },
  /** 半球光：只留一點上冷下暖的色調；調高會讓側面偏暗 */
  hemisphere: { sky: 0xa8b4d8, ground: 0x3a2c1e, intensity: 0.4 },
  /** 主光（畫面左上方偏前，與 PolyFigure 的光線相同）：投射陰影 */
  key: { color: 0xffe6c4, intensity: 1.9, direction: [0.15, 1.2, 1.1] as const, shadowMap: 2048 },
  /** 背光（冷色）：勾出輪廓 */
  rim: { color: 0x9fb4ff, intensity: 1.1, direction: [-1, 0.7, -1] as const },
  /** 地上影子的濃度（0～1） */
  shadowOpacity: 0.45,
  /** 火把：同時亮著的數量（固定；數量改變時 Three.js 要重新編譯材質）、高度、照射距離、亮度、多遠以內才亮 */
  torch: { count: 4, height: 1.1, range: 5, intensity: 7, reach: 14 },
  /** 材質的粗糙度（1 = 完全不反光） */
  roughness: 0.8,
};
