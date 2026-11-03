import { z } from 'zod';
import { IdSchema, ModifierKindSchema, RangeSchema, StatIdSchema } from './common';

/** 怪物圖鑑的分類 */
export const EnemyFamilySchema = z.enum(['undead', 'beast', 'chitin', 'brute', 'spitter', 'floater', 'parasite', 'demon', 'boss', 'other']);
export type EnemyFamily = z.infer<typeof EnemyFamilySchema>;

/** Boss 的階段：HP 降到 hpBelow 以下時進入（一次性套用 modifiers，並可改用另一組技能） */
/**
 * 連發：有目標時每隔 every 秒輪流對目標發動一招，不用施法、不打斷其他動作。
 * range：目標在幾格內才發；originBack：從身後幾格發出（噬界足眼的尾巴）。
 */
export const BarrageSchema = z.strictObject({ skills: z.array(IdSchema).min(1), every: z.number().positive(), range: z.number().positive(), originBack: z.number().nonnegative().default(0) });
export type Barrage = z.infer<typeof BarrageSchema>;

export const BossPhaseSchema = z.strictObject({
  hpBelow: z.number().gt(0).lt(1),
  /** 顯示在 Boss 血條與畫面上，例如「狂怒」「火焰附魔」 */
  label: z.string(),
  modifiers: z.array(z.strictObject({ stat: StatIdSchema, kind: ModifierKindSchema.default('flat'), value: z.number() })).default([]),
  /** 進入此階段後改用的技能（取代原本的技能；第一個為主要攻擊，其餘依序為特殊技能） */
  skills: z.array(IdSchema).min(1).optional(),
  /** 進入此階段時模型的外觀（模型的 phasePoses / phaseHidden 的 index；省略 = 階段編號） */
  look: z.int().nonnegative().optional(),
  /**
   * 交替的姿態（噬界足眼的爪子）：進入此階段先收合 closedFor 秒（受到的傷害 −reduction、站著不動、改用 closedSkills，外觀 closedLook），
   * 再張開 openFor 秒（這個階段的 skills，外觀 openLook），如此交替。
   */
  clawCycle: z
    .strictObject({ closedFor: z.number().positive(), openFor: RangeSchema, reduction: z.number().gt(0).lt(1), closedBarrage: BarrageSchema, closedLook: z.int().nonnegative(), openLook: z.int().nonnegative() })
    .optional(),
  /** 進入此階段時停住幾秒（什麼都不做、任何攻擊無效） */
  pause: z.number().positive().optional(),
  /** 停住結束後，身上脫離出一隻獨立的怪物（look 是之後的外觀）；牠死掉時本體僵直 stagger 秒，本體死掉時牠一起消失 */
  detach: z.strictObject({ enemyId: IdSchema, stagger: z.number().positive(), look: z.int().nonnegative() }).optional(),
});
export type BossPhase = z.infer<typeof BossPhaseSchema>;

/**
 * 被動技能：戰鬥中（有目標時）自動發動，不用施法、不打斷其他動作（熔岩巨獸走過留下岩漿、身上不定時噴發）。
 * every = 每隔幾秒（隨機 ±30%）；trail = 每移動幾格。在施放者腳下以等級 1 執行。
 */
export const EnemyPassiveSchema = z
  .strictObject({
    skill: IdSchema,
    every: z.number().positive().optional(),
    trail: z.number().positive().optional(),
  })
  .refine((p) => (p.every === undefined) !== (p.trail === undefined), { message: '被動技能要設定 every 或 trail 其中一個' });
export type EnemyPassive = z.infer<typeof EnemyPassiveSchema>;

export const EnemyDefSchema = z
  .strictObject({
  id: IdSchema,
  name: z.string(),
  hp: z.number().positive(),
  damage: RangeSchema,
  defense: z.number().nonnegative(),
  /** Tile / 秒；0 = 不會移動（例如訓練木樁） */
  moveSpeed: z.number().nonnegative(),
  /** 碰撞半徑（Tile） */
  radius: z.number().positive().max(0.5).default(0.35),
  attackRange: z.number().positive(),
  /** 每秒攻擊次數 */
  attackSpeed: z.number().positive().default(1),
  /** 偵測範圍（Tile）：範圍內且視線未被牆擋住才會發現玩家 */
  detectRange: z.number().nonnegative(),
  /** 離出生點超過此距離就放棄追擊、走回原位（剛被打中時不放棄） */
  leashRange: z.number().positive().default(28),
  /** none = 不行動（訓練木樁）；melee = 貼身攻擊；ranged = 保持距離攻擊，被貼身時後退 */
  ai: z.enum(['none', 'melee', 'ranged']),
  /** ranged：目標比這個距離近時後退（Tile） */
  keepDistance: z.number().nonnegative().default(0),
  /**
   * 第一個技能為主要攻擊；其餘為特殊技能（應有冷卻），冷卻結束且目標在範圍內時優先使用。
   */
  skills: z.array(IdSchema).default([]),
  lootTable: IdSchema.optional(),
  xp: z.number().nonnegative(),
  /** Boss：冰凍改為強力緩速 */
  boss: z.boolean().default(false),
  /** 體型倍率（只影響外觀大小；Boss 為主角的 2 倍以上）。一般怪物另有隨機體型，見 balance.enemySize */
  size: z.number().positive().default(1),
  /** 固定全抗性（物理減傷與四種元素抗性；取代魔王 / 精英的樓層減傷） */
  fixedResist: z.number().min(0).max(1).optional(),
  /**
   * 天生的元素抗性（與怪物的屬性相同：火焰身體的怪抗火、會下毒的怪抗毒）。
   * 疊加在樓層減傷之上；實際抗性上限見 balance.combat.maxResist。
   * 一般怪物不超過魔王最高天生抗性的 70%（目前魔王最高 30% → 一般怪最高 20%；tests/data/EnemyResist.test.ts 把關）。
   */
  resist: z
    .strictObject({
      fire: z.number().min(0).max(0.75),
      cold: z.number().min(0).max(0.75),
      lightning: z.number().min(0).max(0.75),
      poison: z.number().min(0).max(0.75),
    })
    .partial()
    .default({}),
  /** 噴錢的怪（結晶獸）：死亡時噴出 balance.goldWalker 的金幣，單獨行動（不招呼同伴、不被同伴叫醒） */
  treasure: z.boolean().default(false),
  /** 死亡後 delay 秒在原地發動的技能（晶核碎裂）；地上先顯示半徑 warnRadius 的提示，技能等級 1、施放者已死亡 */
  onDeath: z.strictObject({ skill: IdSchema, delay: z.number().positive(), warnRadius: z.number().positive() }).optional(),
  /** 被動技能（見 EnemyPassiveSchema） */
  passives: z.array(EnemyPassiveSchema).default([]),
  /** 主角死在牠的 leashRange 內時回復最大生命的這個比例（打牠不能只靠死亡硬換；不會退回前一個階段） */
  healOnPlayerDeath: z.number().gt(0).max(1).optional(),
  /** 連發（見 BarrageSchema） */
  barrage: BarrageSchema.optional(),
  /** Boss 的階段變化（依 hpBelow 由高到低） */
  phases: z.array(BossPhaseSchema).default([]),
  /** 怪物圖鑑：分類與介紹 */
  family: EnemyFamilySchema.default('undead'),
  lore: z.string().default(''),
  })
  .refine((e) => e.ai === 'none' || e.skills.length > 0, { message: '有 AI 的怪物至少需要一個技能' })
  .refine((e) => e.ai !== 'ranged' || e.keepDistance > 0, { message: 'ranged AI 需要設定 keepDistance' })
  .refine((e) => e.phases.every((p, i) => i === 0 || p.hpBelow < e.phases[i - 1]!.hpBelow), { message: 'phases 必須依 hpBelow 由高到低排列' })
  .refine((e) => e.boss || e.phases.length === 0, { message: '只有 Boss 可以設定 phases' });

export type EnemyDef = z.infer<typeof EnemyDefSchema>;
export type EnemyDefInput = z.input<typeof EnemyDefSchema>;
