import { z } from 'zod';
import { ElementSchema, RankNumberSchema, RankRangeSchema } from './common';

/**
 * 技能效果的資料格式。技能由多個 Effect 組合而成，Effect 可以巢狀
 * （例如投射物擊中後觸發範圍效果，範圍內每個目標再受到傷害）。
 * 執行邏輯在 game/skills/effects/，這裡只定義格式。
 */

export const StatusKindSchema = z.enum([
  /** 移動速度降低 magnitude */
  'slow',
  /** 無法行動 */
  'freeze',
  'stun',
  /** 燃燒：每秒受到 施放者 Spell Power × magnitude 的火焰傷害（magnitude 0 = 只有標記） */
  'burn',
  /** 防禦降低 magnitude */
  'armorBreak',
  /** 受到的暴擊傷害提高 magnitude */
  'weakPoint',
  /** 下一次受到的傷害降低 magnitude，觸發後消失 */
  'guard',
  /** 下一次受到近戰攻擊時，以 magnitude × 武器傷害反擊，觸發後消失 */
  'counter',
  /** 受到傷害降低 magnitude，並免疫擊退 */
  'ironWill',
  /** 只免疫擊退（Combo 的 knockbackResist 加成：整組連段期間） */
  'unstoppable',
  /** 浮空：無法行動（與暈眩相同），外觀被挑起 */
  'airborne',
  /** 標記：受到的傷害提高 magnitude */
  'marked',
  /** 下一個近戰技能傷害 +magnitude，施放時消耗 */
  'meleeEmpower',
  /** 下一個遠程技能傷害 +magnitude，施放時消耗 */
  'rangedEmpower',
  /** 中毒：總量 = 施放者武器傷害 × magnitude ×（1 + 附加毒素傷害），在持續時間內每秒結算；毒素元素、不暴擊、最多 3 層 */
  'poison',
  /** 流血：總量 = 施放者武器傷害 × magnitude，在持續時間內每秒結算；物理、每跳可暴擊、不疊層（重新命中刷新） */
  'bleed',
  /** 弱化：火焰 / 冰寒 / 閃電抗性 −magnitude、物理抗性 −physicalMagnitude（從有效抗性直接相減，可以變成負數） */
  'expose',
]);
export type StatusKind = z.infer<typeof StatusKindSchema>;

/** 對 ctx.target 造成傷害 */
export const DamageEffectSchema = z
  .strictObject({
    type: z.literal('damage'),
    element: ElementSchema,
    /** weapon：% 武器傷害；spell：% Spell Power；shield：% 盾牌本身的防禦（盾擊）；flat：使用 base */
    scaling: z.enum(['weapon', 'spell', 'shield', 'flat']),
    /** flat 的傷害範圍（可依等級分別指定） */
    base: RankRangeSchema.optional(),
    /** 每一擊的倍率（1.2 = 120%） */
    multiplier: RankNumberSchema.default(1),
    /** 連續命中次數（例如 65% × 2） */
    hits: z.int().positive().default(1),
    /** 條件加成：目標有某狀態、或 HP 低於某比例時 */
    bonus: z
      .strictObject({
        when: z.union([
          z.strictObject({ status: StatusKindSchema }),
          z.strictObject({ hpBelow: z.number().min(0).max(1) }),
        ]),
        damagePct: RankNumberSchema.default(0),
        critChance: z.number().nonnegative().default(0),
      })
      .optional(),
  })
  .refine((e) => e.scaling !== 'flat' || e.base !== undefined, { message: "scaling 為 'flat' 時必須提供 base" });

/** 對目標（或自己）施加狀態 */
export const StatusEffectSchema = z.strictObject({
  type: z.literal('status'),
  status: StatusKindSchema,
  target: z.enum(['target', 'self']).default('target'),
  duration: RankNumberSchema,
  magnitude: RankNumberSchema.default(0),
  /** 弱化（expose）的物理抗性降低；其他狀態不使用 */
  physicalMagnitude: RankNumberSchema.default(0),
  /** 觸發機率 */
  chance: RankNumberSchema.default(1),
  /** 同一個目標最多疊幾層（每層各自計時、各自結算；1 = 不疊層，重新命中刷新）。中毒固定最多 3 層 */
  maxStacks: z.int().positive().default(1),
  /** 燃燒的基礎：spell = 法術強度、attack = 攻擊力（武器平均傷害與法術強度取高；戰術技能用） */
  burnScaling: z.enum(['spell', 'attack']).default('spell'),
});

/** 把目標往遠離效果中心的方向推開 */
export const KnockbackEffectSchema = z.strictObject({
  type: z.literal('knockback'),
  /** 負值 = 拉向施放者（鉤索），停在施放者面前 */
  distance: RankNumberSchema,
});

/** 施放者位移；之後的效果從新位置發出 */
export const DashEffectSchema = z.strictObject({
  type: z.literal('dash'),
  distance: z.number().positive(),
  /** forward：朝施放方向（對敵技能會停在目標前）；backward：反方向 */
  direction: z.enum(['forward', 'backward']),
  /** 穿越：向前衝時不停在目標前，穿過敵人走完全程（影步、幻影突襲） */
  passThrough: z.boolean().default(false),
  /** 對位移路徑上的每個敵人執行（突進斬） */
  get onPath() {
    return z.array(EffectDefSchema).default([]);
  },
});

/** 朝施放方向發射投射物，擊中敵人或牆壁時觸發 onHit */
export const ProjectileEffectSchema = z.strictObject({
  type: z.literal('projectile'),
  /** Tile / 秒 */
  speed: z.number().positive(),
  radius: z.number().positive(),
  /** 最大飛行距離（Tile） */
  range: z.number().positive(),
  /** 發數（可依等級成長） */
  count: RankNumberSchema.default(1),
  /** 多發時的總散射角度；≥ 360 為環狀平均分布（可依等級成長） */
  spreadDeg: RankNumberSchema.default(0),
  /** 可穿透的敵人數（可依等級成長，取整數） */
  pierce: RankNumberSchema.default(0),
  /** 自動修正方向：此角度內有敵人時改朝最近的敵人發射 */
  aimAssistDeg: z.number().nonnegative().default(0),
  /** 飛完全程（沒撞到東西）時也在終點觸發 onHit（在地上滾的冰球） */
  hitAtEnd: z.boolean().default(false),
  /** 投射物的外觀（省略 = 依技能與元素）：spider = 爬行的毒蛛 */
  look: z.enum(['spider']).optional(),
  get onHit() {
    return z.array(EffectDefSchema).default([]);
  },
});

/** 以 ctx.origin 為中心，對範圍內每個敵人執行 effects */
export const AreaEffectSchema = z.strictObject({
  type: z.literal('area'),
  radius: RankNumberSchema,
  /** 中心點：origin = 效果發生位置（預設）；target = 目前目標所在位置 */
  at: z.enum(['origin', 'target']).default('origin'),
  /** 扇形角度（朝施放方向）；省略 = 360° */
  angleDeg: z.number().positive().max(360).optional(),
  /** 扇形朝向相對施放方向的旋轉角度（180 = 背後，例如尾巴橫掃；±25 = 裂地的左右分支） */
  offsetDeg: z.number().min(-180).max(180).default(0),
  /** 直線範圍：從中心沿施放方向延伸 length 格、寬 width 格的長方形（取代圓 / 扇形；radius 設為 length） */
  line: z.strictObject({ length: z.number().positive(), width: z.number().positive() }).optional(),
  /** 主要目標一定命中（近戰揮砍：目標在出招途中稍微移動也不會落空） */
  includeTarget: z.boolean().default(false),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 對目標執行 effects，再跳到附近下一個敵人（不重複） */
export const ChainEffectSchema = z.strictObject({
  type: z.literal('chain'),
  jumps: z.int().nonnegative(),
  radius: z.number().positive(),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 地面持續區域：每 interval 秒對範圍內敵人執行 effects */
export const ZoneEffectSchema = z.strictObject({
  type: z.literal('zone'),
  radius: z.number().positive(),
  /** 持續時間（秒，可依等級成長） */
  duration: RankNumberSchema,
  interval: z.number().positive(),
  /** 區域跟著施放者移動（劍刃旋舞的劍風）；施放者死亡時消失 */
  followCaster: z.boolean().default(false),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 延遲後執行 effects；可重複多次並隨機散布位置（例如箭雨、雷暴） */
export const DelayedEffectSchema = z.strictObject({
  type: z.literal('delayed'),
  delay: z.number().nonnegative(),
  repeat: z.int().positive().default(1),
  interval: z.number().nonnegative().default(0.3),
  /** 每次落點在中心點附近隨機偏移的半徑 */
  scatter: z.number().nonnegative().default(0),
  /** 每重複一次，施放方向旋轉的角度（旋轉光束） */
  spinDeg: z.number().default(0),
  /** > 0：每次的落點排成一排（與施放方向垂直、以中心點為中央），間隔 spacing 格（火牆） */
  spacing: z.number().nonnegative().default(0),
  get effects() {
    return z.array(EffectDefSchema).min(1);
  },
});

/** 在施放者周圍召喚怪物（Boss 用）。召喚物不給經驗、不掉寶，也不計入樓層擊殺數 */
export const SummonEffectSchema = z.strictObject({
  type: z.literal('summon'),
  enemyId: z.string(),
  count: z.int().positive(),
  /** 同一個施放者的召喚物同時存在的上限 */
  maxAlive: z.int().positive(),
});

/**
 * 機關（戰術技能）：佈置一個有血量的物件。血量 = 玩家最大生命 × hpPct、防禦 = 玩家防禦（即時跟隨）；
 * 屬玩家陣營，玩家的技能不會傷到它；怪物在附近時會把它當目標（balance.devices.aggroRange）。
 * 全身同時最多 balance.devices.maxAlive 個，超過時最舊的消失（不觸發 onDestroy）。
 * 子效果的施放者是玩家（吃玩家的武器傷害 / 法術強度），從機關的位置發出。
 */
export const DeviceEffectSchema = z.strictObject({
  type: z.literal('device'),
  /**
   * trip：敵人碰到 line 就觸發 onTrigger（每個敵人一次，共 triggers 次）；proximity：待命 armDelay 秒後，敵人進入 triggerRadius 就觸發並消失；
   * turret：每 interval 秒朝 range 內最近的敵人觸發 onShot，共 shots 次；none：只等時間到或被打壞；
   * minion：會移動的召喚物（毒蛛）——追 range 內最近的敵人，貼近到 triggerRadius 內每 interval 秒對它觸發 onShot（不限次數），沒有敵人時跟著玩家
   */
  behavior: z.enum(['trip', 'proximity', 'turret', 'none', 'minion']),
  hpPct: RankNumberSchema,
  /** 持續時間（秒），到期觸發 onExpire 後消失 */
  duration: RankNumberSchema,
  /** 這個技能的機關同時存在的上限（全身上限 balance.devices.maxAlive 另計；預設不另外限制，只受全身上限） */
  maxAlive: RankNumberSchema.default(99),
  /** 一次佈置幾個（minion：圍在指定位置周圍） */
  count: z.int().positive().default(1),
  /** minion 的移動速度（格 / 秒） */
  moveSpeed: z.number().positive().default(3.5),
  /** 共用上限的群組（不同裝備的毒蛛合計 maxAlive 隻）；有群組的機關不佔全身機關上限 */
  group: z.string().optional(),
  /** 放在施放者面前幾格（絆索網）；省略 = 放在指定位置 */
  forward: z.number().positive().optional(),
  /** trip：垂直於面向的長方形（length 為橫向長度） */
  line: z.strictObject({ length: z.number().positive(), width: z.number().positive() }).optional(),
  triggers: RankNumberSchema.default(1),
  triggerRadius: z.number().positive().default(1),
  armDelay: z.number().nonnegative().default(0),
  interval: z.number().positive().default(1),
  shots: RankNumberSchema.default(1),
  /** turret 的索敵距離 */
  range: z.number().positive().default(6),
  get onTrigger() {
    return z.array(EffectDefSchema).default([]);
  },
  get onShot() {
    return z.array(EffectDefSchema).default([]);
  },
  /** 被怪物打壞時 */
  get onDestroy() {
    return z.array(EffectDefSchema).default([]);
  },
  /** 時間到（或 turret 射完）時 */
  get onExpire() {
    return z.array(EffectDefSchema).default([]);
  },
});

export const EffectDefSchema = z.discriminatedUnion('type', [
  DamageEffectSchema,
  StatusEffectSchema,
  KnockbackEffectSchema,
  DashEffectSchema,
  ProjectileEffectSchema,
  AreaEffectSchema,
  ChainEffectSchema,
  ZoneEffectSchema,
  DelayedEffectSchema,
  SummonEffectSchema,
  DeviceEffectSchema,
]);

export type DamageEffectDef = z.infer<typeof DamageEffectSchema>;
export type StatusEffectDef = z.infer<typeof StatusEffectSchema>;
export type KnockbackEffectDef = z.infer<typeof KnockbackEffectSchema>;
export type DashEffectDef = z.infer<typeof DashEffectSchema>;
export type ProjectileEffectDef = z.infer<typeof ProjectileEffectSchema>;
export type AreaEffectDef = z.infer<typeof AreaEffectSchema>;
export type SummonEffectDef = z.infer<typeof SummonEffectSchema>;
export type DeviceEffectDef = z.infer<typeof DeviceEffectSchema>;

/** 一個效果底下的巢狀效果（投射物 onHit、位移 onPath、機關的各種觸發、其他的 effects） */
export function nestedEffects(e: EffectDef): readonly EffectDef[] {
  switch (e.type) {
    case 'projectile':
      return e.onHit;
    case 'dash':
      return e.onPath;
    case 'device':
      return [...e.onTrigger, ...e.onShot, ...e.onDestroy, ...e.onExpire];
    default:
      return 'effects' in e ? e.effects : [];
  }
}
export type ChainEffectDef = z.infer<typeof ChainEffectSchema>;
export type ZoneEffectDef = z.infer<typeof ZoneEffectSchema>;
export type DelayedEffectDef = z.infer<typeof DelayedEffectSchema>;
export type EffectDef = z.infer<typeof EffectDefSchema>;
export type EffectType = EffectDef['type'];
