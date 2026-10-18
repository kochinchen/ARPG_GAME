import { stat, inc, strong, unique, mods, on, cond, at, buff, arm, hit, area, status, rain, MELEE, type Def, type Effect } from './parts';

/**
 * 擴充的傳奇 / 神話（axe）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * 橘：每件強化一個斧技或一種玩法（破甲斬、突進斬、裂地擊、快速技能、震地斬、重砍、毀滅重擊、範圍技能、Amplifier），
 *     其中 6 件取材自地城怪物（酸液甲蟲、角甲巨獸、熔顎巨獸、血鱗獵蜥、震地獸、虛空孢子）。
 * 紅：墓穴守衛（B1）、熔岩巨獸（B3）、蜘蛛女王（B5）、深淵統御者（B7）。
 */

/** 地上的持續區域（熔岩、毒液） */
const zone = (radius: number, duration: number, interval: number, effects: Effect[]): Effect => ({ type: 'zone', radius, duration, interval, effects });

// ═══════════════════════════ 橘 · 傳奇 ═══════════════════════════

const legendary: Def[] = [
  {
    id: 'legendary.axe_acid_beetle',
    name: '酸蝕戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '破甲斬 / 腐蝕',
    lore: '斧刃泡過酸液甲蟲的腺液，砍在鐵甲上會冒出白煙。',
    main: [2.5, 2.7],
    lines: [
      stat('meleeDamageBonus', 0.13, 0.17),
      stat('poisonDamagePct', 0.1, 0.14),
      inc('defense', 0.08, 0.12),
      strong('破甲斬傷害 +30%', mods({ skills: ['melee.armor_break'] }, { damage: 0.3 })),
      unique('對破甲的敵人，近戰暴擊率 +15%', mods(MELEE, { vsStatus: { statuses: ['armorBreak'], crit: 0.15 } })),
    ],
  },
  {
    id: 'legendary.axe_horned_charge',
    name: '角甲戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '突進衝撞',
    lore: '斧背是角甲巨獸的角，低頭衝過去的時候，前面的東西都會飛起來。',
    minItemLevel: 3,
    main: [2.6, 2.8],
    lines: [
      inc('maxHp', 0.1, 0.14),
      stat('meleeDamageBonus', 0.1, 0.14),
      inc('moveSpeed', 0.06, 0.08),
      strong('突進斬傷害 +30%', mods({ skills: ['melee.dash_slash'] }, { damage: 0.3 })),
      unique(
        '突進斬命中時撞擊目標：周圍 1.8 格的敵人受到武器 70% 傷害並擊退 1.5 格（冷卻 1 秒）',
        on('hit', [at('target', 'melee', [area(1.8, [hit('physical', 0.7), { type: 'knockback', distance: 1.5 }])])], { when: { skills: ['melee.dash_slash'] }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.axe_magma_jaw',
    name: '熔顎戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '裂地擊 / 熔岩',
    lore: '從熔顎巨獸的下顎敲下來的斧頭，裂縫裡還在流著岩漿。',
    minItemLevel: 5,
    main: [2.6, 2.8],
    lines: [
      stat('fireDamagePct', 0.13, 0.17),
      stat('meleeDamageBonus', 0.1, 0.14),
      stat('fireResist', 0.13, 0.17),
      strong('裂地擊傷害 +30%', mods({ skills: ['melee.earth_break'] }, { damage: 0.3 })),
      unique(
        '裂地擊命中時，在目標腳下留下熔岩 3 秒：每 0.5 秒對範圍內敵人造成武器 20% 火焰傷害（冷卻 1 秒）',
        on('hit', [at('target', 'melee', [zone(1.4, 3, 0.5, [hit('fire', 0.2)])])], { when: { skills: ['melee.earth_break'] }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.axe_blood_lizard',
    name: '血鱗戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '快攻 / 被包圍',
    lore: '斧柄纏著血鱗獵蜥的尾皮，被包圍時，它會自己往身後甩。',
    minItemLevel: 2,
    main: [2.4, 2.6],
    lines: [
      inc('attackSpeed', 0.1, 0.14),
      stat('critChance', 0.04, 0.06),
      inc('maxHp', 0.07, 0.09),
      strong(
        '近身 2.5 格內每有一名敵人，攻擊速度 +4%（最多 +16%）',
        cond({ enemiesWithin: { radius: 2.5, perEnemy: true, max: 4 } }, [{ stat: 'attackSpeed', modifier: 'increased', value: 0.04 }]),
      ),
      unique(
        '快速技能每第 4 次命中，向身後甩尾橫掃：背後 180° 的敵人受到武器 80% 傷害並擊退 1.2 格',
        on('hit', [at('self', 'melee', [{ type: 'area', radius: 2.2, angleDeg: 180, offsetDeg: 180, effects: [hit('physical', 0.8), { type: 'knockback', distance: 1.2 }] }])], {
          when: { tags: ['Fast'], categories: ['melee'] },
          every: 4,
        }),
      ),
    ],
  },
  {
    id: 'legendary.axe_quake_beast',
    name: '震地戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '震地斬 / 暈眩',
    lore: '震地獸背上的岩塊磨成的斧頭，砸下去的時候，整層地城都會晃一下。',
    minItemLevel: 4,
    main: [2.7, 2.9],
    lines: [
      stat('meleeDamageBonus', 0.13, 0.17),
      inc('maxHp', 0.08, 0.12),
      stat('stunResist', 0.13, 0.17),
      strong('震地斬傷害 +30%、範圍 +20%', mods({ skills: ['melee.quake_slash'] }, { damage: 0.3, aoeRadius: 0.2 })),
      unique('震地斬命中時 30% 機率暈眩目標 1 秒', on('hit', [at('target', 'melee', [status('stun', 1)])], { when: { skills: ['melee.quake_slash'] }, chance: 0.3 })),
    ],
  },
  {
    id: 'legendary.axe_woodsman',
    name: '伐木者戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '重砍',
    lore: '老樵夫說，砍樹的訣竅是前兩下找準位置，第三下才用力。',
    main: [2.8, 3],
    lines: [
      stat('meleeDamageBonus', 0.15, 0.19),
      stat('critDamageBonus', 0.18, 0.22),
      inc('attackSpeed', 0.06, 0.08),
      strong('重砍傷害 +30%', mods({ skills: ['melee.heavy_slash'] }, { damage: 0.3 })),
      unique('重砍每第 3 次命中後，下一次重砍必定暴擊', on('hit', [arm('axe_woodsman', { skills: ['melee.heavy_slash'] }, { crit: 1 }, 8)], { when: { skills: ['melee.heavy_slash'] }, every: 3 })),
    ],
  },
  {
    id: 'legendary.axe_skull_crusher',
    name: '碎顱戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '毀滅重擊 / 破甲連段',
    lore: '這把斧頭不在乎頭盔有多厚，只在乎裂縫在哪裡。',
    minItemLevel: 8,
    main: [2.9, 3.1],
    lines: [
      stat('meleeDamageBonus', 0.16, 0.2),
      stat('critChance', 0.04, 0.06),
      inc('maxHp', 0.08, 0.12),
      strong('毀滅重擊傷害 +30%', mods({ skills: ['melee.devastator'] }, { damage: 0.3 })),
      unique(
        '毀滅重擊命中破甲的敵人時，再震碎一次：周圍 1.6 格受到該擊 50% 傷害（冷卻 0.5 秒）',
        on('hit', [at('target', 'melee', [area(1.6, [hit('physical')])], 0.5)], { when: { skills: ['melee.devastator'] }, targetStatus: 'armorBreak', cooldown: 0.5 }),
      ),
    ],
  },
  {
    id: 'legendary.axe_void_spore',
    name: '虛孢戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: '範圍技能 / 脈衝',
    lore: '斧刃上寄生著紫黑色的孢子，吸飽了血就會爆開。',
    minItemLevel: 6,
    main: [2.5, 2.7],
    lines: [
      stat('meleeDamageBonus', 0.12, 0.16),
      inc('attackSpeed', 0.07, 0.09),
      stat('lightningDamagePct', 0.08, 0.12),
      strong('範圍技能範圍 +25%', mods({ tags: ['AoE'] }, { aoeRadius: 0.25 })),
      unique(
        '範圍技能每第 8 次命中，在目標處引爆虛空脈衝：周圍 2 格受到該擊 60% 傷害並緩速 30%（2 秒）',
        on('hit', [at('target', 'melee', [area(2, [hit('physical'), status('slow', 2, 0.3)])], 0.6)], { when: { tags: ['AoE'] }, every: 8 }),
      ),
    ],
  },
  {
    id: 'legendary.axe_returning',
    name: '迴旋戰斧',
    rarity: 'legendary',
    kind: 'axe',
    role: 'Amplifier / 擲斧',
    lore: '丟出去的斧頭總會回到手上——只是回來之前，它會先去別人那裡轉一圈。',
    minItemLevel: 7,
    main: [2.4, 2.6],
    lines: [
      inc('attackSpeed', 0.08, 0.12),
      stat('meleeDamageBonus', 0.1, 0.14),
      stat('critChance', 0.04, 0.06),
      strong('Amplifier 技能傷害 +25%', mods({ roles: ['Amplifier'] }, { damage: 0.25 })),
      unique(
        '近戰技能每第 5 次命中，朝前方擲出一把迴旋斧（穿透 3 名敵人，造成武器 70% 傷害）',
        on('hit', [at('self', 'melee', [{ type: 'projectile', speed: 10, radius: 0.35, range: 6, pierce: 3, onHit: [hit('physical', 0.7)] }])], { when: MELEE, every: 5 }),
      ),
    ],
  },
];

// ═══════════════════════════ 紅 · 神話 ═══════════════════════════

const mythic: Def[] = [
  {
    // B1 墓穴守衛：巨錘大範圍重擊、墓穴震盪、憤怒
    id: 'mythic.axe_crypt_guardian',
    name: '亡衛戰斧',
    rarity: 'mythic',
    kind: 'axe',
    role: '重擊震盪 / 憤怒',
    lore: '墓穴守衛的巨錘斷了之後，鐵匠把錘頭熔進了這把斧，它還記得怎麼震碎地面。',
    minItemLevel: 10,
    main: [3.6, 3.8],
    lines: [
      stat('meleeDamageBonus', 0.24, 0.3),
      inc('maxHp', 0.18, 0.22),
      inc('defense', 0.13, 0.17),
      stat('stunResist', 0.18, 0.22),
      unique('重擊類技能範圍 +30%、擊退 +40%', mods({ tags: ['Heavy'] }, { aoeRadius: 0.3, knockback: 0.4 })),
      unique(
        '重擊類技能每第 4 次命中，砸出墓穴震盪：周圍 3 格的敵人受到武器 100% 傷害並暈眩 1 秒',
        on('hit', [at('self', 'melee', [area(3, [hit('physical'), status('stun', 1)])])], { when: { tags: ['Heavy'] }, every: 4 }),
      ),
      unique(
        '生命低於 50% 時陷入憤怒：近戰傷害 +20%、受到傷害 -10%',
        cond({ hpBelow: 0.5 }, [
          { stat: 'meleeDamageBonus', value: 0.2 },
          { stat: 'damageReduction', value: 0.1 },
        ]),
      ),
    ],
  },
  {
    // B3 熔岩巨獸：重拳震地、岩漿噴發、越打越多的岩漿
    id: 'mythic.axe_lava_behemoth',
    name: '熔岩巨斧',
    rarity: 'mythic',
    kind: 'axe',
    role: '岩漿噴發 / 越戰越熱',
    lore: '從熔岩巨獸胸口挖出的岩心，打得越久，斧刃就燒得越亮。',
    minItemLevel: 15,
    main: [3.7, 3.9],
    lines: [
      stat('meleeDamageBonus', 0.24, 0.28),
      stat('fireDamagePct', 0.16, 0.2),
      inc('maxHp', 0.16, 0.2),
      stat('fireResist', 0.18, 0.22),
      unique(
        '重擊類技能命中時 20% 機率引發岩漿噴發：目標周圍連續噴出 5 次（武器 50% 火焰傷害，冷卻 1.5 秒）',
        on('hit', [at('target', 'melee', [rain(5, 1.6, 1.1, 'fire', 0.5)])], { when: { tags: ['Heavy'] }, chance: 0.2, cooldown: 1.5 }),
      ),
      unique(
        '近戰擊殺時，在敵人倒下處留下岩漿 4 秒：每 0.5 秒對範圍內敵人造成武器 25% 火焰傷害',
        on('kill', [at('target', 'melee', [zone(1.5, 4, 0.5, [hit('fire', 0.25)])])], { when: MELEE }),
      ),
      unique(
        '近戰命中「熔心」+1 層（最多 10 層、4 秒）：每層火焰附加傷害 +3%',
        on('hit', [buff('lava_heart', '熔心', 10, 4, [{ stat: 'fireDamagePct', value: 0.03 }])], { when: MELEE }),
      ),
    ],
  },
  {
    // B5 蜘蛛女王：毒液噴射（破甲）、蛛網、撲擊
    id: 'mythic.axe_spider_queen',
    name: '蛛后戰斧',
    rarity: 'mythic',
    kind: 'axe',
    role: '毒液 / 蛛網控制',
    lore: '蜘蛛女王的螯牙磨成的雙刃，刃口的毒液從來不會乾。',
    minItemLevel: 25,
    main: [3.5, 3.7],
    lines: [
      stat('meleeDamageBonus', 0.24, 0.28),
      stat('poisonDamagePct', 0.16, 0.2),
      inc('attackSpeed', 0.1, 0.14),
      stat('poisonResist', 0.22, 0.28),
      unique(
        '近戰命中時 25% 機率噴出毒液：前方 90° 3 格內的敵人受到武器 50% 毒素傷害並破甲 15%（4 秒，冷卻 1 秒）',
        on('hit', [at('self', 'melee', [area(3, [hit('poison', 0.5), status('armorBreak', 4, 0.15)], 90)])], { when: MELEE, chance: 0.25, cooldown: 1 }),
      ),
      unique(
        '受到近身攻擊時向四周吐出 8 道蛛網（各造成武器 30% 傷害並緩速 40%，2 秒；冷卻 3 秒）',
        on('hurt', [at('self', 'melee', [{ type: 'projectile', speed: 8, radius: 0.22, range: 5, count: 8, spreadDeg: 360, onHit: [hit('physical', 0.3), status('slow', 2, 0.4)] }])], {
          near: 2,
          cooldown: 3,
        }),
      ),
      unique(
        '突進類技能命中時撲擊落地：周圍 2 格的敵人受到武器 80% 毒素傷害（冷卻 1 秒）',
        on('hit', [at('target', 'melee', [area(2, [hit('poison', 0.8)])])], { when: { tags: ['Advance'] }, cooldown: 1 }),
      ),
    ],
  },
  {
    // B7 深淵統御者：巨劍與盾、盾碎後狂暴、失去巨劍後魔力暴走
    id: 'mythic.axe_abyss_sovereign',
    name: '統御者巨斧',
    rarity: 'mythic',
    kind: 'axe',
    role: '攻守轉換 / 魔力暴走',
    lore: '深淵統御者沉睡時把它擱在王座旁，醒來時，它比主人更早感到憤怒。',
    minItemLevel: 35,
    main: [3.8, 4],
    lines: [
      stat('meleeDamageBonus', 0.28, 0.32),
      inc('maxHp', 0.2, 0.24),
      stat('critDamageBonus', 0.26, 0.32),
      stat('fireDamagePct', 0.13, 0.17),
      unique(
        '生命高於 50% 時舉盾：受到傷害 -10%、防禦 +15%',
        cond({ hpAbove: 0.5 }, [
          { stat: 'damageReduction', value: 0.1 },
          { stat: 'defense', modifier: 'increased', value: 0.15 },
        ]),
      ),
      unique(
        '生命低於 50% 時盾碎狂暴：近戰傷害 +25%、攻擊速度 +15%',
        cond({ hpBelow: 0.5 }, [
          { stat: 'meleeDamageBonus', value: 0.25 },
          { stat: 'attackSpeed', modifier: 'increased', value: 0.15 },
        ]),
      ),
      unique(
        '近戰暴擊時 15% 機率魔力暴走：周圍 3 格的敵人受到武器 100% 火焰傷害（冷卻 2 秒）',
        on('crit', [at('self', 'melee', [area(3, [hit('fire')])])], { when: MELEE, chance: 0.15, cooldown: 2 }),
      ),
    ],
  },
];

export const axeItems: Def[] = [...legendary, ...mythic];
