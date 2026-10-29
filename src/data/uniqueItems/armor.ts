import { stat, inc, flat, strong, unique, uniqueRoll, mods, on, cond, at, buff, hit, area, status, MELEE, MAGIC, spiders, SPIDER_HP, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（盔甲）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）
 * - 橘（怪物靈感）：酸殼胸甲（酸液甲蟲）、骨刺胸甲（骨刺獵獸）、血鱗胸甲（血鱗獵蜥）、巨角胸甲（角甲巨獸）、
 *   熔顎胸甲（熔顎巨獸）、震岩胸甲（震地獸）、虛孢法袍（虛空孢子）；其他：疾風皮甲（遠程擊殺加速）、雷紋法袍（連鎖閃電）
 * - 紅：熔岩巨甲（B3 熔岩巨獸）、墮騎黑鎧（B4 墮落騎士）、蛛后絲甲（B5 蜘蛛女王）、統御者魔鎧（B7 深淵統御者）
 */

/** 以自己為中心、朝背後的扇形（甩尾） */
const tailSweep = (radius: number, effects: Effect[]): Effect => ({ type: 'area', radius, angleDeg: 180, offsetDeg: 180, effects });

const legendary: Def[] = [
  {
    id: 'legendary.armor_acid_beetle',
    name: '酸殼胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '破甲反制',
    lore: '酸液甲蟲的背殼還在冒煙，貼上來的敵人身上的鐵甲會一片片剝落。',
    minItemLevel: 6,
    main: [2.6, 2.8],
    lines: [
      inc('defense', 0.13, 0.17),
      inc('maxHp', 0.1, 0.14),
      stat('poisonResist', 0.18, 0.22),
      strong('對破甲的敵人傷害 +20%', mods({}, { vsStatus: { statuses: ['armorBreak'], damage: 0.2 } })),
      unique(
        '受到近身攻擊時 35% 機率噴出酸液：周圍 2 格的敵人破甲 4 秒（防禦 -25%）（冷卻 2 秒）',
        on('hurt', [at('self', 'melee', [area(2, [status('armorBreak', 4, 0.25)])])], { near: 2, chance: 0.35, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.armor_bone_spike',
    name: '骨刺胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '骨刺反擊',
    lore: '骨刺獵獸背上的骨刺被一根根釘進皮甲，碰到它的人才知道它還會射。',
    minItemLevel: 4,
    main: [2.5, 2.7],
    lines: [
      flat('thorns', 8, 12),
      inc('maxHp', 0.1, 0.14),
      inc('defense', 0.1, 0.14),
      strong('近戰技能暴擊率 +8%', mods(MELEE, { crit: 0.08 })),
      unique(
        '受到近身攻擊時，向四周射出 6 根骨刺（每根武器 50% 物理傷害）（冷卻 1.5 秒）',
        on('hurt', [at('self', 'melee', [{ type: 'projectile', speed: 10, radius: 0.18, range: 4, count: 6, spreadDeg: 360, onHit: [hit('physical', 0.5)] }])], {
          near: 2,
          cooldown: 1.5,
        }),
      ),
    ],
  },
  {
    id: 'legendary.armor_blood_scale',
    name: '血鱗胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '快攻 / 被圍反擊',
    lore: '血鱗獵蜥的鱗片層層相疊，被包圍時，身後總會甩出一記重尾。',
    minItemLevel: 4,
    main: [2.4, 2.6],
    lines: [
      inc('attackSpeed', 0.07, 0.09),
      inc('maxHp', 0.1, 0.14),
      stat('hpRegenPct', 0.004, 0.006),
      strong('快速技能攻擊速度 +12%', mods({ tags: ['Fast'] }, { attackSpeed: 0.12 })),
      unique(
        '受到近身攻擊時 25% 機率甩尾：背後 180° 2.2 格內的敵人受到武器 70% 傷害並擊退 1.5 格（冷卻 2 秒）',
        on('hurt', [at('self', 'melee', [tailSweep(2.2, [hit('physical', 0.7), { type: 'knockback', distance: 1.5 }])])], { near: 2, chance: 0.25, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.armor_horned_beast',
    name: '巨角胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '衝鋒坦克',
    lore: '角甲巨獸的胸殼，低頭衝出去的時候，什麼都擋不住它。',
    minItemLevel: 5,
    main: [2.7, 2.9],
    lines: [
      inc('maxHp', 0.14, 0.18),
      inc('defense', 0.13, 0.17),
      stat('knockbackResist', 0.1, 0.14),
      strong('突進類技能（Advance）傷害 +20%、擊退 +40%', mods({ tags: ['Advance'] }, { damage: 0.2, knockback: 0.4 })),
      unique(
        '突進斬命中時，獲得 3 秒鋼鐵意志（受到傷害 -20%、免疫擊退）（冷卻 6 秒）',
        on('hit', [at('self', 'melee', [status('ironWill', 3, 0.2, { target: 'self' })])], { when: { skills: ['melee.dash_slash'] }, cooldown: 6 }),
      ),
    ],
  },
  {
    id: 'legendary.armor_magma_jaw',
    name: '熔顎胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '火系近身防護',
    lore: '熔顎巨獸的岩皮底下仍流著熔岩，靠得太近的人會被一口吐息吞沒。',
    minItemLevel: 5,
    main: [2.4, 2.6],
    lines: [
      inc('maxHp', 0.12, 0.16),
      stat('fireResist', 0.18, 0.22),
      stat('spellDamageBonus', 0.08, 0.12),
      strong('火系技能傷害 +20%', mods({ elements: ['Fire'] }, { damage: 0.2 })),
      unique(
        '受到近身攻擊時 25% 機率噴出熔岩吐息：朝攻擊者 60° 扇形 3 格內的敵人受到法術強度 80% 火焰傷害並燃燒 3 秒（每秒法術強度 20%）（冷卻 3 秒）',
        on(
          'hurt',
          [at('self', 'magic', [area(3, [hit('fire', 0.8, 'spell'), { type: 'status', status: 'burn', duration: 3, magnitude: 0.2 }], 60)])],
          { near: 2, chance: 0.25, cooldown: 3 },
        ),
      ),
    ],
  },
  {
    id: 'legendary.armor_quake',
    name: '震岩胸甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '範圍近戰 / 震波',
    lore: '震地獸背上的岩塊打磨成的胸甲，每一次揮砍都讓地面跟著震動。',
    minItemLevel: 6,
    main: [2.6, 2.8],
    lines: [
      inc('maxHp', 0.12, 0.16),
      stat('meleeDamageBonus', 0.08, 0.12),
      stat('damageReduction', 0.03, 0.05),
      strong('範圍技能（AoE）範圍 +20%', mods({ tags: ['AoE'] }, { aoeRadius: 0.2 })),
      unique(
        '近戰範圍技能每命中 4 次，在自身周圍引發震波：3 格內的敵人受到武器 60% 傷害並緩速 30% 2 秒（冷卻 0.5 秒）',
        on('hit', [at('self', 'melee', [area(3, [hit('physical', 0.6), status('slow', 2, 0.3)])])], { when: { tags: ['AoE'], categories: ['melee'] }, every: 4, cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'legendary.armor_void_spore',
    name: '虛孢法袍',
    rarity: 'legendary',
    kind: 'armor',
    role: '近距法師',
    lore: '袍角長著紫黑色的孢囊，敵人一靠近，它們就會一齊破裂。',
    minItemLevel: 8,
    main: [2.2, 2.4],
    lines: [
      inc('maxMana', 0.14, 0.18),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('coldResist', 0.18, 0.22),
      strong('近距（Near）魔法技能傷害 +25%', mods({ categories: ['magic'], ranges: ['Near'] }, { damage: 0.25 })),
      unique(
        '受到近身攻擊時釋放虛空脈衝：2 格內的敵人受到法術強度 60% 寒冰傷害、緩速 40% 2 秒並擊退 1.5 格（冷卻 3 秒）',
        on('hurt', [at('self', 'magic', [area(2, [hit('cold', 0.6, 'spell'), status('slow', 2, 0.4), { type: 'knockback', distance: 1.5 }])])], {
          near: 2,
          cooldown: 3,
        }),
      ),
    ],
  },
  {
    id: 'legendary.armor_gale',
    name: '疾風皮甲',
    rarity: 'legendary',
    kind: 'armor',
    role: '遠程連殺 / 機動',
    lore: '輕得像沒穿一樣的皮甲，獵人每射倒一個敵人，腳步就更輕一分。',
    minItemLevel: 3,
    main: [2.1, 2.3],
    lines: [
      inc('moveSpeed', 0.07, 0.09),
      stat('rangedDamageBonus', 0.08, 0.12),
      stat('dodgeChance', 0.04, 0.06),
      strong('穿透類技能穿透 +1、傷害 +15%', mods({ tags: ['Pierce'] }, { pierce: 1, damage: 0.15 })),
      unique(
        '遠程技能擊殺時「疾風」+1 層（最多 4 層、5 秒）：每層移動速度 +4%、攻擊速度 +4%',
        on(
          'kill',
          [buff('gale', '疾風', 4, 5, [{ stat: 'moveSpeed', modifier: 'increased', value: 0.04 }, { stat: 'attackSpeed', modifier: 'increased', value: 0.04 }])],
          { when: { categories: ['ranged'] } },
        ),
      ),
    ],
  },
  {
    id: 'legendary.armor_thunder_robe',
    name: '雷紋法袍',
    rarity: 'legendary',
    kind: 'armor',
    role: '連鎖閃電',
    lore: '袍上的雷紋會自己流動，挨打的時候，它們會沿著敵人跳出去。',
    minItemLevel: 7,
    main: [2.2, 2.4],
    lines: [
      inc('maxMana', 0.14, 0.18),
      stat('lightningDamagePct', 0.07, 0.09),
      stat('lightningResist', 0.18, 0.22),
      strong('連鎖閃電彈跳 +1、傷害 +15%', mods({ skills: ['magic.chain_lightning'] }, { chainCount: 1, damage: 0.15 })),
      unique(
        '受到傷害時 20% 機率放出電弧：從攻擊者開始彈跳 3 次（每次法術強度 60% 閃電傷害）（冷卻 2 秒）',
        on('hurt', [at('target', 'magic', [{ type: 'chain', jumps: 3, radius: 4, effects: [hit('lightning', 0.6, 'spell')] }])], { chance: 0.2, cooldown: 2 }),
      ),
    ],
  },
];

const mythic: Def[] = [
  {
    id: 'mythic.armor_lava_behemoth',
    name: '熔岩巨甲',
    rarity: 'mythic',
    kind: 'armor',
    role: '岩漿重擊 / 越戰越硬',
    lore: '熔岩巨獸胸口剝下的岩殼，裂縫裡的岩漿隨著戰鬥越燒越旺。',
    minItemLevel: 15,
    main: [3.6, 3.8],
    lines: [
      inc('maxHp', 0.3, 0.34),
      inc('defense', 0.2, 0.24),
      stat('fireResist', 0.22, 0.28),
      stat('damageReduction', 0.05, 0.07),
      unique(
        '重擊類技能命中時，在目標處留下 4 秒岩漿（半徑 1.5 格，每 0.5 秒武器 20% 火焰傷害）（冷卻 1 秒）',
        on('hit', [at('target', 'melee', [{ type: 'zone', radius: 1.5, duration: 4, interval: 0.5, effects: [hit('fire', 0.2)] }])], { when: { tags: ['Heavy'] }, cooldown: 1 }),
      ),
      unique(
        '受到近身攻擊時 25% 機率地面震擊：周圍 2.5 格的敵人受到武器 70% 傷害並暈眩 1 秒（冷卻 3 秒）',
        on('hurt', [at('self', 'melee', [area(2.5, [hit('physical', 0.7), status('stun', 1)])])], { near: 2, chance: 0.25, cooldown: 3 }),
      ),
      unique(
        '近戰命中累積「熔核」（最多 10 層、6 秒）：每層防禦 +3%、火焰附加傷害 +1.5%',
        on('hit', [buff('lava_core', '熔核', 10, 6, [{ stat: 'defense', modifier: 'increased', value: 0.03 }, { stat: 'fireDamagePct', value: 0.015 }])], { when: MELEE }),
      ),
    ],
  },
  {
    id: 'mythic.armor_fallen_knight',
    name: '墮騎黑鎧',
    rarity: 'mythic',
    kind: 'armor',
    role: '連段劍氣 / 傷越重附魔越多',
    lore: '被黑暗吞噬的騎士鎧甲，每一道裂痕都讓劍上多一種元素。',
    minItemLevel: 20,
    main: [3.5, 3.7],
    lines: [
      inc('maxHp', 0.28, 0.32),
      inc('defense', 0.22, 0.26),
      stat('meleeDamageBonus', 0.12, 0.16),
      stat('lightningResist', 0.18, 0.22),
      unique(
        '依序附魔：生命低於 75% 時火焰附加傷害 +10%；低於 50% 時再加寒冰附加傷害 +10%；低於 25% 時再加閃電附加傷害 +10%',
        cond({ hpBelow: 0.75 }, [{ stat: 'fireDamagePct', value: 0.1 }]),
        cond({ hpBelow: 0.5 }, [{ stat: 'coldDamagePct', value: 0.1 }]),
        cond({ hpBelow: 0.25 }, [{ stat: 'lightningDamagePct', value: 0.1 }]),
      ),
      unique(
        '以近戰技能結尾的 Combo 完成時，向前方 120° 斬出劍氣：3 格內的敵人受到武器 90% 傷害',
        on('comboComplete', [at('self', 'melee', [area(3, [hit('physical', 0.9)], 120)])], { when: MELEE }),
      ),
      unique(
        '受到近身攻擊時「黑誓」+1 層（最多 5 層、6 秒）：每層受到傷害 -2%、近戰傷害 +4%',
        on('hurt', [buff('fallen_oath', '黑誓', 5, 6, [{ stat: 'damageReduction', value: 0.02 }, { stat: 'meleeDamageBonus', value: 0.04 }])], { near: 2 }),
      ),
    ],
  },
  {
    id: 'mythic.armor_spider_queen',
    name: '蛛后絲甲',
    rarity: 'mythic',
    kind: 'armor',
    role: '蛛網控場 / 毒蛛',
    lore: '蜘蛛女王吐出的絲織成的軟甲，比鋼鐵還韌，縫線裡還藏著沒孵化的卵。',
    minItemLevel: 25,
    main: [3.3, 3.5],
    lines: [
      inc('maxHp', 0.26, 0.3),
      stat('poisonResist', 0.24, 0.3),
      stat('dodgeChance', 0.04, 0.06),
      stat('poisonDamagePct', 0.1, 0.14),
      unique(
        '受到近身攻擊時 30% 機率噴出蛛網：周圍 3 格的敵人緩速 50% 3 秒（冷卻 3 秒）',
        on('hurt', [at('self', 'ranged', [area(3, [status('slow', 3, 0.5)])])], { near: 2, chance: 0.3, cooldown: 3 }),
      ),
      unique('對緩速的敵人傷害 +20%', mods({}, { vsStatus: { statuses: ['slow'], damage: 0.2 } })),
      uniqueRoll(
        '擊殺時 25% 機率，從屍體爆出 5 隻毒蛛：追咬附近的敵人，每口武器 60% 毒素傷害；毒蛛生命為主角最大生命的 {roll}，存活 6 秒（全身最多 10 隻）',
        SPIDER_HP,
        on('kill', [at('target', 'ranged', [spiders(5, [hit('poison', 0.6)])])], { chance: 0.25 }),
      ),
    ],
  },
  {
    id: 'mythic.armor_abyss_sovereign',
    name: '統御者魔鎧',
    rarity: 'mythic',
    kind: 'armor',
    role: '三階段 / 盾、劍、魔力暴走',
    lore: '深淵統御者的甲殼，盾碎了就換劍，劍斷了就燃燒魔力——它從不倒下。',
    minItemLevel: 35,
    main: [3.8, 4.0],
    lines: [
      inc('maxHp', 0.34, 0.38),
      inc('defense', 0.24, 0.28),
      stat('meleeDamageBonus', 0.14, 0.18),
      stat('spellDamageBonus', 0.14, 0.18),
      unique('巨盾：生命高於 60% 時，受到傷害 -12%', cond({ hpAbove: 0.6 }, [{ stat: 'damageReduction', value: 0.12 }])),
      unique(
        '狂暴：生命低於 60% 時，近戰傷害 +20%、攻擊速度 +12%',
        cond({ hpBelow: 0.6 }, [
          { stat: 'meleeDamageBonus', value: 0.2 },
          { stat: 'attackSpeed', modifier: 'increased', value: 0.12 },
        ]),
      ),
      unique(
        '魔力暴走：生命低於 30% 時，法術傷害 +25%，魔法技能命中時 20% 機率在目標周圍 2 格引爆暗焰（該擊 40% 傷害）（冷卻 1 秒）',
        cond({ hpBelow: 0.3 }, [{ stat: 'spellDamageBonus', value: 0.25 }]),
        on('hit', [at('target', 'magic', [area(2, [hit('fire', 1, 'spell')])], 0.4)], { when: MAGIC, hpBelow: 0.3, chance: 0.2, cooldown: 1 }),
      ),
    ],
  },
];

export const armorItems: Def[] = [...legendary, ...mythic];
