import { z } from 'zod';
import { MaterialIdSchema, RaritySchema } from '../data/schema/item';
import { SkillCategorySchema } from '../data/schema/skill';
import { CoreElementSchema, CoreTypeIdSchema } from '../data/schema/core';

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
 * v12：盾牌欄位（equipment.shield）、裝備的重鑄次數（rerolls）。
 * v13：連段增加為七組（Q / W / E / R / A / S / D）。
 * v14：雙重斬換成盾擊（技能等級、左鍵、連段格轉移）。
 * v15：鑲嵌與融合——裝備的孔位與熔核（sockets）、背包 / 地上 / 拆解區的熔核、商人的融合格（fusion）。
 * v16：盾牌也能鑲嵌——熔核主屬性多了盾牌欄（main.shield）。
 * 只存 ID、數值與玩家的選擇；最終屬性、Mastery、名稱說明都在讀檔後重新推導。
 * 格式變動時：SAVE_VERSION + 1，並在 migrations 加一步轉換。
 */
export const SAVE_VERSION = 16;

const int = z.number().int();
const nonNegInt = int.min(0);
const finite = z.number().finite();

const CoreRollSchema = z.object({ lineId: z.string(), roll: finite.min(0).max(1) });
const coreSlots = z.array(CoreRollSchema);

/** 熔核（v0.5.0）：只存 ID 與擲骰值 */
export const CoreInstanceSchema = z.object({
  uid: z.string().min(1),
  types: z.union([z.tuple([CoreTypeIdSchema]), z.tuple([CoreTypeIdSchema, CoreTypeIdSchema])]),
  tier: int.min(1).max(5),
  rarity: z.enum(['normal', 'magic', 'rare', 'epic', 'legendary']),
  power: finite.positive(),
  itemLevel: int.min(1),
  element: CoreElementSchema.optional(),
  pure: z.boolean().optional(),
  main: z.object({ weapon: coreSlots, helmet: coreSlots, armor: coreSlots, gloves: coreSlots, boots: coreSlots, shield: coreSlots }),
  secondary: coreSlots,
  brand: z.object({ legendaryId: z.string(), line: nonNegInt, roll: finite.optional() }).optional(),
});

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
  /** 重鑄次數（v12） */
  rerolls: nonNegInt.optional(),
  /** 孔位與鑲入的熔核（v15） */
  sockets: z.object({ max: int.min(0).max(5), cores: z.array(CoreInstanceSchema) }).optional(),
});

export const SavedEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), item: ItemInstanceSchema }),
  z.object({ kind: z.literal('potion'), potionId: z.string(), count: int.min(1) }),
  z.object({ kind: z.literal('core'), core: CoreInstanceSchema }),
]);

const GroundContentSchema = z.discriminatedUnion('kind', [
  ...SavedEntrySchema.options,
  z.object({ kind: z.literal('gold'), amount: int.min(1) }),
  z.object({ kind: z.literal('material'), materialId: MaterialIdSchema, count: int.min(1) }),
]);

const skillSlot = z.string().nullable();
const comboSlots = z.tuple([skillSlot, skillSlot, skillSlot]);

export const EquipmentSlotSchema = z.enum(['weapon', 'shield', 'helmet', 'armor', 'gloves', 'boots', 'ring1', 'ring2', 'amulet']);

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
    /** Q / W / E / R / A / S / D 各一組（v13 起 7 組） */
    combos: z.array(comboSlots).length(7),
    activeCombo: int.min(0).max(6),
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
  /** 拆解區：裝備或熔核（v15 起可以放熔核，以有無 baseId 區分） */
  salvage: z.array(z.union([ItemInstanceSchema, CoreInstanceSchema]).nullable()),
  /** 商人飛昇格裡的裝備（v8，選填） */
  ascendSlot: ItemInstanceSchema.nullable().optional(),
  /** 融合格（v15）：合成區（武器）與飾品區 */
  fusion: z.object({ inputs: z.array(ItemInstanceSchema.nullable()), jewelry: z.array(ItemInstanceSchema.nullable()) }).optional(),
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
export type SavedCore = z.infer<typeof CoreInstanceSchema>;
