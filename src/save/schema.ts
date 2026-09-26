import { z } from 'zod';
import { RaritySchema } from '../data/schema/item';
import { SkillCategorySchema } from '../data/schema/skill';

/**
 * 存檔格式 v1（規格見 docs/SAVE_SYSTEM.md 第 2 節）。
 * 只存 ID、數值與玩家的選擇；最終屬性、Mastery、名稱說明都在讀檔後重新推導。
 * 格式變動時：SAVE_VERSION + 1，並在 migrations 加一步轉換。
 */
export const SAVE_VERSION = 1;

const int = z.number().int();
const nonNegInt = int.min(0);
const finite = z.number().finite();

export const ItemInstanceSchema = z.object({
  uid: z.string().min(1),
  baseId: z.string(),
  rarity: RaritySchema,
  itemLevel: int.min(1),
  affixes: z.array(z.object({ id: z.string(), rolls: z.array(finite) })),
  legendaryId: z.string().optional(),
});

export const SavedEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), item: ItemInstanceSchema }),
  z.object({ kind: z.literal('potion'), potionId: z.string(), count: int.min(1) }),
]);

const GroundContentSchema = z.discriminatedUnion('kind', [
  ...SavedEntrySchema.options,
  z.object({ kind: z.literal('gold'), amount: int.min(1) }),
]);

const skillSlot = z.string().nullable();
const comboSlots = z.tuple([skillSlot, skillSlot, skillSlot]);

export const EquipmentSlotSchema = z.enum(['weapon', 'helmet', 'armor', 'gloves', 'boots', 'ring1', 'ring2', 'amulet']);

export const SaveDataV1Schema = z.object({
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
    exitOpen: z.boolean(),
    killed: z.array(nonNegInt),
    /** 樓層（JSON 的 key 一定是字串）→ 已開啟的寶箱索引 */
    openedChests: z.record(z.string(), z.array(nonNegInt)),
    groundItems: z.array(z.object({ entry: GroundContentSchema, x: finite, y: finite, droppedByPlayer: z.boolean() })),
  }),
  counters: z.object({
    /** ItemGenerator 最後使用的流水號；讀檔後從下一號接續 */
    itemUidCounter: nonNegInt,
  }),
});

export type SaveDataV1 = z.infer<typeof SaveDataV1Schema>;
export type SaveData = SaveDataV1;
export type SavedEntry = z.infer<typeof SavedEntrySchema>;
export type SavedGroundItem = SaveDataV1['floor']['groundItems'][number];
export type SavedItem = z.infer<typeof ItemInstanceSchema>;
