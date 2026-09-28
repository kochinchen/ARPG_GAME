import type { z } from 'zod';
import type { FloorDefSchema } from './schema/floor';

/**
 * 樓層區間設定（由淺入深，風格逐步變化）。怪物強度依 balance.difficulty 逐層提高。
 * 地圖由「世界種子 + 樓層」隨機產生（layout），越深地圖越大、房間越多。
 */
type FloorInput = z.input<typeof FloorDefSchema>;

/** 人形怪物（所有樓層）；scale 讓越深的樓層人形怪越少 */
const humanoids = (scale = 1): FloorInput['monsterPool'] => [
  { enemyId: 'enemy.skeleton', weight: 5 * scale },
  { enemyId: 'enemy.ghoul', weight: 3 * scale },
  { enemyId: 'enemy.skeleton_archer', weight: 3 * scale, minFloor: 3 },
  { enemyId: 'enemy.armored_skeleton', weight: 1.5 * scale, minFloor: 4 },
  { enemyId: 'enemy.skeleton_mage', weight: 2.5 * scale, minFloor: 6 },
];

/**
 * 非人形怪物（10 樓以上，每一兩層加入一兩種）：
 * 掠界獸、甲殼蟲與節肢、巨獸、噴吐異種、漂浮異體、寄生變異體。
 */
const CREATURES: FloorInput['monsterPool'] = [
  { enemyId: 'enemy.bone_hound', weight: 3, minFloor: 10 },
  { enemyId: 'enemy.acid_beetle', weight: 2.5, minFloor: 10 },
  { enemyId: 'enemy.hatchling_spider', weight: 3, minFloor: 11 },
  { enemyId: 'enemy.eye_floater', weight: 2.5, minFloor: 11 },
  { enemyId: 'enemy.blood_lizard', weight: 3, minFloor: 12 },
  { enemyId: 'enemy.poison_spitter', weight: 2.5, minFloor: 12 },
  { enemyId: 'enemy.hook_claw', weight: 2.5, minFloor: 13 },
  { enemyId: 'enemy.horned_brute', weight: 1.2, minFloor: 13 },
  { enemyId: 'enemy.fire_crawler', weight: 2.5, minFloor: 15 },
  { enemyId: 'enemy.molten_brute', weight: 1.2, minFloor: 15 },
  { enemyId: 'enemy.frost_sporeling', weight: 2.5, minFloor: 16 },
  { enemyId: 'enemy.egg_matron', weight: 1, minFloor: 16 },
  { enemyId: 'enemy.shadow_panther', weight: 2.5, minFloor: 18 },
  { enemyId: 'enemy.brain_floater', weight: 2, minFloor: 18 },
  { enemyId: 'enemy.quake_beast', weight: 1.2, minFloor: 20 },
  { enemyId: 'enemy.soul_flower', weight: 1.5, minFloor: 20 },
  { enemyId: 'enemy.void_spore', weight: 2.5, minFloor: 22 },
  { enemyId: 'enemy.burrower', weight: 2.5, minFloor: 22 },
];

/** 樓層魔王：每個區間的第一層（5、10、15…）；深淵神殿（30 層起）每 5 層都是深淵魔王 */
const boss = (enemyId: string) => ({ enemyId, every: 5 });

const tier = (id: string, from: number, to: number, theme: FloorInput['theme'], extra: Partial<FloorInput>): FloorInput => ({
  id,
  floors: [from, to],
  theme,
  layout: { width: 180, height: 135, rooms: [26, 34], loops: 6 },
  monsterPool: humanoids(),
  density: 1.5,
  packSize: [3, 5],
  eliteChance: 0.2,
  affixCount: [1, 1],
  lootTier: 1,
  chests: [4, 6],
  chestLootTable: 'loot.chest',
  // 地圖大、怪物多：擊敗 35% 就能開啟出口
  clearRatio: 0.35,
  ...extra,
});

/** 深淵神殿（30 層起）的共通設定 */
const TEMPLE: Partial<FloorInput> = {
  boss: boss('enemy.abyss_lord'),
  monsterPool: [...humanoids(0.3), ...CREATURES],
  layout: { width: 225, height: 172, rooms: [42, 52], loops: 15 },
  density: 2.0,
  packSize: [4, 7],
  eliteChance: 0.45,
  affixCount: [2, 2],
  lootTier: 4,
  chests: [7, 9],
};

/** 第 31～34 層最後的魔王 */
const CHALLENGE_BOSSES = ['enemy.lava_behemoth', 'enemy.fallen_knight', 'enemy.spider_queen', 'enemy.abyss_lord'];

export const floors: FloorInput[] = [
  // 遺棄地窖：基礎教學區、簡單地形、低強度怪物
  tier('floor.crypt_1', 1, 4, 'crypt', {}),
  // 古老墓穴：增加遠程怪、分支路徑、開始出現精英怪
  tier('floor.tomb', 5, 9, 'tomb', {
    boss: boss('enemy.crypt_guardian'),
    layout: { width: 180, height: 135, rooms: [29, 36], loops: 9 },
    density: 1.6,
    eliteChance: 0.25,
    lootTier: 2,
  }),
  // 地下聖堂：地圖更大、更多房間
  tier('floor.sanctum', 10, 14, 'sanctum', {
    boss: boss('enemy.fallen_priest'),
    monsterPool: [...humanoids(), ...CREATURES],
    layout: { width: 202, height: 150, rooms: [34, 42], loops: 9 },
    density: 1.7,
    packSize: [3, 6],
    eliteChance: 0.3,
    affixCount: [1, 2],
    lootTier: 2,
    chests: [5, 7],
  }),
  // 熔岩礦坑
  tier('floor.lava', 15, 19, 'lava', {
    boss: boss('enemy.lava_behemoth'),
    monsterPool: [...humanoids(0.7), ...CREATURES],
    layout: { width: 202, height: 150, rooms: [34, 42], loops: 10 },
    density: 1.8,
    packSize: [3, 6],
    eliteChance: 0.3,
    affixCount: [1, 2],
    lootTier: 3,
    chests: [5, 7],
  }),
  // 破碎要塞：更複雜的迷宮
  tier('floor.fortress', 20, 24, 'fortress', {
    boss: boss('enemy.fallen_knight'),
    monsterPool: [...humanoids(0.5), ...CREATURES],
    layout: { width: 210, height: 158, rooms: [39, 47], loops: 14 },
    density: 1.8,
    packSize: [4, 6],
    eliteChance: 0.35,
    affixCount: [1, 2],
    lootTier: 3,
    chests: [6, 8],
  }),
  // 深淵通道：大型開放空間
  tier('floor.abyss', 25, 29, 'abyss', {
    boss: boss('enemy.spider_queen'),
    monsterPool: [...humanoids(0.3), ...CREATURES],
    layout: { width: 218, height: 165, rooms: [31, 39], loops: 15 },
    density: 1.9,
    packSize: [4, 7],
    eliteChance: 0.4,
    affixCount: [2, 2],
    lootTier: 4,
    chests: [6, 8],
  }),
  // 深淵神殿：最大地圖；第 30 層是一般模式的最後一層（擊敗深淵魔王 = 已通關）
  tier('floor.temple', 30, 30, 'temple', TEMPLE),
  // 極限挑戰（docs/ENDGAME.md）：31～34 每層一位最後的魔王，中途有小王；進入後回不到 1～30 層
  ...CHALLENGE_BOSSES.map((enemyId, i) =>
    tier(`floor.challenge_${31 + i}`, 31 + i, 31 + i, 'temple', { ...TEMPLE, boss: { enemyId, every: 1 }, miniBosses: ['enemy.crypt_guardian', 'enemy.fallen_priest'] }),
  ),
  // 35：王座廳。只有一個直徑 40 個魔王身體寬度的圓形空間、最終魔王與 10 個寶箱；沒有一般怪物、沒有出口
  tier('floor.throne', 35, 35, 'temple', {
    ...TEMPLE,
    boss: undefined,
    throne: { enemyId: 'enemy.abyss_sovereign', bodies: 40 },
    density: 0,
    chests: [10, 10],
    chestLootTable: 'loot.final_chest',
  }),
];
