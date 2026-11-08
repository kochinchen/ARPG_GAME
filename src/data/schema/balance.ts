import { z } from 'zod';
import { ElementSchema, IdSchema, RangeSchema, StatIdSchema } from './common';
import { EliteConfigSchema } from './elite';
import { RaritySchema, RarityWeightsSchema, WeaponTypeSchema } from './item';
import { ActiveCategorySchema } from './skill';

const SizeRollSchema = z.strictObject({
  mean: z.number().positive(),
  sd: z.number().nonnegative(),
  min: z.number().positive(),
  max: z.number().positive(),
  /** 體型每大 100%，HP 與傷害提高多少（0.5 = 體型 200% 時 150%） */
  statPerSize: z.number().nonnegative(),
});

/** 屬性的一項效果：每點給 stat 一個 flat 加成 */
export const AttributeEffectSchema = z.strictObject({
  stat: StatIdSchema,
  perPoint: z.number().positive(),
  /** 顯示：效果名稱，與是否以百分比顯示 */
  label: z.string(),
  percent: z.boolean().default(false),
});

/** 屬性點可以加的項目；一個屬性可以有多項效果 */
export const AttributeDefSchema = z.strictObject({
  /** 存檔使用的 ID，改名需要寫 Migration */
  id: z.string().regex(/^[a-z]+$/),
  name: z.string(),
  effects: z.array(AttributeEffectSchema).min(1),
  /** 最多可以加幾點（例如暴擊率避免超過 100%） */
  maxPoints: z.int().positive().optional(),
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

/** 技能類型的共通特性（近戰承擔貼身風險，續航與 MP 效率較好） */
const CategoryTraitsSchema = z.strictObject({
  /** MP 消耗倍率 */
  manaCost: z.number().positive(),
  /** 吸血效率倍率 */
  lifeSteal: z.number().nonnegative(),
});

const ComboSlotsSchema = z.tuple([IdSchema.nullable(), IdSchema.nullable(), IdSchema.nullable()]);

export const BalanceSchema = z.strictObject({
  maxLevel: z.int().positive(),
  /** 升到下一級所需經驗 = base × level ^ exponent */
  xpCurve: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
  skillPointsPerLevel: z.int().nonnegative(),
  /** 升級時各屬性基礎值的成長 */
  statsPerLevel: z.partialRecord(StatIdSchema, z.number()).default({}),
  maxSkillRank: z.int().positive(),
  /** 各 Tier 需要的角色等級，index 0 = T1 */
  tierLevelReq: z.tuple([z.int(), z.int(), z.int(), z.int()]),
  /** Mastery 後每升一級得到的 T4 開通次數 */
  t4UnlockChargesPerLevel: z.int().nonnegative(),
  player: z.strictObject({
    baseHp: z.number().positive(),
    baseMana: z.number().positive(),
    manaRegenPerSec: z.number().nonnegative(),
    /** 基礎每秒回復：最大生命 / 最大魔力的比例（隨上限成長，與裝備、技能的回復相加） */
    hpRegenPctPerSec: z.number().nonnegative(),
    manaRegenPctPerSec: z.number().nonnegative(),
    /** 脫戰回復：delay 秒沒有受到傷害後，生命回復 × multiplier */
    outOfCombatRegen: z.strictObject({ delay: z.number().nonnegative(), multiplier: z.number().min(1) }),
    /** Tile / 秒 */
    moveSpeed: z.number().positive(),
    /** 碰撞半徑（Tile） */
    radius: z.number().positive().max(0.5),
    /** 空手傷害；M5 起由武器提供 */
    baseDamage: RangeSchema,
    /** 魔法技能傷害基準 */
    spellPower: z.number().nonnegative(),
    /** 每秒攻擊次數 */
    attackSpeed: z.number().positive(),
    /** 攻擊距離（Tile，從雙方邊緣算起） */
    attackRange: z.number().positive(),
    critChance: z.number().min(0).max(1),
    defense: z.number().nonnegative(),
    /** 死亡後幾秒回到存檔點 */
    respawnDelay: z.number().nonnegative(),
    /** 使用的藥水種類（PotionDef ID） */
    potionId: IdSchema,
    startingPotions: z.int().nonnegative(),
    /** 背包格數：寬 × 高，每格放一件物品或一疊藥水 */
    inventoryCols: z.int().positive(),
    inventoryRows: z.int().positive(),
    /** 新角色一開始會的技能（Lv1）；其餘技能以技能點學習 */
    startingSkills: z.array(IdSchema).default([]),
    startingSkillPoints: z.int().nonnegative().default(0),
    /** 每組連段第 1、2、3 格的解鎖等級 */
    comboSlotLevels: z.tuple([z.int().positive(), z.int().positive(), z.int().positive()]),
    /** Q / W / E / R / A / S / D 各組連段的解鎖等級 */
    comboKeyLevels: z.array(z.int().positive()).length(7),
    /** 新角色的技能配置（必須是 startingSkills 內的技能） */
    startingLoadout: z.strictObject({
      left: IdSchema,
      /** Q / W / E / R / A / S / D 各 3 步連段 */
      combos: z.array(ComboSlotsSchema).length(7),
      supports: z.tuple([IdSchema.nullable(), IdSchema.nullable(), IdSchema.nullable()]),
    }),
  }),
  /** 屬性點：每升一級得到 pointsPerLevel 點，自由加到 list 中的項目 */
  attributes: z
    .strictObject({
      pointsPerLevel: z.int().nonnegative(),
      list: z.array(AttributeDefSchema).min(1),
    })
    .refine((a) => new Set(a.list.map((d) => d.id)).size === a.list.length, '屬性 ID 不可重複'),
  /** 樓層難度：第 N 層的倍率 = 1 + 每層成長 × (N - 1) */
  difficulty: z.strictObject({
    hpPerFloor: z.number().nonnegative(),
    damagePerFloor: z.number().nonnegative(),
    defensePerFloor: z.number().nonnegative(),
    xpPerFloor: z.number().nonnegative(),
    densityPerFloor: z.number().nonnegative(),
    /** 怪物密度倍率上限 */
    maxDensityMultiplier: z.number().min(1),
    /** 前期怪物數量加成：第 1～fullUntil 層 +bonus，之後線性遞減，第 fadeTo 層起為 0 */
    earlyDensityBoost: z.strictObject({ bonus: z.number().nonnegative(), fullUntil: z.int().positive(), fadeTo: z.int().positive() }),
    /**
     * 怪物強化（乘在每層成長之上）：[第 1 層, 第 toFloor 層] 之間線性增加，之後維持最高值。
     * bossHp 給樓層魔王與挑戰樓層的魔王；skillArea 放大怪物特殊技能（普通攻擊以外）的圓形 / 扇形範圍，直線招式不變。
     */
    monsterBoost: z.strictObject({
      toFloor: z.int().positive(),
      hp: z.tuple([z.number().positive(), z.number().positive()]),
      bossHp: z.tuple([z.number().positive(), z.number().positive()]),
      damage: z.tuple([z.number().positive(), z.number().positive()]),
      skillArea: z.tuple([z.number().positive(), z.number().positive()]),
      /** 魔王（含中途小王）的範圍倍率，取代 skillArea */
      bossSkillArea: z.tuple([z.number().positive(), z.number().positive()]),
      /** 魔王放大後的半徑上限（格）：看招式最大的範圍，整招等比例放大到這裡為止；本來就超過的不放大 */
      bossSkillAreaCap: z.number().positive(),
      xp: z.number().positive(),
    }),
  }),
  floor: z.strictObject({
    /** 樓梯口與出口的安全範圍（Tile）：大於所有怪物的偵測距離 */
    stairsSafeRadius: z.number().positive(),
    /** 存檔點與出口附近多少格內不放怪物（避免重生後立刻被圍） */
    safeRadius: z.number().nonnegative(),
    /** 走到中途存檔點多近時啟動 */
    checkpointRadius: z.number().positive(),
  }),
  /** 終局（docs/ENDGAME.md）：30 層通關、31～35 極限挑戰 */
  endgame: z.strictObject({
    /** 一般模式的最後一層：擊敗這層的魔王 = 已通關；出口先詢問是否進入挑戰 */
    lastNormalFloor: z.int().positive(),
    /** 最後一層：擊敗這層的魔王 = 已完成隱藏難關；沒有下一層 */
    lastFloor: z.int().positive(),
    /** 挑戰樓層的中途小王（魔王數值 × 樓層成長後，再乘這些倍率；沒有階段變化） */
    miniBoss: z.strictObject({
      maxPerFloor: z.int().positive(),
      /** 小王空地的直徑：小王身體寬度的幾倍 */
      arenaBodies: z.number().positive(),
      hpMultiplier: z.number().positive(),
      damageMultiplier: z.number().positive(),
      xpMultiplier: z.number().positive(),
      lootTable: IdSchema,
    }),
  }),
  /** 怪物學主角技能（data/mimicSkills.ts 產生怪物版技能；GameWorld 生成怪物時抽） */
  enemyMimic: z.strictObject({
    /** 由淺到深：minFloor 起可學到第 1～maxTier 層的技能，一般怪學到的機率 chance（精英、首領必定學到） */
    unlocks: z
      .array(z.strictObject({ minFloor: z.int().positive(), maxTier: z.int().min(1).max(4), chance: z.number().min(0).max(1) }))
      .min(1)
      .refine((u) => u.every((x, i) => i === 0 || x.minFloor > u[i - 1]!.minFloor), { message: 'unlocks 必須依 minFloor 由小到大排列' }),
    /** 技能等級：第一個解鎖樓層為 Lv1，之後每這麼多層 +1（最高 Lv5） */
    floorsPerRank: z.int().positive(),
    /** 怪物版的傷害與持續傷害倍率 */
    damage: z.number().positive().max(1),
    cooldownMultiplier: z.number().min(1),
    /** 怪物版的冷卻至少 minCooldown + cooldownPerTier ×（層級 − 1）秒（主角沒有冷卻的技能也不會連發） */
    minCooldown: z.number().nonnegative(),
    cooldownPerTier: z.number().nonnegative(),
    castTimeMultiplier: z.number().min(1),
  }),
  /** 怪物的集體戰術（AiSystem 的 SquadTactics） */
  enemyTactics: z.strictObject({
    /** 怪物發現敵人時，叫醒這個距離內、看得到牠的閒置同伴（只傳一層，不會連鎖） */
    alertRadius: z.number().positive(),
    /** 被叫醒的同伴過幾秒才行動（秒，最小～最大） */
    alertDelay: RangeSchema,
    /** 離目標這個距離內才照站位包圍；更遠就直接追 */
    surroundRange: z.number().positive(),
    /** 同時貼身攻擊同一個目標的近戰上限；其餘在外圈等候補位 */
    maxEngaged: z.int().positive(),
    /** 包圍時在目標背後留下的缺口（度）；0 = 整圈包圍（設計者 2026-11-07 拿掉圍師必闕） */
    gapDegrees: z.number().min(0).max(180),
    /** 站位間距至少照這麼多個站位平分（怪少時不會一下子散到背後） */
    minSlots: z.int().min(2),
    /** 移動速度至少這麼快的近戰怪當遊擊：拿背後的站位，繞過目標的側面過去 */
    flankSpeed: z.number().positive(),
    /** 等候補位的怪站在攻擊站位外這麼遠（Tile） */
    waitDistance: z.number().nonnegative(),
    /** 後排（遠程、法師）比自己的保持距離再退後這麼多，站在前排後方（Tile） */
    backlineOffset: z.number().nonnegative(),
    /** 每隔幾秒重新分配站位（太頻繁會抖動） */
    reassignInterval: z.number().positive(),
    /** 閃避飛來的投射物：追擊中的怪物看到會打中自己的投射物時，往旁邊閃開（魔王不閃） */
    dodge: z.strictObject({
      /** 閃避機率：第 1 層～第 maxFloor 層之間線性增加 */
      chance: RangeSchema,
      maxFloor: z.int().positive(),
      /** 投射物這麼多秒內會打到才反應 */
      lookahead: z.number().positive(),
      /** 每次反應（不論有沒有閃）之後，這麼多秒內不再反應 */
      cooldown: z.number().nonnegative(),
      /** 閃到投射物邊緣外再多這麼遠（Tile） */
      margin: z.number().nonnegative(),
    }),
    /** 求援：一群怪被打掉超過 casualtyRatio，派一隻去叫附近閒置的其他群（最多 maxPacks 群） */
    reinforce: z.strictObject({
      casualtyRatio: z.number().min(0).max(1),
      /** 離傳令兵這個距離內的群才會被叫（Tile） */
      callRange: z.number().positive(),
      maxPacks: z.int().positive(),
      /** 走到離那一群這麼近就叫醒牠們（Tile） */
      reachDistance: z.number().positive(),
    }),
    /** 躲開地上的範圍傷害（主角的火海、毒池）：路線繞開，站在裡面就走出來（魔王不躲） */
    avoidZones: z.strictObject({
      /** 走到區域邊緣外再多這麼遠（Tile） */
      margin: z.number().nonnegative(),
      /** 尋路時每經過一格區域多算這麼多格的距離（繞路不超過這麼遠就繞） */
      pathCost: z.number().nonnegative(),
      /** 累積躲了這麼多秒還是過不去，就不管區域硬闖 */
      patience: z.number().positive(),
      /** 硬闖持續的秒數 */
      brave: z.number().positive(),
    }),
    /** 預判射擊：投射物瞄準目標沿著目前路線「飛到時會到的位置」（魔王不預判） */
    leadShot: z.strictObject({
      /** 預判的比例（0 = 瞄準目前位置、1 = 完全預判）：第 1 層～第 maxFloor 層之間線性增加 */
      lead: RangeSchema,
      maxFloor: z.int().positive(),
      /** 最多預判幾秒後的位置 */
      maxTime: z.number().positive(),
    }),
    /** 誘敵：血少的怪往另一群閒置的怪逃，把追來的主角帶進去（不叫醒牠們） */
    lure: z.strictObject({
      hpBelow: z.number().gt(0).lt(1),
      /** 每隻怪只擲一次 */
      chance: z.number().min(0).max(1),
      /** 這個距離內的群才會被當成逃跑的方向（Tile） */
      range: z.number().positive(),
      maxTime: z.number().positive(),
      /** 離那一群這麼近就算到了，回頭打（Tile） */
      arriveDistance: z.number().positive(),
    }),
    /** 撿藥水（tactics 有 potion 的怪）：血少時跑去撿地上的藥水、當場喝掉，主角就撿不到了 */
    potion: z.strictObject({
      hpBelow: z.number().gt(0).lt(1),
      range: z.number().positive(),
      /** 回復最大 HP 的比例 */
      heal: z.number().gt(0).max(1),
    }),
    /** 吃屍體（tactics 有 devour 的怪）：回血、變大、傷害提高 */
    devour: z.strictObject({
      hpBelow: z.number().gt(0).max(1),
      range: z.number().positive(),
      duration: z.number().positive(),
      heal: z.number().gt(0).max(1),
      /** 每吃一次體型增加的比例 */
      grow: z.number().nonnegative(),
      /** 每吃一次傷害增加的比例 */
      damage: z.number().nonnegative(),
      maxEats: z.int().positive(),
    }),
    /** 復活（tactics 有 raise 的怪）：讓不死族的屍體站起來 */
    raise: z.strictObject({
      range: z.number().positive(),
      duration: z.number().positive(),
      /** 站起來時的血量比例 */
      hp: z.number().gt(0).max(1),
      cooldown: z.number().positive(),
      max: z.int().positive(),
    }),
    /** 移動速度隨狀況變化（乘在基本速度上） */
    pace: z.strictObject({
      /** 主角在 sprintDistance 格外時，追擊的速度加成 */
      sprint: z.number().nonnegative(),
      sprintDistance: z.number().positive(),
      /** 誘敵逃跑、傳令兵求援、跑去撿藥水 */
      errand: z.number().nonnegative(),
      /** 遊擊繞到目標背後的途中 */
      flank: z.number().nonnegative(),
      /** 靈活派（agile）被貼近後退時 */
      retreat: z.number().nonnegative(),
    }),
    /** 靈活派（弓手）每一箭的飛行速度與射程：隨目標距離、隨機與精英提高 */
    agile: z
      .strictObject({
        /** 目標在 near 格內不加、far 格外加滿 */
        near: z.number().nonnegative(),
        far: z.number().positive(),
        /** 飛行速度加成（加滿時） */
        speed: z.number().nonnegative(),
        /** 射程加成（加滿時；比例，乘在技能的出手距離上） */
        range: z.number().nonnegative(),
        /** 每一箭隨機 ± 這麼多 */
        jitter: z.number().nonnegative(),
        /** 精英再乘上 1 + elite */
        elite: z.number().nonnegative(),
      })
      .refine((a) => a.far > a.near, { message: 'agile.far 要大於 near' }),
    /**
     * 躲掩護（tactics 有 cover 的遠程怪）：同一個目標附近有正在追擊的巨獸（tactics 有 shield）時，站到巨獸背後（目標 → 巨獸的延長線上）射擊。
     * 站在那裡打不到目標（目標跑遠了）就離開掩護、自己追出來
     */
    cover: z.strictObject({
      /** 每隻巨獸最多掩護幾隻 */
      perShield: z.int().positive(),
      /** 站在巨獸背後、兩者邊緣之間隔這麼遠（Tile） */
      gap: z.number().nonnegative(),
      /** 第二隻以後左右錯開這麼遠（Tile） */
      spread: z.number().nonnegative(),
      /** 從掩護位置到目標的距離要比射程短這麼多才躲（Tile） */
      reachMargin: z.number().nonnegative(),
      /** 離掩護位置這麼遠，出手之間就走回去（Tile） */
      slack: z.number().positive(),
    }),
    /**
     * 圍獵（tactics 有 hunt 的野獸）：同一個目標附近至少 minHunters 隻時，先在 ring 格外繞圈（circle 秒，不出手），
     * 時間到或其中一隻被打，就一起撲上去（第一隻先撲，其他每隔 follow 秒跟上），strike 秒後再回去繞圈
     */
    hunt: z.strictObject({
      minHunters: z.int().min(2),
      ring: z.number().positive(),
      circle: RangeSchema,
      strike: z.number().positive(),
      follow: z.number().nonnegative(),
      /** 繞圈時每次重新分配站位往前轉幾度 */
      spinDeg: z.number().nonnegative(),
    }),
    /**
     * 蜂擁（tactics 有 swarm 的孵化蜘蛛）：不排包圍站位、不等候補位，直接一擁而上。
     * 同一隻母體生的、還在打的少於 min 隻，就逃回母體身邊（ring 格）守著，目標走進母體 guardRange 格內才出手
     */
    swarm: z.strictObject({ min: z.int().positive(), guardRange: z.number().positive(), ring: z.number().positive() }),
    /** 護衛（tactics 有 guard 的召喚物，小惡魔）：召喚者活著時站在召喚者與目標之間 ring 格，目標走進召喚者 range 格內、或自己被打才出手 */
    guard: z.strictObject({ range: z.number().positive(), ring: z.number().positive() }),
    /** 潰散（tactics 有 rout 的召喚物）：召喚者死了就往遠離目標的方向逃 distance 格，最多 duration 秒，之後回頭打 */
    rout: z.strictObject({ distance: z.number().positive(), duration: z.number().positive() }),
    /** 自爆（tactics 有 kamikaze 的怪，火囊爬行者）：血量低於 hpBelow 就改用 skill（自爆）衝上去，不再保持距離 */
    kamikaze: z.strictObject({ hpBelow: z.number().gt(0).lt(1), skill: IdSchema }),
    /** 鑽地閃避（tactics 有 burrow 的怪）：看到會打中自己的投射物時，以 chance 機率改用 skill 鑽進地下（冷卻看技能），不受移動速度限制 */
    burrow: z.strictObject({ chance: z.number().min(0).max(1), skill: IdSchema }),
  }),
  /** 精英怪（每群隊長）的共通強化 */
  elite: EliteConfigSchema,
  /**
   * 每層的首領（沒有魔王的樓層）：從該層的怪物池抽一隻，精英強化改用這些倍率、詞綴 affixCount 個；
   * 守在出口前 guardDistance 格，擊敗後出口才會開（清怪比例照舊），原地出現首領寶箱（chestLootTable）
   */
  /** 《井誌》獎勵：每條路線的橘裝武器種類與鎧甲（3/4）、全部收集的額外屬性點（4/4） */
  book: z.strictObject({
    weaponKinds: z.strictObject({ melee: z.array(z.enum(['sword', 'axe', 'bow', 'staff'])), ranged: z.array(z.enum(['sword', 'axe', 'bow', 'staff'])), magic: z.array(z.enum(['sword', 'axe', 'bow', 'staff'])) }),
    armors: z.strictObject({ melee: z.array(z.string()), ranged: z.array(z.string()), magic: z.array(z.string()) }),
    attributePoints: z.int().nonnegative(),
  }),
  /**
   * 噴錢的結晶獸：單獨出現。每次進入樓層（新樓層或回到上一層），chances 每個機率各自擲一次，中幾個就出現幾隻。
   * 讀檔不重擲（不能靠重新整理刷錢）。
   * 血量、傷害、經驗與精英相同，樓層減傷也和精英一樣，但沒有詞綴、光圈與精英掉落。金幣由第 1 層到最後一層線性增加。
   */
  goldWalker: z.strictObject({
    enemies: z.array(IdSchema).min(1),
    /** 從第幾層開始出現 */
    minFloor: z.int().positive(),
    chances: z.array(z.number().gt(0).max(1)).min(1),
    /** 第 1 層、最後一層的金幣 */
    gold: z.tuple([z.int().positive(), z.int().positive()]),
    /** 金幣的隨機幅度（0.1 = ±10%） */
    variance: z.number().min(0).max(1),
    /** 分成幾堆噴出來 */
    piles: z.int().positive(),
    /** 離其他怪物至少幾格（單獨行動） */
    alone: z.number().positive(),
  }),
  // 隱藏魔王：見 balance.ts
  hiddenBoss: z.strictObject({
    /** 預留隱藏房的樓層 */
    roomFloors: z.array(z.int().positive()).min(1),
    /** 隱藏房的邊長（Tile） */
    roomSize: z.number().positive(),
    chance: z.number().gt(0).max(1),
    bosses: z
      .array(
        z.strictObject({
          enemyId: IdSchema,
          floors: z.array(z.int().positive()).min(1),
          elements: z.array(ElementSchema).min(2),
          /** true：elements 全部都用；false：每次出現抽兩種 */
          allElements: z.boolean().default(false),
          /** 每次出現從 stats 抽 count 個抗性，數值在 value 之間（抗性不會是負值） */
          // 每個抽到的抗性 = 當層隱藏魔王的樓層減傷，疊加在樓層減傷上
          resists: z.strictObject({ stats: z.array(StatIdSchema).min(1), count: z.int().positive() }).optional(),
        }),
      )
      .min(1),
  }),
  champion: z.strictObject({
    hpMultiplier: z.number().positive(),
    damageMultiplier: z.number().positive(),
    xpMultiplier: z.number().positive(),
    radiusMultiplier: z.number().positive(),
    affixCount: z.tuple([z.int().positive(), z.int().positive()]),
    guardDistance: z.number().positive(),
    chestLootTable: IdSchema,
  }),
  /**
   * 怪物的隨機體型（常態分佈，限制在 min～max）：近戰（物理）怪體型差異大，HP 與傷害跟著提高；
   * 遠程 / 法術怪差異小、數值不變。倍率 = 1 + (體型 − 1) × statPerSize。Boss 與訓練木樁不套用。
   */
  /**
   * 詞綴強度：
   * - 階級：物品等級每 levelsPerTier 提高一階（T1～maxTier），數值 × (1 + 詞綴 growth × (階級 − 1))
   * - 稀有度倍率：紫 / 橘 / 紅的詞綴數值再乘上擲骰的倍率（例如紫 120%～150%、紅最高 300%）
   */
  affixPower: z.strictObject({
    levelsPerTier: z.int().positive(),
    maxTier: z.int().positive(),
    rarity: z.record(RaritySchema, z.tuple([z.number().positive(), z.number().positive()])),
  }),
  /**
   * 主倍率（每件裝備擲一次，存在物品上）：武器乘在基礎傷害、防具乘在基礎防禦（base）；
   * 戒指與護身符沒有基礎攻防，改為該件所有詞綴數值提高（jewelry）。相鄰稀有度的區間互相重疊。
   */
  mainRoll: z.strictObject({
    base: z.record(RaritySchema, z.tuple([z.number().nonnegative(), z.number().nonnegative()])),
    jewelry: z.record(RaritySchema, z.tuple([z.number().nonnegative(), z.number().nonnegative()])),
  }),
  /**
   * 掉寶的樓層成長：
   * - tierBonus：樓層 lootTier → 黃以上的稀有度權重倍率（index = lootTier − 1，超出時用最後一組）
   * - highRarityTier：紫 / 橘 / 紅的基底階級 = 樓層階（等級需求 ≤ 物品等級的最高階）+ 偏移，偏移依權重抽
   */
  loot: z.strictObject({
    tierBonus: z
      .array(z.strictObject({ rare: z.number().positive(), epic: z.number().positive(), legendary: z.number().positive(), mythic: z.number().positive() }))
      .min(1),
    highRarityTier: z
      .strictObject({ offsets: z.array(z.int()).min(1), weights: z.array(z.number().positive()).min(1) })
      .refine((t) => t.offsets.length === t.weights.length, 'offsets 與 weights 長度必須相同'),
  }),
  /** 共用倉庫：頁數、每頁欄列、離寶箱多遠面板自動關閉 */
  stash: z.strictObject({ pages: z.int().positive(), cols: z.int().positive(), rows: z.int().positive(), range: z.number().positive() }),
  /** 拆解：拆解區的格數與各稀有度拆出的精華數量 */
  salvage: z.strictObject({
    slots: z.int().positive(),
    yields: z.record(RaritySchema, z.tuple([z.int().nonnegative(), z.int().nonnegative()])),
  }),
  /**
   * 裝備光芒：每件裝備依稀有度給分（weights），總分達到 thresholds 的第 N 個門檻 = 光芒等級 N（0～4）。
   */
  gearAura: z.strictObject({
    weights: z.record(RaritySchema, z.number().nonnegative()),
    thresholds: z.array(z.number().positive()).min(4).max(6),
  }),
  enemySize: z.strictObject({
    melee: SizeRollSchema,
    ranged: SizeRollSchema,
  }),
  /** 出口旁的商人：買、賣、賭博 */
  shop: z.strictObject({
    /** 物品價值 = (base + perItemLevel × 物品等級) × 稀有度倍率；賣出拿到價值，購買付 buyMultiplier 倍 */
    value: z.strictObject({
      base: z.number().nonnegative(),
      perItemLevel: z.number().nonnegative(),
      rarity: z.record(RaritySchema, z.number()),
    }),
    buyMultiplier: z.number().min(1),
    /** 每層商人販賣的物品數量與稀有度（物品等級 = 樓層） */
    stockSize: z.int().nonnegative(),
    stockRarityWeights: RarityWeightsSchema,
    potionBuyPrice: z.int().positive(),
    potionSellPrice: z.int().nonnegative(),
    /** 賭博：價格 = base + perFloor × 樓層；結果的稀有度權重 */
    gamble: z.strictObject({
      base: z.int().positive(),
      perFloor: z.int().nonnegative(),
      rarityWeights: RarityWeightsSchema,
    }),
    /**
     * 飛昇：把裝備的基底換成同種類的下一階（名稱、詞綴、主倍率、傳奇效果都保留）。
     * 價格 = (base + perTier × 目標階級) × 稀有度倍率；目標階級的等級需求不可超過到過的最深樓層。
     */
    /**
     * 詞綴重鑄：把一條詞綴（橘 / 紅為固定屬性行的數值）重擲。
     * 價格 = (base + perItemLevel × 物品等級) × 稀有度倍率 × 強屬性倍率 × (1 + perReroll × 這件物品已重鑄的次數)
     */
    reroll: z.strictObject({
      base: z.int().nonnegative(),
      perItemLevel: z.int().nonnegative(),
      rarity: z.record(RaritySchema, z.number().positive()),
      strong: z.number().min(1),
      perReroll: z.number().nonnegative(),
    }),
    ascend: z.strictObject({
      base: z.int().nonnegative(),
      perTier: z.int().nonnegative(),
      rarity: z.record(RaritySchema, z.number().positive()),
      /** 精華（武器用武器精華、防具用防具精華）= (essenceBase + essencePerTier × 目標階級) × essenceRarity */
      essenceBase: z.int().nonnegative(),
      essencePerTier: z.int().nonnegative(),
      essenceRarity: z.record(RaritySchema, z.number().positive()),
      /** 目標階級 ≥ shardFromTier 時需要飛昇碎片：目標階級 − shardFromTier + 1 片 */
      shardFromTier: z.int().positive(),
    }),
    /** 離商人多遠內可以交易（Tile） */
    range: z.number().positive(),
  }),
  /** 近戰 / 遠程 / 魔法 / 戰術技能的共通倍率 */
  skillCategories: z.strictObject({
    melee: CategoryTraitsSchema,
    ranged: CategoryTraitsSchema,
    magic: CategoryTraitsSchema,
    utility: CategoryTraitsSchema,
  }),
  /**
   * 鑲嵌（v0.5.0）：孔數上限（與稀有度反向）、掉落時的孔數權重（index = 孔數）、商人的鑿孔費用（鑲嵌 / 取下熔核由玩家自己在背包做，免費）、
   * 全身上限（同一條屬性全身熔核合計 ≤ 一顆 T5 橘核最高值 ×（bodyCap ＋ 提供這條的同核鑲滿裝備 孔數 × matchCapPerSocket）；印記同理）。
   */
  sockets: z.strictObject({
    max: z.record(RaritySchema, z.int().min(0).max(5)),
    dropWeights: z.record(RaritySchema, z.array(z.number().nonnegative()).min(1)),
    /** 鑿第 n 孔：金幣 drillGold × 物品等級 × n、防具精華 drillEssence × n */
    drillGold: z.int().nonnegative(),
    drillEssence: z.int().nonnegative(),
    bodyCap: z.number().positive(),
    maxCores: z.int().positive(),
    /** 同核加成：一件裝備的孔都鑲滿、每顆熔核核種相同時，那件裝備上的熔核數值（固定數值的屬性除外）×（1 + 孔數 × matchBonus） */
    matchBonus: z.number().nonnegative(),
    /** 同核鑲滿的裝備放寬全身上限：它提供的每一條屬性（含印記），上限多 孔數 × matchCapPerSocket 份（一份 = 一顆 T5 橘核最高值） */
    matchCapPerSocket: z.number().nonnegative(),
    /** 鑲在武器的熔核：武器傷害 +%（index = 核階 − 1），和主倍率相加 */
    weaponDamage: z.array(z.number().nonnegative()).length(5),
  }),
  /**
   * 融合（v0.5.0）：2～4 把武器 → 一顆熔核；飾品區最多 2 件戒指 / 護身符，只提高印記機率。
   * 核階 = 平均物品等級每 levelsPerTier 一階（最高 affixPower.maxTier；與詞綴階級分開設定）；核色 = gearAura.weights 加總對照 rarityFrom；
   * 數值 = T1 擲骰 × tierMultiplier × affixPower.rarity（核色倍率）。
   */
  fusion: z.strictObject({
    inputs: z.strictObject({ min: z.int().positive(), max: z.int().positive() }),
    jewelrySlots: z.int().nonnegative(),
    /** 核階：投入裝備的平均物品等級每幾級一階 */
    levelsPerTier: z.int().positive(),
    /** 核階倍率（index = 核階 − 1） */
    tierMultiplier: z.array(z.number().positive()).min(1),
    /** 核色：權重加總 ≥ 門檻即為該核色（沒有紅核） */
    rarityFrom: z.strictObject({ magic: z.number(), rare: z.number(), epic: z.number(), legendary: z.number() }),
    /** 屬性條數（含主屬性；印記不佔條數） */
    lineCount: z.strictObject({ normal: z.int().positive(), magic: z.int().positive(), rare: z.int().positive(), epic: z.int().positive(), legendary: z.int().positive() }),
    /** 純核（四件同一種類）多幾條屬性 */
    pureBonusLines: z.int().nonnegative(),
    /** 混核：兩個核種各取一條，數值 × mixedMultiplier */
    mixedMultiplier: z.number().positive(),
    brand: z.strictObject({
      /** 每把橘武器的基礎機率（再加飾品區加成） */
      chance: z.number().min(0).max(1),
      /** 總機率上限：1 − Π(1 − p) 不超過這個值 */
      chanceCap: z.number().min(0).max(1),
      /** 傳入的數值倍率（整數四捨五入、至少 1） */
      valueMultiplier: z.number().positive(),
    }),
    /** 飾品區：每件依稀有度提高印記機率（白飾品不能放） */
    jewelryBoost: z.record(RaritySchema, z.number().nonnegative()),
    /** 費用：金幣 goldBase + goldPerItemLevel × Σ物品等級；武器精華 essenceBase + Σ ceil(物品等級 ÷ essenceLevelDivisor) */
    cost: z.strictObject({
      goldBase: z.int().nonnegative(),
      goldPerItemLevel: z.number().nonnegative(),
      essenceBase: z.int().nonnegative(),
      essenceLevelDivisor: z.int().positive(),
    }),
  }),
  /** 武器允許矩陣：每種武器可以使用的主動技能類別（不在清單內 = 禁用） */
  weaponRules: z.record(WeaponTypeSchema, z.array(ActiveCategorySchema).min(1)),
  /** 機關（戰術技能佈置的有血量物件） */
  devices: z.strictObject({
    /** 全身同時存在的上限；放下一個時最舊的消失 */
    maxAlive: z.int().positive(),
    /** 怪物在這個距離內（Tile）會把機關當目標 */
    aggroRange: z.number().positive(),
    /** 戰術機關的生命與防禦最高是主角的這個比例（有群組的毒蛛不受限） */
    statCap: z.number().positive().max(1),
    /** 機關對怪物的吸引力（主角 = 1；必須小於 1）：有效距離 = 實際距離 ÷ attraction */
    attraction: z.number().positive().lt(1),
    /** 在主角與機關之間換目標時，新目標的有效距離要短這個比例以上（避免來回轉頭） */
    retargetMargin: z.number().nonnegative(),
  }),
  combo: z.strictObject({
    /** 「近 → 近 → 遠」的 Combo：第三招額外加成（前兩招承擔貼身風險的回報） */
    nearNearFarBonus: z.strictObject({ damage: z.number().nonnegative(), aoeRadius: z.number().nonnegative() }),
  }),
  combat: z.strictObject({
    critMultiplier: z.number().min(1),
    /** 減傷 = defense / (defense + defenseConstant) */
    defenseConstant: z.number().positive(),
    /** 元素抗性上限 */
    maxResist: z.number().min(0).max(1),
    /** 閃避上限 */
    maxDodge: z.number().min(0).max(1),
    /** 控制抗性上限（緩速抗性、擊退抗性、暈眩時間減少） */
    maxControlResist: z.number().min(0).max(1),
    /** 格擋率上限 */
    maxBlock: z.number().min(0).max(1),
    /** 格擋時減免的傷害比例 */
    blockReduction: z.number().min(0).max(1),
  }),
  /**
   * 洗點：重置技能點 / 屬性點的金幣 = round(base × 等級^exponent)。
   * 等級越高越貴，避免隨意切換 Build；仍比重練便宜很多。
   */
  respec: z.strictObject({
    skills: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
    attributes: z.strictObject({ base: z.number().positive(), exponent: z.number().positive() }),
  }),
});

export type Balance = z.infer<typeof BalanceSchema>;
