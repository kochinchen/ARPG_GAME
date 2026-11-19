/**
 * 地底古城的遺跡（只有畫面，不影響碰撞與遊戲數值；設計者 2026-11-19）：
 * 幾百年來城市、王朝一層層疊在上面，每一層的地圖外（牆外的黑色區）露出幾棟那個年代的斷垣殘壁，
 * 地板上有幾塊石頭地板，散落著坐著、躺著的白骨。蜘蛛女王那層（25）以後是王宮、宮殿。
 * 擺放在 game/world/Ruins.ts（種子亂數，同一層每次一樣），模型在 render/three/RuinsArt.ts。
 */
export type RuinEra = 'hamlet' | 'necropolis' | 'cathedral' | 'foundry' | 'citadel' | 'palace' | 'sanctum_palace';

export interface RuinEraDef {
  era: RuinEra;
  /** 樓層範圍（含兩端） */
  floors: [number, number];
  /** 設計文件用的名稱 */
  name: string;
}

export const RUIN_ERAS: readonly RuinEraDef[] = [
  { era: 'hamlet', floors: [1, 4], name: '最近一代的平民石屋（木樑、塌掉的屋頂）' },
  { era: 'necropolis', floors: [5, 9], name: '古老的墓園：陵寢、方尖碑、墓碑' },
  { era: 'cathedral', floors: [10, 14], name: '尖拱教堂：斷掉的尖拱、玫瑰窗、扶壁' },
  { era: 'foundry', floors: [15, 19], name: '礦城的鍛造廠：磚造煙囪、熔爐、拱門' },
  { era: 'citadel', floors: [20, 24], name: '要塞的城樓：圓塔、城垛、城門' },
  { era: 'palace', floors: [25, 29], name: '古王朝的王宮：凹槽圓柱、圓頂、大階梯' },
  { era: 'sanctum_palace', floors: [30, 35], name: '最深處的神殿宮殿：金頂、雙排列柱、王座台' },
];

export function ruinEraFor(floor: number): RuinEra {
  return (RUIN_ERAS.find((e) => floor >= e.floors[0] && floor <= e.floors[1]) ?? RUIN_ERAS[RUIN_ERAS.length - 1]!).era;
}

export const RUINS = {
  /** 每層頂替一段邊牆的建築（正面就是那段牆；設計者 2026-11-19）與留在牆外黑色區的建築 */
  wallBuildings: [4, 6] as [number, number],
  buildings: [2, 3] as [number, number],
  /** 頂替邊牆：正面那一排至少幾成緊貼地板 */
  frontFloor: 0.6,
  /** 建築占地（Tile）：寬、深 */
  buildingSize: [6, 11] as [number, number],
  /** 牆外的建築離地板至少幾 Tile、最遠幾 Tile（太遠就看不到） */
  floorGap: [2, 7] as [number, number],
  /** 兩棟建築的中心至少相隔幾 Tile（分散在整張地圖） */
  buildingSpacing: 22,
  /** 石頭地板：每層幾塊、每塊半徑（Tile） */
  patches: [12, 18] as [number, number],
  patchRadius: [1.6, 3.2] as [number, number],
  /** 骷髏：每層幾具；其中幾成成堆（2～4 具倒在一起）、幾成靠牆坐著 */
  skeletons: [55, 75] as [number, number],
  clusterChance: 0.35,
  wallSitChance: 0.3,
  /** 離樓梯口、存檔點、出口、商人、寶箱至少幾 Tile */
  clearOfMarkers: 2.5,
};
