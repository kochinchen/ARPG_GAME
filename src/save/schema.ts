import { z } from 'zod';
import { MaterialIdSchema, RaritySchema } from '../data/schema/item';
import { SkillCategorySchema } from '../data/schema/skill';

/**
 * 存檔格式（目前 v2；規格見 docs/SAVE_SYSTEM.md 第 2 節）。
 * v2：加入屬性點（attributes）。
 * v3：加入商人貨架已買走的位置（floor.shopBought）。
 * v4：加入怪物圖鑑（bestiary）。
 * v5：裝備加入主倍率（quality）。
 * v6：傳奇 / 神話裝備的固定屬性擲骰（legendaryRolls）。
 * v7：裝備圖鑑（collection）。
 * v8：材料（materials）與拆解區（salvage）；地上的材料（飛昇碎片）。
 * v10：終局紀錄（endgame：已通關、已完成隱藏難關）。
 * v11：魔王門前的存檔點（floor.bossGateActive）、到過中途存檔點的樓層（floor.midwayFloors）。
 * 只存 ID、數值與玩家的選擇；最終屬性、Mastery、名稱說明都在讀檔後重新推導。
 * 格式變動時：SAVE_VERSION + 1，並在 migrations 加一步轉換。
 */
export const SAVE_VERSION = 11;

const int = z.number().int();
const nonNegInt = int.min(0);
const finite = z.number().finite();

export const ItemInstanceSchema = z.object({
  uid: z.string().min(1),
  baseId: z.string(),
  rarity: RaritySchema,
  itemLevel: int.min(1),
  /** 主倍率（v5）：+X% 武器傷害 / 防禦 / 飾品詞綴 */
  quality: finite.min(0).optional(),
  affixes: z.array(z.object({ id: z.string(), rolls: z.array(finite) })),
  legendaryId: z.string().optional(),
  /** 傳奇 / 神話固定屬性的擲骰（v6） */
  legendaryRolls: z.array(finite).optional(),
});

export const SavedEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), item: ItemInstanceSchema }),
  z.object({ kind: z.literal('potion'), potionId: z.string(), count: int.min(1) }),
]);

const GroundContentSchema = z.discriminatedUnion('kind', [
  ...SavedEntrySchema.options,
  z.object({ kind: z.literal('gold'), amount: int.min(1) }),
  z.object({ kind: z.literal('material'), materialId: MaterialIdSchema, count: int.min(1) }),
]);

const skillSlot = z.string().nullable();
const comboSlots = z.tuple([skillSlot, skillSlot, skillSlot]);

export const EquipmentSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring1', 'ring2', 'amulet']);

export const SaveDataSchema = z.object({
  meta: z.object({
    createdAt: z.string(),
    playTimeSec: finite.min(0),
    runSeed: nonNegInt,
  }),
  character: z.object({
    level: int.min(1),
    xp: finite.min(0),
    gold: nonNegInt,
    hp: finite,
    mana: finite,
  }),
  skills: z.object({
    ranks: z.record(z.string(), int.min(1)),
    unspentPoints: nonNegInt,
    t4Charges: nonNegInt,
    t4Unlocked: z.array(SkillCategorySchema),
  }),
  attributes: z.object({
    /** 尚未分配的點數 */
    unspent: nonNegInt,
    /** 屬性 ID → 已分配點數 */
    allocated: z.record(z.string(), int.min(1)),
  }),
  loadout: z.object({
    left: z.string(),
    combos: z.tuple([comboSlots, comboSlots, comboSlots]),
    activeCombo: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    supports: comboSlots,
  }),
  inventory: z.object({
    cells: z.array(SavedEntrySchema.nullable()),
    cursor: SavedEntrySchema.nullable(),
  }),
  equipment: z.partialRecord(EquipmentSlotSchema, ItemInstanceSchema),
  codex: z.array(
    z.object({
      comboId: z.string(),
      ruleId: z.string(),
      skills: z.tuple([z.string(), z.string(), z.string()]),
      order: nonNegInt,
      timesUsed: nonNegInt,
    }),
  ),
  floor: z.object({
    current: int.min(1),
    highest: int.min(1),
    mapId: z.string(),
    midwayActive: z.boolean(),
    /** 魔王門前的存檔點已啟動（v11；只在本次進入樓層有效，換層後重設） */
    bossGateActive: z.boolean(),
    /** 到過中途存檔點的樓層（v11；重新進入時中途點維持啟動、有傳送口） */
    midwayFloors: z.array(int.min(1)),
    exitOpen: z.boolean(),
    killed: z.array(nonNegInt),
    /** 樓層（JSON 的 key 一定是字串）→ 已開啟的寶箱索引 */
    openedChests: z.record(z.string(), z.array(nonNegInt)),
    groundItems: z.array(z.object({ entry: GroundContentSchema, x: finite, y: finite, droppedByPlayer: z.boolean() })),
    /** 本層商人貨架已買走的位置（重新整理不會補貨） */
    shopBought: z.array(nonNegInt),
  }),
  /** 怪物圖鑑：EnemyDef ID → 擊敗次數 */
  bestiary: z.record(z.string(), nonNegInt),
  /** 裝備圖鑑：拿到過的 'base:<基底 ID>' 與 'legendary:<ID>'（v7） */
  collection: z.array(z.string()),
  /** 材料：武器精華、防具精華、飛昇碎片（v8） */
  materials: z.partialRecord(MaterialIdSchema, nonNegInt),
  /** 拆解區的裝備（v8；空格為 null） */
  salvage: z.array(ItemInstanceSchema.nullable()),
  /** 商人飛昇格裡的裝備（v8，選填） */
  ascendSlot: ItemInstanceSchema.nullable().optional(),
  counters: z.object({
    /** ItemGenerator 最後使用的流水號；讀檔後從下一號接續 */
    itemUidCounter: nonNegInt,
  }),
  /** 終局紀錄（v10；docs/ENDGAME.md）：已通關（擊敗第 30 層魔王）、已完成隱藏難關（擊敗第 35 層魔王） */
  endgame: z.object({ cleared: z.boolean(), completedHidden: z.boolean() }),
  /** 持續推進的亂數序列狀態：序列名稱 → Rng 狀態（v9；缺少的序列讀檔時重新混合種子） */
  rng: z.record(z.string(), z.number().int().min(0).max(0xffffffff)),
});

export type SaveData = z.infer<typeof SaveDataSchema>;
export type SavedEntry = z.infer<typeof SavedEntrySchema>;
export type SavedGroundItem = SaveData['floor']['groundItems'][number];
export type SavedItem = z.infer<typeof ItemInstanceSchema>;
