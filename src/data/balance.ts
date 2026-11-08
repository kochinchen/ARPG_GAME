import type { z } from 'zod';
import type { BalanceSchema } from './schema/balance';

/**
 * 吸血 / 吸魔的硬上限（玩家）：技能最高 +0.5%（1～5 級 0.1%～0.5%），其他每一個來源（詞綴、傳奇 / 神話屬性、條件效果）最高 +0.3%；
 * 例外：「暴擊時回復傷害的一部分」最高 +0.5%（鼓勵提升暴擊率）。近戰的吸血倍率（categoryTraits）不受限（設計者同意）。
 * 物品數值超過時一律以上限計算（舊存檔也一樣）。要往上調必須先提出理由並與設計者討論。
 */
export const STEAL_CAP = { skill: 0.005, perSource: 0.003, critHeal: 0.005 } as const;

/** 全域平衡數值。調整手感優先改這裡。 */
export const balance: z.input<typeof BalanceSchema> = {
  maxLevel: 70,
  xpCurve: { base: 50, exponent: 1.5 },
  skillPointsPerLevel: 1,
  statsPerLevel: { maxHp: 5, maxMana: 2 },
  maxSkillRank: 5,
  tierLevelReq: [1, 6, 12, 24],
  t4UnlockChargesPerLevel: 1,
  player: {
    baseHp: 100,
    baseMana: 50,
    manaRegenPerSec: 1.5,
    // 基礎回復：生命每秒 0.3%、魔力每秒 0.2%（魔力另有固定 1.5 / 秒）
    hpRegenPctPerSec: 0.003,
    manaRegenPctPerSec: 0.002,
    // 脫戰 4 秒（沒有受到傷害）後生命回復 5 倍：戰鬥難度不變，打完一波能較快回滿
    outOfCombatRegen: { delay: 4, multiplier: 5 },
    moveSpeed: 4,
    radius: 0.3,
    baseDamage: [3, 6],
    spellPower: 8,
    attackSpeed: 1.6,
    attackRange: 0.5,
    critChance: 0.1,
    defense: 0,
    respawnDelay: 2,
    potionId: 'potion.rejuvenation',
    startingPotions: 3,
    inventoryCols: 10,
    inventoryRows: 8,
    // 玩家沒有普通攻擊：免費送的重砍就是預設左鍵（普通攻擊只給怪物用）
    startingSkills: ['melee.heavy_slash', 'magic.fireball'],
    startingSkillPoints: 2,
    comboSlotLevels: [1, 3, 6],
    // Q Lv1、W Lv3、E Lv6、R Lv10、A Lv15、S Lv20、D Lv25
    comboKeyLevels: [1, 3, 6, 10, 15, 20, 25],
    startingLoadout: {
      left: 'melee.heavy_slash',
      // 每組的第 2、3 格分別在 Lv3、Lv6 解鎖；一開始只有 Q：左鍵重砍、Q 火球
      combos: [
        ['magic.fireball', null, null],
        ['melee.heavy_slash', null, null],
        [null, null, null],
        [null, null, null],
        [null, null, null],
        [null, null, null],
        [null, null, null],
      ],
      supports: [null, null, null],
    },
  },
  attributes: {
    pointsPerLevel: 3,
    list: [
      // 基礎攻擊：武器傷害（最小與最大值）與法術強度各 +0.3；近戰要貼身承受傷害，另外 +0.5% 近戰傷害
      {
        id: 'attack',
        name: '攻擊',
        effects: [
          { stat: 'damageMin', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'damageMax', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'spellPower', perPoint: 0.3, label: '基礎攻擊（武器 / 法術）' },
          { stat: 'meleeDamageBonus', perPoint: 0.005, label: '近戰傷害', percent: true },
        ],
      },
      { id: 'vitality', name: '生命', effects: [{ stat: 'maxHp', perPoint: 5, label: '最大生命' }] },
      { id: 'mana', name: '魔力', effects: [{ stat: 'maxMana', perPoint: 4, label: '最大魔力' }] },
      { id: 'defense', name: '防禦', effects: [{ stat: 'defense', perPoint: 2, label: '防禦' }] },
      // 暴擊率上限 +40%：基礎 10% + 屬性 40% + 裝備 / 被動，避免輕易到 100%
      { id: 'crit', name: '暴擊', maxPoints: 80, effects: [{ stat: 'critChance', perPoint: 0.005, label: '暴擊率', percent: true }] },
    ],
  },
  difficulty: {
    hpPerFloor: 0.2,
    damagePerFloor: 0.12,
    defensePerFloor: 0.1,
    xpPerFloor: 0.15,
    densityPerFloor: 0.03,
    maxDensityMultiplier: 1.4,
    // 前期怪物數量加成：第 1～5 層 +20%，之後逐層遞減，第 30 層起為 0（第 30 層以後的數量不變）
    earlyDensityBoost: { bonus: 0.2, fullUntil: 5, fadeTo: 30 },
    // 怪物強化：一般怪 / 精英 HP ×1～8、魔王 HP ×1～20、攻擊 ×1～4、特殊技能範圍 ×1.5～3（第 1 → 35 層逐層提高）；經驗 ×0.7
    // 魔王的範圍另外算 ×1～1.5、放大後最多 8 格（設計者 2026-11-03：魔王原本 ×1.5～3 太大，一般怪與精英不變）
    monsterBoost: { toFloor: 35, hp: [1, 8], bossHp: [1, 20], damage: [1, 4], skillArea: [1.5, 3], bossSkillArea: [1, 1.5], bossSkillAreaCap: 8, xp: 0.7 },
  },
  floor: {
    // 樓梯口與出口：大於最遠的偵測距離（骷髏王 9），上下樓時附近一定沒有怪物
    stairsSafeRadius: 12,
    // 中途存檔點：與樓梯口相同（這裡也有商人，大於最遠的一般怪偵測距離 9，購物時不會被遠程怪發現）
    safeRadius: 12,
    checkpointRadius: 1.2,
  },
  // 終局（docs/ENDGAME.md）
  endgame: {
    lastNormalFloor: 30,
    lastFloor: 35,
    miniBoss: { maxPerFloor: 4, arenaBodies: 15, hpMultiplier: 0.5, damageMultiplier: 0.5, xpMultiplier: 0.5, lootTable: 'loot.elite' },
  },
  // 怪物學主角技能（設計者 2026-10-30）：10 樓起，每隻最多一招；法術系學法術樹，其他依近戰 / 遠程。
  // 精英與首領必定學到；怪物版傷害 ×0.6、冷卻 ×1.5（至少 4 / 6 / 8 / 10 秒，依技能層級）、前搖 ×1.5，施放時頭上顯示招式名稱
  enemyMimic: {
    unlocks: [
      { minFloor: 10, maxTier: 1, chance: 0.1 },
      { minFloor: 15, maxTier: 2, chance: 0.15 },
      { minFloor: 20, maxTier: 3, chance: 0.2 },
      { minFloor: 28, maxTier: 4, chance: 0.25 },
    ],
    floorsPerRank: 5,
    damage: 0.6,
    cooldownMultiplier: 1.5,
    minCooldown: 4,
    cooldownPerTier: 2,
    castTimeMultiplier: 1.5,
  },
  // 法師的法術書（設計者 2026-11-08）
  mageSpellbook: { upper: { fromFloor: 6, toFloor: 30, chance: [0.1, 0.5] }, eliteChance: 0.25, maxRank: 3, eliteMaxMultiplier: 0.85 },
  // 怪物的集體戰術（設計者 2026-10-30，參考孫子兵法）：呼朋引伴、包圍站位（圍師必闕）、後排站在前排後方
  enemyTactics: {
    alertRadius: 6,
    alertDelay: [0.3, 0.6],
    surroundRange: 6,
    maxEngaged: 6,
    // 整圈包圍、不留缺口（設計者 2026-11-07）
    gapDegrees: 0,
    minSlots: 4,
    flankSpeed: 3.2,
    waitDistance: 2.5,
    backlineOffset: 1.5,
    reassignInterval: 0.5,
    // 閃避投射物（設計者 2026-11-07）：第 1 層 20%、第 30 層起 45%；慢的怪來不及閃
    dodge: { chance: [0.2, 0.45], maxFloor: 30, lookahead: 0.6, cooldown: 1.5, margin: 0.25 },
    // 求援（設計者 2026-11-07）：一群被打掉超過一半，派一隻去叫 30 格內最多兩群閒置的怪
    reinforce: { casualtyRatio: 0.5, callRange: 30, maxPacks: 2, reachDistance: 4 },
    // 以下五項（設計者 2026-11-07）
    // 躲開地上的範圍傷害：路線繞開主角的火海、毒池，站在裡面就走出來；猶豫超過 patience 秒就硬闖 brave 秒
    avoidZones: { margin: 0.4, pathCost: 6, patience: 2.5, brave: 3 },
    // 預判射擊：瞄準主角沿著目前路線「箭飛到時會到的位置」；第 1 層只算 40%、第 30 層起算滿
    leadShot: { lead: [0.4, 1], maxFloor: 30, maxTime: 1.5 },
    // 誘敵：血量低於 hpBelow 時擲一次 chance，往 range 格內另一群閒置的怪逃（不叫醒牠們），到了或 maxTime 秒後回頭打
    lure: { hpBelow: 0.3, chance: 0.5, range: 20, maxTime: 6, arriveDistance: 3 },
    // 撿藥水：會撿的怪血量低於 hpBelow、range 格內地上有藥水，就跑去撿、當場喝掉回復最大 HP 的 heal（每隻一次）
    potion: { hpBelow: 0.35, range: 8, heal: 0.4 },
    // 吃屍體（食屍鬼）：血量低於 hpBelow、range 格內有屍體就去吃 duration 秒，回復 heal，每次體型 + grow、傷害 + damage（最多 maxEats 次）
    devour: { hpBelow: 0.8, range: 6, duration: 1.5, heal: 0.35, grow: 0.15, damage: 0.15, maxEats: 2 },
    // 復活（骷髏法師）：range 格內有不死族的屍體就施法 duration 秒，讓牠以 hp 的血量站起來（不給經驗、不掉寶、不再留屍體）；冷卻 cooldown 秒、每隻最多 max 次
    raise: { range: 7, duration: 1.2, hp: 0.5, cooldown: 10, max: 3 },
    // 移動速度隨狀況變化（設計者 2026-11-07）：主角在 sprintDistance 格外時追趕 + sprint；誘敵逃跑、求援、跑去撿藥水 + errand；
    // 繞到背後的途中 + flank；靈活派（弓手）被貼近後退時 + retreat。都是乘在基本速度上（緩速等狀態照常再乘）
    pace: { sprint: 0.25, sprintDistance: 6, errand: 0.2, flank: 0.15, retreat: 0.3 },
    // 靈活派（tactics 有 agile 的弓手）每一箭的飛行速度與射程：主角離得越遠越快越遠（near 格內不加、far 格外加滿 speed / range），
    // 每一箭再隨機 ± jitter；精英再乘上 1 + elite。射程同時加在出手距離與飛行距離上
    agile: { near: 3, far: 9, speed: 0.4, range: 0.35, jitter: 0.15, elite: 0.25 },
    // 以下七項（設計者 2026-11-08）
    // 躲掩護：遠程怪躲在正在追擊的巨獸背後射擊；主角跑遠到射不到，射手才會自己出來
    cover: { perShield: 2, gap: 0.4, spread: 0.7, reachMargin: 0.3, slack: 0.5 },
    // 圍獵（野獸）：先在 3.5 格外繞圈 2～3 秒，再一起撲
    hunt: { minHunters: 2, ring: 3.5, circle: [2, 3], strike: 3.5, follow: 0.35, spinDeg: 20 },
    // 蜂擁（孵化蜘蛛）：直接一擁而上；同一隻母體生的少於 3 隻就逃回母體身邊守著
    swarm: { min: 3, guardRange: 3.5, ring: 1.3 },
    // 護衛（小惡魔）：守在祭司與主角之間；主角靠近祭司 4 格內才出手
    guard: { range: 4, ring: 1.4 },
    // 潰散（小惡魔）：祭司死了往外逃 7 格，最多 3.5 秒
    rout: { distance: 7, duration: 3.5 },
    // 自爆（火囊爬行者）：血量低於 40% 就衝上去自爆
    kamikaze: { hpBelow: 0.4, skill: 'enemy.fire_sac_burst' },
    // 鑽地閃避（鑽地寄生蟲）：看到投射物 60% 機率鑽進地下，從主角背後鑽出來
    burrow: { chance: 0.6, skill: 'enemy.burrow_dodge' },
  },
  elite: {
    minFloor: 3,
    hpMultiplier: 3,
    damageMultiplier: 1.8,
    xpMultiplier: 3.5,
    radiusMultiplier: 1.2,
    lootTable: 'loot.elite',
    // 精英與魔王只拿 normalScale 倍（設計者 2026-11-04，減 40%）；隱藏魔王拿全部
    floorResist: { minFloor: 10, perFloor: { elite: 0.015, boss: 0.02 }, max: 0.4, normalScale: 0.6 },
  },
  // 每層的首領：比精英（HP ×3、傷害 ×1.8）強一截、體型 ×1.5；出口的安全範圍是 12 格，首領站在 16 格外
  // 《井誌》每收集滿 1/4 的獎勵（設計者 2026-11-01）：1/4 隨機橘核、2/4 橘裝武器、3/4 橘裝鎧甲、4/4 額外屬性點
  book: {
    weaponKinds: { melee: ['sword', 'axe'], ranged: ['bow'], magic: ['staff'] },
    armors: {
      melee: ['legendary.armor_acid_beetle', 'legendary.armor_bone_spike', 'legendary.armor_blood_scale', 'legendary.armor_horned_beast', 'legendary.armor_magma_jaw', 'legendary.armor_quake'],
      ranged: ['legendary.armor_gale'],
      magic: ['legendary.armor_void_spore', 'legendary.armor_thunder_robe'],
    },
    attributePoints: 20,
  },
  // 隱藏魔王（設計者 2026-11-02）：11～29 層沒有固定魔王的樓層都預留一間正方形隱藏房（右上角、平常是實心牆，邊長和 F30 的競技場一樣）。
  // 每次進入樓層 chance 機率打開；可以不打、不影響出口。elements：每次出現隨機抽兩種，決定發光區塊與招式的屬性。
  hiddenBoss: {
    roomFloors: [9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 29],
    roomSize: 48,
    chance: 0.2,
    bosses: [
      { enemyId: 'enemy.bone_dragon', floors: [16, 17, 18, 19, 21, 22], elements: ['fire', 'cold', 'lightning', 'poison'] },
      {
        enemyId: 'enemy.abyss_dragon',
        floors: [23, 24, 26, 27, 28, 29],
        // 吐息每次隨機爆炎、冰柱或轟雷
        elements: ['fire', 'cold', 'lightning'],
        allElements: true,
        resists: { stats: ['poisonResist', 'fireResist', 'coldResist', 'lightningResist', 'knockbackResist', 'physicalResist'], count: 3 },
      },
      // 奪界雙手：兩隻一對（EnemyDef.pair）；三隻分成三段：手 9～14 → 口 16～22 → 眼 23～29（設計者 2026-11-04）
      { enemyId: 'enemy.abyss_hand', floors: [9, 11, 12, 13, 14], elements: ['cold', 'poison'], allElements: true },
    ],
  },
  goldWalker: {
    enemies: ['enemy.ember_walker', 'enemy.frost_walker', 'enemy.storm_walker', 'enemy.venom_walker'],
    minFloor: 5,
    chances: [0.3, 0.25, 0.2, 0.15, 0.1, 0.05],
    gold: [400, 1500],
    variance: 0.1,
    piles: 6,
    alone: 7,
  },
  champion: {
    hpMultiplier: 6,
    damageMultiplier: 2,
    xpMultiplier: 8,
    radiusMultiplier: 1.5,
    affixCount: [2, 3],
    guardDistance: 16,
    chestLootTable: 'loot.champion_chest',
  },
  affixPower: {
    // 詞綴階級：每 8 級一階，和熔核的核階相同（T5 在物品等級 32，35 層以內拿得到；設計者 2026-11-01，原本每 10 級、T5 要 40）
    levelsPerTier: 8,
    maxTier: 5,
    // 紫比黃高 20%～50%，紅最高 300%
    rarity: { normal: [1, 1], magic: [1, 1], rare: [1, 1], epic: [1.2, 1.5], legendary: [1.5, 2], mythic: [2, 3] },
  },
  mainRoll: {
    // 武器傷害 / 防具防禦 +X%：藍 20～90、黃 70～150、紫 130～230、橘 210～320、紅 290～400（相鄰重疊 20～30%）
    base: { normal: [0, 0], magic: [0.2, 0.9], rare: [0.7, 1.5], epic: [1.3, 2.3], legendary: [2.1, 3.2], mythic: [2.9, 4] },
    // 飾品：所有詞綴 +X%
    jewelry: { normal: [0, 0], magic: [0.05, 0.25], rare: [0.2, 0.45], epic: [0.4, 0.65], legendary: [0.6, 0.85], mythic: [0.8, 1] },
  },
  loot: {
    // lootTier 1（1～4 層）不變；2（5～14）、3（15～19）、4（20～24）、5（25 層起）逐步提高黃以上的權重（白、藍不變）
    // 20 層以後紫 / 橘 / 紅約加倍（20～24 層紫橘 ×1.8 → ×3.6、紅 ×2 → ×4；25 層起紫橘 ×2.2 → ×4.4、紅 ×2.6 → ×5.2）
    tierBonus: [
      { rare: 1, epic: 1, legendary: 1, mythic: 1 },
      { rare: 1.2, epic: 1.4, legendary: 1.4, mythic: 1.5 },
      { rare: 1.4, epic: 1.8, legendary: 1.8, mythic: 2 },
      { rare: 1.5, epic: 3.6, legendary: 3.6, mythic: 4 },
      { rare: 1.6, epic: 4.4, legendary: 4.4, mythic: 5.2 },
    ],
    // 紫 / 橘 / 紅的基底：樓層階 −1 ～ +2，偏向樓層階與上一階（第 10 層多為 T2～T4、第 20 層 T3～T6、第 30 層 T6～T8），
    // 高於等級的基底要升級才能穿；早期拿到的好裝備要靠飛昇跟上樓層
    highRarityTier: { offsets: [-1, 0, 1, 2], weights: [15, 40, 30, 15] },
  },
  // 共用倉庫（設計者 2026-11-02）：3 個存檔欄位共用，5 頁、每頁 6 × 5 共 30 格；只放裝備與熔核。range：離寶箱多遠面板自動關閉
  stash: { pages: 5, cols: 6, rows: 5, range: 4 },
  salvage: {
    slots: 10,
    // 白 1～2、藍 2～4、黃 4～7、紫 7～11、橘 11～15、紅 16～20
    yields: { normal: [1, 2], magic: [2, 4], rare: [4, 7], epic: [7, 11], legendary: [11, 15], mythic: [16, 20] },
  },
  gearAura: {
    weights: { normal: 0, magic: 1, rare: 2, epic: 4, legendary: 7, mythic: 12 },
    // 0～5 無光、6～10 微弱、11～18 中等、19～30 強、31～49 高階；熔核核階加進總分後，50、80 再加開兩階（v0.5.0）
    thresholds: [6, 11, 19, 31, 50, 80],
  },
  enemySize: {
    // 近戰：多數在 100%～140%，少數巨大個體接近 200%（HP / 傷害最多 150%）
    melee: { mean: 1.2, sd: 0.22, min: 1, max: 2, statPerSize: 0.5 },
    // 遠程 / 法術：100%～130%，數值不變
    ranged: { mean: 1.08, sd: 0.1, min: 1, max: 1.3, statPerSize: 0 },
  },
  shop: {
    value: { base: 4, perItemLevel: 2, rarity: { normal: 1, magic: 2.5, rare: 6, epic: 12, legendary: 20, mythic: 35 } },
    buyMultiplier: 4,
    stockSize: 6,
    stockRarityWeights: { normal: 30, magic: 60, rare: 10 },
    potionBuyPrice: 12,
    potionSellPrice: 3,
    // 賭博：比直接買一件魔法物品便宜一點，但可能拿到普通或稀有。
    // 史詩 / 傳奇只有一般怪物掉落的一半（0.3% / 0.05%，也沒有深層的 tierBonus）：可以用金幣一直賭，不能比打寶好拿
    gamble: { base: 30, perFloor: 10, rarityWeights: { normal: 15, magic: 59.65, rare: 25, epic: 0.3, legendary: 0.05 } },
    // 重鑄：第 20 層的黃裝第一次約 1,300、第二次約 1,900；紅裝約 5,000 起；強屬性 ×1.5；每重鑄一次再貴 50%
    reroll: { base: 200, perItemLevel: 25, rarity: { normal: 1, magic: 0.8, rare: 1.8, epic: 2.8, legendary: 4.5, mythic: 7 }, strong: 1.5, perReroll: 0.5 },
    // 飛昇：越高階、越稀有越貴（紅裝升到第 8 階約 2 萬金幣）。v0.5.0 金幣與精華 ×2：鑲好熔核的裝備是長期投資，飛昇是主要的金幣 / 精華出口
    ascend: {
      base: 120,
      perTier: 240,
      rarity: { normal: 1, magic: 1.5, rare: 2.5, epic: 4, legendary: 6, mythic: 10 },
      // 精華：第 2 階 22 個 … 第 8 階 58 個（再乘稀有度，紅裝 ×2.5）
      essenceBase: 10,
      essencePerTier: 6,
      essenceRarity: { normal: 1, magic: 1, rare: 1.2, epic: 1.5, legendary: 2, mythic: 2.5 },
      // 第 5 階起需要飛昇碎片：第 5 階 1 片 … 第 8 階 4 片
      shardFromTier: 5,
    },
    range: 3,
  },
  skillCategories: {
    melee: { manaCost: 0.85, lifeSteal: 1.3 },
    ranged: { manaCost: 1, lifeSteal: 1 },
    magic: { manaCost: 1, lifeSteal: 0.8 },
    utility: { manaCost: 1, lifeSteal: 1 },
  },
  // 鑲嵌（v0.5.0）：孔數與稀有度反向；紅裝不打洞
  sockets: {
    max: { normal: 5, magic: 4, rare: 3, epic: 2, legendary: 1, mythic: 0 },
    // 掉落時 0 / 1 / 2 孔的權重；紫以上掉落時沒有孔（要鑿）
    dropWeights: { normal: [60, 30, 10], magic: [60, 30, 10], rare: [65, 25, 10], epic: [1], legendary: [1], mythic: [1] },
    drillGold: 30,
    drillEssence: 3,
    bodyCap: 1.5,
    maxCores: 30,
    // 熔核不看裝備稀有度（2026-10-23 設計者定案）：白裝 5 孔可以打造成符合自己需求的強裝
    // 同核加成：孔鑿到稀有度上限（max，至少 2 孔；設計者 2026-11-05）、全部鑲滿、每顆核種相同 → 這件裝備上的熔核數值 ×（1 + 孔數 × matchBonus）
    matchBonus: 0.1,
    // 同核鑲滿的裝備也放寬全身上限：它提供的屬性，上限多「孔數 × 0.5 顆」（白裝 5 孔 +2.5 顆；其他配法維持 bodyCap 1.5 顆；2026-10-23）
    matchCapPerSocket: 0.5,
    // 鑲在武器的熔核：武器傷害 +%（依核階 T1～T5，和主倍率相加；法杖放大法術強度）
    weaponDamage: [0.16, 0.32, 0.48, 0.64, 0.8],
  },
  // 融合（v0.5.0）：費用在 P9 砍半（2026-10-18）——Lv40 四把紫約 2,060 金幣（約賣價的一半）、武器精華 34（≈ 拆掉這四把的 28～44）
  fusion: {
    inputs: { min: 2, max: 4 },
    jewelrySlots: 2,
    // 核階：平均物品等級每 8 級一階（32 以上 T5，35 層以內拿得到；2026-10-18）；詞綴階級仍是每 10 級
    levelsPerTier: 8,
    tierMultiplier: [1, 1.15, 1.32, 1.52, 1.75],
    rarityFrom: { magic: 2, rare: 5, epic: 9, legendary: 15 },
    lineCount: { normal: 1, magic: 2, rare: 2, epic: 3, legendary: 3 },
    // 純核（四件同一種類）：屬性多一條（2026-10-18 提前到 v0.5.0）
    pureBonusLines: 1,
    mixedMultiplier: 0.7,
    brand: { chance: 0.35, chanceCap: 0.85, valueMultiplier: 0.7 },
    jewelryBoost: { normal: 0, magic: 0.05, rare: 0.1, epic: 0.15, legendary: 0.2, mythic: 0.25 },
    cost: { goldBase: 60, goldPerItemLevel: 12.5, essenceBase: 6, essenceLevelDivisor: 6 },
  },
  // 武器決定可用的技能類別：劍斧＝近戰＋魔法、弓＝遠程＋魔法、法杖＝魔法；戰術任何武器都能用
  // 魔法的加減分（劍斧弓 −20%、法杖 +15%）在 items.ts 的武器內建屬性
  weaponRules: {
    sword: ['melee', 'magic', 'utility'],
    axe: ['melee', 'magic', 'utility'],
    bow: ['ranged', 'magic', 'utility'],
    staff: ['magic', 'utility'],
  },
  // 設計者調整（2026-10-30）：場上最多 3 個機關，第四個讓最早的消失；機關的生命、防禦最高是主角的 10%
  // 機關的吸引力是主角的 2/3（有效距離 ×1.5）：同樣距離一定先打主角；換目標要好 20% 以上（設計者 2026-10-30）
  devices: { maxAlive: 3, aggroRange: 3, statCap: 0.1, attraction: 2 / 3, retargetMargin: 0.2 },
  combo: {
    nearNearFarBonus: { damage: 0.1, aoeRadius: 0.1 },
  },
  combat: {
    critMultiplier: 1.5,
    defenseConstant: 100,
    maxResist: 0.75,
    maxDodge: 0.5,
    maxControlResist: 0.75,
    // 盾牌格擋：最多 50% 的攻擊被格擋，格擋時傷害 -60%
    maxBlock: 0.5,
    blockReduction: 0.6,
  },
  // 洗點：Lv10 約 950 / 630、Lv30 約 4,900 / 3,300、Lv50 約 10,600 / 7,100 金幣
  respec: {
    skills: { base: 30, exponent: 1.5 },
    attributes: { base: 20, exponent: 1.5 },
  },
};
