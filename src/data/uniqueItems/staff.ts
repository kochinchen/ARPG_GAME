import { stat, inc, line, strong, unique, mods, on, cond, at, restore, arm, hit, area, status, MAGIC, type Def, type Effect, type DamageElement } from './parts';

/**
 * 擴充的傳奇 / 神話（法杖）：橘 9 件、紅 4 件（紅對應每 5 層的魔王）。
 * 橘：骸骨法杖（骷髏法師）、腦域法杖（腦海浮體）、虛空孢杖（虛空孢子）、熔顎法杖（熔顎巨獸）、
 * 奪魂花杖（奪魂寄生花）、震地法杖（震地獸）、冰棘法杖、疾雷法杖、共鳴法杖。
 * 紅：墮神血杖（B2 墮落神官）、熔岩巨杖（B3 熔岩巨獸）、蛛后法杖（B5 蜘蛛女王）、統御魔杖（B7 深淵統御者）。
 */

/** 法術強度倍率的投射物（施放時觸發的效果沒有「該擊傷害」，用固定倍率） */
const bolts = (count: number, spreadDeg: number, element: DamageElement, multiplier: number, extra: Effect[] = [], speed = 9, range = 6): Effect => ({
  type: 'projectile',
  speed,
  radius: 0.22,
  range,
  count,
  spreadDeg,
  onHit: [hit(element, multiplier, 'spell'), ...extra],
});

export const staffItems: Def[] = [
  // ═══════════════ 橘 · 傳奇 ═══════════════
  {
    id: 'legendary.staff_skeleton_mage',
    name: '骸骨法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '冰火交替',
    lore: '骷髏法師留下的骨杖，一端結霜、一端冒煙，從來不肯只用一種元素。',
    minItemLevel: 2,
    main: [2.4, 2.6],
    lines: [
      stat('spellDamageBonus', 0.12, 0.16),
      stat('coldDamagePct', 0.1, 0.14),
      inc('maxMana', 0.13, 0.17),
      strong('冰球傷害 +30%', mods({ skills: ['magic.ice_orb'] }, { damage: 0.3 })),
      unique(
        '冰球命中後 3 秒內，下一個烈焰爆裂傷害 +40%、範圍 +20%',
        on('hit', [arm('bone_mage', { skills: ['magic.flame_burst'] }, { damage: 0.4, aoeRadius: 0.2 }, 3)], { when: { skills: ['magic.ice_orb'] } }),
      ),
    ],
  },
  {
    id: 'legendary.staff_brain_floater',
    name: '腦域法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '爆發 / 暈眩',
    lore: '杖頭泡著一顆仍在跳動的腦，靠近它的人會先聽見一聲尖鳴，然後什麼都動不了。',
    minItemLevel: 4,
    main: [2.4, 2.6],
    lines: [
      stat('spellDamageBonus', 0.13, 0.17),
      stat('castSpeed', 0.08, 0.12),
      stat('stunResist', 0.1, 0.14),
      strong('對暈眩的敵人，法術傷害 +25%', mods(MAGIC, { vsStatus: { statuses: ['stun'], damage: 0.25 } })),
      unique(
        '爆發類法術命中時 15% 機率釋放心靈衝擊：周圍 2.5 格敵人受到 40% 法術強度的閃電傷害，暈眩 0.8 秒（冷卻 2 秒）',
        on('hit', [at('target', 'magic', [area(2.5, [hit('lightning', 0.4, 'spell'), status('stun', 0.8)])])], { when: { tags: ['Burst'], categories: ['magic'] }, chance: 0.15, cooldown: 2 }),
      ),
    ],
  },
  {
    id: 'legendary.staff_void_spore',
    name: '虛空孢杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '近身法術 / 被包圍',
    lore: '紫黑色的孢子在杖頭鼓動；敵人靠得越近，它脈動得越快。',
    minItemLevel: 6,
    main: [2.3, 2.5],
    lines: [
      stat('spellDamageBonus', 0.12, 0.16),
      inc('maxHp', 0.1, 0.14),
      stat('coldDamagePct', 0.1, 0.14),
      strong('近距離法術範圍 +25%', mods({ ranges: ['Near'], categories: ['magic'] }, { aoeRadius: 0.25 })),
      unique('周圍 3 格內每有一名敵人，法術傷害 +5%（最多 5 名）', cond({ enemiesWithin: { radius: 3, perEnemy: true, max: 5 } }, [{ stat: 'spellDamageBonus', value: 0.05 }])),
    ],
  },
  {
    id: 'legendary.staff_magma_jaw',
    name: '熔顎法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '火牆 / 燃燒',
    lore: '熔顎巨獸的下顎骨還在發燙，裂縫裡流著沒冷卻的熔岩。',
    minItemLevel: 8,
    main: [2.5, 2.7],
    lines: [
      line('火系技能傷害 +20%', mods({ elements: ['Fire'] }, { damage: 0.2 })),
      stat('castSpeed', 0.08, 0.12),
      stat('fireResist', 0.13, 0.17),
      strong('火牆傷害 +30%', mods({ skills: ['magic.firewall'] }, { damage: 0.3 })),
      unique(
        '火系技能命中時 20% 機率使目標燃燒：每秒受到 30% 法術強度的火焰傷害（3 秒）',
        on('hit', [at('target', 'magic', [{ type: 'status', status: 'burn', duration: 3, magnitude: 0.3 }])], { when: { elements: ['Fire'] }, chance: 0.2, cooldown: 0.2 }),
      ),
    ],
  },
  {
    id: 'legendary.staff_soul_flower',
    name: '奪魂花杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '擊殺回魔 / 續航',
    lore: '紮根在杖頭的寄生花，每奪走一個靈魂，就把它的花粉吐回主人身上。',
    minItemLevel: 5,
    main: [2.3, 2.5],
    lines: [
      stat('spellDamageBonus', 0.12, 0.16),
      inc('maxMana', 0.16, 0.2),
      stat('castSpeed', 0.07, 0.09),
      strong('法術魔力消耗 -15%', mods(MAGIC, { mp: -0.15 })),
      unique(
        '法術擊殺時散出奪魂花粉：回復 3% 魔力，周圍 2 格敵人緩速 35%（2 秒）',
        on('kill', [restore({ mp: 0.03 }), at('target', 'magic', [area(2, [status('slow', 2, 0.35)])])], { when: MAGIC }),
      ),
    ],
  },
  {
    id: 'legendary.staff_quake_beast',
    name: '震地法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '重擊法術 / 震波',
    lore: '杖尾綁著震地獸背上的岩塊，每一道落下的法術都會讓地面跟著跳一下。',
    minItemLevel: 10,
    main: [2.6, 2.8],
    lines: [
      stat('spellDamageBonus', 0.13, 0.17),
      inc('defense', 0.1, 0.14),
      stat('critChance', 0.05, 0.07),
      strong('重擊類法術傷害 +25%', mods({ tags: ['Heavy'], categories: ['magic'] }, { damage: 0.25 })),
      unique(
        '重擊類法術命中時產生震波：周圍 2.5 格受到該擊 35% 傷害，暈眩 0.5 秒（冷卻 1 秒）',
        on('hit', [at('target', 'magic', [area(2.5, [hit('physical', 1, 'spell'), status('stun', 0.5)])], 0.35)], { when: { tags: ['Heavy'], categories: ['magic'] }, cooldown: 1 }),
      ),
    ],
  },
  {
    id: 'legendary.staff_ice_thorn',
    name: '冰棘法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '冰槍 / 穿透凍結',
    lore: '杖頭是一根永不融化的冰棘，被它劃過的東西，會先慢下來，然後停下來。',
    minItemLevel: 7,
    main: [2.5, 2.7],
    lines: [
      line('冰系技能傷害 +20%', mods({ elements: ['Ice'] }, { damage: 0.2 })),
      inc('maxMana', 0.13, 0.17),
      stat('castSpeed', 0.07, 0.09),
      strong('冰槍穿透 +2、傷害 +20%', mods({ skills: ['magic.ice_lance'] }, { pierce: 2, damage: 0.2 })),
      unique(
        '冰槍命中緩速的敵人時，凍結目標 1 秒（冷卻 1.5 秒）',
        on('hit', [at('target', 'magic', [status('freeze', 1)])], { when: { skills: ['magic.ice_lance'] }, targetStatus: 'slow', cooldown: 1.5 }),
      ),
    ],
  },
  {
    id: 'legendary.staff_swift_thunder',
    name: '疾雷法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: '火花 / 連鎖閃電',
    lore: '每一道細小的火花都在杖裡留下一點電荷，攢夠了，就是一場雷暴。',
    minItemLevel: 9,
    main: [2.5, 2.7],
    lines: [
      line('閃電技能傷害 +20%', mods({ elements: ['Lightning'] }, { damage: 0.2 })),
      stat('castSpeed', 0.1, 0.14),
      stat('lightningResist', 0.13, 0.17),
      strong('火花傷害 +30%、施法速度 +15%', mods({ skills: ['magic.spark'] }, { damage: 0.3, castSpeed: 0.15 })),
      unique(
        '每施放 4 次火花，下一次連鎖閃電彈跳 +3、傷害 +30%',
        on('cast', [arm('swift_thunder', { skills: ['magic.chain_lightning'] }, { chainCount: 3, damage: 0.3 }, 8)], { when: { skills: ['magic.spark'] }, every: 4 }),
      ),
    ],
  },
  {
    id: 'legendary.staff_resonance',
    name: '共鳴法杖',
    rarity: 'legendary',
    kind: 'staff',
    role: 'Combo 增幅 → 終結',
    lore: '杖身刻著三道音叉般的凹槽，前兩道響起時，第三道會唱得最大聲。',
    minItemLevel: 12,
    main: [2.7, 2.9],
    lines: [
      stat('spellDamageBonus', 0.14, 0.18),
      stat('manaCostReduction', 0.07, 0.09),
      stat('critDamageBonus', 0.16, 0.2),
      strong('Combo 第二招法術傷害 +25%', mods({ step: 2, categories: ['magic'] }, { damage: 0.25 })),
      unique(
        '增幅技法術命中後，下一個終結技傷害 +30%、範圍 +20%（5 秒）',
        on('hit', [arm('resonance', { roles: ['Finisher'], categories: ['magic'] }, { damage: 0.3, aoeRadius: 0.2 }, 5)], { when: { roles: ['Amplifier'], categories: ['magic'] }, cooldown: 0.5 }),
      ),
    ],
  },

  // ═══════════════ 紅 · 神話 ═══════════════
  {
    id: 'mythic.staff_fallen_priest',
    name: '墮神血杖',
    rarity: 'mythic',
    kind: 'staff',
    role: '血焰彈 / 法術轟擊 / 狂信',
    lore: '墮落神官背棄神明時折斷的聖杖；斷口滲出的不是木屑，是血。',
    minItemLevel: 10,
    main: [3.3, 3.5],
    lines: [
      stat('spellDamageBonus', 0.22, 0.26),
      stat('fireDamagePct', 0.13, 0.17),
      inc('maxMana', 0.18, 0.22),
      stat('castSpeed', 0.12, 0.16),
      unique(
        '施放火球時，額外射出 2 發血焰彈（扇形 30°，各造成 50% 法術強度的火焰傷害）',
        on('cast', [at('self', 'magic', [bolts(2, 30, 'fire', 0.5, [], 10, 10)])], { when: { skills: ['magic.fireball'] } }),
      ),
      unique(
        '法術暴擊時（冷卻 3 秒），在目標周圍連續落下 6 次血焰爆炸，各造成 40% 法術強度的火焰傷害',
        on('crit', [at('target', 'magic', [{ type: 'delayed', delay: 0.3, repeat: 6, interval: 0.2, scatter: 2, effects: [area(1.2, [hit('fire', 0.4, 'spell')])] }])], { when: MAGIC, cooldown: 3 }),
      ),
      unique(
        '生命低於 50% 時陷入狂信：法術傷害 +20%、施法速度 +15%',
        cond({ hpBelow: 0.5 }, [
          { stat: 'spellDamageBonus', value: 0.2 },
          { stat: 'castSpeed', value: 0.15 },
        ]),
      ),
    ],
  },
  {
    id: 'mythic.staff_lava_behemoth',
    name: '熔岩巨杖',
    rarity: 'mythic',
    kind: 'staff',
    role: '岩漿噴發 / 地面覆蓋',
    lore: '從熔岩巨獸胸口挖出的熔核嵌在杖頭；戰鬥越久，腳下的地面越像它的身體。',
    minItemLevel: 15,
    main: [3.4, 3.6],
    lines: [
      stat('spellDamageBonus', 0.22, 0.26),
      stat('fireDamagePct', 0.16, 0.2),
      inc('maxHp', 0.13, 0.17),
      stat('fireResist', 0.22, 0.28),
      unique(
        '火系範圍法術命中時（冷卻 2 秒），在目標周圍噴發 5 次岩漿，各造成 45% 法術強度的火焰傷害',
        on('hit', [at('target', 'magic', [{ type: 'delayed', delay: 0.3, repeat: 5, interval: 0.2, scatter: 2, effects: [area(1.3, [hit('fire', 0.45, 'spell')])] }])], { when: { elements: ['Fire'], tags: ['AoE'] }, cooldown: 2 }),
      ),
      unique(
        '火系技能擊殺時留下一灘岩漿：半徑 1.8 格、8 秒，每 0.5 秒造成 20% 法術強度的火焰傷害',
        on('kill', [at('target', 'magic', [{ type: 'zone', radius: 1.8, duration: 8, interval: 0.5, effects: [hit('fire', 0.2, 'spell')] }])], { when: { elements: ['Fire'] } }),
      ),
      unique(
        '岩石之軀：周圍 4 格內有敵人時，防禦 +25%、受到傷害 -8%',
        cond({ enemiesWithin: { radius: 4 } }, [
          { stat: 'defense', modifier: 'increased', value: 0.25 },
          { stat: 'damageReduction', value: 0.08 },
        ]),
      ),
    ],
  },
  {
    id: 'mythic.staff_spider_queen',
    name: '蛛后法杖',
    rarity: 'mythic',
    kind: 'staff',
    role: '毒液 / 蛛網控場',
    lore: '蜘蛛女王的權杖纏滿了發光的蛛絲，杖頭的卵囊裡，有東西正在看著你。',
    minItemLevel: 25,
    main: [3.55, 3.75],
    lines: [
      stat('spellDamageBonus', 0.24, 0.28),
      stat('poisonDamagePct', 0.16, 0.2),
      stat('castSpeed', 0.14, 0.18),
      stat('poisonResist', 0.22, 0.28),
      unique(
        '法術命中時 12% 機率噴射毒液：目標周圍 2 格受到 50% 法術強度的毒素傷害，防禦 -20%（4 秒）（冷卻 1 秒）',
        on('hit', [at('target', 'magic', [area(2, [hit('poison', 0.5, 'spell'), status('armorBreak', 4, 0.2)])])], { when: MAGIC, chance: 0.12, cooldown: 1 }),
      ),
      unique(
        '每施放 4 次範圍法術，向四周吐出 8 道蛛網：各造成 30% 法術強度的毒素傷害，緩速 40%（2 秒）',
        on('cast', [at('self', 'magic', [bolts(8, 360, 'poison', 0.3, [status('slow', 2, 0.4)], 8, 6)])], { when: { tags: ['AoE'], categories: ['magic'] }, every: 4 }),
      ),
      unique('對緩速的敵人，法術傷害 +25%', mods(MAGIC, { vsStatus: { statuses: ['slow'], damage: 0.25 } })),
    ],
  },
  {
    id: 'mythic.staff_abyss_sovereign',
    name: '統御魔杖',
    rarity: 'mythic',
    kind: 'staff',
    role: '盾 → 暴走 / 地裂',
    lore: '深淵統御者的巨劍斷成兩截，劍柄成了這根杖；失去劍的那一刻，它的魔力就再也關不住了。',
    minItemLevel: 35,
    main: [3.8, 4],
    lines: [
      stat('spellDamageBonus', 0.26, 0.3),
      inc('maxMana', 0.23, 0.27),
      inc('maxHp', 0.13, 0.17),
      stat('castSpeed', 0.14, 0.18),
      unique(
        '統御之盾：生命高於 70% 時，防禦 +20%、受到傷害 -10%',
        cond({ hpAbove: 0.7 }, [
          { stat: 'defense', modifier: 'increased', value: 0.2 },
          { stat: 'damageReduction', value: 0.1 },
        ]),
      ),
      unique(
        '魔力暴走：生命低於 40% 時，法術傷害 +30%、施法速度 +20%',
        cond({ hpBelow: 0.4 }, [
          { stat: 'spellDamageBonus', value: 0.3 },
          { stat: 'castSpeed', value: 0.2 },
        ]),
      ),
      unique(
        '魔力高於 50% 時，法術命中 10% 機率劈出地裂：沿施放方向 7 格長的直線，造成 80% 法術強度的火焰傷害（冷卻 2 秒）',
        on('hit', [at('self', 'magic', [{ type: 'area', radius: 7, line: { length: 7, width: 1.6 }, effects: [hit('fire', 0.8, 'spell')] }])], { when: MAGIC, mpAbove: 0.5, chance: 0.1, cooldown: 2 }),
      ),
    ],
  },
];
