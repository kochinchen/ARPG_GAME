import { stat, inc, strong, unique, uniqueRoll, mods, on, cond, at, buff, arm, hit, area, status, fan, rain, MELEE, MAGIC, FINISHER, spiders, SPIDER_HP, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（手套）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * - 橘（怪物靈感）：鉤爪蟲、酸液甲蟲、寒霜孢子體、單眼浮體、火囊爬行者、腦海浮體、骷髏弓手；另有上挑斬、爆裂箭兩件
 * - 紅（魔王）：墓穴守衛（B1）、熔岩巨獸（B3）、蜘蛛女王（B5）、深淵魔王（B6）
 */

/** 向四周平均射出的投射物（自訂倍率與附加效果） */
const burst = (count: number, onHit: Effect[], speed = 9, range = 4.5): Effect => ({ type: 'projectile', speed, radius: 0.2, range, count, spreadDeg: 360, onHit });
/** 朝施放方向射出的單發投射物 */
const bolt = (onHit: Effect[], speed = 18, range = 9): Effect => ({ type: 'projectile', speed, radius: 0.2, range, count: 1, spreadDeg: 0, onHit });
/** 地面持續區域 */
const zone = (radius: number, duration: number, interval: number, effects: Effect[]): Effect => ({ type: 'zone', radius, duration, interval, effects });

const legendary: Def[] = [
  {
    id: 'legendary.gloves_hook_claw',
    name: '鉤爪護手',
    rarity: 'legendary',
    kind: 'gloves',
    role: '多段連斬 / 破甲',
    lore: '從鉤爪蟲的前肢改造而來，指尖還保留著鋸齒。',
    minItemLevel: 3,
    main: [2.15, 2.35],
    lines: [
      inc('attackSpeed', 0.08, 0.12),
      stat('meleeDamageBonus', 0.1, 0.14),
      stat('critChance', 0.03, 0.05),
      strong('劍刃旋舞 / 幻影連斬傷害 +25%', mods({ skills: ['melee.blade_dance', 'melee.phantom_blades'] }, { damage: 0.25 })),
      unique(
        '近戰多段技能每第 6 次命中撕裂目標：破甲（防禦 -20%），持續 4 秒',
        on('hit', [at('target', 'melee', [status('armorBreak', 4, 0.2)])], { when: { tags: ['MultiHit'], categories: ['melee'] }, every: 6 }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_acid_beetle',
    name: '酸蝕護手',
    rarity: 'legendary',
    kind: 'gloves',
    role: '重擊 / 酸液腐蝕',
    lore: '酸液甲蟲的殼片拼成的護手，滴下的每一滴都會在鐵上蝕出小洞。',
    minItemLevel: 4,
    main: [2.2, 2.4],
    lines: [
      stat('poisonDamagePct', 0.08, 0.12),
      inc('defense', 0.1, 0.14),
      stat('meleeDamageBonus', 0.08, 0.12),
      strong('破甲斬傷害 +30%', mods({ skills: ['melee.armor_break'] }, { damage: 0.3 })),
      unique(
        '重擊類技能命中時，在目標腳下留下酸液 3 秒：每 0.5 秒造成武器 15% 毒素傷害並破甲（防禦 -15%）（冷卻 2 秒）',
        on('hit', [at('target', 'melee', [zone(1.6, 3, 0.5, [hit('poison', 0.15), status('armorBreak', 1, 0.15)])])], { when: { tags: ['Heavy'] }, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_frost_spore',
    name: '霜孢手套',
    rarity: 'legendary',
    kind: 'gloves',
    role: '冰球 / 孢子擴散',
    lore: '掌心長著一層冰藍色的菌絲，握拳時會噴出細小的孢子。',
    minItemLevel: 5,
    main: [2.1, 2.3],
    lines: [
      stat('coldDamagePct', 0.08, 0.12),
      stat('castSpeed', 0.06, 0.1),
      inc('maxMana', 0.1, 0.14),
      strong('冰球傷害 +30%、投射物速度 +20%', mods({ skills: ['magic.ice_orb'] }, { damage: 0.3, projectileSpeed: 0.2 })),
      unique(
        '冰系投射物命中時 25% 機率，向四周噴出 3 顆冰霜孢子（各造成 40% 法術強度寒冰傷害並緩速 30%，1.5 秒）（冷卻 0.8 秒）',
        on('hit', [at('target', 'magic', [burst(3, [hit('cold', 0.4, 'spell'), status('slow', 1.5, 0.3)])])], {
          when: { elements: ['Ice'], tags: ['Projectile'] },
          chance: 0.25,
          cooldown: 0.8,
        }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_eye_floater',
    name: '雷眼手套',
    rarity: 'legendary',
    kind: 'gloves',
    role: '火花連射',
    lore: '手背上嵌著一顆單眼浮體的晶狀體，它還會自己眨眼。',
    minItemLevel: 6,
    main: [2.1, 2.3],
    lines: [
      stat('lightningDamagePct', 0.08, 0.12),
      stat('castSpeed', 0.08, 0.12),
      stat('critChance', 0.03, 0.05),
      strong('火花傷害 +30%', mods({ skills: ['magic.spark'] }, { damage: 0.3 })),
      unique(
        '快速法術每第 3 次命中，射出一道眼光（造成 60% 法術強度閃電傷害）',
        on('hit', [at('self', 'magic', [bolt([hit('lightning', 0.6, 'spell')], 20, 10)])], { when: { tags: ['Fast'], categories: ['magic'] }, every: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_fire_sac',
    name: '火囊手套',
    rarity: 'legendary',
    kind: 'gloves',
    role: '火系擊殺爆炸',
    lore: '手腕上縫著一顆還在冒煙的火囊，最好別握得太用力。',
    minItemLevel: 6,
    main: [2.15, 2.35],
    lines: [
      stat('fireDamagePct', 0.08, 0.12),
      stat('spellDamageBonus', 0.08, 0.12),
      stat('fireResist', 0.13, 0.17),
      strong('火球傷害 +25%、範圍 +20%', mods({ skills: ['magic.fireball'] }, { damage: 0.25, aoeRadius: 0.2 })),
      unique(
        '火系技能擊殺時，敵人爆炸：周圍受到 60% 法術強度火焰傷害並燃燒 3 秒（每秒 15% 法術強度）',
        on('kill', [at('target', 'magic', [area(2, [hit('fire', 0.6, 'spell'), { type: 'status', status: 'burn', duration: 3, magnitude: 0.15 }])])], { when: { elements: ['Fire'] } }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_brain_floater',
    name: '心靈護手',
    rarity: 'legendary',
    kind: 'gloves',
    role: '法術控制 / 暈眩',
    lore: '戴上之後，會聽見不屬於自己的念頭——敵人也一樣。',
    minItemLevel: 8,
    main: [2.1, 2.3],
    lines: [
      stat('castSpeed', 0.06, 0.1),
      inc('maxMana', 0.12, 0.16),
      stat('manaCostReduction', 0.06, 0.08),
      strong('對暈眩、浮空的敵人，法術傷害 +25%', mods(MAGIC, { vsStatus: { statuses: ['stun', 'airborne'], damage: 0.25 } })),
      unique(
        '法術命中時 12% 機率發出心靈衝擊：目標周圍 2.5 格內敵人受到 50% 法術強度物理傷害並暈眩 1 秒（冷卻 3 秒）',
        on('hit', [at('target', 'magic', [area(2.5, [hit('physical', 0.5, 'spell'), status('stun', 1)])])], { when: MAGIC, chance: 0.12, cooldown: 3 }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_bone_archer',
    name: '骨弓手套',
    rarity: 'legendary',
    kind: 'gloves',
    role: '後撤 / 重射',
    lore: '骷髏弓手的指骨仍然記得：先退一步，再拉滿弓。',
    minItemLevel: 3,
    main: [2.15, 2.35],
    lines: [
      stat('rangedDamageBonus', 0.1, 0.14),
      stat('dodgeChance', 0.04, 0.06),
      inc('attackSpeed', 0.06, 0.08),
      strong('後跳射擊傷害 +30%', mods({ skills: ['ranged.backstep_shot'] }, { damage: 0.3 })),
      unique(
        '後跳射擊命中後，下一個重擊類遠程技能（蓄力射擊 / 狙殺）傷害 +35%（5 秒內）',
        on('hit', [arm('bone_archer', { tags: ['Heavy'], categories: ['ranged'] }, { damage: 0.35 }, 5)], { when: { skills: ['ranged.backstep_shot'] } }),
      ),
    ],
  },
  {
    id: 'legendary.gloves_skyhook',
    name: '凌空護手',
    rarity: 'legendary',
    kind: 'gloves',
    role: '挑空追擊',
    lore: '把敵人挑上半空之後，剩下的就只是等它落下。',
    minItemLevel: 7,
    main: [2.2, 2.4],
    lines: [
      stat('critChance', 0.04, 0.06),
      stat('critDamageBonus', 0.14, 0.18),
      inc('attackSpeed', 0.06, 0.08),
      strong('上挑斬傷害 +30%', mods({ skills: ['melee.launch_slash'] }, { damage: 0.3 })),
      unique('對浮空的敵人，近戰暴擊率 +25%、傷害 +15%', mods(MELEE, { vsStatus: { statuses: ['airborne'], crit: 0.25, damage: 0.15 } })),
    ],
  },
  {
    id: 'legendary.gloves_blast',
    name: '爆裂護手',
    rarity: 'legendary',
    kind: 'gloves',
    role: '範圍遠程 / 二次爆炸',
    lore: '指節上的火藥痕跡永遠擦不乾淨。',
    minItemLevel: 9,
    main: [2.2, 2.4],
    lines: [
      stat('rangedDamageBonus', 0.1, 0.14),
      stat('fireDamagePct', 0.06, 0.1),
      stat('critDamageBonus', 0.13, 0.17),
      strong('爆裂箭傷害 +30%、範圍 +20%', mods({ skills: ['ranged.explosive_arrow'] }, { damage: 0.3, aoeRadius: 0.2 })),
      unique(
        '範圍遠程技能命中時 10% 機率，目標處再爆炸一次（該擊 50% 火焰傷害，冷卻 0.8 秒）',
        on('hit', [at('target', 'ranged', [area(1.6, [hit('fire')])], 0.5)], { when: { tags: ['AoE'], categories: ['ranged'] }, chance: 0.1, cooldown: 0.8 }),
      ),
    ],
  },
];

const mythic: Def[] = [
  // B1 墓穴守衛：巨錘、塔盾、喚醒亡者
  {
    id: 'mythic.gloves_crypt_guardian',
    name: '墓守鐵拳',
    rarity: 'mythic',
    kind: 'gloves',
    role: '亡者軍團 / 舉盾反擊',
    lore: '墓穴守衛的鐵手套，握住它的人會聽見墓底傳來的腳步聲。',
    minItemLevel: 10,
    main: [3.3, 3.5],
    lines: [
      stat('meleeDamageBonus', 0.2, 0.24),
      inc('defense', 0.18, 0.22),
      inc('maxHp', 0.13, 0.17),
      stat('stunResist', 0.18, 0.22),
      unique(
        '近戰擊殺時喚醒亡魂：向四周射出 6 道骨刃，各造成武器 50% 物理傷害',
        on('kill', [at('target', 'melee', [burst(6, [hit('physical', 0.5)])])], { when: MELEE }),
      ),
      unique(
        '受到近身攻擊時 25% 機率舉盾：下一次受到的傷害 -40%，並以武器 100% 傷害反擊下一次近戰攻擊（冷卻 3 秒）',
        on('hurt', [at('self', 'melee', [status('guard', 5, 0.4, { target: 'self' }), { type: 'status', status: 'counter', duration: 5, magnitude: 1, target: 'self' }])], { near: 2, chance: 0.25, cooldown: 3 }),
      ),
      unique(
        '近身 3 格內每有一名敵人，防禦 +5%（最多 +25%）',
        cond({ enemiesWithin: { radius: 3, perEnemy: true, max: 5 } }, [{ stat: 'defense', modifier: 'increased', value: 0.05 }]),
      ),
    ],
  },
  // B3 熔岩巨獸：重拳震地、岩漿噴發、岩石外皮
  {
    id: 'mythic.gloves_lava_behemoth',
    name: '熔岩巨拳',
    rarity: 'mythic',
    kind: 'gloves',
    role: '重擊岩漿 / 震地',
    lore: '從熔岩巨獸的拳頭上敲下來的岩殼，裂縫裡的岩漿從未冷卻。',
    minItemLevel: 15,
    main: [3.5, 3.7],
    lines: [
      stat('fireDamagePct', 0.13, 0.17),
      stat('meleeDamageBonus', 0.18, 0.22),
      inc('maxHp', 0.13, 0.17),
      stat('fireResist', 0.18, 0.22),
      unique(
        '重擊類技能命中時，在目標腳下噴出岩漿 4 秒：每 0.5 秒造成武器 20% 火焰傷害（冷卻 1.5 秒）',
        on('hit', [at('target', 'melee', [zone(1.8, 4, 0.5, [hit('fire', 0.2)])])], { when: { tags: ['Heavy'] }, cooldown: 1.5 }),
      ),
      unique(
        '重擊類技能命中時 20% 機率震擊地面：目標周圍 2.5 格內敵人暈眩 1 秒（冷卻 2 秒）',
        on('hit', [at('target', 'melee', [area(2.5, [status('stun', 1)])])], { when: { tags: ['Heavy'] }, chance: 0.2, cooldown: 2 }),
      ),
      unique(
        '近身 3 格內有敵人時岩殼覆身：防禦 +20%、火焰抗性 +15%',
        cond({ enemiesWithin: { radius: 3 } }, [
          { stat: 'defense', modifier: 'increased', value: 0.2 },
          { stat: 'fireResist', value: 0.15 },
        ]),
      ),
    ],
  },
  // B5 蜘蛛女王：毒液、蛛網、產卵
  {
    id: 'mythic.gloves_spider_queen',
    name: '蛛后毒爪',
    rarity: 'mythic',
    kind: 'gloves',
    role: '蛛網緩速 / 毒蛛擴散',
    lore: '蜘蛛女王的前爪，毒腺至今還在分泌。',
    minItemLevel: 25,
    main: [3.3, 3.5],
    lines: [
      stat('poisonDamagePct', 0.13, 0.17),
      inc('attackSpeed', 0.1, 0.14),
      stat('critChance', 0.07, 0.09),
      stat('poisonResist', 0.18, 0.22),
      unique(
        '命中時 20% 機率噴出蛛網：目標周圍 2 格內敵人緩速 40%，持續 2 秒（冷卻 1 秒）',
        on('hit', [at('target', 'ranged', [area(2, [status('slow', 2, 0.4)])])], { chance: 0.2, cooldown: 1 }),
      ),
      unique('對緩速的敵人，所有傷害 +20%', mods({}, { vsStatus: { statuses: ['slow'], damage: 0.2 } })),
      uniqueRoll(
        '擊殺緩速的敵人時，屍體爬出 4 隻毒蛛：追咬附近的敵人，每口武器 50% 毒素傷害並緩速 30%（冷卻 0.5 秒）；毒蛛生命為主角最大生命的 {roll}，存活 6 秒（全身最多 10 隻）',
        SPIDER_HP,
        on('kill', [at('target', 'ranged', [spiders(4, [hit('poison', 0.5), status('slow', 2, 0.3)])])], { targetStatus: 'slow', cooldown: 0.5 }),
      ),
    ],
  },
  // B6 深淵魔王：多段重擊、天降火雨、暗黑領域
  {
    id: 'mythic.gloves_abyss_lord',
    name: '魔王之爪',
    rarity: 'mythic',
    kind: 'gloves',
    role: 'Combo 火雨 / 暗黑領域',
    lore: '深淵魔王撕開天空時用的那隻手，指尖滴下的是火。',
    minItemLevel: 30,
    main: [3.6, 3.8],
    lines: [
      stat('fireDamagePct', 0.13, 0.17),
      stat('critDamageBonus', 0.28, 0.34),
      inc('attackSpeed', 0.1, 0.14),
      stat('castSpeed', 0.1, 0.14),
      unique(
        'Combo 第三招命中時，在目標周圍降下火雨（6 次，每次造成該擊 30% 火焰傷害，冷卻 2 秒）',
        on('hit', [at('target', 'magic', [rain(6, 1.8, 1.1, 'fire', 1)], 0.3)], { when: FINISHER, cooldown: 2 }),
      ),
      unique(
        '每次完成 Combo，「深淵」+1 層（最多 5 層、8 秒）：每層所有傷害 +5%',
        on('comboComplete', [buff('abyss_lord', '深淵', 5, 8, [{ stat: 'damageBonus', value: 0.05 }])]),
      ),
      unique(
        '深淵滿 5 層時展開暗黑領域：受到傷害 -15%、暴擊率 +10%',
        cond({ buff: { id: 'abyss_lord', atLeast: 5 } }, [
          { stat: 'damageReduction', value: 0.15 },
          { stat: 'critChance', value: 0.1 },
        ]),
      ),
    ],
  },
];

export const glovesItems: Def[] = [...legendary, ...mythic];
