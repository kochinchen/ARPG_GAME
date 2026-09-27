import { z } from 'zod';

/** 資料 ID：小寫、底線、以點分層，例如 'magic.fireball' */
export const IdSchema = z.string().regex(/^[a-z0-9_]+(\.[a-z0-9_]+)*$/, 'ID 必須是小寫英數與底線，以點分層');

/** [min, max]，min <= max */
export const RangeSchema = z
  .tuple([z.number(), z.number()])
  .refine(([min, max]) => min <= max, 'Range 的 min 必須 <= max');

/** World 座標（Tile） */
export const PointSchema = z.tuple([z.number(), z.number()]);

/** 角色屬性名稱；物品、詞綴、Buff 都以此指定要影響的屬性 */
export const StatIdSchema = z.enum([
  'maxHp',
  'maxMana',
  'manaRegen',
  'moveSpeed',
  'damageMin',
  'damageMax',
  /** 魔法技能的傷害基準（% Spell Power） */
  'spellPower',
  'attackSpeed',
  /** 施法速度加成（施放時間 ÷ (1 + castSpeed)） */
  'castSpeed',
  'attackRange',
  'critChance',
  'defense',
  /** 所有傷害加成（比例） */
  'damageBonus',
  /** 近戰技能（tag: melee）額外傷害加成（比例），與 damageBonus 相乘 */
  'meleeDamageBonus',
  /** 遠程技能額外傷害加成（弓） */
  'rangedDamageBonus',
  /** 魔法技能額外傷害加成（法杖） */
  'spellDamageBonus',
  /** 元素抗性：受到該元素的傷害降低（上限見 balance.combat） */
  'fireResist',
  'coldResist',
  'lightningResist',
  'poisonResist',
  /** 物理減傷：受到的物理傷害降低（防禦之後計算；精英 / Boss 的樓層減傷使用） */
  'physicalResist',
  /** 閃避：完全躲開一次攻擊的機率（持續傷害不能閃避） */
  'dodgeChance',
  /** 荊棘：被近身攻擊時，對攻擊者造成的固定物理傷害 */
  'thorns',
  /** 藥水效果：藥水回復量提高（比例） */
  'potionEffect',
  /** 元素附加傷害：每次命中額外造成「該次傷害 × 比例」的元素傷害 */
  'fireDamagePct',
  'coldDamagePct',
  'lightningDamagePct',
  'poisonDamagePct',
  /** 受到傷害減免（比例，上限 90%） */
  'damageReduction',
  /** 受到暴擊時額外的暴擊傷害（比例） */
  'critDamageTaken',
  /** 自己的暴擊傷害提高（比例，加在暴擊倍率上） */
  'critDamageBonus',
  /** 魔力消耗減免（比例） */
  'manaCostReduction',
  /** 造成傷害的一定比例回復生命 / 魔力 */
  'lifeSteal',
  'manaSteal',
  /** 每次命中回復的魔力 */
  'manaOnHit',
  /** 每秒回復最大生命的比例 */
  'hpRegenPct',
  /** 每秒回復最大魔力的比例（與固定值 manaRegen 相加） */
  'manaRegenPct',
]);
export type StatId = z.infer<typeof StatIdSchema>;

export const ModifierKindSchema = z.enum(['flat', 'increased', 'more']);

/** 技能等級上限（Lv5） */
export const MAX_SKILL_RANK = 5;

/** 固定值，或依技能等級 Lv1～Lv5 分別指定 */
export const RankNumberSchema = z.union([
  z.number(),
  z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
]);
export type RankNumber = z.infer<typeof RankNumberSchema>;

/** 取某等級的值（Lv 超出範圍時取最接近的一級） */
export function rankValue(value: RankNumber, rank: number): number {
  if (typeof value === 'number') return value;
  return value[Math.min(Math.max(rank, 1), value.length) - 1]!;
}

export const ElementSchema = z.enum(['physical', 'fire', 'cold', 'lightning', 'poison']);
export type Element = z.infer<typeof ElementSchema>;
