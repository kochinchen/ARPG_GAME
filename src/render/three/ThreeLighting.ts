/**
 * Three.js 畫法的光源參數（試驗）：調亮度、陰影、燭光、火把、特效的光只改這裡。
 * 顏色是 sRGB 色碼；強度是 Three.js 的物理單位（沒有色調壓縮）：光照在線性空間計算，
 * 環境光 intensity ÷ π = 線性亮度比例，畫面上看起來約是它的平方根（0.2 → 線性 6.5% → 畫面約 28%）。
 *
 * 高度（World 單位；畫面上 1 單位 ≈ 39 px）——影子的長短 = 物件高度 × 距離 ÷（光源高度 − 物件高度），光源要比物件高很多，影子才短：
 * - 物件：寶箱 0.45、牆 0.6～0.9、主角 1.45、投射物飛行 0.6
 * - 燭光 3（主角身高的 2 倍，寶箱的影子只有距離的 1/6）；火把的火焰 1.33（約主角肩膀高；TileMapView 的 TORCH_FLAME_HEIGHT，燈架與光源同高，水晶的光也是）；
 *   爆炸閃光 1.0（EffectLayer 的 FLASH_HEIGHT）；飛行中的光球就在它飛的高度
 * - 火把、特效的光比物件低不了多少，影子會比較長，所以影子較淡（shadowStrength）
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
   * 主角身上的燭光（點光源）：幾乎從正上方照下來（tilt 偏向鏡頭的角度，度），腳下有跟著動作變化的影子；
   * height 離地高度（World）、intensity 亮度、decay 衰減（距離的幾次方；比真實的 2 柔和很多，亮區才夠大）、
   * reach 照射距離 = 亮區半徑 × reach（之外完全不亮）、flicker 閃爍幅度、shadow 是否投射影子（shadowMap 解析度）
   */
  candle: { color: 0xffe2b8, height: 3, tilt: 5, intensity: 4.5, decay: 0.25, reach: 1.35, flicker: 0.03, shadow: true, shadowMap: 1024 },
  /**
   * 補光（不投影子）：燭光從正上方照，身體正面只照到很斜的光會偏暗，在主角前方（鏡頭那一側）補一點光。
   * toward 往鏡頭偏的距離、height 高度、distance 照射距離（World）
   */
  fill: { color: 0xffe2b8, intensity: 1.6, toward: 1.6, height: 1.3, distance: 3.2, decay: 1 },
  /**
   * 火把：同時亮著的數量（固定；數量改變時 Three.js 要重新編譯材質）、照射距離、亮度、多遠以內才亮（高度見上方說明）；
   * shadow：投射影子（靠近火把時，身影落在離火把遠的那一側）、shadowStrength 影子濃度（0～1）
   */
  torch: { count: 4, range: 5, intensity: 7, reach: 14, shadow: true, shadowMap: 256, shadowStrength: 0.55 },
  /**
   * 發光的特效（火球、冰球、元素箭、爆炸閃光）：同時亮著的數量、照射距離、亮度（× 特效的 strength）、投射影子
   */
  fx: { count: 6, range: 4, intensity: 6, decay: 1.5, shadow: true, shadowMap: 256, shadowStrength: 0.6 },
  /** 材質的粗糙度（1 = 完全不反光） */
  roughness: 0.8,
};
